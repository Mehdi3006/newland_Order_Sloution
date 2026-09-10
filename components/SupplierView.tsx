
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Supplier, Order, CurrencyRates, CostingSettings } from '../types';
import { useModals } from '../contexts/ModalContext';
import { getOrderValueInUSD, persianArabicToEnglish, formatToman } from '../utils/formatters';
import { useSettings } from '../hooks/useSettings';
import { formatDisplayDate } from '../utils/dateUtils';
import Select from './Select';

interface SupplierViewProps {
    currencyRates: CurrencyRates;
}

type TimeRange = '3M' | '6M' | '1Y' | 'ALL';

const SupplierView: React.FC<SupplierViewProps> = ({ currencyRates }) => {
    const { t, i18n } = useTranslation();
    const { addToast, showConfirmation } = useModals();
    const { settings } = useSettings();
    
    // UI State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'orders' | 'products'>('orders');
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    
    // Time Ranges
    const [timeRange, setTimeRange] = useState<TimeRange>('ALL');
    const [globalTimeRange, setGlobalTimeRange] = useState<TimeRange>('ALL');

    const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) || [];
    const orders = useLiveQuery(() => db.orders.filter(o => !o.deletedAt).toArray(), []) || [];
    const costingSettings = useMemo(() => settings.find(s => s.key === 'perShipmentCostingSettings')?.value as CostingSettings | null, [settings]);

    const selectedSupplier = useMemo(() => suppliers.find(s => s.id === selectedSupplierId), [suppliers, selectedSupplierId]);

    // --- Automatic Sync Effect ---
    useEffect(() => {
        if (!orders.length || !suppliers.length) return;
        const syncSuppliers = async () => {
            const supplierNames = new Set(suppliers.map(s => s.name.toLowerCase()));
            const newSupplierNames = new Set<string>();
            orders.forEach(order => {
                if (order.supplier && !supplierNames.has(order.supplier.toLowerCase())) {
                    newSupplierNames.add(order.supplier);
                }
            });
            if (newSupplierNames.size > 0) {
                let maxCode = 0;
                suppliers.forEach(s => {
                    const match = s.code.match(/^SUP-(\d+)$/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (!isNaN(num) && num > maxCode) maxCode = num;
                    }
                });
                const newSuppliers: Supplier[] = Array.from(newSupplierNames).map((name, index) => ({
                    id: crypto.randomUUID(),
                    code: `SUP-${String(maxCode + index + 1).padStart(2, '0')}`,
                    name,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }));
                await db.suppliers.bulkAdd(newSuppliers);
            }
        };
        syncSuppliers();
    }, [orders, suppliers]);

    const getCutoffDate = (range: TimeRange) => {
        const now = new Date();
        const cutoffDate = new Date();
        if (range === '3M') cutoffDate.setMonth(now.getMonth() - 3);
        else if (range === '6M') cutoffDate.setMonth(now.getMonth() - 6);
        else if (range === '1Y') cutoffDate.setFullYear(now.getFullYear() - 1);
        else cutoffDate.setFullYear(1900);
        return cutoffDate;
    };

    const supplierPerformance = useMemo(() => {
        const stats: Record<string, { totalOrders: number; totalVolume: number; totalValueUSD: number; totalBalanceDueUSD: number; totalUnits: number; avgLeadTime: number | null }> = {};
        const cutoffDate = getCutoffDate(timeRange);

        suppliers.forEach(supplier => {
            const allSupplierOrders = orders.filter(o => o.supplier.toLowerCase() === supplier.name.toLowerCase());
            const filteredOrders = allSupplierOrders.filter(o => new Date(o.orderDate) >= cutoffDate);
            
            const totalOrders = filteredOrders.length;
            const totalVolume = filteredOrders.reduce((sum, o) => sum + o.volumeCBM, 0);
            const totalValueUSD = filteredOrders.reduce((sum, o) => sum + getOrderValueInUSD(o, currencyRates), 0);
            const totalUnits = filteredOrders.reduce((sum, o) => sum + o.items.reduce((iSum, item) => iSum + item.quantity, 0), 0);
            const totalBalanceDueUSD = allSupplierOrders.reduce((sum, o) => {
                const orderVal = getOrderValueInUSD(o, currencyRates);
                const paid = (o.payments || []).reduce((pSum, p) => pSum + p.amountUSD, 0);
                return sum + (orderVal - paid);
            }, 0);

            let leadTimeSum = 0, leadTimeCount = 0;
            filteredOrders.forEach(o => {
                if (o.orderDate && o.approxLoadingDate) {
                    const diffDays = Math.ceil(Math.abs(new Date(o.approxLoadingDate).getTime() - new Date(o.orderDate).getTime()) / (1000 * 60 * 60 * 24));
                    if (!isNaN(diffDays)) { leadTimeSum += diffDays; leadTimeCount++; }
                }
            });
            // FIX: Corrected arithmetic operation precedence and removed invalid division by boolean.
            const avgLeadTime = leadTimeCount > 0 ? Math.round(leadTimeSum / leadTimeCount) : null;
            stats[supplier.id] = { totalOrders, totalVolume, totalValueUSD, totalBalanceDueUSD, totalUnits, avgLeadTime };
        });
        return stats;
    }, [orders, suppliers, currencyRates, timeRange, i18n.language]);

    const globalStats = useMemo(() => {
        const cutoffDate = getCutoffDate(globalTimeRange);
        const filtered = orders.filter(o => new Date(o.orderDate) >= cutoffDate);
        const totalValueUSD = filtered.reduce((sum, o) => sum + getOrderValueInUSD(o, currencyRates), 0);
        
        // Breakdown for clarity
        const activeOrdersCount = filtered.filter(o => !o.isArchived && !o.isFinalized).length;
        const finalizedOrdersCount = filtered.filter(o => o.isArchived || o.isFinalized).length;

        return {
            activeSuppliers: new Set(filtered.map(o => o.supplier.toLowerCase())).size,
            totalOrders: filtered.length,
            activeOrdersCount,
            finalizedOrdersCount,
            totalVolume: filtered.reduce((acc, o) => acc + o.volumeCBM, 0),
            totalUnits: filtered.reduce((s, i) => s + i.items.reduce((sum, item) => sum + item.quantity, 0), 0),
            totalValueUSD
        };
    }, [orders, currencyRates, globalTimeRange]);

    const dynamicRate = useMemo(() => {
        const now = new Date();
        const startOfCurrentPeriod = new Date();
        startOfCurrentPeriod.setDate(now.getDate() - 30);
        
        const startOfPreviousPeriod = new Date();
        startOfPreviousPeriod.setDate(now.getDate() - 60);

        const currentPeriodOrders = orders.filter(o => {
            const d = new Date(o.orderDate);
            return d >= startOfCurrentPeriod && d <= now;
        });

        const previousPeriodOrders = orders.filter(o => {
            const d = new Date(o.orderDate);
            return d >= startOfPreviousPeriod && d < startOfCurrentPeriod;
        });

        const currentValue = currentPeriodOrders.reduce((sum, o) => sum + getOrderValueInUSD(o, currencyRates), 0);
        const previousValue = previousPeriodOrders.reduce((sum, o) => sum + getOrderValueInUSD(o, currencyRates), 0);

        if (previousValue === 0) {
            return currentValue > 0 ? 100 : 0;
        }

        return Math.round(((currentValue - previousValue) / previousValue) * 100);
    }, [orders, currencyRates]);

    const filteredSuppliers = useMemo(() => {
        const lower = searchQuery.toLowerCase();
        return suppliers.filter(s => s.name.toLowerCase().includes(lower) || s.code.toLowerCase().includes(lower)).sort((a, b) => a.name.localeCompare(b.name));
    }, [suppliers, searchQuery]);

    const productStats = useMemo(() => {
        if (!selectedSupplier) return [];
        const cutoffDate = getCutoffDate(timeRange);
        const supplierOrders = orders.filter(o => o.supplier.toLowerCase() === selectedSupplier.name.toLowerCase() && new Date(o.orderDate) >= cutoffDate);
        const statsMap = new Map<string, { name: string, totalQty: number, totalAmountUSD: number }>();

        supplierOrders.forEach(order => {
            order.items.forEach(item => {
                const key = item.internalCode || item.productName;
                if (!statsMap.has(key)) statsMap.set(key, { name: item.productName, totalQty: 0, totalAmountUSD: 0 });
                const stat = statsMap.get(key)!;
                stat.totalQty += item.quantity;
                let priceUSD = item.price;
                if (order.currency === 'AED') priceUSD = currencyRates.aed > 0 ? item.price / currencyRates.aed : 0;
                else if (order.currency === 'TOMAN') priceUSD = currencyRates.toman > 0 ? item.price / currencyRates.toman : 0;
                else if (order.currency === 'CNY') priceUSD = item.price * currencyRates.cny;
                stat.totalAmountUSD += (priceUSD * item.quantity);
            });
        });
        return Array.from(statsMap.entries()).map(([key, stat]) => ({
            key, ...stat, avgPriceUSD: stat.totalQty > 0 ? stat.totalAmountUSD / stat.totalQty : 0
        })).sort((a, b) => b.totalQty - a.totalQty);
    }, [selectedSupplier, orders, currencyRates, timeRange]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingSupplier) return;
        if (editingSupplier.id) {
            await db.suppliers.update(editingSupplier.id, { ...editingSupplier, updatedAt: new Date().toISOString() });
            addToast(t('toasts.orderUpdated'), 'success');
        } else {
            await db.suppliers.add({ ...editingSupplier, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Supplier);
            addToast(t('toasts.newOrderCreated'), 'success');
        }
        setIsModalOpen(false);
    };

    const KpiCard = ({ label, value, subValue, colorClass, icon, unit }: { label: string, value: string | number, subValue?: string, colorClass: string, icon: React.ReactNode, unit?: string }) => (
        <div className={`rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col items-center justify-center text-center flex-1 min-w-[140px] transition-transform hover:scale-[1.02] ${colorClass.replace('text-', 'bg-').replace('600', '50').replace('500', '50')}`}>
            <div className={`mb-2 p-2 rounded-xl ${colorClass.replace('text-', 'bg-').replace('600', '100').replace('500', '100')} ${colorClass}`}>
                {icon}
            </div>
            {/* KPI Label - Font size increased from text-[10px] to text-xs + font-black */}
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">{label}</p>
            <div className="flex items-baseline gap-x-1">
                <span className={`text-3xl font-bold tracking-tight text-slate-800`}>{value}</span>
                {unit && <span className="text-xs font-black text-slate-400 ml-1">{unit}</span>}
            </div>
            {subValue && <p className={`text-[11px] font-black mt-1.5 ${colorClass}`}>{subValue}</p>}
        </div>
    );

    const TimeRangeFilter = ({ current, onChange }: { current: TimeRange, onChange: (v: TimeRange) => void }) => (
        <div className="flex bg-slate-200 p-0.5 rounded-lg text-[10px] font-bold shadow-inner">
            {(['ALL', '1Y', '6M', '3M'] as TimeRange[]).map(r => (
                <button key={r} onClick={() => onChange(r)} className={`px-2 py-0.5 rounded-md transition-all ${current === r ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{r}</button>
            ))}
        </div>
    );

    return (
        <div className="flex h-full bg-[#f8fafc] p-4 gap-4 overflow-hidden" dir={i18n.dir()}>
            {/* Sidebar (List) - Increased Width to 380px */}
            <div className="w-[380px] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 pb-3 border-b border-slate-50 bg-slate-50/30">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-slate-800 tracking-tight">{t('sidebar.suppliers')}</h2>
                        <button onClick={() => { setEditingSupplier(null); setIsModalOpen(true); }} className="w-8 h-8 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-100 flex items-center justify-center font-bold text-lg transition-transform active:scale-95">+</button>
                    </div>
                    <div className="relative">
                        <input type="text" placeholder={t('common.search') as string} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none pr-8 text-right shadow-sm font-bold" />
                        <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 scrollbar-thin">
                    {filteredSuppliers.map(s => {
                        const perf = supplierPerformance[s.id];
                        const isSelected = selectedSupplierId === s.id;
                        return (
                            <div key={s.id} onClick={() => setSelectedSupplierId(isSelected ? null : s.id)} className={`p-4 rounded-xl border transition-all cursor-pointer group flex flex-col gap-y-2 ${isSelected ? 'bg-indigo-50 border-indigo-200 ring-2 ring-indigo-100/50 shadow-md' : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col items-start gap-1.5 min-w-[120px]">
                                        <div className="bg-emerald-100 text-emerald-800 px-2.5 py-1.5 rounded-lg text-sm font-bold font-mono shadow-sm border border-emerald-200 w-fit">${(perf?.totalValueUSD / 1000).toFixed(1)}k</div>
                                        <div className="bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-lg text-xs font-bold font-mono shadow-sm border border-blue-200 w-fit flex items-center gap-1">
                                            <span>{perf?.totalOrders}</span>
                                            <span className="opacity-70 text-[9px] uppercase">Orders</span>
                                        </div>
                                        {perf?.totalBalanceDueUSD > 1 && (
                                            <div className="bg-red-100 text-red-700 px-2.5 py-1.5 rounded-lg text-sm font-bold font-mono shadow-sm border border-red-200 w-fit">
                                                {t('views.suppliers.performance.debt')}${(perf.totalBalanceDueUSD / 1000).toFixed(1)}k
                                            </div>
                                        )}
                                        {perf?.totalBalanceDueUSD < -1 && (
                                            <div className="bg-green-100 text-green-800 px-2.5 py-1.5 rounded-lg text-sm font-bold font-mono shadow-sm border border-green-200 w-fit">
                                                {t('views.suppliers.performance.credit')}${(Math.abs(perf.totalBalanceDueUSD) / 1000).toFixed(1)}k
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-right flex-1 min-w-0">
                                        <h3 className="font-bold text-sm text-slate-800 group-hover:text-indigo-600 transition-colors truncate">{s.name}</h3>
                                        <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-tight">{s.code}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {filteredSuppliers.length === 0 && <p className="text-center text-slate-400 text-[10px] py-10 italic font-bold">{t('views.suppliers.noSuppliers')}</p>}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col gap-y-4 overflow-y-auto min-w-0 pr-1 scrollbar-thin">
                {selectedSupplier ? (
                    <div className="flex flex-col gap-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Detail Header */}
                        <header className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex justify-between items-start">
                            <div className="flex flex-col">
                                <button 
                                    onClick={() => setSelectedSupplierId(null)}
                                    className="flex items-center gap-x-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors mb-3 uppercase tracking-widest"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 rtl:rotate-180" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                    {t('views.suppliers.backToOverview')}
                                </button>
                                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{selectedSupplier.name}</h1>
                                <p className="text-base font-bold text-slate-400 mt-1">{selectedSupplier.name_fa}</p>
                                <div className="flex gap-x-6 mt-4 text-xs text-slate-500 font-bold uppercase tracking-wide">
                                    <span className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full">📍 {selectedSupplier.city}, {selectedSupplier.country}</span>
                                    <span className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full">📞 {selectedSupplier.phone || '-'}</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-y-4">
                                <div className="flex gap-x-2">
                                    <button onClick={() => { setEditingSupplier(selectedSupplier); setIsModalOpen(true); }} className="px-4 py-2 text-[12px] font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm">{t('buttons.edit')}</button>
                                    <button onClick={() => { showConfirmation({ title: t('confirmationModal.deleteItemTitle'), message: t('confirmationModal.deleteItemBody'), variant: 'destructive', onConfirm: () => db.suppliers.delete(selectedSupplier.id) }); }} className="px-4 py-2 text-[12px] font-bold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors shadow-sm">{t('buttons.delete')}</button>
                                </div>
                                <TimeRangeFilter current={timeRange} onChange={setTimeRange} />
                            </div>
                        </header>

                        {/* Supplier Stats */}
                        <div className="flex gap-4 flex-wrap">
                            {(() => {
                                const s = supplierPerformance[selectedSupplier.id] || { totalOrders: 0, totalVolume: 0, totalValueUSD: 0, totalBalanceDueUSD: 0, totalUnits: 0, avgLeadTime: 0 };
                                return (
                                    <>
                                        <KpiCard icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>} label={t('views.suppliers.performance.totalOrders')} value={s.totalOrders} colorClass="text-indigo-600" />
                                        <KpiCard icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} label={t('views.suppliers.performance.totalValue')} value={`$${Math.round(s.totalValueUSD).toLocaleString()}`} colorClass="text-emerald-600" />
                                        <KpiCard icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 00-2-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} label={t('views.suppliers.performance.totalDue')} value={`$${Math.round(Math.max(0, s.totalBalanceDueUSD)).toLocaleString()}`} subValue={s.totalBalanceDueUSD < 0 ? `${t('views.suppliers.performance.credit')} $${Math.abs(s.totalBalanceDueUSD).toLocaleString()}` : ''} colorClass="text-red-500" />
                                        <KpiCard icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>} label={t('views.suppliers.performance.totalUnits')} value={s.totalUnits.toLocaleString()} colorClass="text-purple-600" />
                                        <KpiCard icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} label={t('views.suppliers.performance.avgLeadTime')} value={s.avgLeadTime ? s.avgLeadTime : '-'} unit={t('views.suppliers.performance.days') as string} colorClass="text-blue-600" />
                                    </>
                                );
                            })()}
                        </div>

                        {/* Tabs */}
                        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                            <nav className="flex border-b border-slate-100 bg-slate-50/50">
                                <button onClick={() => setActiveTab('orders')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'orders' ? 'bg-white text-indigo-600 border-b-4 border-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{t('views.suppliers.tabs.orders')}</button>
                                <button onClick={() => setActiveTab('products')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'products' ? 'bg-white text-indigo-600 border-b-4 border-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{t('views.suppliers.tabs.productAnalysis')}</button>
                            </nav>
                            
                            <div className="p-6 bg-white flex-1">
                                {activeTab === 'orders' ? (
                                    <div className="space-y-4">
                                        {orders.filter(o => o.supplier.toLowerCase() === selectedSupplier.name.toLowerCase() && new Date(o.orderDate) >= getCutoffDate(timeRange)).sort((a, b) => b.orderDate.localeCompare(a.orderDate)).map(order => {
                                            const isExpanded = expandedOrderId === order.id;
                                            const orderValUSD = getOrderValueInUSD(order, currencyRates);
                                            return (
                                                <div key={order.id} className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm transition-all hover:border-slate-200">
                                                    <div onClick={() => setExpandedOrderId(isExpanded ? null : order.id)} className="p-4 bg-slate-50/50 hover:bg-slate-50 cursor-pointer flex justify-between items-center transition-colors">
                                                        <div className="flex items-center gap-4">
                                                            <span className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                                            <div>
                                                                <p className="font-bold text-xs text-indigo-600 uppercase tracking-wider">{order.id}</p>
                                                                <p className="text-sm font-bold text-slate-400 uppercase">{formatDisplayDate(order.orderDate, i18n.language)}</p>
                                                            </div>
                                                            <span className="bg-white border border-slate-200 text-slate-600 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-tighter">{t(`statuses.${order.status}`, { defaultValue: order.status })}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="font-bold text-sm text-slate-900 font-mono">${Math.round(orderValUSD).toLocaleString()}</p>
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Value</p>
                                                        </div>
                                                    </div>
                                                    {isExpanded && (
                                                        <div className="p-4 border-t border-slate-100 bg-white">
                                                            <table className="w-full text-xs text-right" dir={i18n.dir()}>
                                                                <thead className="text-slate-400 font-bold uppercase tracking-widest border-b border-slate-50">
                                                                    <tr>
                                                                        <th className="pb-3 text-left rtl:text-right">{t('orderModal.table.itemCode')}</th>
                                                                        <th className="pb-3 text-left rtl:text-right">{t('orderModal.table.productName')}</th>
                                                                        <th className="pb-3 text-center">{t('orderModal.table.quantity')}</th>
                                                                        <th className="pb-3 text-right rtl:text-left">{t('orderModal.table.unitPrice')}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-50 text-slate-700 font-bold">
                                                                    {order.items.map((item, idx) => (
                                                                        <tr key={idx} className="hover:bg-slate-50/50">
                                                                            <td className="py-2.5 font-mono text-slate-400">{item.internalCode || '-'}</td>
                                                                            <td className="py-2.5 text-slate-800 font-bold">{item.productName}</td>
                                                                            <td className="py-2.5 text-center font-mono">{item.quantity}</td>
                                                                            <td className="py-2.5 text-right rtl:text-left font-mono">${item.price}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                                        <table className="w-full text-xs text-right" dir={i18n.dir()}>
                                            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-widest">
                                                <tr>
                                                    <th className="p-4 text-left rtl:text-right">{t('views.suppliers.performance.productCode')}</th>
                                                    <th className="p-4 text-center">{t('views.suppliers.performance.totalPurchased')}</th>
                                                    <th className="p-4 text-center">{t('views.suppliers.performance.avgPrice')}</th>
                                                    <th className="p-4 text-right rtl:text-left">{t('views.suppliers.performance.totalSpend')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-slate-700 font-bold">
                                                {productStats.map((stat, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                        <td className="p-4">
                                                            <p className="text-slate-900 font-bold">{stat.name}</p>
                                                            <p className="text-[10px] text-slate-400 font-mono tracking-tighter">{stat.key !== stat.name ? stat.key : ''}</p>
                                                        </td>
                                                        <td className="p-4 text-center"><span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">{stat.totalQty.toLocaleString()}</span></td>
                                                        <td className="p-4 text-center font-mono text-slate-500">${stat.avgPriceUSD.toFixed(2)}</td>
                                                        <td className="p-4 text-right rtl:text-left font-mono text-emerald-600">${Math.round(stat.totalAmountUSD).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Global Dashboard View */
                    <div className="flex flex-col gap-y-6">
                        <div className="text-center bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                            <h1 className="text-4xl font-bold text-slate-900 tracking-tight uppercase">{t('views.suppliers.globalOverview')}</h1>
                            <p className="text-indigo-600 font-bold text-xs mt-2 uppercase tracking-widest">{t('views.suppliers.selectPrompt')}</p>
                        </div>
                        <div className="flex justify-center">
                            <TimeRangeFilter current={globalTimeRange} onChange={setGlobalTimeRange} />
                        </div>
                        <div className="flex gap-4 flex-wrap">
                            <KpiCard icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} label={t('views.suppliers.activeSuppliers')} value={globalStats.activeSuppliers} colorClass="text-indigo-600" />
                            <KpiCard 
                                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>} 
                                label={t('views.suppliers.totalOrders')} 
                                value={globalStats.totalOrders} 
                                subValue={`${globalStats.activeOrdersCount} Active | ${globalStats.finalizedOrdersCount} Finalized`}
                                colorClass="text-blue-600" 
                            />
                            <KpiCard icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>} label={t('views.suppliers.totalVolume')} value={globalStats.totalVolume.toFixed(1)} unit="m³" colorClass="text-emerald-600" />
                            <KpiCard icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>} label={t('views.suppliers.performance.totalUnits')} value={globalStats.totalUnits.toLocaleString()} colorClass="text-purple-600" />
                            <KpiCard icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} label={t('views.suppliers.totalPayables')} value={`$${Math.round(globalStats.totalValueUSD / 1000).toLocaleString()}k`} colorClass="text-red-500" />
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                            <div className="lg:col-span-2 bg-slate-900 rounded-[3rem] p-8 text-white relative overflow-hidden shadow-2xl border-4 border-indigo-500/10 flex flex-col justify-between min-h-[300px]">
                                <div className="relative z-10">
                                    <h3 className="text-xl font-bold mb-4 uppercase tracking-tight">{t('views.suppliers.systemInsight')}</h3>
                                    <p className="text-slate-400 text-sm leading-relaxed font-bold">
                                        {t('views.suppliers.statsDescription', { count: globalStats.activeSuppliers, units: globalStats.totalUnits.toLocaleString(), volume: globalStats.totalVolume.toFixed(1) })}
                                    </p>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-x-4 mt-8 self-end">
                                    <span className="text-sm font-black uppercase tracking-wider text-indigo-400">{t('views.suppliers.dynamicRate')}</span>
                                    <span className="text-7xl font-bold tracking-tight text-white">
                                        {i18n.dir() === 'rtl' ? `%${dynamicRate}` : `${dynamicRate}%`}
                                    </span>
                                </div>
                                <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl"></div>
                            </div>
                            <div className="lg:col-span-3 bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8 flex flex-col">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 border-b border-slate-50 pb-4">{t('views.suppliers.topSuppliersByCost')}</h3>
                                <div className="flex-1 space-y-6">
                                    {suppliers.map(s => ({ name: s.name, val: orders.filter(o => o.supplier.toLowerCase() === s.name.toLowerCase()).reduce((sum, o) => sum + getOrderValueInUSD(o, currencyRates), 0) }))
                                        .sort((a,b) => b.val - a.val).slice(0, 5).map((s, idx, arr) => {
                                            const percentage = (s.val / (arr[0]?.val || 1)) * 100;
                                            return (
                                                <div key={idx} className="flex flex-col gap-y-2">
                                                    <div className="flex justify-between items-end text-xs font-bold uppercase tracking-tight">
                                                        <span className="text-emerald-600 font-mono font-bold shadow-emerald-50">${Math.round(s.val).toLocaleString()}</span>
                                                        <span className="text-slate-800">{s.name}</span>
                                                    </div>
                                                    <div className="w-full bg-slate-50 rounded-full h-3 overflow-hidden border border-slate-100"><div className="bg-indigo-600 h-full rounded-full transition-all duration-1000 shadow-inner" style={{ width: `${percentage}%` }} /></div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal for Supplier Edit/Create */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-100">
                        <form onSubmit={handleSave} className="flex flex-col h-full">
                            <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                                <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">{editingSupplier ? t('views.suppliers.form.edit') : t('views.suppliers.form.new')}</h2>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-900 text-3xl font-bold transition-colors">&times;</button>
                            </div>
                            <div className="p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 overflow-y-auto">
                                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('views.suppliers.form.nameEn')}</label><input type="text" required value={editingSupplier?.name || ''} onChange={e => setEditingSupplier(p => ({...(p || {} as Supplier), name: e.target.value}))} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold text-slate-800" /></div>
                                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('views.suppliers.form.nameFa')}</label><input type="text" value={editingSupplier?.name_fa || ''} onChange={e => setEditingSupplier(p => ({...(p || {} as Supplier), name_fa: e.target.value}))} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-right font-bold text-slate-800" dir="rtl" /></div>
                                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('views.suppliers.form.code')}</label><input type="text" value={editingSupplier?.code || ''} onChange={e => setEditingSupplier(p => ({...(p || {} as Supplier), code: e.target.value}))} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm font-mono focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold text-slate-800" /></div>
                                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('views.suppliers.form.rating')}</label><Select value={editingSupplier?.rating || 3} onChange={e => setEditingSupplier(p => ({...(p || {} as Supplier), rating: Number(e.target.value)}))}>{[1,2,3,4,5].map(v => <option key={v} value={v}>{v} Stars</option>)}</Select></div>
                                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('views.suppliers.form.country')}</label><input type="text" value={editingSupplier?.country || ''} onChange={e => setEditingSupplier(p => ({...(p || {} as Supplier), country: e.target.value}))} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold text-slate-800" /></div>
                                <div><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('views.suppliers.form.city')}</label><input type="text" value={editingSupplier?.city || ''} onChange={e => setEditingSupplier(p => ({...(p || {} as Supplier), city: e.target.value}))} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold text-slate-800" /></div>
                                <div className="sm:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('views.suppliers.form.paymentTerms')}</label><input type="text" value={editingSupplier?.paymentTerms || ''} onChange={e => setEditingSupplier(p => ({...(p || {} as Supplier), paymentTerms: e.target.value}))} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold text-slate-800" /></div>
                            </div>
                            <div className="p-6 bg-slate-50 flex justify-end gap-4 border-t border-slate-100">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-3 bg-white border-2 border-slate-200 rounded-2xl text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">{t('common.cancel')}</button>
                                <button type="submit" className="px-12 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95">{t('buttons.save')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupplierView;
