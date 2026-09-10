import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CostingSettings, OrderItem, ProductIranCustomsCosts } from '../types';
import { useSettings } from '../hooks/useSettings';
import NumericInput from './NumericInput';
import Select from './Select';
import { calculateIranCustomsCosts } from '../utils/costCalculator';
import { formatToman } from '../utils/formatters';

interface InstantCostCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CalculatorInputs {
  grossWeight: number;
  cartonCBM: number;
  itemsPerCarton: number;
  purchasePriceUSD: number;
  customsValue: number;
  customsValueBasis: 'unit' | 'kg';
  shipCosts: number;
  dubaiCosts: number;
  iranCosts: number;
}

const initialInputs: CalculatorInputs = {
  grossWeight: 0,
  cartonCBM: 0,
  itemsPerCarton: 1,
  purchasePriceUSD: 0,
  customsValue: 0,
  customsValueBasis: 'unit',
  shipCosts: 0,
  dubaiCosts: 0,
  iranCosts: 0,
};

const handleFormKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
            return;
        }
        
        e.preventDefault();
        const form = target.closest('form');
        if (!form) return;
        
        const focusable = Array.from(
            form.querySelectorAll('input:not([type="hidden"]), select, textarea, button:not([tabindex="-1"])')
        ).filter(el => {
            const htmlEl = el as HTMLElement;
            return !htmlEl.hasAttribute('disabled') && !htmlEl.hasAttribute('readonly') && htmlEl.offsetParent !== null;
        }) as HTMLElement[];
        
        const index = focusable.indexOf(target);
        
        if (index > -1 && index < focusable.length - 1) {
            focusable[index + 1].focus();
        }
    }
};

