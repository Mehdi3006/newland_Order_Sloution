import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Project, ProjectStatus, Task, Order, ChecklistTemplate, AISettings } from '../types';
import { useModals } from '../contexts/ModalContext';
import ProjectCalendar from './ProjectCalendar';
import { useTasks } from '../hooks/useTasks';
import Select from './Select';
import TaskDetailModal from './TaskDetailModal';
import { formatDisplayDate } from '../utils/dateUtils';
import { ProjectKanbanColumn, AddColumnForm, NewTaskData } from './ProjectKanbanColumn';
// FIX: Added missing import for the NumericInput component.
import NumericInput from './NumericInput';

// --- QuickTaskAddModal Component ---
interface QuickTaskAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { title: string; statusId: string; dueDate?: string; weight?: number }) => void;
    initialDate: string;
    statuses: ProjectStatus[];
}

const QuickTaskAddModal: React.FC<QuickTaskAddModalProps> = ({ isOpen, onClose, onSubmit, initialDate, statuses }) => {
    const { t } = useTranslation();
    const [title, setTitle] = useState('');
    const [statusId, setStatusId] = useState<string>(statuses[0]?.id || '');
    const [weight, setWeight] = useState(1);

    useEffect(() => {
        if (isOpen) {
            setTitle('');
            setStatusId(statuses[0]?.id || '');
            setWeight(1);
        }
    }, [isOpen, statuses]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !statusId) return;
        onSubmit({
            title: title.trim(),
            statusId,
            dueDate: initialDate,
            weight,
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit}>
                    <header className="p-6 border-b border-slate-200">
                        <h2 className="text-xl font-bold text-gray-800">{t('views.projects.addTask')}</h2>
                        <p className="text-sm text-slate-500">{t('labels.date')}: {initialDate}</p>
                    </header>
                    <main className="p-6 space-y-4">
                        <div>
                            <label htmlFor="quickTaskTitle" className="block text-sm font-medium text-slate-700 mb-1">{t('common.title')}</label>
                            <input
                                id="quickTaskTitle"
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                required
                                autoFocus
                                className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label htmlFor="quickTaskStatus" className="block text-sm font-medium text-slate-700 mb-1">{t('labels.status')}</label>
                            <Select
                                id="quickTaskStatus"
                                value={statusId}
                                onChange={e => setStatusId(e.target.value)}
                            >
                                {statuses.map(status => (
                                    <option key={status.id} value={status.id}>{status.name}</option>
                                ))}
                            </Select>
                        </div>
                         <div>
                           <NumericInput 
                                label={t('views.projects.weight')}
                                value={weight}
                                onChange={setWeight}
                                min={0}
                                fractionDigits={0}
                            />
                        </div>
                    </main>
                    <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3">
                        <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                        <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('views.projects.addTask')}</button>
                    </footer>
                </form>
            </div>
        </div>
    );
};

// --- ProjectKanbanBoard Component ---
interface ProjectKanbanBoardProps {
    statuses: ProjectStatus[];
    tasks: Task[];
    onTaskDrop: (taskId: string, newStatusId: string, newOrder: number) => void;
    onAddTask: (statusId: string, data: NewTaskData) => void;
    onCardClick: (task: Task) => void;
    onAddStatus: (name: string) => void;
    onUpdateStatusName: (id: string, newName: string) => void;
    onUpdateStatusesOrder: (reorderedStatuses: ProjectStatus[]) => void;
    onDeleteStatus: (id: string) => void;
    onSetReminder: (item: Task, type: 'task') => void;
    doneStatusId: string | null;
}

