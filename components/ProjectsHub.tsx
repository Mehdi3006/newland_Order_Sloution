import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Project, Task, ProjectStatus } from '../types';
import ProjectFormModal from './NewProjectModal';
import { useProjects } from '../hooks/useProjects';
import { useModals } from '../contexts/ModalContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatDisplayDate } from '../utils/dateUtils';

interface ProjectsHubProps {
    onSelectProject: (projectId: string) => void;
    onGenerateAIProjectClick: () => void;
}

const ProjectsHub: React.FC<ProjectsHubProps> = ({ onSelectProject, onGenerateAIProjectClick }) => {
    const { t, i18n } = useTranslation();
    const { projects, addProject, updateProject, deleteProject } = useProjects();
    const { showConfirmation, addToast } = useModals();
    const allTasks = useLiveQuery(() => db.tasks.toArray(), []);
    const allStatuses = useLiveQuery(() => db.projectStatuses.toArray(), []);


    const [isModalOpen, setIsModalOpen] = useState(false);
    const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (openMenuId && menuRef.current && !menuRef.current.contains(event.target as Node)) {
                 setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [openMenuId]);


    const projectStats = useMemo(() => {
        const stats: Record<string, { total: number; done: number; progress: number }> = {};
        if (!projects || !allTasks || !allStatuses) return stats;

        const tasksByProject = allTasks.reduce((acc, task) => {
            if (!acc[task.projectId]) acc[task.projectId] = [];
            acc[task.projectId].push(task);
            return acc;
        }, {} as Record<string, Task[]>);

        projects.forEach(project => {
            const tasks = tasksByProject[project.id] || [];
            const statusesForProject = allStatuses.filter(s => s.projectId === project.id).sort((a,b) => a.order - b.order);
            const doneStatus = statusesForProject[statusesForProject.length - 1];

            const total = tasks.length;
            const done = doneStatus ? tasks.filter(t => t.statusId === doneStatus.id).length : 0;
            const progress = total > 0 ? (done / total) * 100 : 0;
            stats[project.id] = { total, done, progress };
        });
        return stats;
    }, [projects, allTasks, allStatuses]);


    const handleFormSubmit = async (data: Omit<Project, 'id' | 'createdAt' | 'deletedAt'>, projectId?: string) => {
        if (projectId) {
            await updateProject(projectId, data);
            addToast(t('toasts.projects.projectUpdated'), 'success');
        } else {
            await addProject(data);
            addToast(t('toasts.projects.projectCreated'), 'success');
        }
        setIsModalOpen(false);
        setProjectToEdit(null);
    };

    const handleOpenNew = () => {
        setProjectToEdit(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (e: React.MouseEvent, project: Project) => {
        e.stopPropagation();
        setProjectToEdit(project);
        setIsModalOpen(true);
        setOpenMenuId(null);
    };

    const handleDelete = (e: React.MouseEvent, project: Project) => {
        e.stopPropagation();
        showConfirmation({
            title: t('views.projects.projectActions.deleteProjectTitle'),
            message: t('views.projects.projectActions.deleteProjectBody', { name: project.name }),
            onConfirm: () => {
                deleteProject(project.id);
                addToast(t('toasts.projects.projectDeleted'), 'success');
            },
        });
        setOpenMenuId(null);
    };

    return (
        <div className="p-4 lg:p-6 bg-gray-50 h-full">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">{t('views.projects.title')}</h1>
                <div className="flex items-center gap-x-2">
                    <button
                        onClick={onGenerateAIProjectClick}
                        className="bg-purple-700 text-white px-4 py-2 rounded-md hover:bg-purple-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-600 flex items-center gap-x-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 3zM6.03 5.23a.75.75 0 01.04 1.06l-1.72 1.72a.75.75 0 01-1.06-1.06l-1.72-1.72a.75.75 0 011.02 0zm8 0a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06zM10 18a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5H10a.75.75 0 01-.75-.75zM4.75 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm9.25-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zM6.03 14.77a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06z" clipRule="evenodd" /></svg>
                        {t('views.projects.newProjectWithAI')}
                    </button>
                    <button
                        onClick={handleOpenNew}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex items-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 me-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                        {t('views.projects.newProject')}
                    </button>
                </div>
            </div>

            {projects.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {projects.map(project => {
                        const stats = projectStats[project.id] || { total: 0, done: 0, progress: 0 };
                        return (
                             <div key={project.id} className="bg-white rounded-xl shadow-md border border-slate-200 flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 transition-all">
                                <div className="p-6 cursor-pointer" onClick={() => onSelectProject(project.id)}>
                                    <h2 className="text-xl font-bold text-gray-800 truncate">{project.name}</h2>
                                    <p className="text-sm text-slate-500 mt-2 h-10 overflow-hidden">{project.description}</p>
                                    <div className="mt-4">
                                        <div className="flex justify-between items-center text-xs text-slate-500 font-semibold mb-1">
                                            <span>{t('views.projects.projectStats.progress')}</span>
                                            <span>{Math.round(stats.progress)}%</span>
                                        </div>
                                        <div className="w-full bg-slate-200 rounded-full h-1.5">
                                            <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${stats.progress}%` }}></div>
                                        </div>
                                         <div className="flex justify-between items-center text-xs text-slate-500 mt-2">
                                            <span>{t('views.projects.projectStats.tasksDone')}</span>
                                            <span className="font-mono">{stats.done} / {stats.total}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-2 border-t border-slate-100 flex justify-between items-center">
                                    <p className="text-xs text-slate-400 px-4">{formatDisplayDate(project.createdAt.split('T')[0], i18n.language)}</p>
                                    <div className="relative">
                                         <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenMenuId(openMenuId === project.id ? null : project.id);
                                            }}
                                            className="text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                            </svg>
                                        </button>
                                        {openMenuId === project.id && (
                                            <div ref={menuRef} onClick={e => e.stopPropagation()} className="absolute bottom-full end-0 mb-2 w-36 bg-white rounded-md shadow-lg border border-slate-200 z-10">
                                                <ul className="py-1 text-sm">
                                                    <li><button onClick={(e) => handleOpenEdit(e, project)} className="w-full text-left rtl:text-right px-4 py-2 hover:bg-slate-100 flex items-center gap-x-2">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                                        {t('buttons.edit')}
                                                    </button></li>
                                                    <li><button onClick={(e) => handleDelete(e, project)} className="w-full text-left rtl:text-right px-4 py-2 text-red-600 hover:bg-red-50 flex items-center gap-x-2">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                                        {t('buttons.delete')}
                                                    </button></li>
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="text-center py-20">
                    <p className="text-lg text-slate-500">{t('views.projects.noProjects')}</p>
                </div>
            )}

            <ProjectFormModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setProjectToEdit(null); }}
                onSubmit={handleFormSubmit}
                projectToEdit={projectToEdit}
            />
        </div>
    );
};

export default ProjectsHub;