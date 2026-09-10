
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Order, Task, CalendarTask, CalendarStickyNote, AISettings, StickyNote, CalendarList, TaskPriority } from '../types';
import jalaali from 'jalaali-js';
import AICalendarTasksModal from './AICalendarTasksModal';
import AIStickyNoteModal from './AIStickyNoteModal';
import { useModals } from '../contexts/ModalContext';
import { formatDisplayDate, formatDisplayTime } from '../utils/dateUtils';
import IconPicker from './IconPicker';
import RichTextEditor from './RichTextEditor';
import { getOrderValueInUSD, generatePrintableCalendarHtml, formatCalendarEventsForClipboard, formatReminderListForClipboard, persianArabicToEnglish } from '../utils/formatters';
import { useSettings } from '../hooks/useSettings';
import { getHolidaysForDate } from '../utils/holidayUtils';

interface CalendarViewProps {
    orders: Order[];
    tasks: Task[];
    updateOrder: (orderId: string, updates: Partial<Order>) => Promise<void>;
    updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
    calendarTasks: CalendarTask[];
    addCalendarTask: (date: string, title: string, categoryId?: string) => Promise<number>;
    addCalendarTasks: (date: string, titles: string[]) => Promise<number[]>;
    updateCalendarTask: (taskId: number, updates: Partial<CalendarTask>) => Promise<void>;
    deleteCalendarTask: (taskId: number) => Promise<void>;
    calendarStickyNotes: CalendarStickyNote[];
    addCalendarStickyNote: (date: string, content?: string) => Promise<string>;
    updateCalendarStickyNote: (noteId: string, updates: Partial<CalendarStickyNote>) => Promise<void>;
    deleteCalendarStickyNote: (noteId: string) => Promise<void>;
    moveCalendarItem: (itemId: string | number, itemType: 'task' | 'note', newDate: string) => Promise<void>;
    reorderDailyTasks: (reorderedTasks: CalendarTask[]) => Promise<void>;
    reorderCalendarTasks: (reorderedTasks: CalendarTask[]) => Promise<void>;
    reorderDailyStickyNotes: (reorderedNotes: CalendarStickyNote[]) => Promise<void>;
    onSetReminder: (item: Order | Task | CalendarTask, type: 'order' | 'task' | 'calendarTask') => void;
    aiSettings?: AISettings;
    onOpenDailyView: (date: string) => void;
    onOrderClick: (order: Order) => void;
    onProjectTaskClick: (task: Task) => void;
    calendarLists?: CalendarList[];
    addCalendarList?: (name: string, color: string, icon: string) => Promise<string>;
    updateCalendarList?: (listId: string, updates: Partial<CalendarList>) => Promise<void>;
    deleteCalendarList?: (listId: string) => Promise<void>;
    reorderCalendarLists?: (reorderedLists: CalendarList[]) => Promise<void>;
}

type EventType = 'order_loading' | 'order_payment' | 'project_task' | 'calendar_task' | 'calendar_note';
type CalendarTab = 'calendar' | 'reminders' | 'notes';
type SortOption = 'manual' | 'date' | 'title';
type ViewMode = 'month' | 'week' | 'agenda' | 'timeline' | 'day_timeline';
type TimelineRange = '3M' | '6M' | '1Y';
type TimelineResolution = 'day' | 'week' | 'month';

interface CalendarEvent {
    id: string;
    type: EventType;
    item: Order | Task | CalendarTask | CalendarStickyNote;
    date: string;
    order?: number;
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
    high: 'bg-red-500',
    medium: 'bg-amber-500',
    low: 'bg-blue-500'
};

