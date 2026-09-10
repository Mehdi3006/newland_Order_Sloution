import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Order, OrderItem, ChecklistTask, ChecklistTemplate, Task, KanbanCardDisplaySettings, ChecklistTaskTemplate } from '../types';
import { useTranslation } from 'react-i18next';
import { calculateOrderProgress, calculateItemProgress } from '../utils/progress';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useModals } from '../contexts/ModalContext';
import { formatDisplayDate } from '../utils/dateUtils';

interface KanbanCardProps {
    order: Order;
    onCardClick: (order: Order) => void;
    isFinalColumn?: boolean;
    onArchiveOrder?: (orderId: string) => void;
    updateOrder: (orderId: string, updates: Partial<Order>) => void;
    templates?: ChecklistTemplate[];
    onNewTemplateClick: () => void;
    onSetReminder: (item: Order, type: 'order') => void;
}

interface CompactChecklistProps {
    item: OrderItem;
    order: Order;
    onTaskToggle: (itemId: string, taskId: string) => void;
    onTaskAdd: (itemId: string, taskName: string) => void;
    onTaskDelete: (itemId: string, taskId: string) => void;
    onTemplateApply: (itemId: string, templateIds: string[]) => void;
    templates?: ChecklistTemplate[];
    onNewTemplateClick: () => void;
}

