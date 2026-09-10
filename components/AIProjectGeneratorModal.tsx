import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AIProjectGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (prompt: string) => void;
}

const AIProjectGeneratorModal: React.FC<AIProjectGeneratorModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const { t } = useTranslation();
    const [prompt, setPrompt] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (prompt.trim()) {
            onSubmit(prompt.trim());
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <header className="p-6 border-b border-slate-200 flex-shrink-0">
                        <h2 className="text-xl font-bold text-gray-800">{t('views.projects.aiModalTitle')}</h2>
                    </header>
                    <main className="flex-1 overflow-y-auto p-6 space-y-4">
                        <div>
                            <label htmlFor="projectPrompt" className="block text-sm font-medium text-slate-700 mb-1">
                                {t('views.projects.aiPromptLabel')}
                            </label>
                            <textarea
                                id="projectPrompt"
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                required
                                rows={5}
                                placeholder={t('views.projects.aiPromptPlaceholder') as string}
                                className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500"
                                autoFocus
                            />
                        </div>
                    </main>
                    <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3 flex-shrink-0">
                        <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={!prompt.trim()} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">
                            {t('buttons.create')}
                        </button>
                    </footer>
                </form>
            </div>
        </div>
    );
};

export default AIProjectGeneratorModal;