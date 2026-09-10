
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Task, ProjectTaskChecklistItem, ChecklistTemplate, Project, AISettings } from '../types';
import { useModals } from '../contexts/ModalContext';
import NumericInput from './NumericInput';
import { formatDisplayDate } from '../utils/dateUtils';
import { generateChecklistFromDescription } from '../utils/ai';
import jalaali from 'jalaali-js';

// --- Custom Jalali Date Picker (copied from ReminderModal) ---
interface JalaliDatePickerProps {
    targetRef: React.RefObject<HTMLElement>;
    selectedDate: string; // YYYY-MM-DD
    onSelectDate: (date: string) => void;
    onClose: () => void;
}

const JalaliDatePicker: React.FC<JalaliDatePickerProps> = ({ targetRef, selectedDate, onSelectDate, onClose }) => {
    const { t } = useTranslation();
    const pickerRef = useRef<HTMLDivElement>(null);
    const [viewDate, setViewDate] = useState(new Date(selectedDate + 'T00:00:00Z'));

    const { jy, jm } = jalaali.toJalaali(viewDate);
    
    const changeMonth = (delta: number) => {
        setViewDate(prev => {
            const jd = jalaali.toJalaali(prev);
            let newM = jd.jm + delta;
            let newY = jd.jy;
            if (newM > 12) { newM = 1; newY++; }
            if (newM < 1) { newM = 12; newY--; }
            const g = jalaali.toGregorian(newY, newM, 1);
            return new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
        });
    };

    const grid = useMemo(() => {
        const { jy, jm } = jalaali.toJalaali(viewDate);
        const daysInMonth = jalaali.jalaaliMonthLength(jy, jm);
        const firstDayGregorian = jalaali.toGregorian(jy, jm, 1);
        const firstDate = new Date(Date.UTC(firstDayGregorian.gy, firstDayGregorian.gm - 1, firstDayGregorian.gd));
        const startDayOfWeek = (firstDate.getUTCDay() + 1) % 7; // 0 for Saturday

        const gridCells: React.ReactNode[] = [];
        for (let i = 0; i < startDayOfWeek; i++) {
            gridCells.push(<div key={`pad-${i}`} />);
        }

        const selectedJ = jalaali.toJalaali(new Date(selectedDate + 'T00:00:00Z'));

        for (let day = 1; day <= daysInMonth; day++) {
            const isSelected = selectedJ.jy === jy && selectedJ.jm === jm && selectedJ.jd === day;
            gridCells.push(
                <button
                    type="button"
                    key={day}
                    onClick={() => {
                        const g = jalaali.toGregorian(jy, jm, day);
                        onSelectDate(`${g.gy}-${String(g.gm).padStart(2,'0')}-${String(g.gd).padStart(2,'0')}`);
                    }}
                    className={`p-1 text-sm rounded-full text-center hover:bg-indigo-100 ${isSelected ? 'bg-indigo-600 text-white font-bold' : ''}`}
                >
                    {new Intl.NumberFormat('fa-IR').format(day)}
                </button>
            );
        }
        return gridCells;
    }, [viewDate, selectedDate, onSelectDate]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node) && targetRef.current && !targetRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose, targetRef]);

    const headerText = `${t(`months.jalali.${jm}`)} ${new Intl.NumberFormat('fa-IR').format(jy)}`;
    const dayHeadersRaw = t('daysOfWeek.jalali.short', { returnObjects: true });
    const dayHeaders = Array.isArray(dayHeadersRaw) ? (dayHeadersRaw as string[]) : [];

    return (
        <div ref={pickerRef} className="absolute top-full mt-2 z-50 bg-white shadow-lg rounded-lg border border-slate-200 p-3 w-72">
            <div className="flex justify-between items-center mb-2">
                 <button type="button" onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-slate-100">&lt;</button>
                 <span className="font-semibold">{headerText}</span>
                 <button type="button" onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-slate-100">&gt;</button>
            </div>
            <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-500 mb-1">
                {dayHeaders.map(day => <div key={day} className="py-1">{day}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {grid}
            </div>
        </div>
    );
};

interface TaskDetailModalProps {
    task: Task;
    project?: Project;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (taskId: string, updates: Partial<Task>) => void;
    onDelete: (taskId: string) => void;
    templates: ChecklistTemplate[];
    doneStatusId: string | null;
    aiSettings?: AISettings;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, project, isOpen, onClose, onUpdate, onDelete, templates, doneStatusId, aiSettings }) => {
    const { t, i18n } = useTranslation();
    const { showConfirmation, addToast } = useModals();

    const [localTask, setLocalTask] = useState<Task>(task);
    const [newChecklistItem, setNewChecklistItem] = useState('');
    const [isTemplateDropdownOpen, setTemplateDropdownOpen] = useState(false);
    const templateDropdownRef = useRef<HTMLDivElement>(null);
    const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);

    // Jalali Date Picker State
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const dateButtonRef = useRef<HTMLButtonElement>(null);
    const isJalali = i18n.language === 'fa';

    useEffect(() => {
        setLocalTask(task);
    }, [task, isOpen]);

     useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (templateDropdownRef.current && !templateDropdownRef.current.contains(event.target as Node)) {
                setTemplateDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const handleFieldUpdate = <K extends keyof Task>(field: K, value: Task[K]) => {
        onUpdate(task.id, { [field]: value });
    };

    const handleTextBlur = <K extends keyof Task>(field: K) => {
        if (task[field] !== localTask[field]) {
            onUpdate(task.id, { [field]: localTask[field] });
        }
    };

    const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDate = e.target.value;
        const isTaskDone = task.statusId === doneStatusId;
    
        if (newDate) { // Only validate if there is a date
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normalize to start of day to prevent timezone issues
            const todayString = today.toISOString().split('T')[0];
            if (newDate < todayString && !isTaskDone) {
                addToast(t('toasts.projects.pastDueDateError'), 'error');
                // Don't update the state, so the input reverts on re-render
                return; 
            }
        }
        
        // If valid, update both local state and call the parent update function
        setLocalTask(prev => ({ ...prev, dueDate: newDate || undefined }));
        onUpdate(task.id, { dueDate: newDate || undefined });
    };

    const handleChecklistItemToggle = (itemId: string) => {
        const updatedChecklist = localTask.checklist?.map(item => 
            item.id === itemId ? { ...item, isDone: !item.isDone } : item
        );
        onUpdate(task.id, { checklist: updatedChecklist });
    };
    
    const handleDeleteChecklistItem = (itemId: string) => {
        const updatedChecklist = (localTask.checklist || []).filter(item => item.id !== itemId);
        onUpdate(task.id, { checklist: updatedChecklist });
    };

    const handleAddChecklistItem = (e: React.FormEvent) => {
        e.preventDefault();
        if (newChecklistItem.trim()) {
            const newItem: ProjectTaskChecklistItem = {
                id: crypto.randomUUID(),
                text: newChecklistItem.trim(),
                isDone: false,
                isAdhoc: true,
            };
            const updatedChecklist = [...(localTask.checklist || []), newItem];
            onUpdate(task.id, { checklist: updatedChecklist });
            setNewChecklistItem('');
        }
    };

    const handleTemplateToggle = (toggledTemplateId: string) => {
        const currentIds = task.templateIds || [];
        const newTemplateIds = currentIds.includes(toggledTemplateId)
            ? currentIds.filter(id => id !== toggledTemplateId)
            : [...currentIds, toggledTemplateId];

        const selectedTemplates = templates.filter(t => newTemplateIds.includes(t.id)) || [];
        const newTasksFromTemplates = selectedTemplates.flatMap(template =>
            template.tasks.map(taskTemplate => ({
                id: `template-${taskTemplate.task_id}-${crypto.randomUUID()}`,
                text: i18n.language === 'fa' ? taskTemplate.task_fa : taskTemplate.task_en,
                isDone: false,
                isAdhoc: false,
            }))
        );
        
        const adhocTasks = (task.checklist || []).filter(item => item.isAdhoc);
        const updatedChecklist = [...newTasksFromTemplates, ...adhocTasks];
        
        onUpdate(task.id, { templateIds: newTemplateIds, checklist: updatedChecklist });
    };

    const selectedTemplateNames = useMemo(() => {
        return templates
            ?.filter(t => (task.templateIds || []).includes(t.id))
            .map(t => t.name)
            .join(', ') || t('labels.checklistTemplate');
    }, [task.templateIds, templates, t]);

    
    const handleDelete = () => {
        showConfirmation({
            title: t('views.projects.deleteTaskTitle'),
            message: t('views.projects.deleteTaskBody', { title: task.title }),
            confirmText: t('buttons.delete'),
            variant: 'destructive',
            onConfirm: () => {
                onDelete(task.id);
                onClose();
            }
        });
    };
    
    const handleShare = async () => {
        const pendingItems = localTask.checklist?.filter(item => !item.isDone) || [];
        if (pendingItems.length === 0) {
            addToast(t('toasts.clipboard.noItems'), "info");
            return;
        }

        const markdownText = `*Project:* ${project?.name || 'Unknown Project'}\n*Task:* ${localTask.title}\n\n*Pending Checklist Items:*\n${pendingItems.map(item => `- [ ] ${item.text}`).join('\n')}`;
        
        try {
            await navigator.clipboard.writeText(markdownText);
            addToast(t('toasts.clipboard.success'), 'success');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            addToast(t('toasts.clipboard.error'), 'error');
        }
    };
    
    const handleAddAttachment = async () => {
        if ((window as any).electronAPI?.selectFiles) {
            try {
                const filePaths: string[] = await (window as any).electronAPI.selectFiles();
                if (filePaths && filePaths.length > 0) {
                    const newAttachments = filePaths.map((p: string) => ({
                        id: crypto.randomUUID(),
                        name: p.split(/[\\/]/).pop() || 'file',
                        type: 'file' as 'file',
                        url: p 
                    }));
                    const updatedAttachments = [...(localTask.attachments || []), ...newAttachments];
                    onUpdate(task.id, { attachments: updatedAttachments });
                }
            } catch (error) {
                console.error('Error selecting files:', error);
                addToast('Failed to add attachment.', 'error');
            }
        } else {
            addToast('File attachments are only supported in the desktop app.', 'error');
        }
    };

    const handleGenerateChecklist = async () => {
        if (!aiSettings?.apiKey) {
            addToast(t('toasts.ai.apiKeyNotConfigured'), 'error');
            return;
        }
        const description = localTask.description || localTask.title;
        if (!description.trim()) {
            addToast('Please add a title or description to the task before generating a checklist.', 'error');
            return;
        }

        setIsGeneratingChecklist(true);
        try {
            const model = aiSettings.checklistGenerationModel || 'gemini-3.5-flash';
            const generatedSections = await generateChecklistFromDescription(description, model, aiSettings.apiKey);
            
            const newChecklistItems: ProjectTaskChecklistItem[] = generatedSections.flatMap(section =>
                section.tasks.map(taskItem => ({
                    id: `ai-${crypto.randomUUID()}`,
                    text: i18n.language === 'fa' ? taskItem.task_fa : taskItem.task_en,
                    isDone: false,
                    isAdhoc: true,
                }))
            );

            const updatedChecklist = [...(localTask.checklist || []), ...newChecklistItems];
            onUpdate(task.id, { checklist: updatedChecklist });
            addToast(t('toasts.ai.generateSuccess'), 'success');

        } catch (error) {
            const message = error instanceof Error ? error.message : t('toasts.ai.generateError');
            addToast(message, 'error');
        } finally {
            setIsGeneratingChecklist(false);
        }
    };


    if (!isOpen) return null;

    const checklistProgress = useMemo(() => {
        if (!localTask.checklist || localTask.checklist.length === 0) return 0;
        const doneCount = localTask.checklist.filter(i => i.isDone).length;
        return (doneCount / localTask.checklist.length) * 100;
    }, [localTask.checklist]);
    
    const isDone = doneStatusId ? localTask.statusId === doneStatusId : false;
    const todayString = new Date().toISOString().split('T')[0];
    const isOverdue = !isDone && localTask.dueDate && localTask.dueDate < todayString;

    const titleInputClasses = `text-xl font-bold w-full bg-white border-none focus:ring-2 focus:ring-indigo-300 rounded-md p-2 ${
        isDone
            ? 'line-through text-slate-500'
            : isOverdue
            ? 'text-red-600'
            : 'text-gray-800'
    }`;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex justify-between items-start">
                    <input 
                        type="text" 
                        value={localTask.title} 
                        onChange={(e) => setLocalTask(prev => ({...prev, title: e.target.value}))}
                        onBlur={() => handleTextBlur('title')}
                        className={titleInputClasses}
                    />
                    <button onClick={onClose} className="p-2 rounded-full text-slate-500 hover:bg-slate-100 ml-4 flex-shrink-0">
                        &times;
                    </button>
                </header>
                <main className="flex-1 overflow-y-auto p-6 grid grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="col-span-2 space-y-4">
                        <div>
                            <h3 className="font-semibold text-slate-700 mb-2">{t('views.projects.taskDetails.description')}</h3>
                            <textarea 
                                value={localTask.description || ''}
                                onChange={e => setLocalTask(prev => ({...prev, description: e.target.value}))}
                                onBlur={() => handleTextBlur('description')}
                                placeholder="Add a more detailed description..."
                                className="w-full h-32 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500 bg-white text-gray-900"
                            />
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-semibold text-slate-700">{t('views.projects.taskDetails.checklist')}</h3>
                                <div className="flex items-center gap-x-1">
                                    <button
                                        type="button"
                                        onClick={handleGenerateChecklist}
                                        disabled={isGeneratingChecklist || !aiSettings?.apiKey}
                                        title={t('buttons.generateChecklistAI') as string}
                                        className="text-purple-600 hover:text-purple-800 hover:bg-purple-50 p-1.5 rounded-full disabled:opacity-50"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isGeneratingChecklist ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 3zM6.03 5.23a.75.75 0 01.04 1.06l-1.72 1.72a.75.75 0 01-1.06-1.06l-1.72-1.72a.75.75 0 011.02 0zm8 0a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06zM10 18a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5H10a.75.75 0 01-.75-.75zM4.75 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm9.25-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zM6.03 14.77a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06z" clipRule="evenodd" /></svg>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleShare}
                                        title={t('buttons.shareTooltip') as string}
                                        className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-full"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                          <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                             <div className="relative flex-1 mb-2" ref={templateDropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => setTemplateDropdownOpen(prev => !prev)}
                                    className="w-full bg-slate-100 border-slate-300 rounded p-2 text-sm text-left rtl:text-right flex justify-between items-center"
                                >
                                    <span className="truncate">{selectedTemplateNames}</span>
                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                </button>
                                {isTemplateDropdownOpen && (
                                    <div className="absolute top-full left-0 mt-1 w-full bg-white border border-slate-300 rounded-md shadow-lg z-20 max-h-40 overflow-y-auto">
                                        {templates?.map(template => (
                                            <label key={template.id} className="flex items-center gap-x-2 p-2 text-sm hover:bg-slate-100 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={(task.templateIds || []).includes(template.id)}
                                                    onChange={() => handleTemplateToggle(template.id)}
                                                    className="h-3.5 w-3.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span>{template.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {checklistProgress > 0 && 
                                <div className="w-full bg-slate-200 rounded-full h-1.5 my-2">
                                    <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${checklistProgress}%`}}></div>
                                </div>
                            }
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
                                {localTask.checklist?.map(item => (
                                    <div key={item.id} className="group flex items-center gap-x-2 p-1 rounded hover:bg-slate-100">
                                        <input 
                                            type="checkbox" 
                                            checked={item.isDone}
                                            onChange={() => handleChecklistItemToggle(item.id)}
                                            className="h-4 w-4 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className={`flex-1 text-sm ${item.isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.text}</span>
                                         <button onClick={() => handleDeleteChecklistItem(item.id)} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                             <form onSubmit={handleAddChecklistItem} className="mt-2">
                                <input 
                                    type="text" 
                                    value={newChecklistItem}
                                    onChange={e => setNewChecklistItem(e.target.value)}
                                    placeholder={t('views.projects.taskDetails.newItemPlaceholder') as string}
                                    className="w-full border-b border-slate-300 focus:border-indigo-500 focus:outline-none py-1 text-sm bg-transparent text-gray-900"
                                />
                            </form>
                        </div>
                         <div>
                            <h3 className="font-semibold text-slate-700 mb-2">{t('views.projects.taskDetails.attachments')}</h3>
                            <div className="space-y-2">
                                {localTask.attachments?.map(att => (
                                    <div key={att.id} className="group flex items-center justify-between p-2 bg-slate-100 rounded-md">
                                        <div className="flex items-center gap-x-2 truncate">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a3 3 0 006 0V7a3 3 0 00-3-3zM8 9a1 1 0 01-2 0V7a1 1 0 012 0v2zm0-1a1 1 0 00-1 1v4a1 1 0 102 0V9a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                            <a href="#" onClick={(e) => { e.preventDefault(); if((window as any).electronAPI?.openPath) (window as any).electronAPI.openPath(att.url); }} className="text-sm text-indigo-600 hover:underline truncate" title={att.url}>{att.name}</a>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const updatedAttachments = (localTask.attachments || []).filter(a => a.id !== att.id);
                                                onUpdate(task.id, { attachments: updatedAttachments });
                                            }}
                                            className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 p-1 rounded-full"
                                        >
                                            &times;
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button onClick={handleAddAttachment} className="mt-2 text-sm text-indigo-600">{t('views.projects.taskDetails.addAttachment')}</button>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="col-span-1 space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">{t('views.projects.dueDate')}</label>
                            {isJalali ? (
                                <div className="relative">
                                    <button
                                        ref={dateButtonRef}
                                        type="button"
                                        onClick={() => setIsDatePickerOpen(p => !p)}
                                        className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm text-left"
                                    >
                                        {localTask.dueDate ? formatDisplayDate(localTask.dueDate, i18n.language) : 'Select a date'}
                                    </button>
                                    {isDatePickerOpen && (
                                        <JalaliDatePicker
                                            targetRef={dateButtonRef}
                                            selectedDate={localTask.dueDate || new Date().toISOString().split('T')[0]}
                                            onSelectDate={(newDateString) => {
                                                const fakeEvent = { target: { value: newDateString } } as React.ChangeEvent<HTMLInputElement>;
                                                handleDueDateChange(fakeEvent);
                                                setIsDatePickerOpen(false);
                                            }}
                                            onClose={() => setIsDatePickerOpen(false)}
                                        />
                                    )}
                                </div>
                            ) : (
                                <input type="date" value={localTask.dueDate || ''} onChange={handleDueDateChange} className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm"/>
                            )}
                        </div>
                        <div>
                             <label className="block text-xs font-medium text-slate-600 mb-1">{t('views.projects.weight')}</label>
                            <NumericInput value={localTask.weight || 0} onChange={v => handleFieldUpdate('weight', v)} fractionDigits={1} />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 mt-4">Created: {formatDisplayDate(task.createdAt.split('T')[0], i18n.language)}</p>
                        </div>
                    </div>
                </main>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-between items-center">
                    <button onClick={handleDelete} className="text-red-600 hover:text-red-800 text-sm font-semibold">{t('buttons.delete')}</button>
                    <button onClick={onClose} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.close')}</button>
                </footer>
            </div>
        </div>
    );
};

export default TaskDetailModal;
