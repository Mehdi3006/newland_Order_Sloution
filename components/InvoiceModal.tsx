import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Order, Product, CostingSettings, CompanyInfo } from '../types';
import { generateInvoiceHtml, generateInvoiceExcel } from '../utils/formatters';
import LoadingOverlay from './LoadingOverlay';

interface InvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (options: {
        tier: 'tier1' | 'tier2' | 'tier3';
        currency: 'aed' | 'toman';
        billTo: string;
        notes: string;
        applyTax: boolean;
    }) => void;
    order: Order;
    products: Product[];
    companyInfo: CompanyInfo;
    companyLogo: string;
    costingSettings: CostingSettings | null;
}

const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, onGenerate, order, products, companyInfo, companyLogo, costingSettings }) => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    
    const activeTiers = useMemo(() => {
        if (!costingSettings?.pricingTiers?.metadata) return [];
        return (Object.entries(costingSettings.pricingTiers.metadata) as [['tier1' | 'tier2' | 'tier3', { isActive: boolean, name: string }]])
            .filter(([, meta]) => meta.isActive)
            .map(([key, meta]) => ({ key, name: meta.name }));
    }, [costingSettings]);

    // State for user-configurable invoice options
    const [tier, setTier] = useState<'tier1' | 'tier2' | 'tier3'>(() => activeTiers.length > 0 ? activeTiers[0].key : 'tier1');
    const [currency, setCurrency] = useState<'aed' | 'toman'>('aed');
    const [billTo, setBillTo] = useState(t('invoiceModal.billToPlaceholder'));
    const [notes, setNotes] = useState('');
    const [applyTax, setApplyTax] = useState(true);

    const sortedProducts = useMemo(() => {
        if (!order || !products) return [];
        // Create a map for quick product lookup by internalCode, falling back to description
        const productMap = new Map<string, Product>();
        products.forEach(p => {
            const key = p.internalCode || p.description;
            if (key) {
                productMap.set(key, p);
            }
        });

        // Map over order.items to preserve order and find the corresponding product
        return order.items
            .map(item => {
                const key = item.internalCode || item.productName;
                return productMap.get(key);
            })
            .filter((p): p is Product => !!p); // Filter out any items that couldn't be matched
    }, [order, products]);

    // Effect to reset state and set default tax option when modal opens or settings change
    useEffect(() => {
        if (isOpen) {
            if (costingSettings) {
                const currencyVatSetting = costingSettings.vat?.[currency];
                setApplyTax(currencyVatSetting?.enabled ?? false);
            }
             if (activeTiers.length > 0 && !activeTiers.some(t => t.key === tier)) {
                setTier(activeTiers[0].key);
            }
        } else if (!isOpen) {
            // Reset state when modal closes
            setTier(activeTiers.length > 0 ? activeTiers[0].key : 'tier1');
            setCurrency('aed');
            setBillTo(t('invoiceModal.billToPlaceholder'));
            setNotes('');
        }
    }, [isOpen, costingSettings, currency, activeTiers, tier, t]);

    // Memoize the generated HTML to avoid re-computation on every render
    const invoiceHtml = useMemo(() => {
        // Guard against calling the generator with incomplete data, preventing potential errors.
        if (!isOpen || !sortedProducts || sortedProducts.length === 0 || !costingSettings) {
            return '<html><head><title>Loading...</title></head><body><p>Generating invoice, please wait...</p></body></html>';
        }
        try {
            return generateInvoiceHtml(order, sortedProducts, tier, currency, companyInfo, companyLogo, billTo, notes, applyTax, t, costingSettings);
        } catch (error) {
            console.error("Error generating invoice HTML:", error);
            // Provide a user-friendly error message in the preview
            return `<html><head><title>Error</title></head><body><h1>Error Generating Invoice</h1><p>An unexpected error occurred. Please check the console for details.</p></body></html>`;
        }
    }, [isOpen, order, sortedProducts, tier, currency, companyInfo, companyLogo, billTo, notes, applyTax, t, costingSettings]);

    const handleGenerate = () => {
        onGenerate({ tier, currency, billTo, notes, applyTax });
    };

    const handleExportToExcel = async () => {
        if (!costingSettings || sortedProducts.length === 0) return;
        setIsLoading(true);
        try {
            await generateInvoiceExcel(order, sortedProducts, tier, currency, companyInfo, companyLogo, billTo, notes, applyTax, t, costingSettings);
        } catch (error) {
            console.error("Failed to generate Excel invoice:", error);
            alert("Failed to generate Excel file. See console for details.");
        } finally {
            setIsLoading(false);
        }
    };


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
             {isLoading && <LoadingOverlay message={t('views.customsBook.generatingInvoice')} />}
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex-shrink-0 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">{t('invoiceModal.title')}</h2>
                    <button onClick={onClose} className="p-2 rounded-full text-slate-500 hover:bg-slate-100" aria-label={t('common.close')}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 min-h-0">
                    {/* Controls Panel */}
                    <div className="md:col-span-1 bg-slate-50 p-4 border-e border-slate-200 flex flex-col gap-y-4 overflow-y-auto">
                        <div>
                            <label htmlFor="priceTier" className="block text-sm font-medium text-slate-700 mb-1">{t('invoiceModal.selectTier')}</label>
                            <select id="priceTier" value={tier} onChange={e => setTier(e.target.value as any)} className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500">
                                {activeTiers.length > 0 ? (
                                    activeTiers.map(t => <option key={t.key} value={t.key}>{t.name}</option>)
                                ) : (
                                    <>
                                        <option value="tier1">Tier 1</option>
                                        <option value="tier2">Tier 2</option>
                                        <option value="tier3">Tier 3</option>
                                    </>
                                )}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="currency" className="block text-sm font-medium text-slate-700 mb-1">{t('invoiceModal.selectCurrency')}</label>
                            <select id="currency" value={currency} onChange={e => setCurrency(e.target.value as any)} className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500">
                                <option value="aed">AED</option>
                                <option value="toman">{t('common.toman')}</option>
                            </select>
                        </div>
                         <div className="border-t border-slate-200 pt-4">
                            <label className="flex items-center gap-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={applyTax}
                                    onChange={e => setApplyTax(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm font-medium text-slate-700">{t('invoiceModal.applyTax')}</span>
                            </label>
                        </div>
                        <div>
                            <label htmlFor="billTo" className="block text-sm font-medium text-slate-700 mb-1">{t('invoiceModal.billTo')}</label>
                            <textarea
                                id="billTo"
                                value={billTo}
                                onChange={e => setBillTo(e.target.value)}
                                rows={4}
                                className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">{t('orderModal.printFooter.notes')}</label>
                             <textarea
                                id="notes"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={4}
                                className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Preview Panel */}
                    <main className="md:col-span-2 overflow-auto p-2 bg-slate-200">
                        <iframe
                            srcDoc={invoiceHtml}
                            title="Invoice Preview"
                            className="w-full h-full border-none bg-white shadow-inner"
                        />
                    </main>
                </div>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3 border-t border-slate-200">
                    <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                    <button
                        type="button"
                        onClick={handleExportToExcel}
                        className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed flex items-center gap-x-2"
                        disabled={sortedProducts.length === 0}
                        title={sortedProducts.length === 0 ? t('invoiceModal.noProducts') : ''}
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                        {t('buttons.exportToExcel')}
                    </button>
                    <button
                        type="button"
                        onClick={handleGenerate}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed"
                        disabled={sortedProducts.length === 0}
                        title={sortedProducts.length === 0 ? t('invoiceModal.noProducts') : ''}
                    >
                        {t('buttons.create')}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default InvoiceModal;
