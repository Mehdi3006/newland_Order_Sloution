import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Product, PriceHistory, CostingSettings } from '../types';
import { formatDisplayDate, formatDisplayTime } from '../utils/dateUtils';
import { useSettings } from '../hooks/useSettings';

interface PriceHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
}

interface PriceRowProps {
    prices: Product['sellingPrices'];
    landedCostAED?: number;
    landedCostTOMAN?: number;
    isCurrent?: boolean;
    timestamp?: string;
    id?: number;
    onDelete?: (id: number) => void;
    compareTo?: { // The newer state to compare against
        prices: Product['sellingPrices'];
        landedCostAED: number;
        landedCostTOMAN: number;
    };
}

const PriceHistoryModal: React.FC<PriceHistoryModalProps> = ({ isOpen, onClose, product }) => {
    const { t, i18n } = useTranslation();
    const { settings } = useSettings();

    const costingSettings = useMemo(() => {
        const cs = settings.find(s => s.key === 'perShipmentCostingSettings');
        return cs?.value as CostingSettings | null;
    }, [settings]);

    const tierMetadata = useMemo(() => {
        return costingSettings?.pricingTiers?.metadata || {
            tier1: { name: 'Tier 1' },
            tier2: { name: 'Tier 2' },
            tier3: { name: 'Tier 3' },
        };
    }, [costingSettings]);

    const history = useLiveQuery(
        () => (product ? db.priceHistory.where({ productId: product.id }).reverse().sortBy('timestamp') : Promise.resolve([])),
        [product?.id]
    );

    if (!isOpen || !product) return null;

    const handleDelete = async (id: number) => {
        // No confirmation needed per user request
        await db.priceHistory.delete(id);
    };

    const numberFormatter = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const tomanFormatter = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });

    const PriceRow: React.FC<PriceRowProps> = ({ prices, isCurrent, timestamp, landedCostAED, landedCostTOMAN, id, onDelete, compareTo }) => {
        // Helper to check for changes and return a class
        const getChangeClass = (
            currentValue: number | undefined, 
            compareValue: number | undefined
        ): string => {
            if (isCurrent || !compareTo || currentValue === undefined || compareValue === undefined) {
                return '';
            }
            // Using a small epsilon for float comparison to handle potential floating point inaccuracies
            return Math.abs(currentValue - compareValue) > 0.001 ? 'text-red-600 font-bold' : '';
        };
        
        return (
            <tr className={isCurrent ? 'bg-blue-50 font-semibold text-blue-900' : 'hover:bg-slate-50 text-slate-800'}>
                <td className="p-2 border-b border-slate-200">
                    {isCurrent ? t('priceHistoryModal.currentPrice') : `${formatDisplayDate(timestamp!.split('T')[0], i18n.language)} ${formatDisplayTime(new Date(timestamp!))}`}
                </td>
                <td className={`p-2 border-b border-slate-200 text-center font-mono ${getChangeClass(landedCostAED, compareTo?.landedCostAED)}`}>{numberFormatter(landedCostAED || 0)}</td>
                <td className={`p-2 border-b border-slate-200 text-center font-mono ${getChangeClass(landedCostTOMAN, compareTo?.landedCostTOMAN)}`}>{tomanFormatter(landedCostTOMAN || 0)}</td>
                <td className={`p-2 border-b border-slate-200 text-center font-mono ${getChangeClass(prices.aed.tier1, compareTo?.prices.aed.tier1)}`}>{numberFormatter(prices.aed.tier1)}</td>
                <td className={`p-2 border-b border-slate-200 text-center font-mono ${getChangeClass(prices.aed.tier2, compareTo?.prices.aed.tier2)}`}>{numberFormatter(prices.aed.tier2)}</td>
                <td className={`p-2 border-b border-slate-200 text-center font-mono ${getChangeClass(prices.aed.tier3, compareTo?.prices.aed.tier3)}`}>{numberFormatter(prices.aed.tier3)}</td>
                <td className={`p-2 border-b border-slate-200 text-center font-mono ${getChangeClass(prices.toman.tier1, compareTo?.prices.toman.tier1)}`}>{tomanFormatter(prices.toman.tier1)}</td>
                <td className={`p-2 border-b border-slate-200 text-center font-mono ${getChangeClass(prices.toman.tier2, compareTo?.prices.toman.tier2)}`}>{tomanFormatter(prices.toman.tier2)}</td>
                <td className={`p-2 border-b border-slate-200 text-center font-mono ${getChangeClass(prices.toman.tier3, compareTo?.prices.toman.tier3)}`}>{tomanFormatter(prices.toman.tier3)}</td>
                <td className="p-2 border-b border-slate-200 text-center">
                    {!isCurrent && onDelete && id && (
                        <button
                            onClick={() => onDelete(id)}
                            className="p-1 text-red-500 hover:bg-red-100 rounded-full"
                            title={t('buttons.delete') as string}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                            </svg>
                        </button>
                    )}
                </td>
            </tr>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex-shrink-0">
                    <h2 className="text-lg font-bold text-gray-800">{t('priceHistoryModal.title')}</h2>
                    <p className="text-sm text-slate-600">{product.description} ({product.internalCode})</p>
                </header>
                <main className="flex-1 overflow-y-auto p-4">
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-100 text-xs text-slate-600 uppercase">
                                <tr>
                                    <th className="p-2 text-left">{t('labels.date')}</th>
                                    <th className="p-2">LANDED COST (AED)</th>
                                    <th className="p-2">LANDED COST (TOMAN)</th>
                                    <th className="p-2">AED {tierMetadata.tier1.name}</th>
                                    <th className="p-2">AED {tierMetadata.tier2.name}</th>
                                    <th className="p-2">AED {tierMetadata.tier3.name}</th>
                                    <th className="p-2">TOMAN {tierMetadata.tier1.name}</th>
                                    <th className="p-2">TOMAN {tierMetadata.tier2.name}</th>
                                    <th className="p-2">TOMAN {tierMetadata.tier3.name}</th>
                                    <th className="p-2">{t('common.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <PriceRow prices={product.sellingPrices} isCurrent landedCostAED={product.landedCostAED} landedCostTOMAN={product.landedCostTOMAN} />
                                {history?.map((entry) => {
                                    // ALWAYS compare historical entries to the current state of the product.
                                    const compareToState = { 
                                        prices: product.sellingPrices, 
                                        landedCostAED: product.landedCostAED, 
                                        landedCostTOMAN: product.landedCostTOMAN 
                                    };
                                    
                                    return (
                                        <PriceRow 
                                            key={entry.id} 
                                            id={entry.id} 
                                            prices={entry.oldPrices} 
                                            timestamp={entry.timestamp} 
                                            landedCostAED={entry.oldLandedCostAED} 
                                            landedCostTOMAN={entry.oldLandedCostTOMAN} 
                                            onDelete={handleDelete}
                                            compareTo={compareToState}
                                        />
                                    );
                                })}
                                {(!history || history.length === 0) && (
                                    <tr>
                                        <td colSpan={10} className="p-8 text-center text-slate-500">{t('priceHistoryModal.noHistory')}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </main>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end">
                    <button onClick={onClose} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('common.close')}</button>
                </footer>
            </div>
        </div>
    );
};

export default PriceHistoryModal;