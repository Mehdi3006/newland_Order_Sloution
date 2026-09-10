


import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Order, Status, Task, Project, CostingSettings, DashboardTableDisplaySettings, CalendarTask, CalendarStickyNote, CurrencyRates } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatDisplayDate, formatDisplayTime, getYearMonthKey, stringToDate, dateFromYearMonthKey } from '../utils/dateUtils';
import { getOrderValueInUSD, exportDashboardItemsToExcel, formatToman, persianArabicToEnglish } from '../utils/formatters';
import LoadingOverlay from './LoadingOverlay';
import jalaali from 'jalaali-js';
import { calculateFinalProducts } from '../utils/costCalculator';
import ProcurementTargets from './ProcurementTargets'; // Import the new component

interface DashboardProps {
    orders: Order[];
    statuses: Status[];
    costingSettings: CostingSettings | null;
    onOrderClick: (order: Order) => void;
    onProjectTaskClick: (task: Task) => void;
    onCalendarTaskClick: (item: { date: string }) => void;
    calendarTasks: CalendarTask[];
    calendarStickyNotes: CalendarStickyNote[];
}

const KPI_CARD_STYLES = "bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:border-indigo-200";
const STRATEGIC_KPI_STYLES = "bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 rounded-3xl shadow-xl shadow-indigo-200/50 transition-all hover:scale-[1.02] text-white border-none";
const KPI_TITLE_STYLES_DEFAULT = "text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block";
const KPI_TITLE_STYLES_STRATEGIC = "text-xs font-bold text-indigo-100/80 uppercase tracking-widest mb-3 block";
const KPI_VALUE_STYLES_DEFAULT = "text-3xl font-bold text-slate-900 leading-none tracking-tight";
const KPI_VALUE_STYLES_STRATEGIC = "text-3xl font-bold text-white leading-none tracking-tight";

