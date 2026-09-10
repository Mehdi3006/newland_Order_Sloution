import React, { useEffect } from 'react';
import { db } from '../db';

const DATA_RETENTION_DAYS = 30;

const DataRetentionHandler: React.FC = () => {
    useEffect(() => {
        const purgeOldData = async () => {
            const threshold = new Date();
            threshold.setDate(threshold.getDate() - DATA_RETENTION_DAYS);
            const thresholdISO = threshold.toISOString();

            try {
                // Purge Orders
                const oldOrderIds = await db.orders
                    .where('deletedAt').below(thresholdISO)
                    .primaryKeys();
                
                if (oldOrderIds.length > 0) {
                    await db.orders.bulkDelete(oldOrderIds as string[]);
                }

                // Purge Projects and their related data
                const oldProjects = await db.projects
                    .where('deletedAt').below(thresholdISO)
                    .toArray();
                
                if (oldProjects.length > 0) {
                    const projectIds = oldProjects.map(p => p.id);
                    await db.transaction('rw', db.projects, db.projectStatuses, db.tasks, async () => {
                        // Delete tasks for these projects
                        await db.tasks.where('projectId').anyOf(projectIds).delete();
                        // Delete statuses for these projects
                        await db.projectStatuses.where('projectId').anyOf(projectIds).delete();
                        // Delete the projects themselves
                        await db.projects.bulkDelete(projectIds);
                    });
                }

                // Purge individual tasks (that were not part of a deleted project)
                const oldTaskIds = await db.tasks
                    .where('deletedAt').below(thresholdISO)
                    .primaryKeys();

                if (oldTaskIds.length > 0) {
                    await db.tasks.bulkDelete(oldTaskIds as string[]);
                }

                // Purge Products
                const oldProductIds = await db.products
                    .where('deletedAt').below(thresholdISO)
                    .primaryKeys();

                if (oldProductIds.length > 0) {
                    await db.products.bulkDelete(oldProductIds as string[]);
                }

            } catch (error) {
                console.error("Error during data retention cleanup:", error);
            }
        };

        // Run cleanup shortly after startup to ensure DB is ready
        const timeoutId = setTimeout(purgeOldData, 5000);
        
        // And run it periodically
        const intervalId = setInterval(purgeOldData, 24 * 60 * 60 * 1000); // Once a day

        return () => {
            clearTimeout(timeoutId);
            clearInterval(intervalId);
        };
    }, []);

    return null; // This is a background component
};

export default DataRetentionHandler;