const InstantCostCalculatorModal: React.FC<InstantCostCalculatorModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const [activeTab, setActiveTab] = useState('summary');
    const [inputs, setInputs] = useState<CalculatorInputs>(() => {
        try {
            const saved = localStorage.getItem('instantCalculatorState');
            return saved ? JSON.parse(saved) : initialInputs;
        } catch {
            return initialInputs;
        }
    });

    useEffect(() => {
        localStorage.setItem('instantCalculatorState', JSON.stringify(inputs));
    }, [inputs]);

    const costingSettings = useMemo(() => {
        const cs = settings.find(s => s.key === 'perShipmentCostingSettings');
        return cs?.value as CostingSettings | null;
    }, [settings]);

    const handleInputChange = useCallback((field: keyof CalculatorInputs, value: any) => {
        setInputs(prev => ({ ...prev, [field]: value }));
    }, []);

    const handleClear = () => {
        setInputs(initialInputs);
    };

    const calculatedCosts = useMemo(() => {
        if (!costingSettings) return null;

        const dummyItem: OrderItem = {
            id: 'calc-item',
            productName: 'Calculator Item',
            quantity: inputs.itemsPerCarton,
            price: inputs.purchasePriceUSD,
            itemsPerCarton: inputs.itemsPerCarton,
            cartonCBM: inputs.cartonCBM,
            grossWeight: inputs.grossWeight,
            customsValue: inputs.customsValue,
            customsValueBasis: inputs.customsValueBasis,
        };

        const iranCustoms = calculateIranCustomsCosts(dummyItem, costingSettings);
        const totalIranCustoms = Object.values(iranCustoms).reduce((sum, val) => sum + (val || 0), 0);
        
        const landedCostUSD = inputs.purchasePriceUSD + (inputs.shipCosts / inputs.itemsPerCarton);
        const landedCostAED = (landedCostUSD * costingSettings.fx.usd_aed) + (inputs.dubaiCosts / inputs.itemsPerCarton);
        const landedCostTOMAN = (landedCostAED * costingSettings.fx.aed_toman) + (inputs.iranCosts / inputs.itemsPerCarton) + totalIranCustoms;

        return { iranCustoms, totalIranCustoms, landedCostAED, landedCostTOMAN };
    }, [inputs, costingSettings]);

    if (!isOpen) return null;

    const ResultRow: React.FC<{ label: string; value: string | number; isTotal?: boolean; currency?: string }> = ({ label, value, isTotal = false, currency }) => (
        <div className={`flex justify-between items-center py-2 ${isTotal ? 'font-bold text-lg border-t-2 border-slate-300 mt-2 pt-2' : 'border-b border-slate-200'}`}>
            <span className={isTotal ? "text-slate-800" : "text-slate-600"}>{label}</span>
            <span className="font-mono text-slate-800">{value} {currency}</span>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex-shrink-0">
                    <h2 className="text-lg font-bold text-gray-800">{t('calculator.title')}</h2>
                </header>
                <main className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    {/* Inputs */}
                    <form className="space-y-4" onSubmit={e => e.preventDefault()}>
                        <h3 className="text-xl font-semibold text-gray-800">{t('calculator.inputs')}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <NumericInput label={t('calculator.grossWeightPerCarton')} value={inputs.grossWeight} onChange={v => handleInputChange('grossWeight', v)} onKeyDown={handleFormKeyDown} />
                            <NumericInput label={t('calculator.cbmPerCarton')} value={inputs.cartonCBM} onChange={v => handleInputChange('cartonCBM', v)} onKeyDown={handleFormKeyDown} fractionDigits={3} />
                            <NumericInput label={t('calculator.itemsPerCarton')} value={inputs.itemsPerCarton} onChange={v => handleInputChange('itemsPerCarton', v)} onKeyDown={handleFormKeyDown} min={1} />
                            <NumericInput label={t('calculator.purchasePrice')} value={inputs.purchasePriceUSD} onChange={v => handleInputChange('purchasePriceUSD', v)} onKeyDown={handleFormKeyDown} />
                            <NumericInput label={t('calculator.customsValue')} value={inputs.customsValue} onChange={v => handleInputChange('customsValue', v)} onKeyDown={handleFormKeyDown} />
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">{t('calculator.customsBasis')}</label>
                                <Select value={inputs.customsValueBasis} onChange={e => handleInputChange('customsValueBasis', e.target.value)} onKeyDown={handleFormKeyDown as any}>
                                    <option value="unit">{t('orderFormModal.customsBasisOptions.unit')}</option>
                                    <option value="kg">{t('orderFormModal.customsBasisOptions.kg')}</option>
                                </Select>
                            </div>
                        </div>
                        <h4 className="font-semibold text-slate-700 pt-2">{t('labels.costs')} (Per Carton)</h4>
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <NumericInput label={t('calculator.shipCosts')} value={inputs.shipCosts} onChange={v => handleInputChange('shipCosts', v)} onKeyDown={handleFormKeyDown} />
                            <NumericInput label={t('calculator.dubaiCosts')} value={inputs.dubaiCosts} onChange={v => handleInputChange('dubaiCosts', v)} onKeyDown={handleFormKeyDown} />
                            <NumericInput label={t('calculator.iranCosts')} value={inputs.iranCosts} onChange={v => handleInputChange('iranCosts', v)} onKeyDown={handleFormKeyDown} />
                         </div>
                    </form>
                    {/* Results */}
                    <div className="space-y-4 md:border-s md:pl-8 border-slate-200">
                         <h3 className="text-xl font-semibold text-gray-800">{t('calculator.results')} (Per Unit)</h3>
                         <nav className="flex space-x-2 border-b">
                            <button onClick={() => setActiveTab('summary')} className={`pb-2 px-1 border-b-2 text-sm font-medium ${activeTab === 'summary' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t('calculator.summary')}</button>
                            <button onClick={() => setActiveTab('iran')} className={`pb-2 px-1 border-b-2 text-sm font-medium ${activeTab === 'iran' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t('orderModal.tabs.iranStage')}</button>
                         </nav>
                         <div className="bg-slate-50 p-4 rounded-md">
                            {!costingSettings && <p className="text-red-600">Costing settings not loaded.</p>}
                            {costingSettings && calculatedCosts && (
                                <>
                                {activeTab === 'summary' && (
                                    <>
                                        <ResultRow label={t('labels.purchasePrice')} value={inputs.purchasePriceUSD.toFixed(2)} currency="USD" />
                                        <ResultRow label={t('labels.shipStageCosts')} value={(inputs.shipCosts / inputs.itemsPerCarton).toFixed(2)} currency="USD" />
                                        <ResultRow label={t('labels.dubaiStageCosts')} value={(inputs.dubaiCosts / inputs.itemsPerCarton).toFixed(2)} currency="AED" />
                                        <ResultRow label={t('labels.iranStageCosts')} value={formatToman(inputs.iranCosts / inputs.itemsPerCarton, costingSettings)} currency={t('common.toman')} />
                                        <ResultRow label={t('calculator.totalIranCustoms')} value={formatToman(calculatedCosts.totalIranCustoms, costingSettings)} currency={t('common.toman')} />
                                        <ResultRow label={t('calculator.landedCostAed')} value={calculatedCosts.landedCostAED.toFixed(2)} currency="AED" isTotal />
                                        <ResultRow label={t('calculator.totalLandedCostToman')} value={formatToman(calculatedCosts.landedCostTOMAN, costingSettings)} currency={t('common.toman')} isTotal />
                                    </>
                                )}
                                {activeTab === 'iran' && (
                                    <>
                                        <ResultRow label={t('iranCustomsPanel.finalDutyToman')} value={formatToman(calculatedCosts.iranCustoms.finalDuty_TOMAN, costingSettings)} />
                                        <ResultRow label={t('iranCustomsPanel.importVatToman')} value={formatToman(calculatedCosts.iranCustoms.importVat_TOMAN, costingSettings)} />
                                        <ResultRow label={t('iranCustomsPanel.brokerFee')} value={formatToman(calculatedCosts.iranCustoms.brokerFee_TOMAN, costingSettings)} />
                                        <ResultRow label={t('iranCustomsPanel.shipFreight')} value={formatToman(calculatedCosts.iranCustoms.shipFreight_TOMAN, costingSettings)} />
                                        <ResultRow label={t('iranCustomsPanel.inlandFreight')} value={formatToman(calculatedCosts.iranCustoms.inlandFreight_TOMAN, costingSettings)} />
                                        <ResultRow label={t('iranCustomsPanel.standardFee')} value={formatToman(calculatedCosts.iranCustoms.standardFee_TOMAN, costingSettings)} />
                                        <ResultRow label={t('iranCustomsPanel.loadingUnloadingFee')} value={formatToman(calculatedCosts.iranCustoms.loadingUnloadingFee_TOMAN, costingSettings)} />
                                        <ResultRow label={t('calculator.totalIranCustoms')} value={formatToman(calculatedCosts.totalIranCustoms, costingSettings)} isTotal />
                                    </>
                                )}
                                </>
                            )}
                         </div>
                    </div>
                </main>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex-shrink-0 flex justify-between items-center">
                    <button type="button" onClick={handleClear} className="bg-red-100 text-red-700 px-4 py-2 rounded-md hover:bg-red-200">{t('calculator.clear')}</button>
                    <button type="button" onClick={onClose} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('common.close')}</button>
                </footer>
            </div>
        </div>
    );
};

export default InstantCostCalculatorModal;