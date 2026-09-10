import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Task } from '../types';
import { useCallback } from 'react';

export const useTasks = (projectId?: string) => {
    const tasks = useLiveQuery(() => 
        projectId 
            ? db.tasks.where({ projectId }).filter(t => !t.deletedAt).toArray() 
            : db.tasks.filter(t => !t.deletedAt).toArray(),
    [projectId]);

    const addTask = useCallback(async (taskData: Omit<Task, 'id' | 'createdAt' | 'order' | 'deletedAt'>) => {
        const tasksInColumn = await db.tasks.where({ statusId: taskData.statusId }).count();
        const newTask: Task = {
            ...taskData,
            id: `task-${crypto.randomUUID()}`,
            createdAt: new Date().toISOString(),
            order: tasksInColumn,
            deletedAt: null,
        };
        await db.tasks.add(newTask);
        return newTask;
    }, []);

    const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
        await db.tasks.update(taskId, updates);
    }, []);

    const deleteTask = useCallback(async (taskId: string) => {
        await db.tasks.update(taskId, { deletedAt: new Date().toISOString() });
    }, []);

    const restoreTask = useCallback(async (taskId: string) => {
        await db.tasks.update(taskId, { deletedAt: null });
    }, []);

    const restoreTasks = useCallback(async (taskIds: string[]) => {
        await db.tasks.where('id').anyOf(taskIds).modify({ deletedAt: null });
    }, []);

    const permanentlyDeleteTask = useCallback(async (taskId: string) => {
        await db.tasks.delete(taskId);
    }, []);
    
    const permanentlyDeleteTasks = useCallback(async (taskIds: string[]) => {
        await db.tasks.bulkDelete(taskIds);
    }, []);

    return { 
        tasks: tasks || [], 
        addTask, 
        updateTask, 
        deleteTask,
        restoreTask,
        restoreTasks,
        permanentlyDeleteTask,
        permanentlyDeleteTasks,
    };
};