
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '../types';
import jalaali from 'jalaali-js';

interface ProjectCalendarProps {
    tasks: Task[];
    onTaskClick: (task: Task) => void;
    onDateSelectForNewTask: (date: string) => void; 
    onTaskDateChange: (taskId: string, newDate: string) => void;
    doneStatusId: string | null;
}

const ProjectCalendar: React.FC<ProjectCalendarProps> = ({ tasks, onTaskClick, onDateSelectForNewTask, onTaskDateChange, doneStatusId }) => {
    const { t, i18n } = useTranslation();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; date: string | null }>({ visible: false, x: 0, y: 0, date: null });
    const contextMenuRef = useRef<HTMLDivElement>(null);
    const calendarContainerRef = useRef<HTMLDivElement>(null);
    const [dragOverDate, setDragOverDate] = useState<string | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (contextMenu.visible && contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
                setContextMenu({ visible: false, x: 0, y: 0, date: null });
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [contextMenu.visible]);

    const isJalali = i18n.language === 'fa';

    const tasksByDate = useMemo(() => {
        return (tasks || []).reduce((acc, task) => {
            if (task.dueDate) {
                if (!acc[task.dueDate]) {
                    acc[task.dueDate] = [];
                }
                acc[task.dueDate].push(task);
            }
            return acc;
        }, {} as Record<string, Task[]>);
    }, [tasks]);

    const calendarGrid = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth(); // 0-indexed

        let jYear: number, jMonth: number;
        if (isJalali) {
            const jd = jalaali.toJalaali(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate());
            jYear = jd.jy;
            jMonth = jd.jm;
        } else {
            jYear = year;
            jMonth = month + 1;
        }

        const firstDayOfMonth = isJalali
            ? jalaali.toGregorian(jYear, jMonth, 1)
            : { gy: year, gm: month, gd: 1 };
        
        const firstDate = new Date(firstDayOfMonth.gy, firstDayOfMonth.gm - 1, firstDayOfMonth.gd);
        let startingDayOfWeek = firstDate.getDay(); // 0 for Sunday
        
        // Adjust for Jalali calendar where Saturday (6) is the first day
        if (isJalali) {
            startingDayOfWeek = (startingDayOfWeek + 1) % 7;
        }

        const daysInMonth = isJalali
            ? jalaali.jalaaliMonthLength(jYear, jMonth)
            : new Date(year, month + 1, 0).getDate();

        const grid = [];
        // Add padding for days from the previous month
        for (let i = 0; i < startingDayOfWeek; i++) {
            grid.push({ key: `pad-start-${i}`, isPadding: true });
        }

        // Add days of the current month
        for (let day = 1; day <= daysInMonth; day++) {
            let dateStr: string;
            if (isJalali) {
                const g = jalaali.toGregorian(jYear, jMonth, day);
                dateStr = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
            } else {
                dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }

            const today = new Date();
            const isToday = isJalali
              ? jalaali.toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate()).jy === jYear && 
                jalaali.toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate()).jm === jMonth && 
                jalaali.toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate()).jd === day
              : today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

            grid.push({
                key: dateStr,
                day,
                dateStr,
                isToday,
                isPadding: false,
                tasks: tasksByDate[dateStr] || []
            });
        }
        
        return grid;

    }, [currentDate, isJalali, tasksByDate]);

    const changeMonth = (delta: number) => {
        setCurrentDate(prevDate => {
            const newDate = new Date(prevDate);
            if (isJalali) {
                const jd = jalaali.toJalaali(newDate.getFullYear(), newDate.getMonth() + 1, newDate.getDate());
                let newJMonth = jd.jm + delta;
                let newJYear = jd.jy;
                if (newJMonth > 12) {
                    newJMonth = 1;
                    newJYear++;
                } else if (newJMonth < 1) {
                    newJMonth = 12;
                    newJYear--;
                }
                const g = jalaali.toGregorian(newJYear, newJMonth, 1);
                return new Date(g.gy, g.gm - 1, g.gd);
            } else {
                newDate.setMonth(newDate.getMonth() + delta);
                return newDate;
            }
        });
    };

    const handleContextMenu = (e: React.MouseEvent, dateStr: string) => {
        e.preventDefault();
        if (calendarContainerRef.current) {
            const rect = calendarContainerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setContextMenu({
                visible: true,
                x: x,
                y: y,
                date: dateStr,
            });
        }
    };
    
    const handleNewTaskClick = () => {
        if (contextMenu.date) {
            onDateSelectForNewTask(contextMenu.date);
        }
        setContextMenu({ visible: false, x: 0, y: 0, date: null });
    };

    const headerText = isJalali
        ? `${t(`months.jalali.${jalaali.toJalaali(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate()).jm}`)} ${new Intl.NumberFormat(i18n.language).format(jalaali.toJalaali(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate()).jy)}`
        : `${t(`months.gregorian.${currentDate.getMonth()}`)} ${currentDate.getFullYear()}`;
    
    const dayHeadersRaw = isJalali
        ? i18n.t('daysOfWeek.jalali.short', { returnObjects: true })
        : i18n.t('daysOfWeek.gregorian.short', { returnObjects: true });
    const dayHeaders = Array.isArray(dayHeadersRaw) ? (dayHeadersRaw as string[]) : [];

    return (
        <div ref={calendarContainerRef} className="bg-white p-4 rounded-lg border border-slate-200 relative">
            <header className="flex justify-between items-center mb-4">
                 <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-slate-100">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                </button>
                <h2 className="text-lg font-semibold text-slate-800">{headerText}</h2>
                <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-slate-100">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                </button>
            </header>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
                {dayHeaders.map((day: string) => <div key={day} className="py-2">{day}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {calendarGrid.map(cell => (
                    <div 
                        key={cell.key} 
                        className={`h-28 border border-slate-200 rounded-md p-1 transition-colors duration-200 ${cell.isPadding ? 'bg-slate-50 cursor-not-allowed' : 'hover:bg-slate-50'} ${dragOverDate === cell.dateStr ? 'bg-indigo-100 ring-2 ring-indigo-400' : ''}`}
                        onContextMenu={!cell.isPadding ? (e) => handleContextMenu(e, cell.dateStr) : undefined}
                        onDragOver={(e) => { if (!cell.isPadding) e.preventDefault(); }}
                        onDragEnter={() => { if (!cell.isPadding) setDragOverDate(cell.dateStr); }}
                        onDragLeave={() => { if (dragOverDate === cell.dateStr) setDragOverDate(null); }}
                        onDrop={(e) => {
                            if (!cell.isPadding) {
                                e.preventDefault();
                                const taskId = e.dataTransfer.getData('taskId');
                                if (taskId) {
                                    onTaskDateChange(taskId, cell.dateStr);
                                }
                                setDragOverDate(null);
                            }
                        }}
                    >
                       {!cell.isPadding && (
                            <>
                                <span className={`flex items-center justify-center text-sm h-6 w-6 rounded-full ${cell.isToday ? 'bg-indigo-600 text-white font-bold' : ''}`}>
                                    {cell.day}
                                </span>
                                <div className="mt-1 space-y-1 overflow-y-auto max-h-16">
                                     {cell.tasks?.map((task: Task) => {
                                        const isDone = doneStatusId ? task.statusId === doneStatusId : false;
                                        const todayString = new Date().toISOString().split('T')[0];
                                        const isOverdue = !isDone && task.dueDate && task.dueDate < todayString;
                                        
                                        const taskClasses = isDone
                                            ? 'bg-gray-200 text-gray-500 line-through'
                                            : isOverdue
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-indigo-100 text-indigo-800';

                                        return (
                                            <div 
                                                key={task.id} 
                                                draggable
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('taskId', task.id);
                                                    e.stopPropagation();
                                                }}
                                                onClick={() => onTaskClick(task)}
                                                className={`text-xs p-1 rounded-md truncate cursor-pointer hover:bg-indigo-200 ${taskClasses}`}
                                            >
                                                {task.title}
                                            </div>
                                        );
                                     })}
                                </div>
                            </>
                       )}
                    </div>
                ))}
            </div>
             {contextMenu.visible && (
                <div
                    ref={contextMenuRef}
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    className="absolute z-50 bg-white shadow-xl rounded-md border border-slate-200 py-1"
                >
                    <button
                        onClick={handleNewTaskClick}
                        className="w-full text-left rtl:text-right px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-x-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                        {t('views.projects.addTask')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ProjectCalendar;