const KPICard: React.FC<{ title: string; value: string; subValue?: string; variant?: 'default' | 'strategic' }> = ({ title, value, subValue, variant = 'default' }) => (
    <div className={variant === 'strategic' ? STRATEGIC_KPI_STYLES : KPI_CARD_STYLES}>
        <span className={variant === 'strategic' ? KPI_TITLE_STYLES_STRATEGIC : KPI_TITLE_STYLES_DEFAULT}>{title}</span>
        <div className="flex flex-col gap-y-2">
            <div className={variant === 'strategic' ? KPI_VALUE_STYLES_STRATEGIC : KPI_VALUE_STYLES_DEFAULT}>{value}</div>
            {subValue && (
                <div className={`text-xs font-bold font-mono py-1 px-2 rounded-lg w-fit ${variant === 'strategic' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                    {subValue}
                </div>
            )}
        </div>
    </div>
);

type SortKey = 'orderId' | 'supplier' | 'internalCode' | 'description' | 'cartons' | 'qtyPerCarton' | 'totalQty' | 'orderDate' | 'loadingDate' | 'status';

const Dashboard: React.FC<DashboardProps> = ({ orders, statuses, costingSettings, onOrderClick, onProjectTaskClick, onCalendarTaskClick, calendarTasks, calendarStickyNotes }) => {
    const { t, i18n } = useTranslation();
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'loadingDate', direction: 'asc' });
    const [hoveredBalanceIndex, setHoveredBalanceIndex] = useState<number | null>(null);
    const [hoveredPerfIndex, setHoveredPerfIndex] = useState<number | null>(null);

    const displaySettingsData = useLiveQuery(() => db.settings.get('displaySettings'), []);
    const activeProjects = useLiveQuery(() => db.projects.filter(p => !p.deletedAt).toArray(), []);
    
    const currencyRates: CurrencyRates = useMemo(() => {
        if (!costingSettings) return { aed: 0, toman: 0, cny: 0 };
        return {
            aed: costingSettings.fx.usd_aed,
            toman: costingSettings.fx.usd_aed * costingSettings.fx.aed_toman,
            cny: (costingSettings.fx.usd_aed * costingSettings.fx.aed_cny) > 0 ? 1 / (costingSettings.fx.usd_aed * costingSettings.fx.aed_cny) : 0,
        };
    }, [costingSettings]);

    const kpis = useMemo(() => {
        if (!costingSettings) return null;
        const now = new Date();
        const activeOrders = orders.filter(o => !o.isArchived && !o.deletedAt);
        const isFa = i18n.language === 'fa';

        const totalValueUSDActive = activeOrders.reduce((sum, order) => sum + getOrderValueInUSD(order, currencyRates), 0);
        const totalPaymentsUSDActive = activeOrders.reduce((sum, order) => sum + (order.payments || []).reduce((pSum, p) => pSum + p.amountUSD, 0), 0);
        const fxExposureUSD = totalValueUSDActive - totalPaymentsUSDActive;
        const totalActiveVolume = activeOrders.reduce((sum, o) => sum + (Number(o.volumeCBM) || 0), 0);
        const totalActiveCartons = activeOrders.reduce((sum, o) => sum + o.items.reduce((iSum, i) => iSum + Math.ceil(i.quantity / (i.itemsPerCarton || 1)), 0), 0);

        let ltSum = 0, ltCount = 0;
        activeOrders.forEach(o => {
            if (o.orderDate && o.approxLoadingDate) {
                const diff = Math.ceil((new Date(o.approxLoadingDate).getTime() - new Date(o.orderDate).getTime()) / 86400000);
                if (diff > 0) { ltSum += diff; ltCount++; }
            }
        });
        const avgLeadTime = ltCount > 0 ? Math.round(ltSum / ltCount) : 0;

        const suppStats: Record<string, { value: number, cartons: number }> = {};
        activeOrders.forEach(o => {
            const val = getOrderValueInUSD(o, currencyRates);
            const ctns = o.items.reduce((sum, i) => sum + Math.ceil(i.quantity / (i.itemsPerCarton || 1)), 0);
            if (!suppStats[o.supplier]) suppStats[o.supplier] = { value: 0, cartons: 0 };
            suppStats[o.supplier].value += val;
            suppStats[o.supplier].cartons += ctns;
        });
        const sortedSupps = Object.entries(suppStats).sort((a, b) => b[1].value - a[1].value);
        const concentration = totalValueUSDActive > 0 ? Math.round(((sortedSupps[0]?.[1].value || 0) / totalValueUSDActive) * 100) : 0;

        const monthlyPerformance = Array.from({ length: 12 }, (_, i) => ({ name: t(isFa ? `months.jalali.${i + 1}` : `months.gregorian.${i}`), value: 0 }));
        const monthlyBalance = Array.from({ length: 12 }, (_, i) => ({ name: t(isFa ? `months.jalali.${i + 1}` : `months.gregorian.${i}`), value: 0 }));
        
        orders.forEach(order => {
            if (order.deletedAt) return;
            const val = getOrderValueInUSD(order, currencyRates);
            const paid = (order.payments || []).reduce((sum, p) => sum + p.amountUSD, 0);
            const balance = val - paid;

            if (order.isFinalized && order.finalizedAt) {
                const d = new Date(order.finalizedAt);
                const mIdx = isFa ? jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate()).jm - 1 : d.getMonth();
                if (mIdx >= 0 && mIdx < 12) monthlyPerformance[mIdx].value += val;
            }
            if (!order.isArchived && order.approxLoadingDate) {
                const d = stringToDate(order.approxLoadingDate);
                const mIdx = isFa ? jalaali.toJalaali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()).jm - 1 : d.getUTCMonth();
                if (mIdx >= 0 && mIdx < 12) monthlyBalance[mIdx].value += balance;
            }
        });

        const curMonthIdx = isFa ? jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate()).jm - 1 : now.getMonth();
        const nextMonthIdx = (curMonthIdx + 1) % 12;

        return {
            totalValueUSDActive,
            fxExposureUSD,
            avgLeadTime,
            concentration,
            topSupplierName: sortedSupps[0]?.[0] || 'N/A',
            balanceCur: monthlyBalance[curMonthIdx].value,
            balanceNext: monthlyBalance[nextMonthIdx].value,
            finalizedYear: monthlyPerformance.reduce((s, m) => s + m.value, 0),
            totalActiveVolume,
            totalActiveCartons,
            curMonthName: monthlyBalance[curMonthIdx].name,
            nextMonthName: monthlyBalance[nextMonthIdx].name,
            monthlyPerformance,
            monthlyBalance,
            supplierDist: sortedSupps.slice(0, 5),
            // Combining active orders and active projects as "Workflow Intensity"
            workflowIntensity: activeOrders.length + (activeProjects?.length || 0)
        };
    }, [orders, costingSettings, i18n.language, currencyRates, t, activeProjects]);

    const activeItems = useMemo(() => {
        const items: any[] = [];
        orders.filter(o => !o.isArchived && !o.deletedAt).forEach(order => {
            (order.items || []).forEach(item => {
                items.push({ ...item, orderId: order.id, supplier: order.supplier, orderDate: order.orderDate, loadingDate: order.approxLoadingDate, status: order.status, totalQty: item.quantity, cartons: Math.ceil(item.quantity / (item.itemsPerCarton || 1)) });
            });
        });
        return items.sort((a, b) => {
            const valA = a[sortConfig.key] ?? '';
            const valB = b[sortConfig.key] ?? '';
            return sortConfig.direction === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
        });
    }, [orders, sortConfig]);

    if (!kpis) return <LoadingOverlay message={t('views.dashboard.loading')} />;

    const usdFmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
    const tomanFmt = (v: number) => `${formatToman(v * currencyRates.toman, costingSettings)} ${t('common.toman')}`;

    return (
        <div className="p-4 lg:p-8 bg-[#f1f5f9] h-full overflow-y-auto space-y-12" dir={i18n.dir()}>
            <header className="flex justify-between items-end border-b-2 border-slate-300 pb-6">
                <div className="text-right">
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight">{t('views.dashboard.title')}</h1>
                    <p className="text-indigo-600 font-bold text-xs mt-1 uppercase tracking-[0.25em]">{t('views.dashboard.biSubtitle')}</p>
                </div>
            </header>

            {/* --- NEW PROCUREMENT TARGETS SECTION --- */}
            <ProcurementTargets 
                orders={orders} 
                costingSettings={costingSettings} 
                currencyRates={currencyRates} 
            />

            {/* Row 1: Current Operational Status */}
            <section className="space-y-6">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-x-3">
                    <div className="h-1 w-10 bg-indigo-500 rounded-full" /> {t('views.dashboard.currentStatus')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <KPICard title={t('views.dashboard.kpi.totalValueActive')} value={usdFmt(kpis.totalValueUSDActive)} subValue={tomanFmt(kpis.totalValueUSDActive)} />
                    <KPICard title={t('views.dashboard.kpi.balanceDueMonth', { month: kpis.curMonthName })} value={usdFmt(kpis.balanceCur)} subValue={tomanFmt(kpis.balanceCur)} />
                    <KPICard title={t('views.dashboard.kpi.balanceDueMonth', { month: kpis.nextMonthName })} value={usdFmt(kpis.balanceNext)} subValue={tomanFmt(kpis.balanceNext)} />
                    <KPICard title={t('views.dashboard.kpi.finalizedValueThisYear')} value={usdFmt(kpis.finalizedYear)} subValue={tomanFmt(kpis.finalizedYear)} />
                </div>
            </section>

            {/* Row 2: Strategic Insights */}
            <section className="space-y-6">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-x-3">
                    <div className="h-1 w-10 bg-indigo-300 rounded-full" /> {t('views.dashboard.strategicInsights')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <KPICard variant="strategic" title={t('views.dashboard.kpi.fxExposure')} value={usdFmt(kpis.fxExposureUSD)} />
                    <KPICard variant="strategic" title={t('views.dashboard.kpi.avgLeadTime')} value={`${kpis.avgLeadTime} ${t('views.dashboard.kpi.days')}`} />
                    <KPICard variant="strategic" title={t('views.dashboard.kpi.supplierConcentration')} value={`%${kpis.concentration}`} subValue={kpis.topSupplierName} />
                    <KPICard variant="strategic" title={t('views.dashboard.kpi.workflowIntensity')} value={String(kpis.workflowIntensity)} />
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Double Chart Section */}
                <div className="lg:col-span-2 bg-white p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-200 flex flex-col min-h-[750px] space-y-20">
                    
                    {/* Top Chart: Loading Pipeline */}
                    <div className="flex-1 flex flex-col relative">
                        <div className="flex justify-between items-center mb-12">
                            <h3 className="font-bold text-slate-800 uppercase text-sm tracking-wide">{t('views.dashboard.kpi.monthlyBalanceDue')}</h3>
                            <div className="h-24 min-w-[280px] flex justify-end">
                                {hoveredBalanceIndex !== null && kpis.monthlyBalance[hoveredBalanceIndex].value > 0 && (
                                    <div className="animate-in fade-in zoom-in duration-300 bg-slate-900 text-white px-6 py-3 rounded-2xl flex flex-col items-end shadow-2xl border-2 border-slate-700">
                                        <span className="font-mono text-3xl font-bold">{usdFmt(kpis.monthlyBalance[hoveredBalanceIndex].value)}</span>
                                        <span className="font-bold text-sm text-slate-400 mt-1 uppercase tracking-wider">{tomanFmt(kpis.monthlyBalance[hoveredBalanceIndex].value)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 flex items-end justify-between gap-x-2 px-4 border-b-2 border-slate-100 pb-1">
                            {kpis.monthlyBalance.map((m, i) => {
                                const h = (m.value / Math.max(...kpis.monthlyBalance.map(x => x.value), 1)) * 100;
                                return (
                                    <div key={i} className="flex-1 h-full flex flex-col justify-end group cursor-pointer" onMouseEnter={() => setHoveredBalanceIndex(i)} onMouseLeave={() => setHoveredBalanceIndex(null)}>
                                        <div className={`w-full rounded-t-xl transition-all duration-500 ease-out ${hoveredBalanceIndex === i ? 'bg-indigo-50' : 'bg-slate-400'}`} style={{ height: `${h}%` }} />
                                        <p className={`mt-4 text-[10px] font-bold uppercase text-center transition-colors ${hoveredBalanceIndex === i ? 'text-indigo-600' : 'text-slate-400'}`}>{m.name.substring(0, 3)}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="h-px bg-slate-200 w-full" />

                    {/* Bottom Chart: Financial Performance */}
                    <div className="flex-1 flex flex-col relative">
                        <div className="flex justify-between items-center mb-12">
                            <h3 className="font-bold text-slate-800 uppercase text-sm tracking-wide">{t('views.dashboard.kpi.finalizedOrdersByMonth')}</h3>
                            <div className="h-24 min-w-[280px] flex justify-end">
                                {hoveredPerfIndex !== null && kpis.monthlyPerformance[hoveredPerfIndex].value > 0 && (
                                    <div className="animate-in fade-in zoom-in duration-300 bg-indigo-600 text-white px-6 py-3 rounded-2xl flex flex-col items-end shadow-2xl border-2 border-indigo-400">
                                        <span className="font-mono text-3xl font-bold">{usdFmt(kpis.monthlyPerformance[hoveredPerfIndex].value)}</span>
                                        <span className="font-bold text-sm text-indigo-100 mt-1 uppercase tracking-wider">{tomanFmt(kpis.monthlyPerformance[hoveredPerfIndex].value)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 flex items-end justify-between gap-x-2 px-4 border-b-2 border-slate-100 pb-1">
                            {kpis.monthlyPerformance.map((m, i) => {
                                const h = (m.value / Math.max(...kpis.monthlyPerformance.map(x => x.value), 1)) * 100;
                                return (
                                    <div key={i} className="flex-1 h-full flex flex-col justify-end group cursor-pointer" onMouseEnter={() => setHoveredPerfIndex(i)} onMouseLeave={() => setHoveredPerfIndex(null)}>
                                        <div className={`w-full rounded-t-xl transition-all duration-500 ease-out ${hoveredPerfIndex === i ? 'bg-indigo-600' : 'bg-indigo-400/70'}`} style={{ height: `${h}%` }} />
                                        <p className={`mt-4 text-[10px] font-bold uppercase text-center transition-colors ${hoveredPerfIndex === i ? 'text-indigo-600' : 'text-slate-400'}`}>{m.name.substring(0, 3)}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="flex flex-col gap-y-10 h-full">
                    {/* Supplier Distribution */}
                    <div className="bg-white p-8 rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-200 flex-1 flex flex-col min-h-[460px]">
                        <h3 className="font-bold text-slate-800 text-lg text-center mb-10 tracking-wide uppercase">{t('views.dashboard.supplierSpend')}</h3>
                        <div className="space-y-6 flex-1">
                            {kpis.supplierDist.map(([name, stat], idx) => {
                                const perc = kpis.totalValueUSDActive > 0 ? Math.round((stat.value / kpis.totalValueUSDActive) * 100) : 0;
                                const ctnRatio = kpis.totalActiveCartons > 0 ? Math.round((stat.cartons / kpis.totalActiveCartons) * 100) : 0;
                                return (
                                    <div key={idx} className="flex items-center gap-x-6">
                                        <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
                                            <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                                                <circle cx="32" cy="32" r="28" fill="transparent" stroke="#f1f5f9" strokeWidth="6" />
                                                <circle cx="32" cy="32" r="28" fill="transparent" stroke="#4f46e5" strokeWidth="6" strokeDasharray={175.9} strokeDashoffset={175.9 - (perc / 100) * 175.9} strokeLinecap="round" />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-sm font-black text-slate-900">{perc}%</span>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-baseline mb-2">
                                                <h4 className="text-sm font-bold text-slate-800 truncate">{name}</h4>
                                                <span className="text-lg font-bold text-indigo-600 font-mono">${Math.round(stat.value/1000)}k</span>
                                            </div>
                                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                                                <div className="bg-slate-400 h-full rounded-full transition-all duration-1000" style={{ width: `${ctnRatio}%` }} />
                                            </div>
                                            <p className="text-[18px] font-bold text-slate-500 mt-1.5 uppercase tracking-tight">{stat.cartons} Cartons ({ctnRatio}% of pipeline)</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Logistic Capacity Analysis */}
                    <div className="bg-slate-900 p-8 rounded-[3.5rem] shadow-2xl text-white flex flex-col justify-between h-[320px] border-4 border-indigo-500/20 overflow-hidden">
                        <div>
                            <div className="flex items-center gap-x-4 mb-4">
                                <div className="p-3 bg-indigo-500 rounded-2xl shadow-xl shadow-indigo-500/30">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                </div>
                                <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-400">{t('views.dashboard.kpi.logisticCapacity')}</h3>
                            </div>
                            <p className="text-xs text-slate-400 font-bold leading-relaxed">{t('views.dashboard.kpi.logisticCapacityDesc')}</p>
                        </div>
                        <div className="flex items-baseline gap-x-6 justify-end">
                            <div className="flex items-baseline gap-x-2">
                                <span className="text-2xl lg:text-3xl font-black tracking-tighter text-white">{kpis.totalActiveVolume.toFixed(1)}</span>
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{t('views.dashboard.kpi.cbmActive')}</span>
                            </div>
                            <div className="flex items-baseline gap-x-2">
                                <span className="text-2xl lg:text-3xl font-black tracking-tighter text-white">{kpis.totalActiveCartons.toLocaleString()}</span>
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{t('common.cartons')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <section className="bg-white rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-xl font-bold text-slate-800 uppercase tracking-tight">{t('views.dashboard.allActiveItems')}</h3>
                    <button onClick={() => exportDashboardItemsToExcel(activeItems, t)} className="px-6 py-3 bg-slate-900 hover:bg-black text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-3 shadow-lg tracking-widest uppercase active:scale-95">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        {t('views.dashboard.exportReport')}
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right">
                        <thead className="bg-slate-900 text-slate-200 font-bold uppercase tracking-widest border-b border-slate-800">
                            <tr>{['orderId', 'supplier', 'internalCode', 'description', 'cartons', 'qtyPerCarton', 'totalQty', 'orderDate', 'loadingDate', 'status'].map(k => <th key={k} className="p-5">{t(`views.dashboard.table.${k}`)}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                            {activeItems.map((item, idx) => (
                                <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                                    <td className="p-5 font-mono text-indigo-600">{item.orderId}</td>
                                    <td className="p-5">{item.supplier}</td>
                                    <td className="p-5 font-mono text-slate-500">{item.internalCode}</td>
                                    <td className="p-5 text-slate-900">{item.productName}</td>
                                    <td className="p-5 text-center font-mono">{item.cartons}</td>
                                    <td className="p-5 text-center font-mono">{item.itemsPerCarton}</td>
                                    <td className="p-5 text-center font-mono text-indigo-900">{item.quantity}</td>
                                    <td className="p-5 font-mono text-slate-500">{formatDisplayDate(item.orderDate, i18n.language)}</td>
                                    <td className="p-5 font-mono text-slate-500">{formatDisplayDate(item.loadingDate, i18n.language)}</td>
                                    <td className="p-5">
                                        <div className="flex justify-end">
                                            <span className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[9px] uppercase font-black whitespace-nowrap border border-indigo-100">
                                                {t(`statuses.${item.status}`, { defaultValue: item.status })}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default Dashboard;
