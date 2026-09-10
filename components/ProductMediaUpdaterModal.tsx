import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScannedMedia } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useModals } from '../contexts/ModalContext';
import { db } from '../db';

interface ProductMediaUpdaterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSync: (scannedData: ScannedMedia[]) => Promise<{ updatedCount: number, imagesAdded: number, manualsAdded: number }>;
    selectedProductIds?: string[];
}

const ProductMediaUpdaterModal: React.FC<ProductMediaUpdaterModalProps> = ({ isOpen, onClose, onSync, selectedProductIds }) => {
    const { t } = useTranslation();
    const { settings, updateSetting } = useSettings();
    const { addToast } = useModals();
    
    const [rootPath, setRootPath] = useState('');
    const [syncMode, setSyncMode] = useState<'specific' | 'all'>('specific');
    const [specificCodes, setSpecificCodes] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [progressMessage, setProgressMessage] = useState('');
    const [result, setResult] = useState<{ updatedCount: number, imagesAdded: number, manualsAdded: number } | null>(null);

    useEffect(() => {
        if (isOpen) {
            const pathSetting = settings.find(s => s.key === 'productMediaRootPath');
            if (pathSetting) {
                setRootPath(pathSetting.value as string);
            }
            // Reset state on open
            setResult(null);
            setIsSyncing(false);
            setProgressMessage('');
            
            // Pre-fill codes if products are selected
            if (selectedProductIds && selectedProductIds.length > 0) {
                db.products.where('id').anyOf(selectedProductIds).toArray().then(products => {
                    const codes = products.map(p => p.internalCode).join('\n');
                    setSpecificCodes(codes);
                    setSyncMode('specific');
                });
            } else {
                 setSpecificCodes('');
                 setSyncMode('specific');
            }

        }
    }, [isOpen, settings, selectedProductIds]);

    const handleSelectFolder = async () => {
        if ((window as any).electronAPI?.selectMediaRootPath) {
            const path = await (window as any).electronAPI.selectMediaRootPath();
            if (path) {
                setRootPath(path);
                await updateSetting('productMediaRootPath', path);
            }
        } else {
            addToast("This feature is only available in the desktop app.", "error");
        }
    };

    const handleStartSync = async () => {
        if (!rootPath) {
            addToast('Please select the product root folder first.', 'error');
            return;
        }

        if (!(window as any).electronAPI?.scanProductFolders) {
            addToast("This feature is only available in the desktop app.", "error");
            return;
        }

        setIsSyncing(true);
        setResult(null);
        setProgressMessage(t('views.products.mediaSync.syncing'));
        
        try {
            const codes = syncMode === 'specific' ? specificCodes.split(/[\n,]/).map(c => c.trim()).filter(Boolean) : [];
            
            const scanResult = await (window as any).electronAPI.scanProductFolders({ rootPath, codes });
            
            if (scanResult.success) {
                const scannedData: ScannedMedia[] = scanResult.data;
                setProgressMessage(t('views.products.mediaSync.updateProgress', { updatedCount: 0, totalToUpdate: scannedData.length }));
                const syncResult = await onSync(scannedData);
                setResult(syncResult);
                setProgressMessage(t('views.products.mediaSync.syncCompleteTitle'));
            } else {
                throw new Error(scanResult.error);
            }

        } catch (error) {
            console.error('Sync failed:', error);
            setProgressMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsSyncing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-gray-800">{t('views.products.mediaSync.title')}</h2>
                </header>
                <main className="flex-1 overflow-y-auto p-6 space-y-4">
                    <p className="text-sm text-slate-600">{t('views.products.mediaSync.description')}</p>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t('views.products.mediaSync.rootPath')}</label>
                        <div className="flex items-center gap-x-2">
                            <input type="text" readOnly value={rootPath} className="w-full bg-slate-100 text-gray-700 border border-slate-300 rounded-md p-2 text-sm" />
                            <button onClick={handleSelectFolder} className="bg-slate-200 text-slate-700 px-3 py-2 rounded-md hover:bg-slate-300 text-sm font-semibold flex-shrink-0">{t('views.products.mediaSync.selectFolder')}</button>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-x-4">
                        <label className="flex items-center gap-x-2">
                            <input type="radio" name="syncMode" value="specific" checked={syncMode === 'specific'} onChange={() => setSyncMode('specific')} />
                            <span>{t('views.products.mediaSync.updateSpecific')}</span>
                        </label>
                         <label className="flex items-center gap-x-2">
                            <input type="radio" name="syncMode" value="all" checked={syncMode === 'all'} onChange={() => setSyncMode('all')} />
                            <span>{t('views.products.mediaSync.syncAll')}</span>
                        </label>
                    </div>

                    {syncMode === 'specific' && (
                        <div>
                            <textarea
                                value={specificCodes}
                                onChange={e => setSpecificCodes(e.target.value)}
                                rows={5}
                                placeholder={t('views.products.mediaSync.codesPlaceholder') as string}
                                className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    )}

                    {isSyncing && (
                        <div className="p-3 bg-slate-100 rounded-md text-center">
                            <p>{progressMessage}</p>
                        </div>
                    )}
                    
                    {result && !isSyncing && (
                        <div className="p-3 bg-green-100 text-green-800 rounded-md text-center">
                            <h4 className="font-bold">{t('views.products.mediaSync.syncCompleteTitle')}</h4>
                            <p>{t('views.products.mediaSync.syncCompleteMessage', result)}</p>
                        </div>
                    )}
                </main>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-between items-center">
                     <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.close')}</button>
                     <button type="button" onClick={handleStartSync} disabled={isSyncing || !rootPath} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">
                        {isSyncing ? t('views.products.mediaSync.syncing') : t('views.products.mediaSync.startSync')}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default ProductMediaUpdaterModal;
