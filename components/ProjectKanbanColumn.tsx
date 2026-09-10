
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { TaskCard } from './TaskCard';
import { Order, ProjectStatus, Task } from '../types';
import { useTranslation } from 'react-i18next';
import { useModals } from '../contexts/ModalContext';
import { persianArabicToEnglish } from '../utils/formatters';

interface ProjectKanbanColumnProps {
    status: ProjectStatus;
    tasks: Task[];
    onTaskDrop: (taskId: string, statusId: string, newOrder: number) => void;
    onAddTask: (data: NewTaskData) => void;
    onCardClick: (task: Task) => void;
    onUpdateStatusName: (id: string, newName: string) => void;
    onDeleteStatus: (id: string) => void;
    onColumnDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
    onColumnDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onColumnDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    onColumnDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
    isBeingDragged: boolean;
    onSetReminder: (item: Task, type: 'task') => void;
    doneStatusId: string | null;
}

export interface NewTaskData {
    title: string;
    dueDate?: string;
    weight?: number;
}

const AddTaskForm: React.FC<{ onAddTask: (data: NewTaskData) => void, onCancel: () => void }> = ({ onAddTask, onCancel }) => {
    const { t } = useTranslation();
    const [title, setTitle] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (title.trim()) {
            onAddTask({ title: title.trim() });
            setTitle(''); // Reset for next card
            textareaRef.current?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        } else if (e.key === 'Escape') {
            onCancel();
        }
    };
    
    return (
        <form onSubmit={handleSubmit} className="space-y-2 p-1">
            <textarea
                ref={textareaRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={onCancel}
                placeholder={t('views.projects.newTaskPlaceholder') as string}
                className="w-full border-none rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white resize-none shadow-sm"
                rows={2}
            />
            <div className="flex items-center gap-x-2">
                <button
                    type="submit"
                    onMouseDown={(e) => e.preventDefault()}
                    className="bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 text-sm font-semibold"
                >
                    {t('views.projects.addTask')}
                </button>
                <button type="button" onClick={onCancel} className="p-1.5 text-slate-500 hover:bg-slate-300 rounded">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
        </form>
    );
};

export const AddColumnForm: React.FC<{ onAdd: (name: string) => void; onCancel: () => void; }> = ({ onAdd, onCancel }) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onAdd(name.trim());
        }
    };

    return (
        <div className="flex-shrink-0 w-72 p-2 bg-gray-100 rounded-lg">
            <form onSubmit={handleSubmit}>
                <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(persianArabicToEnglish(e.target.value))}
                    placeholder={t('views.projects.newColumnPrompt')}
                    className="w-full border border-slate-400 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500 bg-white text-gray-900"
                />
                <div className="mt-2 flex items-center gap-x-2">
                    <button type="submit" className="bg-indigo-600 text-white px-3 py-1 rounded-md hover:bg-indigo-700 text-sm font-semibold">
                        {t('views.projects.addColumn')}
                    </button>
                    <button type="button" onClick={onCancel} className="bg-transparent text-slate-600 px-3 py-1 rounded-md hover:bg-slate-300 text-sm">
                        {t('common.cancel')}
                    </button>
                </div>
            </form>
        </div>
    );
};

