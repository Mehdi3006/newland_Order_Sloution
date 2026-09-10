import React from 'react';

export type AccountingTab = 'dashboard' | 'vouchers' | 'fxRevaluation' | 'purchases' | 'sales' | 'chartOfAccounts' | 'inventory' | 'dubaiLedger' | 'database';

interface AccountingHeaderProps {
    activeTab: AccountingTab;
    setActiveTab: (tab: AccountingTab) => void;
    voucherCount: number;
    purchaseCount: number;
    salesCount: number;
}

const TAB_DESCRIPTIONS: Record<AccountingTab, { label: string; desc: string }> = {
    dashboard: {
        label: 'داشبورد مالی و تراز',
        desc: 'گزارش سود و زیان، تراز آزمایشی چهارستونی و وضعیت نقدینگی'
    },
    purchases: {
        label: 'فاکتورهای خرید',
        desc: 'ثبت فاکتورهای خرید تجاری، تسویه تامین‌کنندگان و ورود به انبار'
    },
    sales: {
        label: 'فاکتورهای فروش',
        desc: 'صدور فاکتور رسمی فروش، پکینگ‌لیست گمرکی و دریافت از مشتریان'
    },
    vouchers: {
        label: 'اسناد دوبل حسابداری',
        desc: 'سندهای دستی و سیستمی حسابداری دوبل با کنترل تراز بدهکار و بستانکار'
    },
    fxRevaluation: {
        label: 'تسعیر ارز',
        desc: 'محاسبه سود و زیان ناشی از نوسانات نرخ ارز و ثبت سند تسعیر'
    },
    chartOfAccounts: {
        label: 'کدینگ حساب‌ها',
        desc: 'درخت حساب‌های کل، معین و تفصیلی استاندارد بازرگانی'
    },
    inventory: {
        label: 'کارتکس کالا و انبار',
        desc: 'گردش مقداری و ریالی موجودی کالا به تفکیک انبار'
    },
    dubaiLedger: {
        label: 'انبار و دفتر دبی',
        desc: 'مدیریت و تراز مالی انبار ترانزیت و مبادلات دفتر دبی'
    },
    database: {
        label: 'پشتیبان‌گیری و دیتابیس',
        desc: 'خروجی اکسل، پشتیبان کامل اطلاعات و تنظیمات دیتابیس'
    }
};

export const AccountingHeader: React.FC<AccountingHeaderProps> = ({
    activeTab,
    setActiveTab,
    voucherCount,
    purchaseCount,
    salesCount
}) => {
    const currentTabInfo = TAB_DESCRIPTIONS[activeTab] || TAB_DESCRIPTIONS.dashboard;

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs mb-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <span>مدیریت بازرگانی</span>
                        <span>/</span>
                        <span>حسابداری</span>
                        <span>/</span>
                        <span className="text-indigo-600 font-semibold">{currentTabInfo.label}</span>
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                        {currentTabInfo.label}
                    </h1>
                    <p className="text-xs text-slate-500">
                        {currentTabInfo.desc}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Stat Badges */}
                    {activeTab === 'purchases' && (
                        <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium">
                            تعداد فاکتورهای خرید: <span className="font-bold font-mono text-slate-900">{purchaseCount}</span>
                        </div>
                    )}
                    {activeTab === 'sales' && (
                        <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium">
                            تعداد فاکتورهای فروش: <span className="font-bold font-mono text-slate-900">{salesCount}</span>
                        </div>
                    )}
                    {activeTab === 'vouchers' && (
                        <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium">
                            تعداد اسناد دوبل: <span className="font-bold font-mono text-slate-900">{voucherCount}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

