import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Project } from '../types';
import { useCallback } from 'react';

export const useProjects = () => {
    const projects = useLiveQuery(() => 
        db.projects.orderBy('createdAt').reverse().filter(p => !p.deletedAt).toArray(), 
    []);

    const addProject = useCallback(async (data: Omit<Project, 'id' | 'createdAt' | 'deletedAt'>) => {
        const newProject: Project = {
            ...data,
            id: `proj-${crypto.randomUUID()}`,
            createdAt: new Date().toISOString(),
            deletedAt: null,
        };
        const projectId = await db.projects.add(newProject);

        // Add default statuses
        await db.projectStatuses.bulkAdd([
            { id: crypto.randomUUID(), projectId: newProject.id, name: 'To Do', order: 0 },
            { id: crypto.randomUUID(), projectId: newProject.id, name: 'In Progress', order: 1 },
            { id: crypto.randomUUID(), projectId: newProject.id, name: 'Done', order: 2 },
        ]);
        
        return projectId;
    }, []);
    
    const updateProject = useCallback(async (projectId: string, updates: Partial<Project>) => {
        await db.projects.update(projectId, updates);
    }, []);

    const deleteProject = useCallback(async (projectId: string) => {
        const now = new Date().toISOString();
        await db.transaction('rw', db.projects, db.tasks, async () => {
            // Soft delete all tasks associated with the project
            await db.tasks.where({ projectId }).modify({ deletedAt: now });
            // Soft delete the project itself
            await db.projects.update(projectId, { deletedAt: now });
        });
    }, []);

    const restoreProject = useCallback(async (projectId: string) => {
        await db.transaction('rw', db.projects, db.tasks, async () => {
            // Restore all tasks associated with the project
            await db.tasks.where({ projectId }).modify({ deletedAt: null });
            // Restore the project itself
            await db.projects.update(projectId, { deletedAt: null });
        });
    }, []);

    const restoreProjects = useCallback(async (projectIds: string[]) => {
        await db.transaction('rw', db.projects, db.tasks, async () => {
            await db.tasks.where('projectId').anyOf(projectIds).modify({ deletedAt: null });
            await db.projects.where('id').anyOf(projectIds).modify({ deletedAt: null });
        });
    }, []);

    const permanentlyDeleteProject = useCallback(async (projectId: string) => {
        await db.transaction('rw', db.projects, db.projectStatuses, db.tasks, async () => {
            await db.tasks.where({ projectId }).delete();
            await db.projectStatuses.where({ projectId }).delete();
            await db.projects.delete(projectId);
        });
    }, []);

    const permanentlyDeleteProjects = useCallback(async (projectIds: string[]) => {
        await db.transaction('rw', db.projects, db.projectStatuses, db.tasks, async () => {
            await db.tasks.where('projectId').anyOf(projectIds).delete();
            await db.projectStatuses.where('projectId').anyOf(projectIds).delete();
            await db.projects.bulkDelete(projectIds);
        });
    }, []);

    return { projects: projects || [], addProject, updateProject, deleteProject, restoreProject, restoreProjects, permanentlyDeleteProject, permanentlyDeleteProjects };
};