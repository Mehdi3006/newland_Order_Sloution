import React, { useState, useMemo } from 'react';
import { Product, Order, PurchaseInvoice, SalesInvoice, CostingSettings } from '../../types';
import { 
    calculateComprehensiveCardex, 
    exportCardexToExcel, 
    generateCardexPrintableHtml, 
    performUniversalDatabaseSpecsSync,
    ProductStockSummary,
    CardexEntry,
    UniversalSyncResult
} from '../../utils/inventorySyncEngine';
import { formatToman, getTomanUnitLabel } from '../../utils/formatters';

interface InventoryCardexTabProps {
    products: Product[];
    orders?: Order[];
    purchaseInvoices: PurchaseInvoice[];
    salesInvoices: SalesInvoice[];
    costingSettings?: CostingSettings | null;
}

type ActiveViewMode = 'single_cardex' | 'all_products_matrix' | 'order_delivery_chain' | 'health_reconciliation';

export const InventoryCardexTab: React.FC<InventoryCardexTabProps> = ({
    products,
    orders = [],
    purchaseInvoices,
    salesInvoices,
    costingSettings
}) => {
    // Current Active Tab
    const [viewMode, setViewMode] = useState<ActiveViewMode>('single_cardex');

    // Selected Product for Single Cardex
    const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
    const [productSearchTerm, setProductSearchTerm] = useState('');

    // Single Cardex Filter States
    const [includePipeline, setIncludePipeline] = useState<boolean>(true);
    const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'inflow' | 'outflow' | 'pipeline'>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [cardexSearch, setCardexSearch] = useState('');

    // Matrix search and filters
    const [matrixSearch, setMatrixSearch] = useState('');
    const [matrixStockFilter, setMatrixStockFilter] = useState<'all' | 'in_stock' | 'zero_stock' | 'in_pipeline' | 'discrepancy'>('all');

    // Sync State
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<UniversalSyncResult | null>(null);
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

    // Selected Product Object
    const selectedProduct = useMemo(() => {
        return products.find(p => p.id === selectedProductId) || products[0] || null;
    }, [products, selectedProductId]);

    // Calculate Comprehensive Cardex for selected product
    const { entries: allCardexEntries, summary: currentSummary } = useMemo(() => {
        if (!selectedProduct) {
            return { 
                entries: [], 
                summary: {
                    productId: '',
                    internalCode: '',
                    partNumber: '',
                    productNameFa: '',
                    productNameEn: '',
                    itemsPerCarton: 1,
                    cartonCBM: 0.1,
                    unitCBM: 0.1,
                    grossWeight: 5,
                    netWeight: 4.5,
                    hsCode: '',
                    physicalStockQty: 0,
                    physicalStockCartons: 0,
                    physicalStockCBM: 0,
                    physicalStockWeight: 0,
                    pipelineStockQty: 0,
                    pipelineStockCartons: 0,
                    pipelineStockCBM: 0,
                    totalExpectedQty: 0,
                    totalExpectedCartons: 0,
                    totalExpectedCBM: 0,
                    averageLandedCostUSD: 0,
                    averageLandedCostAED: 0,
                    averageLandedCostTOMAN: 0,
                    totalStockValueUSD: 0,
                    totalStockValueAED: 0,
                    totalStockValueTOMAN: 0,
                    hasDiscrepancies: false,
                    discrepancies: []
                } as ProductStockSummary
            };
        }
        return calculateComprehensiveCardex(
            selectedProduct,
            orders,
            purchaseInvoices,
            salesInvoices,
            costingSettings,
            includePipeline
        );
    }, [selectedProduct, orders, purchaseInvoices, salesInvoices, costingSettings, includePipeline]);

    // Filtered Cardex Entries
    const filteredEntries = useMemo(() => {
        return allCardexEntries.filter(e => {
            if (docTypeFilter === 'inflow' && (e.inQty <= 0 || !e.isPhysical)) return false;
            if (docTypeFilter === 'outflow' && (e.outQty <= 0 || !e.isPhysical)) return false;
            if (docTypeFilter === 'pipeline' && e.isPhysical) return false;

            if (dateFrom && e.date < dateFrom) return false;
            if (dateTo && e.date > dateTo) return false;

            if (cardexSearch) {
                const q = cardexSearch.toLowerCase();
                const matchDoc = e.docNumber.toLowerCase().includes(q);
                const matchParty = e.partyName.toLowerCase().includes(q);
                const matchNotes = (e.notes || '').toLowerCase().includes(q);
                if (!matchDoc && !matchParty && !matchNotes) return false;
            }

            return true;
        });
    }, [allCardexEntries, docTypeFilter, dateFrom, dateTo, cardexSearch]);

    // Calculate Stock Summaries for all products (for Matrix view)
    const allProductSummaries = useMemo(() => {
        return products.map(p => {
            const { summary } = calculateComprehensiveCardex(
                p,
                orders,
                purchaseInvoices,
                salesInvoices,
                costingSettings,
                true
            );
            return summary;
        });
    }, [products, orders, purchaseInvoices, salesInvoices, costingSettings]);

    // Filtered Matrix List
    const filteredMatrixList = useMemo(() => {
        return allProductSummaries.filter(s => {
            if (matrixStockFilter === 'in_stock' && s.physicalStockQty <= 0) return false;
            if (matrixStockFilter === 'zero_stock' && s.physicalStockQty > 0) return false;
            if (matrixStockFilter === 'in_pipeline' && s.pipelineStockQty <= 0) return false;
            if (matrixStockFilter === 'discrepancy' && !s.hasDiscrepancies) return false;

            if (matrixSearch) {
                const q = matrixSearch.toLowerCase();
                const matchCode = s.internalCode.toLowerCase().includes(q);
                const matchPart = s.partNumber.toLowerCase().includes(q);
                const matchFa = s.productNameFa.toLowerCase().includes(q);
                const matchEn = s.productNameEn.toLowerCase().includes(q);
                if (!matchCode && !matchPart && !matchFa && !matchEn) return false;
            }

            return true;
        });
    }, [allProductSummaries, matrixStockFilter, matrixSearch]);

    // Aggregate Warehouse Totals
    const warehouseTotals = useMemo(() => {
        let totalPhysicalQty = 0;
        let totalPhysicalCartons = 0;
        let totalPhysicalCBM = 0;
        let totalPhysicalWeight = 0;
        let totalPipelineQty = 0;
        let totalStockValueAED = 0;
        let totalStockValueTOMAN = 0;
        let discrepancyCount = 0;

        allProductSummaries.forEach(s => {
            totalPhysicalQty += s.physicalStockQty;
            totalPhysicalCartons += s.physicalStockCartons;
            totalPhysicalCBM += s.physicalStockCBM;
            totalPhysicalWeight += s.physicalStockWeight;
            totalPipelineQty += s.pipelineStockQty;
            totalStockValueAED += s.totalStockValueAED;
            totalStockValueTOMAN += s.totalStockValueTOMAN;
            if (s.hasDiscrepancies) discrepancyCount++;
        });

        return {
            totalPhysicalQty,
            totalPhysicalCartons,
            totalPhysicalCBM: parseFloat(totalPhysicalCBM.toFixed(2)),
            totalPhysicalWeight: parseFloat(totalPhysicalWeight.toFixed(2)),
            totalPipelineQty,
            totalStockValueAED: Math.round(totalStockValueAED),
            totalStockValueTOMAN: Math.round(totalStockValueTOMAN),
            discrepancyCount,
            totalProductsCount: products.length
        };
    }, [allProductSummaries, products]);

    // Order Delivery Chain Breakdown for Selected Product
    const selectedProductOrders = useMemo(() => {
        if (!selectedProduct) return [];
        const result: Array<{
            order: Order;
            matchedItem: any;
            cartons: number;
            totalCBM: number;
            totalGrossWeight: number;
            stageCategory: 'delivered' | 'in_transit' | 'production' | 'draft';
        }> = [];

        orders.forEach(o => {
            if (o.deletedAt) return;
            (o.items || []).forEach(it => {
                const codeMatch = it.internalCode && selectedProduct.internalCode && it.internalCode.trim().toLowerCase() === selectedProduct.internalCode.trim().toLowerCase();
                const partMatch = it.supplierCode && selectedProduct.supplierCode && it.supplierCode.trim().toLowerCase() === selectedProduct.supplierCode.trim().toLowerCase();
                const nameMatch = it.productName && (it.productName === selectedProduct.name_en || it.productName === selectedProduct.description);

                if (codeMatch || partMatch || nameMatch) {
                    const cartons = it.itemsPerCarton > 0 ? Math.ceil(it.quantity / it.itemsPerCarton) : 1;
                    const totalCBM = parseFloat((cartons * (it.cartonCBM || 0.1)).toFixed(3));
                    const totalGrossWeight = parseFloat((cartons * (it.grossWeight || 5)).toFixed(2));

                    let stageCategory: 'delivered' | 'in_transit' | 'production' | 'draft' = 'production';
                    if (['Delivered', 'Invoiced', 'Final (System)'].includes(o.status) || o.isFinalized) {
                        stageCategory = 'delivered';
                    } else if (['On Board', 'In Transit', 'Arrival', 'Customs'].includes(o.status)) {
                        stageCategory = 'in_transit';
                    } else if (['Draft', 'Sample Received (Sampling/Test)'].includes(o.status)) {
                        stageCategory = 'draft';
                    }

                    result.push({
                        order: o,
                        matchedItem: it,
                        cartons,
                        totalCBM,
                        totalGrossWeight,
                        stageCategory
                    });
                }
            });
        });

        return result;
    }, [orders, selectedProduct]);

    // Perform Universal Specs Sync
    const handleRunUniversalSync = async () => {
        setIsSyncing(true);
        try {
            const res = await performUniversalDatabaseSpecsSync(products, orders, purchaseInvoices, salesInvoices);
            setSyncResult(res);
            setIsSyncModalOpen(true);
        } catch (err: any) {
            alert(`خطا در همگام‌سازی دیتابیس: ${err.message}`);
        } finally {
            setIsSyncing(false);
        }
    };

    // Export Cardex to Excel
    const handleExportExcel = () => {
        if (!selectedProduct) return;
        exportCardexToExcel(selectedProduct, filteredEntries, currentSummary);
    };

    // Print Official Cardex Document
    const handlePrintCardex = () => {
        if (!selectedProduct) return;
        const html = generateCardexPrintableHtml(selectedProduct, filteredEntries, currentSummary);
        const win = window.open('', '_blank');
        if (win) {
            win.document.write(html);
            win.document.close();
            setTimeout(() => {
                win.focus();
                win.print();
            }, 300);
        }
    };

    return (
        <div className="space-y-6">
            {/* Top Navigation & Action Controls */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-3 h-3 bg-indigo-600 rounded-full animate-pulse" />
                        مدیریت یکپارچه کاردکس انبار و زنجیره سفارشات (Integrated Cardex & Supply Chain)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        همگام‌سازی صددرصدی مشخصات فیزیکی و حجمی کالاها (CBM/وزن)، زنجیره وضعیت تحویل سفارشات و رفع تناقضات کاردکس
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Universal Auto-Sync Button */}
                    <button
                        onClick={handleRunUniversalSync}
                        disabled={isSyncing}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                            isSyncing 
                                ? 'bg-amber-100 text-amber-800 cursor-wait' 
                                : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 shadow-sm'
                        }`}
                        title="همگام‌سازی خودکار CBM، وزن، تعداد در کارتن و مشخصات کالا در کل دیتابیس بدون تناقض"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {isSyncing ? 'در حال همگام‌سازی...' : '⚡ همگام‌سازی ۱۰۰٪ مشخصات کالا'}
                    </button>

                    {/* View Switcher Tabs */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                        <button
                            onClick={() => setViewMode('single_cardex')}
                            className={`px-3 py-1.5 rounded-lg transition ${viewMode === 'single_cardex' ? 'bg-white text-indigo-700 font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            📊 کاردکس تفصیلی کالا
                        </button>
                        <button
                            onClick={() => setViewMode('all_products_matrix')}
                            className={`px-3 py-1.5 rounded-lg transition ${viewMode === 'all_products_matrix' ? 'bg-white text-indigo-700 font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            📋 ماتریس جامع انبار ({products.length})
                        </button>
                        <button
                            onClick={() => setViewMode('order_delivery_chain')}
                            className={`px-3 py-1.5 rounded-lg transition ${viewMode === 'order_delivery_chain' ? 'bg-white text-indigo-700 font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            🚢 زنجیره لجستیک سفارشات
                        </button>
                    </div>
                </div>
            </div>

            {/* Warehouse High-Level KPI Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[11px] font-bold text-slate-500">موجودی فیزیکی کل</p>
                    <p className="text-base font-black text-slate-800 mt-1 font-mono">{warehouseTotals.totalPhysicalQty.toLocaleString()} <span className="text-xs text-slate-500 font-normal">عدد</span></p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{warehouseTotals.totalPhysicalCartons.toLocaleString()} کارتن معادل</p>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[11px] font-bold text-indigo-600">حجم کل انبار (CBM)</p>
                    <p className="text-base font-black text-indigo-700 mt-1 font-mono">{warehouseTotals.totalPhysicalCBM.toLocaleString()} <span className="text-xs text-slate-500 font-normal">m³</span></p>
                    <p className="text-[10px] text-indigo-400 mt-0.5">حجم اشغال شده واقعی</p>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[11px] font-bold text-cyan-600">وزن کل انبار</p>
                    <p className="text-base font-black text-cyan-700 mt-1 font-mono">{warehouseTotals.totalPhysicalWeight.toLocaleString()} <span className="text-xs text-slate-500 font-normal">kg</span></p>
                    <p className="text-[10px] text-cyan-500 mt-0.5 font-mono">{(warehouseTotals.totalPhysicalWeight / 1000).toFixed(2)} تن</p>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[11px] font-bold text-amber-600">سفارشات در راه (بین‌راهی)</p>
                    <p className="text-base font-black text-amber-700 mt-1 font-mono">{warehouseTotals.totalPipelineQty.toLocaleString()} <span className="text-xs text-slate-500 font-normal">عدد</span></p>
                    <p className="text-[10px] text-amber-500 mt-0.5">زنجیره تامین در جریان</p>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[11px] font-bold text-emerald-600">ارزش درهمی موجودی</p>
                    <p className="text-base font-black text-emerald-700 mt-1 font-mono">{warehouseTotals.totalStockValueAED.toLocaleString()} <span className="text-xs text-slate-500 font-normal">AED</span></p>
                    <p className="text-[10px] text-emerald-500 mt-0.5">بهای تمام شده انبار</p>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[11px] font-bold text-slate-600">سلامت و انطباق داده‌ها</p>
                    <div className="flex items-center gap-1.5 mt-1">
                        {warehouseTotals.discrepancyCount === 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                ✓ ۱۰۰٪ هماهنگ
                            </span>
                        ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                                ⚠️ {warehouseTotals.discrepancyCount} قلم نیازمند بررسی
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{warehouseTotals.totalProductsCount} رکورد کالا</p>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* VIEW 1: SINGLE PRODUCT DETAILED CARDEX & SPECS                            */}
            {/* ========================================================================= */}
            {viewMode === 'single_cardex' && (
                <div className="space-y-5">
                    {/* Product Selection & Specs Header Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                        {/* Selector Row */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
                            <div className="flex-1 w-full sm:w-auto">
                                <label className="text-xs font-bold text-slate-700 block mb-1">
                                    انتخاب کالا جهت مشاهده مشخصات مهندسی و کارتکس انبار:
                                </label>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={selectedProductId}
                                        onChange={(e) => setSelectedProductId(e.target.value)}
                                        className="w-full sm:max-w-md bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    >
                                        {products.map(p => (
                                            <option key={p.id} value={p.id}>
                                                [{p.internalCode || 'فاقد کد'}] {p.productNameFa || p.description || p.name_fa || p.name_en} - پارت: {p.supplierCode || p.partNumber || '---'}
                                            </option>
                                        ))}
                                    </select>

                                    {currentSummary.isTemporaryItem && (
                                        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-lg whitespace-nowrap">
                                            ⚠️ ورود موقت
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Export & Print Action Buttons */}
                            <div className="flex items-center gap-2 self-end sm:self-center">
                                <button
                                    onClick={handleExportExcel}
                                    className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    اکسل کارتکس
                                </button>

                                <button
                                    onClick={handlePrintCardex}
                                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    چاپ سند رسمی
                                </button>
                            </div>
                        </div>

                        {/* Product Technical & Packaging Specs Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                                <span className="text-[10px] text-slate-500 block font-semibold">کد داخلی / پارت‌نامبر</span>
                                <span className="text-xs font-bold text-indigo-700 font-mono block mt-0.5">{currentSummary.internalCode}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{currentSummary.partNumber || 'فاقد پارت‌نامبر'}</span>
                            </div>

                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                                <span className="text-[10px] text-slate-500 block font-semibold">بسته‌بندی و کارتن</span>
                                <span className="text-xs font-bold text-slate-800 font-mono block mt-0.5">{currentSummary.itemsPerCarton} <span className="text-[10px] font-normal text-slate-500">عدد در کارتن</span></span>
                                <span className="text-[10px] text-slate-400 font-mono">HS: {currentSummary.hsCode}</span>
                            </div>

                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                                <span className="text-[10px] text-slate-500 block font-semibold">CBM هر کارتن / واحد</span>
                                <span className="text-xs font-bold text-indigo-700 font-mono block mt-0.5">{currentSummary.cartonCBM} <span className="text-[10px] font-normal text-slate-500">m³</span></span>
                                <span className="text-[10px] text-slate-400 font-mono">واحد: {currentSummary.unitCBM} m³</span>
                            </div>

                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                                <span className="text-[10px] text-slate-500 block font-semibold">وزن ناخالص / خالص کارتن</span>
                                <span className="text-xs font-bold text-slate-800 font-mono block mt-0.5">{currentSummary.grossWeight} <span className="text-[10px] font-normal text-slate-500">kg</span></span>
                                <span className="text-[10px] text-slate-400 font-mono">خالص: {currentSummary.netWeight} kg</span>
                            </div>

                            <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200/70">
                                <span className="text-[10px] text-emerald-800 block font-bold">موجودی فیزیکی حاضر</span>
                                <span className="text-xs font-black text-emerald-700 font-mono block mt-0.5">
                                    {currentSummary.physicalStockQty.toLocaleString()} عدد
                                </span>
                                <span className="text-[10px] text-emerald-600 font-mono">
                                    {currentSummary.physicalStockCartons} کارتن ({currentSummary.physicalStockCBM} m³)
                                </span>
                            </div>

                            <div className="bg-indigo-50/60 p-3 rounded-xl border border-indigo-200/70">
                                <span className="text-[10px] text-indigo-800 block font-bold">بهای تمام‌شده میانگین</span>
                                <span className="text-xs font-black text-indigo-700 font-mono block mt-0.5">
                                    {currentSummary.averageLandedCostAED.toLocaleString()} AED
                                </span>
                                <span className="text-[10px] text-indigo-600 font-mono">
                                    {currentSummary.averageLandedCostTOMAN.toLocaleString()} تومان
                                </span>
                            </div>
                        </div>

                        {/* Discrepancy Alert Box */}
                        {currentSummary.hasDiscrepancies && (
                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-base">⚠️</span>
                                    <div>
                                        <p className="font-bold">هشدارهای انطباق داده برای این کالا:</p>
                                        <ul className="list-disc list-inside text-[11px] text-amber-800 mt-0.5 space-y-0.5">
                                            {currentSummary.discrepancies.map((d, i) => (
                                                <li key={i}>{d}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                                <button
                                    onClick={handleRunUniversalSync}
                                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition whitespace-nowrap shadow-sm"
                                >
                                    اصلاح خودکار مشخصات
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Filter & Options Bar */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-700">فیلتر رویداد:</span>
                            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                                <button
                                    onClick={() => setDocTypeFilter('all')}
                                    className={`px-2.5 py-1 rounded-lg font-medium transition ${docTypeFilter === 'all' ? 'bg-white text-indigo-700 font-bold shadow-xs' : 'text-slate-600'}`}
                                >
                                    همه ({allCardexEntries.length})
                                </button>
                                <button
                                    onClick={() => setDocTypeFilter('inflow')}
                                    className={`px-2.5 py-1 rounded-lg font-medium transition ${docTypeFilter === 'inflow' ? 'bg-white text-emerald-700 font-bold shadow-xs' : 'text-slate-600'}`}
                                >
                                    وارده (ورود)
                                </button>
                                <button
                                    onClick={() => setDocTypeFilter('outflow')}
                                    className={`px-2.5 py-1 rounded-lg font-medium transition ${docTypeFilter === 'outflow' ? 'bg-white text-rose-700 font-bold shadow-xs' : 'text-slate-600'}`}
                                >
                                    صادره (فروش)
                                </button>
                                <button
                                    onClick={() => setDocTypeFilter('pipeline')}
                                    className={`px-2.5 py-1 rounded-lg font-medium transition ${docTypeFilter === 'pipeline' ? 'bg-white text-amber-700 font-bold shadow-xs' : 'text-slate-600'}`}
                                >
                                    در راه (Pipeline)
                                </button>
                            </div>

                            <label className="flex items-center gap-1.5 cursor-pointer mr-2 select-none">
                                <input
                                    type="checkbox"
                                    checked={includePipeline}
                                    onChange={(e) => setIncludePipeline(e.target.checked)}
                                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                />
                                <span className="text-slate-700 font-semibold">نمایش سفارشات در راه (In-Transit)</span>
                            </label>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <input
                                type="text"
                                value={cardexSearch}
                                onChange={(e) => setCardexSearch(e.target.value)}
                                placeholder="جستجو در شماره سند، شخص، توضیحات..."
                                className="w-full md:w-60 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Main Cardex Ledger Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-right text-xs">
                                <thead>
                                    <tr className="bg-slate-800 text-white font-bold">
                                        <th className="p-3 text-center">ردیف</th>
                                        <th className="p-3">تاریخ</th>
                                        <th className="p-3">نوع سند و رویداد</th>
                                        <th className="p-3 text-center">شماره سند</th>
                                        <th className="p-3">طرف حساب / شرکت حمل</th>
                                        <th className="p-3 text-center text-emerald-300 bg-emerald-950/60">وارده (تعداد)</th>
                                        <th className="p-3 text-center text-emerald-300 bg-emerald-950/60">وارده (کارتن/CBM)</th>
                                        <th className="p-3 text-center text-rose-300 bg-rose-950/60">صادره (تعداد)</th>
                                        <th className="p-3 text-center text-rose-300 bg-rose-950/60">صادره (کارتن/CBM)</th>
                                        <th className="p-3 text-center text-amber-300 bg-amber-950/60">مانده تعداد</th>
                                        <th className="p-3 text-center text-amber-300 bg-amber-950/60">مانده کارتن</th>
                                        <th className="p-3 text-center text-indigo-300 bg-indigo-950/60">مانده CBM</th>
                                        <th className="p-3 text-center">فی سند</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {filteredEntries.length === 0 ? (
                                        <tr>
                                            <td colSpan={13} className="p-12 text-center text-slate-400 font-medium">
                                                هیچ رویداد ورود، خروج یا سفارش فعالی برای این کالا ثبت نشده است.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredEntries.map((c, idx) => {
                                            const isPipelineRow = !c.isPhysical;
                                            return (
                                                <tr 
                                                    key={c.id || idx} 
                                                    className={`hover:bg-slate-50 transition ${isPipelineRow ? 'bg-amber-50/30' : ''}`}
                                                >
                                                    <td className="p-3 text-center font-mono text-slate-400">{idx + 1}</td>
                                                    <td className="p-3 font-mono text-slate-700 whitespace-nowrap">{c.date}</td>
                                                    <td className="p-3 font-semibold text-slate-800">
                                                        <div className="flex items-center gap-1.5">
                                                            {c.docTypeLabel}
                                                            {isPipelineRow && (
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-normal">
                                                                    در راه
                                                                </span>
                                                            )}
                                                        </div>
                                                        {c.notes && <p className="text-[10px] text-slate-400 font-normal mt-0.5">{c.notes}</p>}
                                                    </td>
                                                    <td className="p-3 text-center font-mono text-indigo-700 font-bold whitespace-nowrap">
                                                        {c.docNumber}
                                                    </td>
                                                    <td className="p-3 text-slate-700 font-medium whitespace-nowrap">
                                                        {c.partyName}
                                                    </td>

                                                    {/* Inflow */}
                                                    <td className="p-3 text-center font-mono font-bold text-emerald-600 bg-emerald-50/20">
                                                        {c.inQty > 0 ? c.inQty.toLocaleString() : '-'}
                                                    </td>
                                                    <td className="p-3 text-center font-mono text-emerald-700 bg-emerald-50/20 text-[11px]">
                                                        {c.inCartons > 0 ? `${c.inCartons} (${c.inCBM} m³)` : '-'}
                                                    </td>

                                                    {/* Outflow */}
                                                    <td className="p-3 text-center font-mono font-bold text-rose-600 bg-rose-50/20">
                                                        {c.outQty > 0 ? c.outQty.toLocaleString() : '-'}
                                                    </td>
                                                    <td className="p-3 text-center font-mono text-rose-700 bg-rose-50/20 text-[11px]">
                                                        {c.outCartons > 0 ? `${c.outCartons} (${c.outCBM} m³)` : '-'}
                                                    </td>

                                                    {/* Running Balances */}
                                                    <td className="p-3 text-center font-mono font-bold text-slate-900 bg-amber-50/20">
                                                        {c.runningQty.toLocaleString()}
                                                    </td>
                                                    <td className="p-3 text-center font-mono font-semibold text-slate-700 bg-amber-50/20">
                                                        {c.runningCartons.toLocaleString()}
                                                    </td>
                                                    <td className="p-3 text-center font-mono font-bold text-indigo-700 bg-indigo-50/20">
                                                        {c.runningCBM} <span className="text-[10px] font-normal">m³</span>
                                                    </td>

                                                    {/* Unit Price */}
                                                    <td className="p-3 text-center font-mono text-slate-600">
                                                        {c.unitPrice ? `${c.unitPrice.toLocaleString()} ${c.currency}` : '-'}
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
            )}

            {/* ========================================================================= */}
            {/* VIEW 2: ALL PRODUCTS INVENTORY & PIPELINE MATRIX                          */}
            {/* ========================================================================= */}
            {viewMode === 'all_products_matrix' && (
                <div className="space-y-4">
                    {/* Matrix Filters */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-700">فیلتر وضعیت موجودی:</span>
                            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                                <button
                                    onClick={() => setMatrixStockFilter('all')}
                                    className={`px-3 py-1 rounded-lg font-medium transition ${matrixStockFilter === 'all' ? 'bg-white text-indigo-700 font-bold shadow-xs' : 'text-slate-600'}`}
                                >
                                    همه اقلام ({allProductSummaries.length})
                                </button>
                                <button
                                    onClick={() => setMatrixStockFilter('in_stock')}
                                    className={`px-3 py-1 rounded-lg font-medium transition ${matrixStockFilter === 'in_stock' ? 'bg-white text-emerald-700 font-bold shadow-xs' : 'text-slate-600'}`}
                                >
                                    موجود در انبار ({allProductSummaries.filter(s => s.physicalStockQty > 0).length})
                                </button>
                                <button
                                    onClick={() => setMatrixStockFilter('in_pipeline')}
                                    className={`px-3 py-1 rounded-lg font-medium transition ${matrixStockFilter === 'in_pipeline' ? 'bg-white text-amber-700 font-bold shadow-xs' : 'text-slate-600'}`}
                                >
                                    دارای سفارش در راه ({allProductSummaries.filter(s => s.pipelineStockQty > 0).length})
                                </button>
                                <button
                                    onClick={() => setMatrixStockFilter('zero_stock')}
                                    className={`px-3 py-1 rounded-lg font-medium transition ${matrixStockFilter === 'zero_stock' ? 'bg-white text-slate-800 font-bold shadow-xs' : 'text-slate-600'}`}
                                >
                                    اتمام موجودی ({allProductSummaries.filter(s => s.physicalStockQty <= 0).length})
                                </button>
                                <button
                                    onClick={() => setMatrixStockFilter('discrepancy')}
                                    className={`px-3 py-1 rounded-lg font-medium transition ${matrixStockFilter === 'discrepancy' ? 'bg-white text-rose-700 font-bold shadow-xs' : 'text-slate-600'}`}
                                >
                                    دارای مغایرت ({allProductSummaries.filter(s => s.hasDiscrepancies).length})
                                </button>
                            </div>
                        </div>

                        <div className="w-full md:w-72">
                            <input
                                type="text"
                                value={matrixSearch}
                                onChange={(e) => setMatrixSearch(e.target.value)}
                                placeholder="جستجوی کد داخلی، پارت‌نامبر، نام کالا..."
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Matrix Grid Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-right text-xs">
                                <thead>
                                    <tr className="bg-slate-800 text-white font-bold">
                                        <th className="p-3 text-center">ردیف</th>
                                        <th className="p-3">کد داخلی</th>
                                        <th className="p-3">پارت‌نامبر</th>
                                        <th className="p-3">شرح کالا</th>
                                        <th className="p-3 text-center">بسته‌بندی</th>
                                        <th className="p-3 text-center">CBM کارتن</th>
                                        <th className="p-3 text-center text-emerald-300 bg-emerald-950/60">موجودی فیزیکی</th>
                                        <th className="p-3 text-center text-emerald-300 bg-emerald-950/60">کارتن دپو</th>
                                        <th className="p-3 text-center text-indigo-300 bg-indigo-950/60">حجم انبار (CBM)</th>
                                        <th className="p-3 text-center text-amber-300 bg-amber-950/60">سفارشات در راه</th>
                                        <th className="p-3 text-center">بهای تمام‌شده (AED)</th>
                                        <th className="p-3 text-center">ارزش کل موجودی</th>
                                        <th className="p-3 text-center">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {filteredMatrixList.length === 0 ? (
                                        <tr>
                                            <td colSpan={13} className="p-12 text-center text-slate-400 font-medium">
                                                کالایی با شرایط جستجو و فیلتر تعیین شده یافت نشد.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredMatrixList.map((s, idx) => (
                                            <tr key={s.productId || idx} className="hover:bg-slate-50 transition">
                                                <td className="p-3 text-center font-mono text-slate-400">{idx + 1}</td>
                                                <td className="p-3 font-mono font-bold text-indigo-700">
                                                    {s.internalCode}
                                                    {s.isTemporaryItem && (
                                                        <span className="mr-1 px-1.5 py-0.5 rounded text-[9px] bg-amber-100 text-amber-800">
                                                            موقت
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 font-mono text-slate-600">{s.partNumber || '---'}</td>
                                                <td className="p-3 font-medium text-slate-800 max-w-xs truncate" title={s.productNameFa}>
                                                    {s.productNameFa}
                                                </td>
                                                <td className="p-3 text-center font-mono text-slate-600">
                                                    {s.itemsPerCarton} عدد
                                                </td>
                                                <td className="p-3 text-center font-mono text-indigo-600">
                                                    {s.cartonCBM} m³
                                                </td>
                                                <td className="p-3 text-center font-mono font-bold text-emerald-700 bg-emerald-50/20">
                                                    {s.physicalStockQty.toLocaleString()}
                                                </td>
                                                <td className="p-3 text-center font-mono text-emerald-800 bg-emerald-50/20">
                                                    {s.physicalStockCartons.toLocaleString()}
                                                </td>
                                                <td className="p-3 text-center font-mono font-bold text-indigo-700 bg-indigo-50/20">
                                                    {s.physicalStockCBM} m³
                                                </td>
                                                <td className="p-3 text-center font-mono font-bold text-amber-700 bg-amber-50/20">
                                                    {s.pipelineStockQty > 0 ? `${s.pipelineStockQty.toLocaleString()} عدد` : '-'}
                                                </td>
                                                <td className="p-3 text-center font-mono text-slate-700">
                                                    {s.averageLandedCostAED.toLocaleString()}
                                                </td>
                                                <td className="p-3 text-center font-mono font-bold text-slate-800">
                                                    {s.totalStockValueAED.toLocaleString()} AED
                                                </td>
                                                <td className="p-3 text-center">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedProductId(s.productId);
                                                            setViewMode('single_cardex');
                                                        }}
                                                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold transition"
                                                    >
                                                        مشاهده کارتکس
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 3: SUPPLY CHAIN & ORDER DELIVERY CHAIN                               */}
            {/* ========================================================================= */}
            {viewMode === 'order_delivery_chain' && (
                <div className="space-y-4">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                            <span className="w-2.5 h-2.5 bg-blue-600 rounded-full" />
                            زنجیره لجستیک، سفارشات بازرگانی و مراحل تحویل کالا به انبار
                        </h3>
                        <p className="text-xs text-slate-500 mb-4">
                            ارتباط مستقیم سفارشات خرید خارجی (PO) با موجودی‌های در راه (In-Transit)، گمرک و ترخیص و موجودی قطعی تحویل شده به انبار.
                        </p>

                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-right text-xs">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                                        <th className="p-3">شماره سفارش (PO)</th>
                                        <th className="p-3">تامین‌کننده</th>
                                        <th className="p-3 text-center">مرحله و وضعیت لجستیک</th>
                                        <th className="p-3 text-center">تاریخ سفارش</th>
                                        <th className="p-3 text-center">تخمین بارگیری / ورود</th>
                                        <th className="p-3 text-center text-indigo-700">تعداد کل اقلام</th>
                                        <th className="p-3 text-center text-indigo-700">حجم کل (CBM)</th>
                                        <th className="p-3 text-center">وزن ناخالص (kg)</th>
                                        <th className="p-3 text-center">نوع اثر در انبار</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {orders.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="p-8 text-center text-slate-400">
                                                سفارشی در سیستم ثبت نشده است.
                                            </td>
                                        </tr>
                                    ) : (
                                        orders.map(order => {
                                            const isDelivered = ['Delivered', 'Invoiced', 'Final (System)'].includes(order.status) || order.isFinalized;
                                            const isInTransit = ['On Board', 'In Transit', 'Arrival', 'Customs'].includes(order.status);
                                            const totalQty = (order.items || []).reduce((s, it) => s + (it.quantity || 0), 0);

                                            return (
                                                <tr key={order.id} className="hover:bg-slate-50 transition">
                                                    <td className="p-3 font-mono font-bold text-indigo-700">{order.id}</td>
                                                    <td className="p-3 font-semibold text-slate-800">{order.supplier}</td>
                                                    <td className="p-3 text-center">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                                            isDelivered 
                                                                ? 'bg-emerald-100 text-emerald-800' 
                                                                : isInTransit 
                                                                ? 'bg-cyan-100 text-cyan-800'
                                                                : 'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            {order.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center font-mono text-slate-600">{order.orderDate}</td>
                                                    <td className="p-3 text-center font-mono text-slate-600">{order.approxLoadingDate || 'نامشخص'}</td>
                                                    <td className="p-3 text-center font-mono font-bold text-slate-800">{totalQty.toLocaleString()}</td>
                                                    <td className="p-3 text-center font-mono font-bold text-indigo-700">{order.volumeCBM || 0} m³</td>
                                                    <td className="p-3 text-center font-mono text-slate-600">{order.totalGrossWeight || 0} kg</td>
                                                    <td className="p-3 text-center font-medium">
                                                        {isDelivered ? (
                                                            <span className="text-emerald-700 font-bold text-[11px]">📥 ورود قطعی به انبار</span>
                                                        ) : isInTransit ? (
                                                            <span className="text-cyan-700 font-bold text-[11px]">🔄 کالای بین‌راهی (در راه)</span>
                                                        ) : (
                                                            <span className="text-amber-700 font-bold text-[11px]">⏳ خط تولید و تعهد خرید</span>
                                                        )}
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
            )}

            {/* ========================================================================= */}
            {/* UNIVERSAL SYNC RESULT MODAL                                               */}
            {/* ========================================================================= */}
            {isSyncModalOpen && syncResult && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-right space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">✓</span>
                                نتیجه همگام‌سازی صددرصدی مشخصات کالا و کاردکس
                            </h3>
                            <button 
                                onClick={() => setIsSyncModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 py-1 text-xs">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <span className="text-slate-500">سفارشات به‌روز شده:</span>
                                <p className="text-base font-bold text-indigo-700 mt-1 font-mono">{syncResult.updatedOrdersCount}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <span className="text-slate-500">فاکتورهای خرید همگام‌شده:</span>
                                <p className="text-base font-bold text-indigo-700 mt-1 font-mono">{syncResult.updatedPurchaseInvoicesCount}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <span className="text-slate-500">فاکتورهای فروش تطبیق‌یافته:</span>
                                <p className="text-base font-bold text-indigo-700 mt-1 font-mono">{syncResult.updatedSalesInvoicesCount}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <span className="text-slate-500">مغایرت‌های برطرف‌شده:</span>
                                <p className="text-base font-bold text-emerald-700 mt-1 font-mono">{syncResult.discrepanciesResolved}</p>
                            </div>
                        </div>

                        {syncResult.details.length > 0 && (
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 max-h-48 overflow-y-auto space-y-1 text-[11px] text-slate-700">
                                <p className="font-bold text-slate-800 mb-1">ریز عملیات اصلاح داده‌ها:</p>
                                {syncResult.details.map((d, i) => (
                                    <p key={i} className="text-slate-600">• {d}</p>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={() => setIsSyncModalOpen(false)}
                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                        >
                            تایید و بستن
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
