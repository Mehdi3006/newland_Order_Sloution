
import React, { useState, useEffect, useRef } from 'react';

export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'info' | 'error';
    isExiting?: boolean;
}

const SuccessIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>;
const ErrorIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 101.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>;
const InfoIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>;


interface ToastMessageProps {
    toast: Toast;
    onDismiss: (id: string) => void;
}

const ToastMessage: React.FC<ToastMessageProps> = ({ toast, onDismiss }) => {
    const [isPaused, setIsPaused] = useState(false);
    const timerRef = useRef<number | null>(null);
    const remainingTimeRef = useRef<number>(5000); // 5 seconds, matches CSS animation
    const startTimeRef = useRef<number>(0);

    const handleMouseEnter = () => setIsPaused(true);
    const handleMouseLeave = () => setIsPaused(false);

    // Effect to manage the dismissal timer, including pause/resume functionality
    useEffect(() => {
        // If the toast is already exiting, we don't need a timer.
        if (toast.isExiting) {
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        if (isPaused) {
            // PAUSE: Clear the timer and calculate remaining time.
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
                // Calculate and store the time that was left
                remainingTimeRef.current -= (Date.now() - startTimeRef.current);
            }
        } else {
            // START/RESUME: Set a new timer with the remaining time.
            startTimeRef.current = Date.now();
            timerRef.current = window.setTimeout(() => {
                onDismiss(toast.id);
            }, remainingTimeRef.current);
        }

        // Cleanup: always clear the timeout when the effect re-runs or component unmounts.
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [isPaused, toast.id, onDismiss, toast.isExiting]);
    
    const typeStyles = {
        success: { bg: 'bg-green-500', iconBg: 'bg-green-600', icon: <SuccessIcon /> },
        error: { bg: 'bg-red-500', iconBg: 'bg-red-600', icon: <ErrorIcon /> },
        info: { bg: 'bg-blue-500', iconBg: 'bg-blue-600', icon: <InfoIcon /> },
    };

    const styles = typeStyles[toast.type];

    return (
        <div
            className={`relative flex items-center w-full max-w-sm p-4 my-2 text-white ${styles.bg} rounded-lg shadow-2xl overflow-hidden ${toast.isExiting ? 'animate-toast-out' : 'animate-toast-in'}`}
            role="alert"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className="flex-shrink-0">{styles.icon}</div>
            <div className="ms-3 text-sm font-semibold">{toast.message}</div>
            <button
                type="button"
                className="ms-auto -mx-1.5 -my-1.5 bg-transparent text-white/70 hover:text-white rounded-lg p-1.5 inline-flex h-8 w-8"
                onClick={() => onDismiss(toast.id)}
                aria-label="Close"
            >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
            </button>
            <div className={`absolute bottom-0 start-0 h-1 ${styles.iconBg}`}>
                <div
                    className="h-full bg-white/50 progress-bar-animate"
                    style={{ animationPlayState: isPaused ? 'paused' : 'running' }}
                />
            </div>
        </div>
    );
};


interface ToastContainerProps {
    toasts: Toast[];
    setToasts: React.Dispatch<React.SetStateAction<Toast[]>>;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, setToasts }) => {
    
    // Play sound for new toasts
    useEffect(() => {
        if (toasts.length > 0) {
            const latestToast = toasts[toasts.length - 1];
            // Only play sound for toasts that aren't exiting and haven't had a sound played
            if (!latestToast.isExiting) {
                // Check a flag to prevent re-playing sound on re-renders
                if (!(latestToast as any).__soundPlayed) {
                    (latestToast as any).__soundPlayed = true;
                    playNotificationSound();
                }
            }
        }
    }, [toasts]);

    const playNotificationSound = async () => {
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (audioContext.state === 'suspended') await audioContext.resume();
            
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(660, audioContext.currentTime); // E5 note, more audible
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime); // Slightly louder
            gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.4);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.4);
        } catch (error) {
            console.error("Could not play notification sound:", error);
        }
    };
    
    useEffect(() => {
        const exitingToasts = toasts.filter(t => t.isExiting);
        if (exitingToasts.length > 0) {
            const timer = setTimeout(() => {
                setToasts(prev => prev.filter(t => !exitingToasts.find(et => et.id === t.id)));
            }, 300); // Must match animation duration
            return () => clearTimeout(timer);
        }
    }, [toasts, setToasts]);
    
    const handleDismiss = (id: string) => {
        setToasts(prev => prev.map(toast => (toast.id === id ? { ...toast, isExiting: true } : toast)));
    };

    return (
        <div className="fixed bottom-5 end-5 z-[9999] flex flex-col items-end pointer-events-none">
            <div className="pointer-events-auto">
                {toasts.map(toast => (
                    <ToastMessage key={toast.id} toast={toast} onDismiss={handleDismiss} />
                ))}
            </div>
        </div>
    );
};

export default ToastContainer;
