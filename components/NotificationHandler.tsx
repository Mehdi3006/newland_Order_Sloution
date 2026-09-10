
import React, { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Toast } from './Toast';
import { Order, Task, CalendarTask } from '../types';
import { useTranslation } from 'react-i18next';

interface NotificationHandlerProps {
    addToast: (message: string, type: Toast['type']) => void;
    onShowReminderAlert: (item: Order | Task | CalendarTask, type: 'order' | 'task' | 'calendarTask') => void;
    calendarTasks?: CalendarTask[];
}

const NotificationHandler: React.FC<NotificationHandlerProps> = ({ addToast, onShowReminderAlert, calendarTasks }) => {
    const { t } = useTranslation();
    const settings = useLiveQuery(() => db.settings.toArray(), []);
    const orders = useLiveQuery(() => db.orders.where('isArchived').notEqual(1).toArray(), []);
    const tasks = useLiveQuery(() => db.tasks.toArray(), []);

    // Use a ref to store which notifications have been shown in the current session
    const shownNotifications = useRef(new Set<string>());
    const shownReminders = useRef(new Set<string>());

    // Request native notification permission on mount
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    const sendNativeNotification = (title: string, body: string) => {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/assets/icon.png' });
        }
    };

    useEffect(() => {
        const checkNotifications = () => {
            if (!settings || !orders || !tasks) return;

            const now = new Date();
            const currentTime = now.getTime();

            // --- 1. Check for user-set reminders ---
            const allItems: ({ item: Order | Task | CalendarTask; type: 'order' | 'task' | 'calendarTask' })[] = [
                ...(orders || []).map(o => ({ item: o, type: 'order' as const })),
                ...(tasks || []).map(t => ({ item: t, type: 'task' as const })),
                ...(calendarTasks || []).map(ct => ({ item: ct, type: 'calendarTask' as const })),
            ];

            for (const { item, type } of allItems) {
                if (item.reminder && !item.reminder.acknowledged) {
                    const reminderTime = new Date(item.reminder.date).getTime();
                    const reminderKey = `${type}-${item.id}`;
                    if (currentTime >= reminderTime && !shownReminders.current.has(reminderKey)) {
                        onShowReminderAlert(item, type);
                        shownReminders.current.add(reminderKey);
                        
                        // Also send native notification for reminders
                        const message = item.reminder.message || t(`reminders.generic${type === 'order' ? 'Order' : 'Task'}`, { id: item.id, title: (item as any).title });
                        sendNativeNotification(t('reminders.title'), message);
                    }
                }
            }
            
            // --- 2. Check for system notifications ---
            const loadingSettings = settings.find(s => s.key === 'loadingDateNotifications')?.value;
            const creditSettings = settings.find(s => s.key === 'creditPaymentNotifications')?.value;

            (orders || []).forEach(order => {
                // Loading Date Reminder
                if (loadingSettings?.enabled && order.approxLoadingDate) {
                    const key = `loading-${order.id}`;
                    const targetDate = new Date(order.approxLoadingDate + 'T00:00:00Z');
                    const diffDays = Math.ceil((targetDate.getTime() - currentTime) / (1000 * 60 * 60 * 24));
                    
                    if (diffDays >= 0 && diffDays <= loadingSettings.daysInAdvance && !shownNotifications.current.has(key)) {
                        const message = t('toasts.loadingDateReminder', { orderId: order.id, days: diffDays });
                        addToast(message, 'info');
                        sendNativeNotification("Loading Reminder", message);
                        shownNotifications.current.add(key);
                    }
                }

                // Credit Payment Reminder
                if (creditSettings?.enabled && order.purchaseType === 'credit' && order.creditPaymentDueDate) {
                     const key = `credit-${order.id}`;
                     const targetDate = new Date(order.creditPaymentDueDate + 'T00:00:00Z');
                     const diffDays = Math.ceil((targetDate.getTime() - currentTime) / (1000 * 60 * 60 * 24));

                     if (diffDays >= 0 && diffDays <= creditSettings.daysInAdvance && !shownNotifications.current.has(key)) {
                        const message = t('toasts.paymentDueReminder', { orderId: order.id, days: diffDays });
                        addToast(message, 'info');
                        sendNativeNotification("Payment Reminder", message);
                        shownNotifications.current.add(key);
                    }
                }
            });
        };

        checkNotifications();
        const intervalId = setInterval(checkNotifications, 10000); // Check every 10 seconds

        return () => clearInterval(intervalId);
    }, [settings, orders, tasks, calendarTasks, addToast, onShowReminderAlert, t]);

    return null;
};

export default NotificationHandler;
