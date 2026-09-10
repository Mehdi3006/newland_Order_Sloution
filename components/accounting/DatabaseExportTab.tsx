import React, { useState } from 'react';
import { generateSQLiteDatabase, generateSQLScriptDump } from '../../utils/sqliteExporter';
import { seedAccountingSampleData } from '../../utils/accountingSampleData';

export const DatabaseExportTab: React.FC = () => {
    const [isExporting, setIsExporting] = useState(false);
    const [message, setMessage] = useState('');

    const handleSeedSampleData = async () => {
        try {
            setIsExporting(true);
            setMessage('در حال بارگذاری رکوردهای نمونه تستی در سیستم...');
            const res = await seedAccountingSampleData();
            setMessage(`✅ ${res.purchaseInvoicesAdded} فاکتور خرید، ${res.salesInvoicesAdded} فاکتور فروش، ${res.journalVouchersAdded} سند دوبل، و ${res.productsAdded} کالا با موفقیت درج شدند.`);
        } catch (error: any) {
            console.error('Error seeding data:', error);
            setMessage(`❌ خطا در بارگذاری داده‌ها: ${error?.message || error}`);
        } finally {
            setIsExporting(false);
        }
    };


    const handleExportSqlite = async () => {
        try {
            setIsExporting(true);
            setMessage('در حال آماده‌سازی و تبدیل جداول به دیتابیس SQLite...');
            const uint8Array = await generateSQLiteDatabase();
            const blob = new Blob([uint8Array.buffer as ArrayBuffer], { type: 'application/x-sqlite3' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `NewLand_ERP_${new Date().toISOString().split('T')[0]}.sqlite`;
            a.click();
            URL.revokeObjectURL(url);
            setMessage('✅ فایل دیتابیس SQLite با موفقیت دانلود شد.');
        } catch (error: any) {
            console.error('Error exporting SQLite:', error);
            setMessage(`❌ خطا در استخراج دیتابیس: ${error?.message || error}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportSqlScript = async () => {
        try {
            setIsExporting(true);
            setMessage('در حال تولید اسکریپت SQL Dump...');
            const sqlDump = await generateSQLScriptDump();
            const blob = new Blob([sqlDump], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `NewLand_ERP_Dump_${new Date().toISOString().split('T')[0]}.sql`;
            a.click();
            URL.revokeObjectURL(url);
            setMessage('✅ اسکریپت SQL Dump با موفقیت دانلود شد.');
        } catch (error: any) {
            console.error('Error exporting SQL script:', error);
            setMessage(`❌ خطا در تولید اسکریپت: ${error?.message || error}`);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">پشتیبان‌گیری، خروجی SQLite و اسکریپت SQL</h2>
                        <p className="text-xs text-slate-500 mt-0.5">دریافت فایل استاندارد باینری SQLite و اسکریپت کامل DDL/DML جهت انتقال به سرورها و سیستم‌های گزارش‌گیری</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full" />
                            دانلود فایل استاندارد باینری SQLite (.sqlite)
                        </h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            این فایل شامل تمامی جداول، کدینگ حساب‌ها، اسناد دوبل، سفارشات و فاکتورها بوده و قابل بازگشایی در ابزارهای DB Browser for SQLite و DBeaver است.
                        </p>
                        <button
                            onClick={handleExportSqlite}
                            disabled={isExporting}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            دانلود دیتابیس SQLite
                        </button>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <span className="w-2 h-2 bg-indigo-500 rounded-full" />
                            دانلود اسکریپت SQL Dump متنی (.sql)
                        </h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            متن اسکریپت شامل دستورات CREATE TABLE و INSERT INTO برای واردسازی مستقیم در PostgreSQL, MySQL یا SQLite سرور.
                        </p>
                        <button
                            onClick={handleExportSqlScript}
                            disabled={isExporting}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                            دانلود اسکریپت SQL Dump
                        </button>
                    </div>
                </div>

                {message && (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-xl text-xs font-medium">
                        {message}
                    </div>
                )}
            </div>

            {/* Test Scenarios Management Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">تولید و بارگذاری سناریوهای تستی حسابداری</h2>
                        <p className="text-xs text-slate-500 mt-0.5">درج خودکار مجموعه‌ای جامع از فاکتورهای خرید، فروش، اسناد دوبل تراز شده، هزینه‌ها و حساب‌های تفصیلی جهت تست و اعتبارسنجی سیستم</p>
                    </div>
                </div>

                <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-3">
                    <p className="text-xs text-slate-700 leading-relaxed">
                        این عملیات داده‌های تستی شامل فاکتورهای ارزی عمده (درهم)، خریدهای ترکیبی خرد و کارتنی، فروش‌های رسمی با تخفیف، فروش‌های اعتباری با سررسید، هزینه‌های جاری و اسناد متوازن دوبل را به پایگاه‌داده اضافه می‌کند.
                    </p>
                    <button
                        onClick={handleSeedSampleData}
                        disabled={isExporting}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        درج سناریوهای تستی حسابداری
                    </button>
                </div>
            </div>
        </div>
    );
};
