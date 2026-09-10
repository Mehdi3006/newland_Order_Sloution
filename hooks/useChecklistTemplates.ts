import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ChecklistTemplate } from '../types';
import { useCallback } from 'react';

export const useChecklistTemplates = () => {
    const templates = useLiveQuery(() => db.checklistTemplates.toArray(), []);

    const addTemplate = useCallback(async (data: Omit<ChecklistTemplate, 'id'>) => {
        const newTemplate: ChecklistTemplate = {
            ...data,
            id: `template-${crypto.randomUUID()}`
        };
        await db.checklistTemplates.add(newTemplate);
    }, []);

    const updateTemplate = useCallback(async (id: string, data: Omit<ChecklistTemplate, 'id'>) => {
        await db.checklistTemplates.update(id, data);
    }, []);

    const deleteTemplate = useCallback(async (id: string) => {
        // Here you might also want to handle what happens to orders that use this template
        // For now, we'll just delete the template itself.
        await db.checklistTemplates.delete(id);
    }, []);

    return {
        templates,
        addTemplate,
        updateTemplate,
        deleteTemplate,
    };
};
