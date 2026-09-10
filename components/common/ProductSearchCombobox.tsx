import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Product } from '../../types';
import { persianArabicToEnglish } from '../../utils/formatters';

interface ProductSearchComboboxProps {
    products: Product[];
    mode: 'code' | 'name';
    value: string;
    onSelectProduct: (product: Product) => void;
    onChangeText: (text: string) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    hasError?: boolean;
    autoFocus?: boolean;
}

const normalizeText = (text: string = ''): string => {
    return persianArabicToEnglish(text)
        .toLowerCase()
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();
};

export const ProductSearchCombobox: React.FC<ProductSearchComboboxProps> = ({
    products,
    mode,
    value,
    onSelectProduct,
    onChangeText,
    placeholder,
    className = '',
    inputClassName = '',
    hasError = false,
    autoFocus = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Close on click outside
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

    const defaultPlaceholder = mode === 'code' ? 'کد کالا (NL-101)...' : 'نام یا شرح کالا...';

    // Filter products: fast partial match on code, partNumber, name, and description
    const filteredProducts = useMemo(() => {
        const query = normalizeText(value);
        if (!query) {
            return products.slice(0, 40);
        }

        const rawCleanQuery = query.replace(/[^a-z0-9\u0600-\u06FF]/gi, '');
        const tokens = query.split(/[\s\-_/]+/).filter(Boolean);

        return products.filter(p => {
            const code = normalizeText(p.internalCode || '');
            const part = normalizeText(p.partNumber || '');
            const nameFa = normalizeText(p.productNameFa || '');
            const desc = normalizeText(p.description || '');
            const cat = normalizeText(p.category || '');

            // Partial alphanumeric code match (e.g. "101" or "nl101" matches "NL-101")
            const cleanCode = code.replace(/[^a-z0-9]/gi, '');
            const cleanPart = part.replace(/[^a-z0-9]/gi, '');
            if (rawCleanQuery && (cleanCode.includes(rawCleanQuery) || cleanPart.includes(rawCleanQuery))) {
                return true;
            }

            // Word token match across all fields
            const combined = `${code} ${part} ${nameFa} ${desc} ${cat}`;
            return tokens.every(token => combined.includes(token));
        }).slice(0, 50);
    }, [products, value]);

    // Scroll active item into view
    useEffect(() => {
        if (isOpen && highlightedIndex >= 0 && listRef.current) {
            const activeElem = listRef.current.children[highlightedIndex] as HTMLElement;
            if (activeElem) {
                activeElem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleSelect = (product: Product) => {
        setIsOpen(false);
        setHighlightedIndex(-1);
        onSelectProduct(product);
        inputRef.current?.blur();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
                setHighlightedIndex(0);
            } else {
                setHighlightedIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
                setHighlightedIndex(filteredProducts.length - 1);
            } else {
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
            }
        } else if (e.key === 'Enter') {
            if (isOpen && highlightedIndex >= 0 && filteredProducts[highlightedIndex]) {
                e.preventDefault();
                handleSelect(filteredProducts[highlightedIndex]);
            } else if (isOpen) {
                setIsOpen(false);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
            setHighlightedIndex(-1);
        }
    };

    return (
        <div ref={containerRef} className={`relative w-full ${isOpen ? 'z-50' : 'z-10'} ${className}`}>
            <div className="relative flex items-center">
                <input
                    ref={inputRef}
                    type="text"
                    value={value || ''}
                    onChange={(e) => {
                        onChangeText(e.target.value);
                        setIsOpen(true);
                        setHighlightedIndex(0);
                    }}
                    onFocus={(e) => {
                        e.target.select();
                        setIsOpen(true);
                        setHighlightedIndex(-1);
                    }}
                    onClick={() => {
                        setIsOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder || defaultPlaceholder}
                    autoFocus={autoFocus}
                    className={`w-full border rounded-lg p-1.5 text-xs transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                        mode === 'code' ? 'font-mono font-bold' : 'font-medium text-slate-800'
                    } ${
                        hasError
                            ? 'border-amber-400 bg-amber-50/40 text-amber-900'
                            : 'border-slate-300 bg-white text-slate-800'
                    } ${value ? 'pe-12' : 'pe-6'} ${inputClassName}`}
                />

                <div className="absolute left-1.5 flex items-center gap-1 text-slate-400">
                    {value && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onChangeText('');
                                setIsOpen(true);
                                inputRef.current?.focus();
                            }}
                            className="hover:text-slate-600 p-0.5 rounded transition"
                            title="پاک کردن"
                        >
                            <span className="text-[11px] font-bold leading-none block">✕</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(!isOpen);
                            inputRef.current?.focus();
                        }}
                        className="hover:text-slate-600 p-0.5 rounded transition text-[10px]"
                    >
                        ▾
                    </button>
                </div>
            </div>

            {/* Autocomplete Dropdown */}
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full min-w-[280px] max-w-[460px] right-0 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in duration-100">
                    <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                        <span>کاتالوگ کالا ({filteredProducts.length} مورد)</span>
                        <span className="text-[10px] text-slate-400 font-normal">کلید Enter برای انتخاب</span>
                    </div>
                    <ul
                        ref={listRef}
                        className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs py-0.5"
                    >
                        {filteredProducts.length > 0 ? (
                            filteredProducts.map((p, idx) => {
                                const isHighlighted = idx === highlightedIndex;
                                return (
                                    <li
                                        key={p.id}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleSelect(p);
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
                                                <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                                                    {p.internalCode || 'بدون کد'}
                                                </span>
                                                <span className="truncate font-medium text-slate-800">
                                                    {p.productNameFa || p.description}
                                                </span>
                                            </div>
                                            {p.description && p.productNameFa && (
                                                <span className="text-[10px] text-slate-500 truncate mt-0.5 font-mono">
                                                    {p.description}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {p.itemsPerCarton && p.itemsPerCarton > 1 ? (
                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                                    {p.itemsPerCarton} تایی
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-50 text-slate-500">
                                                    تکی
                                                </span>
                                            )}
                                        </div>
                                    </li>
                                );
                            })
                        ) : (
                            <li className="px-3 py-4 text-center text-slate-400 text-xs">
                                <span>کالایی با این مشخصات یافت نشد.</span>
                                {value && (
                                    <div className="mt-1 text-[11px] text-slate-600 font-medium">
                                        «{value}» به عنوان کالای سفارشی درج می‌شود
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
