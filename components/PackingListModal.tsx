import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Order, Product, CompanyInfo } from '../types';
import { generatePackingListHtml } from '../utils/formatters';
import LoadingOverlay from './LoadingOverlay';

interface PackingListModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerateSheet: (order: Order, products: Product[], billTo: string) => void;
    onExportExcel: (order: Order, products: Product[], billTo: string) => Promise<void>;
    order: Order;
    products: Product[];
    companyInfo: CompanyInfo;
    companyLogo: string;
}

const PackingListModal: React.FC<PackingListModalProps> = ({ isOpen, onClose, onGenerateSheet, onExportExcel, order, products, companyInfo, companyLogo }) => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    const [billTo, setBillTo] = useState(t('invoiceModal.billToPlaceholder'));

    const packingListHtml = useMemo(() => {
        if (!isOpen || products.length === 0) {
            return '<html><body><p>Loading preview...</p></body></html>';
        }
        try {
            return generatePackingListHtml(order, products, t, companyInfo, companyLogo, billTo);
        } catch (error) {
            console.error("Error generating Packing List HTML:", error);
            return `<html><body><h1>Error Generating Preview</h1><p>${(error as Error).message}</p></body></html>`;
        }
    }, [isOpen, order, products, t, companyInfo, companyLogo, billTo]);

    const handleGenerateSheet = () => {
        onGenerateSheet(order, products, billTo);
    };

    const handleExport = async () => {
        setIsLoading(true);
        try {
            await onExportExcel(order, products, billTo);
        } catch (error) {
            console.error("Failed to export Packing List:", error);
            alert(`Failed to export Excel file: ${(error as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            {isLoading && <LoadingOverlay message={t('views.customsBook.generatingPL')} />}
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex-shrink-0 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">{t('packingList.title')}</h2>
                    <button onClick={onClose} className="p-2 rounded-full text-slate-500 hover:bg-slate-100" aria-label={t('common.close')}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 min-h-0">
                    <div className="md:col-span-1 bg-slate-50 p-4 border-e border-slate-200 flex flex-col gap-y-4 overflow-y-auto">
                       <p className="text-sm text-slate-600">Review the packing list below. You can generate it as a new sheet in the Customs Book or export it directly as an Excel file.</p>
                        <div>
                            <label htmlFor="plBillTo" className="block text-sm font-medium text-slate-700 mb-1">{t('invoiceModal.billTo')}</label>
                            <textarea
                                id="plBillTo"
                                value={billTo}
                                onChange={e => setBillTo(e.target.value)}
                                rows={4}
                                className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                    <main className="md:col-span-2 overflow-auto p-2 bg-slate-200">
                        <iframe
                            srcDoc={packingListHtml}
                            title="Packing List Preview"
                            className="w-full h-full border-none bg-white shadow-inner"
                        />
                    </main>
                </div>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3 border-t border-slate-200">
                    <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                    <button
                        type="button"
                        onClick={handleExport}
                        className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed flex items-center gap-x-2"
                        disabled={products.length === 0}
                    >
                        {t('buttons.exportToExcel')}
                    </button>
                    <button
                        type="button"
                        onClick={handleGenerateSheet}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed"
                        disabled={products.length === 0}
                    >
                        {t('buttons.create')} Sheet
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default PackingListModal;
