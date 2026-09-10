import React, { useState, useRef, useEffect, useMemo } from 'react';
import { persianArabicToEnglish } from '../../utils/formatters';

export interface PartyOption {
    id: string | number;
    name: string;
    code?: string;
    accountCode?: string;
    phone?: string;
    type?: 'customer' | 'supplier' | 'other';
}

interface PartySearchComboboxProps {
    parties: PartyOption[];
    value: string;
    onSelectParty: (party: PartyOption) => void;
    onChangeText: (name: string) => void;
    placeholder?: string;
    label?: string;
    className?: string;
    inputClassName?: string;
    disabled?: boolean;
}

const normalizeText = (text: string = ''): string => {
    return persianArabicToEnglish(text)
        .toLowerCase()
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();
};

export const PartySearchCombobox: React.FC<PartySearchComboboxProps> = ({
    parties,
    value,
    onSelectParty,
    onChangeText,
    placeholder = 'جستجو یا نام طرف حساب...',
    label,
    className = '',
    inputClassName = '',
    disabled = false,
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

    // Filter parties with fast partial matching
    const filteredParties = useMemo(() => {
        const query = normalizeText(value);
        if (!query) {
            return parties.slice(0, 40);
        }

        const rawCleanQuery = query.replace(/[^a-z0-9\u0600-\u06FF]/gi, '');
        const tokens = query.split(/[\s\-_/]+/).filter(Boolean);

        return parties.filter(p => {
            const nameNorm = normalizeText(p.name);
            const codeNorm = normalizeText(p.code || '');
            const accNorm = normalizeText(p.accountCode || '');
            const phoneNorm = normalizeText(p.phone || '');

            const cleanCode = codeNorm.replace(/[^a-z0-9]/gi, '');
            const cleanAcc = accNorm.replace(/[^a-z0-9]/gi, '');
            const cleanPhone = phoneNorm.replace(/[^a-z0-9]/gi, '');

            if (rawCleanQuery && (cleanCode.includes(rawCleanQuery) || cleanAcc.includes(rawCleanQuery) || cleanPhone.includes(rawCleanQuery))) {
                return true;
            }

            const combined = `${nameNorm} ${codeNorm} ${accNorm} ${phoneNorm}`;
            return tokens.every(token => combined.includes(token));
        }).slice(0, 50);
    }, [parties, value]);

    // Scroll active item into view
    useEffect(() => {
        if (isOpen && highlightedIndex >= 0 && listRef.current) {
            const activeElem = listRef.current.children[highlightedIndex] as HTMLElement;
            if (activeElem) {
                activeElem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleSelect = (party: PartyOption) => {
        setIsOpen(false);
        setHighlightedIndex(-1);
        onSelectParty(party);
        inputRef.current?.blur();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
                setHighlightedIndex(0);
            } else {
                setHighlightedIndex(prev => (prev < filteredParties.length - 1 ? prev + 1 : 0));
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
                setHighlightedIndex(filteredParties.length - 1);
            } else {
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredParties.length - 1));
            }
        } else if (e.key === 'Enter') {
            if (isOpen && highlightedIndex >= 0 && filteredParties[highlightedIndex]) {
                e.preventDefault();
                handleSelect(filteredParties[highlightedIndex]);
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
            {label && (
                <label className="block text-slate-700 font-semibold mb-1 text-xs">
                    {label}
                </label>
            )}
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
                    placeholder={placeholder}
                    disabled={disabled}
                    className={`w-full bg-white border border-slate-300 rounded-lg p-1.5 pe-12 text-slate-800 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 ${inputClassName}`}
                />

                <div className="absolute left-1.5 flex items-center gap-1 text-slate-400">
                    {value && !disabled && (
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
                        disabled={disabled}
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

            {/* Dropdown List */}
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full min-w-[280px] max-w-[420px] right-0 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in duration-100">
                    <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                        <span>طرف‌های حساب ({filteredParties.length} مورد)</span>
                        <span className="text-[10px] text-slate-400 font-normal">کلید Enter برای انتخاب</span>
                    </div>

                    <ul
                        ref={listRef}
                        className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs py-0.5"
                    >
                        {filteredParties.length > 0 ? (
                            filteredParties.map((party, idx) => {
                                const isHighlighted = idx === highlightedIndex;
                                return (
                                    <li
                                        key={party.id || idx}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleSelect(party);
                                        }}
                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                        className={`px-3 py-2 cursor-pointer transition flex items-center justify-between gap-2 ${
                                            isHighlighted
                                                ? 'bg-indigo-50 text-indigo-900 font-semibold'
                                                : 'text-slate-700 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-semibold text-slate-800 truncate">
                                                {party.name}
                                            </span>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                                {party.accountCode && (
                                                    <span className="font-mono bg-slate-100 px-1 rounded text-slate-700">
                                                        کد: {party.accountCode}
                                                    </span>
                                                )}
                                                {party.phone && (
                                                    <span className="font-mono text-slate-500">
                                                        {party.phone}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {party.type && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0 font-medium">
                                                {party.type === 'supplier' ? 'تامین‌کننده' : party.type === 'customer' ? 'مشتری' : 'سایر'}
                                            </span>
                                        )}
                                    </li>
                                );
                            })
                        ) : (
                            <li className="px-3 py-4 text-center text-slate-400 text-xs">
                                <span>موردی یافت نشد.</span>
                                {value && (
                                    <div className="mt-1 text-[11px] text-slate-600 font-medium">
                                        «{value}» به عنوان طرف حساب جدید ثبت می‌شود
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