const CompactChecklist: React.FC<CompactChecklistProps> = ({ item, order, onTaskToggle, onTaskAdd, onTaskDelete, onTemplateApply, templates, onNewTemplateClick }) => {
    const { i18n, t } = useTranslation();
    const { addToast } = useModals();
    const isLtr = i18n.dir() === 'ltr';
    const [isAdding, setIsAdding] = useState(false);
    const [newTaskName, setNewTaskName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const [isTemplateDropdownOpen, setTemplateDropdownOpen] = useState(false);
    const templateDropdownRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (templateDropdownRef.current && !templateDropdownRef.current.contains(event.target as Node)) {
                setTemplateDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleAddTask = (e?: React.FormEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        if (newTaskName.trim()) {
            onTaskAdd(item.id, newTaskName.trim());
            setNewTaskName("");
            setIsAdding(false);
        }
    };
    
    const handleStartAdding = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsAdding(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleTemplateToggle = (toggledTemplateId: string) => {
        const currentIds = item.templateIds || [];
        const newIds = currentIds.includes(toggledTemplateId)
            ? currentIds.filter(id => id !== toggledTemplateId)
            : [...currentIds, toggledTemplateId];
        
        onTemplateApply(item.id, newIds);
        setTemplateDropdownOpen(false); // Close dropdown after applying
    };
    
    const checklist = item.checklist || [];
    const progress = calculateItemProgress(item);

    return (
        <div className="text-xs bg-slate-100 p-2 rounded-md mt-2" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-1">
                <p className="font-semibold text-slate-700 truncate">{item.productName}</p>
                <div className="relative" ref={templateDropdownRef}>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setTemplateDropdownOpen(p => !p); }} 
                        className="p-1 rounded hover:bg-slate-300"
                        title={t('labels.checklistTemplate') as string}
                    >
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                    </button>
                    {isTemplateDropdownOpen && (
                        <div className="absolute top-full end-0 mt-1 w-48 bg-white border border-slate-300 rounded-md shadow-lg z-20 max-h-40 overflow-y-auto">
                            {(templates && templates.length > 0) ? templates.map(template => (
                                <label key={template.id} className="flex items-center gap-x-2 p-2 hover:bg-slate-100 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={(item.templateIds || []).includes(template.id)}
                                        onChange={() => handleTemplateToggle(template.id)}
                                        className="h-3.5 w-3.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs">{template.name}</span>
                                </label>
                            )) : (
                                <div className="p-2 text-xs text-slate-500">{t('labels.noChecklist')}</div>
                            )}
                             <div className="border-t border-slate-200">
                                <button onClick={() => { onNewTemplateClick(); setTemplateDropdownOpen(false); }} className="w-full text-left p-2 text-indigo-600 hover:bg-indigo-50 text-xs font-semibold">{t('settings.templates.new')}</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {progress > 0 && (
                <div className="w-full bg-slate-300 rounded-full h-1 my-1">
                    <div className="bg-green-500 h-1 rounded-full" style={{ width: `${progress * 100}%` }}></div>
                </div>
            )}
            
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
                {checklist.map(task => (
                    <div key={task.task_id} className="group flex items-center gap-x-2 p-0.5 rounded hover:bg-slate-200">
                         <input 
                            type="checkbox" 
                            checked={task.is_done} 
                            onChange={() => onTaskToggle(item.id, task.task_id)}
                            className="h-3.5 w-3.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label className={`flex-1 text-xs truncate ${task.is_done ? 'line-through text-slate-500' : 'text-slate-700'}`}>
                            {i18n.language === 'fa' ? task.task_fa : task.task_en}
                        </label>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onTaskDelete(item.id, task.task_id); }}
                            className="text-red-500 opacity-0 group-hover:opacity-100 p-0.5 rounded-full hover:bg-red-100 transition-opacity duration-200"
                            title={t('buttons.delete') as string}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                ))}
            </div>

            {isAdding ? (
                <form onSubmit={handleAddTask} className="mt-1">
                     <input
                        ref={inputRef}
                        type="text"
                        value={newTaskName}
                        onChange={(e) => setNewTaskName(e.target.value)}
                        onBlur={() => { if(!newTaskName.trim()) setIsAdding(false); else handleAddTask(); }}
                        placeholder={t('labels.newTaskPlaceholder') || ''}
                        className="w-full text-xs border border-indigo-400 rounded p-1"
                    />
                </form>
            ) : (
                <button onClick={handleStartAdding} className="text-indigo-600 hover:text-indigo-800 text-xs mt-1">{t('labels.addTask')}</button>
            )}
        </div>
    );
};


// Main KanbanCard component
export const KanbanCard: React.FC<KanbanCardProps> = ({ order, onCardClick, isFinalColumn = false, onArchiveOrder, updateOrder, templates, onNewTemplateClick, onSetReminder }) => {
    const { t, i18n } = useTranslation();
    const { showConfirmation } = useModals();
    const progress = useMemo(() => calculateOrderProgress(order), [order]);
    const [showItems, setShowItems] = useState(false);
    const totalValue = useMemo(() => order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0), [order.items]);
    const totalAttachments = useMemo(() => {
        const orderAttachments = order.attachments?.length || 0;
        const itemAttachments = order.items.reduce((sum, item) => sum + (item.attachments?.length || 0), 0);
        return orderAttachments + itemAttachments;
    }, [order]);

    const displaySettingsData = useLiveQuery(() => db.settings.get('displaySettings'), []);
    const settings: KanbanCardDisplaySettings = useMemo(() => {
        const defaults: KanbanCardDisplaySettings = {
            showInternalCode: true, showOrderId: true, showProgress: true,
            showLoadingDate: true, showItemsButton: true, showArchiveButton: true,
            showFilesButton: true,
        };
        return displaySettingsData?.value?.kanbanCard || defaults;
    }, [displaySettingsData]);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData('orderId', order.id);
        e.currentTarget.style.opacity = '0.5';
        e.stopPropagation();
    };

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        e.currentTarget.style.opacity = '1';
    };

    const handleTaskToggle = (itemId: string, taskId: string) => {
        const updatedItems = order.items.map(item => {
            if (item.id === itemId) {
                const updatedChecklist = item.checklist?.map(task => 
                    task.task_id === taskId ? { ...task, is_done: !task.is_done } : task
                );
                return { ...item, checklist: updatedChecklist };
            }
            return item;
        });
        updateOrder(order.id, { items: updatedItems });
    };

    const handleTaskAdd = (itemId: string, taskName: string) => {
        const updatedItems = order.items.map(item => {
            if (item.id === itemId) {
                const newChecklist = item.checklist ? [...item.checklist] : [];
                const newTask: ChecklistTask = {
                    section_id: 99,
                    section_en: "Ad-hoc",
                    section_fa: "متفرقه",
                    task_id: `adhoc-${crypto.randomUUID()}`,
                    task_en: taskName,
                    task_fa: taskName,
                    task_weight: 1,
                    is_done: false
                };
                newChecklist.push(newTask);
                return { ...item, checklist: newChecklist };
            }
            return item;
        });
        updateOrder(order.id, { items: updatedItems });
    };

    const handleTaskDelete = (itemId: string, taskId: string) => {
        const updatedItems = order.items.map(item => {
            if (item.id === itemId) {
                const updatedChecklist = item.checklist?.filter(task => task.task_id !== taskId);
                return { ...item, checklist: updatedChecklist };
            }
            return item;
        });
        updateOrder(order.id, { items: updatedItems });
    };

    const handleTemplateApply = (itemId: string, templateIds: string[]) => {
        const updatedItems = order.items.map(item => {
            if (item.id === itemId) {
                const selectedTemplates = templates?.filter(t => templateIds.includes(t.id)) || [];
                const newTasksFromTemplates = selectedTemplates.flatMap(template => 
                    template.tasks.map(taskTemplate => ({
                        ...taskTemplate,
                        is_done: false
                    }))
                );
                const adhocTasks = (item.checklist || []).filter(c => c.section_id === 99);
                return { ...item, templateIds, checklist: [...newTasksFromTemplates, ...adhocTasks] };
            }
            return item;
        });
        updateOrder(order.id, { items: updatedItems });
    };

    const handleArchiveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onArchiveOrder) return;

        showConfirmation({
            title: t('confirmationModal.archiveOrderTitle'),
            message: t('confirmationModal.archiveOrderBody', { orderId: order.id }),
            confirmText: t('common.archive'),
            variant: 'primary',
            requireCode: true,
            confirmationCode: '1234',
            onConfirm: () => onArchiveOrder(order.id)
        });
    };
    
    const hasReminder = order.reminder && !order.reminder.acknowledged;

    return (
        <div 
            draggable={!isFinalColumn}
            onDragStart={isFinalColumn ? undefined : handleDragStart}
            onDragEnd={isFinalColumn ? undefined : handleDragEnd}
            className="bg-white rounded-lg shadow border border-slate-200 cursor-grab active:cursor-grabbing"
        >
            <div className="p-3" onClick={() => onCardClick(order)}>
                <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm leading-tight truncate">{order.supplier}</p>
                        <p className="text-xs text-slate-500 font-mono">{totalValue.toLocaleString('en-US', {minimumFractionDigits: 0})} {order.currency}</p>
                    </div>
                    {hasReminder && (
                         <div className="text-yellow-500 ml-2 flex-shrink-0" title={t('reminders.setReminder') as string}>
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>
                        </div>
                    )}
                </div>
                 <div className="flex items-center gap-x-2 text-xs text-slate-500 mt-1">
                    {settings.showOrderId && <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{order.id}</span>}
                    {settings.showInternalCode && <span className="font-mono">{order.internalCode}</span>}
                </div>

                {settings.showProgress && (
                    <div className="mt-3">
                         <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                            <span>{t('labels.progress')}</span>
                            <span className="font-mono">{Math.round(progress * 100)}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5">
                            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${progress * 100}%` }}></div>
                        </div>
                    </div>
                )}
            </div>
            
            {showItems && (
                <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2">
                    {order.items.map(item => (
                        <CompactChecklist 
                            key={item.id}
                            item={item}
                            order={order}
                            onTaskToggle={handleTaskToggle}
                            onTaskAdd={handleTaskAdd}
                            onTaskDelete={handleTaskDelete}
                            onTemplateApply={handleTemplateApply}
                            templates={templates}
                            onNewTemplateClick={onNewTemplateClick}
                        />
                    ))}
                </div>
            )}

            <div className="bg-slate-50/70 rounded-b-lg px-2 py-1.5 flex justify-between items-center text-xs text-slate-500 border-t border-slate-200">
                <div className="flex items-center gap-x-1">
                    {settings.showLoadingDate && 
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                            <span className="font-mono">{formatDisplayDate(order.approxLoadingDate, i18n.language)}</span>
                        </>
                    }
                     {totalAttachments > 0 && (
                        <span className="flex items-center gap-x-1 text-slate-500 ml-2" title={`${totalAttachments} ${t('labels.attachments')}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a3 3 0 006 0V7a1 1 0 112 0v4a5 5 0 01-10 0V7a3 3 0 003-3h1z" clipRule="evenodd" /></svg>
                            <span>{totalAttachments}</span>
                        </span>
                    )}
                </div>
                 <div className="flex items-center">
                    {settings.showItemsButton && 
                        <button onClick={() => setShowItems(!showItems)} className="font-semibold p-1.5 rounded hover:bg-slate-200">{t('common.items')} ({order.items.length})</button>
                    }
                     <button onClick={(e)=>{e.stopPropagation(); onSetReminder(order, 'order')}} className="p-1.5 rounded hover:bg-slate-200" title={t('reminders.setReminder') as string}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>
                     </button>
                    {settings.showFilesButton && 
                        <button onClick={() => onCardClick(order)} className="font-semibold p-1.5 rounded hover:bg-slate-200">{t('buttons.manageFiles')}</button>
                    }
                    {settings.showArchiveButton && onArchiveOrder && isFinalColumn &&
                        <button onClick={handleArchiveClick} className="font-semibold p-1.5 rounded hover:bg-slate-200">{t('common.archive')}</button>
                    }
                </div>
            </div>
        </div>
    );
};
