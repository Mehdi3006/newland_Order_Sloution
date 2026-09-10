import React, { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import { getPartyAccountStatement } from '../../utils/accountingEngine';
import { DetailedLedgerAccount } from '../../types';

interface PartyStatementModalProps {
    isOpen: boolean;
    onClose: () => void;
    accountCode: string | null;
    partyName?: string;
    partyType?: string;
}

export const PartyStatementModal: React.FC<PartyStatementModalProps> = ({
    isOpen,
    onClose,
    accountCode,
    partyName
}) => {
    const [loading, setLoading] = useState(true);
    const [statement, setStatement] = useState<{
        accountInfo: DetailedLedgerAccount | null;
        entries: Array<{
            voucherId: string;
            voucherNumber: number;
            date: string;
            description: string;
            debit: number;
            credit: number;
            balance: number;
            sourceType?: string;
            referenceNumber?: string;
        }>;
        totalDebit: number;
        totalCredit: number;
        finalBalance: number;
    } | null>(null);

    useEffect(() => {
        if (isOpen && accountCode) {
            setLoading(true);
            getPartyAccountStatement(accountCode)
                .then(data => {
                    setStatement(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Error fetching statement:', err);
                    setLoading(false);
                });
        }
    }, [isOpen, accountCode]);

    if (!isOpen || !accountCode) return null;

    const title = partyName || statement?.accountInfo?.name_fa || statement?.accountInfo?.name || `حساب ${accountCode}`;

    // Export Statement to Excel
    const handleExportExcel = async () => {
        if (!statement) return;
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Newland Trading Group';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet(`Statement_${accountCode}`, {
            views: [{ rightToLeft: true }]
        });

        // 1. Header Title
        sheet.mergeCells('A1:F1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'صورتحساب گردش و مانده حساب تفصیلی - شرکت بازرگانی بین‌المللی نیولند';
        titleCell.font = { name: 'Tahoma', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 32;

        // 2. Counterparty Meta
        sheet.addRow(['نام طرف حساب:', title, '', 'کد حساب تفصیلی:', accountCode, '']);
        sheet.addRow([
            'شماره تماس:', statement.accountInfo?.phone || '-', '', 
            'تاریخ گزارش:', new Date().toISOString().split('T')[0], 
            'واحد پول:', 'درهم امارات (AED)'
        ]);
        sheet.getRow(2).font = { name: 'Tahoma', size: 9, bold: true };
        sheet.getRow(3).font = { name: 'Tahoma', size: 9, bold: true };
        sheet.addRow([]);

        // 3. Table Headers
        const headers = ['شماره سند', 'تاریخ', 'شرح رویداد مالی / شماره فاکتور', 'بدهکار (AED)', 'بستانکار (AED)', 'مانده جاری (AED)'];
        const headerRow = sheet.addRow(headers);
        headerRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 24;

        // 4. Data Rows
        statement.entries.forEach(entry => {
            const balanceText = `${Math.abs(entry.balance).toLocaleString()} ${entry.balance > 0 ? '(بد)' : entry.balance < 0 ? '(بس)' : '(تسویه)'}`;
            const r = sheet.addRow([
                `#${entry.voucherNumber}`,
                entry.date,
                entry.description + (entry.referenceNumber ? ` (عطف: ${entry.referenceNumber})` : ''),
                entry.debit || '',
                entry.credit || '',
                balanceText
            ]);
            r.font = { name: 'Tahoma', size: 9 };
            r.alignment = { horizontal: 'center', vertical: 'middle' };
            r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
        });

        // 5. Total Row
        const finalBalanceStatus = statement.finalBalance > 0.01 ? 'بدهکار' : statement.finalBalance < -0.01 ? 'بستانکار' : 'تسویه کامل';
        const totRow = sheet.addRow([
            'جمع کل و مانده نهایی',
            '',
            `وضعیت مانده نهایی: ${finalBalanceStatus}`,
            statement.totalDebit,
            statement.totalCredit,
            `${Math.abs(statement.finalBalance).toLocaleString()} (${finalBalanceStatus})`
        ]);
        totRow.font = { name: 'Tahoma', size: 10, bold: true };
        totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        totRow.alignment = { horizontal: 'center', vertical: 'middle' };

        sheet.columns = [
            { width: 14 },
            { width: 14 },
            { width: 44 },
            { width: 18 },
            { width: 18 },
            { width: 22 }
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewLand_Statement_${accountCode}_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full p-4 sm:p-6 space-y-5 max-h-[92vh] flex flex-col print-container my-auto">
                {/* Header */}
                <div className="flex justify-between items-start pb-4 border-b border-slate-200 shrink-0 print:hidden">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <span className="w-3 h-3 bg-indigo-600 rounded-full" />
                            <h3 className="font-bold text-slate-800 text-base sm:text-lg">
                                صورتحساب گردش و مانده تفصیلی (Statement of Account)
                            </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5 text-xs text-slate-600">
                            <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                                طرف حساب: {title}
                            </span>
                            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded-lg text-slate-700 font-semibold">
                                کد تفصیلی: {accountCode}
                            </span>
                            {statement?.accountInfo?.phone && (
                                <span className="text-slate-500">تلفن: {statement.accountInfo.phone}</span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportExcel}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                        >
                            <span>📊 دانلود اکسل</span>
                        </button>
                        <button
                            onClick={() => window.print()}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                        >
                            <span>🖨️ چاپ A4</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition text-sm font-bold"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Printable Document Sheet Wrapper */}
                <div className="border border-slate-300 rounded-2xl p-5 sm:p-6 bg-white text-slate-800 space-y-4 flex-1 flex flex-col overflow-hidden">
                    {/* Official Document Print Header */}
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3">
                        <div>
                            <h1 className="text-lg sm:text-xl font-black text-slate-900">
                                شرکت بازرگانی بین‌المللی نیولند (NEWLAND)
                            </h1>
                            <p className="text-xs text-slate-600 font-bold mt-0.5">
                                صورتحساب رسمی ریز گردش و مانده حساب تفصیلی
                            </p>
                            <p className="text-xs text-slate-800 mt-2">
                                <span className="font-bold">نام طرف حساب: </span>
                                <span className="font-semibold text-indigo-900">{title}</span>
                            </p>
                        </div>
                        <div className="text-left font-mono text-xs space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200 min-w-[170px]">
                            <p><span className="text-slate-500 font-sans">کد تفصیلی:</span> <span className="font-bold text-indigo-700">{accountCode}</span></p>
                            <p><span className="text-slate-500 font-sans">تاریخ گزارش:</span> {new Date().toISOString().split('T')[0]}</p>
                            <p><span className="text-slate-500 font-sans">واحد پول:</span> <span className="font-bold text-emerald-700">AED (درهم)</span></p>
                        </div>
                    </div>

                    {/* Summary KPI Cards */}
                    {statement && (
                        <div className="grid grid-cols-3 gap-3 shrink-0">
                            <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-2xl">
                                <span className="text-[11px] font-bold text-emerald-800 block">مجموع گردش بدهکار:</span>
                                <span className="text-sm font-mono font-bold text-emerald-700">
                                    {statement.totalDebit.toLocaleString()} <span className="text-[10px]">درهم</span>
                                </span>
                            </div>
                            <div className="bg-rose-50/70 border border-rose-200 p-3 rounded-2xl">
                                <span className="text-[11px] font-bold text-rose-800 block">مجموع گردش بستانکار:</span>
                                <span className="text-sm font-mono font-bold text-rose-700">
                                    {statement.totalCredit.toLocaleString()} <span className="text-[10px]">درهم</span>
                                </span>
                            </div>
                            <div className={`p-3 rounded-2xl border ${
                                statement.finalBalance > 0
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                                    : statement.finalBalance < 0
                                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}>
                                <span className="text-[11px] font-bold block">مانده نهایی حساب:</span>
                                <span className="text-sm font-mono font-bold">
                                    {Math.abs(statement.finalBalance).toLocaleString()}{' '}
                                    <span className="text-[10px] font-sans font-bold">
                                        {statement.finalBalance > 0.01 ? '(بدهکار)' : statement.finalBalance < -0.01 ? '(بستانکار)' : '(تسویه کامل)'}
                                    </span>
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Ledger Transactions Table */}
                    <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                        {loading ? (
                            <div className="p-8 text-center text-xs text-slate-500">در حال بارگذاری تراکنش‌ها...</div>
                        ) : !statement || statement.entries.length === 0 ? (
                            <div className="p-8 text-center text-xs text-slate-400">
                                هیچ سند یا تراکنشی برای این حساب تفصیلی ثبت نشده است.
                            </div>
                        ) : (
                            <table className="w-full text-right text-xs">
                                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                                    <tr>
                                        <th className="p-2.5 text-center w-20">شماره سند</th>
                                        <th className="p-2.5 w-24">تاریخ</th>
                                        <th className="p-2.5">شرح عملیات / سند</th>
                                        <th className="p-2.5 text-left w-28">بدهکار (AED)</th>
                                        <th className="p-2.5 text-left w-28">بستانکار (AED)</th>
                                        <th className="p-2.5 text-left w-32">مانده جاری (AED)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {statement.entries.map((entry, idx) => (
                                        <tr key={`${entry.voucherId}-${idx}`} className="hover:bg-slate-50 transition">
                                            <td className="p-2.5 text-center font-mono font-bold text-indigo-700">
                                                #{entry.voucherNumber}
                                            </td>
                                            <td className="p-2.5 font-mono text-slate-600">{entry.date}</td>
                                            <td className="p-2.5 text-slate-800">
                                                <div className="font-semibold">{entry.description}</div>
                                                {entry.referenceNumber && (
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                        عطف: {entry.referenceNumber}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-2.5 text-left font-mono font-bold text-emerald-600">
                                                {entry.debit > 0 ? entry.debit.toLocaleString() : '-'}
                                            </td>
                                            <td className="p-2.5 text-left font-mono font-bold text-rose-600">
                                                {entry.credit > 0 ? entry.credit.toLocaleString() : '-'}
                                            </td>
                                            <td className={`p-2.5 text-left font-mono font-bold ${
                                                entry.balance > 0 ? 'text-indigo-700' : entry.balance < 0 ? 'text-amber-700' : 'text-slate-500'
                                            }`}>
                                                {entry.balance !== 0 ? Math.abs(entry.balance).toLocaleString() : '0'}
                                                <span className="text-[10px] font-sans mr-1 font-bold">
                                                    {entry.balance > 0.01 ? '(بد)' : entry.balance < -0.01 ? '(بس)' : ''}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                                        <td colSpan={3} className="p-2.5 text-slate-900">جمع کل و وضعیت نهایی حساب:</td>
                                        <td className="p-2.5 text-left font-mono text-emerald-700 font-black">
                                            {statement?.totalDebit.toLocaleString()}
                                        </td>
                                        <td className="p-2.5 text-left font-mono text-rose-700 font-black">
                                            {statement?.totalCredit.toLocaleString()}
                                        </td>
                                        <td className="p-2.5 text-left font-mono text-indigo-900 font-black">
                                            {statement ? Math.abs(statement.finalBalance).toLocaleString() : 0}{' '}
                                            <span className="text-[10px]">
                                                {statement && statement.finalBalance > 0.01 ? '(بد)' : statement && statement.finalBalance < -0.01 ? '(بس)' : ''}
                                            </span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>

                    {/* Official Statement Signatures */}
                    <div className="grid grid-cols-2 gap-8 pt-4 text-xs print-signature-block">
                        <div className="border-t border-slate-400 pt-2 text-center text-slate-600">
                            مهر و امضای امور مالی و حسابداری نیولند
                        </div>
                        <div className="border-t border-slate-400 pt-2 text-center text-slate-600">
                            مهر و امضای تایید طرف حساب
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-between items-center pt-1 shrink-0 text-xs text-slate-500 print:hidden">
                    <span>همگام‌سازی بلادرنگ حسابداری دوبل با اسناد دریافتی و پرداختی</span>
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition"
                    >
                        بستن
                    </button>
                </div>
            </div>
        </div>
    );
};
