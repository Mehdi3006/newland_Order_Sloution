import React, { useState, useRef, useEffect, useMemo } from 'react';
import { persianArabicToEnglish } from '../../utils/formatters';

export interface AccountOption {
    id?: string | number;
    code: string;
    name: string;
    name_fa?: string;
    type?: string;
}

interface AccountSearchComboboxProps {
    accounts: AccountOption[];
    value: string; // account code e.g. "1101"
    onSelectAccount: (account: AccountOption) => void;
    placeholder?: string;
    className?: string;
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

export const AccountSearchCombobox: React.FC<AccountSearchComboboxProps> = ({
    accounts,
    value,
    onSelectAccount,
    placeholder = 'جستجوی حساب یا کد...',
    className = '',
    disabled = false,
}) => {
    const selectedAccount = useMemo(() => {
        return accounts.find(a => a.code === value);
    }, [accounts, value]);

    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Sync input display with selectedAccount
    useEffect(() => {
        if (selectedAccount) {
            setInputValue(`${selectedAccount.code} - ${selectedAccount.name_fa || selectedAccount.name}`);
        } else if (value) {
            setInputValue(value);
        } else {
            setInputValue('');
        }
    }, [selectedAccount, value]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setHighlightedIndex(-1);
                // Restore formatted label on blur if an account is selected
                if (selectedAccount) {
                    setInputValue(`${selectedAccount.code} - ${selectedAccount.name_fa || selectedAccount.name}`);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedAccount]);

    // Instant partial matching for code or name
    const filteredAccounts = useMemo(() => {
        const query = normalizeText(inputValue);
        if (!query) {
            return accounts.slice(0, 50);
        }

        const rawCleanQuery = query.replace(/[^a-z0-9\u0600-\u06FF]/gi, '');
        const tokens = query.split(/[\s\-_/]+/).filter(Boolean);

        return accounts.filter(acc => {
            const codeNorm = normalizeText(acc.code);
            const nameNorm = normalizeText(acc.name_fa || acc.name || '');
            const typeNorm = normalizeText(acc.type || '');

            // Partial code match (e.g. "11" or "01" matches "1101")
            const cleanCode = codeNorm.replace(/[^a-z0-9]/gi, '');
            if (rawCleanQuery && cleanCode.includes(rawCleanQuery)) {
                return true;
            }

            // Word token match in code, name or type
            const combined = `${codeNorm} ${nameNorm} ${typeNorm}`;
            return tokens.every(token => combined.includes(token));
        }).slice(0, 60);
    }, [accounts, inputValue]);

    // Scroll active item into view
    useEffect(() => {
        if (isOpen && highlightedIndex >= 0 && listRef.current) {
            const activeElem = listRef.current.children[highlightedIndex] as HTMLElement;
            if (activeElem) {
                activeElem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleSelect = (account: AccountOption) => {
        setIsOpen(false);
        setHighlightedIndex(-1);
        setInputValue(`${account.code} - ${account.name_fa || account.name}`);
        onSelectAccount(account);
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
                setHighlightedIndex(prev => (prev < filteredAccounts.length - 1 ? prev + 1 : 0));
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
                setHighlightedIndex(filteredAccounts.length - 1);
            } else {
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredAccounts.length - 1));
            }
        } else if (e.key === 'Enter') {
            if (isOpen && highlightedIndex >= 0 && filteredAccounts[highlightedIndex]) {
                e.preventDefault();
                handleSelect(filteredAccounts[highlightedIndex]);
            } else if (isOpen) {
                setIsOpen(false);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
            setHighlightedIndex(-1);
            if (selectedAccount) {
                setInputValue(`${selectedAccount.code} - ${selectedAccount.name_fa || selectedAccount.name}`);
            }
        }
    };

    return (
        <div ref={containerRef} className={`relative w-full ${isOpen ? 'z-50' : 'z-10'} ${className}`}>
            <div className="relative flex items-center">
                <input
                    ref={inputRef}
                    type="text"
                    disabled={disabled}
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value);
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
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 pe-12 text-xs font-medium text-slate-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 placeholder:text-slate-400"
                />

                <div className="absolute left-1.5 flex items-center gap-1 text-slate-400">
                    {inputValue && (
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={(e) => {
                                e.stopPropagation();
                                setInputValue('');
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

            {/* Dropdown Options */}
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full min-w-[280px] max-w-[420px] right-0 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in duration-100">
                    <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                        <span>سرفصل‌های حسابداری ({filteredAccounts.length} حساب)</span>
                        <span className="text-[10px] text-slate-400 font-normal">کلید Enter برای انتخاب</span>
                    </div>

                    <ul
                        ref={listRef}
                        className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs py-0.5"
                    >
                        {filteredAccounts.length > 0 ? (
                            filteredAccounts.map((acc, idx) => {
                                const isHighlighted = idx === highlightedIndex;
                                const isSelected = acc.code === value;
                                return (
                                    <li
                                        key={acc.code || idx}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleSelect(acc);
                                        }}
                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                        className={`px-3 py-2 cursor-pointer transition flex items-center justify-between gap-2 ${
                                            isHighlighted
                                                ? 'bg-indigo-50 text-indigo-900 font-semibold'
                                                : isSelected
                                                ? 'bg-slate-50 text-slate-900 font-bold'
                                                : 'text-slate-700 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0 text-[11px]">
                                                {acc.code}
                                            </span>
                                            <span className="truncate font-medium text-slate-800">
                                                {acc.name_fa || acc.name}
                                            </span>
                                        </div>
                                        {acc.type && (
                                            <span className="text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded shrink-0">
                                                {acc.type}
                                            </span>
                                        )}
                                    </li>
                                );
                            })
                        ) : (
                            <li className="px-3 py-4 text-center text-slate-400 text-xs">
                                حسابی با این کد یا عنوان پیدا نشد.
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
};