// --- MiniNavigator Grid (Enhanced with Drag/Drop and Event Heatmap) ---
const MiniMonthNavigator: React.FC<{ 
    currentDate: Date, 
    setCurrentDate: (d: Date) => void,
    onDateSelect: (d: Date) => void, 
    isJalali: boolean,
    allEventsByDate: Record<string, CalendarEvent[]>,
    onItemDrop: (e: React.DragEvent, date: string) => void
}> = ({ currentDate, setCurrentDate, onDateSelect, isJalali, allEventsByDate, onItemDrop }) => {
    const { t, i18n } = useTranslation();
    const [isMinimized, setIsMinimized] = useState(false);
    const [localDragOver, setLocalDragOver] = useState<string | null>(null);

    const changeMonth = (delta: number) => {
        const newDate = new Date(currentDate);
        if (isJalali) {
            const jd = jalaali.toJalaali(newDate.getFullYear(), newDate.getMonth() + 1, newDate.getDate());
            let newM = jd.jm + delta;
            let newY = jd.jy;
            if (newM > 12) { newM = 1; newY++; }
            if (newM < 1) { newM = 12; newY--; }
            const g = jalaali.toGregorian(newY, newM, 1);
            setCurrentDate(new Date(g.gy, g.gm - 1, g.gd));
        } else {
            newDate.setMonth(newDate.getMonth() + delta);
            setCurrentDate(newDate);
        }
    };

    const days = useMemo(() => {
        const grid = [];
        if (isJalali) {
            const jd = jalaali.toJalaali(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            const gFirst = jalaali.toGregorian(jd.jy, jd.jm, 1);
            const first = new Date(Date.UTC(gFirst.gy, gFirst.gm - 1, gFirst.gd));
            const pad = (first.getUTCDay() + 1) % 7; 
            for(let i=0; i<pad; i++) grid.push(null);
            const len = jalaali.jalaaliMonthLength(jd.jy, jd.jm);
            for(let i=1; i<=len; i++) {
                const g = jalaali.toGregorian(jd.jy, jd.jm, i);
                grid.push(new Date(Date.UTC(g.gy, g.gm-1, g.gd)));
            }
        } else {
            const first = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), 1));
            const pad = (first.getUTCDay() + 6) % 7;
            for(let i=0; i<pad; i++) grid.push(null);
            const len = new Date(currentDate.getUTCFullYear(), currentDate.getUTCMonth() + 1, 0).getDate();
            for(let i=1; i<=len; i++) grid.push(new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), i)));
        }
        return grid;
    }, [currentDate, isJalali]);

    const headerLabel = useMemo(() => {
        if (isJalali) {
            const jd = jalaali.toJalaali(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            return `${t(`months.jalali.${jd.jm}`)} ${jd.jy}`;
        }
        return currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }, [currentDate, isJalali, t]);

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-x-2">
                    <button onClick={() => setIsMinimized(!isMinimized)} className="p-1 rounded hover:bg-slate-200 text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isMinimized ? '-rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <span className="text-xs font-black text-slate-800 tracking-tight">{headerLabel}</span>
                </div>
                {!isMinimized && (
                    <div className="flex items-center gap-x-1">
                        <button onClick={() => changeMonth(-1)} className="p-1 rounded-full hover:bg-white text-indigo-600 transition-colors">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M12.707 14.707a1 1 0 010-1.414L9.414 10l3.293-3.293a1 1 0 011.414 1.414l-4 4a1 1 0 010 1.414l4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                             </svg>
                        </button>
                        <button onClick={() => setCurrentDate(new Date())} className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 hover:border-indigo-500 transition-all">{t('common.today')}</button>
                        <button onClick={() => changeMonth(1)} className="p-1 rounded-full hover:bg-white text-indigo-600 transition-colors">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                             </svg>
                        </button>
                    </div>
                )}
            </div>
            
            {!isMinimized && (
                <div className="p-2 select-none bg-white">
                    <div className="grid grid-cols-7 gap-px text-[9px] text-center font-black text-slate-400 uppercase mb-2">
                        {isJalali ? ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((d, i) => <div key={i}>{d}</div>) : ['S','M','T','W','T','F','S'].map((d, i) => <div key={i}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {days.map((day, i) => {
                            const dateStr = day ? day.toISOString().split('T')[0] : '';
                            const events = allEventsByDate[dateStr] || [];
                            const hasLoad = events.some(e => e.type === 'order_loading');
                            const hasPay = events.some(e => e.type === 'order_payment');
                            const hasTask = events.some(e => e.type === 'calendar_task' || e.type === 'project_task');
                            const isToday = day && dateStr === new Date().toISOString().split('T')[0];
                            const isSelected = day && dateStr === currentDate.toISOString().split('T')[0];

                            return (
                                <div 
                                    key={i} 
                                    onClick={() => day && onDateSelect(day)}
                                    onDragOver={(e) => { e.preventDefault(); if(day) setLocalDragOver(dateStr); }}
                                    onDragLeave={() => setLocalDragOver(null)}
                                    onDrop={(e) => { setLocalDragOver(null); if(day) onItemDrop(e, dateStr); }}
                                    className={`relative h-9 w-full flex flex-col items-center justify-center text-[11px] rounded-lg cursor-pointer transition-all ${!day ? 'invisible' : isSelected ? 'bg-indigo-600 text-white shadow-md' : isToday ? 'bg-red-50 text-red-600 border border-red-200' : 'hover:bg-slate-100 text-slate-700'} ${localDragOver === dateStr ? 'bg-indigo-100 ring-2 ring-indigo-500 scale-110 z-10' : ''}`}
                                >
                                    <span className={`font-bold ${isSelected ? 'text-white' : ''}`}>
                                        {day ? (isJalali ? jalaali.toJalaali(day.getFullYear(), day.getMonth() + 1, day.getDate()).jd : day.getUTCDate()) : ''}
                                    </span>
                                    {/* Event Dots (Heatmap) */}
                                    <div className="absolute bottom-1 flex gap-0.5">
                                        {hasLoad && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />}
                                        {hasPay && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-500'}`} />}
                                        {hasTask && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-indigo-400'}`} />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- QuickLookCard Component ---
const QuickLookCard: React.FC<{ 
    order: Order; 
    position: { x: number; y: number }; 
    t: any;
}> = ({ order, position, t }) => {
    const totalValue = useMemo(() => {
        return order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [order.items]);
    
    const itemSummary = useMemo(() => {
        const names = order.items.slice(0, 3).map(i => i.productName);
        if (order.items.length > 3) {
            names.push('...');
        }
        return names.join(', ');
    }, [order.items]);

    const numberFormatter = new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 });

    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    
    const cardHeightApprox = 150;
    const cardWidth = 288;
    const gap = 15;

    let topPos = position.y + gap;
    let leftPos = position.x + gap;

    if (position.y > viewportHeight / 2) {
        topPos = position.y - cardHeightApprox - gap;
    }

    if (leftPos + cardWidth > viewportWidth) {
        leftPos = position.x - cardWidth - gap;
    }
    
    if (topPos < 10) topPos = 10;
    if (leftPos < 10) leftPos = 10;

    return (
        <div 
            style={{ top: topPos, left: leftPos }} 
            className="fixed z-[100] w-72 bg-white p-4 rounded-lg shadow-xl border border-slate-200 pointer-events-none text-sm"
        >
            <h4 className="font-bold text-slate-800 border-b pb-2 mb-2 text-base">{order.id}</h4>
            <div className="space-y-1.5">
               <p className="flex justify-between">
                   <span className="text-slate-500 font-medium">{t('labels.supplier')}:</span> 
                   <span className="text-slate-800 truncate ml-2">{order.supplier}</span>
               </p>
               <p className="flex justify-between">
                   <span className="text-slate-500 font-medium">{t('labels.totalValue')}:</span> 
                   <span className="text-green-600 font-mono font-bold">{numberFormatter.format(totalValue)} {order.currency}</span>
               </p>
               <p className="flex justify-between">
                   <span className="text-slate-500 font-medium">{t('labels.status')}:</span> 
                   <span className="text-indigo-600 font-medium">{t(`statuses.${order.status}`, { defaultValue: order.status })}</span>
               </p>
               <div className="pt-1">
                   <span className="text-slate-500 font-medium block mb-0.5">{t('common.lineItems')}:</span> 
                   <p className="text-slate-700 text-xs leading-relaxed">{itemSummary}</p>
               </div>
            </div>
        </div>
    );
};

// --- PrintOptionsModal ---
interface PrintOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPrint: (options: PrintOptions) => void;
    onCopyToClipboard: (options: PrintOptions) => void;
}

interface PrintOptions {
    startDate: string;
    endDate: string;
    includeOrders: boolean;
    includeTasks: boolean;
    includeReminders: boolean;
    includeNotes: boolean;
}

const PrintOptionsModal: React.FC<PrintOptionsModalProps> = ({ isOpen, onClose, onPrint, onCopyToClipboard }) => {
    const { t } = useTranslation();
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
    });
    const [options, setOptions] = useState({
        includeOrders: true,
        includeTasks: true,
        includeReminders: true,
        includeNotes: true
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-gray-800">Print & Share Options</h2>
                </header>
                <main className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                             <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
                             <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-sm" />
                         </div>
                         <div>
                             <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                             <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-white border border-slate-300 rounded p-1.5 text-sm" />
                         </div>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Include</p>
                        <label className="flex items-center gap-x-2"><input type="checkbox" checked={options.includeOrders} onChange={e => setOptions(p => ({...p, includeOrders: e.target.checked}))} /> Orders (Loadings & Payments)</label>
                        <label className="flex items-center gap-x-2"><input type="checkbox" checked={options.includeTasks} onChange={e => setOptions(p => ({...p, includeTasks: e.target.checked}))} /> Project Tasks</label>
                        <label className="flex items-center gap-x-2"><input type="checkbox" checked={options.includeReminders} onChange={e => setOptions(p => ({...p, includeReminders: e.target.checked}))} /> Calendar Reminders</label>
                        <label className="flex items-center gap-x-2"><input type="checkbox" checked={options.includeNotes} onChange={e => setOptions(p => ({...p, includeNotes: e.target.checked}))} /> Notes</label>
                    </div>
                </main>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3">
                    <button onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                    <button onClick={() => onCopyToClipboard({ startDate, endDate, ...options })} className="bg-white border border-indigo-600 text-indigo-600 px-4 py-2 rounded-md hover:bg-indigo-50">Copy List</button>
                    <button onClick={() => onPrint({ startDate, endDate, ...options })} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">Print Preview</button>
                </footer>
            </div>
        </div>
    );
};


// --- Reminders Layout Components ---
interface SmartListCardProps {
    title: string;
    count: number;
    isActive: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    color: string;
    onContextMenu?: (e: React.MouseEvent) => void;
}

const SmartListCard: React.FC<SmartListCardProps> = ({ title, count, isActive, onClick, icon, color, onContextMenu }) => {
    const isHex = color.startsWith('#');
    const iconBgStyle = isHex ? { backgroundColor: color } : {};
    const iconBgClass = isHex ? '' : color; 

    return (
        <div 
            onClick={onClick}
            onContextMenu={onContextMenu}
            className={`rounded-lg p-3 flex flex-col justify-between h-20 cursor-pointer transition-all ${isActive ? 'bg-slate-200 ring-2 ring-slate-400 shadow-sm' : 'bg-slate-100 hover:bg-slate-200'}`}
        >
            <div className="flex justify-between items-start">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm shadow-sm ${iconBgClass}`} style={iconBgStyle}>
                    {typeof icon === 'string' ? icon : icon}
                </div>
                <span className="text-2xl font-bold text-slate-800">{count}</span>
            </div>
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide mt-1 truncate" title={title}>{title}</span>
        </div>
    );
};

const RemindersLayout: React.FC<{
    orders: Order[];
    tasks: Task[];
    calendarTasks: CalendarTask[];
    calendarLists: CalendarList[];
    allEventsByDate: Record<string, CalendarEvent[]>;
    onItemDropOnCalendar: (e: React.DragEvent, date: string) => void;
    onSetReminder: (item: any, type: any) => void;
    onTaskClick: (task: Task) => void;
    onOrderClick: (order: Order) => void;
    onAddTask: (date: string, title: string, categoryId?: string) => Promise<number>;
    onUpdateTask: (id: number, updates: Partial<CalendarTask>) => void;
    onUpdateProjectTask: (id: string, updates: Partial<Task>) => void;
    onUpdateList: (id: string, updates: Partial<CalendarList>) => Promise<void>;
    onDeleteList: (id: string) => Promise<void>;
    onReorderLists: (lists: CalendarList[]) => Promise<void>;
    onReorderTasks: (tasks: CalendarTask[]) => Promise<void>;
    onDeleteTask: (id: number) => void;
    setHoverInfo: (info: { order: Order, x: number, y: number } | null) => void;
    currentDate: Date;
    setCurrentDate: (d: Date) => void;
}> = ({ orders, tasks, calendarTasks, calendarLists, allEventsByDate, onItemDropOnCalendar, onSetReminder, onTaskClick, onOrderClick, onAddTask, onUpdateTask, onUpdateProjectTask, onUpdateList, onDeleteList, onReorderLists, onReorderTasks, onDeleteTask, setHoverInfo, currentDate, setCurrentDate }) => {
    const { t, i18n } = useTranslation();
    const { showConfirmation, addToast } = useModals();
    const [selectedListId, setSelectedListId] = useState<string>('smart-today'); 
    const [searchQuery, setSearchQuery] = useState('');
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [showCompleted, setShowCompleted] = useState(false);
    
    // List Modal State (Add/Edit)
    const [isListModalOpen, setIsListModalOpen] = useState(false);
    const [listToEdit, setListToEdit] = useState<CalendarList | null>(null);
    const [modalListName, setModalListName] = useState('');
    const [modalListIcon, setModalListIcon] = useState('📝');
    const [modalListColor, setModalListColor] = useState('#3b82f6');
    
    const [sortOption, setSortOption] = useState<SortOption>('manual');
    const [draggedListId, setDraggedListId] = useState<string | null>(null);
    const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
    const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
    const [dragOverListId, setDragOverListId] = useState<string | null>(null);
    
    // List Context Menu
    const [listContextMenu, setListContextMenu] = useState<{ visible: boolean, x: number, y: number, list: CalendarList } | null>(null);
    const listContextMenuRef = useRef<HTMLDivElement>(null);

    // Editable state for tasks
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const editInputRef = useRef<HTMLInputElement>(null);

    const todayStr = new Date().toISOString().split('T')[0];
    const safeCalendarLists = Array.isArray(calendarLists) ? calendarLists : [];
    
    const pinnedLists = safeCalendarLists.filter(l => l.isPinned);
    const unpinnedLists = safeCalendarLists.filter(l => !l.isPinned);

    // Reorder enabled only if manually sorting a custom list (not smart list)
    const canReorderTasks = !selectedListId.startsWith('smart-') && sortOption === 'manual';

    useEffect(() => {
        if (editingItemId && editInputRef.current) {
            editInputRef.current.focus();
        }
    }, [editingItemId]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (listContextMenu && listContextMenuRef.current && !listContextMenuRef.current.contains(event.target as Node)) {
                setListContextMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [listContextMenu]);

    const allReminders = useMemo(() => {
        const list: { id: string, title: string, date?: string, isDone: boolean, type: 'order' | 'task' | 'calendarTask', raw: any, isFlagged: boolean, categoryId?: string, order: number, priority?: TaskPriority }[] = [];
        
        orders.forEach(o => {
            if (o.approxLoadingDate) {
                const isOverdue = o.approxLoadingDate < todayStr;
                list.push({ id: `ord-load-${o.id}`, title: `${t('reminders.reminderFor')} Order ${o.id}: Loading`, date: o.approxLoadingDate, isDone: o.isArchived || o.status === 'Delivered', type: 'order', raw: o, isFlagged: isOverdue, order: 0 });
            } else {
                list.push({ id: `ord-load-unsched-${o.id}`, title: `${t('reminders.reminderFor')} Order ${o.id}: Loading (Unscheduled)`, isDone: o.isArchived, type: 'order', raw: o, isFlagged: false, order: 0 });
            }
            if (o.purchaseType === 'credit' && o.creditPaymentDueDate) {
                const isOverdue = o.creditPaymentDueDate < todayStr;
                list.push({ id: `ord-pay-${o.id}`, title: `${t('reminders.reminderFor')} Order ${o.id}: Payment`, date: o.creditPaymentDueDate, isDone: o.isArchived, type: 'order', raw: o, isFlagged: isOverdue, order: 0 });
            }
        });

        tasks.forEach(t => {
            const isOverdue = t.dueDate ? t.dueDate < todayStr : false;
            const isFlagged = (t.weight && t.weight > 5) || isOverdue;
            list.push({ id: `task-${t.id}`, title: t.title, date: t.dueDate, isDone: false, type: 'task', raw: t, isFlagged: !!isFlagged, order: 0 }); 
        });

        calendarTasks.forEach(ct => {
            list.push({ id: `cal-${ct.id}`, title: ct.title, date: ct.date, isDone: ct.isDone, type: 'calendarTask', raw: ct, isFlagged: !!ct.isFlagged, categoryId: ct.categoryId, order: ct.order, priority: ct.priority });
        });

        return list;
    }, [orders, tasks, calendarTasks, todayStr, t]);

    const getTaskCount = (listId: string) => {
        if (!listId.startsWith('smart-')) {
            return calendarTasks.filter(t => t.categoryId === listId && !t.isDone).length;
        }
        return 0;
    };

    const stats = useMemo(() => {
        return {
            today: allReminders.filter(r => r.date === todayStr && !r.isDone).length,
            scheduled: allReminders.filter(r => r.date && r.date > todayStr && !r.isDone).length,
            all: allReminders.filter(r => !r.isDone).length,
            flagged: allReminders.filter(r => r.isFlagged && !r.isDone).length,
            unscheduled: allReminders.filter(r => !r.date && !r.isDone).length,
        }
    }, [allReminders, todayStr]);

    const filteredReminders = useMemo(() => {
        let filtered = allReminders;

        if (searchQuery.trim()) {
            const lowerQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(r => r.title.toLowerCase().includes(lowerQuery));
        }

        if (selectedListId.startsWith('smart-')) {
            const filterType = selectedListId.replace('smart-', '');
            switch (filterType) {
                case 'today': return filtered.filter(r => r.date === todayStr);
                case 'scheduled': return filtered.filter(r => r.date && r.date > todayStr);
                case 'flagged': return filtered.filter(r => r.isFlagged);
                case 'unscheduled': return filtered.filter(r => !r.date);
                case 'all': 
                default: return filtered;
            }
        } else {
            return filtered.filter(r => r.categoryId === selectedListId);
        }
    }, [allReminders, selectedListId, todayStr, searchQuery]);
    
    const activeReminders = useMemo(() => filteredReminders.filter(r => !r.isDone), [filteredReminders]);
    const completedReminders = useMemo(() => filteredReminders.filter(r => r.isDone), [filteredReminders]);

    const sortList = (items: typeof allReminders) => {
        const list = [...items];
        if (selectedListId.startsWith('smart-')) {
             return list.sort((a, b) => {
                const dateA = a.date || '9999-99-99';
                const dateB = b.date || '9999-99-99';
                return dateA.localeCompare(dateB);
            });
        }

        switch (sortOption) {
            case 'date':
                return list.sort((a, b) => {
                     const dateA = a.date || '9999-99-99';
                     const dateB = b.date || '9999-99-99';
                     if (dateA !== dateB) return dateA.localeCompare(dateB);
                     return a.order - b.order;
                });
            case 'title':
                return list.sort((a, b) => a.title.localeCompare(b.title));
            case 'manual':
            default:
                return list.sort((a, b) => a.order - b.order);
        }
    };
    
    const sortedActiveReminders = useMemo(() => sortList(activeReminders), [activeReminders, sortOption, selectedListId]);
    const sortedCompletedReminders = useMemo(() => sortList(completedReminders), [completedReminders, sortOption, selectedListId]);

    const handleAddTaskSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskTitle.trim()) return;
        
        let dateForTask = '';
        let categoryId: string | undefined = undefined;

        if (selectedListId === 'smart-today') {
            dateForTask = todayStr;
        } else if (selectedListId === 'smart-scheduled') {
             const tomorrow = new Date();
             tomorrow.setDate(tomorrow.getDate() + 1);
             dateForTask = tomorrow.toISOString().split('T')[0];
        } else if (selectedListId === 'smart-unscheduled') {
            dateForTask = ''; 
        } else if (!selectedListId.startsWith('smart-')) {
            categoryId = selectedListId;
        }

        await onAddTask(dateForTask, newTaskTitle.trim(), categoryId);
        setNewTaskTitle('');
    };
    
    const openAddListModal = () => {
        setListToEdit(null);
        setModalListName('');
        setModalListIcon('📝');
        setModalListColor('#3b82f6');
        setIsListModalOpen(true);
    };
    
    const handleEditList = (list: CalendarList) => {
        setListToEdit(list);
        setModalListName(list.name);
        setModalListIcon(list.icon);
        setModalListColor(list.color);
        setIsListModalOpen(true);
        setListContextMenu(null);
    };

    const handleListModalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (modalListName.trim()) {
            if (listToEdit) {
                await onUpdateList(listToEdit.id, {
                    name: modalListName.trim(),
                    icon: modalListIcon,
                    color: modalListColor
                });
            } else {
                // Assuming handleAddList would be passed here if needed, but for simplicity we rely on re-renders
            }
            setIsListModalOpen(false);
        }
    };

    const handleDeleteList = (listId: string) => {
        showConfirmation({
            title: t('confirmationModal.deleteItemTitle'),
            message: t('confirmationModal.deleteItemBody'),
            variant: 'destructive',
            onConfirm: () => {
                 onDeleteList(listId);
                 if (selectedListId === listId) setSelectedListId('smart-today');
            }
        });
        setListContextMenu(null);
    };
    
    const handlePinList = (list: CalendarList) => {
        onUpdateList(list.id, { isPinned: !list.isPinned });
        setListContextMenu(null);
    };
    
    const handleToggleFlag = (item: typeof allReminders[0]) => {
        if (item.type === 'task') {
            const currentWeight = (item.raw as Task).weight || 0;
            onUpdateProjectTask((item.raw as Task).id, { weight: currentWeight > 5 ? 0 : 10 });
        } else if (item.type === 'calendarTask') {
            onUpdateTask((item.raw as CalendarTask).id, { isFlagged: !item.isFlagged });
        }
    };

    const handleCyclePriority = (item: typeof allReminders[0]) => {
        if (item.type !== 'calendarTask') return;
        const current = item.priority || 'low';
        const sequence: TaskPriority[] = ['low', 'medium', 'high'];
        const next = sequence[(sequence.indexOf(current) + 1) % sequence.length];
        onUpdateTask((item.raw as CalendarTask).id, { priority: next });
    };

    const handleEditStart = (item: typeof allReminders[0]) => {
        if (item.type === 'calendarTask' || item.type === 'task') {
            setEditingItemId(item.id);
            setEditTitle(item.title);
        }
    };

    const handleEditSave = () => {
        if (!editingItemId) return;
        
        const item = allReminders.find(r => r.id === editingItemId);
        if (item && editTitle.trim() !== item.title) {
            if (item.type === 'calendarTask') {
                onUpdateTask((item.raw as CalendarTask).id, { title: editTitle.trim() });
            } else if (item.type === 'task') {
                onUpdateProjectTask((item.raw as Task).id, { title: editTitle.trim() });
            }
        }
        setEditingItemId(null);
        setEditTitle('');
    };

    const handleEditCancel = () => {
        setEditingItemId(null);
        setEditTitle('');
    };

    const handleListDragStart = (e: React.DragEvent, listId: string) => {
        setDraggedListId(listId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', listId);
    };

    const handleListDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleListContextMenu = (e: React.MouseEvent, list: CalendarList) => {
        e.preventDefault();
        e.stopPropagation();
        setListContextMenu({ visible: true, x: e.clientX, y: e.clientY, list });
    };

    const handleSidebarListDrop = async (e: React.DragEvent, targetListId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverListId(null);

        if (draggedTaskId) {
            const rawIdStr = draggedTaskId.replace('cal-', '');
            const rawId = parseInt(rawIdStr, 10);
            
            if (draggedTaskId.startsWith('cal-') && !isNaN(rawId)) {
                 if (!targetListId.startsWith('smart-')) {
                     const task = calendarTasks.find(t => t.id === rawId);
                     if (task && task.categoryId !== targetListId) {
                         await onUpdateTask(rawId, { categoryId: targetListId });
                         addToast(t('toasts.orderUpdated'), 'success'); 
                     }
                 } else {
                     const type = targetListId.replace('smart-', '');
                     const updates: Partial<CalendarTask> = {};
                     if (type === 'today') {
                         updates.date = todayStr;
                     } else if (type === 'scheduled') {
                         const tomorrow = new Date();
                         tomorrow.setDate(tomorrow.getDate() + 1);
                         updates.date = tomorrow.toISOString().split('T')[0];
                     } else if (type === 'flagged') {
                         updates.isFlagged = true;
                     } else if (type === 'unscheduled') {
                         updates.date = ''; 
                     }
                     if (Object.keys(updates).length > 0) {
                         await onUpdateTask(rawId, updates);
                         addToast(t('toasts.orderUpdated'), 'success');
                     }
                 }
            }
            setDraggedTaskId(null);
            return;
        }

        if (draggedListId && draggedListId !== targetListId) {
             const currentIndex = safeCalendarLists.findIndex(l => l.id === draggedListId);
             const targetIndex = safeCalendarLists.findIndex(l => l.id === targetListId);

             if (currentIndex === -1 || targetIndex === -1) return;

             const newLists = [...safeCalendarLists];
             const [draggedItem] = newLists.splice(currentIndex, 1);
             newLists.splice(targetIndex, 0, draggedItem);

             await onReorderLists(newLists);
             setDraggedListId(null);
        }
    };

    const handleSidebarDragOver = (e: React.DragEvent, listId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedTaskId || (draggedListId && draggedListId !== listId)) {
             setDragOverListId(listId);
        }
    };
    
    const handleSidebarDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverListId(null);
    }

    const handleTaskDragStart = (e: React.DragEvent, taskId: string) => {
        setDraggedTaskId(taskId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskId);
        
        // Pass source info for calendar drops
        const item = allReminders.find(r => r.id === taskId);
        if (item) {
            e.dataTransfer.setData('itemType', item.type === 'calendarTask' ? 'calendar_task' : (item.type === 'order' ? 'order_loading' : 'project_task'));
            e.dataTransfer.setData('itemId', String(item.raw.id));
            e.dataTransfer.setData('sourceDate', item.date || '');
        }

        const el = e.target as HTMLElement;
        setTimeout(() => { el.style.opacity = '0.5'; }, 0);
    };

    const handleTaskDragEnd = (e: React.DragEvent) => {
        const el = e.target as HTMLElement;
        el.style.opacity = '1';
        setDraggedTaskId(null);
        setDragOverTaskId(null);
    };
    
    const handleTaskDragOver = (e: React.DragEvent, taskId: string) => {
        if (!canReorderTasks || !draggedTaskId || draggedTaskId === taskId) return;
        e.preventDefault();
        setDragOverTaskId(taskId);
    };

    const handleTaskDrop = async (e: React.DragEvent, targetTaskId: string) => {
        e.preventDefault();
        if (!canReorderTasks || !draggedTaskId || draggedTaskId === targetTaskId) return;

        const rawDragId = draggedTaskId.replace('cal-', '');
        const rawTargetId = targetTaskId.replace('cal-', '');
        
        const currentListTasks = sortedActiveReminders.filter(r => r.type === 'calendarTask').map(r => r.raw as CalendarTask);
        
        const fromIndex = currentListTasks.findIndex(t => String(t.id) === rawDragId);
        const toIndex = currentListTasks.findIndex(t => String(t.id) === rawTargetId);

        if (fromIndex === -1 || toIndex === -1) return;

        const newTasks = [...currentListTasks];
        const [movedItem] = newTasks.splice(fromIndex, 1);
        newTasks.splice(toIndex, 0, movedItem);
        
        await onReorderTasks(newTasks);
        setDraggedTaskId(null);
        setDragOverTaskId(null);
    };

    const getListTitle = () => {
        if (selectedListId.startsWith('smart-')) {
            const type = selectedListId.replace('smart-', '');
            return t(`calendar.smartLists.${type}`);
        }
        const list = safeCalendarLists.find(l => l.id === selectedListId);
        return list ? list.name : 'Unknown List';
    };
    
    const handleShareList = async () => {
        const pendingTasks = sortedActiveReminders.filter(r => !r.isDone && r.type === 'calendarTask').map(r => r.raw as CalendarTask);
        if (pendingTasks.length === 0) {
            addToast(t('toasts.clipboard.noItems'), "info");
            return;
        }
        
        const listName = getListTitle();
        const text = formatReminderListForClipboard(listName, pendingTasks);
        
        try {
            await navigator.clipboard.writeText(text);
            addToast(t('toasts.clipboard.copied'), 'success');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            addToast(t('toasts.clipboard.copyError'), 'error');
        }
    };
    
    const renderReminderRow = (item: typeof allReminders[0]) => (
        <div 
            key={item.id}
            draggable={true}
            onDragStart={(e) => handleTaskDragStart(e, item.id)}
            onDragEnd={handleTaskDragEnd}
            onDragOver={(e) => handleTaskDragOver(e, item.id)}
            onDrop={(e) => handleTaskDrop(e, item.id)}
            onMouseEnter={(e) => {
                if (item.type === 'order') {
                        setHoverInfo({ order: item.raw as Order, x: e.clientX, y: e.clientY });
                }
            }}
            onMouseLeave={() => setHoverInfo(null)}
            className={`group flex items-center gap-x-1.5 py-3 px-3 rounded-xl transition-all ${item.isDone ? 'opacity-60' : ''} ${dragOverTaskId === item.id ? 'border-t-2 border-indigo-500' : 'hover:bg-slate-50 border border-transparent'}`}
        >
            <button 
                onClick={() => {
                    if (item.type === 'calendarTask') {
                        onUpdateTask((item.raw as CalendarTask).id, { isDone: !item.isDone });
                    }
                }}
                disabled={item.type !== 'calendarTask'}
                className={`flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${item.isDone ? 'bg-indigo-50 border-indigo-500 scale-105' : 'border-slate-300 hover:border-indigo-500'}`}
            >
                {item.isDone && <svg className="w-3 h-3 text-white fill-current" viewBox="0 0 20 20"><path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/></svg>}
            </button>
            
            <div className="flex-1 min-w-0 cursor-pointer" onDoubleClick={() => handleEditStart(item)}>
                <div className="flex items-center gap-x-1.5">
                    {item.type === 'calendarTask' && (
                        <button 
                            onClick={() => handleCyclePriority(item)}
                            className={`mt-1.5 w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${PRIORITY_COLORS[item.priority || 'low']}`}
                            title={`Priority: ${item.priority || 'low'}`}
                        />
                    )}
                    {editingItemId === item.id ? (
                        <input 
                            ref={editInputRef}
                            type="text" 
                            value={editTitle} 
                            onChange={e => setEditTitle(e.target.value)} 
                            onBlur={handleEditSave}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleEditSave();
                                if (e.key === 'Escape') handleEditCancel();
                            }}
                            className="w-full bg-white border border-indigo-500 rounded px-1 py-0.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            autoFocus
                        />
                    ) : (
                        <span className={`text-base ${item.isDone ? 'text-slate-400 line-through' : 'text-slate-800 font-medium'}`}>{item.title}</span>
                    )}
                    {item.isFlagged && <span className="text-orange-500 text-xs">🚩</span>}
                </div>
                {item.date && <p className={`text-xs font-medium mt-0.5 ${item.date < todayStr && !item.isDone ? 'text-red-500' : 'text-slate-400'}`}>{formatDisplayDate(item.date, i18n.language)}</p>}
            </div>

            <div className="flex items-center gap-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(item.type === 'task' || item.type === 'calendarTask') && (
                    <button 
                        onClick={() => handleToggleFlag(item)}
                        className={`p-2 rounded-lg transition-colors ${item.isFlagged ? 'text-orange-500 bg-orange-50 hover:bg-orange-100' : 'text-slate-300 hover:text-orange-400 hover:bg-slate-100'}`}
                        title={item.isFlagged ? "Unflag" : "Flag"}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01-.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0v-1a1 1 0 01.293.707z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}
                
                    {item.type === 'order' && (
                    <div className="relative group/tooltip inline-block">
                        <button className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                    )}

                <button onClick={() => onSetReminder(item.raw, item.type)} className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors" title={t('reminders.setReminder') as string}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                </button>
                    {item.type === 'calendarTask' && (
                    <button 
                        onClick={() => onDeleteTask((item.raw as CalendarTask).id)} 
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Task"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                )}
            </div>
        </div>
    );
    
    return (
        <div className="flex h-full bg-white rounded-lg overflow-hidden border border-slate-200">
            {/* Sidebar with Mini Navigator */}
            <div className="w-72 bg-slate-50 border-r border-slate-200 flex flex-col">
                <div className="p-3">
                    <input 
                        type="search" 
                        placeholder={t('calendar.searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-700 placeholder:text-slate-400 shadow-sm" 
                    />
                </div>

                {/* Mini Month Navigator */}
                <div className="px-3 border-b border-slate-200 pb-4 mb-2">
                    <MiniMonthNavigator 
                        isJalali={i18n.language.startsWith('fa')} 
                        currentDate={currentDate} 
                        setCurrentDate={setCurrentDate}
                        onDateSelect={setCurrentDate}
                        allEventsByDate={allEventsByDate}
                        onItemDrop={onItemDropOnCalendar}
                    />
                </div>
                
                <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
                    <div className="grid grid-cols-2 gap-2 mt-2 mb-6">
                        <div onDragOver={(e) => handleSidebarDragOver(e, 'smart-today')} onDrop={(e) => handleSidebarListDrop(e, 'smart-today')} onDragLeave={handleSidebarDragLeave} className={dragOverListId === 'smart-today' ? 'ring-2 ring-indigo-500 rounded-lg' : ''}>
                            <SmartListCard title={t('calendar.smartLists.today')} count={stats.today} isActive={selectedListId === 'smart-today'} onClick={() => setSelectedListId('smart-today')} icon="📅" color="bg-blue-500" />
                        </div>
                        <div onDragOver={(e) => handleSidebarDragOver(e, 'smart-scheduled')} onDrop={(e) => handleSidebarListDrop(e, 'smart-scheduled')} onDragLeave={handleSidebarDragLeave} className={dragOverListId === 'smart-scheduled' ? 'ring-2 ring-indigo-500 rounded-lg' : ''}>
                            <SmartListCard title={t('calendar.smartLists.scheduled')} count={stats.scheduled} isActive={selectedListId === 'smart-scheduled'} onClick={() => setSelectedListId('smart-scheduled')} icon="🗓️" color="bg-red-500" />
                        </div>
                         <div onDragOver={(e) => handleSidebarDragOver(e, 'smart-unscheduled')} onDrop={(e) => handleSidebarListDrop(e, 'smart-unscheduled')} onDragLeave={handleSidebarDragLeave} className={dragOverListId === 'smart-unscheduled' ? 'ring-2 ring-indigo-500 rounded-lg' : ''}>
                            <SmartListCard title={t('calendar.smartLists.unscheduled')} count={stats.unscheduled} isActive={selectedListId === 'smart-unscheduled'} onClick={() => setSelectedListId('smart-unscheduled')} icon="⌛" color="bg-amber-500" />
                        </div>
                        <div onDragOver={(e) => handleSidebarDragOver(e, 'smart-all')} onDrop={(e) => handleSidebarListDrop(e, 'smart-all')} onDragLeave={handleSidebarDragLeave} className={dragOverListId === 'smart-all' ? 'ring-2 ring-indigo-500 rounded-lg' : ''}>
                            <SmartListCard title={t('calendar.smartLists.all')} count={stats.all} isActive={selectedListId === 'smart-all'} onClick={() => setSelectedListId('smart-all')} icon="📥" color="bg-slate-600" />
                        </div>
                        <div onDragOver={(e) => handleSidebarDragOver(e, 'smart-flagged')} onDrop={(e) => handleSidebarListDrop(e, 'smart-flagged')} onDragLeave={handleSidebarDragLeave} className={dragOverListId === 'smart-flagged' ? 'ring-2 ring-indigo-500 rounded-lg' : ''}>
                            <SmartListCard title={t('calendar.smartLists.flagged')} count={stats.flagged} isActive={selectedListId === 'smart-flagged'} onClick={() => setSelectedListId('smart-flagged')} icon="🚩" color="bg-orange-500" />
                        </div>
                        {pinnedLists.map(list => (
                            <div 
                                key={list.id} 
                                onContextMenu={(e) => handleListContextMenu(e, list)}
                                onDragOver={(e) => handleSidebarDragOver(e, list.id)}
                                onDrop={(e) => handleSidebarListDrop(e, list.id)}
                                onDragLeave={handleSidebarDragLeave}
                                className={dragOverListId === list.id ? 'ring-2 ring-indigo-500 rounded-lg' : ''}
                            >
                                <SmartListCard
                                    title={list.name}
                                    count={getTaskCount(list.id)}
                                    isActive={selectedListId === list.id}
                                    onClick={() => setSelectedListId(list.id)}
                                    icon={list.icon}
                                    color={list.color}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="space-y-1">
                         <h3 className="text-[10px] font-black text-slate-400 px-2 mb-2 uppercase tracking-widest flex justify-between items-center">
                             {t('calendar.myLists')}
                         </h3>
                         {unpinnedLists.map(list => (
                            <div
                                key={list.id}
                                draggable
                                onDragStart={(e) => handleListDragStart(e, list.id)}
                                onDragOver={(e) => { handleListDragOver(e); handleSidebarDragOver(e, list.id); }}
                                onDrop={(e) => handleSidebarListDrop(e, list.id)}
                                onDragLeave={handleSidebarDragLeave}
                                onClick={() => setSelectedListId(list.id)}
                                onContextMenu={(e) => handleListContextMenu(e, list)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group cursor-pointer ${selectedListId === list.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'} ${draggedListId === list.id ? 'opacity-50' : ''} ${dragOverListId === list.id ? 'bg-indigo-100 ring-1 ring-indigo-500' : ''}`}
                            >
                                <div className="flex items-center gap-x-3">
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-sm" style={{ backgroundColor: list.color + '20' }}>{list.icon}</div>
                                    <span>{list.name}</span>
                                </div>
                                <span className="text-slate-400 text-xs">{getTaskCount(list.id)}</span>
                            </div>
                        ))}
                    </div>
                </div>
                
                <div className="p-3 border-t border-slate-200">
                    <button onClick={openAddListModal} className="flex items-center gap-x-2 text-slate-600 hover:text-indigo-600 font-bold text-sm px-2 py-2 w-full hover:bg-slate-200 rounded-lg transition-all group">
                         <span className="text-lg bg-slate-300 text-slate-600 rounded-full w-6 h-6 flex items-center justify-center pb-0.5 shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-colors">+</span>
                         {t('calendar.addList')}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-0 bg-white relative">
                <header className="p-6 pb-4 flex justify-between items-end border-b border-slate-100">
                    <div>
                        <div className="flex items-center gap-x-2">
                             <h1 className={`text-3xl font-black flex items-center gap-x-2`} style={{ color: !selectedListId.startsWith('smart') ? safeCalendarLists.find(l => l.id === selectedListId)?.color : undefined }}>
                                 {!selectedListId.startsWith('smart') && <span>{safeCalendarLists.find(l => l.id === selectedListId)?.icon}</span>}
                                 {getListTitle()}
                            </h1>
                            <button onClick={handleShareList} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-full transition-colors" title={t('buttons.shareTooltip') as string}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 108.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg>
                            </button>
                        </div>
                        <p className="text-slate-400 text-sm font-medium mt-1 ml-1">{activeReminders.length} {t(activeReminders.length === 1 ? 'calendar.tasks' : 'calendar.tasks_plural', { count: activeReminders.length })}</p>
                    </div>
                    
                    {!selectedListId.startsWith('smart') && (
                        <div className="flex items-center gap-x-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase mr-2 tracking-widest">Sort By:</span>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                {(['manual', 'date', 'title'] as const).map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => setSortOption(opt)}
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${sortOption === opt ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        {t(`common.sortBy.${opt}`)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <div className="space-y-1">
                        {sortedActiveReminders.map(renderReminderRow)}
                        {sortedActiveReminders.length === 0 && sortedCompletedReminders.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                <p className="text-sm font-bold">{t('calendar.noReminders')}</p>
                            </div>
                        )}
                    </div>
                    
                     {sortedCompletedReminders.length > 0 && (
                        <div className="mt-8 pt-4 border-t border-slate-100">
                             <button 
                                onClick={() => setShowCompleted(!showCompleted)}
                                className="flex items-center gap-x-2 text-sm font-black text-slate-400 hover:text-slate-800 transition-colors mb-2 uppercase tracking-wide"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                                     <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                                {t('calendar.filters.completed')} ({sortedCompletedReminders.length})
                            </button>
                             {showCompleted && (
                                <div className="space-y-1">
                                    {sortedCompletedReminders.map(renderReminderRow)}
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Add Task Input */}
                <div className="p-4 bg-white border-t border-slate-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                     <form onSubmit={handleAddTaskSubmit} className="flex items-center gap-x-3 bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-all">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0 cursor-pointer hover:bg-indigo-600 hover:text-white transition-all shadow-sm" onClick={handleAddTaskSubmit}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                        </div>
                        <input 
                            type="text" 
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder={t('calendar.addTask')}
                            className="flex-1 bg-transparent border-none focus:ring-0 text-lg font-medium placeholder:text-slate-400 text-slate-800"
                        />
                    </form>
                </div>
            </div>

            {/* Add List Modal */}
            {isListModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4" onClick={() => setIsListModalOpen(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-8 pb-0">
                             <h3 className="text-2xl font-black text-gray-800 mb-8">{listToEdit ? 'Edit List' : t('calendar.newList')}</h3>
                             
                             <div className="flex justify-center mb-8">
                                 <div className="w-24 h-24 rounded-full bg-slate-50 shadow-inner flex items-center justify-center text-5xl border-4 border-white ring-4 ring-slate-100 transition-transform hover:scale-110" style={{ backgroundColor: modalListColor + '20' }}>
                                     {modalListIcon}
                                 </div>
                             </div>

                             <form onSubmit={handleListModalSubmit} className="space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">List Name</label>
                                    <input 
                                        type="text" 
                                        value={modalListName} 
                                        onChange={e => setModalListName(e.target.value)} 
                                        placeholder={t('calendar.listName') as string}
                                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-4 text-lg focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center font-black text-slate-800"
                                        autoFocus
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Icon</label>
                                        <IconPicker selectedIcon={modalListIcon} onSelect={setModalListIcon} />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Color</label>
                                        <input 
                                            type="color" 
                                            value={modalListColor} 
                                            onChange={e => setModalListColor(e.target.value)} 
                                            className="w-full h-[156px] rounded-xl border-2 border-slate-200 p-1 cursor-pointer bg-slate-50"
                                        />
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div className="p-8 mt-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-x-4">
                             <button type="button" onClick={() => setIsListModalOpen(false)} className="px-6 py-3 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors">{t('common.cancel')}</button>
                             <button type="button" onClick={handleListModalSubmit} disabled={!modalListName.trim()} className="px-8 py-3 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none transition-all transform active:scale-95">
                                 {listToEdit ? t('buttons.save') : t('common.add')}
                             </button>
                        </div>
                    </div>
                </div>
            )}

            {/* List Context Menu */}
            {listContextMenu && (
                 <div ref={listContextMenuRef} style={{ top: listContextMenu.y, left: listContextMenu.x }} className="fixed z-[90] bg-white shadow-2xl rounded-2xl border border-slate-100 p-1.5 min-w-[180px] animate-in zoom-in-95">
                    <ul className="text-sm font-bold text-slate-700">
                         <li>
                            <button onClick={() => handlePinList(listContextMenu.list)} className="w-full text-left px-4 py-2.5 hover:bg-slate-100 rounded-xl flex items-center gap-3">
                                <span className="text-lg">{listContextMenu.list.isPinned ? '📍' : '📌'}</span>
                                <span>{listContextMenu.list.isPinned ? 'Unpin List' : 'Pin List'}</span>
                            </button>
                        </li>
                         <li>
                            <button onClick={() => handleEditList(listContextMenu.list)} className="w-full text-left px-4 py-2.5 hover:bg-slate-100 rounded-xl flex items-center gap-3">
                                <span className="text-lg">✏️</span>
                                <span>Edit List</span>
                            </button>
                        </li>
                        <li className="h-px bg-slate-100 my-1.5 mx-2"></li>
                        <li>
                            <button onClick={() => handleDeleteList(listContextMenu.list.id)} className="w-full text-left px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-3">
                                <span className="text-lg">🗑️</span>
                                <span>Delete List</span>
                            </button>
                        </li>
                    </ul>
                </div>
            )}
        </div>
    );
};

const CalendarView: React.FC<CalendarViewProps> = (props) => {
    const { 
        orders, tasks, updateOrder, updateTask,
        calendarTasks, calendarStickyNotes, addCalendarTask, addCalendarTasks, addCalendarStickyNote, moveCalendarItem,
        updateCalendarTask, deleteCalendarTask, updateCalendarStickyNote, deleteCalendarStickyNote, reorderDailyStickyNotes,
        reorderDailyTasks, reorderCalendarTasks,
        onSetReminder, aiSettings, onOpenDailyView, onOrderClick, onProjectTaskClick,
        calendarLists = [], updateCalendarList, deleteCalendarList, reorderCalendarLists
    } = props;
    const { t, i18n } = useTranslation();
    const { showConfirmation, addToast } = useModals();
    const { settings } = useSettings();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [activeTab, setActiveTab] = useState<CalendarTab>('calendar');
    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [filters, setFilters] = useState({ payments: true, loadings: true, personal: true, completed: false });
    const [isUnscheduledSidebarOpen, setIsUnscheduledSidebarOpen] = useState(false);
    
    // --- New State for Expanded Days ---
    const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

    // State for Timeline specific features
    const [timelineRange, setTimelineRange] = useState<TimelineRange>('3M');
    const [timelineResolution, setTimelineResolution] = useState<TimelineResolution>('day');
    const [scrolledDate, setScrolledDate] = useState(currentDate);

    // State for List Sorting (Agenda and Day Timeline)
    const [listSortDirection, setListSortDirection] = useState<'asc' | 'desc'>('asc');

    const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; date: string | null }>({ visible: false, x: 0, y: 0, date: null });
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [isAiNoteModalOpen, setIsAiNoteModalOpen] = useState(false);
    const [dragOverDate, setDragOverDate] = useState<string | null>(null);
    const [dragOverEventId, setDragOverEventId] = useState<string | null>(null);
    const [isSidebarDragOver, setIsSidebarDragOver] = useState(false);

    const contextMenuRef = useRef<HTMLDivElement>(null);
    const [hoverInfo, setHoverInfo] = useState<{ order: Order, x: number, y: number } | null>(null);
    const notesListRef = useRef<HTMLDivElement>(null);
    
    // Timeline Refs for Sync
    const timelineBodyRef = useRef<HTMLDivElement>(null);
    const sidebarRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);

    // Print Modal State
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

    // Notes View State 
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
    const [searchNotesQuery, setSearchNotesQuery] = useState('');
    
    // --- SEARCH FEATURE STATE ---
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [calendarSearchQuery, setCalendarSearchQuery] = useState('');
    const [currentResultIndex, setCurrentResultIndex] = useState(-1);
    const calendarSearchInputRef = useRef<HTMLInputElement>(null);

    const companyInfo = useMemo(() => settings.find(s => s.key === 'companyInfo')?.value, [settings]);
    const companyLogo = useMemo(() => settings.find(s => s.key === 'companyLogo')?.value, [settings]);

    const todayStr = new Date().toISOString().split('T')[0];

    useEffect(() => {
        setScrolledDate(currentDate);
    }, [currentDate]);

    // Handle F3 for search
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F3') {
                e.preventDefault();
                setIsSearchOpen(true);
                setTimeout(() => calendarSearchInputRef.current?.focus(), 100);
            } else if (e.key === 'Escape') {
                setIsSearchOpen(false);
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (contextMenu.visible && contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
                setContextMenu({ visible: false, x: 0, y: 0, date: null });
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [contextMenu.visible]);
    
    const isJalali = i18n.language.startsWith('fa');
    
    const getHeaderText = () => {
        if (viewMode === 'week') {
            const day = currentDate.getUTCDay();
            const startOfWeek = new Date(currentDate);
            // Adjust for Jalali (Sat start) vs Gregorian (Mon start)
            const diff = isJalali ? (day + 1) % 7 : (day === 0 ? 6 : day - 1);
            startOfWeek.setUTCDate(currentDate.getUTCDate() - diff);
            
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
            
            const formatDate = (d: Date) => {
                const year = d.getUTCFullYear();
                const month = String(d.getUTCMonth() + 1).padStart(2, '0');
                const day = String(d.getUTCDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };
            
            // Fixed order: Start - End
            const d1 = formatDisplayDate(formatDate(startOfWeek), i18n.language);
            const d2 = formatDisplayDate(formatDate(endOfWeek), i18n.language);
            return `${d1} - ${d2}`;
        }
        
        if (isJalali) {
            const jd = jalaali.toJalaali(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate());
            const monthName = t(`months.jalali.${jd.jm}`);
            const year = new Intl.NumberFormat(i18n.language, { useGrouping: false }).format(jd.jy);
            return `${monthName} ${year}`;
        }
        
        return currentDate.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
    };

    const isHoliday = (dateStr: string) => {
        const d = new Date(dateStr);
        const day = d.getDay();
        if (isJalali) return day === 5; 
        return day === 0; 
    };

    const changeDate = (delta: number, mode: 'month' | 'week' | 'day') => {
        setCurrentDate(prevDate => {
            const newDate = new Date(prevDate);
            if (isJalali) {
                 const jd = jalaali.toJalaali(newDate.getFullYear(), newDate.getMonth() + 1, newDate.getDate());
                if (mode === 'month') {
                    let newJMonth = jd.jm + delta;
                    let newJYear = jd.jy;
                    while (newJMonth > 12) { newJMonth -= 12; newJYear++; }
                    while (newJMonth < 1) { newJMonth += 12; newJYear--; }
                    const daysInNewMonth = jalaali.jalaaliMonthLength(newJYear, newJMonth);
                    const newDay = Math.min(jd.jd, daysInNewMonth);
                    const g = jalaali.toGregorian(newJYear, newJMonth, newDay);
                    return new Date(g.gy, g.gm - 1, g.gd);
                } else if (mode === 'week') {
                     newDate.setDate(newDate.getDate() + (delta * 7));
                     return newDate;
                } else {
                    newDate.setDate(newDate.getDate() + delta);
                    return newDate;
                }
            } else {
                if (mode === 'month') {
                    newDate.setMonth(newDate.getMonth() + delta);
                } else if (mode === 'week') {
                    newDate.setDate(newDate.getDate() + (delta * 7));
                } else {
                    newDate.setDate(newDate.getDate() + delta);
                }
                return newDate;
            }
        });
    };

    const handleGoToToday = () => {
        const now = new Date();
        setCurrentDate(now);
        setScrolledDate(now);
        
        if (viewMode === 'day_timeline') {
            const el = document.getElementById(`timeline-day-${todayStr}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    const { viewStart, viewEnd } = useMemo(() => {
        const year = currentDate.getUTCFullYear();
        const month = currentDate.getUTCMonth();
        
        let monthsBack = 1;
        let monthsForward = 2;

        switch (timelineRange) {
            case '3M': monthsBack = 1; monthsForward = 2; break;
            case '6M': monthsBack = 3; monthsForward = 3; break;
            case '1Y': monthsBack = 6; monthsForward = 6; break;
        }

        const start = new Date(Date.UTC(year, month - monthsBack, 1));
        const end = new Date(Date.UTC(year, month + monthsForward + 1, 0));

        return { viewStart: start, viewEnd: end };
    }, [currentDate, timelineRange]);

    const allEventsByDate = useMemo(() => {
        const events: Record<string, CalendarEvent[]> = {};
        const addEvent = (date: string, type: EventType, item: Order | Task | CalendarTask | CalendarStickyNote) => {
            if (!date) return;
            if (!events[date]) events[date] = [];
            let itemOrder = 0;
            if ('order' in item && typeof item.order === 'number') {
                itemOrder = item.order;
            }
            events[date].push({ id: `${type}-${item.id}-${date}`, type, item, date, order: itemOrder });
        };
        
        orders.forEach(o => {
            if (filters.loadings && o.approxLoadingDate) addEvent(o.approxLoadingDate, 'order_loading', o);
            if (filters.payments && o.purchaseType === 'credit' && o.creditPaymentDueDate) addEvent(o.creditPaymentDueDate, 'order_payment', o);
        });
        tasks.forEach(t => { if (filters.personal && t.dueDate) addEvent(t.dueDate, 'project_task', t); });
        
        calendarTasks.forEach(t => { 
            if(filters.personal && (!t.isDone || filters.completed)) {
                if (t.recurrence) {
                    const startDate = new Date(t.date);
                    const endDate = viewEnd; 
                    let nextDate = new Date(Math.max(startDate.getTime(), viewStart.getTime()));

                    if (nextDate > startDate) {
                        nextDate = new Date(startDate);
                        while(nextDate < viewStart) {
                            switch(t.recurrence) {
                                case 'daily': nextDate.setUTCDate(nextDate.getUTCDate() + 1); break;
                                case 'weekly': nextDate.setUTCDate(nextDate.getUTCDate() + 7); break;
                                case 'monthly': nextDate.setUTCMonth(nextDate.getUTCMonth() + 1); break;
                                case 'yearly': nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1); break;
                            }
                        }
                    }

                    while(nextDate <= endDate) {
                         const dateStr = nextDate.toISOString().split('T')[0];
                         addEvent(dateStr, 'calendar_task', t);
                         
                         switch(t.recurrence) {
                            case 'daily': nextDate.setUTCDate(nextDate.getUTCDate() + 1); break;
                            case 'weekly': nextDate.setUTCDate(nextDate.getUTCDate() + 7); break;
                            case 'monthly': nextDate.setUTCMonth(nextDate.getUTCMonth() + 1); break;
                            case 'yearly': nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1); break;
                        }
                    }
                } else if (t.date) {
                    addEvent(t.date, 'calendar_task', t); 
                }
            }
        }); 
        calendarStickyNotes.forEach(n => { if(filters.personal) addEvent(n.date, 'calendar_note', n) });
        
        return events;
    }, [orders, tasks, calendarTasks, calendarStickyNotes, filters, viewStart, viewEnd]);

    // --- CALENDAR SEARCH LOGIC ---
    const calendarSearchResults = useMemo(() => {
        if (!calendarSearchQuery.trim()) return [];
        const normalized = persianArabicToEnglish(calendarSearchQuery).toLowerCase();
        
        const results: CalendarEvent[] = [];
        Object.values(allEventsByDate).forEach(dayEvents => {
            dayEvents.forEach(event => {
                let textToMatch = '';
                if (event.type === 'order_loading' || event.type === 'order_payment') {
                    const o = event.item as Order;
                    textToMatch = `${o.id} ${o.supplier} ${o.internalCode || ''}`;
                } else if (event.type === 'project_task') {
                    textToMatch = (event.item as Task).title;
                } else if (event.type === 'calendar_task') {
                    textToMatch = (event.item as CalendarTask).title;
                } else if (event.type === 'calendar_note') {
                    textToMatch = (event.item as CalendarStickyNote).content;
                }
                
                if (textToMatch.toLowerCase().includes(normalized)) {
                    results.push(event);
                }
            });
        });
        
        return results.sort((a, b) => a.date.localeCompare(b.date));
    }, [allEventsByDate, calendarSearchQuery]);

    const activeSearchResult = useMemo(() => {
        if (currentResultIndex >= 0 && currentResultIndex < calendarSearchResults.length) {
            return calendarSearchResults[currentResultIndex];
        }
        return null;
    }, [calendarSearchResults, currentResultIndex]);

    const handleSearchNavigate = (direction: 'next' | 'prev') => {
        if (calendarSearchResults.length === 0) return;
        let nextIndex = direction === 'next' ? currentResultIndex + 1 : currentResultIndex - 1;
        
        if (nextIndex >= calendarSearchResults.length) nextIndex = 0;
        if (nextIndex < 0) nextIndex = calendarSearchResults.length - 1;
        
        const result = calendarSearchResults[nextIndex];
        setCurrentResultIndex(nextIndex);
        
        // Jump to the date
        if (result.date) {
            const [y, m, d] = result.date.split('-').map(Number);
            // Re-sync calendar to that month/date
            setCurrentDate(new Date(y, m - 1, d));
        }
    };

    const groupedNotes = useMemo(() => {
        const groups: Record<string, CalendarStickyNote[]> = {};
        let filtered = calendarStickyNotes;
        if (searchNotesQuery.trim()) {
            const lower = searchNotesQuery.toLowerCase();
            filtered = filtered.filter(n => n.content.toLowerCase().includes(lower));
        }

        filtered.forEach(note => {
            if (!groups[note.date]) groups[note.date] = [];
            groups[note.date].push(note);
        });
        
        Object.keys(groups).forEach(date => {
             groups[date].sort((a, b) => a.order - b.order);
        });

        return groups;
    }, [calendarStickyNotes, searchNotesQuery]);

    const sortedDateKeys = useMemo(() => {
        return Object.keys(groupedNotes).sort((a, b) => b.localeCompare(a)); 
    }, [groupedNotes]);

    const selectedNote = useMemo(() => {
        if (!selectedNoteId) return null;
        return calendarStickyNotes.find(n => n.id === selectedNoteId) || null;
    }, [selectedNoteId, calendarStickyNotes]);

    const handleCreateNote = async () => {
        const dateForNote = todayStr; 
        const id = await addCalendarStickyNote(dateForNote, '');
        setSelectedNoteId(id);
    };

    const handleDeleteNote = (id: string) => {
        showConfirmation({
            title: t('confirmationModal.deleteStickyNoteTitle'),
            message: t('confirmationModal.deleteStickyNoteBody'),
            variant: 'destructive',
            onConfirm: () => {
                deleteCalendarStickyNote(id);
                if (selectedNoteId === id) setSelectedNoteId(null);
            }
        });
    };

    const getNoteTitle = (content: string) => {
        const plainText = content.replace(/<[^>]+>/g, '').trim();
        const firstLine = plainText.split('\n')[0];
        return firstLine.substring(0, 30) || (t('calendar.newNotePlaceholder') as string);
    };

    const getNotePreview = (content: string) => {
         const plainText = content.replace(/<[^>]+>/g, '').trim();
         return plainText.substring(0, 50).replace(/\n/g, ' ');
    };

    const toggleDateExpansion = (dateStr: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const clickedDate = new Date(dateStr + 'T00:00:00Z');
        const dayOfWeek = clickedDate.getUTCDay();
        const startOfWeek = new Date(clickedDate);
        startOfWeek.setUTCDate(clickedDate.getUTCDate() - (isJalali ? (dayOfWeek + 1) % 7 : (dayOfWeek === 0 ? 6 : dayOfWeek - 1)));
        
        const weekDates = [];
        for(let i=0; i<7; i++) {
            const d = new Date(startOfWeek);
            d.setUTCDate(startOfWeek.getUTCDate() + i);
            weekDates.push(d.toISOString().split('T')[0]);
        }

        setExpandedDates(prev => {
            const next = new Set(prev);
            const isExpanding = !next.has(dateStr);
            
            weekDates.forEach(d => {
                if (isExpanding) next.add(d);
                else next.delete(d);
            });
            
            return next;
        });
    };

    const handleContextMenu = (e: React.MouseEvent, dateStr: string) => {
        e.preventDefault();
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, date: dateStr });
    };

    const handleSetReminderFromContext = async () => {
        if (!contextMenu?.date) return;
        const date = contextMenu.date;
        setContextMenu({ ...contextMenu!, visible: false });
        try {
            const newTaskId = await addCalendarTask(date, 'New Reminder');
            const newTask: CalendarTask = { id: newTaskId, date, title: 'New Reminder', isDone: false, order: 999 };
            onSetReminder(newTask, 'calendarTask');
        } catch (error) {
            console.error("Failed to create task for reminder:", error);
        }
    };
    
    const handleDragStart = (e: React.DragEvent, event: CalendarEvent) => {
        e.dataTransfer.setData('itemType', event.type);
        e.dataTransfer.setData('itemId', String(event.item.id));
        e.dataTransfer.setData('sourceDate', event.date);
        e.stopPropagation();
    };

    const handleDragOver = (e: React.DragEvent, eventId: string, itemType: EventType) => {
        if (itemType === 'calendar_task') {
             e.preventDefault();
             e.stopPropagation();
             setDragOverEventId(eventId);
        }
    };

    const handleDrop = async (e: React.DragEvent, targetDate: string, targetEventId?: string) => {
        e.preventDefault();
        setDragOverDate(null);
        setDragOverEventId(null);
        const itemType = e.dataTransfer.getData('itemType') as EventType | 'unscheduled_order' | 'unscheduled_task' | 'unscheduled_calendar_task';
        const itemId = e.dataTransfer.getData('itemId');
        const sourceDate = e.dataTransfer.getData('sourceDate');

        if (!itemType || !itemId) return;

        if (sourceDate === targetDate && itemType === 'calendar_task' && targetEventId) {
             const dailyEvents = allEventsByDate[targetDate] || [];
             const dailyTasks = dailyEvents.filter(ev => ev.type === 'calendar_task');
             const fromIndex = dailyTasks.findIndex(ev => String(ev.item.id) === String(itemId));
             const targetTaskIndex = dailyTasks.findIndex(ev => ev.id === targetEventId);

             if (fromIndex > -1 && targetTaskIndex > -1 && fromIndex !== targetTaskIndex) {
                 const newTasksList = [...dailyTasks];
                 const [movedItem] = newTasksList.splice(fromIndex, 1);
                 newTasksList.splice(targetTaskIndex, 0, movedItem);
                 const reorderedTasks = newTasksList.map(ev => ev.item as CalendarTask);
                 await reorderCalendarTasks(reorderedTasks);
             }
             return;
        }

        try {
            switch(itemType) {
                case 'order_loading': await updateOrder(itemId, { approxLoadingDate: targetDate }); break;
                case 'order_payment': await updateOrder(itemId, { creditPaymentDueDate: targetDate }); break;
                case 'project_task': await updateTask(itemId, { dueDate: targetDate }); break;
                case 'calendar_task': await moveCalendarItem(Number(itemId), 'task', targetDate); break;
                case 'calendar_note': await moveCalendarItem(itemId, 'note', targetDate); break;
                case 'unscheduled_order': await updateOrder(itemId, { approxLoadingDate: targetDate }); break;
                case 'unscheduled_task': await updateTask(itemId, { dueDate: targetDate }); break;
                case 'unscheduled_calendar_task': await moveCalendarItem(Number(itemId), 'task', targetDate); break;
            }
        } catch (error) {
            console.error("Failed to move calendar item:", error);
        }
    };

    const handleSidebarDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsSidebarDragOver(false);
        const itemType = e.dataTransfer.getData('itemType') as EventType;
        const itemId = e.dataTransfer.getData('itemId');
        if (!itemType || !itemId) return;

        try {
            switch(itemType) {
                case 'order_loading': await updateOrder(itemId, { approxLoadingDate: '' }); break;
                case 'order_payment': await updateOrder(itemId, { creditPaymentDueDate: '' }); break;
                case 'project_task': await updateTask(itemId, { dueDate: '' }); break;
                case 'calendar_task': await moveCalendarItem(Number(itemId), 'task', ''); break;
            }
            addToast(t('toasts.orderUpdated'), 'success');
        } catch (error) {
            console.error("Failed to unschedule item:", error);
        }
    };
    
    const handleCopyToClipboard = (options: PrintOptions) => {
        const eventsToCopy: any[] = [];
        const inRange = (d: string) => d >= options.startDate && d <= options.endDate;
        Object.entries(allEventsByDate).forEach(([dateStr, events]) => {
             if (inRange(dateStr)) {
                 events.forEach(event => {
                     let include = false;
                     if (event.type === 'order_loading' || event.type === 'order_payment') include = options.includeOrders;
                     else if (event.type === 'project_task') include = options.includeTasks;
                     else if (event.type === 'calendar_task') include = options.includeReminders;
                     else if (event.type === 'calendar_note') include = options.includeNotes;
                     if (include) eventsToCopy.push(event);
                 });
             }
        });
        const text = formatCalendarEventsForClipboard(eventsToCopy, t);
        navigator.clipboard.writeText(text).then(() => { addToast(t('toasts.clipboard.copied'), 'success'); });
        setIsPrintModalOpen(false);
    };

    const handlePrintSchedule = (options: PrintOptions) => {
        const eventsToPrint: any[] = [];
        const inRange = (d: string) => d >= options.startDate && d <= options.endDate;
        Object.entries(allEventsByDate).forEach(([dateStr, events]) => {
             if (inRange(dateStr)) {
                 events.forEach(event => {
                     let include = false;
                     if (event.type === 'order_loading' || event.type === 'order_payment') include = options.includeOrders;
                     else if (event.type === 'project_task') include = options.includeTasks;
                     else if (event.type === 'calendar_task') include = options.includeReminders;
                     else if (event.type === 'calendar_note') include = options.includeNotes;
                     if (include) eventsToPrint.push(event);
                 });
             }
        });
        const rangeTitle = `${formatDisplayDate(options.startDate, i18n.language)} - ${formatDisplayDate(options.endDate, i18n.language)}`;
        const html = generatePrintableCalendarHtml(eventsToPrint, `Schedule - ${rangeTitle}`, t, companyInfo || '', companyLogo || '');
        if ((window as any).electronAPI?.printLargeHtml) { (window as any).electronAPI.printLargeHtml(html); } else if ((window as any).electronAPI) { (window as any).electronAPI.printComponent(html); } else { const printWindow = window.open('', '_blank'); if (printWindow) { printWindow.document.write(html); printWindow.document.close(); printWindow.focus(); setTimeout(() => { printWindow.print(); }, 500); } }
        setIsPrintModalOpen(false);
    };

    const handleExportIcal = () => {
        let iCsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//NewLand//OrderSolution//EN\n";
        Object.values(allEventsByDate).flat().forEach(event => {
             const date = event.date.replace(/-/g, '');
             let summary = '';
             if (event.type === 'order_loading') summary = `Load: ${(event.item as Order).supplier}`;
             else if (event.type === 'project_task') summary = (event.item as Task).title;
             else summary = 'Event';
             iCsContent += `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${date}\nSUMMARY:${summary}\nUID:${event.id}\nEND:VEVENT\n`;
        });
        iCsContent += "END:VCALENDAR";
        const blob = new Blob([iCsContent], { type: 'text/calendar' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'calendar.ics';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const dayHeadersRaw = isJalali ? t('daysOfWeek.jalali.long', { returnObjects: true }) : t('daysOfWeek.gregorian.long', { returnObjects: true });
    const dayHeaders = Array.isArray(dayHeadersRaw) ? (dayHeadersRaw as string[]) : [];

    const renderEvent = (event: CalendarEvent) => {
        let text = '', onClick = () => {}, bg = 'bg-gray-100', textColor = 'text-gray-800', extraClasses = '', shadow = 'shadow-sm';
        let onMouseEnter = (e: React.MouseEvent) => {};
        let onMouseLeave = () => {};

        switch(event.type) {
            case 'order_loading': 
                text = `Load: ${(event.item as Order).id}`; 
                onClick = () => onOrderClick(event.item as Order); 
                bg = 'bg-blue-600'; textColor = 'text-white'; 
                onMouseEnter = (e) => { const rect = e.currentTarget.getBoundingClientRect(); let x = rect.right + 10; if (viewMode === 'agenda' || viewMode === 'day_timeline') { x = e.clientX + 10; } setHoverInfo({ order: event.item as Order, x, y: rect.top }); };
                onMouseLeave = () => setHoverInfo(null);
                break;
            case 'order_payment': 
                text = `Pay: ${(event.item as Order).id}`; 
                onClick = () => onOrderClick(event.item as Order); 
                bg = 'bg-emerald-600'; textColor = 'text-white'; 
                onMouseEnter = (e) => { const rect = e.currentTarget.getBoundingClientRect(); let x = rect.right + 10; if (viewMode === 'agenda' || viewMode === 'day_timeline') { x = e.clientX + 10; } setHoverInfo({ order: event.item as Order, x, y: rect.top }); };
                onMouseLeave = () => setHoverInfo(null);
                break;
            case 'project_task': text = (event.item as Task).title; onClick = () => onProjectTaskClick(event.item as Task); bg = 'bg-violet-600'; textColor = 'text-white'; break;
            case 'calendar_task': 
                const task = event.item as CalendarTask;
                text = task.title; 
                onClick = () => onOpenDailyView(task.date); 
                if (task.isDone) { bg = 'bg-gray-400'; textColor = 'text-white'; extraClasses = 'line-through'; } 
                else { bg = task.priority ? PRIORITY_COLORS[task.priority] : 'bg-sky-500'; textColor = 'text-white'; }
                break;
            case 'calendar_note': text = (event.item as CalendarStickyNote).content; onClick = () => onOpenDailyView((event.item as CalendarStickyNote).date); bg = 'bg-amber-400'; textColor = 'text-white'; break;
        }

        const isDraggable = true;

        const isHighlighted = activeSearchResult?.id === event.id;

        return (
            <div 
                key={event.id} 
                draggable={isDraggable}
                onDragStart={isDraggable ? (e) => handleDragStart(e, event) : undefined} 
                onDrop={(e) => { e.stopPropagation(); handleDrop(e, event.date, event.id); }}
                onDragOver={(e) => handleDragOver(e, event.id, event.type)}
                onClick={onClick}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                className={`flex items-center text-xs leading-tight p-2 py-3 rounded mb-1 truncate transition-all ${isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${bg} ${textColor} ${extraClasses} ${shadow} ${dragOverEventId === event.id ? 'border-t-2 border-indigo-500' : ''} ${isHighlighted ? 'ring-2 ring-orange-500 scale-105 shadow-lg animate-pulse z-50' : ''} hover:brightness-110 font-bold border border-black/5`}
            >
                {event.type === 'calendar_task' && (
                    <input
                        type="checkbox"
                        checked={(event.item as CalendarTask).isDone}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                            e.stopPropagation();
                            updateCalendarTask((event.item as CalendarTask).id, { isDone: e.target.checked });
                        }}
                        className="h-4 w-4 rounded border-gray-400 text-indigo-600 focus:ring-0 mr-1.5 rtl:ml-1.5 rtl:mr-0"
                    />
                )}
                <span className="truncate flex-1">{text || 'Untitled'}</span>
            </div>
        );
    };

    const renderMonthView = () => {
        const year = currentDate.getUTCFullYear();
        const month = currentDate.getUTCMonth(); 

        let firstDayOfGrid: Date;

        if (isJalali) {
            const jd = jalaali.toJalaali(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate());
            const firstDayOfMonthGregorian = jalaali.toGregorian(jd.jy, jd.jm, 1);
            const firstDateOfMonth = new Date(Date.UTC(firstDayOfMonthGregorian.gy, firstDayOfMonthGregorian.gm - 1, firstDayOfMonthGregorian.gd));
            const dayOfWeek = (firstDateOfMonth.getUTCDay() + 1) % 7; 
            firstDayOfGrid = new Date(firstDateOfMonth);
            firstDayOfGrid.setUTCDate(firstDateOfMonth.getUTCDate() - dayOfWeek);
        } else {
            const firstDateOfMonth = new Date(Date.UTC(year, month, 1));
            const dayOfWeek = (firstDateOfMonth.getUTCDay() + 6) % 7;
            firstDayOfGrid = new Date(firstDateOfMonth);
            firstDayOfGrid.setUTCDate(firstDateOfMonth.getUTCDate() - dayOfWeek);
        }

        const grid: any[] = [];
        let currentDay = new Date(firstDayOfGrid);

        for (let i = 0; i < 42; i++) {
            const dateStr = `${currentDay.getUTCFullYear()}-${String(currentDay.getUTCMonth() + 1).padStart(2, '0')}-${String(currentDay.getUTCDate()).padStart(2, '0')}`;
            
            const isCurrentMonth = isJalali 
                ? jalaali.toJalaali(currentDay.getUTCFullYear(), currentDay.getUTCMonth() + 1, currentDay.getUTCDate()).jm === jalaali.toJalaali(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate()).jm
                : currentDay.getUTCMonth() === month;

            const today = new Date();
            const isToday = today.getFullYear() === currentDay.getUTCFullYear() &&
                            today.getMonth() === currentDay.getUTCMonth() &&
                            today.getDate() === currentDay.getUTCDate();
            
            let dayNumber: number;
            if (isJalali) {
                dayNumber = jalaali.toJalaali(currentDay.getUTCFullYear(), currentDay.getUTCMonth() + 1, currentDay.getUTCDate()).jd;
            } else {
                dayNumber = currentDay.getUTCDate();
            }

            const dailyEvents = allEventsByDate[dateStr] || [];
            const loadingCount = dailyEvents.filter(e => e.type === 'order_loading').length;
            const hasDensityHigh = dailyEvents.length > 5;

            const sortedEvents = [...dailyEvents].sort((a, b) => {
                const aIsDone = a.type === 'calendar_task' && (a.item as CalendarTask).isDone;
                const bIsDone = b.type === 'calendar_task' && (b.item as CalendarTask).isDone;
                if (aIsDone && !bIsDone) return 1;
                if (!aIsDone && bIsDone) return -1;
                if (a.type === 'calendar_task' && b.type === 'calendar_task') {
                    return (a.order || 0) - (b.order || 0);
                }
                return 0;
            });

            const holidays = getHolidaysForDate(dateStr);

            grid.push({
                key: dateStr,
                day: dayNumber,
                dateStr,
                isToday,
                isCurrentMonth,
                events: sortedEvents,
                isHoliday: isHoliday(dateStr),
                holidays,
                loadingCount,
                hasDensityHigh
            });

            currentDay.setUTCDate(currentDay.getUTCDate() + 1);
        }

        return (
             <div className="grid grid-cols-7 gap-1 h-auto min-w-[1000px] bg-slate-200">
                <div className="col-span-7 grid grid-cols-7 text-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 sticky top-0 z-20 border-b border-slate-300 shadow-sm">
                    {dayHeaders.map(day => <div key={day} className="py-2.5">{day}</div>)}
                </div>

                {grid.map(cell => {
                    const isExpanded = expandedDates.has(cell.dateStr);
                    const isHolidayDay = cell.isHoliday || cell.holidays.length > 0;
                    return (
                        <div 
                            key={cell.key} 
                            className={`border-b border-r border-slate-200 p-1 flex flex-col transition-all duration-300 grid-row-auto ${!cell.isCurrentMonth ? 'bg-slate-100 opacity-60' : isHolidayDay ? 'bg-red-50/40' : 'bg-white hover:bg-slate-50'} ${dragOverDate === cell.dateStr ? 'bg-indigo-50 ring-2 ring-indigo-400 inset-0' : ''} ${isExpanded ? 'min-h-[200px] z-10' : 'min-h-[140px]'}`}
                            onContextMenu={(e) => handleContextMenu(e, cell.dateStr)}
                            onDragOver={(e) => { e.preventDefault(); setDragOverDate(cell.dateStr); }}
                            onDragLeave={() => setDragOverDate(null)}
                            onDrop={(e) => handleDrop(e, cell.dateStr)}
                        >
                            <div className="flex justify-between items-center flex-shrink-0 mb-1">
                                <div className="flex items-center gap-x-1">
                                    <button 
                                        onClick={(e) => toggleDateExpansion(cell.dateStr, e)}
                                        title="Click to expand row"
                                        className={`flex items-center justify-center text-xs h-6 w-6 rounded-full transition-colors ${cell.isToday ? 'bg-red-500 text-white font-bold' : isExpanded ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'} ${!cell.isCurrentMonth ? 'text-slate-400' : ''}`}
                                    >
                                        {i18n.language.startsWith('fa') ? new Intl.NumberFormat('fa-IR-u-nu-latn').format(cell.day) : cell.day}
                                    </button>
                                    {cell.loadingCount > 1 && <span className="text-[10px] text-orange-600 font-bold" title="Conflict: Multiple Loadings scheduled">⚠️</span>}
                                    {cell.hasDensityHigh && <span className="text-[10px]" title="Busy day (>5 events)">🔥</span>}
                                    {cell.holidays.map((h: any, hi: number) => (
                                        <div key={hi} className="text-[8px] bg-red-600 text-white px-1 rounded font-bold uppercase" title={h.name}>{h.country}</div>
                                    ))}
                                </div>
                                <button onClick={() => onOpenDailyView(cell.dateStr)} className="text-slate-400 hover:text-indigo-600 transition-colors p-1 rounded-full text-[10px] font-bold">Edit</button>
                            </div>
                            <div className={`mt-0.5 space-y-1 ${isExpanded ? 'overflow-visible' : 'overflow-y-auto max-h-[100px]'} flex-1 min-h-0 scrollbar-thin`}>
                                {cell.events?.map(renderEvent)}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const handleQuickAddTaskInWeek = async (dateStr: string) => {
        const taskId = await addCalendarTask(dateStr, '');
        // Opening daily view gives focus to the specific new empty task
        onOpenDailyView(dateStr);
    };

    const renderWeekView = () => {
        const currentDay = new Date(currentDate);
        const day = currentDay.getUTCDay();
        const startOfWeek = new Date(currentDay);
        startOfWeek.setUTCDate(currentDay.getUTCDate() - (isJalali ? (day + 1) % 7 : (day === 0 ? 6 : day - 1)));

        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setUTCDate(startOfWeek.getUTCDate() + i);
            weekDays.push(d);
        }

        return (
            <div className="grid grid-cols-7 gap-px bg-slate-200 h-full rounded-lg border border-slate-300 min-w-[1000px] overflow-x-auto">
                {weekDays.map((day, i) => {
                    const dateStr = day.toISOString().split('T')[0];
                    const events = allEventsByDate[dateStr] || [];
                    const loadingCount = events.filter(e => e.type === 'order_loading').length;
                    const hasDensityHigh = events.length > 5;
                    const isToday = dateStr === new Date().toISOString().split('T')[0];
                    const isExpanded = Array.from(expandedDates).some(d => weekDays.some(wd => wd.toISOString().split('T')[0] === d));
                    const holidays = getHolidaysForDate(dateStr);
                    
                    const sortedEvents = [...events].sort((a, b) => {
                        const aIsDone = a.type === 'calendar_task' && (a.item as CalendarTask).isDone;
                        const bIsDone = b.type === 'calendar_task' && (b.item as CalendarTask).isDone;
                        if (aIsDone && !bIsDone) return 1;
                        if (!aIsDone && bIsDone) return -1;
                        if (a.type === 'calendar_task' && b.type === 'calendar_task') {
                            return (a.order || 0) - (b.order || 0);
                        }
                        return 0;
                    });

                    return (
                        <div 
                            key={i} 
                            className={`bg-white flex flex-col h-full min-h-0 transition-colors ${dragOverDate === dateStr ? 'bg-indigo-100 ring-2 ring-indigo-400 z-10' : ''} ${holidays.length > 0 || isHoliday(dateStr) ? 'bg-red-50/40' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); setDragOverDate(dateStr); }}
                            onDragLeave={() => setDragOverDate(null)}
                            onDrop={(e) => handleDrop(e, dateStr)}
                        >
                            <div className={`p-2 border-b border-slate-100 sticky top-0 z-20 ${isToday ? 'bg-indigo-50' : 'bg-white'}`}>
                                <div className="text-center">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-center gap-1">
                                        {day.toLocaleDateString(i18n.language, { weekday: 'short', timeZone: 'UTC' })}
                                        {loadingCount > 1 && <span className="text-[10px] text-orange-600 font-bold" title="Conflict: Multiple Loadings scheduled">⚠️</span>}
                                        {hasDensityHigh && <span className="text-[10px]" title="Busy day (>5 events)">🔥</span>}
                                    </div>
                                    <div className="flex items-center justify-center gap-x-2 mt-1">
                                        <button 
                                            onClick={(e) => toggleDateExpansion(dateStr, e)}
                                            className={`text-lg font-semibold h-8 w-8 rounded-full inline-flex items-center justify-center transition-colors ${isToday ? 'bg-red-500 text-white' : isExpanded ? 'bg-indigo-100 text-indigo-700' : 'text-slate-800 hover:bg-slate-100'}`}
                                        >
                                            {i18n.language.startsWith('fa') 
                                                ? new Intl.NumberFormat('fa-IR-u-nu-latn').format(jalaali.toJalaali(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()).jd) 
                                                : day.getUTCDate()}
                                        </button>
                                        <button 
                                            onClick={() => handleQuickAddTaskInWeek(dateStr)} 
                                            className="h-6 w-6 rounded-full bg-slate-100 text-indigo-600 hover:bg-indigo-600 hover:text-white flex items-center justify-center transition-colors shadow-sm"
                                            title="Quick Add Task"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex justify-center gap-1 mt-1">
                                    {holidays.map((h, hi) => <span key={hi} className="text-[8px] bg-red-600 text-white px-1 rounded font-bold" title={h.name}>{h.country}</span>)}
                                </div>
                            </div>
                            <div className={`flex-1 p-1 space-y-1 ${isExpanded ? 'overflow-visible' : 'overflow-y-auto'}`}>
                                {sortedEvents.map(renderEvent)}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderDayTimelineView = () => {
        const sortedDates = Object.keys(allEventsByDate).sort((a, b) => {
            return listSortDirection === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
        }); 
        
        return (
            <div className="p-6 h-full overflow-y-auto space-y-12 relative text-right" dir="rtl">
                <div className="absolute right-1/2 top-0 bottom-0 w-1 bg-slate-200 translate-x-1/2 hidden md:block" />

                {sortedDates.map(dateStr => (
                    <div key={dateStr} id={`timeline-day-${dateStr}`} className="relative z-10 flex flex-col items-center">
                        <div className="mb-6">
                            <span className="bg-cyan-100 text-cyan-800 px-4 py-1.5 rounded-full font-bold text-sm shadow-sm flex items-center gap-x-2 border border-cyan-200">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                                {formatDisplayDate(dateStr, i18n.language)}
                                {getHolidaysForDate(dateStr).map((h, hi) => <span key={hi} className="bg-red-600 text-white px-1 text-[10px] rounded">{h.country}</span>)}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 gap-4 w-full max-w-4xl">
                            {allEventsByDate[dateStr].map(event => {
                                const isOrder = event.type.startsWith('order');
                                const isCalendar = event.type === 'calendar_task' || event.type === 'calendar_note';
                                const isProjectTask = event.type === 'project_task';
                                const isDone = event.type === 'calendar_task' && (event.item as CalendarTask).isDone;
                                
                                return (
                                    <div 
                                        key={event.id} 
                                        onMouseEnter={(e) => {
                                            if (isOrder) {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setHoverInfo({ order: event.item as Order, x: e.clientX + 10, y: rect.top });
                                            }
                                        }}
                                        onMouseLeave={() => setHoverInfo(null)}
                                        onClick={() => {
                                            if (isOrder) onOrderClick(event.item as Order);
                                            else if (isProjectTask) onProjectTaskClick(event.item as Task);
                                            else if (isCalendar) onOpenDailyView(event.date);
                                        }}
                                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex gap-x-4 items-center group relative overflow-hidden"
                                    >
                                        <div className={`absolute right-0 top-0 bottom-0 w-1.5 ${isDone ? 'bg-green-500' : 'bg-indigo-500'}`} />
                                        <div className="flex-shrink-0 text-xs font-mono text-slate-400">
                                            {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div className="flex-shrink-0 flex items-center gap-x-2 border-r border-slate-100 pr-4">
                                            <div className="text-left">
                                                <p className="text-xs font-bold text-slate-700">کاربر سیستم</p>
                                                {isOrder && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">Orders 2025</span>}
                                            </div>
                                            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 overflow-hidden border-2 border-slate-100">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-x-3">
                                                {event.type === 'calendar_task' && (
                                                    <div className={`w-2.5 h-2.5 rounded-full ${PRIORITY_COLORS[(event.item as CalendarTask).priority || 'low']}`} />
                                                )}
                                                <p className={`text-base font-semibold truncate ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                                    {isOrder ? `Order: ${(event.item as Order).supplier}` : (event.item as any).title || (event.item as any).content}
                                                </p>
                                            </div>
                                            {isOrder && <p className="text-xs text-slate-500 mt-0.5">ID: {(event.item as Order).id}</p>}
                                        </div>
                                        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                             <div className="flex gap-1">
                                                 <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                                 <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                                 <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                             </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {sortedDates.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p className="text-lg font-medium">No timeline events found.</p>
                    </div>
                )}
            </div>
        );
    };

    const renderTimelineView = () => {
        const totalDays = Math.round((viewEnd.getTime() - viewStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        let colWidth = 40;
        let columns: { date: Date; width: number; label: string; subLabel?: string }[] = [];

        if (timelineResolution === 'day') {
             colWidth = 40;
             for (let i = 0; i < totalDays; i++) {
                const d = new Date(viewStart);
                d.setUTCDate(viewStart.getUTCDate() + i);
                const isFirstOfMonth = d.getDate() === 1 || i === 0;
                const dayLabel = i18n.language.startsWith('fa') 
                    ? new Intl.NumberFormat('fa-IR-u-nu-latn').format(d.getDate())
                    : d.getDate();
                const monthLabel = d.toLocaleDateString(i18n.language, { month: 'short' });
                
                columns.push({
                    date: d,
                    width: colWidth,
                    label: String(dayLabel),
                    subLabel: isFirstOfMonth ? monthLabel : undefined
                });
            }
        } else if (timelineResolution === 'week') {
            colWidth = 100;
            const startDay = viewStart.getUTCDay(); 
            const offset = isJalali ? (startDay + 1) % 7 : (startDay === 0 ? 6 : startDay - 1);
            
            for (let i = -offset; i < totalDays; i += 7) {
                 const d = new Date(viewStart);
                 d.setUTCDate(viewStart.getUTCDate() + i);
                 if (i + 7 > 0) {
                     const endOfWeek = new Date(d);
                     endOfWeek.setUTCDate(d.getUTCDate() + 6);
                     
                     let label = '';
                     let subLabel = '';

                     if (isJalali) {
                         const jdStart = jalaali.toJalaali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
                         const jdEnd = jalaali.toJalaali(endOfWeek.getUTCFullYear(), endOfWeek.getUTCMonth() + 1, endOfWeek.getUTCDate());
                         const startMonthName = t(`months.jalali.${jdStart.jm}`);
                         const startDayStr = new Intl.NumberFormat('fa-IR-u-nu-latn').format(jdStart.jd);
                         const endDayStr = new Intl.NumberFormat('fa-IR-u-nu-latn').format(jdEnd.jd);
                         const startYear = new Intl.NumberFormat('fa-IR-u-nu-latn', { useGrouping: false }).format(jdStart.jy);

                         label = `${startMonthName} ${startYear}`;
                         subLabel = `${startDayStr} - ${endDayStr}`;
                     } else {
                         const startDay = d.getUTCDate();
                         const endDay = endOfWeek.getUTCDate();
                         const monthShort = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
                         label = `${monthShort} ${d.getUTCFullYear()}`;
                         subLabel = `${startDay} - ${endDay}`;
                     }

                     columns.push({
                         date: d,
                         width: colWidth,
                         label: label,
                         subLabel: subLabel
                     });
                 }
            }
        } else if (timelineResolution === 'month') {
            colWidth = 150;
            const startMonth = viewStart.getUTCMonth();
            const startYear = viewStart.getUTCFullYear();
            const monthsCount = Math.ceil(totalDays / 30) + 2; 

            for(let i=0; i < monthsCount; i++) {
                 const d = new Date(Date.UTC(startYear, startMonth + i, 1));
                 if (d > viewEnd) break;
                 
                 const jd = jalaali.toJalaali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
                 const label = isJalali 
                    ? t(`months.jalali.${jd.jm}`) 
                    : t(`months.gregorian.${d.getUTCMonth()}`);
                 
                 columns.push({
                     date: d,
                     width: colWidth,
                     label: label,
                     subLabel: isJalali ? new Intl.NumberFormat('fa-IR-u-nu-latn', { useGrouping: false }).format(jd.jy) : d.getUTCFullYear().toString()
                 });
            }
        }

        const gridWidth = columns.reduce((sum, col) => sum + col.width, 0);
        const msPerDay = 1000 * 60 * 60 * 24;

        const getItemStyle = (startStr: string | undefined, endStr: string | undefined) => {
            if (!startStr) return null;
            const start = new Date(startStr);
            const end = endStr ? new Date(endStr) : new Date(startStr);
            const startUtc = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
            const endUtc = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));

            if (endUtc < viewStart || startUtc > viewEnd) return null;

            const visibleStart = startUtc < viewStart ? viewStart : startUtc;
            const visibleEnd = endUtc > viewEnd ? viewEnd : endUtc;
            const diffDays = (visibleStart.getTime() - viewStart.getTime()) / msPerDay;
            const durationDays = (visibleEnd.getTime() - visibleStart.getTime()) / msPerDay + 1;
            
            let pixelsPerDay = colWidth;
            if (timelineResolution === 'week') pixelsPerDay = colWidth / 7;
            if (timelineResolution === 'month') pixelsPerDay = colWidth / 30.44; 

            return {
                left: `${diffDays * pixelsPerDay}px`,
                width: `${Math.max(durationDays * pixelsPerDay, 5)}px` 
            };
        };

        const renderBar = (item: any, type: string, start: string, end: string, label: string, colorClass: string) => {
            const style = getItemStyle(start, end);
            if (!style) return null;
            
            // Vibrant rainbow gradient for bars
            const rainbowGradient = 'linear-gradient(90deg, #ef4444 0%, #f97316 15%, #facc15 30%, #4ade80 50%, #3b82f6 70%, #8b5cf6 85%, #d946ef 100%)';

            return (
                <div 
                    key={`${type}-${item.id}`}
                    className={`absolute h-6 rounded-lg px-3 text-[10px] sm:text-xs text-white truncate flex items-center shadow-lg hover:brightness-110 cursor-pointer font-black border border-white/30`}
                    style={{ 
                        ...style, 
                        top: '4px',
                        background: rainbowGradient,
                        textShadow: '0px 1px 3px rgba(0,0,0,0.5)',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)'
                    }}
                    title={`${label} (${start} - ${end})`}
                    onClick={() => {
                         if (type === 'order') onOrderClick(item);
                         else if (type === 'task') onProjectTaskClick(item);
                         else if (type === 'calendar_task') onOpenDailyView(item.date);
                    }}
                    onMouseEnter={(e) => {
                        if (type === 'order') {
                             const rect = e.currentTarget.getBoundingClientRect();
                             setHoverInfo({ order: item as Order, x: e.clientX + 10, y: rect.top });
                        }
                    }}
                    onMouseLeave={() => setHoverInfo(null)}
                >
                    <span className="relative z-10">{label}</span>
                    {/* Add a soft shine overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none rounded-lg" />
                </div>
            );
        };

        const handleBodyScroll = (e: React.UIEvent<HTMLDivElement>) => {
            if (headerRef.current) headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
            if (sidebarRef.current) sidebarRef.current.scrollTop = e.currentTarget.scrollTop;

            const scrollLeft = e.currentTarget.scrollLeft;
            let pixelsPerDay = colWidth;
            if (timelineResolution === 'week') pixelsPerDay = colWidth / 7;
            if (timelineResolution === 'month') pixelsPerDay = colWidth / 30.44;

            const daysOffset = Math.floor(scrollLeft / pixelsPerDay);
            const visibleDate = new Date(viewStart);
            visibleDate.setUTCDate(visibleDate.getUTCDate() + daysOffset);

            if (visibleDate.getMonth() !== scrolledDate.getMonth() || visibleDate.getFullYear() !== scrolledDate.getFullYear()) {
                 setScrolledDate(visibleDate);
            }
        };

        const filteredOrders = orders.filter(o => filters.loadings && getItemStyle(o.orderDate, o.approxLoadingDate));
        const filteredTasks = tasks.filter(t => filters.personal && getItemStyle(t.createdAt, t.dueDate));

        const rowHeight = 40; 
        const totalHeight = (filteredOrders.length + filteredTasks.length + 2) * rowHeight + 100; 

        return (
             <div className="flex flex-col h-full border border-slate-300 rounded-lg bg-white overflow-hidden relative">
                <div className="flex-1 relative overflow-hidden" dir="ltr">
                    <div className="absolute top-0 left-0 w-64 h-10 z-30 bg-slate-50 border-r border-b border-slate-300 flex items-center justify-center font-bold text-slate-600 shadow-sm">
                        Item
                    </div>

                    <div ref={headerRef} className="absolute top-0 left-64 right-0 h-10 overflow-hidden z-20 bg-slate-50 border-b border-slate-300">
                        <div className="flex h-full" style={{ width: gridWidth }}>
                            {columns.map((col, i) => {
                                 return (
                                    <div key={i} className="flex-shrink-0 text-center p-2 border-r border-slate-200 text-xs font-medium text-slate-700 relative h-full flex items-center justify-center flex-col" style={{ width: col.width }}>
                                        <div className="font-bold">{col.label}</div>
                                        {col.subLabel && <div className="text-[10px] text-slate-500">{col.subLabel}</div>}
                                    </div>
                                )
                             })}
                        </div>
                    </div>

                    <div ref={sidebarRef} className="absolute top-10 left-0 w-64 bottom-0 overflow-hidden z-20 bg-white border-r border-slate-300">
                        <div style={{ height: totalHeight }}> 
                            {filteredOrders.length > 0 && (
                                <div className="h-[40px] flex items-center px-3 font-bold text-xs text-slate-500 uppercase bg-slate-100 border-b border-slate-200 sticky top-0">Orders</div>
                            )}
                            {filteredOrders.map(o => (
                                 <div key={o.id} className="h-[40px] flex items-center px-3 text-xs text-slate-700 border-b border-slate-100 truncate font-medium hover:bg-slate-50" title={o.supplier}>{o.supplier}</div>
                            ))}
                            {filteredTasks.length > 0 && (
                                <div className="h-[40px] flex items-center px-3 font-bold text-xs text-slate-500 uppercase bg-slate-100 border-b border-slate-200 sticky top-0">Tasks</div>
                            )}
                            {filteredTasks.map(t => (
                                 <div key={t.id} className="h-[40px] flex items-center px-3 text-xs text-slate-700 border-b border-slate-100 truncate font-medium hover:bg-slate-50" title={t.title}>{t.title}</div>
                            ))}
                        </div>
                    </div>

                    <div ref={timelineBodyRef} onScroll={handleBodyScroll} className="absolute top-10 left-64 right-0 bottom-0 overflow-auto z-10 bg-white">
                        <div style={{ width: gridWidth, height: totalHeight }}>
                             <div className="absolute inset-0 flex pointer-events-none h-full">
                                {columns.map((col, i) => (
                                    <div key={i} className={`border-r ${col.subLabel ? 'border-slate-300' : 'border-slate-100'} h-full`} style={{ width: col.width }}></div>
                                ))}
                             </div>

                             <div className="relative z-10">
                                 {filteredOrders.length > 0 && <div className="h-[40px]"></div>}
                                 {filteredOrders.map(o => (
                                     <div key={o.id} className="h-[40px] relative border-b border-slate-100/50">
                                         {renderBar(o, 'order', o.orderDate, o.approxLoadingDate, o.id, 'bg-blue-500')}
                                     </div>
                                 ))}
                                 {filteredTasks.length > 0 && <div className="h-[40px]"></div>}
                                 {filteredTasks.map(t => (
                                     <div key={t.id} className="h-[40px] relative border-b border-slate-100/50">
                                         {renderBar(t, 'task', t.createdAt, t.dueDate || t.createdAt, t.title, 'bg-purple-500')}
                                     </div>
                                 ))}
                             </div>
                        </div>
                    </div>
                </div>
             </div>
        );
    };
    
    const renderAgendaView = () => {
        const sortedDates = Object.keys(allEventsByDate).sort((a, b) => {
            return listSortDirection === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
        });

        return (
            <div className="p-4 space-y-4 overflow-y-auto h-full scroll-smooth">
                 {sortedDates.map(date => (
                    <div key={date} id={`agenda-date-${date}`}>
                        <h3 className="font-bold text-slate-700 border-b border-slate-200 mb-2 sticky top-0 bg-white py-1">{formatDisplayDate(date, i18n.language)}</h3>
                        <div className="space-y-1">
                            {allEventsByDate[date].map(renderEvent)}
                        </div>
                    </div>
                 ))}
                 {sortedDates.length === 0 && <p className="text-center text-slate-400 py-10">No events found.</p>}
            </div>
        );
    };

    return (
        <div className="bg-white p-4 rounded-lg border border-slate-200 h-full flex flex-col relative overflow-hidden">
             {hoverInfo && <QuickLookCard order={hoverInfo.order} position={{ x: hoverInfo.x, y: hoverInfo.y }} t={t} />}

            <div className="flex justify-between items-center mb-4 bg-slate-50 p-2 rounded-lg flex-shrink-0 relative">
                 <div className="flex gap-x-2">
                     <button onClick={() => setActiveTab('calendar')} className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${activeTab === 'calendar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{t('calendar.calendarTab')}</button>
                     <button onClick={() => setActiveTab('reminders')} className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${activeTab === 'reminders' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{t('calendar.remindersTab')}</button>
                     <button onClick={() => setActiveTab('notes')} className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${activeTab === 'notes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{t('calendar.notesTab')}</button>
                 </div>

                 {isSearchOpen && activeTab === 'calendar' && (
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex items-center bg-white border border-indigo-300 rounded-lg shadow-sm px-2 z-50 w-80 animate-in slide-in-from-top-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                        <input 
                            ref={calendarSearchInputRef}
                            type="text" 
                            placeholder={t('common.search')} 
                            value={calendarSearchQuery}
                            onChange={e => { setCalendarSearchQuery(e.target.value); setCurrentResultIndex(0); }}
                            className="flex-1 border-none bg-transparent focus:ring-0 text-sm py-1"
                        />
                        {calendarSearchResults.length > 0 && (
                            <div className="flex items-center gap-x-1 ml-2 text-xs text-slate-500 font-medium">
                                <span>{currentResultIndex + 1}/{calendarSearchResults.length}</span>
                                <button onClick={() => handleSearchNavigate('prev')} className="p-1 hover:bg-slate-100 rounded text-slate-700">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                                </button>
                                <button onClick={() => handleSearchNavigate('next')} className="p-1 hover:bg-slate-100 rounded text-slate-700">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                </button>
                            </div>
                        )}
                        <button onClick={() => setIsSearchOpen(false)} className="ml-1 p-1 text-slate-400 hover:text-slate-600">&times;</button>
                    </div>
                 )}
                 
                 {activeTab === 'calendar' && (
                     <div className="flex gap-x-2">
                         <button onClick={() => setIsUnscheduledSidebarOpen(!isUnscheduledSidebarOpen)} className={`p-2 rounded-md text-sm font-medium border ${isUnscheduledSidebarOpen ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-slate-300 text-slate-600'}`}>
                             {t('calendar.sidebar.unscheduled')}
                         </button>
                         <button onClick={handleExportIcal} className="p-2 rounded-md text-sm font-medium bg-white border border-slate-300 text-slate-600 hover:bg-slate-100" title={t('calendar.exportIcal')}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                         </button>
                         <button onClick={() => setIsPrintModalOpen(true)} className="p-2 rounded-md text-sm font-medium bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 flex items-center gap-1">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v-2a1 1 0 011-1h10a1 1 0 011 1v2h1a2 2 0 00-2-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" /></svg>
                             Print / Share
                         </button>
                     </div>
                 )}
            </div>

            {activeTab === 'calendar' && (
                <div className="flex flex-1 min-h-0 gap-x-4 overflow-hidden">
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <header className="flex-shrink-0 flex justify-between items-center mb-2 py-1 flex-wrap gap-y-2">
                            <div className="flex gap-x-2 flex-wrap">
                                <button onClick={() => setViewMode('month')} className={`px-3 py-1 rounded text-xs font-bold ${viewMode === 'month' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{t('calendar.viewModes.month')}</button>
                                <button onClick={() => setViewMode('week')} className={`px-3 py-1 rounded text-xs font-bold ${viewMode === 'week' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{t('calendar.viewModes.week')}</button>
                                <button onClick={() => setViewMode('day_timeline')} className={`px-3 py-1 rounded text-xs font-bold ${viewMode === 'day_timeline' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{t('calendar.viewModes.day_timeline')}</button>
                                <button onClick={() => setViewMode('timeline')} className={`px-3 py-1 rounded text-xs font-bold ${viewMode === 'timeline' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{t('calendar.viewModes.timeline')}</button>
                                <button onClick={() => setViewMode('agenda')} className={`px-3 py-1 rounded text-xs font-bold ${viewMode === 'agenda' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{t('calendar.viewModes.agenda')}</button>
                                
                                {viewMode === 'timeline' && (
                                    <>
                                     <div className="flex bg-slate-100 p-0.5 rounded text-[10px] ml-2">
                                        <button onClick={() => setTimelineRange('3M')} className={`px-2 py-0.5 rounded transition-colors ${timelineRange === '3M' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>3M</button>
                                        <button onClick={() => setTimelineRange('6M')} className={`px-2 py-0.5 rounded transition-colors ${timelineRange === '6M' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>6M</button>
                                        <button onClick={() => setTimelineRange('1Y')} className={`px-2 py-0.5 rounded transition-colors ${timelineRange === '1Y' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>1Y</button>
                                     </div>
                                     <div className="flex bg-slate-100 p-0.5 rounded text-[10px] ml-2">
                                        <button onClick={() => setTimelineResolution('day')} className={`px-2 py-0.5 rounded transition-colors ${timelineResolution === 'day' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Day</button>
                                        <button onClick={() => setTimelineResolution('week')} className={`px-2 py-0.5 rounded transition-colors ${timelineResolution === 'week' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Week</button>
                                        <button onClick={() => setTimelineResolution('month')} className={`px-2 py-0.5 rounded transition-colors ${timelineResolution === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Month</button>
                                     </div>
                                    </>
                                )}
                                {(viewMode === 'day_timeline' || viewMode === 'agenda') && (
                                    <div className="flex items-center gap-x-2 ml-2">
                                        <button 
                                            onClick={() => setListSortDirection(s => s === 'asc' ? 'desc' : 'asc')} 
                                            className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1" 
                                            title={t('common.sortBy.label')}
                                        >
                                            {listSortDirection === 'asc' ? 'Asc' : 'Desc'}
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex items-center gap-x-4">
                                <button 
                                    onClick={() => changeDate(-1, viewMode === 'week' ? 'week' : 'month')} 
                                    className="p-1 rounded-full bg-white shadow-sm border border-slate-200 hover:bg-slate-50 group transition-all"
                                >
                                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-inner">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                </button>
                                <h2 className="text-lg font-bold text-gray-900 min-w-[150px] text-center">{getHeaderText()}</h2>
                                <button 
                                    onClick={() => changeDate(1, viewMode === 'week' ? 'week' : 'month')} 
                                    className="p-1 rounded-full bg-white shadow-sm border border-slate-200 hover:bg-slate-50 group transition-all"
                                >
                                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-inner">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                </button>
                                <button onClick={handleGoToToday} className="px-3 py-1 rounded text-xs font-bold bg-white border border-slate-300 text-slate-600 hover:bg-slate-100">{t('common.today')}</button>
                            </div>

                            <div className="flex items-center gap-x-2 text-[10px] sm:text-xs bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                                <label className="flex items-center gap-1 cursor-pointer hover:text-indigo-600"><input type="checkbox" checked={filters.payments} onChange={e => setFilters(p => ({...p, payments: e.target.checked}))} className="rounded text-indigo-600 focus:ring-indigo-500" /> {t('calendar.filters.payments')}</label>
                                <label className="flex items-center gap-1 cursor-pointer hover:text-indigo-600"><input type="checkbox" checked={filters.loadings} onChange={e => setFilters(p => ({...p, loadings: e.target.checked}))} className="rounded text-indigo-600 focus:ring-indigo-500" /> {t('calendar.filters.loadings')}</label>
                                <label className="flex items-center gap-1 cursor-pointer hover:text-indigo-600"><input type="checkbox" checked={filters.personal} onChange={e => setFilters(p => ({...p, personal: e.target.checked}))} className="rounded text-indigo-600 focus:ring-indigo-500" /> {t('calendar.filters.personal')}</label>
                                <label className="flex items-center gap-1 cursor-pointer hover:text-indigo-600"><input type="checkbox" checked={filters.completed} onChange={e => setFilters(p => ({...p, completed: e.target.checked}))} className="rounded text-indigo-600 focus:ring-indigo-500" /> {t('calendar.filters.completed')}</label>
                            </div>
                        </header>
                        <div className="flex-1 min-h-0 overflow-auto border border-slate-200 rounded-lg shadow-inner bg-slate-50">
                             {viewMode === 'month' && renderMonthView()}
                             {viewMode === 'week' && renderWeekView()}
                             {viewMode === 'day_timeline' && renderDayTimelineView()}
                             {viewMode === 'timeline' && renderTimelineView()}
                             {viewMode === 'agenda' && renderAgendaView()}
                        </div>
                    </div>

                    {isUnscheduledSidebarOpen && (
                         <div 
                            onDragOver={(e) => { e.preventDefault(); setIsSidebarDragOver(true); }}
                            onDragLeave={() => setIsSidebarDragOver(false)}
                            onDrop={handleSidebarDrop}
                            className={`w-64 bg-slate-100 border-l border-slate-200 p-4 transition-all ${isSidebarDragOver ? 'bg-indigo-50 ring-2 ring-indigo-400' : ''}`}
                        >
                            <h3 className="font-bold text-slate-700 mb-4">{t('calendar.sidebar.unscheduled')}</h3>
                            <p className="text-xs text-slate-500 mb-4 italic">{t('calendar.sidebar.dragToSchedule')}</p>
                            <div className="space-y-3 overflow-y-auto max-h-full pb-10">
                                {orders.filter(o => !o.approxLoadingDate && !o.isArchived).map(o => (
                                    <div 
                                        key={o.id} 
                                        draggable 
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('itemType', 'order_loading');
                                            e.dataTransfer.setData('itemId', o.id);
                                        }}
                                        onClick={() => onOrderClick(o)}
                                        className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm cursor-grab hover:border-blue-400 transition-colors"
                                    >
                                        <p className="text-xs font-bold text-blue-600">{o.id}</p>
                                        <p className="text-sm font-semibold text-slate-800 truncate">{o.supplier}</p>
                                    </div>
                                ))}
                                {tasks.filter(t => !t.dueDate).map(t => (
                                    <div 
                                        key={t.id} 
                                        draggable 
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('itemType', 'project_task');
                                            e.dataTransfer.setData('itemId', t.id);
                                        }}
                                        onClick={() => onProjectTaskClick(t)}
                                        className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm cursor-grab hover:border-purple-400 transition-colors"
                                    >
                                        <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                                        <p className="text-[10px] text-slate-400 mt-1 uppercase">Project Task</p>
                                    </div>
                                ))}
                                {calendarTasks.filter(t => !t.date).map(t => (
                                    <div 
                                        key={t.id} 
                                        draggable 
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('itemType', 'calendar_task');
                                            e.dataTransfer.setData('itemId', String(t.id));
                                        }}
                                        className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm cursor-grab hover:border-sky-400 transition-colors"
                                    >
                                        <p className="text-sm font-semibold text-slate-800">{t.title || '(Untitled)'}</p>
                                        <p className="text-[10px] text-slate-400 mt-1 uppercase">Personal Task</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'reminders' && (
                <RemindersLayout 
                    orders={orders}
                    tasks={tasks}
                    calendarTasks={calendarTasks}
                    calendarLists={calendarLists}
                    allEventsByDate={allEventsByDate}
                    onItemDropOnCalendar={handleDrop}
                    onSetReminder={onSetReminder}
                    onTaskClick={onProjectTaskClick}
                    onOrderClick={onOrderClick}
                    onAddTask={addCalendarTask}
                    onUpdateTask={updateCalendarTask}
                    onDeleteTask={deleteCalendarTask}
                    onUpdateProjectTask={updateTask}
                    onUpdateList={updateCalendarList}
                    onDeleteList={deleteCalendarList}
                    onReorderLists={reorderCalendarLists}
                    onReorderTasks={reorderCalendarTasks}
                    setHoverInfo={setHoverInfo}
                    currentDate={currentDate}
                    setCurrentDate={setCurrentDate}
                />
            )}

            {activeTab === 'notes' && (
                <div className="flex-1 flex min-h-0 overflow-hidden bg-white">
                    <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50">
                        <div className="p-4 border-b border-slate-200">
                             <input 
                                type="search" 
                                placeholder={t('calendar.searchPlaceholder')}
                                value={searchNotesQuery}
                                onChange={(e) => setSearchNotesQuery(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-indigo-500" 
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1" ref={notesListRef}>
                             {sortedDateKeys.map(dateKey => (
                                 <div key={dateKey} className="mb-4">
                                     <h4 className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1">{formatDisplayDate(dateKey, i18n.language)}</h4>
                                     <div className="space-y-1">
                                         {groupedNotes[dateKey].map(note => (
                                             <div 
                                                key={note.id}
                                                onClick={() => setSelectedNoteId(note.id)}
                                                className={`p-3 rounded-lg cursor-pointer transition-all border ${selectedNoteId === note.id ? 'bg-white border-indigo-500 shadow-sm' : 'border-transparent hover:bg-slate-200'}`}
                                            >
                                                <h5 className="font-bold text-sm text-slate-800 truncate">{getNoteTitle(note.content)}</h5>
                                                <p className="text-xs text-slate-500 mt-1 truncate">{getNotePreview(note.content)}</p>
                                            </div>
                                         ))}
                                     </div>
                                 </div>
                             ))}
                             {sortedDateKeys.length === 0 && (
                                <div className="text-center py-10 text-slate-400 italic text-sm">{t('calendar.noNotes')}</div>
                             )}
                        </div>
                        <div className="p-4 border-t border-slate-200">
                             <button onClick={handleCreateNote} className="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 shadow-sm transition-all active:scale-95">
                                {t('calendar.addNote')}
                             </button>
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col bg-white overflow-hidden">
                        {selectedNote ? (
                            <>
                                <header className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                                     <div>
                                        <h3 className="font-bold text-slate-800">{formatDisplayDate(selectedNote.date, i18n.language)}</h3>
                                        <p className="text-xs text-slate-400">Manual Sorting: Row {selectedNote.order + 1}</p>
                                     </div>
                                     <div className="flex gap-x-2">
                                         <button onClick={() => onOpenDailyView(selectedNote.date)} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-full transition-all" title="Open in Day View">
                                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
                                         </button>
                                         <button onClick={() => handleDeleteNote(selectedNote.id)} className="p-2 text-slate-500 hover:text-red-600 hover:bg-white rounded-full transition-all" title="Delete Note">
                                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                                         </button>
                                     </div>
                                </header>
                                <div className="flex-1 overflow-y-auto p-8" style={{ backgroundColor: selectedNote.color + '15' }}>
                                    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 min-h-full flex flex-col">
                                         <div className="flex-1 p-8">
                                            <RichTextEditor
                                                value={selectedNote.content}
                                                onChange={(val) => updateCalendarStickyNote(selectedNote.id, { content: val })}
                                                placeholder={t('calendar.notePlaceholder') as string}
                                                className="w-full text-lg text-slate-800"
                                                contentClassName="min-h-[50vh]"
                                                autoFocus={true}
                                            />
                                         </div>
                                         <footer className="p-4 bg-slate-50 rounded-b-xl border-t border-slate-100 flex gap-x-2">
                                             {['#FFF9C4', '#F3E5F5', '#E3F2FD', '#E8F5E9', '#FFF3E0'].map(color => (
                                                 <button 
                                                    key={color}
                                                    onClick={() => updateCalendarStickyNote(selectedNote.id, { color })}
                                                    className={`w-6 h-6 rounded-full border border-black/10 transition-transform hover:scale-125 ${selectedNote.color === color ? 'ring-2 ring-indigo-500 scale-110' : ''}`}
                                                    style={{ backgroundColor: color }}
                                                 />
                                             ))}
                                         </footer>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                <p className="text-lg font-medium">{t('calendar.selectNote')}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {contextMenu.visible && (
                <div
                    ref={contextMenuRef}
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    className="fixed z-[100] bg-white shadow-xl rounded-md border border-slate-200 py-1"
                >
                    <button
                        onClick={handleSetReminderFromContext}
                        className="w-full text-left rtl:text-right px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-x-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {t('reminders.setReminder')}
                    </button>
                    <button
                        onClick={() => { onOpenDailyView(contextMenu.date!); setContextMenu({...contextMenu, visible: false}); }}
                        className="w-full text-left rtl:text-right px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-x-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        View Daily Schedule
                    </button>
                </div>
            )}

            <AICalendarTasksModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} onSubmit={(tasks) => { if(contextMenu.date) addCalendarTasks(contextMenu.date, tasks); setIsAiModalOpen(false); }} aiSettings={aiSettings} />
            <AIStickyNoteModal isOpen={isAiNoteModalOpen} onClose={() => setIsAiNoteModalOpen(false)} onSubmit={(content) => { if(contextMenu.date) addCalendarStickyNote(contextMenu.date, content); setIsAiNoteModalOpen(false); }} aiSettings={aiSettings} />
            <PrintOptionsModal 
                isOpen={isPrintModalOpen} 
                onClose={() => setIsPrintModalOpen(false)} 
                onPrint={handlePrintSchedule} 
                onCopyToClipboard={handleCopyToClipboard} 
            />
        </div>
    );
};

export default CalendarView;
