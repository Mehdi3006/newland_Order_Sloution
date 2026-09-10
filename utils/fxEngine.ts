import { Currency, CostingSettings } from '../types';

export interface FxRates {
    usd_aed: number; // e.g. 3.6725 (1 USD = 3.6725 AED)
    aed_toman: number; // e.g. 27000 (1 AED = 27,000 Toman)
    aed_cny: number; // e.g. 1.95 (1 AED = 1.95 CNY -> 1 CNY = 0.5128 AED)
}

export const DEFAULT_FX_RATES: FxRates = {
    usd_aed: 3.6725,
    aed_toman: 27000,
    aed_cny: 1.95,
};

/**
 * Ensures a safe finite number or fallback.
 */
export const safeNumber = (val: any, fallback: number = 0): number => {
    const num = Number(val);
    return isFinite(num) && !isNaN(num) ? num : fallback;
};

/**
 * Calculate rate from any currency to USD.
 * Base conversions:
 * 1 USD = usd_aed AED
 * 1 AED = aed_toman TOMAN
 * 1 AED = aed_cny CNY (meaning 1 USD = usd_aed * aed_cny CNY)
 */
export const getRateToUSD = (currency: Currency, rates: FxRates = DEFAULT_FX_RATES): number => {
    const usdAed = safeNumber(rates.usd_aed, DEFAULT_FX_RATES.usd_aed);
    const aedToman = safeNumber(rates.aed_toman, DEFAULT_FX_RATES.aed_toman);
    const aedCny = safeNumber(rates.aed_cny, DEFAULT_FX_RATES.aed_cny);

    switch (currency) {
        case 'USD':
            return 1;
        case 'AED':
            return usdAed > 0 ? 1 / usdAed : 0;
        case 'TOMAN':
            return (usdAed > 0 && aedToman > 0) ? 1 / (usdAed * aedToman) : 0;
        case 'CNY':
            const cnyPerUsd = usdAed * aedCny;
            return cnyPerUsd > 0 ? 1 / cnyPerUsd : 0;
        default:
            return 1;
    }
};

/**
 * Calculate rate from any currency to AED.
 */
export const getRateToAED = (currency: Currency, rates: FxRates = DEFAULT_FX_RATES): number => {
    const usdAed = safeNumber(rates.usd_aed, DEFAULT_FX_RATES.usd_aed);
    const aedToman = safeNumber(rates.aed_toman, DEFAULT_FX_RATES.aed_toman);
    const aedCny = safeNumber(rates.aed_cny, DEFAULT_FX_RATES.aed_cny);

    switch (currency) {
        case 'AED':
            return 1;
        case 'USD':
            return usdAed;
        case 'TOMAN':
            return aedToman > 0 ? 1 / aedToman : 0;
        case 'CNY':
            return aedCny > 0 ? 1 / aedCny : 0;
        default:
            return 1;
    }
};

/**
 * Calculate exchange rate from currency A to currency B.
 * e.g. getExchangeRate('USD', 'AED') => 3.6725
 * e.g. getExchangeRate('AED', 'TOMAN') => 27000
 * e.g. getExchangeRate('CNY', 'AED') => 0.5128
 */
export const getExchangeRate = (from: Currency, to: Currency, rates: FxRates = DEFAULT_FX_RATES): number => {
    if (from === to) return 1;
    const rateFromUSD = getRateToUSD(from, rates);
    const rateToUSD = getRateToUSD(to, rates);
    if (rateToUSD <= 0) return 0;
    return rateFromUSD / rateToUSD;
};

/**
 * Convert any amount from one currency to another using unified FX matrix.
 */
export const convertCurrency = (
    amount: number,
    from: Currency,
    to: Currency,
    rates: FxRates = DEFAULT_FX_RATES
): number => {
    const safeAmt = safeNumber(amount, 0);
    if (from === to || safeAmt === 0) return safeAmt;
    const rate = getExchangeRate(from, to, rates);
    return safeAmt * rate;
};

/**
 * Convert amount to USD
 */
export const convertToUSD = (amount: number, from: Currency, rates: FxRates = DEFAULT_FX_RATES): number => {
    return convertCurrency(amount, from, 'USD', rates);
};

/**
 * Convert amount to AED
 */
export const convertToAED = (amount: number, from: Currency, rates: FxRates = DEFAULT_FX_RATES): number => {
    return convertCurrency(amount, from, 'AED', rates);
};

/**
 * Convert amount to TOMAN
 */
export const convertToTOMAN = (amount: number, from: Currency, rates: FxRates = DEFAULT_FX_RATES): number => {
    return convertCurrency(amount, from, 'TOMAN', rates);
};

/**
 * Convert amount to CNY
 */
export const convertToCNY = (amount: number, from: Currency, rates: FxRates = DEFAULT_FX_RATES): number => {
    return convertCurrency(amount, from, 'CNY', rates);
};

/**
 * Standard currency symbol or code formatter
 */
export const getCurrencySymbol = (currency: Currency): string => {
    switch (currency) {
        case 'USD': return '$';
        case 'AED': return 'AED';
        case 'CNY': return '¥';
        case 'TOMAN': return 'تومان';
        default: return currency;
    }
};

/**
 * Standard formatted currency string
 */
export const formatCurrency = (
    amount: number,
    currency: Currency,
    options?: { showSymbol?: boolean; maxDigits?: number }
): string => {
    const showSymbol = options?.showSymbol ?? true;
    const maxDigits = options?.maxDigits ?? (currency === 'TOMAN' ? 0 : 2);
    const formattedNum = safeNumber(amount, 0).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDigits,
    });

    if (!showSymbol) return formattedNum;

    switch (currency) {
        case 'USD':
            return `$${formattedNum}`;
        case 'AED':
            return `${formattedNum} AED`;
        case 'CNY':
            return `¥${formattedNum}`;
        case 'TOMAN':
            return `${formattedNum} تومان`;
        default:
            return `${formattedNum} ${currency}`;
    }
};
