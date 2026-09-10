


import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccountingTab } from './accounting/AccountingHeader';

type View = 'dashboard' | 'ordersView' | 'settings' | 'projectsHub' | 'projectWorkspace' | 'products' | 'recycleBin' | 'customsBook' | 'calendar' | 'accounting';

interface SidebarProps {
    currentView: View;
    setView: (view: View) => void;
    activeAccountingTab?: AccountingTab;
    setActiveAccountingTab?: (tab: AccountingTab) => void;
    isOpen: boolean;
    position: 'left' | 'right';
    toggleSidebar: () => void;
    toggleSidebarPosition: () => void;
}

const accountingSubTabs: Array<{ id: AccountingTab; label: string; code?: string }> = [
    { id: 'dashboard', label: 'داشبورد مالی و تراز' },
    { id: 'purchases', label: 'فاکتورهای خرید' },
    { id: 'sales', label: 'فاکتورهای فروش' },
    { id: 'vouchers', label: 'اسناد دوبل حسابداری' },
    { id: 'fxRevaluation', label: 'تسعیر ارز' },
    { id: 'chartOfAccounts', label: 'کدینگ حساب‌ها' },
    { id: 'inventory', label: 'کارتکس کالا و انبار' },
    { id: 'dubaiLedger', label: 'انبار و دفتر دبی' },
    { id: 'database', label: 'پشتیبان‌گیری و دیتابیس' },
];

