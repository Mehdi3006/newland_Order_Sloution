import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { DailyImage, DailyAttachment } from '../types';
import { useCallback } from 'react';

export const useDailyMedia = () => {
    const dailyImages = useLiveQuery(() => db.dailyImages.toArray(), []);
    const dailyAttachments = useLiveQuery(() => db.dailyAttachments.toArray(), []);

    const addDailyImage = useCallback(async (date: string, name: string, data: string) => {
        const newImage: Omit<DailyImage, 'id'> = {
            date,
            name,
            data,
        };
        await db.dailyImages.add(newImage as DailyImage);
    }, []);

    const updateDailyImage = useCallback(async (imageId: number, updates: Partial<DailyImage>) => {
        await db.dailyImages.update(imageId, updates);
    }, []);

    const deleteDailyImage = useCallback(async (imageId: number) => {
        await db.dailyImages.delete(imageId);
    }, []);

    const addDailyAttachment = useCallback(async (date: string, file: File) => {
        const data = await file.arrayBuffer();
        const newAttachment: Omit<DailyAttachment, 'id'> = {
            date,
            name: file.name,
            type: file.type,
            size: file.size,
            data,
        };
        await db.dailyAttachments.add(newAttachment as DailyAttachment);
    }, []);

    const deleteDailyAttachment = useCallback(async (attachmentId: number) => {
        await db.dailyAttachments.delete(attachmentId);
    }, []);

    const moveAllDailyMediaForDate = useCallback(async (oldDate: string, newDate: string) => {
        await db.transaction('rw', db.dailyImages, db.dailyAttachments, async () => {
            await db.dailyImages.where({ date: oldDate }).modify({ date: newDate });
            await db.dailyAttachments.where({ date: oldDate }).modify({ date: newDate });
        });
    }, []);

    return {
        dailyImages: dailyImages || [],
        addDailyImage,
        updateDailyImage,
        deleteDailyImage,
        dailyAttachments: dailyAttachments || [],
        addDailyAttachment,
        deleteDailyAttachment,
        moveAllDailyMediaForDate,
    };
};