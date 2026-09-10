import React, { useState, useEffect } from 'react';
import { PurchaseInvoice, SalesInvoice, Currency } from '../../types';
import { cascadeSettlePurchaseInvoice, cascadeSettleSalesInvoice, getDetailedAccountBalance } from '../../utils/accountingEngine';
import { AccountSearchCombobox } from '../common/AccountSearchCombobox';

interface InvoiceSettlementModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: PurchaseInvoice | SalesInvoice | null;
    invoiceType: 'purchase' | 'sales';
    subsidiaryAccounts: Array<{ id?: string; code: string; name: string; name_fa?: string }>;
    detailedAccounts?: Array<any>;
    onSuccess?: (message: string) => void;
}

export const InvoiceSettlementModal: React.FC<InvoiceSettlementModalProps> = ({
    isOpen,
    onClose,
    invoice,
    invoiceType,
    subsidiaryAccounts,
    onSuccess
}) => {
    if (!isOpen || !invoice) return null;

    const isPurchase = invoiceType === 'purchase';
    const counterpartyName = isPurchase
        ? (invoice as PurchaseInvoice).supplierName
        : (invoice as SalesInvoice).customerName;
    const counterpartyAccountCode = isPurchase
        ? ((invoice as PurchaseInvoice).supplierAccountCode || '310101')
        : ((invoice as SalesInvoice).customerAccountCode || '210101');

    const totalAmount = Number(invoice.totalAmount) || 0;
    const paidAmount = Number(invoice.paidAmount) || 0;
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    const [amount, setAmount] = useState<number>(remainingAmount);
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [selectedAccountCode, setSelectedAccountCode] = useState<string>('0601'); // Default to NBO Bank Dubai
    const [referenceNumber, setReferenceNumber] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [partyBalance, setPartyBalance] = useState<string>('در حال محاسبه...');

    // Cash and Bank Accounts list for settlement selection
    const paymentAccounts = [
        { code: '0601', name: 'NBO BANK DUBAI (بانک دبی)' },
        { code: '0602', name: 'YOUSEF JAFARI (حساب ارزی)' },
        { code: '0603', name: 'MOHAMMAD JAFARI (حساب ارزی)' },
        { code: '0640', name: 'بانک ملی ایران (قرض‌الحسنه)' },
        { code: '1101', name: 'صندوق مرکزی نقد (Cash)' },
        { code: '140B', name: 'تنخواه گردان (Petty Cash)' },
    ];

    useEffect(() => {
        setAmount(remainingAmount);
        getDetailedAccountBalance(counterpartyAccountCode).then(res => {
            setPartyBalance(res.statusText);
        }).catch(() => {
            setPartyBalance('حساب متصل فعال');
        });
    }, [invoice, counterpartyAccountCode, remainingAmount]);

    const selectedAccount = paymentAccounts.find(a => a.code === selectedAccountCode) || paymentAccounts[0];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (amount <= 0) {
            alert('مبلغ تسویه باید بزرگتر از صفر باشد.');
            return;
        }

        setIsSubmitting(true);
        try {
            if (isPurchase) {
                await cascadeSettlePurchaseInvoice({
                    invoiceId: invoice.id,
                    amount,
                    date,
                    paymentAccountId: selectedAccount.code,
                    paymentAccountCode: selectedAccount.code,
                    paymentAccountName: selectedAccount.name,
                    referenceNumber,
                    notes
                });
                onSuccess(`✅ پرداخت مبلغ ${amount.toLocaleString()} ${invoice.currency} بابت فاکتور خرید ${invoice.invoiceNumber} ثبت و سند دوبل صادر شد.`);
            } else {
                await cascadeSettleSalesInvoice({
                    invoiceId: invoice.id,
                    amount,
                    date,
                    receiptAccountId: selectedAccount.code,
                    receiptAccountCode: selectedAccount.code,
                    receiptAccountName: selectedAccount.name,
                    referenceNumber,
                    notes
                });
                onSuccess(`✅ دریافت مبلغ ${amount.toLocaleString()} ${invoice.currency} بابت فاکتور فروش ${invoice.invoiceNumber} ثبت و سند دوبل صادر شد.`);
            }
            onClose();
        } catch (err: any) {
            alert(`خطا در ثبت تسویه: ${err.message || err}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-5 max-h-[95vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-lg ${
                            isPurchase ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                            {isPurchase ? '💳' : '💰'}
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 text-base">
                                {isPurchase ? 'ثبت پرداخت و تسویه فاکتور خرید' : 'ثبت وصول و تسویه فاکتور فروش'}
                            </h3>
                            <p className="text-xs text-slate-500 font-mono">
                                فاکتور شماره: <span className="font-bold text-indigo-600">{invoice.invoiceNumber}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
                    >
                        ✕
                    </button>
                </div>

                {/* Counterparty & Invoice Financial Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
                        <span className="text-[11px] font-bold text-slate-500 block">طرف حساب تفصیلی:</span>
                        <p className="text-xs font-bold text-slate-800 truncate">{counterpartyName}</p>
                        <div className="flex items-center gap-1.5 pt-1">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                                کد {counterpartyAccountCode}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium truncate">{partyBalance}</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
                        <span className="text-[11px] font-bold text-slate-500 block">وضعیت مانده فاکتور:</span>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">مبلغ کل:</span>
                            <span className="font-mono font-bold text-slate-800">{totalAmount.toLocaleString()} {invoice.currency}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">پرداخت قبلی:</span>
                            <span className="font-mono text-emerald-600">{paidAmount.toLocaleString()} {invoice.currency}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200">
                            <span className="font-bold text-amber-700">مانده بدهی:</span>
                            <span className="font-mono font-bold text-amber-700">{remainingAmount.toLocaleString()} {invoice.currency}</span>
                        </div>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                مبلغ تسویه ({invoice.currency}) <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0.01"
                                    step="any"
                                    max={remainingAmount > 0 ? remainingAmount : undefined}
                                    value={amount || ''}
                                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                                    required
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono font-bold focus:ring-2 focus:ring-indigo-500"
                                />
                                {remainingAmount > 0 && amount !== remainingAmount && (
                                    <button
                                        type="button"
                                        onClick={() => setAmount(remainingAmount)}
                                        className="absolute left-2 top-2 px-2 py-0.5 rounded text-[10px] bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold transition"
                                    >
                                        کل مانده
                                    </button>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                تاریخ عملیات <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                required
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                            {isPurchase ? 'حساب پرداخت‌کننده (بانک یا صندوق)' : 'حساب دریافت‌کننده (بانک یا صندوق)'} <span className="text-rose-500">*</span>
                        </label>
                        <AccountSearchCombobox
                            accounts={paymentAccounts}
                            value={selectedAccountCode}
                            onSelectAccount={(acc) => setSelectedAccountCode(acc.code)}
                            placeholder="جستجو یا انتخاب حساب بانکی / صندوق..."
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">شماره سند / پیگیری / فیش</label>
                            <input
                                type="text"
                                value={referenceNumber}
                                placeholder="مثال: TRX-99214 یا شماره چک"
                                onChange={(e) => setReferenceNumber(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">توضیحات و بابت</label>
                            <input
                                type="text"
                                value={notes}
                                placeholder="مثال: تسویه کامل فاکتور"
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800"
                            />
                        </div>
                    </div>

                    {/* Double Entry Preview Box */}
                    <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                            <span>⚡</span>
                            <span>پیش‌نمایش سند حسابداری دوبل خودکار:</span>
                        </div>
                        <div className="text-[11px] space-y-1 font-mono text-slate-700">
                            {isPurchase ? (
                                <>
                                    <div className="flex justify-between items-center bg-white/80 p-2 rounded-lg border border-indigo-100">
                                        <span><b className="text-emerald-700">بدهکار:</b> کد {counterpartyAccountCode} (تامین‌کننده: {counterpartyName})</span>
                                        <span className="font-bold text-emerald-700">{amount.toLocaleString()} {invoice.currency}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white/80 p-2 rounded-lg border border-indigo-100">
                                        <span><b className="text-rose-700">بستانکار:</b> کد {selectedAccount.code} ({selectedAccount.name})</span>
                                        <span className="font-bold text-rose-700">{amount.toLocaleString()} {invoice.currency}</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex justify-between items-center bg-white/80 p-2 rounded-lg border border-indigo-100">
                                        <span><b className="text-emerald-700">بدهکار:</b> کد {selectedAccount.code} ({selectedAccount.name})</span>
                                        <span className="font-bold text-emerald-700">{amount.toLocaleString()} {invoice.currency}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white/80 p-2 rounded-lg border border-indigo-100">
                                        <span><b className="text-rose-700">بستانکار:</b> کد {counterpartyAccountCode} (مشتری: {counterpartyName})</span>
                                        <span className="font-bold text-rose-700">{amount.toLocaleString()} {invoice.currency}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
                        >
                            انصراف
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || amount <= 0}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-200 transition flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <span>در حال ثبت سند...</span>
                            ) : (
                                <>
                                    <span>ثبت تسویه و صدور سند دوبل</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
