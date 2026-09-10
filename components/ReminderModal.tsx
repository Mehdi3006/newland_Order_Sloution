
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Order, Task, CalendarTask } from '../types';
import { formatDisplayDate } from '../utils/dateUtils';
import jalaali from 'jalaali-js';

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


interface ReminderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSetReminder: (date: string | null, message: string | null) => void;
    item: Order | Task | CalendarTask | null;
    type: 'order' | 'task' | 'calendarTask' | null;
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

const ReminderModal: React.FC<ReminderModalProps> = ({ isOpen, onClose, onSetReminder, item, type }) => {
    const { t, i18n } = useTranslation();
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [message, setMessage] = useState('');
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const dateButtonRef = useRef<HTMLButtonElement>(null);
    const isJalali = i18n.language === 'fa';

    useEffect(() => {
        if (isOpen) {
            let d: Date;
            if (item?.reminder?.date) {
                d = new Date(item.reminder.date);
                setMessage(item.reminder.message);
            } else {
                // Set default to tomorrow at 9 AM
                d = new Date();
                d.setDate(d.getDate() + 1);
                d.setHours(9, 0, 0, 0);
                setMessage('');
            }
            // Extract components based on local time after conversion from ISO
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            
            setDate(`${year}-${month}-${day}`);
            setTime(`${hours}:${minutes}`);
        }
    }, [isOpen, item]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!date || !time) return;
        
        const [year, month, day] = date.split('-').map(Number);
        const [hour, minute] = time.split(':').map(Number);
        // JS month is 0-indexed, so subtract 1
        const localDate = new Date(year, month - 1, day, hour, minute);

        onSetReminder(localDate.toISOString(), message.trim());
    };
    
    const handleDelete = () => {
        if (window.confirm(t('confirmationModal.deleteItemBody'))) {
            onSetReminder(null, null);
        }
    };

    const titleText = type === 'order'
        ? `${t('reminders.reminderFor')} "${(item as Order)?.id}"`
        : `${t('reminders.reminderFor')} "${item && 'title' in item ? item.title : ''}"`;

    if (!isOpen) return null;

    const renderDateInput = () => {
        if (isJalali) {
            return (
                <div className="relative">
                    <button
                        ref={dateButtonRef}
                        type="button"
                        onClick={() => setIsDatePickerOpen(p => !p)}
                        className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500 text-left"
                    >
                        {date ? formatDisplayDate(date, i18n.language) : 'Select a date'}
                    </button>
                    {isDatePickerOpen && date && (
                        <JalaliDatePicker
                            targetRef={dateButtonRef}
                            selectedDate={date}
                            onSelectDate={(newDateString) => {
                                setDate(newDateString);
                                setIsDatePickerOpen(false);
                            }}
                            onClose={() => setIsDatePickerOpen(false)}
                        />
                    )}
                </div>
            );
        }

        return (
            <input
                id="reminderDate"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                onKeyDown={handleFormKeyDown}
                required
                className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
            />
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit}>
                    <header className="p-6 border-b border-slate-200">
                        <h2 className="text-xl font-bold text-gray-800">{t('reminders.setReminder')}</h2>
                        <p className="text-sm text-slate-500 truncate">{titleText}</p>
                    </header>
                    <main className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    {t('labels.date')}
                                </label>
                                {renderDateInput()}
                            </div>
                            <div>
                                <label htmlFor="reminderTime" className="block text-sm font-medium text-slate-700 mb-1">
                                    {t('reminders.time')}
                                </label>
                                <input
                                    id="reminderTime"
                                    type="time"
                                    value={time}
                                    onChange={e => setTime(e.target.value)}
                                    onKeyDown={handleFormKeyDown}
                                    required
                                    dir="ltr"
                                    className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="reminderMessage" className="block text-sm font-medium text-slate-700 mb-1">
                                {t('reminders.customMessage')}
                            </label>
                            <textarea
                                id="reminderMessage"
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                onKeyDown={handleFormKeyDown}
                                rows={3}
                                placeholder={t('reminders.placeholder') as string}
                                className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500"
                            />
                        </div>
                    </main>
                    <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-between items-center">
                        <div>
                            {item?.reminder && (
                                <button type="button" onClick={handleDelete} className="text-red-600 font-semibold px-4 py-2 rounded-md hover:bg-red-50">
                                    {t('buttons.delete')}
                                </button>
                            )}
                        </div>
                        <div className="flex gap-x-3">
                            <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('buttons.save')}</button>
                        </div>
                    </footer>
                </form>
            </div>
        </div>
    );
};

export default ReminderModal;
