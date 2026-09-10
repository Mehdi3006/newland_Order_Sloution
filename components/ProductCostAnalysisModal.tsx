import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Product, CostingSettings } from '../types';
import { recalculateProductPrices } from '../utils/costCalculator';
import { formatToman } from '../utils/formatters';

interface ProductCostAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    costingSettings: CostingSettings | null;
}

const CostRow: React.FC<{ label: React.ReactNode; value: string | number; isTotal?: boolean; currency?: string }> = ({ label, value, isTotal, currency }) => {
    const { t } = useTranslation();
    const valueDisplay = currency === 'TOMAN'
        ? `${value} ${t('common.toman')}`
        : `${currency || ''} ${value}`.trim();

    return (
        <div className={`flex justify-between items-center py-2 ${isTotal ? 'font-bold text-lg border-t-2 border-slate-300 mt-2 pt-2' : 'border-b border-slate-200'}`}>
            <span className="font-mono text-slate-800">{valueDisplay}</span>
            <span className={`${isTotal ? "text-slate-800" : "text-slate-600"} text-right`}>{label}</span>
        </div>
    );
};

const ProductCostAnalysisModal: React.FC<ProductCostAnalysisModalProps> = ({ isOpen, onClose, product, costingSettings }) => {
    const { t } = useTranslation();

    const calculatedProduct = useMemo(() => {
        if (!product || !costingSettings) return null;
        return recalculateProductPrices(product, costingSettings);
    }, [product, costingSettings]);

    if (!isOpen || !calculatedProduct || !costingSettings) return null;

    const {
        iranCustomsCosts,
        purchasePriceUSD,
        shipStageCostsUSD,
        dubaiStageCostsAED,
        iranStageCostsTOMAN,
        landedCostUSD,
        landedCostAED,
        landedCostTOMAN,
        customsValue,
        customsValueBasis
    } = calculatedProduct;
    const totalManualIranCosts = iranStageCostsTOMAN;
    const totalSystemIranCosts = Object.values(iranCustomsCosts).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);

    const usdFormatter = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const aedFormatter = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const tomanFormatter = (val: number) => formatToman(val, costingSettings);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex-shrink-0">
                    <h2 className="text-lg font-bold text-gray-800">{t('buttons.costAnalysis')}: {product?.description}</h2>
                    <p className="text-sm text-slate-600 font-mono">{product?.internalCode}</p>
                </header>
                <main className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    {/* Landed Cost Flow */}
                    <div className="space-y-1">
                        <h3 className="text-md font-semibold text-slate-800 border-b pb-2 mb-2 text-right">قیمت تمام شده خلاصه</h3>
                        
                        <CostRow label={t('labels.purchasePrice')} value={usdFormatter(purchasePriceUSD)} currency="USD" />
                        <CostRow label={<>+ {t('labels.shipStageCosts')}</>} value={usdFormatter(shipStageCostsUSD)} currency="USD" />
                        <CostRow label="=" value={usdFormatter(landedCostUSD)} currency="USD" isTotal/>
                        
                        <div className="text-center text-slate-400 text-2xl my-2">&darr;</div>

                        <CostRow label="Landed Cost (USD) x FX" value={aedFormatter(landedCostUSD * costingSettings.fx.usd_aed)} currency="AED" />
                        <CostRow label={`+ ${t('labels.dubaiStageCosts')}`} value={aedFormatter(dubaiStageCostsAED)} currency="AED" />
                        <CostRow label="=" value={aedFormatter(landedCostAED)} currency="AED" isTotal />
                        
                        <div className="text-center text-slate-400 text-2xl my-2">&darr;</div>

                        <CostRow label="Landed Cost (AED) x FX" value={tomanFormatter(landedCostAED * costingSettings.fx.aed_toman)} currency={t('common.toman')} />
                        <CostRow label={`+ ${t('labels.iranStageCosts')} (Manual)`} value={tomanFormatter(totalManualIranCosts)} currency={t('common.toman')} />
                        <CostRow label={`+ ${t('calculator.totalIranCustoms')}`} value={tomanFormatter(totalSystemIranCosts)} currency={t('common.toman')} />
                        <CostRow label="=" value={tomanFormatter(landedCostTOMAN)} currency={t('common.toman')} isTotal />
                    </div>

                    {/* Iran Customs Breakdown */}
                    <div className="space-y-1">
                        <h3 className="text-md font-semibold text-slate-800 border-b pb-2 mb-2 text-right">{t('settings.costing.iranCustoms')}</h3>
                        
                        <CostRow label={t('orderFormModal.table.customsValue')} value={usdFormatter(customsValue || 0)} currency="USD" />
                        <CostRow label={t('orderFormModal.table.customsBasis')} value={t(`orderFormModal.customsBasisOptions.${customsValueBasis || 'unit'}` as any)} />
                        <div className="h-px bg-slate-300 my-2"></div>

                        <CostRow label={t('iranCustomsPanel.finalDutyToman')} value={tomanFormatter(iranCustomsCosts.finalDuty_TOMAN)} currency={t('common.toman')} />
                        <CostRow label={t('iranCustomsPanel.importVatToman')} value={tomanFormatter(iranCustomsCosts.importVat_TOMAN)} currency={t('common.toman')} />
                        <CostRow label={t('iranCustomsPanel.brokerFee')} value={tomanFormatter(iranCustomsCosts.brokerFee_TOMAN)} currency={t('common.toman')} />
                        <CostRow label={t('iranCustomsPanel.shipFreight')} value={tomanFormatter(iranCustomsCosts.shipFreight_TOMAN)} currency={t('common.toman')} />
                        <CostRow label={t('iranCustomsPanel.inlandFreight')} value={tomanFormatter(iranCustomsCosts.inlandFreight_TOMAN)} currency={t('common.toman')} />
                        <CostRow label={t('iranCustomsPanel.standardFee')} value={tomanFormatter(iranCustomsCosts.standardFee_TOMAN)} currency={t('common.toman')} />
                        <CostRow label={t('iranCustomsPanel.loadingUnloadingFee')} value={tomanFormatter(iranCustomsCosts.loadingUnloadingFee_TOMAN)} currency={t('common.toman')} />
                        <CostRow label={t('calculator.totalIranCustoms')} value={tomanFormatter(totalSystemIranCosts)} currency={t('common.toman')} isTotal />
                    </div>
                </main>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end">
                    <button onClick={onClose} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('common.close')}</button>
                </footer>
            </div>
        </div>
    );
};

export default ProductCostAnalysisModal;