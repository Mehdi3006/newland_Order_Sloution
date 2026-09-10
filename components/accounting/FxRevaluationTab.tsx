import React, { useState, useMemo } from 'react';
import { useFxRates } from '../../hooks/useFxRates';
import { JournalVoucher } from '../../types';
import { db } from '../../db';

interface FxRevaluationTabProps {
    journalVouchers: JournalVoucher[];
    subsidiaryAccounts: Array<{ id?: string; code: string; name: string; name_fa?: string }>;
}

export const FxRevaluationTab: React.FC<FxRevaluationTabProps> = ({
    journalVouchers,
    subsidiaryAccounts
}) => {
    const { rates, updateFxRates } = useFxRates();
    const [revalDate, setRevalDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [fxGainLossAccountCode, setFxGainLossAccountCode] = useState<string>('1006');
    const [saveToGlobalSettings, setSaveToGlobalSettings] = useState<boolean>(true);

    const [rateUsdAed, setRateUsdAed] = useState<number>(rates.usd_aed || 3.6725);
    const [rateCnyAed, setRateCnyAed] = useState<number>(rates.aed_cny ? 1 / rates.aed_cny : 0.5128);
    const [rateTomanAed, setRateTomanAed] = useState<number>(rates.aed_toman ? 10000 / rates.aed_toman : 0.37037);

    // Keep in sync with global settings when requested
    const handleSyncWithGlobal = () => {
        setRateUsdAed(rates.usd_aed || 3.6725);
        setRateCnyAed(rates.aed_cny ? 1 / rates.aed_cny : 0.5128);
        setRateTomanAed(rates.aed_toman ? 10000 / rates.aed_toman : 0.37037);
    };

    // Calculate foreign currency balances
    const fxRevaluationData = useMemo(() => {
        const foreignMap = new Map<string, {
            code: string;
            name: string;
            currency: 'USD' | 'CNY' | 'TOMAN';
            foreignDebit: number;
            foreignCredit: number;
            bookDebitAED: number;
            bookCreditAED: number;
        }>();

        journalVouchers.forEach(v => {
            (v.items || []).forEach(item => {
                const cur = item.currency;
                if (cur === 'USD' || cur === 'CNY' || cur === 'TOMAN') {
                    const code = item.accountCode || item.accountId;
                    const key = `${code}_${cur}`;
                    if (!foreignMap.has(key)) {
                        foreignMap.set(key, {
                            code,
                            name: item.accountName || code,
                            currency: cur,
                            foreignDebit: 0,
                            foreignCredit: 0,
                            bookDebitAED: 0,
                            bookCreditAED: 0
                        });
                    }
                    const entry = foreignMap.get(key)!;
                    entry.foreignDebit += item.foreignAmount && item.debit ? item.foreignAmount : 0;
                    entry.foreignCredit += item.foreignAmount && item.credit ? item.foreignAmount : 0;
                    entry.bookDebitAED += item.debit || 0;
                    entry.bookCreditAED += item.credit || 0;
                }
            });
        });

        const rows = Array.from(foreignMap.values()).map(entry => {
            const foreignBalance = entry.foreignDebit - entry.foreignCredit;
            const bookValueAED = entry.bookDebitAED - entry.bookCreditAED;
            let currentRate = 1;
            if (entry.currency === 'USD') currentRate = rateUsdAed;
            else if (entry.currency === 'CNY') currentRate = rateCnyAed;
            else if (entry.currency === 'TOMAN') currentRate = rateTomanAed / 10000;

            const revaluedAED = foreignBalance * currentRate;
            const deltaAED = revaluedAED - bookValueAED;

            return {
                ...entry,
                foreignBalance,
                bookValueAED,
                currentRate,
                revaluedAED,
                deltaAED
            };
        });

        const totalFxDeltaAED = rows.reduce((s, r) => s + r.deltaAED, 0);

        return { rows, totalFxDeltaAED };
    }, [journalVouchers, rateUsdAed, rateCnyAed, rateTomanAed]);

    const handlePostFxRevaluationVoucher = async () => {
        if (fxRevaluationData.rows.length === 0) {
            alert('حساب ارزی با گردش ارز خارجی جهت تسعیر یافت نشد.');
            return;
        }

        if (Math.abs(fxRevaluationData.totalFxDeltaAED) < 0.01) {
            alert('تفاوت تسعیر صفـر است؛ نیازی به صدور سند تسعیر نیست.');
            return;
        }

        if (saveToGlobalSettings) {
            await updateFxRates({
                usd_aed: rateUsdAed,
                aed_cny: rateCnyAed > 0 ? 1 / rateCnyAed : 1.95,
                aed_toman: rateTomanAed > 0 ? Math.round(10000 / rateTomanAed) : 27000
            });
        }

        const nextNumber = (journalVouchers.length > 0
            ? Math.max(...journalVouchers.map(v => Number(v.voucherNumber) || 0)) + 1
            : 1001);

        const items: any[] = [];
        let totalDebit = 0;
        let totalCredit = 0;

        fxRevaluationData.rows.forEach((r, idx) => {
            if (Math.abs(r.deltaAED) > 0.01) {
                if (r.deltaAED > 0) {
                    items.push({
                        id: `reval-${Date.now()}-${idx}`,
                        accountId: r.code,
                        accountCode: r.code,
                        accountName: r.name,
                        debit: r.deltaAED,
                        credit: 0,
                        currency: 'AED',
                        currencyRate: 1,
                        foreignAmount: r.deltaAED,
                        description: `تفاوت تسعیر ارز ${r.currency} بر اساس نرخ جدید (${r.currentRate})`
                    });
                    totalDebit += r.deltaAED;
                } else {
                    const absDelta = Math.abs(r.deltaAED);
                    items.push({
                        id: `reval-${Date.now()}-${idx}`,
                        accountId: r.code,
                        accountCode: r.code,
                        accountName: r.name,
                        debit: 0,
                        credit: absDelta,
                        currency: 'AED',
                        currencyRate: 1,
                        foreignAmount: absDelta,
                        description: `تفاوت تسعیر ارز ${r.currency} بر اساس نرخ جدید (${r.currentRate})`
                    });
                    totalCredit += absDelta;
                }
            }
        });

        const targetAcc = subsidiaryAccounts.find(a => a.code === fxGainLossAccountCode);
        const targetAccName = targetAcc ? (targetAcc.name_fa || targetAcc.name) : 'سود و زیان تسعیر ارز';

        if (fxRevaluationData.totalFxDeltaAED > 0) {
            items.push({
                id: `reval-gain-${Date.now()}`,
                accountId: fxGainLossAccountCode,
                accountCode: fxGainLossAccountCode,
                accountName: targetAccName,
                debit: 0,
                credit: fxRevaluationData.totalFxDeltaAED,
                currency: 'AED',
                currencyRate: 1,
                foreignAmount: fxRevaluationData.totalFxDeltaAED,
                description: `سود حاصل از تسعیر ارزهای خارجی در تاریخ ${revalDate}`
            });
            totalCredit += fxRevaluationData.totalFxDeltaAED;
        } else {
            const absTotal = Math.abs(fxRevaluationData.totalFxDeltaAED);
            items.push({
                id: `reval-loss-${Date.now()}`,
                accountId: fxGainLossAccountCode,
                accountCode: fxGainLossAccountCode,
                accountName: targetAccName,
                debit: absTotal,
                credit: 0,
                currency: 'AED',
                currencyRate: 1,
                foreignAmount: absTotal,
                description: `زیان حاصل از تسعیر ارزهای خارجی در تاریخ ${revalDate}`
            });
            totalDebit += absTotal;
        }

        const newVoucher: JournalVoucher = {
            id: `vfx-${Date.now()}`,
            voucherNumber: nextNumber,
            date: revalDate,
            description: `سند پایان دوره تسعیر نرخ ارز به درهم (${revalDate})`,
            sourceType: 'fx_revaluation',
            status: 'posted',
            totalDebit,
            totalCredit,
            items,
            createdAt: new Date().toISOString()
        };

        await db.journalVouchers.add(newVoucher);
        alert(`✅ سند حسابداری تسعیر نرخ ارز به شماره #${nextNumber} با موفقیت ثبت شد.`);
    };

    return (
        <div className="space-y-6">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-amber-500/10 via-white to-indigo-500/10 p-5 rounded-2xl border border-amber-300 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-500 text-white rounded-xl shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                تسعیر نرخ ارز و حساب‌های ارزی (FX Revaluation)
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                                    ارز پایه دفاتر: درهم امارات (AED)
                                </span>
                            </h2>
                            <p className="text-xs text-slate-600 mt-1">
                                محاسبه خودکار و صدور سند حسابداری تسعیر ارز برای مانده حساب‌های ارزی (دلار، یوان، تومان) بر اساس نرخ‌های جاری منبع واحد حقیقت (SSOT).
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handlePostFxRevaluationVoucher}
                        className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        صدور و ثبت سند تسعیر نرخ ارز
                    </button>
                </div>
            </div>

            {/* Rate Settings Card */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-2 h-2 bg-amber-500 rounded-full" />
                        تنظیمات نرخ روز تسعیر ارزها به درهم (AED Base)
                    </h3>
                    <button
                        onClick={handleSyncWithGlobal}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                        🔄 بازخوانی از منبع واحد تنظیمات (SSOT)
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div>
                        <label className="block text-slate-600 mb-1 font-bold">تاریخ تسعیر سند</label>
                        <input
                            type="date"
                            value={revalDate}
                            onChange={(e) => setRevalDate(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-800 font-mono"
                        />
                    </div>

                    <div>
                        <label className="block text-slate-600 mb-1 font-bold">نرخ تسعیر ۱ دلار (USD) به درهم</label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.0001"
                                value={rateUsdAed}
                                onChange={(e) => setRateUsdAed(parseFloat(e.target.value) || 0)}
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-emerald-700 font-mono font-bold pl-12"
                            />
                            <span className="absolute left-3 top-2.5 text-slate-400 font-bold">AED</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-slate-600 mb-1 font-bold">نرخ تسعیر ۱ یوان (CNY) به درهم</label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.0001"
                                value={rateCnyAed}
                                onChange={(e) => setRateCnyAed(parseFloat(e.target.value) || 0)}
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-blue-700 font-mono font-bold pl-12"
                            />
                            <span className="absolute left-3 top-2.5 text-slate-400 font-bold">AED</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-slate-600 mb-1 font-bold">نرخ تسعیر ۱۰,۰۰۰ تومان به درهم</label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.0001"
                                value={rateTomanAed}
                                onChange={(e) => setRateTomanAed(parseFloat(e.target.value) || 0)}
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-rose-700 font-mono font-bold pl-12"
                            />
                            <span className="absolute left-3 top-2.5 text-slate-400 font-bold">AED</span>
                        </div>
                    </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <label className="font-bold text-slate-700 whitespace-nowrap">حساب سود/زیان تسعیر:</label>
                        <select
                            value={fxGainLossAccountCode}
                            onChange={(e) => setFxGainLossAccountCode(e.target.value)}
                            className="bg-slate-50 border border-slate-300 rounded-xl p-2 text-slate-800 text-xs"
                        >
                            {subsidiaryAccounts.map(acc => (
                                <option key={acc.id || acc.code} value={acc.code}>
                                    {acc.code} - {acc.name_fa || acc.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                            type="checkbox"
                            checked={saveToGlobalSettings}
                            onChange={(e) => setSaveToGlobalSettings(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                        />
                        <span>ذخیره خودکار این نرخ‌ها در تنظیمات پایه سیستم (SSOT)</span>
                    </label>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                    <p className="text-xs text-slate-500 font-bold">حساب‌های ارزی شناسایی‌شده</p>
                    <h3 className="text-2xl font-black text-slate-800 mt-2">
                        {fxRevaluationData.rows.length} حساب
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1">دارای گردش دلار، یوان یا تومان</p>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                    <p className="text-xs text-slate-500 font-bold">جمع ارزش دفتری فعلی (AED)</p>
                    <h3 className="text-2xl font-black text-slate-800 mt-2 font-mono">
                        {fxRevaluationData.rows.reduce((s, r) => s + r.bookValueAED, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} AED
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1">ثبت شده در دفاتر به درهم</p>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                    <p className="text-xs text-slate-500 font-bold">جمع ارزش تسعیر جدید (AED)</p>
                    <h3 className="text-2xl font-black text-indigo-600 mt-2 font-mono">
                        {fxRevaluationData.rows.reduce((s, r) => s + r.revaluedAED, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} AED
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1">به نرخ‌های تسعیر جدید</p>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm">
                    <p className="text-xs text-slate-500 font-bold">خالص سود / (زیان) تسعیر ارز</p>
                    <h3 className={`text-2xl font-black mt-2 font-mono ${fxRevaluationData.totalFxDeltaAED >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {fxRevaluationData.totalFxDeltaAED >= 0 ? '+' : ''}
                        {fxRevaluationData.totalFxDeltaAED.toLocaleString(undefined, { maximumFractionDigits: 2 })} AED
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">
                        {fxRevaluationData.totalFxDeltaAED >= 0 ? '✓ سود حاصل از تسعیر ارز' : '⚠️ زیان حاصل از تسعیر ارز'}
                    </p>
                </div>
            </div>

            {/* FX Revaluation Detail Table */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-right text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                                <th className="p-3">کد حساب</th>
                                <th className="p-3">نام حساب</th>
                                <th className="p-3 text-center">نوع ارز</th>
                                <th className="p-3 text-center">مانده ارزی حساب</th>
                                <th className="p-3 text-center">ارزش دفتری (AED)</th>
                                <th className="p-3 text-center">نرخ جدید تسعیر</th>
                                <th className="p-3 text-center">ارزش جدید تسعیر (AED)</th>
                                <th className="p-3 text-center">تفاوت تسعیر (AED)</th>
                                <th className="p-3 text-center">وضعیت</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {fxRevaluationData.rows.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-slate-400 font-medium">
                                        حساب ارزی با گردش دلار، یوان یا تومان در اسناد دوبل ثبت نشده است.
                                    </td>
                                </tr>
                            ) : (
                                fxRevaluationData.rows.map(row => {
                                    const isGain = row.deltaAED > 0.01;
                                    const isLoss = row.deltaAED < -0.01;

                                    return (
                                        <tr key={row.code} className="hover:bg-slate-50 transition">
                                            <td className="p-3 font-mono font-bold text-indigo-600">{row.code}</td>
                                            <td className="p-3 font-semibold text-slate-800">{row.name}</td>
                                            <td className="p-3 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                    row.currency === 'USD' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                    row.currency === 'CNY' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                                    'bg-purple-50 text-purple-700 border border-purple-200'
                                                }`}>
                                                    {row.currency === 'USD' ? '$ دلار' : row.currency === 'CNY' ? '¥ یوان' : 'تومان'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center font-mono font-bold text-slate-800">
                                                {row.foreignBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.currency}
                                            </td>
                                            <td className="p-3 text-center font-mono text-slate-600">
                                                {row.bookValueAED.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-3 text-center font-mono text-indigo-600 font-bold">
                                                {row.currentRate.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                            </td>
                                            <td className="p-3 text-center font-mono text-slate-800 font-bold">
                                                {row.revaluedAED.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                            </td>
                                            <td className={`p-3 text-center font-mono font-bold ${
                                                isGain ? 'text-emerald-600' : isLoss ? 'text-rose-600' : 'text-slate-600'
                                            }`}>
                                                {row.deltaAED >= 0 ? '+' : ''}
                                                {row.deltaAED.toLocaleString(undefined, { maximumFractionDigits: 2 })} AED
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                    isGain ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                    isLoss ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                                    'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {isGain ? 'سود تسعیر' : isLoss ? 'زیان تسعیر' : 'بدون تغییر'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
