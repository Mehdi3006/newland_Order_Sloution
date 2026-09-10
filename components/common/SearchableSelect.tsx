import React, { useState, useRef, useEffect, useMemo } from 'react';
import { persianArabicToEnglish } from '../../utils/formatters';

export interface SearchableOption {
    id: string | number;
    label: string;
    subLabel?: string;
    code?: string;
    badge?: string;
    badgeColor?: string;
    data?: any;
}

interface SearchableSelectProps {
    options: SearchableOption[];
    value: string;
    onChange: (value: string, selectedOption?: SearchableOption) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    allowCustomValue?: boolean;
    disabled?: boolean;
    autoFocus?: boolean;
    onBlur?: () => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    icon?: React.ReactNode;
    emptyMessage?: string;
    highlightMatch?: boolean;
}

// Normalize Persian and Arabic characters for resilient search matching
const normalizePersianArabicText = (text: string = ''): string => {
    return persianArabicToEnglish(text)
        .toLowerCase()
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
        .trim();
};

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'جستجو و انتخاب...',
    className = '',
    inputClassName = '',
    allowCustomValue = true,
    disabled = false,
    autoFocus = false,
    onBlur,
    onKeyDown,
    icon,
    emptyMessage = 'موردی یافت نشد',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState(value || '');
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Keep internal input text in sync when external prop changes
    useEffect(() => {
        setInputValue(value || '');
    }, [value]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setHighlightedIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter options based on user input
    const filteredOptions = useMemo(() => {
        const query = normalizePersianArabicText(inputValue);
        if (!query) return options.slice(0, 40); // Show top items when empty

        const tokens = query.split(/\s+/).filter(Boolean);
        return options.filter(opt => {
            const labelNorm = normalizePersianArabicText(opt.label);
            const subNorm = normalizePersianArabicText(opt.subLabel || '');
            const codeNorm = normalizePersianArabicText(opt.code || '');
            const combined = `${labelNorm} ${subNorm} ${codeNorm}`;
            return tokens.every(token => combined.includes(token));
        }).slice(0, 50); // Cap at 50 for performance
    }, [options, inputValue]);

    // Scroll active item into view
    useEffect(() => {
        if (isOpen && highlightedIndex >= 0 && listRef.current) {
            const activeElem = listRef.current.children[highlightedIndex] as HTMLElement;
            if (activeElem) {
                activeElem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleSelectOption = (opt: SearchableOption) => {
        setInputValue(opt.label);
        setIsOpen(false);
        setHighlightedIndex(-1);
        onChange(opt.label, opt);
        inputRef.current?.blur();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const text = e.target.value;
        setInputValue(text);
        setIsOpen(true);
        setHighlightedIndex(0);

        if (allowCustomValue) {
            // Find if there is an exact matching option
            const exactMatch = options.find(
                o => normalizePersianArabicText(o.label) === normalizePersianArabicText(text) ||
                     (o.code && normalizePersianArabicText(o.code) === normalizePersianArabicText(text))
            );
            onChange(text, exactMatch);
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (onKeyDown) onKeyDown(e);

        if (disabled) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
                setHighlightedIndex(0);
            } else {
                setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
                setHighlightedIndex(filteredOptions.length - 1);
            } else {
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
            }
        } else if (e.key === 'Enter') {
            if (isOpen && highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
                e.preventDefault();
                handleSelectOption(filteredOptions[highlightedIndex]);
            } else if (isOpen) {
                setIsOpen(false);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
            setHighlightedIndex(-1);
        }
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        setInputValue('');
        onChange('', undefined);
        setIsOpen(true);
        setHighlightedIndex(-1);
        inputRef.current?.focus();
    };

    return (
        <div ref={containerRef} className={`relative w-full ${className}`}>
            <div className="relative flex items-center">
                {icon && (
                    <div className="absolute right-2.5 text-slate-400 pointer-events-none flex items-center">
                        {icon}
                    </div>
                )}
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => {
                        setIsOpen(true);
                        setHighlightedIndex(-1);
                    }}
                    onBlur={() => {
                        if (onBlur) onBlur();
                    }}
                    onKeyDown={handleInputKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    className={`w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:opacity-60 ${
                        icon ? 'pr-8' : ''
                    } ${inputValue ? 'pl-7' : ''} ${inputClassName}`}
                />
                {inputValue && !disabled && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute left-2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition"
                        title="پاک کردن"
                    >
                        <span className="text-xs font-bold leading-none block px-1">✕</span>
                    </button>
                )}
            </div>

            {/* Dropdown Options List */}
            {isOpen && !disabled && (
                <div className="absolute z-50 mt-1 w-full min-w-[240px] max-w-[480px] right-0 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <ul
                        ref={listRef}
                        className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs py-1"
                    >
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt, idx) => {
                                const isHighlighted = idx === highlightedIndex;
                                return (
                                    <li
                                        key={opt.id}
                                        onMouseDown={(e) => {
                                            // onMouseDown fires before onBlur
                                            e.preventDefault();
                                            handleSelectOption(opt);
                                        }}
                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                        className={`px-3 py-2 cursor-pointer transition flex items-center justify-between gap-2 ${
                                            isHighlighted
                                                ? 'bg-indigo-50 text-indigo-900 font-semibold'
                                                : 'text-slate-700 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex flex-col min-w-0 pr-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {opt.code && (
                                                    <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                                                        {opt.code}
                                                    </span>
                                                )}
                                                <span className="truncate">{opt.label}</span>
                                            </div>
                                            {opt.subLabel && (
                                                <span className="text-[10px] text-slate-500 truncate mt-0.5">
                                                    {opt.subLabel}
                                                </span>
                                            )}
                                        </div>

                                        {opt.badge && (
                                            <span
                                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                                    opt.badgeColor || 'bg-slate-100 text-slate-600'
                                                }`}
                                            >
                                                {opt.badge}
                                            </span>
                                        )}
                                    </li>
                                );
                            })
                        ) : (
                            <li className="px-3 py-4 text-center text-slate-400 text-xs">
                                {emptyMessage}
                                {allowCustomValue && inputValue && (
                                    <div className="mt-1 text-[11px] text-indigo-600 font-bold">
                                        «{inputValue}» به عنوان مقدار آزاد ثبت خواهد شد
                                    </div>
                                )}
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
};