const ProjectKanbanBoard: React.FC<ProjectKanbanBoardProps> = ({
    statuses, tasks, onTaskDrop, onAddTask, onCardClick,
    onAddStatus, onUpdateStatusName, onUpdateStatusesOrder, onDeleteStatus,
    onSetReminder, doneStatusId
}) => {
    const { t } = useTranslation();
    const [draggedStatusId, setDraggedStatusId] = useState<string | null>(null);
    const [isAddingColumn, setIsAddingColumn] = useState(false);

    const handleAddColumn = (name: string) => {
        onAddStatus(name);
        setIsAddingColumn(false);
    };

    const handleColumnDragStart = (e: React.DragEvent<HTMLDivElement>, statusId: string) => {
        setDraggedStatusId(statusId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', statusId);
    };

    const handleColumnDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleColumnDrop = (e: React.DragEvent<HTMLDivElement>, targetStatus: ProjectStatus) => {
        if (!draggedStatusId || draggedStatusId === targetStatus.id) return;
        const draggedIndex = statuses.findIndex(s => s.id === draggedStatusId);
        const targetIndex = statuses.findIndex(s => s.id === targetStatus.id);
        if (draggedIndex === -1 || targetIndex === -1) return;

        const newStatuses = [...statuses];
        const [draggedItem] = newStatuses.splice(draggedIndex, 1);
        newStatuses.splice(targetIndex, 0, draggedItem);
        onUpdateStatusesOrder(newStatuses);
    };

    const handleColumnDragEnd = () => {
        setDraggedStatusId(null);
    };
    
    return (
        <div className="flex-1 overflow-x-auto h-full p-4">
            <div className="flex space-x-4 rtl:space-x-reverse h-full" style={{minWidth: `${(statuses.length + 1) * 19}rem`}}>
                {statuses.map(status => {
                    const tasksInColumn = tasks.filter(task => task.statusId === status.id);
                    return (
                        <ProjectKanbanColumn
                            key={status.id}
                            status={status}
                            tasks={tasksInColumn}
                            onTaskDrop={onTaskDrop}
                            onAddTask={(data) => onAddTask(status.id, data)}
                            onCardClick={onCardClick}
                            onUpdateStatusName={onUpdateStatusName}
                            onDeleteStatus={onDeleteStatus}
                            onColumnDragStart={(e) => handleColumnDragStart(e, status.id)}
                            onColumnDragOver={handleColumnDragOver}
                            onColumnDrop={(e) => handleColumnDrop(e, status)}
                            onColumnDragEnd={handleColumnDragEnd}
                            isBeingDragged={draggedStatusId === status.id}
                            onSetReminder={onSetReminder}
                            doneStatusId={doneStatusId}
                        />
                    );
                })}
                {isAddingColumn ? (
                    <AddColumnForm onAdd={handleAddColumn} onCancel={() => setIsAddingColumn(false)} />
                ) : (
                    <div className="flex-shrink-0 w-72">
                         <button 
                            onClick={() => setIsAddingColumn(true)}
                            className="w-full h-12 bg-gray-200/80 text-slate-600 font-semibold rounded-lg hover:bg-gray-300 hover:text-slate-800 transition-colors flex items-center justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 me-2" viewBox="0 0 20 20" fill="currentColor">
                               <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                            {t('views.projects.addColumn')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};


// --- Main ProjectWorkspace Component ---
interface ProjectWorkspaceProps {
    projectId: string;
    onBack: () => void;
    onSetReminder: (item: Order | Task, type: 'order' | 'task') => void;
    aiSettings?: AISettings;
    onTaskClick: (task: Task) => void;
}

const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({ projectId, onBack, onSetReminder, aiSettings, onTaskClick }) => {
    const { t } = useTranslation();
    const { addToast } = useModals();
    const [view, setView] = useState<'kanban' | 'calendar'>('kanban');

    const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
    const statuses = useLiveQuery(() => db.projectStatuses.where({ projectId }).sortBy('order'), [projectId]) || [];
    const { tasks, addTask, updateTask } = useTasks(projectId);

    const [quickAddModal, setQuickAddModal] = useState<{ isOpen: boolean; date: string }>({ isOpen: false, date: '' });
    
    const handleAddStatus = async (name: string) => {
        await db.projectStatuses.add({ id: crypto.randomUUID(), projectId, name, order: statuses.length });
        addToast(t('toasts.projects.columnCreated'), 'success');
    };
    const handleUpdateStatusName = async (id: string, newName: string) => {
        await db.projectStatuses.update(id, { name: newName });
        addToast(t('toasts.projects.columnUpdated'), 'success');
    };
    const handleUpdateStatusesOrder = async (reorderedStatuses: ProjectStatus[]) => {
        const updates = reorderedStatuses.map((s, i) => ({ key: s.id, changes: { order: i } }));
        await db.projectStatuses.bulkUpdate(updates);
    };
    const handleDeleteStatus = async (id: string) => {
        await db.projectStatuses.delete(id);
        addToast(t('toasts.projects.columnDeleted'), 'success');
    };

    const handleAddTask = async (statusId: string, data: NewTaskData) => {
        await addTask({ ...data, projectId, statusId });
        addToast(t('toasts.projects.taskCreated'), 'success');
    };

    const handleTaskDrop = useCallback(async (taskId: string, newStatusId: string, newOrder: number) => {
        const task = tasks.find(t => t.id === taskId);
        if (task && task.statusId !== newStatusId) {
            await updateTask(taskId, { statusId: newStatusId, order: newOrder });
        }
    }, [tasks, updateTask]);
    
    const handleTaskDateChange = async (taskId: string, newDate: string) => {
        await updateTask(taskId, { dueDate: newDate });
        addToast(t('toasts.projects.taskUpdated'), 'info');
    };

    const handleQuickAddTask = async (data: { title: string; statusId: string; dueDate?: string; weight?: number }) => {
        await handleAddTask(data.statusId, data);
        setQuickAddModal({ isOpen: false, date: '' });
    };

    const projectProgress = useMemo(() => {
        if (!tasks || tasks.length === 0 || !statuses || statuses.length === 0) return { percent: 0, done: 0, total: 0 };
        const totalWeight = tasks.reduce((sum, task) => sum + (task.weight || 1), 0);
        if (totalWeight === 0) return { percent: 0, done: 0, total: tasks.length };

        const doneStatusId = statuses[statuses.length - 1].id;
        const doneWeight = tasks
            .filter(t => t.statusId === doneStatusId)
            .reduce((sum, task) => sum + (task.weight || 1), 0);
        
        const totalTasks = tasks.length;
        const doneTasks = tasks.filter(t => t.statusId === doneStatusId).length;

        return { percent: (doneWeight / totalWeight) * 100, done: doneTasks, total: totalTasks };
    }, [tasks, statuses]);

    if (!project) return <div>{t('views.projects.loading')}</div>;

    const doneStatusId = statuses.length > 0 ? statuses[statuses.length - 1].id : null;

    return (
        <div className="h-full flex flex-col bg-gray-50">
            <header className="p-4 border-b border-slate-200 flex-shrink-0">
                <div className="flex justify-between items-start">
                    <div>
                        <button onClick={onBack} className="text-sm text-indigo-600 hover:underline flex items-center gap-x-1 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            {t('views.projects.backToProjects')}
                        </button>
                        <h1 className="text-3xl font-bold text-gray-800">{project.name}</h1>
                        <p className="text-sm text-slate-600 mt-1 max-w-2xl">{project.description}</p>
                    </div>
                     <div className="flex items-center gap-x-2">
                        <div className="flex items-center bg-slate-200 rounded-full p-1 text-sm font-medium">
                            <button onClick={() => setView('kanban')} className={`px-3 py-1 rounded-full ${view === 'kanban' ? 'bg-white text-indigo-600' : 'text-slate-600'}`}>{t('views.projects.kanbanView')}</button>
                            <button onClick={() => setView('calendar')} className={`px-3 py-1 rounded-full ${view === 'calendar' ? 'bg-white text-indigo-600' : 'text-slate-600'}`}>{t('views.projects.calendarView')}</button>
                        </div>
                    </div>
                </div>
                 <div className="mt-4">
                     <div className="flex justify-between items-center text-xs text-slate-500 font-semibold mb-1">
                         <span>{t('views.projects.projectStats.progress')} ({projectProgress.done}/{projectProgress.total})</span>
                        <span>{Math.round(projectProgress.percent)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                        <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${projectProgress.percent}%` }}></div>
                    </div>
                </div>
            </header>
            
            {view === 'kanban' ? (
                <ProjectKanbanBoard
                    statuses={statuses}
                    tasks={tasks}
                    onTaskDrop={handleTaskDrop}
                    onAddTask={handleAddTask}
                    onCardClick={onTaskClick}
                    onAddStatus={handleAddStatus}
                    onUpdateStatusName={handleUpdateStatusName}
                    onUpdateStatusesOrder={handleUpdateStatusesOrder}
                    onDeleteStatus={handleDeleteStatus}
                    onSetReminder={onSetReminder as (item: Task, type: 'task') => void}
                    doneStatusId={doneStatusId}
                />
            ) : (
                <div className="p-4 flex-1 overflow-auto">
                    <ProjectCalendar
                        tasks={tasks}
                        onTaskClick={onTaskClick}
                        onDateSelectForNewTask={(date) => setQuickAddModal({ isOpen: true, date })}
                        onTaskDateChange={handleTaskDateChange}
                        doneStatusId={doneStatusId}
                    />
                </div>
            )}
            
            {quickAddModal.isOpen && (
                <QuickTaskAddModal
                    isOpen={quickAddModal.isOpen}
                    onClose={() => setQuickAddModal({ isOpen: false, date: '' })}
                    onSubmit={handleQuickAddTask}
                    initialDate={quickAddModal.date}
                    statuses={statuses}
                />
            )}

        </div>
    );
};
export default ProjectWorkspace;