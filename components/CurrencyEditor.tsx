import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CurrencyRates, CostingSettings } from '../types';
import NumericInput from './NumericInput';

interface CurrencyEditorProps {
    rates: CurrencyRates;
    costingSettings: CostingSettings | null;
    setAedToTomanRate: (newRate: number) => void;
    setUsdAedRate: (newRate: number) => void;
    setAedCnyRate: (newRate: number) => void;
}

const CurrencyEditor: React.FC<CurrencyEditorProps> = ({
    rates,
    costingSettings,
    setAedToTomanRate,
    setUsdAedRate,
    setAedCnyRate,
}) => {
    const { t } = useTranslation();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const aedToTomanRate = costingSettings?.fx.aed_toman || 0;
    const usdToAedRate = costingSettings?.fx.usd_aed || 0;
    const aedToCnyRate = costingSettings?.fx.aed_cny || 0;
    const usdToCnyRate = usdToAedRate * aedToCnyRate;
    
    const inputClassName = "w-full text-center border border-slate-300 rounded-md p-1 text-sm focus:ring-1 focus:ring-indigo-500 bg-white text-gray-900";
    const readOnlyInputClassName = "w-full text-center border border-slate-300 rounded-md p-1 text-sm bg-slate-100 text-gray-700 cursor-not-allowed";

    return (
        <div className="flex items-center gap-x-2 sm:gap-x-4">
            {/* Main header rates */}
             <div className="flex items-center gap-x-2">
                <div className="flex flex-col items-center">
                    <label className="text-xs text-slate-500 font-semibold">{t('header.rates.aedToman')}</label>
                    <NumericInput
                        value={aedToTomanRate}
                        onChange={setAedToTomanRate}
                        step={50}
                        fractionDigits={0}
                        className="w-24 text-center border border-slate-300 rounded-md p-1 text-sm bg-white text-gray-900"
                    />
                </div>
                <div className="h-8 w-px bg-slate-200 self-end mb-1 rtl:hidden"></div>
                 <div className="h-8 w-px bg-slate-200 self-end mb-1 ltr:hidden"></div>
                <div className="flex flex-col items-center">
                     <label className="text-xs text-slate-500 font-semibold">{t('header.rates.usdToman')}</label>
                    <NumericInput
                        value={rates.toman}
                        onChange={() => {}}
                        readOnly={true}
                        fractionDigits={0}
                        className="w-24 text-center border border-slate-200 rounded-md p-1 text-sm bg-slate-100 text-gray-700 cursor-not-allowed"
                    />
                </div>
            </div>

            {/* Dropdown for other rates */}
            <div className="relative" ref={dropdownRef}>
                <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="p-2 rounded-full text-slate-500 hover:bg-slate-200">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </button>
                {isDropdownOpen && (
                    <div className="absolute top-full end-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-slate-200 p-4 z-20">
                        <h4 className="font-semibold text-slate-800 mb-3">{t('header.currencySettings.title')}</h4>
                        <div className="space-y-3">
                             <NumericInput label={t('header.currencySettings.usdAed')} value={usdToAedRate} onChange={setUsdAedRate} step={0.001} fractionDigits={3} useFormatting={false} className={inputClassName} />
                             <NumericInput label={t('header.currencySettings.aedCny')} value={aedToCnyRate} onChange={setAedCnyRate} step={0.001} fractionDigits={3} useFormatting={false} className={inputClassName} />
                             <div className="h-px w-full bg-slate-200 my-2"></div>
                             <NumericInput label={t('header.currencySettings.usdCnyReadOnly')} value={usdToCnyRate} onChange={() => {}} readOnly={true} fractionDigits={4} useFormatting={false} className={readOnlyInputClassName} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CurrencyEditor;