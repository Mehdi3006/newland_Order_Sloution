import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { PresetCost } from '../types';
import { useCallback } from 'react';

export const usePresetCosts = () => {
    const presetCosts = useLiveQuery(() => db.presetCosts.toArray(), []);

    const addPresetCost = useCallback(async (data: Omit<PresetCost, 'id'>) => {
        const newPreset: PresetCost = {
            ...data,
            id: `pc-${crypto.randomUUID()}`
        };
        await db.presetCosts.add(newPreset);
    }, []);

    const updatePresetCost = useCallback(async (id: string, data: Partial<Omit<PresetCost, 'id'>>) => {
        await db.presetCosts.update(id, data);
    }, []);

    const deletePresetCost = useCallback(async (id: string) => {
        await db.presetCosts.delete(id);
    }, []);

    return {
        presetCosts: presetCosts || [],
        addPresetCost,
        updatePresetCost,
        deletePresetCost,
    };
};
