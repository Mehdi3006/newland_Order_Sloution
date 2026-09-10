import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GoogleGenAI, Type } from "@google/genai";
import { AITaskList, AISettings } from '../types';
import { useModals } from '../contexts/ModalContext';

interface AICalendarTasksModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (tasks: string[]) => void;
    aiSettings?: AISettings;
}

const AICalendarTasksModal: React.FC<AICalendarTasksModalProps> = ({ isOpen, onClose, onSubmit, aiSettings }) => {
    const { t, i18n } = useTranslation();
    const { addToast } = useModals();
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim() || !aiSettings?.apiKey) {
            if (!aiSettings?.apiKey) addToast(t('toasts.ai.apiKeyNotConfigured'), 'error');
            return;
        }
        setIsGenerating(true);
        try {
            const ai = new GoogleGenAI({ apiKey: aiSettings.apiKey });
            const model = aiSettings.checklistGenerationModel || 'gemini-3.5-flash';

            const isFarsi = i18n.language === 'fa';
            const contents = isFarsi
                ? `بر اساس هدف "${prompt}"، یک لیست کوتاه و کاربردی از 3 تا 7 کار برای انجام دادن به زبان فارسی ایجاد کن.`
                : `Based on the goal "${prompt}", generate a short, actionable to-do list of 3 to 7 items.`;

            const response = await ai.models.generateContent({
                model,
                contents: contents,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            tasks: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            }
                        }
                    }
                }
            });

            const result = JSON.parse(response.text) as AITaskList;
            if (result.tasks && result.tasks.length > 0) {
                onSubmit(result.tasks);
            }
        } catch (error) {
            addToast(error instanceof Error ? error.message : t('toasts.ai.generateError'), 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit}>
                    <header className="p-4 border-b">
                        <h2 className="text-lg font-bold text-gray-800">{t('views.calendar.aiTitle')}</h2>
                    </header>
                    <main className="p-6">
                        <textarea
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            rows={4}
                            placeholder={t('views.calendar.aiPlaceholder') as string}
                            className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                            autoFocus
                        />
                    </main>
                    <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3">
                        <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                        <button type="submit" disabled={isGenerating || !prompt.trim()} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">{t('views.calendar.generate')}</button>
                    </footer>
                </form>
            </div>
        </div>
    );
};

export default AICalendarTasksModal;