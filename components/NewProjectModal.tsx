import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Project } from '../types';

interface ProjectFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Omit<Project, 'id' | 'createdAt' | 'deletedAt'>, projectId?: string) => Promise<void>;
    projectToEdit?: Project | null;
}

const handleFormKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        const form = (e.target as HTMLElement).closest('form');
        if (!form) return;

        const focusable = Array.from(
            form.querySelectorAll('input:not([type="hidden"]), select, textarea, button:not([tabindex="-1"])')
        ).filter(el => {
            const htmlEl = el as HTMLElement;
            return !htmlEl.hasAttribute('disabled') && !htmlEl.hasAttribute('readonly') && htmlEl.offsetParent !== null;
        }) as HTMLElement[];

        const index = focusable.indexOf(e.target as HTMLElement);
        
        if (index > -1 && index < focusable.length - 1) {
            focusable[index + 1].focus();
        }
    }
};

const ProjectFormModal: React.FC<ProjectFormModalProps> = ({ isOpen, onClose, onSubmit, projectToEdit }) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (projectToEdit) {
                setName(projectToEdit.name);
                setDescription(projectToEdit.description || '');
                setStartDate(projectToEdit.startDate || '');
                setEndDate(projectToEdit.endDate || '');
            } else {
                setName('');
                setDescription('');
                setStartDate('');
                setEndDate('');
            }
            setError(''); // Reset error on open
        }
    }, [isOpen, projectToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
            setError(t('views.projects.projectForm.dateValidationError'));
            return;
        }
        setError('');

        const data = {
            name: name.trim(),
            description: description.trim(),
            startDate: startDate || undefined,
            endDate: endDate || undefined,
        };
        await onSubmit(data, projectToEdit?.id);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <header className="p-6 border-b border-slate-200 flex-shrink-0">
                        <h2 className="text-xl font-bold text-gray-800">{projectToEdit ? t('views.projects.projectForm.editProjectTitle') : t('views.projects.newProject')}</h2>
                    </header>
                    <main className="flex-1 overflow-y-auto p-6 space-y-4">
                        <div>
                            <label htmlFor="projectName" className="block text-sm font-medium text-slate-700 mb-1">{t('views.projects.projectName')}</label>
                            <input
                                id="projectName"
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                onKeyDown={handleFormKeyDown}
                                required
                                className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                             <label htmlFor="projectDescription" className="block text-sm font-medium text-slate-700 mb-1">{t('views.projects.projectDescription')}</label>
                            <textarea
                                id="projectDescription"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                onKeyDown={handleFormKeyDown}
                                rows={3}
                                className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                         <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 mb-1">{t('views.projects.projectForm.startDate')}</label>
                                <input id="startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} onKeyDown={handleFormKeyDown} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-2 text-sm"/>
                            </div>
                             <div>
                                <label htmlFor="endDate" className="block text-sm font-medium text-slate-700 mb-1">{t('views.projects.projectForm.endDate')}</label>
                                <input id="endDate" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} onKeyDown={handleFormKeyDown} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-2 text-sm"/>
                            </div>
                        </div>
                        {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
                    </main>
                    <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3 flex-shrink-0">
                        <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                        <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{projectToEdit ? t('buttons.save') : t('views.projects.createProject')}</button>
                    </footer>
                </form>
            </div>
        </div>
    );
};

export default ProjectFormModal;