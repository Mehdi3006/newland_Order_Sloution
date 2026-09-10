
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarTask, CalendarStickyNote, DailyImage, DailyAttachment, AISettings, TaskPriority } from '../types';
import { useModals } from '../contexts/ModalContext';
import ImageCropperModal from './ImageCropperModal';
import { formatDisplayDate } from '../utils/dateUtils';
import jalaali from 'jalaali-js';
import AICalendarTasksModal from './AICalendarTasksModal';
import AIStickyNoteModal from './AIStickyNoteModal';
import RichTextEditor from './RichTextEditor';

interface DailyViewModalProps {
    date: string;
    onClose: () => void;
    onDateChange: (newDate: string) => void;
    // Calendar props
    calendarTasks: CalendarTask[];
    addCalendarTask: (date: string, title: string, categoryId?: string) => Promise<number>;
    addCalendarTasks: (date: string, titles: string[]) => Promise<number[]>;
    updateCalendarTask: (taskId: number, updates: Partial<CalendarTask>) => Promise<void>;
    deleteCalendarTask: (taskId: number) => Promise<void>;
    moveAllCalendarItemsForDate: (oldDate: string, newDate: string) => Promise<void>;
    reorderDailyTasks: (reorderedTasks: CalendarTask[]) => Promise<void>;
    calendarStickyNotes: CalendarStickyNote[];
    addCalendarStickyNote: (date: string, content?: string) => Promise<string>;
    updateCalendarStickyNote: (noteId: string, updates: Partial<CalendarStickyNote>) => Promise<void>;
    deleteCalendarStickyNote: (noteId: string) => Promise<void>;
    reorderDailyStickyNotes: (reorderedNotes: CalendarStickyNote[]) => Promise<void>;
    // Media props
    dailyImages: DailyImage[];
    addDailyImage: (date: string, name: string, data: string) => Promise<void>;
    updateDailyImage: (imageId: number, updates: Partial<DailyImage>) => Promise<void>;
    deleteDailyImage: (imageId: number) => Promise<void>;
    dailyAttachments: DailyAttachment[];
    addDailyAttachment: (date: string, file: File) => Promise<void>;
    deleteDailyAttachment: (attachmentId: number) => Promise<void>;
    moveAllDailyMediaForDate: (oldDate: string, newDate: string) => Promise<void>;
    aiSettings?: AISettings;
    onOpenNoteDetail: (note: CalendarStickyNote) => void;
    onSetReminder: (item: CalendarTask, type: 'calendarTask') => void;
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
    high: 'bg-red-500',
    medium: 'bg-amber-500',
    low: 'bg-blue-500'
};

// --- Custom Jalali Date Picker ---
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
        <div ref={pickerRef} className="absolute top-full mt-2 z-50 bg-white shadow-lg rounded-lg border border-slate-200 p-3 w-72 text-right" dir="rtl">
            <div className="flex justify-between items-center mb-2">
                 <button type="button" onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-slate-100">&gt;</button>
                 <span className="font-semibold">{headerText}</span>
                 <button type="button" onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-slate-100">&lt;</button>
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

