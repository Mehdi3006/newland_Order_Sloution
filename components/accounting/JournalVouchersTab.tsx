import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { JournalVoucher, Currency } from '../../types';
import { db } from '../../db';
import { AccountSearchCombobox } from '../common/AccountSearchCombobox';

interface JournalVouchersTabProps {
    journalVouchers: JournalVoucher[];
    subsidiaryAccounts: Array<{ id?: string; code: string; name: string; name_fa?: string }>;
    onAddVoucherSuccess?: () => void;
}

export const JournalVouchersTab: React.FC<JournalVouchersTabProps> = ({
    journalVouchers,
    subsidiaryAccounts
}) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedVoucher, setSelectedVoucher] = useState<JournalVoucher | null>(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);

    // Search and filter
    const [searchTerm, setSearchTerm] = useState('');
    const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'purchase_invoice' | 'sales_invoice' | 'fx_revaluation'>('all');

    // New Voucher State
    const [newDate, setNewDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [newDesc, setNewDesc] = useState<string>('');
    const [rows, setRows] = useState<Array<{
        id: string;
        accountCode: string;
        accountName: string;
        debit: number;
        credit: number;
        description: string;
        currency: Currency;
    }>>([
        { id: '1', accountCode: '1001', accountName: 'موجودی نقد و بانک', debit: 0, credit: 0, description: '', currency: 'AED' },
        { id: '2', accountCode: '4001', accountName: 'درآمد حاصل از فروش کالا', debit: 0, credit: 0, description: '', currency: 'AED' }
    ]);

    const handleAddRow = () => {
        setRows(prev => [
            ...prev,
            { id: Date.now().toString(), accountCode: '1001', accountName: 'موجودی نقد و بانک', debit: 0, credit: 0, description: '', currency: 'AED' }
        ]);
    };

    const handleRemoveRow = (index: number) => {
        if (rows.length <= 2) return;
        setRows(prev => prev.filter((_, i) => i !== index));
    };

    const handleRowChange = (index: number, field: string, value: any) => {
        setRows(prev => {
            const updated = [...prev];
            if (field === 'accountCode') {
                const acc = subsidiaryAccounts.find(a => a.code === value);
                updated[index] = {
                    ...updated[index],
                    accountCode: value,
                    accountName: acc ? (acc.name_fa || acc.name) : value
                };
            } else {
                updated[index] = { ...updated[index], [field]: value };
            }
            return updated;
        });
    };

    const totalDebit = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
    const totalCredit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

    const handleSaveVoucher = async () => {
        if (!isBalanced) {
            alert('سند حسابداری نامتوازن است! جمع بدهکار و بستانکار باید کاملاً برابر باشند.');
            return;
        }
        if (!newDesc.trim()) {
            alert('لطفاً شرح کلی سند را وارد کنید.');
            return;
        }

        const nextNumber = (journalVouchers.length > 0
            ? Math.max(...journalVouchers.map(v => Number(v.voucherNumber) || 0)) + 1
            : 1001);

        const newVoucher: JournalVoucher = {
            id: `v-${Date.now()}`,
            voucherNumber: nextNumber,
            date: newDate,
            description: newDesc,
            sourceType: 'manual',
            status: 'posted',
            totalDebit,
            totalCredit,
            items: rows.map((r, idx) => ({
                id: `item-${Date.now()}-${idx}`,
                accountId: r.accountCode,
                accountCode: r.accountCode,
                accountName: r.accountName,
                debit: Number(r.debit) || 0,
                credit: Number(r.credit) || 0,
                currency: r.currency,
                currencyRate: 1,
                foreignAmount: (Number(r.debit) || Number(r.credit) || 0),
                description: r.description || newDesc
            })),
            createdAt: new Date().toISOString()
        };

        await db.journalVouchers.add(newVoucher);
        setIsCreateModalOpen(false);
        setNewDesc('');
        setRows([
            { id: '1', accountCode: '1001', accountName: 'موجودی نقد و بانک', debit: 0, credit: 0, description: '', currency: 'AED' },
            { id: '2', accountCode: '4001', accountName: 'درآمد حاصل از فروش کالا', debit: 0, credit: 0, description: '', currency: 'AED' }
        ]);
    };

    // Filtered Vouchers
    const filteredVouchers = useMemo(() => {
        return journalVouchers.filter(v => {
            if (sourceFilter !== 'all' && v.sourceType !== sourceFilter) return false;
            if (searchTerm) {
                const q = searchTerm.toLowerCase();
                const matchNum = (v.voucherNumber || '').toString().includes(q);
                const matchDesc = (v.description || '').toLowerCase().includes(q);
                const matchItem = (v.items || []).some(it => 
                    (it.accountName || '').toLowerCase().includes(q) || 
                    (it.accountCode || '').includes(q) ||
                    (it.description || '').toLowerCase().includes(q)
                );
                if (!matchNum && !matchDesc && !matchItem) return false;
            }
            return true;
        });
    }, [journalVouchers, sourceFilter, searchTerm]);

    // Export All Journal Vouchers to Excel
    const handleExportAllVouchersExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Newland Order Solution';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Journal_Ledger', {
            views: [{ rightToLeft: true }]
        });

        // Title
        sheet.mergeCells('A1:G1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'دفتر روزنامه اسناد حسابداری دوبل - بازرگانی نیولند (NEWLAND TRADING GROUP)';
        titleCell.font = { name: 'Tahoma', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 32;

        const headers = ['شماره سند', 'تاریخ', 'کد حساب', 'نام حساب', 'شرح آرتیکل / رویداد', 'بدهکار (درهم)', 'بستانکار (درهم)'];
        const headerRow = sheet.addRow(headers);
        headerRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 24;

        let totalDebitSum = 0;
        let totalCreditSum = 0;

        filteredVouchers.forEach(v => {
            (v.items || []).forEach((it, idx) => {
                const isFirst = idx === 0;
                const r = sheet.addRow([
                    isFirst ? `#${v.voucherNumber}` : '',
                    isFirst ? v.date : '',
                    it.accountCode || it.accountId,
                    it.accountName,
                    it.description || v.description,
                    it.debit || '',
                    it.credit || ''
                ]);
                r.font = { name: 'Tahoma', size: 9 };
                r.alignment = { horizontal: 'center', vertical: 'middle' };
                r.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
                r.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };

                totalDebitSum += (it.debit || 0);
                totalCreditSum += (it.credit || 0);
            });
        });

        // Total
        const totRow = sheet.addRow(['جمع کل گردش دفتر روزنامه', '', '', '', '', totalDebitSum, totalCreditSum]);
        totRow.font = { name: 'Tahoma', size: 10, bold: true };
        totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        totRow.alignment = { horizontal: 'center', vertical: 'middle' };

        sheet.columns = [
            { width: 14 },
            { width: 14 },
            { width: 16 },
            { width: 28 },
            { width: 42 },
            { width: 20 },
            { width: 20 }
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewLand_Journal_Vouchers_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Export Single Voucher to Excel
    const handleExportSingleVoucherExcel = async (v: JournalVoucher) => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`Voucher_${v.voucherNumber}`, {
            views: [{ rightToLeft: true }]
        });

        sheet.mergeCells('A1:E1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = `سند حسابداری شماره #${v.voucherNumber} - شرکت بازرگانی نیولند`;
        titleCell.font = { name: 'Tahoma', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 32;

        sheet.addRow(['تاریخ سند:', v.date, '', 'منبع سند:', v.sourceType || 'دستی']);
        sheet.addRow(['شرح کلی سند:', v.description, '', 'وضعیت توازن:', Math.abs(v.totalDebit - v.totalCredit) < 0.01 ? 'متوازن' : 'نامتوازن']);
        sheet.getRow(2).font = { name: 'Tahoma', size: 9, bold: true };
        sheet.getRow(3).font = { name: 'Tahoma', size: 9, bold: true };
        sheet.addRow([]);

        const headers = ['ردیف', 'کد حساب', 'نام سرفصل حساب', 'شرح آرتیکل', 'بدهکار (درهم)', 'بستانکار (درهم)'];
        const headerRow = sheet.addRow(headers);
        headerRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 24;

        (v.items || []).forEach((it, idx) => {
            const r = sheet.addRow([
                idx + 1,
                it.accountCode || it.accountId,
                it.accountName,
                it.description || v.description,
                it.debit || '',
                it.credit || ''
            ]);
            r.font = { name: 'Tahoma', size: 9 };
            r.alignment = { horizontal: 'center', vertical: 'middle' };
            r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
            r.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
        });

        const totRow = sheet.addRow(['جمع کل سند', '', '', '', v.totalDebit, v.totalCredit]);
        totRow.font = { name: 'Tahoma', size: 10, bold: true };
        totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        totRow.alignment = { horizontal: 'center', vertical: 'middle' };

        sheet.columns = [
            { width: 8 },
            { width: 16 },
            { width: 28 },
            { width: 40 },
            { width: 20 },
            { width: 20 }
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewLand_Voucher_${v.voucherNumber}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-5">
            {/* Header Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                        دفتر اسناد حسابداری دوبل (Journal Vouchers Ledger)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">ثبت اسناد مرکب، ویرایش آرتیکل‌ها، چاپ رسمی A4 و صدور خروجی اکسل کامل دفتر روزنامه</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={handleExportAllVouchersExcel}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5"
                    >
                        📊 خروجی اکسل دفتر روزنامه
                    </button>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5"
                    >
                        <span>+ ثبت سند حسابداری جدید</span>
                    </button>
                </div>
            </div>

            {/* Filters bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                    <input
                        type="text"
                        placeholder="🔍 جستجو بر اساس شماره سند، شرح، کد یا نام حساب..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">منبع سند:</span>
                    <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value as any)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-semibold"
                    >
                        <option value="all">همه منابع ({journalVouchers.length})</option>
                        <option value="manual">اسناد دستی</option>
                        <option value="purchase_invoice">فاکتورهای خرید</option>
                        <option value="sales_invoice">فاکتورهای فروش</option>
                        <option value="fx_revaluation">تسعیر ارز</option>
                    </select>
                </div>
            </div>

            {/* Vouchers Table */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm">
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full text-right text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                                <th className="p-3">شماره سند</th>
                                <th className="p-3">تاریخ</th>
                                <th className="p-3">شرح کلی رویداد مالی</th>
                                <th className="p-3 text-center">نوع منبع</th>
                                <th className="p-3 text-center font-bold">جمع بدهکار (AED)</th>
                                <th className="p-3 text-center font-bold">جمع بستانکار (AED)</th>
                                <th className="p-3 text-center font-bold">وضعیت توازن</th>
                                <th className="p-3 text-center font-bold">عملیات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredVouchers.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-slate-400 font-medium">
                                        هیچ سند حسابداری مطابق با فیلترها یافت نشد.
                                    </td>
                                </tr>
                            ) : (
                                filteredVouchers.map(v => (
                                    <tr key={v.id || v.voucherNumber} className="hover:bg-slate-50/80 transition">
                                        <td className="p-3 font-mono font-bold text-indigo-600">#{v.voucherNumber}</td>
                                        <td className="p-3 font-mono text-slate-600">{v.date}</td>
                                        <td className="p-3 font-semibold text-slate-800 max-w-sm truncate">{v.description}</td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                v.sourceType === 'purchase_invoice' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                v.sourceType === 'sales_invoice' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                v.sourceType === 'fx_revaluation' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                'bg-slate-100 text-slate-700 border-slate-200'
                                            }`}>
                                                {v.sourceType === 'purchase_invoice' ? 'فاکتور خرید' : v.sourceType === 'sales_invoice' ? 'فاکتور فروش' : v.sourceType === 'fx_revaluation' ? 'تسعیر ارز' : 'سند دستی'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center font-mono text-emerald-600 font-bold">{v.totalDebit.toLocaleString()}</td>
                                        <td className="p-3 text-center font-mono text-rose-600 font-bold">{v.totalCredit.toLocaleString()}</td>
                                        <td className="p-3 text-center">
                                            {Math.abs(v.totalDebit - v.totalCredit) < 0.01 ? (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">متوازن ✓</span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-50 text-red-700 border border-red-200 font-bold">نامتوازن</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            <button
                                                onClick={() => { setSelectedVoucher(v); setIsViewModalOpen(true); }}
                                                className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs rounded-xl font-bold transition border border-indigo-200 flex items-center gap-1 mx-auto"
                                            >
                                                <span>📄 آرتیکل‌ها و چاپ</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Voucher Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                                <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                                ثبت سند حسابداری دستی جدید (Double-Entry Journal Voucher)
                            </h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold">✕</button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">تاریخ سند</label>
                                <input
                                    type="date"
                                    value={newDate}
                                    onChange={(e) => setNewDate(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs text-slate-800 font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">شرح کلی سند</label>
                                <input
                                    type="text"
                                    value={newDesc}
                                    placeholder="مثال: تسویه حساب بانکی بابت حواله ارزی"
                                    onChange={(e) => setNewDesc(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs text-slate-800"
                                />
                            </div>
                        </div>

                        {/* Rows Table */}
                        <div className="overflow-x-auto rounded-xl border border-slate-200 min-h-[280px] pb-24">
                            <table className="w-full text-right text-xs">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-semibold">
                                        <th className="p-2.5">حساب معین</th>
                                        <th className="p-2.5">شرح آرتیکل</th>
                                        <th className="p-2.5 text-center">ارز</th>
                                        <th className="p-2.5 text-center">بدهکار (درهم)</th>
                                        <th className="p-2.5 text-center">بستانکار (درهم)</th>
                                        <th className="p-2.5 text-center">حذف</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {rows.map((r, idx) => (
                                        <tr key={r.id} className="hover:bg-slate-50">
                                            <td className="p-2 min-w-[200px]">
                                                <AccountSearchCombobox
                                                    accounts={subsidiaryAccounts}
                                                    value={r.accountCode}
                                                    onSelectAccount={(acc) => {
                                                        handleRowChange(idx, 'accountCode', acc.code);
                                                        handleRowChange(idx, 'accountName', acc.name_fa || acc.name);
                                                    }}
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={r.description}
                                                    placeholder="شرح ردیف..."
                                                    onChange={(e) => handleRowChange(idx, 'description', e.target.value)}
                                                    className="w-full bg-white border border-slate-300 rounded-xl p-1.5 text-xs text-slate-800"
                                                />
                                            </td>
                                            <td className="p-2 text-center">
                                                <select
                                                    value={r.currency}
                                                    onChange={(e) => handleRowChange(idx, 'currency', e.target.value as Currency)}
                                                    className="bg-white border border-slate-300 rounded-xl p-1.5 text-xs text-slate-800 font-bold"
                                                >
                                                    <option value="AED">AED</option>
                                                    <option value="USD">USD</option>
                                                    <option value="CNY">CNY</option>
                                                    <option value="TOMAN">TOMAN</option>
                                                </select>
                                            </td>
                                            <td className="p-2 text-center">
                                                <input
                                                    type="number"
                                                    value={r.debit || ''}
                                                    placeholder="0"
                                                    onChange={(e) => handleRowChange(idx, 'debit', parseFloat(e.target.value) || 0)}
                                                    className="w-28 bg-white border border-slate-300 rounded-xl p-1.5 text-xs text-emerald-600 font-mono font-bold text-center"
                                                />
                                            </td>
                                            <td className="p-2 text-center">
                                                <input
                                                    type="number"
                                                    value={r.credit || ''}
                                                    placeholder="0"
                                                    onChange={(e) => handleRowChange(idx, 'credit', parseFloat(e.target.value) || 0)}
                                                    className="w-28 bg-white border border-slate-300 rounded-xl p-1.5 text-xs text-rose-600 font-mono font-bold text-center"
                                                />
                                            </td>
                                            <td className="p-2 text-center">
                                                <button
                                                    onClick={() => handleRemoveRow(idx)}
                                                    disabled={rows.length <= 2}
                                                    className="text-slate-400 hover:text-red-600 disabled:opacity-30 p-1 font-bold text-sm"
                                                >
                                                    ✕
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-100 font-bold text-xs border-t-2 border-slate-300">
                                        <td colSpan={3} className="p-2.5">
                                            <button
                                                onClick={handleAddRow}
                                                className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition text-xs font-bold"
                                            >
                                                + افزودن ردیف آرتیکل
                                            </button>
                                        </td>
                                        <td className="p-2.5 text-center text-emerald-700 font-mono font-black">{totalDebit.toLocaleString()}</td>
                                        <td className="p-2.5 text-center text-rose-700 font-mono font-black">{totalCredit.toLocaleString()}</td>
                                        <td className="p-2.5 text-center">
                                            {isBalanced ? (
                                                <span className="text-emerald-700 font-bold">✓ تراز</span>
                                            ) : (
                                                <span className="text-rose-700 font-bold">اختلاف: {Math.abs(totalDebit - totalCredit).toLocaleString()}</span>
                                            )}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleSaveVoucher}
                                disabled={!isBalanced}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-sm transition"
                            >
                                ثبت قطعی سند حسابداری
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View / Print Single Voucher Modal */}
            {isViewModalOpen && selectedVoucher && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full p-4 sm:p-6 space-y-4 print-container my-auto">
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 print:hidden">
                            <div>
                                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                                    سند حسابداری دو ستونی (Journal Voucher #{selectedVoucher.voucherNumber})
                                </h3>
                                <p className="text-xs text-slate-500 font-mono mt-0.5">تاریخ: {selectedVoucher.date} | نوع منبع: {selectedVoucher.sourceType || 'دستی'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleExportSingleVoucherExcel(selectedVoucher)}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
                                >
                                    📊 دانلود اکسل
                                </button>
                                <button
                                    onClick={() => window.print()}
                                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
                                >
                                    🖨️ چاپ A4
                                </button>
                                <button onClick={() => setIsViewModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold">✕</button>
                            </div>
                        </div>

                        {/* Printable Voucher Sheet */}
                        <div className="border border-slate-300 rounded-2xl p-5 sm:p-6 bg-white text-slate-800 space-y-4">
                            {/* Document Header */}
                            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                                <div>
                                    <h1 className="text-lg sm:text-xl font-black text-slate-900">
                                        شرکت بازرگانی بین‌المللی نیولند (NEWLAND)
                                    </h1>
                                    <p className="text-xs text-slate-600 font-bold mt-0.5">
                                        سند رسمی حسابداری دوبل (General Journal Voucher)
                                    </p>
                                    <p className="text-xs text-slate-700 mt-2 font-medium">
                                        <span className="font-bold">شرح کلی رویداد: </span>
                                        {selectedVoucher.description}
                                    </p>
                                </div>
                                <div className="text-left font-mono text-xs space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200 min-w-[170px]">
                                    <p><span className="text-slate-500 font-sans">شماره سند:</span> <span className="font-bold text-indigo-700">#{selectedVoucher.voucherNumber}</span></p>
                                    <p><span className="text-slate-500 font-sans">تاریخ ثبت:</span> {selectedVoucher.date}</p>
                                    <p><span className="text-slate-500 font-sans">منبع سند:</span> {selectedVoucher.sourceType || 'دستی'}</p>
                                    <p><span className="text-slate-500 font-sans">وضعیت:</span> <span className="font-bold text-emerald-700">ثبت قطعی (Posted)</span></p>
                                </div>
                            </div>

                            {/* Double Entry Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-right text-xs border border-slate-300">
                                    <thead>
                                        <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                                            <th className="p-2.5 border-l border-slate-300 text-center w-10">#</th>
                                            <th className="p-2.5 border-l border-slate-300 w-24">کد حساب</th>
                                            <th className="p-2.5 border-l border-slate-300 w-48">سرفصل حساب معین / تفصیلی</th>
                                            <th className="p-2.5 border-l border-slate-300">شرح آرتیکل</th>
                                            <th className="p-2.5 border-l border-slate-300 text-center w-28">بدهکار (درهم)</th>
                                            <th className="p-2.5 text-center w-28">بستانکار (درهم)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {selectedVoucher.items?.map((it, idx) => (
                                            <tr key={it.id || idx} className="hover:bg-slate-50">
                                                <td className="p-2.5 border-l border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                                                <td className="p-2.5 border-l border-slate-200 font-mono font-bold text-indigo-700">{it.accountCode || it.accountId}</td>
                                                <td className="p-2.5 border-l border-slate-200 font-semibold text-slate-800">{it.accountName}</td>
                                                <td className="p-2.5 border-l border-slate-200 text-slate-600">{it.description || selectedVoucher.description}</td>
                                                <td className="p-2.5 border-l border-slate-200 text-center font-mono text-emerald-700 font-bold">
                                                    {it.debit ? it.debit.toLocaleString() : '-'}
                                                </td>
                                                <td className="p-2.5 text-center font-mono text-rose-700 font-bold">
                                                    {it.credit ? it.credit.toLocaleString() : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                                            <td colSpan={4} className="p-2.5 border-l border-slate-300 text-slate-900 font-bold">جمع کل تراز سند دوبل:</td>
                                            <td className="p-2.5 border-l border-slate-300 text-center font-mono text-emerald-800 font-black">
                                                {selectedVoucher.totalDebit.toLocaleString()}
                                            </td>
                                            <td className="p-2.5 text-center font-mono text-rose-800 font-black">
                                                {selectedVoucher.totalCredit.toLocaleString()}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Official 4-Signatures Quadrant */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 text-xs print-signature-block">
                                <div className="border border-slate-300 rounded-xl p-2.5 text-center space-y-5 bg-slate-50/50">
                                    <span className="font-bold text-slate-700 block">تنظیم‌کننده سند</span>
                                    <div className="h-8 border-b border-dashed border-slate-300" />
                                    <span className="text-[10px] text-slate-400">امضا و تاریخ</span>
                                </div>
                                <div className="border border-slate-300 rounded-xl p-2.5 text-center space-y-5 bg-slate-50/50">
                                    <span className="font-bold text-slate-700 block">رسیدگی / حسابدار ارشد</span>
                                    <div className="h-8 border-b border-dashed border-slate-300" />
                                    <span className="text-[10px] text-slate-400">امضا و تاریخ</span>
                                </div>
                                <div className="border border-slate-300 rounded-xl p-2.5 text-center space-y-5 bg-slate-50/50">
                                    <span className="font-bold text-slate-700 block">مدیر امور مالی</span>
                                    <div className="h-8 border-b border-dashed border-slate-300" />
                                    <span className="text-[10px] text-slate-400">مهر و امضا</span>
                                </div>
                                <div className="border border-slate-300 rounded-xl p-2.5 text-center space-y-5 bg-slate-50/50">
                                    <span className="font-bold text-slate-700 block">مدیر عامل / تصویب‌کننده</span>
                                    <div className="h-8 border-b border-dashed border-slate-300" />
                                    <span className="text-[10px] text-slate-400">مهر و امضا</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-2 print:hidden">
                            <button
                                onClick={() => setIsViewModalOpen(false)}
                                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                            >
                                بستن
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
