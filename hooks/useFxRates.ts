import { useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Currency, CostingSettings } from '../types';
import { 
    FxRates, 
    DEFAULT_FX_RATES, 
    convertCurrency, 
    convertToUSD, 
    convertToAED, 
    convertToTOMAN, 
    convertToCNY, 
    getExchangeRate, 
    getRateToAED, 
    getRateToUSD, 
    formatCurrency 
} from '../utils/fxEngine';

export const useFxRates = () => {
    const costingSetting = useLiveQuery(() => db.settings.get('perShipmentCostingSettings'), []);

    const rates: FxRates = useMemo(() => {
        const settingVal = costingSetting?.value as CostingSettings | undefined;
        if (settingVal?.fx) {
            return {
                usd_aed: Number(settingVal.fx.usd_aed) || DEFAULT_FX_RATES.usd_aed,
                aed_toman: Number(settingVal.fx.aed_toman) || DEFAULT_FX_RATES.aed_toman,
                aed_cny: Number(settingVal.fx.aed_cny) || DEFAULT_FX_RATES.aed_cny,
            };
        }
        return DEFAULT_FX_RATES;
    }, [costingSetting]);

    // Update centralized FX rates across the entire application
    const updateFxRates = useCallback(async (newRates: Partial<FxRates>) => {
        const currentSetting = await db.settings.get('perShipmentCostingSettings');
        const currentValue: CostingSettings = currentSetting?.value || {
            fx: DEFAULT_FX_RATES,
            iranCustoms: {} as any,
            pricingTiers: {} as any,
            vat: {} as any,
            defaultAllocation: { perOrder: 'value' },
            rounding: { aed: 0.001, toman: 10000, tomanDisplayDivisor: 1000 },
        };

        const updatedValue: CostingSettings = {
            ...currentValue,
            fx: {
                usd_aed: Number(newRates.usd_aed !== undefined ? newRates.usd_aed : currentValue.fx?.usd_aed) || DEFAULT_FX_RATES.usd_aed,
                aed_toman: Number(newRates.aed_toman !== undefined ? newRates.aed_toman : currentValue.fx?.aed_toman) || DEFAULT_FX_RATES.aed_toman,
                aed_cny: Number(newRates.aed_cny !== undefined ? newRates.aed_cny : currentValue.fx?.aed_cny) || DEFAULT_FX_RATES.aed_cny,
            }
        };

        await db.settings.put({
            key: 'perShipmentCostingSettings',
            value: updatedValue,
        });
    }, []);

    // Bound utility functions
    const convert = useCallback((amount: number, from: Currency, to: Currency) => {
        return convertCurrency(amount, from, to, rates);
    }, [rates]);

    const toUSD = useCallback((amount: number, from: Currency) => {
        return convertToUSD(amount, from, rates);
    }, [rates]);

    const toAED = useCallback((amount: number, from: Currency) => {
        return convertToAED(amount, from, rates);
    }, [rates]);

    const toTOMAN = useCallback((amount: number, from: Currency) => {
        return convertToTOMAN(amount, from, rates);
    }, [rates]);

    const toCNY = useCallback((amount: number, from: Currency) => {
        return convertToCNY(amount, from, rates);
    }, [rates]);

    const getRate = useCallback((from: Currency, to: Currency) => {
        return getExchangeRate(from, to, rates);
    }, [rates]);

    return {
        rates,
        updateFxRates,
        convert,
        toUSD,
        toAED,
        toTOMAN,
        toCNY,
        getRate,
        formatCurrency,
    };
};