const Sidebar: React.FC<SidebarProps> = ({
    currentView,
    setView,
    activeAccountingTab = 'dashboard',
    setActiveAccountingTab,
    isOpen,
    position,
    toggleSidebar,
    toggleSidebarPosition
}) => {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.dir() === 'rtl';
    const [isAccountingOpen, setIsAccountingOpen] = useState(true);

    const navItems = [
        { id: 'dashboard', label: t('sidebar.dashboard'), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6m-6-10H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z" /></svg> },
        { id: 'accounting', label: t('sidebar.accounting') || 'حسابداری و ERP', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg> },
        { id: 'ordersView', label: t('sidebar.orders'), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg> },
        { id: 'calendar', label: t('sidebar.calendar'), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
        { id: 'products', label: t('sidebar.products'), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
        { id: 'projectsHub', label: t('sidebar.projects'), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> },
        { id: 'customsBook', label: t('sidebar.customsBook'), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> },
    ];
    
    const settingsItem = { id: 'settings', label: t('sidebar.settings'), icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066 2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> };

    // Use physical properties for positioning and borders
    const positionClasses = position === 'left' 
        ? 'left-0 border-r' 
        : 'right-0 border-l';
        
    const widthClass = isOpen ? 'w-64' : 'w-20';

    // Determine flex direction to keep icon on the outside edge of the screen,
    // which depends on both sidebar position and document direction (LTR/RTL).
    let navItemClasses = 'flex-row'; // Default for LTR-left and RTL-right
    if ((isRtl && position === 'left') || (!isRtl && position === 'right')) {
        navItemClasses = 'flex-row-reverse';
    }

    return (
        <aside className={`fixed top-0 z-40 h-screen bg-slate-800 text-white flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out ${positionClasses} ${widthClass} border-slate-700`}>
             <div className={`py-5 flex items-center border-b border-slate-700 flex-shrink-0 transition-all duration-300 ${isOpen ? 'px-4' : 'px-2 justify-center'}`}>
                <div className={`flex items-center ${isOpen ? 'w-full' : ''}`}>
                    <div className="flex flex-col gap-y-1">
                        <button
                            onClick={toggleSidebar}
                            title={t('header.toggleSidebar')}
                            className="p-2 rounded-full text-slate-300 hover:bg-slate-700"
                        >
                            {isOpen ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            ) : (
                                position === 'left' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                )
                            )}
                        </button>
                        <button
                            onClick={toggleSidebarPosition}
                            title={t('header.toggleSidebarPosition')}
                            className="p-2 rounded-full text-slate-300 hover:bg-slate-700"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h18m-7.5-12L21 9m0 0l-7.5 7.5M21 9H3" />
                            </svg>
                        </button>
                    </div>
                    <div className={`text-center flex-1 transition-all duration-300 overflow-hidden ${isOpen ? 'opacity-100 scale-100 ms-3' : 'opacity-0 scale-0 w-0'}`}>
                        <h1 className="text-3xl font-bold whitespace-nowrap">NEW LAND</h1>
                        <p className="text-xs text-slate-300 tracking-widest uppercase mt-1 whitespace-nowrap">Order Solution</p>
                    </div>
                </div>
            </div>
            <nav className="flex-1 px-2 py-6 overflow-y-auto">
                <ul className="space-y-1.5">
                    {navItems.map(item => {
                        const isMainActive = currentView === item.id || (currentView === 'projectWorkspace' && item.id === 'projectsHub');
                        const isAccounting = item.id === 'accounting';

                        return (
                            <li key={item.id} className="space-y-1">
                                <a
                                    href="#"
                                    title={!isOpen ? item.label : ''}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (isAccounting) {
                                            setView('accounting');
                                            if (currentView === 'accounting') {
                                                setIsAccountingOpen(prev => !prev);
                                            } else {
                                                setIsAccountingOpen(true);
                                            }
                                        } else {
                                            setView(item.id as View);
                                        }
                                    }}
                                    className={`flex items-center gap-x-3 p-3 rounded-xl font-semibold transition-all duration-150 
                                    ${isMainActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-700/80 hover:text-white'}
                                    ${isOpen ? 'justify-start ' + navItemClasses : 'justify-center'}`}
                                >
                                    {item.icon}
                                    <div className={`overflow-hidden transition-all duration-200 flex items-center justify-between ${isOpen ? 'w-full opacity-100' : 'w-0 opacity-0'}`}>
                                        <span className="whitespace-nowrap">{item.label}</span>
                                        {isAccounting && (
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isAccountingOpen ? 'rotate-180' : ''}`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        )}
                                    </div>
                                </a>

                                {/* Accounting Sub-Tabs */}
                                {isAccounting && isOpen && isAccountingOpen && (
                                    <div className="pt-1 pb-1 space-y-0.5 ps-5 pe-1 border-s border-slate-700/80 ms-5 me-1 animate-in fade-in duration-150">
                                        {accountingSubTabs.map(sub => {
                                            const isSubActive = currentView === 'accounting' && activeAccountingTab === sub.id;
                                            return (
                                                <button
                                                    key={sub.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setView('accounting');
                                                        if (setActiveAccountingTab) {
                                                            setActiveAccountingTab(sub.id);
                                                        }
                                                    }}
                                                    className={`w-full text-right px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center justify-between ${
                                                        isSubActive
                                                            ? 'bg-slate-700/90 text-indigo-300 font-bold border border-slate-600/60 shadow-2xs'
                                                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/40'
                                                    }`}
                                                >
                                                    <span className="truncate">{sub.label}</span>
                                                    {isSubActive && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 ms-1.5"></span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </nav>
            <div className="px-2 mt-auto mb-2 pt-4 border-t border-slate-700">
                 <a
                    href="#"
                    title={!isOpen ? settingsItem.label : ''}
                    onClick={(e) => { e.preventDefault(); setView(settingsItem.id as View); }}
                    className={`flex items-center gap-x-3 p-3 rounded-lg font-semibold transition-colors duration-200 
                    ${currentView === settingsItem.id ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}
                    ${isOpen ? 'justify-start ' + navItemClasses : 'justify-center'}`}
                >
                    {settingsItem.icon}
                    <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'w-full opacity-100' : 'w-0 opacity-0'}`}>
                        <span className="whitespace-nowrap">{settingsItem.label}</span>
                    </div>
                </a>
            </div>
            <div className="px-2 pb-4">
                 <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setView('recycleBin' as View); }}
                    title={!isOpen ? t('sidebar.recycleBin') as string : ''}
                    className={`flex items-center gap-x-3 p-3 rounded-lg font-semibold transition-colors duration-200 ${currentView === 'recycleBin' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}
                    ${isOpen ? 'justify-start ' + navItemClasses : 'justify-center'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                     <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'w-full opacity-100' : 'w-0 opacity-0'}`}>
                        <span className="whitespace-nowrap">{t('sidebar.recycleBin')}</span>
                    </div>
                </a>
            </div>
        </aside>
    );
};

export default Sidebar;