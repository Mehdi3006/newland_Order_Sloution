import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { useLiveQuery } from 'dexie-react-hooks';
import { Product, PurchaseInvoice, SalesInvoice, JournalVoucher, DetailedLedgerAccount } from '../../types';
import { db } from '../../db';
import { syncAllProductsDetailedAccounts, cascadeSyncSalesInvoiceVoucher, ensureProductDetailedAccount } from '../../utils/accountingEngine';

interface ProductAccountingLedgerTabProps {
    products?: Product[];
    purchaseInvoices?: PurchaseInvoice[];
    salesInvoices?: SalesInvoice[];
    journalVouchers?: JournalVoucher[];
    detailedAccounts?: DetailedLedgerAccount[];
    onOpenCreateSalesInvoice?: (initialItems: { productId: string; internalCode: string; productName: string; quantity: number; unitPrice: number; cartonCount: number; cbm: number; grossWeight: number }[]) => void;
}

export const ProductAccountingLedgerTab: React.FC<ProductAccountingLedgerTabProps> = ({
    products: propProducts,
    purchaseInvoices: propPurchaseInvoices,
    salesInvoices: propSalesInvoices,
    journalVouchers: propJournalVouchers,
    detailedAccounts: propDetailedAccounts,
    onOpenCreateSalesInvoice
}) => {
    // Database hooks if props not supplied
    const dbProducts = useLiveQuery(() => db.products.filter(p => !p.deletedAt).toArray(), []) || [];
    const dbPurchases = useLiveQuery(() => db.purchaseInvoices.toArray(), []) || [];
    const dbSales = useLiveQuery(() => db.salesInvoices.toArray(), []) || [];
    const dbVouchers = useLiveQuery(() => db.journalVouchers.toArray(), []) || [];
    const dbDetailed = useLiveQuery(() => db.detailedLedgerAccounts.toArray(), []) || [];

    const products = propProducts || dbProducts;
    const purchaseInvoices = propPurchaseInvoices || dbPurchases;
    const salesInvoices = propSalesInvoices || dbSales;
    const journalVouchers = propJournalVouchers || dbVouchers;
    const detailedAccounts = propDetailedAccounts || dbDetailed;

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [salesPreviewProduct, setSalesPreviewProduct] = useState<Product | null>(null);
    const [previewMarginPercent, setPreviewMarginPercent] = useState<number>(25);
    const [previewQuantity, setPreviewQuantity] = useState<number>(100);
    const [customUnitPriceAED, setCustomUnitPriceAED] = useState<number | null>(null);

    // Compute stock & costing metrics for each product
    const productLedgerData = useMemo(() => {
        return products.map(product => {
            const cleanCode = (product.internalCode || '').trim().toLowerCase();

            // Total Purchased Qty & Cost in AED/USD
            let totalPurchasedQty = 0;
            let totalPurchasedCostAED = 0;
            const purchasesHistory: { invoiceNumber: string; date: string; supplier: string; qty: number; unitPrice: number; currency: string }[] = [];

            purchaseInvoices.forEach(inv => {
                if (inv.status === 'voided') return;
                inv.items.forEach(item => {
                    const match = (item.productId && item.productId === product.id) || 
                                  (item.internalCode && item.internalCode.trim().toLowerCase() === cleanCode);
                    if (match) {
                        const q = Number(item.quantity) || 0;
                        const p = Number(item.unitPrice) || 0;
                        totalPurchasedQty += q;
                        // Convert to AED if needed
                        const rateToAED = inv.currency === 'USD' ? 3.6725 : (inv.currency as string) === 'CNY' ? 0.51 : 1;
                        totalPurchasedCostAED += (q * p * rateToAED);
                        purchasesHistory.push({
                            invoiceNumber: inv.invoiceNumber,
                            date: inv.date,
                            supplier: inv.supplierName,
                            qty: q,
                            unitPrice: p,
                            currency: inv.currency
                        });
                    }
                });
            });

            // Total Sold Qty & Revenue in AED
            let totalSoldQty = 0;
            let totalSoldRevenueAED = 0;
            const salesHistory: { invoiceNumber: string; date: string; customer: string; qty: number; unitPrice: number; currency: string }[] = [];

            salesInvoices.forEach(inv => {
                if (inv.status === 'voided') return;
                inv.items.forEach(item => {
                    const match = (item.productId && item.productId === product.id) || 
                                  (item.internalCode && item.internalCode.trim().toLowerCase() === cleanCode);
                    if (match) {
                        const q = Number(item.quantity) || 0;
                        const p = Number(item.unitPrice) || 0;
                        totalSoldQty += q;
                        const rateToAED = inv.currency === 'USD' ? 3.6725 : 1;
                        totalSoldRevenueAED += (q * p * rateToAED);
                        salesHistory.push({
                            invoiceNumber: inv.invoiceNumber,
                            date: inv.date,
                            customer: inv.customerName,
                            qty: q,
                            unitPrice: p,
                            currency: inv.currency
                        });
                    }
                });
            });

            // Current Physical Stock in Dubai
            const physicalStock = Math.max(0, totalPurchasedQty - totalSoldQty);

            // Real Landed Cost per unit (WAC in AED)
            const realUnitCostAED = totalPurchasedQty > 0 
                ? (totalPurchasedCostAED / totalPurchasedQty) 
                : (product.landedCostAED || (product.purchasePriceUSD * 3.6725) || 0);

            // Target Dubai Commercial Selling Price (Default: Real Landed Cost + 25% Margin)
            const suggestedDubaiSalePriceAED = Number((realUnitCostAED * 1.25).toFixed(2));

            // Associated Detailed Account in COA (under 1104)
            const matchingDetailAccount = detailedAccounts.find(d => 
                (d.subsidiaryLedgerAccountId === '1104' || d.code.startsWith('1104')) &&
                (d.code.includes(cleanCode) || d.name.toLowerCase().includes(cleanCode) || (product.productNameFa && d.name.includes(product.productNameFa)))
            );

            return {
                product,
                totalPurchasedQty,
                totalSoldQty,
                physicalStock,
                realUnitCostAED,
                suggestedDubaiSalePriceAED,
                totalStockValueAED: physicalStock * realUnitCostAED,
                purchasesHistory,
                salesHistory,
                detailedAccountCode: matchingDetailAccount?.code || `1104-${product.internalCode || product.id.slice(0, 4)}`
            };
        });
    }, [products, purchaseInvoices, salesInvoices, detailedAccounts]);

    // Filtered
    const filteredLedgerData = useMemo(() => {
        if (!searchQuery.trim()) return productLedgerData;
        const q = searchQuery.trim().toLowerCase();
        return productLedgerData.filter(item => 
            (item.product.internalCode && item.product.internalCode.toLowerCase().includes(q)) ||
            (item.product.supplierCode && item.product.supplierCode.toLowerCase().includes(q)) ||
            (item.product.productNameFa && item.product.productNameFa.toLowerCase().includes(q)) ||
            (item.product.description && item.product.description.toLowerCase().includes(q))
        );
    }, [productLedgerData, searchQuery]);

    // Selected product detailed ledger
    const selectedItem = useMemo(() => {
        return productLedgerData.find(p => p.product.id === selectedProductId) || null;
    }, [productLedgerData, selectedProductId]);

    // Export Real Dubai Inventory to Excel
    const handleExportDubaiInventoryExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Newland Trading Group';
        const sheet = workbook.addWorksheet('Dubai_Real_Inventory', { views: [{ rightToLeft: true }] });

        sheet.mergeCells('A1:H1');
        const title = sheet.getCell('A1');
        title.value = 'گزارش کاردکس و ارزش دفتری موجودی انبار دبی - گروه بازرگانی بین‌المللی نیولند';
        title.font = { name: 'Tahoma', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        title.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 32;

        const headers = ['کد یکتا نیولند', 'نام کالا', 'کد تفصیلی حسابداری', 'مجموع ورودی (خرید)', 'مجموع خروجی (فروش)', 'موجودی انبار دبی', 'بهای تمام‌شده واقعی (AED)', 'ارزش دفتری موجودی (AED)'];
        const hRow = sheet.addRow(headers);
        hRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        hRow.alignment = { horizontal: 'center', vertical: 'middle' };

        filteredLedgerData.forEach(item => {
            const r = sheet.addRow([
                item.product.internalCode,
                item.product.productNameFa || item.product.description,
                item.detailedAccountCode,
                item.totalPurchasedQty,
                item.totalSoldQty,
                item.physicalStock,
                item.realUnitCostAED.toFixed(2),
                item.totalStockValueAED.toFixed(2)
            ]);
            r.font = { name: 'Tahoma', size: 9 };
            r.alignment = { horizontal: 'center', vertical: 'middle' };
            r.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
        });

        // Totals
        const totalStockQty = filteredLedgerData.reduce((s, i) => s + i.physicalStock, 0);
        const totalValuation = filteredLedgerData.reduce((s, i) => s + i.totalStockValueAED, 0);
        const totRow = sheet.addRow(['جمع کل انبار دبی', '', '', '', '', totalStockQty, '', totalValuation.toFixed(2)]);
        totRow.font = { name: 'Tahoma', size: 10, bold: true };
        totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

        sheet.columns = [
            { width: 16 },
            { width: 34 },
            { width: 20 },
            { width: 18 },
            { width: 18 },
            { width: 18 },
            { width: 22 },
            { width: 24 }
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewLand_Dubai_Real_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Trigger Sales Invoice Preview
    const handleOpenSalesPreview = (prod: Product) => {
        const itemInfo = productLedgerData.find(p => p.product.id === prod.id);
        const baseCost = itemInfo ? itemInfo.realUnitCostAED : (prod.landedCostAED || prod.purchasePriceUSD * 3.6725);
        setSalesPreviewProduct(prod);
        setPreviewMarginPercent(25);
        setPreviewQuantity(itemInfo?.physicalStock && itemInfo.physicalStock > 0 ? itemInfo.physicalStock : 100);
        setCustomUnitPriceAED(Number((baseCost * 1.25).toFixed(2)));
    };

    const [isCreatingDirectInvoice, setIsCreatingDirectInvoice] = useState(false);
    const [invoiceCreatedSuccess, setInvoiceCreatedSuccess] = useState<string | null>(null);
    const [isSyncingCOA, setIsSyncingCOA] = useState(false);

    // Synchronize catalog with Chart of Accounts 1104
    const handleSyncCatalogToCOA = async () => {
        setIsSyncingCOA(true);
        try {
            const res = await syncAllProductsDetailedAccounts();
            alert(`همگام‌سازی دفاتر کل با موفقیت انجام شد: ${res.productsSynced} قلم کالا با حساب‌های تفصیلی دفتر کالا (کد ۱۱۰۴) منطبق شدند.`);
        } catch (err: any) {
            alert(`خطا در همگام‌سازی دفاتر: ${err.message}`);
        } finally {
            setIsSyncingCOA(false);
        }
    };

    const handleConfirmAndSendToSalesInvoice = async () => {
        if (!salesPreviewProduct) return;
        const itemInfo = productLedgerData.find(p => p.product.id === salesPreviewProduct.id);
        const baseCost = itemInfo ? itemInfo.realUnitCostAED : (salesPreviewProduct.landedCostAED || salesPreviewProduct.purchasePriceUSD * 3.6725);
        const unitPrice = customUnitPriceAED !== null ? customUnitPriceAED : Number((baseCost * (1 + previewMarginPercent / 100)).toFixed(2));
        
        const cartonCount = Math.max(1, Math.ceil(previewQuantity / (salesPreviewProduct.itemsPerCarton || 1)));
        const cbm = Number(((salesPreviewProduct.cartonCBM || 0.1) * cartonCount).toFixed(3));
        const grossWeight = Number(((salesPreviewProduct.grossWeight || 5) * cartonCount).toFixed(2));

        if (onOpenCreateSalesInvoice) {
            onOpenCreateSalesInvoice([
                {
                    productId: salesPreviewProduct.id,
                    internalCode: salesPreviewProduct.internalCode || '',
                    productName: salesPreviewProduct.productNameFa || salesPreviewProduct.description || '',
                    quantity: previewQuantity,
                    unitPrice: unitPrice,
                    cartonCount: cartonCount,
                    cbm: cbm,
                    grossWeight: grossWeight
                }
            ]);
            setSalesPreviewProduct(null);
        } else {
            // Direct generation of formal Dubai Sales Invoice + Journal Voucher
            setIsCreatingDirectInvoice(true);
            try {
                const totalAmount = unitPrice * previewQuantity;
                const invNumber = `DUB-INV-${Date.now().toString().slice(-6)}`;
                const newSalesInvoice: SalesInvoice = {
                    id: `sinv-dubai-${Date.now()}`,
                    invoiceNumber: invNumber,
                    customerName: 'شرکت توزیع و بازرگانی دبی (سیستم مستقل)',
                    customerPhone: '+971-4-0000000',
                    date: new Date().toISOString().split('T')[0],
                    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                    currency: 'AED',
                    currencyRate: 1,
                    totalAmount: totalAmount,
                    subtotal: totalAmount,
                    discount: 0,
                    tax: 0,
                    paidAmount: 0,
                    status: 'unpaid',
                    createdAt: new Date().toISOString(),
                    items: [
                        {
                            id: `sitem-${Date.now()}`,
                            productId: salesPreviewProduct.id,
                            internalCode: salesPreviewProduct.internalCode || '',
                            productName: salesPreviewProduct.productNameFa || salesPreviewProduct.description || '',
                            quantity: previewQuantity,
                            unitPrice: unitPrice,
                            totalPrice: totalAmount,
                            cartonCount: cartonCount,
                            cbm: cbm,
                            grossWeight: grossWeight
                        }
                    ],
                    notes: `فاکتور رسمی فروش انتقالی به سیستم دبی بر اساس بهای تمام شده واقعی (${baseCost.toFixed(2)} AED) با مارجین سود تجاری ${previewMarginPercent}٪`
                };

                await db.salesInvoices.add(newSalesInvoice);
                await cascadeSyncSalesInvoiceVoucher(newSalesInvoice);
                setInvoiceCreatedSuccess(`فاکتور فروش شماره ${invNumber} به مبلغ ${totalAmount.toLocaleString()} AED همراه با سند دوبل حسابداری صادر و در دفتر دبی ثبت شد.`);
                setSalesPreviewProduct(null);
            } catch (err: any) {
                alert(`خطا در صدور فاکتور: ${err.message}`);
            } finally {
                setIsCreatingDirectInvoice(false);
            }
        }
    };

    return (
        <div className="space-y-6">
            {/* Top Bar Banner & Notice */}
            <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-3xl border border-slate-800 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
                        <h2 className="text-base sm:text-lg font-black tracking-tight">
                            دفاتر مالی، کاردکس انبار و فروش به سیستم دبی (Dubai Real Ledger)
                        </h2>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                        این بخش به حسابداری و فاکتورهای واقعی متصل است. در اینجا ارزش دارایی انبار دبی بر اساس بهای تمام‌شده واقعی محاسبه شده و امکان صدور فاکتور فروش رسمی به شرکت دبی (با مارجین سود ۲۵-۳۰٪ و بازبینی نهایی) فراهم است.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={handleSyncCatalogToCOA}
                        disabled={isSyncingCOA}
                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 text-white font-bold text-xs rounded-2xl shadow-sm transition flex items-center gap-1.5"
                    >
                        <span>{isSyncingCOA ? '⏳ در حال اتصال...' : '🔗 اتصال کاتالوگ به دفتر کالا (۱۱۰۴)'}</span>
                    </button>
                    <button
                        onClick={handleExportDubaiInventoryExcel}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-2xl shadow-sm transition flex items-center gap-2"
                    >
                        <span>📊 خروجی اکسل کاردکس انبار</span>
                    </button>
                </div>
            </div>

            {/* Success Alert Banner */}
            {invoiceCreatedSuccess && (
                <div className="bg-emerald-50 border-2 border-emerald-300 text-emerald-900 p-4 rounded-2xl flex justify-between items-center text-xs font-bold shadow-sm">
                    <div className="flex items-center gap-2">
                        <span className="text-emerald-600 text-base">✓</span>
                        <span>{invoiceCreatedSuccess}</span>
                    </div>
                    <button
                        onClick={() => setInvoiceCreatedSuccess(null)}
                        className="text-emerald-700 hover:text-emerald-900 px-2 py-1 bg-emerald-100 rounded-lg"
                    >
                        ✕ بستن
                    </button>
                </div>
            )}

            {/* Search & KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="text-[11px] text-slate-400 font-bold block mb-1">تعداد کل اقلام کاتالوگ:</span>
                    <span className="text-xl font-mono font-black text-slate-800">{products.length} قلم</span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="text-[11px] text-slate-400 font-bold block mb-1">موجودی فیزیکی در انبار دبی:</span>
                    <span className="text-xl font-mono font-black text-emerald-600">
                        {productLedgerData.reduce((s, i) => s + i.physicalStock, 0).toLocaleString()} عدد
                    </span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="text-[11px] text-slate-400 font-bold block mb-1">ارزش دفتری کل انبار دبی:</span>
                    <span className="text-xl font-mono font-black text-indigo-600">
                        {productLedgerData.reduce((s, i) => s + i.totalStockValueAED, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} AED
                    </span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="جستجوی کد نیولند، نام کالا..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
            </div>

            {/* Main Content Grid: Product Table & Detailed Card */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Table: Real Products Inventory */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100 text-xs font-semibold text-slate-600">
                        <span>فهرست محصولات در کاردکس و دفاتر مالی</span>
                        <span>نمایش: {filteredLedgerData.length} کالا</span>
                    </div>

                    <div className="overflow-x-auto max-h-[620px] overflow-y-auto border border-slate-200 rounded-2xl">
                        <table className="w-full text-right text-xs">
                            <thead className="bg-slate-50 text-slate-700 font-bold sticky top-0 border-b border-slate-200 z-10">
                                <tr>
                                    <th className="p-3">کد یکتا</th>
                                    <th className="p-3">نام و شرح کالا</th>
                                    <th className="p-3 text-center">موجودی دبی</th>
                                    <th className="p-3 text-center">بهای تمام‌شده واقعی</th>
                                    <th className="p-3 text-center">پیشنهاد فروش دبی</th>
                                    <th className="p-3 text-center">عملیات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredLedgerData.map(item => {
                                    const isSelected = selectedProductId === item.product.id;
                                    return (
                                        <tr 
                                            key={item.product.id}
                                            onClick={() => setSelectedProductId(item.product.id)}
                                            className={`hover:bg-indigo-50/40 cursor-pointer transition ${isSelected ? 'bg-indigo-50/80 font-medium' : ''}`}
                                        >
                                            <td className="p-3 font-mono font-bold text-indigo-700 whitespace-nowrap">
                                                {item.product.internalCode}
                                            </td>
                                            <td className="p-3">
                                                <div className="font-bold text-slate-800 line-clamp-1">{item.product.productNameFa || item.product.description}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">تفصیلی: {item.detailedAccountCode}</div>
                                            </td>
                                            <td className="p-3 text-center font-mono">
                                                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${item.physicalStock > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                                                    {item.physicalStock.toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center font-mono text-slate-700 font-semibold">
                                                {item.realUnitCostAED.toFixed(2)} AED
                                            </td>
                                            <td className="p-3 text-center font-mono text-indigo-600 font-bold">
                                                {item.suggestedDubaiSalePriceAED.toFixed(2)} AED
                                            </td>
                                            <td className="p-3 text-center whitespace-nowrap">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenSalesPreview(item.product);
                                                    }}
                                                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition shadow-xs"
                                                    title="محاسبه و صدور فاکتور فروش به سیستم دبی با سود ۲۵-۳۰٪"
                                                >
                                                    فروش به دبی ←
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Side: Detailed Cardex & Transaction History */}
                <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
                    <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                <span className="w-2 h-2 bg-indigo-600 rounded-full" />
                                {selectedItem ? `کاردکس: ${selectedItem.product.internalCode}` : 'کاردکس تفکیکی کالا'}
                            </h3>
                            {selectedItem && (
                                <p className="text-xs text-slate-500 mt-0.5">{selectedItem.product.productNameFa || selectedItem.product.description}</p>
                            )}
                        </div>
                    </div>

                    {!selectedItem ? (
                        <div className="p-12 text-center text-xs text-slate-400 leading-relaxed">
                            جهت مشاهده کاردکس، سوابق فاکتورهای خرید، فاکتورهای فروش و صدور صورتحساب، روی یکی از ردیف‌های جدول کلیک کنید.
                        </div>
                    ) : (
                        <div className="space-y-4 text-xs">
                            {/* Quick Metrics */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                    <span className="text-[10px] text-slate-400 block font-bold">مجموع ورودی خرید:</span>
                                    <span className="font-mono font-bold text-slate-800 text-sm">{selectedItem.totalPurchasedQty.toLocaleString()} عدد</span>
                                </div>
                                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                    <span className="text-[10px] text-slate-400 block font-bold">مجموع خروجی فروش:</span>
                                    <span className="font-mono font-bold text-slate-800 text-sm">{selectedItem.totalSoldQty.toLocaleString()} عدد</span>
                                </div>
                            </div>

                            {/* Purchase History */}
                            <div className="space-y-2">
                                <span className="font-bold text-slate-700 block text-xs flex items-center justify-between">
                                    <span>📦 سوابق فاکتورهای خرید (ورود):</span>
                                    <span className="text-[10px] text-slate-400 font-normal">{selectedItem.purchasesHistory.length} فاکتور</span>
                                </span>
                                {selectedItem.purchasesHistory.length === 0 ? (
                                    <div className="p-3 bg-slate-50 rounded-xl text-center text-slate-400 text-[11px]">فاکتور خریدی ثبت نشده است.</div>
                                ) : (
                                    <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-100 rounded-xl p-1.5">
                                        {selectedItem.purchasesHistory.map((p, idx) => (
                                            <div key={idx} className="p-2 bg-emerald-50/50 border border-emerald-100 rounded-lg flex justify-between items-center text-[11px]">
                                                <div>
                                                    <span className="font-mono font-bold text-emerald-800">{p.invoiceNumber}</span>
                                                    <span className="text-slate-500 mr-2 text-[10px]">{p.supplier}</span>
                                                </div>
                                                <div className="font-mono text-slate-700">
                                                    {p.qty} عدد × {p.unitPrice} {p.currency}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Sales History */}
                            <div className="space-y-2">
                                <span className="font-bold text-slate-700 block text-xs flex items-center justify-between">
                                    <span>🛒 سوابق فاکتورهای فروش (خروج):</span>
                                    <span className="text-[10px] text-slate-400 font-normal">{selectedItem.salesHistory.length} فاکتور</span>
                                </span>
                                {selectedItem.salesHistory.length === 0 ? (
                                    <div className="p-3 bg-slate-50 rounded-xl text-center text-slate-400 text-[11px]">فاکتور فروشی ثبت نشده است.</div>
                                ) : (
                                    <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-100 rounded-xl p-1.5">
                                        {selectedItem.salesHistory.map((s, idx) => (
                                            <div key={idx} className="p-2 bg-indigo-50/50 border border-indigo-100 rounded-lg flex justify-between items-center text-[11px]">
                                                <div>
                                                    <span className="font-mono font-bold text-indigo-800">{s.invoiceNumber}</span>
                                                    <span className="text-slate-500 mr-2 text-[10px]">{s.customer}</span>
                                                </div>
                                                <div className="font-mono text-slate-700">
                                                    {s.qty} عدد × {s.unitPrice} {s.currency}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => handleOpenSalesPreview(selectedItem.product)}
                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-2"
                            >
                                <span>🚀 باز کردن فرم صدور فاکتور فروش به دبی</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal: Review & Finalize Dubai Sales Invoice */}
            {salesPreviewProduct && (
                <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                                    بازبینی و صدور فاکتور فروش ارزی به سیستم دبی
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    کالا: {salesPreviewProduct.internalCode} - {salesPreviewProduct.productNameFa || salesPreviewProduct.description}
                                </p>
                            </div>
                            <button
                                onClick={() => setSalesPreviewProduct(null)}
                                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 text-amber-900 leading-relaxed">
                                <span className="font-bold block mb-1">💡 قانون حسابداری بازرگانی نیولند:</span>
                                بهای تمام‌شده واقعی خرید و ترخیص در انبار دبی مبنا قرار گرفته و سود تجاری اعمال می‌شود. شما می‌توانید قیمت و تعداد نهایی را قبل از ثبت سند ویرایش کنید.
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">تعداد فروش (عدد):</label>
                                    <input
                                        type="number"
                                        value={previewQuantity}
                                        onChange={e => setPreviewQuantity(Math.max(1, Number(e.target.value) || 1))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono font-bold text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">درصد سود تجاری پیشنهادی:</label>
                                    <select
                                        value={previewMarginPercent}
                                        onChange={e => {
                                            const m = Number(e.target.value);
                                            setPreviewMarginPercent(m);
                                            const itemInfo = productLedgerData.find(p => p.product.id === salesPreviewProduct.id);
                                            const baseCost = itemInfo ? itemInfo.realUnitCostAED : (salesPreviewProduct.landedCostAED || salesPreviewProduct.purchasePriceUSD * 3.6725);
                                            setCustomUnitPriceAED(Number((baseCost * (1 + m / 100)).toFixed(2)));
                                        }}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold text-slate-800"
                                    >
                                        <option value={15}>۱۵ درصد سود (کف)</option>
                                        <option value={20}>۲۰ درصد سود (متوسط)</option>
                                        <option value={25}>۲۵ درصد سود (استاندارد)</option>
                                        <option value={30}>۳۰ درصد سود (تارگت)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block font-bold text-slate-700 mb-1">قیمت واحد فروش نهایی (درهم AED):</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={customUnitPriceAED !== null ? customUnitPriceAED : ''}
                                    onChange={e => setCustomUnitPriceAED(Number(e.target.value) || 0)}
                                    className="w-full bg-indigo-50/50 border border-indigo-200 rounded-xl p-2.5 font-mono font-black text-indigo-900 text-sm"
                                />
                            </div>

                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex justify-between items-center text-xs font-bold">
                                <span>مبلغ کل فاکتور فروش:</span>
                                <span className="font-mono text-emerald-700 text-sm">
                                    {((customUnitPriceAED || 0) * previewQuantity).toLocaleString('en-US', { minimumFractionDigits: 2 })} AED
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                onClick={() => setSalesPreviewProduct(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleConfirmAndSendToSalesInvoice}
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                            >
                                <span>✓ انتقال به فاکتور فروش دبی</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
