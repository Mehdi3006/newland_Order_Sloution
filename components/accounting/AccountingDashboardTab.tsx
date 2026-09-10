import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import { seedAccountingSampleData } from '../../utils/accountingSampleData';

interface AccountingDashboardTabProps {
    financialStats: {
        totalSalesUSD: number;
        totalPurchasesUSD: number;
        totalExpensesUSD: number;
        grossProfitUSD: number;
        netProfitUSD: number;
        profitMargin: number;
        voucherCount: number;
        purchaseCount: number;
        salesCount: number;
    };
    trialBalance: {
        list: Array<{
            code: string;
            name: string;
            debit: number;
            credit: number;
            endingDebit: number;
            endingCredit: number;
        }>;
        totalDebitMovement: number;
        totalCreditMovement: number;
        totalEndingDebit: number;
        totalEndingCredit: number;
        isBalanced: boolean;
    };
}

export const AccountingDashboardTab: React.FC<AccountingDashboardTabProps> = ({
    financialStats,
    trialBalance
}) => {
    const [isSeeding, setIsSeeding] = useState(false);
    const [seedMessage, setSeedMessage] = useState('');

    const handleSeedData = async () => {
        try {
            setIsSeeding(true);
            setSeedMessage('در حال درج سناریوهای تستی حسابداری...');
            const res = await seedAccountingSampleData();
            setSeedMessage(`✅ با موفقیت ${res.purchaseInvoicesAdded} فاکتور خرید، ${res.salesInvoicesAdded} فاکتور فروش و ${res.journalVouchersAdded} سند حسابداری دوبل درج گردید.`);
            setTimeout(() => setSeedMessage(''), 6000);
        } catch (err: any) {
            console.error('Error seeding data:', err);
            setSeedMessage(`❌ خطا در بارگذاری داده‌ها: ${err?.message || err}`);
        } finally {
            setIsSeeding(false);
        }
    };

    // Export Trial Balance to Excel
    const exportTrialBalanceExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('TrialBalance_4Columns', {
            views: [{ rightToLeft: true }]
        });

        // 1. Header Banner
        sheet.mergeCells('A1:F1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'تراز آزمایشی چهار ستونی دفتر کل و معین - شرکت بازرگانی بین‌المللی نیولند';
        titleCell.font = { name: 'Tahoma', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 32;

        sheet.columns = [
            { header: 'کد حساب', key: 'code', width: 14 },
            { header: 'نام و شرح سرفصل حساب', key: 'name', width: 38 },
            { header: 'گردش بدهکار (درهم)', key: 'debit', width: 22 },
            { header: 'گردش بستانکار (درهم)', key: 'credit', width: 22 },
            { header: 'مانده بدهکار (درهم)', key: 'endingDebit', width: 22 },
            { header: 'مانده بستانکار (درهم)', key: 'endingCredit', width: 22 },
        ];

        // Format header
        const headerRow = sheet.getRow(2);
        headerRow.values = ['کد حساب', 'نام و شرح سرفصل حساب', 'گردش بدهکار (درهم)', 'گردش بستانکار (درهم)', 'مانده بدهکار (درهم)', 'مانده بستانکار (درهم)'];
        headerRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 25;

        trialBalance.list.forEach(row => {
            const r = sheet.addRow({
                code: row.code,
                name: row.name,
                debit: row.debit || '',
                credit: row.credit || '',
                endingDebit: row.endingDebit || '',
                endingCredit: row.endingCredit || ''
            });
            r.font = { name: 'Tahoma', size: 9 };
            r.alignment = { horizontal: 'center', vertical: 'middle' };
            r.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
        });

        // Add total row
        const totalRow = sheet.addRow({
            code: 'جمع کل',
            name: 'تراز حسابداری دوبل',
            debit: trialBalance.totalDebitMovement,
            credit: trialBalance.totalCreditMovement,
            endingDebit: trialBalance.totalEndingDebit,
            endingCredit: trialBalance.totalEndingCredit
        });
        totalRow.font = { name: 'Tahoma', size: 10, bold: true };
        totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        totalRow.alignment = { horizontal: 'center', vertical: 'middle' };

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewLand_Trial_Balance_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Export Profit & Loss (P&L) Statement to Excel
    const exportProfitLossExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Profit_And_Loss', {
            views: [{ rightToLeft: true }]
        });

        sheet.mergeCells('A1:C1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'صورت سود و زیان جامع (Income Statement) - شرکت بازرگانی نیولند';
        titleCell.font = { name: 'Tahoma', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 32;

        sheet.addRow(['تاریخ گزارش:', new Date().toISOString().split('T')[0], 'واحد: دلار آمریکا (USD)']);
        sheet.getRow(2).font = { name: 'Tahoma', size: 9, bold: true };
        sheet.addRow([]);

        const headers = ['شرح سرفصل سود و زیان', 'مبلغ (USD)', 'درصد از درآمد'];
        const headerRow = sheet.addRow(headers);
        headerRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14B8A6' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 25;

        // Sales Row
        const r1 = sheet.addRow(['درآمد حاصل از فروش کالا (Gross Sales Revenue)', financialStats.totalSalesUSD, '100%']);
        r1.font = { name: 'Tahoma', size: 9, bold: true };
        r1.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };

        // Purchases Row
        const r2 = sheet.addRow(['بهای تمام شده خرید و کالای فروش رفته (Cost of Goods Sold)', financialStats.totalPurchasesUSD, financialStats.totalSalesUSD > 0 ? `${((financialStats.totalPurchasesUSD / financialStats.totalSalesUSD) * 100).toFixed(1)}%` : '0%']);
        r2.font = { name: 'Tahoma', size: 9 };
        r2.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };

        // Gross Profit Row
        const r3 = sheet.addRow(['سود ناخالص عملیاتی (Gross Profit)', financialStats.grossProfitUSD, financialStats.totalSalesUSD > 0 ? `${((financialStats.grossProfitUSD / financialStats.totalSalesUSD) * 100).toFixed(1)}%` : '0%']);
        r3.font = { name: 'Tahoma', size: 9, bold: true };
        r3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        r3.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };

        // Operating Expenses Row
        const r4 = sheet.addRow(['هزینه‌های اداری، عمومی و ترخیص (Operating Expenses)', financialStats.totalExpensesUSD, financialStats.totalSalesUSD > 0 ? `${((financialStats.totalExpensesUSD / financialStats.totalSalesUSD) * 100).toFixed(1)}%` : '0%']);
        r4.font = { name: 'Tahoma', size: 9 };
        r4.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };

        // Net Profit Row
        const r5 = sheet.addRow(['سود خالص نهایی دوره‌ای (Net Profit)', financialStats.netProfitUSD, `${financialStats.profitMargin.toFixed(1)}%`]);
        r5.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        r5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: financialStats.netProfitUSD >= 0 ? 'FF059669' : 'FFE11D48' } };
        r5.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };

        sheet.columns = [
            { width: 45 },
            { width: 24 },
            { width: 18 }
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewLand_Income_Statement_PL_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            {/* Top KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-3xl p-5 border border-emerald-200/80 shadow-sm relative overflow-hidden transition hover:shadow-md">
                    <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500" />
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-slate-500 font-bold">درآمد کل فروش (Sales)</p>
                            <h3 className="text-2xl font-black text-emerald-600 mt-2">
                                ${financialStats.totalSalesUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-1 font-medium">
                                تعداد فاکتورهای فروش: {financialStats.salesCount}
                            </p>
                        </div>
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-5 border border-blue-200/80 shadow-sm relative overflow-hidden transition hover:shadow-md">
                    <div className="absolute top-0 right-0 w-2 h-full bg-blue-500" />
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-slate-500 font-bold">فاکتورهای خرید (Purchases)</p>
                            <h3 className="text-2xl font-black text-blue-600 mt-2">
                                ${financialStats.totalPurchasesUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-1 font-medium">
                                تعداد فاکتورهای ثبت شده: {financialStats.purchaseCount}
                            </p>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-5 border border-indigo-200/80 shadow-sm relative overflow-hidden transition hover:shadow-md">
                    <div className="absolute top-0 right-0 w-2 h-full bg-indigo-500" />
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-slate-500 font-bold">اسناد حسابداری دوبل (Vouchers)</p>
                            <h3 className="text-2xl font-black text-indigo-600 mt-2">
                                {financialStats.voucherCount} سند
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-1 font-medium flex items-center gap-1">
                                وضعیت تراز دفتر دوبل: 
                                {trialBalance.isBalanced ? (
                                    <span className="text-emerald-600 font-bold">✓ متوازن</span>
                                ) : (
                                    <span className="text-rose-600 font-bold">❌ نامتوازن</span>
                                )}
                            </p>
                        </div>
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-5 border border-purple-200/80 shadow-sm relative overflow-hidden transition hover:shadow-md">
                    <div className="absolute top-0 right-0 w-2 h-full bg-purple-500" />
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-slate-500 font-bold">سود خالص نهایی (Net Profit)</p>
                            <h3 className={`text-2xl font-black mt-2 ${financialStats.netProfitUSD >= 0 ? 'text-purple-700' : 'text-rose-600'}`}>
                                ${financialStats.netProfitUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-1 font-medium">
                                حاشیه سود نهایی: {financialStats.profitMargin.toFixed(1)}%
                            </p>
                        </div>
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl border border-purple-100">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Test Scenarios Management & Status Card */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 text-white shadow-md border border-indigo-800/40 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-indigo-800/60">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-indigo-600/60 text-indigo-200 border border-indigo-400/30 flex items-center justify-center font-bold text-sm">
                            🧪
                        </div>
                        <div>
                            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                                سناریوهای تستی چندگانه حسابداری بازرگانی (Test Scenarios)
                            </h3>
                            <p className="text-xs text-indigo-200/70">
                                شامل داده‌های خرید کانتینری ارزی، خریدهای ترکیبی خرد/کارتن، فروش‌های رسمی، اعتباری، نسیه، هزینه‌ها و اسناد دوبل متوازن
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleSeedData}
                        disabled={isSeeding}
                        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 disabled:bg-slate-700 text-white text-xs font-bold rounded-xl transition shadow-md flex items-center gap-2"
                    >
                        <span>🔄</span>
                        <span>{isSeeding ? 'در حال بارگذاری...' : 'درج مجدد / بازنشانی سناریوهای تستی'}</span>
                    </button>
                </div>

                {seedMessage && (
                    <div className="p-3 bg-indigo-500/20 border border-indigo-400/40 rounded-xl text-xs text-indigo-100 font-medium animate-fadeIn">
                        {seedMessage}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-emerald-400">سناریو ۱: خرید کانتینری ارزی</span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">PUR-001</span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">
                            خرید ۲۳,۵۰۰ درهمی اقلام کارتنی از شنژن چین همراه هزینه بازرسی و تسویه کامل ارزی از طریق بانک NBO دبی.
                        </p>
                    </div>

                    <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-amber-400">سناریو ۲: خرید ترکیبی و بیعانه</span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono">PUR-002</span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">
                            خرید ۸,۲۰۶ درهمی ترکیبی (کارتن + نمونه خرد) از صنایع آنزو با پرداخت ۵,۰۰۰ درهم بیعانه و ثبت مانده بستانکاری.
                        </p>
                    </div>

                    <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-blue-400">سناریو ۳: فروش عمده رسمی</span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-mono">INV-101</span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">
                            فروش ۱۲,۰۰۰ درهمی با تخفیف تجاری به فروشگاه رفاه و تسویه کامل واریزی به حساب بانکی شرکت در دبی.
                        </p>
                    </div>

                    <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-purple-400">سناریو ۴: فروش اعتباری مدت‌دار</span>
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono">INV-102</span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">
                            فروش اعتباری ۸,۱۵۰ درهمی به شرکت پخش البرز با سررسید ۲۰ روزه، همراه با ثبت خودکار سند بدهکاری مشتری.
                        </p>
                    </div>
                </div>
            </div>

            {/* 4-Column Trial Balance Table */}
            <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
                    <div>
                        <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                            تراز آزمایشی چهار ستونی (4-Column Trial Balance)
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            استخراج شده از کلیه اسناد حسابداری دوبل ثبت شده در سیستم بر اساس واحد پولی پایه (AED)
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button 
                            onClick={exportProfitLossExcel} 
                            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5"
                        >
                            <span>📊 اکسل سود و زیان (P&L)</span>
                        </button>
                        <button 
                            onClick={exportTrialBalanceExcel} 
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5"
                        >
                            <span>📊 اکسل تراز آزمایشی</span>
                        </button>
                        <button 
                            onClick={() => window.print()} 
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5"
                        >
                            <span>🖨️ چاپ A4</span>
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full text-right text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                                <th className="p-3 font-bold">کد حساب</th>
                                <th className="p-3 font-bold">نام و شرح حساب</th>
                                <th className="p-3 text-center bg-blue-50/70 text-blue-900 font-bold border-x border-slate-200">گردش بدهکار</th>
                                <th className="p-3 text-center bg-blue-50/70 text-blue-900 font-bold border-x border-slate-200">گردش بستانکار</th>
                                <th className="p-3 text-center bg-indigo-50/70 text-indigo-900 font-bold border-x border-slate-200">مانده بدهکار</th>
                                <th className="p-3 text-center bg-indigo-50/70 text-indigo-900 font-bold border-x border-slate-200">مانده بستانکار</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70">
                            {trialBalance.list.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">
                                        هنوز هیچ گردش حسابی ثبت نشده است. از تب اسناد دوبل اقدام به ثبت اسناد حسابداری کنید.
                                    </td>
                                </tr>
                            ) : (
                                trialBalance.list.map(row => (
                                    <tr key={row.code} className="hover:bg-slate-50 transition">
                                        <td className="p-3 font-mono text-indigo-600 font-bold">{row.code}</td>
                                        <td className="p-3 font-semibold text-slate-800">{row.name}</td>
                                        <td className="p-3 text-center font-mono text-slate-700 bg-blue-50/20 border-x border-slate-100">
                                            {row.debit > 0 ? row.debit.toLocaleString() : '-'}
                                        </td>
                                        <td className="p-3 text-center font-mono text-slate-700 bg-blue-50/20 border-x border-slate-100">
                                            {row.credit > 0 ? row.credit.toLocaleString() : '-'}
                                        </td>
                                        <td className="p-3 text-center font-mono text-emerald-600 font-bold bg-indigo-50/20 border-x border-slate-100">
                                            {row.endingDebit > 0 ? row.endingDebit.toLocaleString() : '-'}
                                        </td>
                                        <td className="p-3 text-center font-mono text-rose-600 font-bold bg-indigo-50/20 border-x border-slate-100">
                                            {row.endingCredit > 0 ? row.endingCredit.toLocaleString() : '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-100 font-bold text-xs sm:text-sm border-t-2 border-indigo-600">
                                <td colSpan={2} className="p-3 text-indigo-900 font-bold">جمع کل تراز آزمایشی (توازن):</td>
                                <td className="p-3 text-center text-blue-800 font-mono border-x border-slate-200 font-black">
                                    {trialBalance.totalDebitMovement.toLocaleString()}
                                </td>
                                <td className="p-3 text-center text-blue-800 font-mono border-x border-slate-200 font-black">
                                    {trialBalance.totalCreditMovement.toLocaleString()}
                                </td>
                                <td className="p-3 text-center text-emerald-700 font-mono border-x border-slate-200 font-black">
                                    {trialBalance.totalEndingDebit.toLocaleString()}
                                </td>
                                <td className="p-3 text-center text-rose-700 font-mono border-x border-slate-200 font-black">
                                    {trialBalance.totalEndingCredit.toLocaleString()}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};
