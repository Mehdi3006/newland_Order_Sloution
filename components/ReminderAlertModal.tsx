import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
// FIX: Import CalendarTask to handle calendar-based reminders.
import { Order, Task, CalendarTask } from '../types';
import { formatDisplayTime } from '../utils/dateUtils';

interface ReminderAlertModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAcknowledge: () => void;
    // FIX: Update item and type props to include CalendarTask.
    item: Order | Task | CalendarTask | null;
    type: 'order' | 'task' | 'calendarTask' | null;
    onSnooze: (snoozeUntil: Date) => void;
}

const ReminderAlertModal: React.FC<ReminderAlertModalProps> = ({ isOpen, onClose, onAcknowledge, item, type, onSnooze }) => {
    const { t, i18n } = useTranslation();
    const intervalRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const beepCountRef = useRef<number>(0);

    useEffect(() => {
        let isMounted = true;

        const stopAlarm = () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(console.error);
                audioContextRef.current = null;
            }
        };

        const startAlarm = async () => {
            if (!isMounted) return;
            
            stopAlarm(); // Ensure any previous alarm is stopped
            beepCountRef.current = 0; // Reset counter

            try {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                if (audioContextRef.current.state === 'suspended') {
                    await audioContextRef.current.resume();
                }

                const playBeepAndCheckCount = () => {
                    if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
                    
                    const oscillator = audioContextRef.current.createOscillator();
                    const gainNode = audioContextRef.current.createGain();
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(audioContextRef.current.destination);

                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(880, audioContextRef.current.currentTime); // A5 note
                    gainNode.gain.setValueAtTime(0.3, audioContextRef.current.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContextRef.current.currentTime + 0.4);

                    oscillator.start(audioContextRef.current.currentTime);
                    oscillator.stop(audioContextRef.current.currentTime + 0.5);

                    beepCountRef.current++;
                    if (beepCountRef.current >= 10 && intervalRef.current) {
                        clearInterval(intervalRef.current);
                        intervalRef.current = null;
                    }
                };
                
                playBeepAndCheckCount(); // Play immediately
                intervalRef.current = window.setInterval(playBeepAndCheckCount, 1500); // Repeat every 1.5 seconds

                if ('vibrate' in navigator) {
                    navigator.vibrate([200, 100, 200, 100, 200]); // Vibrate pattern
                }

            } catch (error) {
                console.error("Could not play notification sound:", error);
            }
        };
        
        if (isOpen) {
            startAlarm();
        }

        return () => {
            isMounted = false;
            stopAlarm();
        };
    }, [isOpen]);

    if (!isOpen || !item || !type) return null;
    
    // FIX: Handle title and message generation for all possible item types.
    const isOrder = type === 'order';
    const titleText = isOrder 
        ? `Order: ${(item as Order).id}` 
        : `Task: ${item && 'title' in item ? item.title : ''}`;
    
    const genericMessage = isOrder 
        ? t('reminders.genericOrder', { id: (item as Order).id })
        : t('reminders.genericTask', { title: item && 'title' in item ? item.title : '' });
        
    const message = item.reminder?.message || genericMessage;
    const reminderDate = new Date(item.reminder?.date || Date.now());
    
    const formattedDate = reminderDate.toLocaleDateString(i18n.language, { dateStyle: 'full' });
    const formattedTime = formatDisplayTime(reminderDate);
    
    const handleSnoozeHour = () => {
        const newDate = new Date();
        newDate.setHours(newDate.getHours() + 1);
        onSnooze(newDate);
    };

    const handleSnoozeTomorrow = () => {
        const newDate = new Date();
        newDate.setDate(newDate.getDate() + 1);
        newDate.setHours(9, 0, 0, 0); // Tomorrow at 9 AM
        onSnooze(newDate);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" role="alertdialog" aria-modal="true" aria-labelledby="reminder-alert-title">
                <header className="p-6 border-b border-slate-200 flex items-center gap-x-3">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                        </svg>
                    </div>
                    <div>
                        <h2 id="reminder-alert-title" className="text-xl font-bold text-gray-800">{t('reminders.title')}</h2>
                        <p className="text-sm text-slate-500">{titleText}</p>
                    </div>
                </header>
                <main className="p-6">
                    <p className="text-slate-700 text-lg mb-2">{message}</p>
                    <p className="text-sm text-slate-500">
                        {formattedDate} - <span dir="ltr" className="inline-block">{formattedTime}</span>
                    </p>
                </main>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3">
                    <button type="button" onClick={handleSnoozeHour} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('reminders.snooze1Hour')}</button>
                    <button type="button" onClick={handleSnoozeTomorrow} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('reminders.snoozeTomorrow')}</button>
                    <button type="button" onClick={onAcknowledge} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('buttons.acknowledge')}</button>
                </footer>
            </div>
        </div>
    );
};

export default ReminderAlertModal;