// Sub-components for tasks and notes
const DailyTaskItem: React.FC<{ task: CalendarTask; onUpdate: (id: number, updates: Partial<CalendarTask>) => void; onDelete: (id: number) => void; onSetReminder: () => void; }> = ({ task, onUpdate, onDelete, onSetReminder }) => {
    const { t } = useTranslation();
    const [isEditing, setIsEditing] = useState(!task.title);
    const [title, setTitle] = useState(task.title);
    const inputRef = useRef<HTMLInputElement>(null);

    const hasReminder = task.reminder && !task.reminder.acknowledged;

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
        }
    }, [isEditing]);

    const handleSave = () => {
        const trimmedTitle = title.trim();
        if (trimmedTitle !== task.title) {
            onUpdate(task.id, { title: trimmedTitle });
        }
        setIsEditing(false);
    };

    const handleCyclePriority = () => {
        const current = task.priority || 'low';
        const sequence: TaskPriority[] = ['low', 'medium', 'high'];
        const next = sequence[(sequence.indexOf(current) + 1) % sequence.length];
        onUpdate(task.id, { priority: next });
    };


    return (
        <div className="group flex items-start gap-x-2 p-1.5 rounded text-sm hover:bg-slate-100">
            <input
                type="checkbox"
                checked={task.isDone}
                onChange={e => {
                    const isDone = e.target.checked;
                    const updates: Partial<CalendarTask> = { isDone };
                    if (isDone) {
                        updates.reminder = undefined;
                    }
                    onUpdate(task.id, updates);
                }}
                className="mt-1 h-4 w-4 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500"
            />
            <button 
                onClick={handleCyclePriority}
                className={`mt-1.5 w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${PRIORITY_COLORS[task.priority || 'low']}`}
                title={`Priority: ${task.priority || 'low'}`}
            />
            <div className="flex-1 flex items-center gap-x-1 min-w-0">
                {isEditing ? (
                    <input ref={inputRef} type="text" value={title} onChange={e => setTitle(e.target.value)} onBlur={handleSave} onKeyDown={e => e.key === 'Enter' && handleSave()} className="flex-1 bg-white border border-indigo-400 rounded px-1 -my-0.5" />
                ) : (
                    <span onDoubleClick={() => setIsEditing(true)} className={`flex-1 truncate ${task.isDone ? 'line-through text-slate-500' : 'text-slate-800'}`}>{task.title}</span>
                )}
                {hasReminder && (
                    <div className="text-yellow-500 flex-shrink-0" title="Reminder is set">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>
                    </div>
                )}
            </div>
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onClick={onSetReminder} className="p-1 text-slate-500 hover:text-indigo-600" title="Set Reminder">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>
                </button>
                <button onClick={() => onDelete(task.id)} className="p-1 text-red-500 hover:text-red-700">
                    &times;
                </button>
            </div>
        </div>
    );
};

