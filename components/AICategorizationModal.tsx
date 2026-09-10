import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AICategorizationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (options: { updateCategories: boolean; updateHsCodes: boolean }) => void;
    productCount: number;
}

const AICategorizationModal: React.FC<AICategorizationModalProps> = ({ isOpen, onClose, onSubmit, productCount }) => {
    const { t } = useTranslation();
    const [updateCategories, setUpdateCategories] = useState(true);
    const [updateHsCodes, setUpdateHsCodes] = useState(true);

    const handleSubmit = () => {
        if (updateCategories || updateHsCodes) {
            onSubmit({ updateCategories, updateHsCodes });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-gray-800">{t('views.products.aiUpdateModal.title')}</h2>
                </header>
                <main className="p-6 space-y-4">
                    <p className="text-sm text-slate-600">
                        {t('views.products.aiUpdateModal.body', { count: productCount })}
                    </p>
                    <div className="space-y-2">
                        <label className="flex items-center gap-x-3 p-2 rounded hover:bg-slate-100 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={updateCategories}
                                onChange={e => setUpdateCategories(e.target.checked)}
                                className="h-5 w-5 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="font-medium text-slate-700">{t('views.products.aiUpdateModal.updateCategories')}</span>
                        </label>
                        <label className="flex items-center gap-x-3 p-2 rounded hover:bg-slate-100 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={updateHsCodes}
                                onChange={e => setUpdateHsCodes(e.target.checked)}
                                className="h-5 w-5 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="font-medium text-slate-700">{t('views.products.aiUpdateModal.updateHsCodes')}</span>
                        </label>
                    </div>
                </main>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3">
                    <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!updateCategories && !updateHsCodes}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-indigo-300"
                    >
                        {t('views.products.aiUpdateModal.start')}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default AICategorizationModal;
