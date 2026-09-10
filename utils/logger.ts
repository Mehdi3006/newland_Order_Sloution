// utils/logger.ts

const LOG_KEY = 'app_error_log';
const MAX_LOG_ENTRIES = 50;

interface LogEntry {
    timestamp: string;
    message: string;
    stack?: string;
    componentStack?: string;
}

/**
 * Retrieves logs from localStorage.
 */
export function getLogs(): LogEntry[] {
    try {
        const storedLogs = localStorage.getItem(LOG_KEY);
        return storedLogs ? JSON.parse(storedLogs) : [];
    } catch (e) {
        console.error("Failed to parse logs from localStorage", e);
        return [];
    }
}

/**
 * Logs an error to localStorage.
 * @param error The error object.
 * @param info Optional additional info, like React's componentStack or a string.
 */
export function logError(error: Error | string | any, info?: { componentStack?: string } | string): void {
    try {
        const logs = getLogs();

        let message = 'An unknown error occurred.';
        let stack: string | undefined = undefined;

        if (typeof error === 'string') {
            message = error;
        } else if (error instanceof Error) {
            message = error.message;
            stack = error.stack;
        } else if (typeof error === 'object' && error !== null) {
            message = error.message || JSON.stringify(error);
            stack = error.stack;
        }


        const newEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            message,
            stack,
        };
        
        if (info) {
            if (typeof info === 'string') {
                 newEntry.stack = (newEntry.stack || '') + '\n--- Additional Info ---\n' + info;
            } else if (info.componentStack) {
                newEntry.componentStack = info.componentStack;
            }
        }

        // Add new log and keep the list size limited
        const updatedLogs = [newEntry, ...logs].slice(0, MAX_LOG_ENTRIES);

        localStorage.setItem(LOG_KEY, JSON.stringify(updatedLogs));
    } catch (e) {
        console.error("Failed to write log to localStorage", e);
    }
}

/**
 * Clears all stored logs.
 */
export function clearLogs(): void {
    try {
        localStorage.removeItem(LOG_KEY);
    } catch (e) {
        console.error("Failed to clear logs from localStorage", e);
    }
}