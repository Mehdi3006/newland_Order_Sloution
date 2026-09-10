import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AISettings, MainGroup, Category, SubCategory, Brand } from '../types';
import { useModals } from '../contexts/ModalContext';
import { translateText } from '../utils/ai';

type CategoryLevel = 'mainGroup' | 'category' | 'subCategory' | 'brand';
type CategoryItem = MainGroup | Category | SubCategory | Brand;

interface CategoryEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: { name: string; name_fa?: string }) => Promise<void>;
    onUpdate: (data: { id: string, name: string; name_fa?: string }) => Promise<void>;
    level: CategoryLevel;
    itemToEdit: CategoryItem | null;
    aiSettings?: AISettings;
}

const CategoryEditModal: React.FC<CategoryEditModalProps> = ({ isOpen, onClose, onSave, onUpdate, level, itemToEdit, aiSettings }) => {
    const { t } = useTranslation();
    const { addToast } = useModals();
    const [name, setName] = useState('');
    const [nameFa, setNameFa] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);

    const hasFarsiName = level !== 'brand';

    useEffect(() => {
        if (isOpen) {
            if (itemToEdit) {
                setName(itemToEdit.name);
                setNameFa((itemToEdit as any).name_fa || '');
            } else {
                setName('');
                setNameFa('');
            }
        }
    }, [isOpen, itemToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        if (itemToEdit) {
            await onUpdate({ id: itemToEdit.id, name: name.trim(), name_fa: nameFa.trim() || undefined });
        } else {
            await onSave({ name: name.trim(), name_fa: nameFa.trim() || undefined });
        }
    };

    const handleTranslate = async () => {
        if (!name.trim() || !aiSettings?.apiKey) {
            if (!aiSettings?.apiKey) addToast(t('toasts.ai.apiKeyNotConfigured'), 'error');
            return;
        }
        setIsTranslating(true);
        try {
            const model = aiSettings.checklistGenerationModel || 'gemini-3.5-flash';
            const translation = await translateText(name, 'Persian', aiSettings.apiKey, model);
            setNameFa(translation);
        } catch (error) {
            addToast((error as Error).message, 'error');
        } finally {
            setIsTranslating(false);
        }
    };

    if (!isOpen) return null;

    const levelName = t(`settings.categories.${level}`);
    const title = itemToEdit ? `Edit ${levelName}` : `Add New ${levelName}`;

    return (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit}>
                    <header className="p-4 border-b border-slate-200">
                        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
                    </header>
                    <main className="p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t('settings.chartOfAccounts.name')}</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                                required
                                autoFocus
                            />
                        </div>
                        {hasFarsiName && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t('settings.chartOfAccounts.nameFa')}</label>
                                <div className="flex items-center gap-x-2">
                                <input
                                    type="text"
                                    value={nameFa}
                                    onChange={e => setNameFa(e.target.value)}
                                    dir="rtl"
                                    className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                                />
                                <button type="button" onClick={handleTranslate} disabled={isTranslating} title={t('toasts.ai.translateFromEnglish') as string} className="p-2 text-purple-600 hover:bg-purple-100 rounded-full disabled:opacity-50">
                                {isTranslating ? 
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    :
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 3zM6.03 5.23a.75.75 0 01.04 1.06l-1.72 1.72a.75.75 0 01-1.06-1.06l-1.72-1.72a.75.75 0 011.02 0zm8 0a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06zM10 18a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5H10a.75.75 0 01-.75-.75zM4.75 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm9.25-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zM6.03 14.77a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06z" clipRule="evenodd" /></svg>
                                    }
                                </button>
                                </div>
                            </div>
                        )}
                    </main>
                    <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3">
                        <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                        <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('buttons.save')}</button>
                    </footer>
                </form>
            </div>
        </div>
    );
};

export default CategoryEditModal;