
import React, { useMemo } from 'react';
import { Task } from '../types';
import { useTranslation } from 'react-i18next';
import { formatDisplayDate } from '../utils/dateUtils';

interface TaskCardProps {
    task: Task;
    onClick: (task: Task) => void;
    onSetReminder: (item: Task, type: 'task') => void;
    isDone: boolean;
    isOverdue: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, onSetReminder, isDone, isOverdue }) => {
    const { t, i18n } = useTranslation();
    const hasChecklist = task.checklist && task.checklist.length > 0;
    const checklistProgress = useMemo(() => {
        if (!hasChecklist) return 0;
        const doneCount = task.checklist!.filter(i => i.isDone).length;
        return (doneCount / task.checklist!.length) * 100;
    }, [task.checklist, hasChecklist]);

    const hasAttachments = task.attachments && task.attachments.length > 0;
    const hasReminder = task.reminder && !task.reminder.acknowledged;

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData('taskId', task.id);
        e.stopPropagation(); // Prevent column from being dragged
        e.currentTarget.style.opacity = '0.4';
    };

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        e.currentTarget.style.opacity = '1';
    };

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={() => onClick(task)}
            className="bg-white rounded-md shadow border border-slate-200 cursor-pointer hover:shadow-md hover:border-indigo-300 p-3"
        >
            <p className={`font-semibold text-sm ${isDone ? 'line-through text-slate-500' : 'text-slate-800'} ${isOverdue ? 'font-bold text-red-600' : ''}`}>{task.title}</p>
            <div className="mt-2 flex justify-between items-center text-xs text-slate-500">
                <div className="flex items-center gap-x-2">
                    {hasChecklist && (
                        <span className="flex items-center gap-x-1" title={`${Math.round(checklistProgress)}% complete`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            {task.checklist!.filter(i => i.isDone).length}/{task.checklist!.length}
                        </span>
                    )}
                    {hasAttachments && (
                        <span className="flex items-center gap-x-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a3 3 0 006 0V7a3 3 0 00-3-3zM8 9a1 1 0 01-2 0V7a1 1 0 012 0v2zm0-1a1 1 0 00-1 1v4a1 1 0 102 0V9a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {task.attachments!.length}
                        </span>
                    )}
                </div>
                 <div className="flex items-center gap-x-1">
                     <button onClick={(e)=>{e.stopPropagation(); onSetReminder(task, 'task')}} className={`p-1.5 rounded hover:bg-slate-200 ${hasReminder ? 'text-yellow-500' : ''}`} title={t('reminders.setReminder') as string}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>
                     </button>
                    {task.dueDate && (
                        <span className={`px-2 py-0.5 rounded text-xs ${isOverdue ? 'bg-red-100 text-red-700 font-bold' : 'bg-slate-100'}`}>
                            {formatDisplayDate(task.dueDate, i18n.language)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
