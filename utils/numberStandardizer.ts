/**
 * Global English Digit & Numeric Standardizer for Newland Application
 *
 * Guarantees that:
 * 1. All user inputs from Persian / Arabic keyboards (۰-۹ and ٠-٩) are immediately intercepted and converted to English digits (0-9).
 * 2. Persian and Arabic decimal (٫) and thousands separators (، / ٬) are converted to standard . and ,
 * 3. All number formatting and locale displays use English Latin digits across the entire application.
 * 4. Clipboard paste events containing Persian/Arabic digits are automatically normalized.
 */

export const persianArabicToEnglish = (val: any): string => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    return s
        .replace(/[\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) - 0x06F0)) // Persian digits ۰-۹
        .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660)) // Arabic digits ٠-٩
        .replace(/\u066B/g, '.') // Persian/Arabic decimal separator ٫
        .replace(/[\u066C\u060C]/g, ','); // Arabic thousands / comma separator ٬ and ،
};

export const parseEnglishFloat = (val: any, fallback: number = 0): number => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'number') return isNaN(val) ? fallback : val;
    const clean = persianArabicToEnglish(String(val)).replace(/,/g, '').trim();
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? fallback : parsed;
};

export const parseEnglishInt = (val: any, fallback: number = 0): number => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'number') return isNaN(val) ? fallback : Math.floor(val);
    const clean = persianArabicToEnglish(String(val)).replace(/,/g, '').trim();
    const parsed = parseInt(clean, 10);
    return isNaN(parsed) ? fallback : parsed;
};

export const formatEnglishNumber = (
    val: number | null | undefined,
    options?: Intl.NumberFormatOptions
): string => {
    if (val === null || val === undefined || isNaN(Number(val))) return '0';
    return Number(val).toLocaleString('en-US', options);
};

let isInitialized = false;

/**
 * Initializes global event listeners to intercept keyboard input, clipboard paste,
 * and input events, strictly preventing Persian/Arabic digits from entering any input field.
 * Also patches Number.prototype.toLocaleString to ensure all UI numbers are displayed in Latin digits.
 */
export function initializeGlobalNumberStandardizer() {
    if (isInitialized || typeof window === 'undefined') return;
    isInitialized = true;

    // 1. Patch Number.prototype.toLocaleString to strictly format with English numerals
    try {
        const originalToLocaleString = Number.prototype.toLocaleString;
        Number.prototype.toLocaleString = function (locales?: string | string[], options?: Intl.NumberFormatOptions) {
            // If called without locales, or called with Persian/Arabic locales, force en-US
            if (!locales || (typeof locales === 'string' && (locales.startsWith('fa') || locales.startsWith('ar')))) {
                return originalToLocaleString.call(this, 'en-US', options);
            }
            if (Array.isArray(locales) && locales.some(l => l.startsWith('fa') || l.startsWith('ar'))) {
                return originalToLocaleString.call(this, 'en-US', options);
            }
            return originalToLocaleString.call(this, locales, options);
        };
    } catch (err) {
        console.warn('Failed to patch Number.prototype.toLocaleString:', err);
    }

    // 2. Global Keydown Interceptor (Capture phase)
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement;
        if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return;
        if (target.readOnly || target.disabled) return;

        // Persian digits U+06F0-U+06F9, Arabic digits U+0660-U+0669
        const isDigit = /^[\u06F0-\u06F9\u0660-\u0669]$/.test(e.key);
        const isDecimalSep = e.key === '٫';
        const isCommaSep = e.key === '،' || e.key === '٬';

        if (isDigit || isDecimalSep || isCommaSep) {
            e.preventDefault();
            const replacement = isDigit
                ? persianArabicToEnglish(e.key)
                : isDecimalSep
                ? '.'
                : ',';

            // Handle type="number" vs standard text/tel inputs
            if (target.type === 'number') {
                const currentVal = target.value || '';
                const newVal = currentVal + replacement;
                target.value = newVal;
                target.dispatchEvent(new Event('input', { bubbles: true }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // Text, tel, search, etc.
                const start = target.selectionStart ?? target.value.length;
                const end = target.selectionEnd ?? target.value.length;
                const val = target.value;
                const nextVal = val.substring(0, start) + replacement + val.substring(end);
                target.value = nextVal;
                target.setSelectionRange(start + 1, start + 1);
                target.dispatchEvent(new Event('input', { bubbles: true }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }, true);

    // 3. Global Paste Interceptor (Capture phase)
    window.addEventListener('paste', (e: ClipboardEvent) => {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement;
        if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return;
        if (target.readOnly || target.disabled) return;

        const pastedData = e.clipboardData?.getData('text');
        if (pastedData && /[\u06F0-\u06F9\u0660-\u0669\u066B\u066C\u060C]/.test(pastedData)) {
            e.preventDefault();
            const converted = persianArabicToEnglish(pastedData);
            if (target.type === 'number') {
                target.value = converted;
                target.dispatchEvent(new Event('input', { bubbles: true }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                const start = target.selectionStart ?? target.value.length;
                const end = target.selectionEnd ?? target.value.length;
                const val = target.value;
                const nextVal = val.substring(0, start) + converted + val.substring(end);
                target.value = nextVal;
                target.setSelectionRange(start + converted.length, start + converted.length);
                target.dispatchEvent(new Event('input', { bubbles: true }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }, true);

    // 4. Global Input Event Interceptor (Safety net for virtual keyboards / autocorrect / autofill)
    window.addEventListener('input', (e: Event) => {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement;
        if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return;
        if (target.type === 'file' || target.type === 'password') return;

        const val = target.value;
        if (typeof val === 'string' && /[\u06F0-\u06F9\u0660-\u0669\u066B\u066C\u060C]/.test(val)) {
            const converted = persianArabicToEnglish(val);
            if (converted !== val) {
                const start = target.selectionStart;
                const end = target.selectionEnd;
                target.value = converted;
                try {
                    if (start !== null && end !== null) {
                        target.setSelectionRange(start, end);
                    }
                } catch (_) {}
            }
        }
    }, true);
}
