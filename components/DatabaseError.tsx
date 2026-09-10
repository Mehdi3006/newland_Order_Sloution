import React, { useState, useEffect } from 'react';
import { db, backupDB } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { getLogs, clearLogs } from '../utils/logger';

interface DatabaseErrorProps {
    error?: Error;
    onExit?: () => void;
}

interface Backup {
    id?: number;
    timestamp: Date;
    data: string;
}

interface LogEntry {
    timestamp: string;
    message: string;
    stack?: string;
    componentStack?: string;
}


export const DatabaseError: React.FC<DatabaseErrorProps> = ({ error, onExit }) => {
    const [isRestoring, setIsRestoring] = useState(false);
    const backups = useLiveQuery(() => backupDB.backups.orderBy('timestamp').reverse().toArray(), []);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [toast, setToast] = useState('');

    useEffect(() => {
        setLogs(getLogs());
    }, []);


    const handleRestore = async (backup: Backup) => {
        const confirmed = window.confirm(
            `Are you sure you want to restore the backup from ${backup.timestamp.toLocaleString()}?\n\nWARNING: This will overwrite any current data with the selected backup.`
        );
        if (confirmed) {
            setIsRestoring(true);
            try {
                // 1. Close and delete the main (potentially corrupt) database
                await db.close();
                await db.delete();
                console.log("Main database deleted.");

                // 2. Re-open it. This will re-create the schema.
                await db.open();
                console.log("Main database re-initialized.");

                // 3. Parse backup data
                const backupData = JSON.parse(backup.data);

                // 4. Restore data table by table
                await db.transaction('rw', db.tables, async () => {
                    for (const table of db.tables) {
                        const tableName = table.name;
                        if (backupData[tableName] && Array.isArray(backupData[tableName])) {
                            // Clear any default data from seeding before putting backup data
                            await table.clear();
                            await table.bulkPut(backupData[tableName]);
                            console.log(`Restored ${backupData[tableName].length} items to ${tableName}`);
                        }
                    }
                });
                
                alert("Restore complete. The application will now reload.");
                window.location.reload();

            } catch (e) {
                setIsRestoring(false);
                alert(`Failed to restore from backup.\n\nError: ${(e as Error).message}`);
                console.error(e);
            }
        }
    };

    const handleReset = async () => {
        const confirmed = window.confirm(
            "Are you sure you want to reset all application data?\n\nWARNING: This will permanently delete all your existing orders, products, projects, and settings. This action cannot be undone."
        );
        if (confirmed) {
            setIsRestoring(true);
            try {
                await db.close();
                await backupDB.close();
                await db.delete();
                await backupDB.delete();
                alert("Application data has been reset. The application will now reload.");
                window.location.reload();
            } catch (e) {
                setIsRestoring(false);
                alert(`Failed to reset the database. You may need to manually clear your browser's site data for this application.\n\nError: ${(e as Error).message}`);
            }
        }
    };

    const handleCopyLog = () => {
        const logText = logs.map(log => {
            let entry = `[${log.timestamp}]\n`;
            entry += `Message: ${log.message}\n`;
            if (log.stack) entry += `Stack:\n${log.stack}\n`;
            if (log.componentStack) entry += `Component Stack:\n${log.componentStack}\n`;
            return entry;
        }).join('\n----------------------------------------\n');

        if (!logText) {
            setToast('Log is empty.');
            setTimeout(() => setToast(''), 2000);
            return;
        }

        navigator.clipboard.writeText(logText).then(() => {
            setToast('Log copied to clipboard!');
            setTimeout(() => setToast(''), 2000);
        }).catch(err => {
            console.error('Failed to copy log:', err);
            setToast('Failed to copy log.');
            setTimeout(() => setToast(''), 2000);
        });
    };

    const handleClearLog = () => {
        if (window.confirm("Are you sure you want to clear the error log? This cannot be undone.")) {
            clearLogs();
            setLogs([]);
            setToast('Log cleared.');
            setTimeout(() => setToast(''), 2000);
        }
    };

    const formattedLogs = logs.map((log, index) => (
        <div key={index} className="border-b border-slate-200 py-2 last:border-b-0">
            <p className="font-semibold text-slate-700">[{new Date(log.timestamp).toLocaleString()}]</p>
            <p className="text-red-600">{log.message}</p>
            {log.stack && <pre className="text-xs text-slate-500 whitespace-pre-wrap mt-1">{log.stack}</pre>}
            {log.componentStack && <pre className="text-xs text-slate-500 whitespace-pre-wrap mt-1">Component Stack:{log.componentStack}</pre>}
        </div>
    ));

    return (
        <div className="fixed inset-0 bg-slate-100 z-[100] p-4 overflow-y-auto">
            <div className="bg-white p-8 rounded-lg shadow-lg max-w-4xl mx-auto my-8 w-full">
                {isRestoring ? (
                    <div>
                        <h1 className="text-xl font-bold text-indigo-600 mb-2">Processing...</h1>
                        <p className="text-slate-600">Please wait while the database is being restored or reset.</p>
                    </div>
                ) : (
                    <>
                        {error ? (
                            <>
                                <h1 className="text-xl font-bold text-red-600 mb-2">Application Error</h1>
                                <p className="text-slate-600 mb-4">
                                    The application has encountered a critical error and cannot continue.
                                </p>
                                <div className="text-left bg-slate-100 p-2 rounded-md text-xs text-slate-700 font-mono my-4">
                                    <p><strong>Error Details:</strong></p>
                                    <p>{error?.name}: {error?.message}</p>
                                </div>
                            </>
                        ) : (
                             <>
                                <h1 className="text-xl font-bold text-indigo-600 mb-2">Manual Data Recovery</h1>
                                <p className="text-slate-600 mb-4">
                                    Use the options below to restore your data from an automatic backup or reset the application.
                                </p>
                            </>
                        )}
                        
                        <div className="text-left my-6 pt-6 border-t border-gray-300">
                             <div className="flex justify-between items-center mb-2">
                                <h2 className="font-semibold text-lg text-slate-800">Error Log</h2>
                                <div className="flex items-center gap-x-2">
                                    {toast && <span className="text-sm text-indigo-600 transition-opacity">{toast}</span>}
                                    <button onClick={handleCopyLog} className="bg-slate-200 text-slate-700 font-semibold py-1 px-3 rounded hover:bg-slate-300 text-sm">Copy Log</button>
                                    <button onClick={handleClearLog} className="bg-red-100 text-red-700 font-semibold py-1 px-3 rounded hover:bg-red-200 text-sm">Clear Log</button>
                                </div>
                             </div>
                             <p className="text-sm text-slate-500 mb-2">This log captures recent errors that occurred in the application.</p>
                             <div className="border border-slate-200 rounded-lg max-h-60 overflow-y-auto bg-slate-50 p-3 font-mono text-xs">
                                {logs.length > 0 ? formattedLogs : <p className="text-slate-500 text-center p-4">No errors logged.</p>}
                             </div>
                        </div>

                        <div className="text-left my-6 pt-6 border-t border-gray-300">
                            <h2 className="font-semibold text-lg text-slate-800">Recovery Options</h2>
                            <p className="text-sm text-slate-500 mb-2">You can attempt to restore from an automatic backup.</p>
                            <div className="border border-slate-200 rounded-lg max-h-60 overflow-y-auto">
                                {backups && backups.length > 0 ? (
                                    backups.map(backup => (
                                        <div key={backup.id} className="flex justify-between items-center p-3 border-b last:border-b-0">
                                            <span className="text-slate-700 font-medium">
                                                Backup from {backup.timestamp.toLocaleString()}
                                            </span>
                                            <button
                                                onClick={() => handleRestore(backup as Backup)}
                                                className="bg-green-600 text-white font-bold py-1 px-3 rounded hover:bg-green-700 text-sm"
                                            >
                                                Restore
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <p className="p-4 text-slate-500 text-center">No automatic backups found.</p>
                                )}
                            </div>
                        </div>

                        <div className="text-left mt-6 pt-6 border-t border-red-200">
                           <h2 className="font-semibold text-lg text-red-700">Last Resort</h2>
                             <p className="text-sm text-slate-500 mb-2">
                                If restoring a backup doesn't work or no backups are available, you can perform a full reset.
                                <strong>WARNING:</strong> This will delete everything, including all backups.
                            </p>
                            <button
                                onClick={handleReset}
                                className="bg-red-600 text-white font-bold py-2 px-4 rounded hover:bg-red-700 w-full"
                            >
                                Reset All Application Data
                            </button>
                        </div>
                         {onExit && (
                            <div className="mt-6 pt-6 border-t">
                                <button
                                    onClick={onExit}
                                    className="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded hover:bg-slate-300 w-full"
                                >
                                    Back to Application
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