export const ProjectKanbanColumn: React.FC<ProjectKanbanColumnProps> = ({ status, tasks, onTaskDrop, onAddTask, onCardClick, onUpdateStatusName, onDeleteStatus, onColumnDragStart, onColumnDragOver, onColumnDrop, onColumnDragEnd, isBeingDragged, onSetReminder, doneStatusId }) => {
    const { t } = useTranslation();
    const { showConfirmation } = useModals();
    const [isCardOver, setIsCardOver] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(status.name);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAddingTask, setIsAddingTask] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [sortBy, setSortBy] = useState<'order' | 'title' | 'dueDate' | 'weight'>('order');

    const sortedTasks = useMemo(() => {
        return [...tasks].sort((a, b) => {
            switch (sortBy) {
                case 'title':
                    return a.title.localeCompare(b.title);
                case 'dueDate':
                    if (!a.dueDate && !b.dueDate) return a.order - b.order;
                    if (!a.dueDate) return 1;
                    if (!b.dueDate) return -1;
                    const dateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                    if (dateDiff === 0) return a.order - b.order;
                    return dateDiff;
                case 'weight':
                    const weightA = a.weight || 0;
                    const weightB = b.weight || 0;
                    const weightDiff = weightB - weightA;
                    if (weightDiff === 0) return a.order - b.order;
                    return weightDiff;
                case 'order':
                default:
                    return a.order - b.order;
            }
        });
    }, [tasks, sortBy]);

    useEffect(() => { if (isEditing) inputRef.current?.focus(); }, [isEditing]);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsMenuOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsCardOver(true); };
    const handleDragLeave = () => setIsCardOver(false);
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsCardOver(false);
        const taskId = e.dataTransfer.getData('taskId');
        if (taskId) {
            onTaskDrop(taskId, status.id, tasks.length); // Drop at the end
        }
    };

    const handleNameBlur = () => {
        if (editedName.trim() && editedName.trim() !== status.name) onUpdateStatusName(status.id, editedName.trim());
        setIsEditing(false);
    };
    const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleNameBlur();
        else if (e.key === 'Escape') { setEditedName(status.name); setIsEditing(false); }
    };
    
    const handleDeleteColumn = () => {
        setIsMenuOpen(false);
        if (tasks.length > 0) return;
        showConfirmation({
            title: t('confirmationModal.deleteColumnTitle'),
            message: t('confirmationModal.deleteColumnBody', { name: status.name }),
            variant: 'destructive',
            onConfirm: () => onDeleteStatus(status.id),
        });
    };
    
    return (
        <div
            draggable
            onDragStart={onColumnDragStart}
            onDragOver={(e) => { onColumnDragOver(e); handleDragOver(e); }}
            onDrop={(e) => { onColumnDrop(e); handleDrop(e); }}
            onDragEnd={onColumnDragEnd}
            onDragLeave={handleDragLeave}
            className={`flex-shrink-0 w-72 bg-gray-100 rounded-lg h-full flex flex-col transition-all duration-300 ${isBeingDragged ? 'opacity-50' : ''} ${isCardOver ? 'bg-indigo-100 ring-2 ring-indigo-400' : ''}`}
        >
            <div className="p-3 flex justify-between items-center cursor-move">
                <div className="flex-1 min-w-0" onDoubleClick={() => setIsEditing(true)}>
                    {isEditing ? (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editedName}
                            onChange={e => setEditedName(e.target.value)}
                            onBlur={handleNameBlur}
                            onKeyDown={handleNameKeyDown}
                            className="font-semibold text-slate-700 bg-white border border-indigo-400 rounded-md px-2 py-0.5 w-full"
                        />
                    ) : (
                        <h2 className="font-semibold text-slate-700 truncate">{status.name}</h2>
                    )}
                </div>
                <div className="flex items-center gap-x-1">
                    <span className="bg-slate-300 text-slate-600 font-semibold text-sm px-2 py-0.5 rounded-full">{tasks.length}</span>
                     <div className="relative" ref={menuRef}>
                        <button onClick={() => setIsMenuOpen(prev => !prev)} className="text-slate-500 hover:text-slate-800 p-1.5 rounded-full hover:bg-slate-300">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                        </button>
                         {isMenuOpen && (
                            <div className="absolute top-full end-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-slate-200 z-30">
                                <ul className="py-1 text-sm text-slate-700">
                                    <li><button onClick={() => { setIsEditing(true); setIsMenuOpen(false); }} className="w-full text-left rtl:text-right px-4 py-2 hover:bg-slate-100">{t('views.projects.editName')}</button></li>
                                    <li><button onClick={handleDeleteColumn} disabled={tasks.length > 0} className="w-full text-left rtl:text-right px-4 py-2 text-red-600 hover:bg-red-50 disabled:text-red-300">{t('buttons.delete')}</button></li>
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-start mb-2 text-xs text-slate-500 px-3">
                <span className="font-semibold me-2">{t('common.sortBy.label')}:</span>
                <div className="flex items-center bg-slate-300/70 rounded-full p-0.5">
                    <button onClick={() => setSortBy('order')} className={`px-2 py-0.5 rounded-full ${sortBy === 'order' ? 'bg-white text-indigo-600' : 'hover:bg-white/50'}`}>{t('common.sortBy.manual')}</button>
                    <button onClick={() => setSortBy('title')} className={`px-2 py-0.5 rounded-full ${sortBy === 'title' ? 'bg-white text-indigo-600' : 'hover:bg-white/50'}`}>{t('common.sortBy.title')}</button>
                    <button onClick={() => setSortBy('dueDate')} className={`px-2 py-0.5 rounded-full ${sortBy === 'dueDate' ? 'bg-white text-indigo-600' : 'hover:bg-white/50'}`}>{t('common.sortBy.dueDate')}</button>
                    <button onClick={() => setSortBy('weight')} className={`px-2 py-0.5 rounded-full ${sortBy === 'weight' ? 'bg-white text-indigo-600' : 'hover:bg-white/50'}`}>{t('common.sortBy.weight')}</button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 pt-0 space-y-2">
                {sortedTasks.map(task => {
                    const isDone = doneStatusId ? task.statusId === doneStatusId : false;
                    const todayString = new Date().toISOString().split('T')[0];
                    const isOverdue = !isDone && task.dueDate && task.dueDate < todayString;

                    return (
                        <TaskCard 
                            key={task.id} 
                            task={task} 
                            onClick={() => onCardClick(task)} 
                            onSetReminder={onSetReminder} 
                            isDone={isDone} 
                            isOverdue={isOverdue} 
                        />
                    );
                })}
                 {isAddingTask ? (
                    <AddTaskForm onAddTask={onAddTask} onCancel={() => setIsAddingTask(false)} />
                ) : (
                    <button onClick={() => setIsAddingTask(true)} className="w-full flex items-center gap-x-2 p-2 rounded text-slate-500 hover:bg-slate-300 hover:text-slate-800 text-sm font-semibold">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                        {t('views.projects.addTask')}
                    </button>
                )}
            </div>
        </div>
    );
};