const DailyStickyNote: React.FC<{ note: CalendarStickyNote; onUpdate: (id: string, updates: Partial<CalendarStickyNote>) => void; onDelete: (id: string) => void; onView: (note: CalendarStickyNote) => void; }> = ({ note, onUpdate, onDelete, onView }) => {
    const { t } = useTranslation();
    const { showConfirmation } = useModals();
    const [content, setContent] = useState(note.content);
    
    const isLongNote = note.content.length > 200;

    const handleDeleteClick = () => {
        showConfirmation({
            title: t('confirmationModal.deleteStickyNoteTitle'),
            message: t('confirmationModal.deleteStickyNoteBody'),
            variant: 'destructive',
            onConfirm: () => onDelete(note.id),
        });
    };

    const handleBlur = () => {
        if (content !== note.content) {
            onUpdate(note.id, { content });
        }
    };

    return (
        <div style={{ backgroundColor: note.color }} className="group relative p-2 rounded-md shadow-sm text-sm">
            <RichTextEditor
                value={content}
                onChange={setContent}
                onBlur={handleBlur}
                placeholder={t('calendar.addNote') as string}
                className="w-full"
                contentClassName="min-h-[2.5rem] max-h-32 text-gray-800"
                simple={true}
            />

            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                {isLongNote && (
                     <button onClick={() => onView(note)} className="p-1.5 rounded-full text-slate-700 bg-white/60 hover:bg-white/90 shadow-sm" title="Zoom in">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M8 3a5 5 0 100 10 5 5 0 000-10zM2 8a8 8 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A8 8 0 012 8zm5 0a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}
            </div>
             <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                 <button onClick={handleDeleteClick} className="p-1.5 rounded-full text-slate-700 bg-white/60 hover:bg-white/90 shadow-sm" title={t('buttons.delete') as string}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                 </button>
            </div>
        </div>
    );
};


// Main Modal Component
const DailyViewModal: React.FC<DailyViewModalProps> = (props) => {
    const { 
        date, onClose, onDateChange,
        calendarTasks, addCalendarTask, addCalendarTasks, updateCalendarTask, deleteCalendarTask, moveAllCalendarItemsForDate, reorderDailyTasks,
        calendarStickyNotes, addCalendarStickyNote, updateCalendarStickyNote, deleteCalendarStickyNote, reorderDailyStickyNotes,
        dailyImages, addDailyImage, updateDailyImage, deleteDailyImage,
        dailyAttachments, addDailyAttachment, deleteDailyAttachment, moveAllDailyMediaForDate,
        aiSettings, onOpenNoteDetail, onSetReminder
    } = props;
    
    const { t, i18n } = useTranslation();
    const { showConfirmation, addToast } = useModals();

    const imageInputRef = useRef<HTMLInputElement>(null);
    const attachmentInputRef = useRef<HTMLInputElement>(null);
    const dateInputRef = useRef<HTMLInputElement>(null);
    const dateButtonRef = useRef<HTMLButtonElement>(null);
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [isAiNoteModalOpen, setIsAiNoteModalOpen] = useState(false);

    const [cropperState, setCropperState] = useState<{ isOpen: boolean; src: string | null; file: File | null; imageToEdit: DailyImage | null }>({ isOpen: false, src: null, file: null, imageToEdit: null });
    const [lightboxState, setLightboxState] = useState<{ isOpen: boolean; currentIndex: number | null }>({ isOpen: false, currentIndex: null });
    
    const [draggedItem, setDraggedItem] = useState<{ id: string | number; type: 'task' | 'note' } | null>(null);
    const [dragOverItem, setDragOverItem] = useState<{ id: string | number; type: 'task' | 'note' } | null>(null);

    const dailyTasks = useMemo(() => calendarTasks.filter(t => t.date === date).sort((a, b) => {
        if (a.isDone && !b.isDone) return 1;
        if (!a.isDone && b.isDone) return -1;
        return a.order - b.order;
    }), [calendarTasks, date]);
    const dailyNotes = useMemo(() => calendarStickyNotes.filter(n => n.date === date).sort((a, b) => a.order - b.order), [calendarStickyNotes, date]);
    const imagesForDay = useMemo(() => dailyImages.filter(i => i.date === date), [dailyImages, date]);
    const attachmentsForDay = useMemo(() => dailyAttachments.filter(a => a.date === date), [dailyAttachments, date]);
    
    const handleDateChangeWithConfirmation = (newDate: string) => {
        const oldDate = date;
        if (!newDate || newDate === oldDate) return;

        const formattedOldDate = formatDisplayDate(oldDate, i18n.language);
        const formattedNewDate = formatDisplayDate(newDate, i18n.language);

        showConfirmation({
            title: "Move All Items?",
            message: `Are you sure you want to move all tasks, notes, and media from ${formattedOldDate} to ${formattedNewDate}?`,
            variant: "primary",
            confirmText: "Move",
            onConfirm: async () => {
                try {
                    if (dailyTasks.length > 0 || dailyNotes.length > 0 || imagesForDay.length > 0 || attachmentsForDay.length > 0) {
                        await moveAllCalendarItemsForDate(oldDate, newDate);
                        await moveAllDailyMediaForDate(oldDate, newDate);
                        addToast(`All items moved to ${formattedNewDate}`, 'success');
                    }
                    onDateChange(newDate);
                } catch (error) {
                    addToast('Failed to move items.', 'error');
                }
            }
        });
    };
    
    const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleDateChangeWithConfirmation(e.target.value);
    };
    
    const handleDateDisplayClick = () => {
        if (i18n.language === 'fa') setIsDatePickerOpen(p => !p);
        else {
            if (dateInputRef.current) {
                try { dateInputRef.current.showPicker(); } catch (error) { dateInputRef.current.focus(); }
            }
        }
    };

    const handleDragStart = (e: React.DragEvent, id: string | number, type: 'task' | 'note') => {
        e.dataTransfer.effectAllowed = 'move';
        (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
        setDraggedItem({ id, type });
    };

    const handleDragEnd = (e: React.DragEvent) => {
        (e.currentTarget as HTMLElement).style.cursor = 'grab';
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const handleDragOver = (e: React.DragEvent, id: string | number, type: 'task' | 'note') => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedItem && draggedItem.type === type && draggedItem.id !== id) setDragOverItem({ id, type });
    };
    
    const handleDrop = (e: React.DragEvent, targetType: 'task' | 'note', targetId: string | number | null) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedItem || draggedItem.type !== targetType) { handleDragEnd(e); return; }

        if (targetType === 'task') {
            const items = [...dailyTasks];
            const draggedIndex = items.findIndex(item => item.id === draggedItem.id);
            let targetIndex = targetId !== null ? items.findIndex(item => item.id === targetId) : items.length;
            if (draggedIndex === -1) { handleDragEnd(e); return; }
            const [dragged] = items.splice(draggedIndex, 1);
            items.splice(targetIndex, 0, dragged);
            reorderDailyTasks(items);
        } else { 
            const items = [...dailyNotes];
            const draggedIndex = items.findIndex(item => item.id === draggedItem.id);
            let targetIndex = targetId !== null ? items.findIndex(item => item.id === targetId) : items.length;
            if (draggedIndex === -1) { handleDragEnd(e); return; }
            const [dragged] = items.splice(draggedIndex, 1);
            items.splice(targetIndex, 0, dragged);
            reorderDailyStickyNotes(items);
        }
        handleDragEnd(e);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => { setCropperState({ isOpen: true, src: event.target?.result as string, file, imageToEdit: null }); };
        reader.readAsDataURL(file);
        if(e.target) e.target.value = '';
    };

    const handleCropComplete = (croppedImageUrl: string) => {
        if (cropperState.imageToEdit) updateDailyImage(cropperState.imageToEdit.id, { data: croppedImageUrl });
        else addDailyImage(date, cropperState.file?.name || `image-${Date.now()}.png`, croppedImageUrl);
        setCropperState({ isOpen: false, src: null, file: null, imageToEdit: null });
    };
    
    const openLightbox = (index: number) => setLightboxState({ isOpen: true, currentIndex: index });
    const closeLightbox = useCallback(() => setLightboxState({ isOpen: false, currentIndex: null }), []);
    const navigateLightbox = useCallback((direction: 'next' | 'prev') => {
        setLightboxState(prev => {
            if (prev.currentIndex === null) return prev;
            const totalImages = imagesForDay.length;
            if (totalImages === 0) return { isOpen: false, currentIndex: null };
            const nextIndex = (prev.currentIndex + (direction === 'next' ? 1 : -1) + totalImages) % totalImages;
            return { ...prev, currentIndex: nextIndex };
        });
    }, [imagesForDay.length]);

    const handleEditCurrentImage = () => {
        if (lightboxState.currentIndex === null) return;
        const imageToEdit = imagesForDay[lightboxState.currentIndex];
        if (imageToEdit) { closeLightbox(); setCropperState({ isOpen: true, src: imageToEdit.data, file: null, imageToEdit }); }
    };
    
    const handleDeleteCurrentImage = () => {
        if (lightboxState.currentIndex === null) return;
        const imageToDelete = imagesForDay[lightboxState.currentIndex];
        if (imageToDelete) {
            deleteDailyImage(imageToDelete.id);
            const newTotal = imagesForDay.length - 1;
            if (newTotal === 0) closeLightbox();
            else setLightboxState(prev => ({ ...prev, currentIndex: Math.max(0, lightboxState.currentIndex! - 1) }));
        }
    };

    const downloadCurrentImage = () => {
        if (lightboxState.currentIndex === null) return;
        const imageToDownload = imagesForDay[lightboxState.currentIndex];
        if (imageToDownload) {
            const a = document.createElement('a');
            a.href = imageToDownload.data; a.download = imageToDownload.name || `image-${imageToDownload.id}.png`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!lightboxState.isOpen) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowRight') navigateLightbox('next');
            if (e.key === 'ArrowLeft') navigateLightbox('prev');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightboxState.isOpen, closeLightbox, navigateLightbox]);


    const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        addDailyAttachment(date, file);
        if(e.target) e.target.value = '';
    };

    const downloadAttachment = (attachment: DailyAttachment) => {
        const blob = new Blob([attachment.data], { type: attachment.type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = attachment.name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDeleteAttachment = (attachmentId: number, attachmentName: string) => {
        showConfirmation({ title: t('confirmationModal.deleteAttachmentTitle'), message: t('confirmationModal.deleteAttachmentBody', { fileName: attachmentName }), variant: "destructive", onConfirm: () => deleteDailyAttachment(attachmentId) });
    };

    const currentImage = lightboxState.isOpen && lightboxState.currentIndex !== null ? imagesForDay[lightboxState.currentIndex] : null;

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <header className="p-4 border-b border-slate-200 flex-shrink-0 flex justify-between items-center">
                        <div className="relative">
                            <button
                                ref={dateButtonRef}
                                onClick={handleDateDisplayClick}
                                className="text-xl font-bold text-gray-800 bg-transparent p-1 -ml-2 rounded-md hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            >
                                {formatDisplayDate(date, i18n.language)}
                            </button>
                            {i18n.language === 'fa' && isDatePickerOpen && <JalaliDatePicker targetRef={dateButtonRef} selectedDate={date} onSelectDate={(newDateString) => { setIsDatePickerOpen(false); handleDateChangeWithConfirmation(newDateString); }} onClose={() => setIsDatePickerOpen(false)} />}
                            {i18n.language !== 'fa' && <input ref={dateInputRef} type="date" value={date} onChange={handleNativeDateChange} className="absolute w-full h-full top-0 left-0 opacity-0 cursor-pointer" style={{ zIndex: -1 }} />}
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full text-slate-500 hover:bg-slate-100">&times;</button>
                    </header>
                    <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-x-6 p-6 min-h-0">
                        <div className="flex flex-col gap-y-4 min-h-0">
                            <div className="flex-1 flex flex-col min-h-0 border border-slate-200 rounded-lg">
                                <h3 className="p-3 font-semibold text-slate-800 border-b">{t('calendar.toDoList')}</h3>
                                <div className="flex-1 overflow-y-auto p-2 space-y-1" onDragOver={e => { e.preventDefault(); setDragOverItem(null);}} onDrop={(e) => handleDrop(e, 'task', null)}>
                                    {dailyTasks.map(task => 
                                        <div key={task.id} draggable onDragStart={e => handleDragStart(e, task.id, 'task')} onDragEnd={handleDragEnd} onDragOver={e => handleDragOver(e, task.id, 'task')} onDrop={e => handleDrop(e, 'task', task.id)} className={`transition-opacity cursor-grab active:cursor-grabbing ${draggedItem?.id === task.id ? 'opacity-30' : ''}`}>
                                            {dragOverItem?.type === 'task' && dragOverItem?.id === task.id && <div className="h-1 bg-indigo-400 rounded-full my-1" />}
                                            <DailyTaskItem task={task} onUpdate={updateCalendarTask} onDelete={deleteCalendarTask} onSetReminder={() => onSetReminder(task, 'calendarTask')} />
                                        </div>
                                    )}
                                </div>
                                <div className="p-2 border-t flex items-center gap-x-2">
                                    <button onClick={() => addCalendarTask(date, '')} className="flex-1 flex items-center justify-center gap-x-2 text-sm text-indigo-600 font-semibold p-2 rounded hover:bg-indigo-50 border border-slate-300"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>{t('calendar.addTask')}</button>
                                    <button onClick={() => setIsAiModalOpen(true)} disabled={!aiSettings?.apiKey} className="flex-1 flex items-center justify-center gap-x-2 text-sm text-purple-600 font-semibold p-2 rounded hover:bg-purple-50 border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed" title={!aiSettings?.apiKey ? t('toasts.ai.apiKeyNotConfigured') : t('calendar.aiTitle')}><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 3zM6.03 5.23a.75.75 0 01.04 1.06l-1.97 1.97a.75.75 0 01-1.06-1.06l1.97-1.97a.75.75 0 011.06 0zm8 0a.75.75 0 011.06 0l1.97 1.97a.75.75 0 11-1.06 1.06l-1.97-1.97a.75.75 0 01.04-1.06zM10 18a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5H10a.75.75 0 01-.75-.75zM4.75 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm9.25-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zM6.03 14.77a.75.75 0 011.06 0l1.97 1.97a.75.75 0 11-1.06 1.06l-1.97-1.97a.75.75 0 01.04-1.06z" clipRule="evenodd" /></svg>{t('calendar.aiTitle')}</button>
                                </div>
                            </div>
                            <div className="flex-1 flex flex-col min-h-0 border border-slate-200 rounded-lg">
                                <h3 className="p-3 font-semibold text-slate-800 border-b">{t('calendar.stickyNotes')}</h3>
                                <div className="flex-1 overflow-y-auto p-2 space-y-2" onDragOver={e => { e.preventDefault(); setDragOverItem(null); }} onDrop={(e) => handleDrop(e, 'note', null)}>
                                    {dailyNotes.map(note => <div key={note.id} draggable onDragStart={e => handleDragStart(e, note.id, 'note')} onDragEnd={handleDragEnd} onDragOver={e => handleDragOver(e, note.id, 'note')} onDrop={e => handleDrop(e, 'note', note.id)}>{dragOverItem?.type === 'note' && dragOverItem?.id === note.id && <div className="h-1 bg-indigo-400 rounded-full my-1" />}<DailyStickyNote note={note} onUpdate={updateCalendarStickyNote} onDelete={deleteCalendarStickyNote} onView={onOpenNoteDetail} /></div>)}
                                </div>
                                <div className="p-2 border-t flex items-center gap-x-2">
                                    <button onClick={() => addCalendarStickyNote(date, '')} className="flex-1 flex items-center justify-center gap-x-2 text-sm text-indigo-600 font-semibold p-2 rounded hover:bg-indigo-50 border border-slate-300"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>{t('calendar.addNote')}</button>
                                    <button onClick={() => setIsAiNoteModalOpen(true)} disabled={!aiSettings?.apiKey} className="flex-1 flex items-center justify-center gap-x-2 text-sm text-purple-600 font-semibold p-2 rounded hover:bg-purple-50 border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed" title={!aiSettings?.apiKey ? t('toasts.ai.apiKeyNotConfigured') : t('calendar.aiNoteTitle')}><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>AI Assist</button>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-y-4 min-h-0">
                            <div className="flex-1 flex flex-col min-h-0 border border-slate-200 rounded-lg bg-slate-50">
                                <h3 className="p-3 font-semibold text-slate-800 border-b bg-white rounded-t-lg">{t('attributesGallery.imageGallery')}</h3>
                                <div className="flex-1 overflow-y-auto p-2"><div className="grid grid-cols-3 gap-2">{imagesForDay.map((img, index) => (<div key={img.id} className="relative group aspect-square cursor-pointer" onClick={() => openLightbox(index)}><img src={img.data} alt={img.name} className="w-full h-full object-cover rounded-md border border-slate-200" /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-md" /></div>))}<div onClick={() => imageInputRef.current?.click()} className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-md text-slate-400 hover:bg-slate-100 hover:border-slate-400 cursor-pointer transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg><span className="text-xs mt-1">{t('attributesGallery.upload')}</span></div></div></div>
                                <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                            </div>
                            <div className="flex-1 flex flex-col min-h-0 border border-slate-200 rounded-lg bg-slate-50">
                                <h3 className="p-3 font-semibold text-slate-800 border-b bg-white rounded-t-lg">Attachments</h3>
                                <div className="flex-1 overflow-y-auto p-2 space-y-2">{attachmentsForDay.map(att => (<div key={att.id} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-md shadow-sm"><div className="flex items-center gap-x-2 truncate"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" clipRule="evenodd" /></svg><span className="text-sm text-slate-700 truncate" title={att.name}>{att.name}</span></div><div className="flex items-center gap-x-1"><button onClick={() => downloadAttachment(att)} className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button><button onClick={() => handleDeleteAttachment(att.id, att.name)} className="p-1 text-red-600 hover:bg-red-50 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg></button></div></div>))}<button onClick={() => attachmentInputRef.current?.click()} className="w-full py-2 text-sm text-indigo-600 font-semibold bg-indigo-50 hover:bg-indigo-100 rounded-md border border-indigo-200 border-dashed">{t('labels.uploadFile')}</button><input type="file" ref={attachmentInputRef} onChange={handleAttachmentUpload} className="hidden" /></div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
            <ImageCropperModal isOpen={cropperState.isOpen} src={cropperState.src} onClose={() => setCropperState({ isOpen: false, src: null, file: null, imageToEdit: null })} onCropComplete={handleCropComplete} />
            {lightboxState.isOpen && currentImage && (<div className="fixed inset-0 z-[80] bg-black/90 flex flex-col" onClick={closeLightbox}><div className="flex-1 flex items-center justify-center relative p-4"><img src={currentImage.data} alt={currentImage.name} className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} /><button onClick={(e) => { e.stopPropagation(); navigateLightbox('prev'); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/70 hover:text-white bg-black/50 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button><button onClick={(e) => { e.stopPropagation(); navigateLightbox('next'); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/70 hover:text-white bg-black/50 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button></div><div className="p-4 flex justify-center gap-4" onClick={e => e.stopPropagation()}><button onClick={handleEditCurrentImage} className="text-white hover:text-indigo-300 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>Edit</button><button onClick={downloadCurrentImage} className="text-white hover:text-green-300 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>Download</button><button onClick={handleDeleteCurrentImage} className="text-white hover:text-red-300 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>Delete</button><button onClick={closeLightbox} className="text-white hover:text-slate-300 ml-8">Close</button></div></div>)}
            {isAiModalOpen && (<AICalendarTasksModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} onSubmit={(tasks) => { addCalendarTasks(date, tasks); setIsAiModalOpen(false); }} aiSettings={aiSettings} />)}
            {isAiNoteModalOpen && (<AIStickyNoteModal isOpen={isAiNoteModalOpen} onClose={() => setIsAiNoteModalOpen(false)} onSubmit={(content) => { addCalendarStickyNote(date, content); setIsAiNoteModalOpen(false); }} aiSettings={aiSettings} />)}
        </>
    );
};

export default DailyViewModal;
