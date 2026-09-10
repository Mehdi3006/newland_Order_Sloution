import React from 'react';
import { useTranslation } from 'react-i18next';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const HelpSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-800 mb-3 border-b border-slate-200 pb-2">{title}</h3>
        <div className="space-y-3 text-slate-700 leading-relaxed">{children}</div>
    </div>
);

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    const sidebarItems = [
        'dashboard', 'orders', 'products', 'projects', 'customsBook', 'recycleBin', 'settings'
    ];

    return (
        <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <header className="p-4 sm:p-6 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-800">{t('help.title')}</h2>
                    <button onClick={onClose} className="p-2 rounded-full text-slate-500 hover:bg-slate-100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>
                <main className="flex-1 overflow-y-auto p-6">
                    <HelpSection title={t('help.intro.title')}>
                        <p>{t('help.intro.p1')}</p>
                        <p>{t('help.intro.p2')}</p>
                    </HelpSection>

                    <HelpSection title={t('help.sidebar.title')}>
                        <ul className="list-disc list-inside space-y-2">
                           {sidebarItems.map(item => (
                               <li key={item}><strong>{t(`sidebar.${item}`)}:</strong> {t(`help.sidebar.${item}`)}</li>
                           ))}
                        </ul>
                    </HelpSection>

                    <HelpSection title={t('help.ordersView.title')}>
                        <p>{t('help.ordersView.p1')}</p>
                        <ul className="list-disc list-inside space-y-2 my-2">
                            <li><strong>{t('views.orders.listView')}:</strong> {t('help.ordersView.listView')}</li>
                            <li><strong>{t('views.orders.kanbanView')}:</strong> {t('help.ordersView.kanbanView')}</li>
                        </ul>
                        <p className="font-semibold">{t('help.ordersView.p2')}</p>
                        <ul className="list-disc list-inside space-y-2">
                            <li><strong>{t('buttons.newOrder')}:</strong> {t('help.ordersView.newOrder')}</li>
                            <li><strong>{t('buttons.importPO')}:</strong> {t('help.ordersView.importPO')}</li>
                        </ul>
                    </HelpSection>
                    
                    <HelpSection title={t('help.productsView.title')}>
                        <p>{t('help.productsView.p1')}</p>
                        <p>{t('help.productsView.p2')}</p>
                        <div className="mt-4 p-4 bg-slate-100 rounded-lg">
                            <h4 className="font-bold text-lg text-slate-800 mb-2">{t('help.productsView.importTitle')}</h4>
                            <ol className="list-decimal list-inside space-y-3 text-sm">
                                <li>
                                    <strong>{t('help.productsView.step1Title')}</strong>
                                    <p className="pl-4">{t('help.productsView.step1Desc')}</p>
                                </li>
                                <li>
                                    <strong>{t('help.productsView.step2Title')}</strong>
                                    <p className="pl-4">{t('help.productsView.step2Desc')}</p>
                                    <ul className="list-disc list-inside pl-8 mt-2 space-y-1">
                                        <li><strong>{t('help.productsView.requiredTitle')}:</strong> {t('help.productsView.requiredDesc')}</li>
                                        <li><strong>{t('help.productsView.importantTitle')}:</strong> {t('help.productsView.importantDesc')}</li>
                                        <li><strong>{t('help.productsView.optionalTitle')}:</strong> {t('help.productsView.optionalDesc')}</li>
                                        <li><strong>{t('help.productsView.costsTitle')}:</strong> {t('help.productsView.costsDesc')}</li>
                                    </ul>
                                </li>
                                <li>
                                    <strong>{t('help.productsView.step3Title')}</strong>
                                    <p className="pl-4">{t('help.productsView.step3Desc')}</p>
                                </li>
                                <li>
                                    <strong>{t('help.productsView.step4Title')}</strong>
                                    <p className="pl-4">{t('help.productsView.step4Desc')}</p>
                                </li>
                            </ol>
                            <p className="pl-4 mt-3 text-xs italic">{t('help.productsView.recommendations')}</p>
                        </div>
                    </HelpSection>

                    <HelpSection title={t('help.projects.title')}>
                        <p>{t('help.projects.p1')}</p>
                        <p>{t('help.projects.p2')}</p>
                    </HelpSection>

                    <HelpSection title={t('help.keyTools.title')}>
                        <p><strong>AI Features: </strong>{t('help.keyTools.ai')}</p>
                        <p><strong>{t('header.costCalculator')}: </strong>{t('help.keyTools.calculator')}</p>
                    </HelpSection>

                    <HelpSection title={t('help.settings.title')}>
                         <ul className="list-disc list-inside space-y-2">
                            <li><strong>{t('settings.tabs.templates')}:</strong> {t('help.settings.templates')}</li>
                            <li><strong>{t('settings.tabs.fileSystem')}:</strong> {t('help.settings.fileSystem')}</li>
                            <li><strong>{t('settings.tabs.backup')}:</strong> {t('help.settings.backup')}</li>
                        </ul>
                    </HelpSection>

                </main>
                 <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3">
                    <button type="button" onClick={onClose} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('common.close')}</button>
                </footer>
            </div>
        </div>
    );
};

export default HelpModal;