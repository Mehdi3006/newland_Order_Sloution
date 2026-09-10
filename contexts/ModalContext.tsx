import { createContext, useContext } from 'react';
import { Toast } from '../components/Toast';

export interface ConfirmationState {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    variant?: 'primary' | 'destructive';
    requireCode?: boolean;
    confirmationCode?: string;
}

export interface ModalContextType {
    showConfirmation: (options: Omit<ConfirmationState, 'isOpen'>) => void;
    addToast: (message: string, type: Toast['type']) => void;
}

export const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModals = () => {
    const context = useContext(ModalContext);
    if (!context) {
        throw new Error('useModals must be used within a ModalProvider');
    }
    return context;
};