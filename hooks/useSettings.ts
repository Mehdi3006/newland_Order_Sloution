import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useCallback } from 'react';

export const useSettings = () => {
    const settings = useLiveQuery(() => db.settings.toArray(), []);

    const updateSetting = useCallback(async (key: string, value: any) => {
        await db.settings.put({ key, value });
    }, []);

    return {
        settings: settings || [],
        updateSetting,
    };
};
