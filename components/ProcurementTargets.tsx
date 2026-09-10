
import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Order, PurchaseTargetSettings, CurrencyRates, CostingSettings } from '../types';
import { getOrderValueInUSD } from '../utils/formatters';
import NumericInput from './NumericInput';
import jalaali from 'jalaali-js';

type TimeScope = 'currentYear' | 'currentQuarter' | 'currentMonth' | 'last90Days' | 'last180Days' | 'last360Days' | 'allTime';

const KPICard: React.FC<{
    title: string;
    value: string | number;
    subValue?: React.ReactNode;
    trend?: { value: number; label: string; isPositive: boolean };
    colorClass: string;
    icon: React.ReactNode;
    progress?: number;
}> = ({ title, value, subValue, trend, colorClass, icon, progress }) => (
    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-full transition-all hover:shadow-md hover:border-slate-200">
        <div className="flex justify-between items-start mb-2">
            <div className={`p-2 rounded-xl ${colorClass.replace('text-', 'bg-').replace('600', '50')}`}>
                <div className={colorClass}>{icon}</div>
            </div>
            {trend && (
                <div className={`text-xs font-bold px-2 py-1 rounded-full ${trend.isPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
                </div>
            )}
        </div>
        <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{title}</h4>
            <div className="text-2xl font-bold text-slate-800 tracking-tight">{value}</div>
            {subValue && <div className="text-xs font-medium text-slate-400 mt-1">{subValue}</div>}
            {typeof progress === 'number' && (
                <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                        className={`h-full rounded-full transition-all duration-500 ${colorClass.replace('text-', 'bg-')}`} 
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} 
                    />
                </div>
            )}
        </div>
    </div>
);

const ProgressBar: React.FC<{ percentage: number; label: string; valueLabel: string; colorClass: string }> = ({ percentage, label, valueLabel, colorClass }) => (
    <div className="mb-4">
        <div className="flex justify-between items-end mb-1">
            <span className="text-xs font-bold text-slate-600">{label}</span>
            <span className="text-xs font-bold text-slate-800">{valueLabel} <span className="text-slate-400">({percentage.toFixed(1)}%)</span></span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ease-out ${colorClass}`} style={{ width: `${Math.min(100, percentage)}%` }}></div>
        </div>
    </div>
);

interface ProcurementTargetsProps {
    orders: Order[];
    costingSettings: CostingSettings | null;
    currencyRates: CurrencyRates;
}

const ProcurementTargets: React.FC<ProcurementTargetsProps> = ({ orders = [], costingSettings, currencyRates }) => {
    const { t, i18n } = useTranslation();
    const [timeScope, setTimeScope] = useState<TimeScope>('currentYear');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    // Default targets if DB is empty (fallback)
    const [localTargets, setLocalTargets] = useState<PurchaseTargetSettings>({
        annualUnitTarget: 100000,
        annualValueTargetUSD: 5000000
    });

    const settingsRecord = useLiveQuery(() => db.settings.get('purchaseTargetSettings'));

    useEffect(() => {
        if (settingsRecord?.value) {
            setLocalTargets(settingsRecord.value as PurchaseTargetSettings);
        }
    }, [settingsRecord]);

    const handleSaveTargets = async () => {
        await db.settings.put({ key: 'purchaseTargetSettings', value: localTargets });
        setIsSettingsOpen(false);
    };

    const periodData = useMemo(() => {
        const now = new Date();
        const nowUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        
        let startTimestamp = 0;
        let endTimestamp = 0;
        
        // Target scaling factor (multiplier against annual target)
        let targetMultiplier = 1; 

        const isJalali = i18n.language.startsWith('fa');
        
        // --- 1. Rolling Days Logic ---
        if (timeScope === 'last90Days' || timeScope === 'last180Days' || timeScope === 'last360Days') {
            const days = timeScope === 'last90Days' ? 90 : timeScope === 'last180Days' ? 180 : 360;
            
            // End: Today at 23:59:59.999 UTC
            endTimestamp = new Date(nowUTC).setUTCHours(23, 59, 59, 999);
            
            // Start: Today minus N days at 00:00:00.000 UTC
            const start = new Date(nowUTC);
            start.setUTCDate(start.getUTCDate() - days);
            start.setUTCHours(0, 0, 0, 0);
            startTimestamp = start.getTime();

            // Target is proportional to days
            targetMultiplier = days / 365;

        } 
        // --- 2. All Time Logic ---
        else if (timeScope === 'allTime') {
            // End: Today
            endTimestamp = new Date(nowUTC).setUTCHours(23, 59, 59, 999);
            
            // Start: Finding the earliest order date
            const timestamps = orders
                .map(o => {
                    const dateStr = o.orderDate.split('T')[0];
                    const [y, m, d] = dateStr.split('-').map(Number);
                    return Date.UTC(y, m - 1, d);
                })
                .filter(t => !isNaN(t));

            if (timestamps.length > 0) {
                startTimestamp = Math.min(...timestamps);
            } else {
                // Fallback to start of current year if no data
                startTimestamp = Date.UTC(now.getFullYear(), 0, 1);
            }
            
            // Disable target for All Time (handled in UI)
            targetMultiplier = 0; 
        } 
        // --- 3. Calendar-Based Logic ---
        else if (isJalali) {
            // Jalali Calendar
            const { jy, jm } = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
            let jStartMonth = 1;
            let jEndMonth = 12;

            if (timeScope === 'currentMonth') {
                targetMultiplier = 1 / 12;
                jStartMonth = jm;
                jEndMonth = jm;
            } else if (timeScope === 'currentQuarter') {
                targetMultiplier = 1 / 4;
                // Jalali Q1: 1-3, Q2: 4-6, Q3: 7-9, Q4: 10-12
                const qIndex = Math.floor((jm - 1) / 3);
                jStartMonth = (qIndex * 3) + 1;
                jEndMonth = jStartMonth + 2;
            } else { 
                // Current Year
                targetMultiplier = 1;
                jStartMonth = 1;
                jEndMonth = 12;
            }

            const jStartDay = 1;
            const jEndDay = jalaali.jalaaliMonthLength(jy, jEndMonth);

            const gStart = jalaali.toGregorian(jy, jStartMonth, jStartDay);
            const gEnd = jalaali.toGregorian(jy, jEndMonth, jEndDay);
            
            startTimestamp = Date.UTC(gStart.gy, gStart.gm - 1, gStart.gd, 0, 0, 0, 0);
            endTimestamp = Date.UTC(gEnd.gy, gEnd.gm - 1, gEnd.gd, 23, 59, 59, 999);

        } else {
            // Gregorian Calendar
            const year = now.getFullYear();
            const month = now.getMonth();

            if (timeScope === 'currentMonth') {
                targetMultiplier = 1 / 12;
                startTimestamp = Date.UTC(year, month, 1, 0, 0, 0, 0);
                endTimestamp = Date.UTC(year, month + 1, 0, 23, 59, 59, 999);
            } else if (timeScope === 'currentQuarter') {
                targetMultiplier = 1 / 4;
                const quarter = Math.floor(month / 3);
                startTimestamp = Date.UTC(year, quarter * 3, 1, 0, 0, 0, 0);
                endTimestamp = Date.UTC(year, (quarter + 1) * 3, 0, 23, 59, 59, 999);
            } else {
                // Current Year
                targetMultiplier = 1;
                startTimestamp = Date.UTC(year, 0, 1, 0, 0, 0, 0);
                endTimestamp = Date.UTC(year, 11, 31, 23, 59, 59, 999);
            }
        }

        // --- Target Calculations ---
        const targetUnits = targetMultiplier > 0 ? Math.round(localTargets.annualUnitTarget * targetMultiplier) : 0;
        const targetValue = targetMultiplier > 0 ? Math.round(localTargets.annualValueTargetUSD * targetMultiplier) : 0;

        // --- Procurement Status Groups ---
        const productionStatuses = new Set(['Production (Order Process)', 'Packaging Approved', 'PSI', 'PSI (Inspection)']);
        const transitStatuses = new Set(['Booking', 'On Board', 'In Transit', 'Arrival', 'Customs']);
        const finalizedStatuses = new Set(['PI Issued', 'Deposit Paid', 'Delivered', 'Invoiced', 'Final (System)']);
        
        const committedOrders = orders.filter(o => {
            if (o.deletedAt) return false;
            if (!o.orderDate) return false;
            
            // Normalize date comparison by constructing UTC date from string parts.
            const dateStr = o.orderDate.split('T')[0];
            const [y, m, d_part] = dateStr.split('-').map(Number);
            
            // Create a timestamp for Noon UTC on that day to stay safely within the day boundaries
            const orderTimestamp = Date.UTC(y, m - 1, d_part, 12, 0, 0, 0);
            
            const inPeriod = orderTimestamp >= startTimestamp && orderTimestamp <= endTimestamp;
            
            const isCommittedStatus = 
                o.isFinalized || 
                productionStatuses.has(o.status) || 
                transitStatuses.has(o.status) || 
                finalizedStatuses.has(o.status);
                
            return inPeriod && isCommittedStatus;
        });

        const committedUnits = committedOrders.reduce((sum, o) => {
             const orderUnits = o.items.reduce((s, i) => s + i.quantity, 0);
             return sum + orderUnits;
        }, 0);
        
        const committedValue = committedOrders.reduce((sum, o) => sum + getOrderValueInUSD(o, currencyRates), 0);

        // Breakdown Stats
        const finalizedStats = { count: 0, units: 0, value: 0 };
        const productionStats = { count: 0, units: 0, value: 0 };
        const transitStats = { count: 0, units: 0, value: 0 };

        committedOrders.forEach(o => {
            const units = o.items.reduce((s, i) => s + i.quantity, 0);
            const val = getOrderValueInUSD(o, currencyRates);
            
            if (productionStatuses.has(o.status)) {
                productionStats.count++; productionStats.units += units; productionStats.value += val;
            } else if (transitStatuses.has(o.status)) {
                transitStats.count++; transitStats.units += units; transitStats.value += val;
            } else {
                finalizedStats.count++; finalizedStats.units += units; finalizedStats.value += val;
            }
        });

        // Forecast Logic
        let progressTime = 0;
        
        if (timeScope === 'allTime') {
             progressTime = 1; // All Time is always 100% elapsed
        } else {
             const totalDuration = endTimestamp - startTimestamp;
             const elapsedDuration = Math.max(0, Math.min(nowUTC.getTime() - startTimestamp, totalDuration));
             progressTime = totalDuration > 0 ? elapsedDuration / totalDuration : 0;
        }

        const achievementUnit = targetUnits > 0 ? committedUnits / targetUnits : 0;
        const achievementValue = targetValue > 0 ? committedValue / targetValue : 0;
        
        // Basic Forecast: Current Pacing
        const forecastValue = progressTime > 0 ? committedValue / progressTime : 0;
        const isOnTrack = achievementValue >= (progressTime * 0.9); // 10% tolerance

        return {
            targetUnits,
            targetValue,
            committedUnits,
            committedValue,
            breakdown: { finalized: finalizedStats, production: productionStats, transit: transitStats },
            achievementUnit,
            achievementValue,
            forecastValue,
            isOnTrack,
            progressTime,
            orderCount: committedOrders.length
        };
    }, [orders, timeScope, localTargets, currencyRates, i18n.language]);

    const getProgressColor = (achieved: number, expected: number) => {
        if (achieved >= expected) return 'bg-emerald-500';
        if (achieved >= expected * 0.8) return 'bg-amber-400';
        return 'bg-red-500';
    };

    const isRtl = i18n.dir(i18n.language) === 'rtl';
    const activeCount = periodData.breakdown.production.count + periodData.breakdown.transit.count;
    const finalizedCount = periodData.breakdown.finalized.count;

    return (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 mb-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <span className="text-2xl">🎯</span> {t('procurement.title')}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">{t('procurement.subtitle')}</p>
                </div>
                <div className="flex items-center gap-x-2 bg-slate-100 p-1 rounded-xl flex-wrap">
                    {(['currentYear', 'currentQuarter', 'currentMonth', 'last90Days', 'last180Days', 'last360Days', 'allTime'] as const).map(scope => (
                        <button
                            key={scope}
                            onClick={() => setTimeScope(scope)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all uppercase tracking-wide ${timeScope === scope ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {t(`procurement.periods.${scope}`)}
                        </button>
                    ))}
                    <div className="w-px h-6 bg-slate-300 mx-1 hidden sm:block"></div>
                    <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-all" title={t('procurement.settings.title') as string}>
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <KPICard 
                    title={t('procurement.kpi.valueTarget')}
                    value={`$${(periodData.committedValue / 1000).toFixed(1)}k`} 
                    subValue={periodData.targetValue > 0 ? `${t('procurement.kpi.goal')}: $${(periodData.targetValue / 1000).toFixed(1)}k` : "—"}
                    colorClass="text-emerald-600"
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    progress={periodData.targetValue > 0 ? periodData.achievementValue * 100 : undefined}
                />
                <KPICard 
                    title={t('procurement.kpi.unitTarget')}
                    value={periodData.committedUnits.toLocaleString()} 
                    subValue={periodData.targetUnits > 0 ? `${t('procurement.kpi.goal')}: ${periodData.targetUnits.toLocaleString()}` : "—"}
                    colorClass="text-blue-600"
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                    progress={periodData.targetUnits > 0 ? periodData.achievementUnit * 100 : undefined}
                />
                <KPICard 
                    title={t('procurement.kpi.committedOrders')}
                    value={periodData.orderCount} 
                    subValue={
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mt-1">
                            <span className="font-mono">{activeCount}</span> <span>{t('procurement.kpi.active')}</span>
                            <span className="text-slate-300 mx-1">|</span>
                            <span className="font-mono">{finalizedCount}</span> <span>{t('procurement.kpi.finalized')}</span>
                        </div>
                    }
                    colorClass="text-indigo-600"
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
                />
                <div className={`p-5 rounded-2xl border flex flex-col justify-between h-full transition-all ${periodData.isOnTrack ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex justify-between items-start">
                        <h4 className={`text-xs font-bold uppercase tracking-wider mb-1 ${periodData.isOnTrack ? 'text-green-700' : 'text-amber-700'}`}>{t('procurement.kpi.forecast')}</h4>
                        <span className="text-xl">{periodData.isOnTrack ? '🚀' : '⚠️'}</span>
                    </div>
                    <div>
                        <div className={`text-lg font-bold tracking-tight mb-1 ${periodData.isOnTrack ? 'text-green-800' : 'text-amber-800'}`}>
                            {periodData.isOnTrack ? t('procurement.kpi.onTrack') : t('procurement.kpi.behindSchedule')}
                        </div>
                        {periodData.targetValue > 0 && (
                            <div className={`text-xs font-medium opacity-80 ${periodData.isOnTrack ? 'text-green-700' : 'text-amber-700'}`}>
                                {t('procurement.kpi.projected')}: ${Math.round(periodData.forecastValue/1000).toLocaleString()}k
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Progress Charts */}
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">{t('procurement.progress.title')}</h3>
                    
                    {periodData.targetValue > 0 ? (
                        <>
                            <ProgressBar 
                                percentage={periodData.achievementValue * 100} 
                                label={t('procurement.progress.purchaseValue')} 
                                valueLabel={`$${(periodData.committedValue/1000).toFixed(0)}k / $${(periodData.targetValue/1000).toFixed(0)}k`} 
                                colorClass={getProgressColor(periodData.achievementValue, periodData.progressTime)}
                            />
                            <ProgressBar 
                                percentage={periodData.achievementUnit * 100} 
                                label={t('procurement.progress.unitQuantity')}
                                valueLabel={`${(periodData.committedUnits/1000).toFixed(1)}k / ${(periodData.targetUnits/1000).toFixed(1)}k`} 
                                colorClass={getProgressColor(periodData.achievementUnit, periodData.progressTime)}
                            />
                        </>
                    ) : (
                        <div className="text-center py-8 text-slate-400 text-sm font-medium">
                            {t('procurement.kpi.goal')} —
                        </div>
                    )}
                    
                    {/* Time Elapsed Marker (Hide for All Time) */}
                    {timeScope !== 'allTime' && (
                        <div className="relative mt-6 pt-2 border-t border-slate-200">
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                                <span>{t('procurement.progress.start')}</span>
                                <span>{t('procurement.progress.end')}</span>
                            </div>
                            <div className="absolute top-0 w-full h-1">
                                <div 
                                    className="absolute top-0 w-0.5 h-3 bg-slate-400" 
                                    style={{ 
                                        left: isRtl ? 'auto' : `${periodData.progressTime * 100}%`,
                                        right: isRtl ? `${periodData.progressTime * 100}%` : 'auto',
                                        transform: 'translateY(-50%)' 
                                    }}
                                ></div>
                                <div 
                                    className="absolute -top-4 text-[10px] font-bold text-slate-500 whitespace-nowrap" 
                                    style={{ 
                                        left: isRtl ? 'auto' : `${periodData.progressTime * 100}%`,
                                        right: isRtl ? `${periodData.progressTime * 100}%` : 'auto',
                                        transform: isRtl ? 'translateX(50%)' : 'translateX(-50%)' 
                                    }}
                                >
                                    {t('procurement.progress.today')} ({Math.round(periodData.progressTime * 100)}%)
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Breakdown Chart */}
                <div className="flex flex-col">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">{t('procurement.breakdown.title')}</h3>
                    <div className="flex-1 flex flex-col justify-center">
                        {/* Stacked Bar */}
                        <div className="w-full h-8 rounded-full flex overflow-hidden shadow-sm mb-4">
                            {periodData.committedValue > 0 ? (
                                <>
                                    <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${(periodData.breakdown.finalized.value / periodData.committedValue) * 100}%` }} title={t('procurement.breakdown.finalized')}></div>
                                    <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${(periodData.breakdown.production.value / periodData.committedValue) * 100}%` }} title={t('procurement.breakdown.production')}></div>
                                    <div className="bg-sky-500 h-full transition-all duration-500" style={{ width: `${(periodData.breakdown.transit.value / periodData.committedValue) * 100}%` }} title={t('procurement.breakdown.transit')}></div>
                                </>
                            ) : (
                                <div className="w-full h-full bg-slate-200 flex items-center justify-center text-xs text-slate-400 font-medium">No Data</div>
                            )}
                        </div>
                        
                        {/* Legend / Stats Grid */}
                        <div className="grid grid-cols-3 gap-2">
                             <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                                 <div className="flex items-center gap-1.5 mb-1">
                                     <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                     <span className="text-[10px] font-bold text-emerald-800 uppercase">{t('procurement.breakdown.finalized')}</span>
                                 </div>
                                 <div className="text-lg font-bold text-slate-800">${(periodData.breakdown.finalized.value/1000).toFixed(0)}k</div>
                                 <div className="text-xs text-slate-500">{periodData.breakdown.finalized.count} {t('common.orders')}</div>
                             </div>
                             <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                                 <div className="flex items-center gap-1.5 mb-1">
                                     <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                     <span className="text-[10px] font-bold text-indigo-800 uppercase">{t('procurement.breakdown.production')}</span>
                                 </div>
                                 <div className="text-lg font-bold text-slate-800">${(periodData.breakdown.production.value/1000).toFixed(0)}k</div>
                                 <div className="text-xs text-slate-500">{periodData.breakdown.production.count} {t('common.orders')}</div>
                             </div>
                             <div className="p-3 rounded-lg bg-sky-50 border border-sky-100">
                                 <div className="flex items-center gap-1.5 mb-1">
                                     <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                                     <span className="text-[10px] font-bold text-sky-800 uppercase">{t('procurement.breakdown.transit')}</span>
                                 </div>
                                 <div className="text-lg font-bold text-slate-800">${(periodData.breakdown.transit.value/1000).toFixed(0)}k</div>
                                 <div className="text-xs text-slate-500">{periodData.breakdown.transit.count} {t('common.orders')}</div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">{t('procurement.settings.title')}</h3>
                            <div className="space-y-4">
                                <NumericInput 
                                    label={t('procurement.settings.annualValue')}
                                    value={localTargets.annualValueTargetUSD} 
                                    onChange={v => setLocalTargets(p => ({...p, annualValueTargetUSD: v}))}
                                />
                                <NumericInput 
                                    label={t('procurement.settings.annualUnit')}
                                    value={localTargets.annualUnitTarget} 
                                    onChange={v => setLocalTargets(p => ({...p, annualUnitTarget: v}))}
                                />
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 flex justify-end gap-2 border-t border-slate-100">
                            <button onClick={() => setIsSettingsOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg">{t('common.cancel')}</button>
                            <button onClick={handleSaveTargets} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">{t('buttons.saveChanges')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProcurementTargets;
