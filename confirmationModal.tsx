import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { persianArabicToEnglish } from './utils/formatters';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'primary' | 'destructive';
    requireCode?: boolean;
    confirmationCode?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ 
    isOpen, onClose, onConfirm, title, message, 
    confirmText, cancelText, variant = 'destructive',
    requireCode = false, confirmationCode = '' 
}) => {
    const { t, i18n } = useTranslation();
    const [inputCode, setInputCode] = useState('');
    const modalRef = useRef<HTMLDivElement>(null);
    const confirmButtonRef = useRef<HTMLButtonElement>(null);
    const codeInputRef = useRef<HTMLInputElement>(null);

    const isRtl = i18n.dir() === 'rtl';
    const isCodeValid = !requireCode || inputCode === confirmationCode;

    // Check if the confirmation code is purely numeric to improve mobile UX
    const isNumericCode = confirmationCode && /^\d+$/.test(confirmationCode);

    useEffect(() => {
        if (isOpen) {
            setInputCode(''); // Reset on open
            const timer = setTimeout(() => {
                if (requireCode && codeInputRef.current) {
                    codeInputRef.current.focus();
                } else if (confirmButtonRef.current) {
                    confirmButtonRef.current.focus();
                }
            }, 100); // Small delay to ensure modal is rendered

            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    onClose();
                }
            };
            document.addEventListener('keydown', handleKeyDown);
            
            return () => {
                clearTimeout(timer);
                document.removeEventListener('keydown', handleKeyDown);
            };
        }
    }, [isOpen, requireCode, onClose]); // Dependency array is key to prevent re-running on every render

    if (!isOpen) return null;
    
    const handleConfirmClick = () => {
        if (isCodeValid) {
            onConfirm();
        }
    }
    
    const buttonClasses = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
      destructive: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
    };
    const disabledClasses = {
      primary: 'bg-indigo-300 text-white cursor-not-allowed',
      destructive: 'bg-red-300 text-white cursor-not-allowed'
    };

    const primaryButton = (
        <button
            ref={confirmButtonRef}
            onClick={handleConfirmClick}
            disabled={!isCodeValid}
            className={`px-4 py-2 font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
                isCodeValid 
                ? buttonClasses[variant]
                : disabledClasses[variant]
            }`}
        >
            {confirmText || t('confirmationModal.confirm')}
        </button>
    );

    const secondaryButton = (
        <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
        >
            {cancelText || t('common.cancel')}
        </button>
    );

    return (
        <div
            className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4 transition-opacity"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmation-title"
        >
            <div
                ref={modalRef}
                className="bg-white rounded-xl shadow-2xl w-full max-w-md"
                onClick={e => e.stopPropagation()}
                dir={i18n.dir()}
            >
                <div className="p-6">
                    <h2 id="confirmation-title" className={`text-xl font-bold text-gray-800 ${isRtl ? 'text-right' : 'text-left'}`}>{title}</h2>
                    <p className={`mt-2 text-slate-600 whitespace-pre-wrap ${isRtl ? 'text-right' : 'text-left'}`}>{message}</p>
                    {requireCode && (
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="confirmationCodeInput">
                                {t('confirmationModal.codeInputPrompt')} <code className="font-mono bg-slate-200 px-1.5 py-0.5 rounded">{confirmationCode}</code>
                            </label>
                            <input 
                                ref={codeInputRef}
                                type={isNumericCode ? "tel" : "text"}
                                inputMode={isNumericCode ? "numeric" : "text"}
                                id="confirmationCodeInput"
                                value={inputCode}
                                onChange={(e) => setInputCode(persianArabicToEnglish(e.target.value))}
                                className="w-full text-center font-mono tracking-widest bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                autoComplete="off"
                            />
                        </div>
                    )}
                </div>
                <footer className={`p-4 bg-slate-50 rounded-b-xl flex ${isRtl ? 'justify-start flex-row-reverse' : 'justify-end'} gap-x-3`}>
                    {isRtl ? <> {secondaryButton} {primaryButton} </> : <> {secondaryButton} {primaryButton} </>}
                </footer>
            </div>
        </div>
    );
};

export default ConfirmationModal;