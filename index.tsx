import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import './i18n'; // Import for side-effects (initialization)
import i18n from 'i18next'; // Import singleton for Provider
import { I18nextProvider } from 'react-i18next';
import { db } from './db';
import { DatabaseError } from './components/DatabaseError';
import ErrorBoundary from './components/ErrorBoundary';
import { logError } from './utils/logger';
import { initializeGlobalNumberStandardizer } from './utils/numberStandardizer';

// Initialize global English numbers standardizer
initializeGlobalNumberStandardizer();

// --- Global Error Handlers ---
window.onerror = (message, source, lineno, colno, error) => {
    logError(error || new Error(message as string), `at ${source}:${lineno}:${colno}`);
};
window.onunhandledrejection = (event) => {
    logError(event.reason || 'Unhandled promise rejection');
};
// -----------------------------


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}
const root = ReactDOM.createRoot(rootElement);

// --- New main function ---
async function main() {
    try {
        // --- START FONT LOADING ---
        try {
            if (!document.getElementById('cached-fonts')) {
                console.log("Attempting to load fonts from cache...");
                const cachedFonts = await db.fontCache.toArray();
                if (cachedFonts.length > 0) {
                    const fontFaces = cachedFonts.map(font => {
                        const blob = new Blob([font.data], { type: 'font/woff2' });
                        const url = URL.createObjectURL(blob);
                        return `
                            @font-face {
                                font-family: 'Vazirmatn';
                                src: url(${url}) format('woff2');
                                font-weight: ${font.fontWeight};
                                font-style: normal;
                                font-display: swap;
                            }
                        `;
                    }).join('\n');
                    
                    const styleEl = document.createElement('style');
                    styleEl.id = "cached-fonts";
                    styleEl.textContent = fontFaces;
                    document.head.appendChild(styleEl);
                    console.log("Fonts loaded from cache.");
                }
            }
        } catch (err) {
            console.error("Could not load fonts from cache:", err);
            // Don't block app startup if this fails
        }
        // --- END FONT LOADING ---

        console.log("Attempting to open the database...");
        // Explicitly open the database before rendering the app.
        // This catches initialization/upgrade errors upfront.
        await (db as any).open();
        console.log("Database opened successfully.");

        // If successful, render the main application.
        root.render(
            <React.StrictMode>
                <I18nextProvider i18n={i18n}>
                    <ErrorBoundary>
                        <App />
                    </ErrorBoundary>
                </I18nextProvider>
            </React.StrictMode>
        );
    } catch (err) {
        console.error("Fatal error opening database:", err);
        logError(err as Error, 'Fatal error during database initialization.');
        // If it fails, render a dedicated, dependency-free error component.
        root.render(
            <React.StrictMode>
                <DatabaseError error={err as Error} />
            </React.StrictMode>
        );
    }
}

main(); // Run the main function