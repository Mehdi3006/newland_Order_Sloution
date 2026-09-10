
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { CalendarTask, CalendarStickyNote, CalendarList } from '../types';
import { useCallback } from 'react';

export const useCalendarItems = () => {
    const calendarTasks = useLiveQuery(() => db.calendarTasks.orderBy('order').toArray(), []);
    const calendarStickyNotes = useLiveQuery(() => db.calendarStickyNotes.orderBy('order').toArray(), []);
    const calendarLists = useLiveQuery(() => db.calendarLists.orderBy('order').toArray(), []);

    const addCalendarList = useCallback(async (name: string, color: string, icon: string): Promise<string> => {
        const count = await db.calendarLists.count();
        const newList: CalendarList = {
            id: crypto.randomUUID(),
            name,
            color,
            icon,
            order: count, // Set order to be last
            isPinned: false
        };
        await db.calendarLists.add(newList);
        return newList.id;
    }, []);
    
    const updateCalendarList = useCallback(async (listId: string, updates: Partial<CalendarList>) => {
        await db.calendarLists.update(listId, updates);
    }, []);

    const deleteCalendarList = useCallback(async (listId: string) => {
        await db.transaction('rw', db.calendarLists, db.calendarTasks, async () => {
            await db.calendarLists.delete(listId);
            // Delete tasks associated with this list
            await db.calendarTasks.where({ categoryId: listId }).delete();
        });
    }, []);

    const addCalendarTask = useCallback(async (date: string, title: string, categoryId?: string): Promise<number> => {
        // If adding to a specific list (category), we might not care about date as much, 
        // but the schema requires it. We can use an empty string or 'unscheduled' if needed,
        // but keeping 'date' allows it to show up on the calendar too.
        const order = await db.calendarTasks.where({ date }).count();
        const newTask: Omit<CalendarTask, 'id'> = {
            date,
            title,
            isDone: false,
            order,
            categoryId
        };
        const newId = await db.calendarTasks.add(newTask as CalendarTask);
        return newId as number;
    }, []);
    
    const addCalendarTasks = useCallback(async (date: string, titles: string[]): Promise<number[]> => {
        const order = await db.calendarTasks.where({ date }).count();
        const newTasks: Omit<CalendarTask, 'id'>[] = titles.map((title, index) => ({
            date,
            title,
            isDone: false,
            order: order + index,
        }));
        const newIds = await db.calendarTasks.bulkAdd(newTasks as CalendarTask[], { allKeys: true });
        return newIds as number[];
    }, []);

    const updateCalendarTask = useCallback(async (taskId: number, updates: Partial<CalendarTask>) => {
        await db.calendarTasks.update(taskId, updates);
    }, []);

    const deleteCalendarTask = useCallback(async (taskId: number) => {
        await db.calendarTasks.delete(taskId);
    }, []);

    const addCalendarStickyNote = useCallback(async (date: string, content?: string): Promise<string> => {
        const order = await db.calendarStickyNotes.where({ date }).count();
        const newNote: CalendarStickyNote = {
            id: crypto.randomUUID(),
            date,
            content: content || 'New Note',
            color: '#FFF9C4', // light yellow
            order,
        };
        await db.calendarStickyNotes.add(newNote);
        return newNote.id;
    }, []);
    
    const updateCalendarStickyNote = useCallback(async (noteId: string, updates: Partial<CalendarStickyNote>) => {
        await db.calendarStickyNotes.update(noteId, updates);
    }, []);

    const deleteCalendarStickyNote = useCallback(async (noteId: string) => {
        await db.calendarStickyNotes.delete(noteId);
    }, []);

    const moveCalendarItem = useCallback(async (itemId: string | number, itemType: 'task' | 'note', newDate: string) => {
        if (itemType === 'task') {
            const order = await db.calendarTasks.where({ date: newDate }).count();
            await db.calendarTasks.update(itemId as number, { date: newDate, order });
        } else if (itemType === 'note') {
            const order = await db.calendarStickyNotes.where({ date: newDate }).count();
            await db.calendarStickyNotes.update(itemId as string, { date: newDate, order });
        }
    }, []);

    const moveAllCalendarItemsForDate = useCallback(async (oldDate: string, newDate: string) => {
        await db.transaction('rw', db.calendarTasks, db.calendarStickyNotes, async () => {
            await db.calendarTasks.where({ date: oldDate }).modify({ date: newDate });
            await db.calendarStickyNotes.where({ date: oldDate }).modify({ date: newDate });
        });
    }, []);

    const reorderDailyTasks = useCallback(async (reorderedTasks: CalendarTask[]) => {
        const updates = reorderedTasks.map((task, index) => ({
            key: task.id,
            changes: { order: index }
        }));
        if (updates.length > 0) {
            await db.calendarTasks.bulkUpdate(updates);
        }
    }, []);
    
    // Alias specifically for CalendarView to use generic naming if preferred, but direct usage is fine
    const reorderCalendarTasks = reorderDailyTasks;

    const reorderDailyStickyNotes = useCallback(async (reorderedNotes: CalendarStickyNote[]) => {
        const updates = reorderedNotes.map((note, index) => ({
            key: note.id,
            changes: { order: index }
        }));
        if (updates.length > 0) {
            await db.calendarStickyNotes.bulkUpdate(updates);
        }
    }, []);

    const reorderCalendarLists = useCallback(async (reorderedLists: CalendarList[]) => {
        const updates = reorderedLists.map((list, index) => ({
            key: list.id,
            changes: { order: index }
        }));
        if (updates.length > 0) {
            await db.calendarLists.bulkUpdate(updates);
        }
    }, []);


    return {
        calendarTasks: calendarTasks || [],
        calendarLists: calendarLists || [],
        addCalendarList,
        updateCalendarList,
        deleteCalendarList,
        addCalendarTask,
        addCalendarTasks,
        updateCalendarTask,
        deleteCalendarTask,
        calendarStickyNotes: calendarStickyNotes || [],
        addCalendarStickyNote,
        updateCalendarStickyNote,
        deleteCalendarStickyNote,
        moveCalendarItem,
        moveAllCalendarItemsForDate,
        reorderDailyTasks,
        reorderCalendarTasks, // Exported here
        reorderDailyStickyNotes,
        reorderCalendarLists,
    };
};
