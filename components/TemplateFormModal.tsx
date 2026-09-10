import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
// FIX: Moved GeneratedSection import to `types` to resolve module export error.
import { ChecklistTemplate, ChecklistTaskTemplate, AISettings, GeneratedSection } from '../types';
import NumericInput from './NumericInput';
import { generateChecklistFromDescription } from '../utils/ai';
import { useModals } from '../contexts/ModalContext';
import { persianArabicToEnglish } from '../utils/formatters';

interface TemplateFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Omit<ChecklistTemplate, 'id'>, id?: string) => void;
    templateToEdit: ChecklistTemplate | null;
    aiSettings?: AISettings;
}

type Section = {
    id: number;
    name_en: string;
    name_fa: string;
    tasks: Omit<ChecklistTaskTemplate, 'section_id' | 'section_en' | 'section_fa'>[];
};

const handleFormKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
            return;
        }
        
        e.preventDefault();
        const form = target.closest('form');
        if (!form) return;
        
        const focusable = Array.from(
            form.querySelectorAll('input:not([type="hidden"]), select, textarea, button:not([tabindex="-1"])')
        ).filter(el => {
            const htmlEl = el as HTMLElement;
            return !htmlEl.hasAttribute('disabled') && !htmlEl.hasAttribute('readonly') && htmlEl.offsetParent !== null;
        }) as HTMLElement[];
        
        const index = focusable.indexOf(target);
        
        if (index > -1 && index < focusable.length - 1) {
            focusable[index + 1].focus();
        } else if (index === focusable.length - 1) {
            const submitButton = focusable.find(el => el.tagName === 'BUTTON' && (el as HTMLButtonElement).type === 'submit');
            if (submitButton) {
                submitButton.focus();
            }
        }
    }
};

