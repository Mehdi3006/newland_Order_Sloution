import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import { GeneralLedgerAccount, SubsidiaryLedgerAccount, DetailedLedgerAccount, JournalVoucher } from '../../types';

interface ChartOfAccountsTabProps {
    generalAccounts: GeneralLedgerAccount[];
    subsidiaryAccounts: SubsidiaryLedgerAccount[];
    detailedAccounts: DetailedLedgerAccount[];
    journalVouchers: JournalVoucher[];
}

export const ChartOfAccountsTab: React.FC<ChartOfAccountsTabProps> = ({
    generalAccounts,
    subsidiaryAccounts,
    detailedAccounts,
    journalVouchers
}) => {
    const [selectedLevel, setSelectedLevel] = useState<'all' | 'general' | 'subsidiary' | 'detailed'>('all');
    const [selectedAccountLedger, setSelectedAccountLedger] = useState<{ code: string; name: string } | null>(null);

    // Ledger transactions for selected account
    const ledgerItems = selectedAccountLedger ? journalVouchers.flatMap(v => 
        (v.items || []).filter(it => (it.accountCode === selectedAccountLedger.code || it.accountId === selectedAccountLedger.code))
        .map(it => ({
            voucherNumber: v.voucherNumber,
            date: v.date,
            description: it.description || v.description,
            debit: it.debit || 0,
            credit: it.credit || 0,
            currency: it.currency || 'AED',
            foreignAmount: it.foreignAmount || 0
        }))
    ) : [];

    const totalDebit = ledgerItems.reduce((s, i) => s + i.debit, 0);
    const totalCredit = ledgerItems.reduce((s, i) => s + i.credit, 0);
    const endingBalance = totalDebit - totalCredit;

    // Export Full Chart of Accounts to Excel
    const handleExportCOAExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Newland Trading Group';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Chart_Of_Accounts', {
            views: [{ rightToLeft: true }]
        });

        sheet.mergeCells('A1:E1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'درخت کدینگ استاندارد حساب‌ها - شرکت بازرگانی بین‌المللی نیولند';
        titleCell.font = { name: 'Tahoma', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 32;

        const headers = ['سطح حساب', 'کد حساب', 'نام سرفصل حساب (فارسی)', 'نام انگلیسی', 'ماهیت / حساب والد'];
        const headerRow = sheet.addRow(headers);
        headerRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 24;

        // General Accounts
        generalAccounts.forEach(g => {
            const r = sheet.addRow(['حساب کل', g.code, g.name_fa || g.name, g.name, g.nature === 'debit' ? 'بدهکار' : 'بستانکار']);
            r.font = { name: 'Tahoma', size: 9, bold: true };
            r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            r.alignment = { horizontal: 'center', vertical: 'middle' };
            r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
            r.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
        });

        // Subsidiary Accounts
        subsidiaryAccounts.forEach(s => {
            const r = sheet.addRow(['حساب معین', s.code, s.name_fa || s.name, s.name, `کل: ${s.parentGeneralCode}`]);
            r.font = { name: 'Tahoma', size: 9 };
            r.alignment = { horizontal: 'center', vertical: 'middle' };
            r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
            r.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
        });

        // Detailed Accounts
        detailedAccounts.forEach(d => {
            const r = sheet.addRow(['حساب تفصیلی', d.code, d.name_fa || d.name, d.name, `معین: ${d.parentSubsidiaryCode}`]);
            r.font = { name: 'Tahoma', size: 8.5 };
            r.alignment = { horizontal: 'center', vertical: 'middle' };
            r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
            r.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
        });

        sheet.columns = [
            { width: 14 },
            { width: 14 },
            { width: 38 },
            { width: 34 },
            { width: 22 }
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewLand_Chart_Of_Accounts_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Export Selected Account Ledger to Excel
    const handleExportAccountLedgerExcel = async () => {
        if (!selectedAccountLedger) return;
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`Ledger_${selectedAccountLedger.code}`, {
            views: [{ rightToLeft: true }]
        });

        sheet.mergeCells('A1:F1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = `دفتر حساب ${selectedAccountLedger.code} - ${selectedAccountLedger.name}`;
        titleCell.font = { name: 'Tahoma', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 32;

        const headers = ['شماره سند', 'تاریخ', 'شرح رویداد مالی', 'بدهکار (درهم)', 'بستانکار (درهم)', 'ارز ثانویه'];
        const headerRow = sheet.addRow(headers);
        headerRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 24;

        ledgerItems.forEach(it => {
            const r = sheet.addRow([
                `#${it.voucherNumber}`,
                it.date,
                it.description,
                it.debit || '',
                it.credit || '',
                it.currency !== 'AED' ? `${it.foreignAmount} ${it.currency}` : '-'
            ]);
            r.font = { name: 'Tahoma', size: 9 };
            r.alignment = { horizontal: 'center', vertical: 'middle' };
            r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
        });

        const totRow = sheet.addRow(['جمع کل گردش و مانده نهایی', '', `مانده: ${Math.abs(endingBalance).toLocaleString()} (${endingBalance >= 0 ? 'بدهکار' : 'بستانکار'})`, totalDebit, totalCredit, '']);
        totRow.font = { name: 'Tahoma', size: 10, bold: true };
        totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        totRow.alignment = { horizontal: 'center', vertical: 'middle' };

        sheet.columns = [
            { width: 14 },
            { width: 14 },
            { width: 44 },
            { width: 20 },
            { width: 20 },
            { width: 18 }
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewLand_Account_Ledger_${selectedAccountLedger.code}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                        درخت و ساختار کدینگ استاندارد حساب‌ها (Chart of Accounts)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">مشاهده حساب‌های کل، معین و تفصیلی همراه با گردش و دفتر تفکیکی هر حساب</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={handleExportCOAExcel}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5"
                    >
                        <span>📊 خروجی اکسل کدینگ</span>
                    </button>
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                        <button
                            onClick={() => setSelectedLevel('all')}
                            className={`px-3 py-1 rounded-lg transition ${selectedLevel === 'all' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}
                        >
                            همه سطوح
                        </button>
                        <button
                            onClick={() => setSelectedLevel('general')}
                            className={`px-3 py-1 rounded-lg transition ${selectedLevel === 'general' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}
                        >
                            کل
                        </button>
                        <button
                            onClick={() => setSelectedLevel('subsidiary')}
                            className={`px-3 py-1 rounded-lg transition ${selectedLevel === 'subsidiary' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}
                        >
                            معین
                        </button>
                        <button
                            onClick={() => setSelectedLevel('detailed')}
                            className={`px-3 py-1 rounded-lg transition ${selectedLevel === 'detailed' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}
                        >
                            تفصیلی
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Accounts List */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100 text-xs text-slate-500 font-medium">
                        <span>سرفصل‌های حسابداری (کدینگ سه‌سطحی)</span>
                        <span>تعداد حساب‌ها: {generalAccounts.length + subsidiaryAccounts.length + detailedAccounts.length}</span>
                    </div>

                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                        {generalAccounts.map(gen => {
                            const subs = subsidiaryAccounts.filter(s => s.parentGeneralCode === gen.code);
                            if (selectedLevel === 'subsidiary' && subs.length === 0) return null;
                            if (selectedLevel === 'detailed') return null;

                            return (
                                <div key={gen.code} className="border border-slate-200 rounded-2xl p-3.5 bg-slate-50/50 space-y-2.5">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg text-xs border border-indigo-200">
                                                {gen.code}
                                            </span>
                                            <span className="font-bold text-slate-800 text-xs">
                                                {gen.name_fa || gen.name}
                                            </span>
                                            <span className="text-[11px] text-slate-400 font-sans">
                                                ({gen.name})
                                            </span>
                                        </div>
                                        <span className="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md font-bold">
                                            سطح کل ({gen.nature === 'debit' ? 'بدهکار' : 'بستانکار'})
                                        </span>
                                    </div>

                                    {/* Subsidiary items */}
                                    <div className="space-y-1.5 mr-4 border-r-2 border-indigo-200 pr-3">
                                        {subs.map(sub => {
                                            const details = detailedAccounts.filter(d => d.parentSubsidiaryCode === sub.code);
                                            const isSelected = selectedAccountLedger?.code === sub.code;

                                            return (
                                                <div key={sub.code} className="space-y-1">
                                                    <div 
                                                        onClick={() => setSelectedAccountLedger({ code: sub.code, name: sub.name_fa || sub.name })}
                                                        className={`flex justify-between items-center p-2 rounded-xl border text-xs cursor-pointer transition ${
                                                            isSelected ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono font-bold text-slate-600 text-[11px]">{sub.code}</span>
                                                            <span className="font-semibold">{sub.name_fa || sub.name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {details.length > 0 && (
                                                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                                                    {details.length} تفصیلی
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] text-indigo-600 font-bold">مشاهده گردش ←</span>
                                                        </div>
                                                    </div>

                                                    {/* Detailed Accounts list */}
                                                    {details.length > 0 && selectedLevel !== 'general' && (
                                                        <div className="mr-4 space-y-1 border-r border-slate-200 pr-2 pt-1">
                                                            {details.map(det => (
                                                                <div
                                                                    key={det.code}
                                                                    onClick={() => setSelectedAccountLedger({ code: det.code, name: det.name_fa || det.name })}
                                                                    className={`flex justify-between items-center p-1.5 rounded-lg text-[11px] cursor-pointer transition border ${
                                                                        selectedAccountLedger?.code === det.code ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50/70 border-slate-100 hover:bg-slate-100 text-slate-600'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-mono text-slate-500 font-bold">{det.code}</span>
                                                                        <span>{det.name_fa || det.name}</span>
                                                                    </div>
                                                                    <span className="text-[10px] text-slate-400">تفصیلی</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Account Ledger View */}
                <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
                    <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                <span className="w-2 h-2 bg-indigo-600 rounded-full" />
                                {selectedAccountLedger ? `دفتر حساب: ${selectedAccountLedger.name}` : 'گردش دفتر حساب'}
                            </h3>
                            {selectedAccountLedger && (
                                <p className="text-xs text-indigo-600 font-mono mt-0.5">کد حساب: {selectedAccountLedger.code}</p>
                            )}
                        </div>
                        {selectedAccountLedger && ledgerItems.length > 0 && (
                            <button
                                onClick={handleExportAccountLedgerExcel}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shadow-xs"
                            >
                                📊 اکسل
                            </button>
                        )}
                    </div>

                    {!selectedAccountLedger ? (
                        <div className="p-8 text-center text-xs text-slate-400">
                            برای مشاهده دفتر گردش و آرتیکل‌ها، روی یکی از حساب‌های معین یا تفصیلی در لیست کلیک کنید.
                        </div>
                    ) : ledgerItems.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400">
                            هنوز هیچ گردش مالی برای این حساب ثبت نشده است.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100 text-emerald-800">
                                    <span className="text-[10px] block font-bold">گردش بدهکار:</span>
                                    <span className="font-mono font-bold">{totalDebit.toLocaleString()} AED</span>
                                </div>
                                <div className="bg-rose-50 p-2 rounded-xl border border-rose-100 text-rose-800">
                                    <span className="text-[10px] block font-bold">گردش بستانکار:</span>
                                    <span className="font-mono font-bold">{totalCredit.toLocaleString()} AED</span>
                                </div>
                            </div>

                            <div className="overflow-y-auto max-h-[380px] border border-slate-200 rounded-xl">
                                <table className="w-full text-right text-[11px]">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold sticky top-0">
                                        <tr>
                                            <th className="p-2">سند</th>
                                            <th className="p-2">تاریخ</th>
                                            <th className="p-2 text-left">بدهکار</th>
                                            <th className="p-2 text-left">بستانکار</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {ledgerItems.map((it, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-2 font-mono text-indigo-600 font-bold">#{it.voucherNumber}</td>
                                                <td className="p-2 font-mono text-slate-500">{it.date}</td>
                                                <td className="p-2 text-left font-mono text-emerald-600 font-semibold">{it.debit ? it.debit.toLocaleString() : '-'}</td>
                                                <td className="p-2 text-left font-mono text-rose-600 font-semibold">{it.credit ? it.credit.toLocaleString() : '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs flex justify-between items-center font-bold">
                                <span>مانده نهایی حساب:</span>
                                <span className={`font-mono ${endingBalance > 0 ? 'text-emerald-700' : endingBalance < 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                                    {Math.abs(endingBalance).toLocaleString()} AED ({endingBalance > 0 ? 'بدهکار' : endingBalance < 0 ? 'بستانکار' : 'تسویه'})
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
