import React, { useEffect, useRef } from 'react';
import { db, backupDB } from '../db';

const BACKUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
const MAX_BACKUPS = 20; // Keep the last 20 backups (approx 10 hours of work)

const AutoBackupHandler: React.FC = () => {
    const backupInProgress = useRef(false);
    
    useEffect(() => {
        const handleBackup = async () => {
            if (backupInProgress.current) {
                console.log("AutoBackup: Backup already in progress. Skipping.");
                return;
            }
            backupInProgress.current = true;
            console.log("AutoBackup: Starting automatic backup...");
            
            try {
                const allData: Record<string, any[]> = {};
                await db.transaction('r', db.tables, async () => {
                    for (const table of db.tables) {
                        allData[table.name] = await table.toArray();
                    }
                });

                const jsonString = JSON.stringify(allData);
                
                await backupDB.transaction('rw', backupDB.backups, async () => {
                    // Add new backup
                    await backupDB.backups.add({
                        timestamp: new Date(),
                        data: jsonString,
                    });

                    // Prune old backups
                    const backupCount = await backupDB.backups.count();
                    if (backupCount > MAX_BACKUPS) {
                        const backupsToDelete = await backupDB.backups
                            .orderBy('timestamp')
                            .limit(backupCount - MAX_BACKUPS)
                            .primaryKeys();
                        await backupDB.backups.bulkDelete(backupsToDelete);
                    }
                });
                console.log("AutoBackup: Backup completed successfully.");

            } catch (error) {
                console.error("AutoBackup: Failed to create automatic backup.", error);
            } finally {
                backupInProgress.current = false;
            }
        };

        const intervalId = setInterval(handleBackup, BACKUP_INTERVAL);
        
        // Run a backup shortly after the app starts
        const initialTimeoutId = setTimeout(handleBackup, 30 * 1000); // 30 seconds after app start

        return () => {
            clearInterval(intervalId);
            clearTimeout(initialTimeoutId);
        };
    }, []);

    return null; // This is a background component
};

export default AutoBackupHandler;