const TemplateFormModal: React.FC<TemplateFormModalProps> = ({ isOpen, onClose, onSubmit, templateToEdit, aiSettings }) => {
    const { t } = useTranslation();
    const { addToast } = useModals();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [sections, setSections] = useState<Section[]>([]);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const [aiDescription, setAiDescription] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    // Function to re-calculate all section and task IDs based on their position
    const renumberSections = (secs: Section[]): Section[] => {
        return secs.map((section, secIndex) => {
            const newSectionId = secIndex + 1;
            const renumberedTasks = section.tasks.map((task, taskIndex) => ({
                ...task,
                task_id: `${String(newSectionId).padStart(2, '0')}-${String(taskIndex + 1).padStart(2, '0')}`,
            }));
            return { ...section, id: newSectionId, tasks: renumberedTasks };
        });
    };

    useEffect(() => {
        if (isOpen) {
            if (templateToEdit) {
                setName(templateToEdit.name);
                setDescription(templateToEdit.description || '');
                // Group tasks by section to build the UI state
                const groupedBySection = templateToEdit.tasks.reduce((acc, task) => {
                    if (!acc[task.section_id]) {
                        acc[task.section_id] = {
                            id: task.section_id,
                            name_en: task.section_en,
                            name_fa: task.section_fa,
                            tasks: [],
                        };
                    }
                    acc[task.section_id].tasks.push({
                        task_id: task.task_id,
                        task_en: task.task_en,
                        task_fa: task.task_fa,
                        task_weight: task.task_weight,
                    });
                    return acc;
                }, {} as Record<number, Section>);
                setSections(Object.values(groupedBySection).sort((a,b) => a.id - b.id));
            } else {
                // Reset form for new template
                setName('');
                setDescription('');
                setSections([{ id: 1, name_en: '', name_fa: '', tasks: [{ task_id: '01-01', task_en: '', task_fa: '', task_weight: 1 }] }]);
            }
            setAiDescription('');
            setIsGenerating(false);
        }
    }, [isOpen, templateToEdit]);
    
    const handleSectionChange = (index: number, field: 'name_en' | 'name_fa', value: string) => {
        const newSections = [...sections];
        newSections[index][field] = persianArabicToEnglish(value);
        setSections(newSections);
    };

    const handleTaskChange = (secIndex: number, taskIndex: number, field: keyof Section['tasks'][0], value: string | number) => {
        const newSections = [...sections];
        const sanitizedValue = typeof value === 'string' ? persianArabicToEnglish(value) : value;
        (newSections[secIndex].tasks[taskIndex] as any)[field] = sanitizedValue;
        setSections(newSections);
    };
    
    const addSection = () => {
        const newSections = [...sections, { id: 99, name_en: '', name_fa: '', tasks: [{ task_id: '99-01', task_en: '', task_fa: '', task_weight: 1 }] }];
        setSections(renumberSections(newSections));
    };
    
    const removeSection = (index: number) => {
        if (sections.length > 1) {
            const newSections = sections.filter((_, i) => i !== index);
            setSections(renumberSections(newSections));
        }
    };
    
    const addTask = (secIndex: number) => {
        const newSections = [...sections];
        newSections[secIndex].tasks.push({ task_id: '99-99', task_en: '', task_fa: '', task_weight: 1 });
        setSections(renumberSections(newSections));
    };

    const removeTask = (secIndex: number, taskIndex: number) => {
        const newSections = [...sections];
        if (newSections[secIndex].tasks.length > 1) {
            newSections[secIndex].tasks.splice(taskIndex, 1);
            setSections(renumberSections(newSections));
        }
    };

     // --- Drag and Drop Handlers ---
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === targetIndex) {
            setDraggedItemIndex(null);
            return;
        }

        const newSections = [...sections];
        const [draggedItem] = newSections.splice(draggedItemIndex, 1);
        newSections.splice(targetIndex, 0, draggedItem);

        setSections(renumberSections(newSections));
        setDraggedItemIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedItemIndex(null);
    };
    // ---
    
    const handleGenerateWithAI = async () => {
        if (!aiDescription.trim()) return;
        if (!aiSettings?.apiKey) {
            addToast("API Key is not configured. Please set it in Settings > AI Settings.", "error");
            return;
        }
        setIsGenerating(true);
        addToast(t('toasts.ai.generating'), 'info');
        try {
            const model = aiSettings?.checklistGenerationModel || 'gemini-3.5-flash';
            const generated = await generateChecklistFromDescription(aiDescription, model, aiSettings.apiKey);
            const newSectionsFromAI: Section[] = generated.map((genSection: GeneratedSection) => ({
                id: 0, // Will be renumbered
                name_en: genSection.section_en,
                name_fa: genSection.section_fa,
                tasks: genSection.tasks.map(t => ({
                    task_id: '', // Will be renumbered
                    task_en: t.task_en,
                    task_fa: t.task_fa,
                    task_weight: t.task_weight,
                })),
            }));
            setSections(renumberSections(newSectionsFromAI));
            addToast(t('toasts.ai.generateSuccess'), 'success');
        } catch (error) {
            console.error("AI Checklist Generation Failed:", error);
            const message = error instanceof Error ? error.message : t('toasts.ai.generateError');
            addToast(message, 'error');
        } finally {
            setIsGenerating(false);
        }
    };


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const flattenedTasks: ChecklistTaskTemplate[] = sections.flatMap(section =>
            section.tasks.map(task => ({
                ...task,
                section_id: section.id,
                section_en: section.name_en,
                section_fa: section.name_fa,
            }))
        );

        const data: Omit<ChecklistTemplate, 'id'> = {
            name,
            description,
            productNameMatch: name.toLowerCase(), // Simple default match
            tasks: flattenedTasks,
        };
        onSubmit(data, templateToEdit?.id);
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex-shrink-0">
                    <h2 className="text-lg font-bold text-gray-800">{templateToEdit ? t('settings.templates.edit') : t('settings.templates.new')}</h2>
                </header>
                <main className="flex-1 overflow-y-auto p-4 space-y-4">
                     <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                        <h3 className="font-semibold text-indigo-800">{t('toasts.ai.generateChecklist')}</h3>
                        <p className="text-sm text-indigo-700 mt-1">{t('toasts.ai.productDescription')}</p>
                        <textarea
                            value={aiDescription}
                            onChange={(e) => setAiDescription(e.target.value)}
                            rows={3}
                            placeholder={t('settings.templates.aiPlaceholder') as string}
                            className="mt-2 w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                            type="button"
                            onClick={handleGenerateWithAI}
                            disabled={isGenerating || !aiDescription.trim() || !aiSettings?.apiKey}
                            className="mt-2 bg-purple-700 text-white px-4 py-2 rounded-md hover:bg-purple-800 text-sm font-semibold disabled:bg-purple-400 flex items-center justify-center gap-x-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 3zM6.03 5.23a.75.75 0 01.04 1.06l-1.72 1.72a.75.75 0 01-1.06-1.06l-1.72-1.72a.75.75 0 011.02 0zm8 0a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06zM10 18a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5H10a.75.75 0 01-.75-.75zM4.75 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm9.25-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zM6.03 14.77a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06z" clipRule="evenodd" /></svg>
                            {isGenerating ? t('toasts.ai.generating') : t('toasts.ai.generateChecklist')}
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="templateName" className="block text-sm font-medium text-slate-700 mb-1">{t('settings.templates.name')}</label>
                            <input id="templateName" type="text" value={name} onChange={e => setName(persianArabicToEnglish(e.target.value))} onKeyDown={handleFormKeyDown} required className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" />
                        </div>
                        <div>
                            <label htmlFor="templateDesc" className="block text-sm font-medium text-slate-700 mb-1">{t('settings.templates.description')}</label>
                            <input id="templateDesc" type="text" value={description} onChange={e => setDescription(persianArabicToEnglish(e.target.value))} onKeyDown={handleFormKeyDown} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" />
                        </div>
                    </div>
                    <h3 className="text-md font-semibold text-slate-800 border-b pb-1">{t('settings.templates.sections')}</h3>
                    <div className="space-y-4">
                        {sections.map((section, secIndex) => (
                            <div 
                                key={secIndex}
                                className={`p-3 bg-slate-50 rounded-lg border border-slate-200 transition-opacity ${draggedItemIndex === secIndex ? 'opacity-50' : ''}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, secIndex)}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, secIndex)}
                                onDragEnd={handleDragEnd}
                            >
                                <div className="flex justify-between items-center mb-2">
                                     <div className="flex items-center gap-x-2 flex-grow">
                                        <span className="cursor-move p-1 text-slate-400 hover:text-slate-600" title={t('settings.templates.dragToReorder') as string}>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                            </svg>
                                        </span>
                                        <div className="grid grid-cols-2 gap-2 flex-grow">
                                            <input type="text" value={section.name_en} onChange={e => handleSectionChange(secIndex, 'name_en', e.target.value)} onKeyDown={handleFormKeyDown} placeholder={t('settings.templates.sectionName') as string} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" />
                                            <input type="text" value={section.name_fa} onChange={e => handleSectionChange(secIndex, 'name_fa', e.target.value)} onKeyDown={handleFormKeyDown} placeholder={t('settings.templates.sectionNameFa') as string} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" dir="rtl" />
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => removeSection(secIndex)} disabled={sections.length <= 1} className="ml-2 text-red-500 hover:text-red-700 disabled:text-slate-300 p-1">
                                        {t('buttons.delete')}
                                    </button>
                                </div>
                                <div className="space-y-1">
                                    {section.tasks.map((task, taskIndex) => (
                                        <div key={taskIndex} className="flex items-center gap-x-2">
                                             <input type="text" value={task.task_id} readOnly className="w-20 bg-slate-200 text-gray-500 border border-slate-300 rounded p-1.5 text-sm text-center" />
                                             <input type="text" value={task.task_en} onChange={e => handleTaskChange(secIndex, taskIndex, 'task_en', e.target.value)} onKeyDown={handleFormKeyDown} placeholder={t('settings.templates.taskName') as string} className="flex-1 bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" />
                                             <input type="text" value={task.task_fa} onChange={e => handleTaskChange(secIndex, taskIndex, 'task_fa', e.target.value)} onKeyDown={handleFormKeyDown} placeholder={t('settings.templates.taskNameFa') as string} className="flex-1 bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" dir="rtl" />
                                             <NumericInput value={task.task_weight} onChange={v => handleTaskChange(secIndex, taskIndex, 'task_weight', v)} onKeyDown={handleFormKeyDown} fractionDigits={0} min={0} className="w-20 text-center bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" />
                                             <button type="button" onClick={() => removeTask(secIndex, taskIndex)} disabled={section.tasks.length <= 1} className="text-red-500 hover:text-red-700 disabled:text-slate-300 p-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                                             </button>
                                        </div>
                                    ))}
                                </div>
                                <button type="button" onClick={() => addTask(secIndex)} className="mt-2 text-indigo-600 hover:text-indigo-800 text-xs font-semibold">{t('settings.templates.addTask')}</button>
                            </div>
                        ))}
                    </div>
                     <button type="button" onClick={addSection} className="text-indigo-600 hover:text-indigo-800 font-semibold">{t('settings.templates.addSection')}</button>
                </main>
                <footer className="p-4 border-t border-slate-200 flex-shrink-0 flex justify-end gap-x-3">
                    <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{templateToEdit ? t('buttons.save') : t('buttons.create')}</button>
                </footer>
            </form>
        </div>
    );
};

export default TemplateFormModal;
