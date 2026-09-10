import React, { useState, useEffect, useRef, useCallback } from 'react';
import { persianArabicToEnglish } from '../utils/formatters';

interface CustomDateInputProps {
    label: string;
    name: string;
    value: string; // YYYY-MM-DD
    onChange: (name: string, value: string) => void;
    required?: boolean;
    error?: string;
    onFocus?: (e: React.FocusEvent<HTMLDivElement>) => void;
}

const CustomDateInput: React.FC<CustomDateInputProps> = ({ label, name, value, onChange, required = false, error, onFocus }) => {
    const [date, setDate] = useState({ day: '', month: '', year: '' });
    // State to track if an IME is active to prevent premature focus jumps.
    const [isComposing, setIsComposing] = useState(false);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const dayRef = useRef<HTMLInputElement>(null);
    const monthRef = useRef<HTMLInputElement>(null);
    const yearRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Don't update from props if the user is currently focused on one of the inputs.
        // This prevents the component from overwriting user input during typing.
        if (
            document.activeElement === dayRef.current ||
            document.activeElement === monthRef.current ||
            document.activeElement === yearRef.current
        ) {
            return;
        }
        
        const internalDateString = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
        // Sync from `value` prop if it's a valid date string and differs from internal state.
        if (value && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
            if (value !== internalDateString) {
                const [y, m, d] = value.split('-');
                setDate({ year: y, month: m, day: d });
            }
        // If prop value is empty, clear the internal state.
        } else if (!value && (date.year || date.month || date.day)) {
            setDate({ day: '', month: '', year: '' });
        }
    }, [value, date.year, date.month, date.day]);
    
    const commitChange = useCallback(() => {
        const { day, month, year } = date;
        // Check if all parts are filled and look like a valid date structure.
        if (day.length > 0 && month.length > 0 && year.length === 4) {
             const d = parseInt(day, 10);
             const m = parseInt(month, 10);
             const y = parseInt(year, 10);

             // Basic sanity check for date parts.
             if (!isNaN(d) && !isNaN(m) && !isNaN(y) && d > 0 && d <= 31 && m > 0 && m <= 12 && y > 1900 && y < 3000) {
                 const newDateString = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                 if (newDateString !== value) {
                    onChange(name, newDateString);
                 }
             }
        // If all fields are empty, commit an empty string if the prop isn't already empty.
        } else if (!day && !month && !year) {
             if (value !== '') {
                 onChange(name, '');
             }
        }
    }, [date, name, onChange, value]);


    const handlePartChange = (part: 'day' | 'month' | 'year', val: string) => {
        const englishVal = persianArabicToEnglish(val).replace(/[^0-9]/g, '');
        const maxLength = part === 'year' ? 4 : 2;
        const truncatedVal = englishVal.slice(0, maxLength);
        
        setDate(prev => ({ ...prev, [part]: truncatedVal }));
    };

    const handleKeyDown = (part: 'day' | 'month' | 'year', e: React.KeyboardEvent<HTMLInputElement>) => {
        const { key } = e;
        const target = e.currentTarget;
        
        // --- Navigation Logic ---
        if (key === 'Enter') {
            e.preventDefault(); // Prevent form submission
            if (part === 'day') {
                monthRef.current?.focus();
                return;
            }
            if (part === 'month') {
                yearRef.current?.focus();
                return;
            }
            if (part === 'year') {
                const form = target.form;
                if (form) {
                    const focusable = Array.from(
                        form.querySelectorAll('input, select, textarea, button:not([tabindex="-1"])')
                    ).filter(el => {
                        const htmlEl = el as HTMLElement;
                        return !htmlEl.hasAttribute('disabled') && htmlEl.offsetParent !== null && !htmlEl.hasAttribute('readonly');
                    }) as HTMLElement[];
                    const index = focusable.indexOf(target);
                    if (index > -1 && index < focusable.length - 1) {
                        focusable[index + 1].focus();
                    }
                }
                return;
            }
        } else if (key === 'ArrowRight' && target.selectionStart === target.value.length) {
            if (part === 'day') monthRef.current?.focus();
            if (part === 'month') yearRef.current?.focus();
        } else if (key === 'ArrowLeft' && target.selectionStart === 0) {
            if (part === 'year') monthRef.current?.focus();
            if (part === 'month') dayRef.current?.focus();
        }
        
        // --- Value Manipulation Logic ---
        let numValue = parseInt(persianArabicToEnglish(target.value), 10) || 0;

        if (key === 'ArrowUp' || key === 'ArrowDown') {
            e.preventDefault();
            numValue = key === 'ArrowUp' ? numValue + 1 : numValue - 1;

            let finalValue: string;
            if (part === 'day') {
                if (numValue > 31) numValue = 1;
                if (numValue < 1) numValue = 31;
                finalValue = String(numValue).padStart(2, '0');
            } else if (part === 'month') {
                if (numValue > 12) numValue = 1;
                if (numValue < 1) numValue = 12;
                finalValue = String(numValue).padStart(2, '0');
            } else { // year
                if (numValue < 1900) numValue = new Date().getFullYear();
                if (numValue > 3000) numValue = new Date().getFullYear();
                finalValue = String(numValue);
            }
            handlePartChange(part, finalValue);
        }
    };
    
    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        // Commit changes only if the focus moves outside the component's container.
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
            commitChange();
        }
    };

    const handleCompositionEnd = () => {
        setIsComposing(false);
    };

    return (
        <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{label}{required && <span className="text-red-500">*</span>}</label>
            <div 
                ref={containerRef}
                onBlur={handleBlur}
                onFocus={onFocus}
                className={`flex items-center border rounded-md focus-within:ring-1 focus-within:ring-indigo-500 bg-white ${error ? 'border-red-500' : 'border-slate-300 focus-within:border-indigo-500'}`} 
                dir="ltr"
            >
                <input
                    ref={dayRef} type="text" placeholder="DD" value={date.day}
                    onChange={e => handlePartChange('day', e.target.value)}
                    onKeyDown={e => handleKeyDown('day', e)}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={handleCompositionEnd}
                    maxLength={2} required={required}
                    className="w-10 p-2 text-center text-gray-900 bg-transparent border-none focus:ring-0"
                />
                <span className="text-slate-300">/</span>
                <input
                    ref={monthRef} type="text" placeholder="MM" value={date.month}
                    onChange={e => handlePartChange('month', e.target.value)}
                    onKeyDown={e => handleKeyDown('month', e)}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={handleCompositionEnd}
                    maxLength={2} required={required}
                    className="w-10 p-2 text-center text-gray-900 bg-transparent border-none focus:ring-0"
                />
                <span className="text-slate-300">/</span>
                <input
                    ref={yearRef} type="text" placeholder="YYYY" value={date.year}
                    onChange={e => handlePartChange('year', e.target.value)}
                    onKeyDown={e => handleKeyDown('year', e)}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={handleCompositionEnd}
                    maxLength={4} required={required}
                    className="w-16 p-2 text-center text-gray-900 bg-transparent border-none focus:ring-0"
                />
            </div>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
};

export default CustomDateInput;