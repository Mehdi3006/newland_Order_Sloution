import jalaali from 'jalaali-js';
// FIX: Changed i18n import to a named import to resolve the "no default export" error. This is necessary because the file does not have a default export.
import i18n from 'i18next';

/**
 * Converts a YYYY-MM-DD string to a Date object, handling potential timezone issues.
 * Assumes the input string is in UTC to avoid off-by-one day errors.
 */
export const stringToDate = (dateStr: string): Date => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return new Date(0); // A date in the far past for invalid inputs
    }
    return new Date(`${dateStr}T00:00:00Z`);
};

/**
 * Gets the calendar-specific details for a given date.
 * @param date - The Date object.
 * @returns An object with Jalali and Gregorian year, month, day.
 */
export const getCalendarInfo = (date: Date) => {
    const gy = date.getUTCFullYear();
    const gm = date.getUTCMonth(); // 0-11
    const gd = date.getUTCDate();
    const { jy, jm, jd } = jalaali.toJalaali(gy, gm + 1, gd);
    return { jy, jm, jd, gy, gm, gd };
};


/**
 * Formats a date string (YYYY-MM-DD) into a localized DD/MM/YYYY format with Latin numerals.
 * @param dateStr - The date string in YYYY-MM-DD format.
 * @param lang - The current language ('en' or 'fa').
 * @returns A formatted date string (e.g., "21/07/2024" or "1403/04/31").
 */
export const formatDisplayDate = (dateStr: string, lang: string): string => {
    if (!dateStr) return '';
    const date = stringToDate(dateStr);
    if (date.getTime() === new Date(0).getTime()) return ''; // Handle invalid dates

    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'UTC',
    };

    if (lang === 'fa') {
        // Use fa-IR locale but force latin numbering system. This is the most robust way.
        return date.toLocaleDateString('fa-IR-u-nu-latn', {
            ...options,
            calendar: 'jalali',
        });
    }
    
    // English formatting
    return date.toLocaleDateString('en-GB', options);
};

/**
 * Formats the time part of a Date object into a consistent HH:mm format using Latin numerals.
 * @param date - The Date object.
 * @returns A formatted time string (e.g., "09:30").
 */
export const formatDisplayTime = (date: Date): string => {
    // Use toLocaleTimeString to be robust, ensuring Latin numerals.
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        numberingSystem: 'latn',
    });
};


/**
 * Gets the localized month name and year for a given date, with Latin numerals for the year.
 * @param date - The Date object.
 * @param lang - The current language ('en' or 'fa').
 * @returns A string like "July 2024" or "Tir 1403".
 */
export const getMonthNameAndYear = (date: Date, lang: string): string => {
    if (lang === 'fa') {
        const monthName = date.toLocaleDateString('fa-IR', { month: 'long', calendar: 'jalali', timeZone: 'UTC' });
        // Get the year separately with forced Latin numerals
        const year = date.toLocaleDateString('fa-IR-u-nu-latn', { year: 'numeric', calendar: 'jalali', timeZone: 'UTC' });
        return `${monthName} ${year}`;
    }

    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        timeZone: 'UTC',
    });
};

/**
 * Gets the year and month key for grouping orders.
 * @param date - The Date object.
 * @param lang - The current language ('en' or 'fa').
 * @returns A string key like "2024-6" (for July) or "1403-3" (for Tir, jm=4 so jm-1=3).
 */
export const getYearMonthKey = (date: Date, lang: string): string => {
    const { jy, jm, gy, gm } = getCalendarInfo(date);
    if (lang === 'fa') {
        return `${jy}-${jm-1}`; // use 0-indexed month for consistency
    }
    return `${gy}-${gm}`;
};

/**
 * Gets the current month's key.
 * @param lang - The current language ('en' or 'fa').
 * @returns A string key for the current month.
 */
export const getCurrentYearMonthKey = (lang: string): string => {
    return getYearMonthKey(new Date(), lang);
};

/**
 * Creates a Date object from a year-month key.
 * @param key - A string key like "2024-6".
 * @param lang - The current language ('en' or 'fa').
 * @returns A Date object representing the first day of that month.
 */
export const dateFromYearMonthKey = (key: string, lang: string): Date => {
    const [year, month] = key.split('-').map(Number);
    if (lang === 'fa') {
        const { gy, gm, gd } = jalaali.toGregorian(year, month + 1, 1);
        return new Date(Date.UTC(gy, gm - 1, gd));
    }
    return new Date(Date.UTC(year, month, 1));
};