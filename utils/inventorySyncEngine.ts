import ExcelJS from 'exceljs';
import { db } from '../db';
import { Product, Order, OrderItem, PurchaseInvoice, PurchaseInvoiceItem, SalesInvoice, SalesInvoiceItem, CostingSettings, Currency, CompanyInfo } from '../types';
import { sanitizeForIDB } from './sanitize';
import { formatToman, getTomanUnitLabel } from './formatters';

export type CardexDocType = 
    | 'purchase_invoice' 
    | 'sales_invoice' 
    | 'order_delivered' 
    | 'order_pipeline' 
    | 'opening_stock'
    | 'inventory_adjustment';

export interface CardexEntry {
    id: string;
    date: string;
    docType: CardexDocType;
    docTypeLabel: string;
    docNumber: string;
    sourceId: string;
    partyName: string;
    status: string;
    isPhysical: boolean; // True if physical inflow/outflow, false if pipeline/in-transit
    
    // Inflow
    inQty: number;
    inCartons: number;
    inCBM: number;
    inGrossWeight: number;
    
    // Outflow
    outQty: number;
    outCartons: number;
    outCBM: number;
    outGrossWeight: number;
    
    // Pricing
    unitPrice: number;
    currency: Currency;
    totalAmount: number;
    
    // Running Balances
    runningQty: number;
    runningCartons: number;
    runningCBM: number;
    runningGrossWeight: number;
    runningWeightedAverageCostUSD: number;
    runningWeightedAverageCostAED: number;
    runningWeightedAverageCostTOMAN: number;
    
    notes?: string;
    isTemporaryItem?: boolean;
    orderStage?: string;
    approxDeliveryDate?: string;
}

export interface ProductStockSummary {
    productId: string;
    internalCode: string;
    partNumber: string;
    productNameFa: string;
    productNameEn: string;
    itemsPerCarton: number;
    cartonCBM: number;
    unitCBM: number;
    grossWeight: number;
    netWeight: number;
    hsCode: string;
    
    // Physical Warehouse Stock
    physicalStockQty: number;
    physicalStockCartons: number;
    physicalStockCBM: number;
    physicalStockWeight: number;
    
    // In-Transit / Pipeline Stock
    pipelineStockQty: number;
    pipelineStockCartons: number;
    pipelineStockCBM: number;
    
    // Total Expected
    totalExpectedQty: number;
    totalExpectedCartons: number;
    totalExpectedCBM: number;
    
    // Valuation
    averageLandedCostUSD: number;
    averageLandedCostAED: number;
    averageLandedCostTOMAN: number;
    totalStockValueUSD: number;
    totalStockValueAED: number;
    totalStockValueTOMAN: number;
    
    // Data Health
    hasDiscrepancies: boolean;
    discrepancies: string[];
    isTemporaryItem?: boolean;
}

export interface UniversalSyncResult {
    updatedOrdersCount: number;
    updatedPurchaseInvoicesCount: number;
    updatedSalesInvoicesCount: number;
    syncedProductsCount: number;
    discrepanciesResolved: number;
    details: string[];
}

/**
 * Normalizes text for matching (internal code, part number, product names)
 */
export const normalizeCode = (val?: string): string => {
    if (!val) return '';
    return val.trim().toLowerCase().replace(/\s+/g, '');
};

/**
 * Checks if two items refer to the same product across orders, invoices, and catalog
 */
export const isItemMatch = (
    item: { productId?: string; internalCode?: string; partNumber?: string; productName?: string; description?: string },
    target: { id?: string; internalCode?: string; partNumber?: string; supplierCode?: string; name_fa?: string; name_en?: string; description?: string }
): boolean => {
    if (item.productId && target.id && item.productId === target.id) return true;
    
    const itemCode = normalizeCode(item.internalCode);
    const targetCode = normalizeCode(target.internalCode);
    if (itemCode && targetCode && itemCode === targetCode) return true;
    
    const itemPart = normalizeCode(item.partNumber);
    const targetPart = normalizeCode(target.partNumber || target.supplierCode);
    if (itemPart && targetPart && itemPart === targetPart) return true;
    
    const itemName = normalizeCode(item.productName || item.description);
    const targetNameFa = normalizeCode(target.name_fa);
    const targetNameEn = normalizeCode(target.name_en || target.description);
    
    if (itemName && (itemName === targetNameFa || itemName === targetNameEn)) return true;
    
    return false;
};

/**
 * Re-calculates and synchronizes all product specs (CBM, itemsPerCarton, grossWeight, netWeight, HS Code, Names)
 * across db.products, db.orders, db.purchaseInvoices, and db.salesInvoices.
 * Eliminates data discrepancies and updates volumetric metrics.
 */
export async function performUniversalDatabaseSpecsSync(
    products: Product[],
    orders: Order[],
    purchaseInvoices: PurchaseInvoice[],
    salesInvoices: SalesInvoice[]
): Promise<UniversalSyncResult> {
    const details: string[] = [];
    let updatedOrdersCount = 0;
    let updatedPurchaseInvoicesCount = 0;
    let updatedSalesInvoicesCount = 0;
    let discrepanciesResolved = 0;

    // Create lookup dictionaries
    const productByCode = new Map<string, Product>();
    const productById = new Map<string, Product>();
    const productByPart = new Map<string, Product>();

    products.forEach(p => {
        if (p.id) productById.set(p.id, p);
        if (p.internalCode) productByCode.set(normalizeCode(p.internalCode), p);
        if (p.supplierCode) productByPart.set(normalizeCode(p.supplierCode), p);
    });

    // 1. Sync Orders & Order Items
    for (const order of orders) {
        let orderChanged = false;
        let totalVolumeCBM = 0;
        let totalGrossWeight = 0;
        let totalNetWeight = 0;

        const updatedItems = (order.items || []).map(item => {
            const matchedProduct = 
                (item.internalCode ? productByCode.get(normalizeCode(item.internalCode)) : null) ||
                (item.supplierCode ? productByPart.get(normalizeCode(item.supplierCode)) : null) ||
                (item.partNumber ? productByPart.get(normalizeCode(item.partNumber)) : null);

            let newItem = { ...item };

            if (matchedProduct) {
                const hadMismatch = 
                    newItem.itemsPerCarton !== matchedProduct.itemsPerCarton ||
                    newItem.cartonCBM !== matchedProduct.cartonCBM ||
                    (matchedProduct.grossWeight && newItem.grossWeight !== matchedProduct.grossWeight) ||
                    (matchedProduct.hsCode && newItem.hsCode !== matchedProduct.hsCode);

                if (hadMismatch) {
                    discrepanciesResolved++;
                    orderChanged = true;
                    newItem = {
                        ...newItem,
                        internalCode: matchedProduct.internalCode || newItem.internalCode,
                        productNameFa: matchedProduct.productNameFa || newItem.productNameFa,
                        itemsPerCarton: matchedProduct.itemsPerCarton || newItem.itemsPerCarton || 1,
                        cartonCBM: matchedProduct.cartonCBM || newItem.cartonCBM || 0.1,
                        grossWeight: matchedProduct.grossWeight || newItem.grossWeight || 5,
                        netWeight: matchedProduct.netWeight || newItem.netWeight,
                        hsCode: matchedProduct.hsCode || newItem.hsCode,
                    };
                }
            }

            // Recalculate metrics for this item
            const cartons = newItem.itemsPerCarton > 0 ? Math.ceil(newItem.quantity / newItem.itemsPerCarton) : 1;
            totalVolumeCBM += cartons * (newItem.cartonCBM || 0);
            totalGrossWeight += cartons * (newItem.grossWeight || 0);
            totalNetWeight += cartons * (newItem.netWeight || 0);

            return newItem;
        });

        const newVolumeCBM = parseFloat(totalVolumeCBM.toFixed(3));
        const newGrossWeight = parseFloat(totalGrossWeight.toFixed(2));
        const newNetWeight = parseFloat(totalNetWeight.toFixed(2));

        if (orderChanged || order.volumeCBM !== newVolumeCBM || order.totalGrossWeight !== newGrossWeight) {
            orderChanged = true;
            await db.orders.update(order.id, sanitizeForIDB({
                items: updatedItems,
                volumeCBM: newVolumeCBM,
                totalGrossWeight: newGrossWeight,
                totalNetWeight: newNetWeight,
            }));
            updatedOrdersCount++;
            details.push(`سفارش ${order.id}: مشخصات و حجم کل (${newVolumeCBM} CBM) همگام‌سازی شد.`);
        }
    }

    // 2. Sync Purchase Invoices
    for (const inv of purchaseInvoices) {
        let invChanged = false;
        let hasIncomplete = false;

        const updatedItems = (inv.items || []).map(it => {
            const matchedProduct = 
                (it.productId ? productById.get(it.productId) : null) ||
                (it.internalCode ? productByCode.get(normalizeCode(it.internalCode)) : null) ||
                (it.partNumber ? productByPart.get(normalizeCode(it.partNumber)) : null);

            let newIt = { ...it };

            if (matchedProduct) {
                const perCtn = newIt.itemsPerCarton || matchedProduct.itemsPerCarton || 1;
                let calculatedCartons = 1;
                if (newIt.unitType === 'carton') {
                    calculatedCartons = Number(newIt.cartonCount) || (newIt.quantity > 0 ? Math.ceil(newIt.quantity / perCtn) : 1);
                } else if (newIt.unitType === 'mixed') {
                    calculatedCartons = Number(newIt.cartonCount) || 0;
                    if ((Number(newIt.looseUnits) || 0) > 0) {
                        calculatedCartons += Math.ceil((Number(newIt.looseUnits) || 0) / perCtn);
                    }
                    if (calculatedCartons === 0) calculatedCartons = 1;
                } else {
                    calculatedCartons = perCtn > 0 ? Math.ceil(newIt.quantity / perCtn) : (newIt.cartonCount || 1);
                }

                const itemCBM = parseFloat((calculatedCartons * (matchedProduct.cartonCBM || 0.1)).toFixed(3));
                const itemWeight = parseFloat((calculatedCartons * (matchedProduct.grossWeight || 5)).toFixed(2));

                if (newIt.hasMissingInternalCode || newIt.cbm !== itemCBM || newIt.grossWeight !== itemWeight || !newIt.itemsPerCarton) {
                    invChanged = true;
                    discrepanciesResolved++;
                    newIt = {
                        ...newIt,
                        productId: matchedProduct.id,
                        internalCode: matchedProduct.internalCode,
                        partNumber: matchedProduct.supplierCode || newIt.partNumber,
                        productName: matchedProduct.productNameFa || matchedProduct.description || newIt.productName,
                        itemsPerCarton: perCtn,
                        cartonCount: calculatedCartons,
                        cbm: itemCBM,
                        grossWeight: itemWeight,
                        hasMissingInternalCode: false
                    };
                }
            } else if (!newIt.internalCode || !newIt.internalCode.trim()) {
                hasIncomplete = true;
            }

            return newIt;
        });

        if (invChanged || inv.hasIncompleteCodes !== hasIncomplete) {
            await db.purchaseInvoices.update(inv.id, sanitizeForIDB({
                items: updatedItems,
                hasIncompleteCodes: hasIncomplete
            }));
            updatedPurchaseInvoicesCount++;
            details.push(`فاکتور خرید ${inv.invoiceNumber}: اقلام و مشخصات با بانک کالا تطبیق یافت.`);
        }
    }

    // 3. Sync Sales Invoices
    for (const inv of salesInvoices) {
        let invChanged = false;

        const updatedItems = (inv.items || []).map(it => {
            const matchedProduct = 
                (it.productId ? productById.get(it.productId) : null) ||
                (it.internalCode ? productByCode.get(normalizeCode(it.internalCode)) : null);

            let newIt = { ...it };

            if (matchedProduct) {
                const perCtn = newIt.itemsPerCarton || matchedProduct.itemsPerCarton || 1;
                let calculatedCartons = 1;
                if (newIt.unitType === 'carton') {
                    calculatedCartons = Number(newIt.cartonCount) || (newIt.quantity > 0 ? Math.ceil(newIt.quantity / perCtn) : 1);
                } else if (newIt.unitType === 'mixed') {
                    calculatedCartons = Number(newIt.cartonCount) || 0;
                    if ((Number(newIt.looseUnits) || 0) > 0) {
                        calculatedCartons += Math.ceil((Number(newIt.looseUnits) || 0) / perCtn);
                    }
                    if (calculatedCartons === 0) calculatedCartons = 1;
                } else {
                    calculatedCartons = perCtn > 0 ? Math.ceil(newIt.quantity / perCtn) : (newIt.cartonCount || 1);
                }

                const itemCBM = parseFloat((calculatedCartons * (matchedProduct.cartonCBM || 0.1)).toFixed(3));
                const itemWeight = parseFloat((calculatedCartons * (matchedProduct.grossWeight || 5)).toFixed(2));

                if (newIt.cbm !== itemCBM || newIt.grossWeight !== itemWeight || !newIt.itemsPerCarton) {
                    invChanged = true;
                    discrepanciesResolved++;
                    newIt = {
                        ...newIt,
                        productId: matchedProduct.id,
                        internalCode: matchedProduct.internalCode,
                        itemsPerCarton: perCtn,
                        cartonCount: calculatedCartons,
                        cbm: itemCBM,
                        grossWeight: itemWeight,
                        isBlockedFromSale: false
                    };
                }
            }

            return newIt;
        });

        if (invChanged) {
            await db.salesInvoices.update(inv.id, sanitizeForIDB({
                items: updatedItems
            }));
            updatedSalesInvoicesCount++;
            details.push(`فاکتور فروش ${inv.invoiceNumber}: مشخصات اقلام به‌روزرسانی شد.`);
        }
    }

    return {
        updatedOrdersCount,
        updatedPurchaseInvoicesCount,
        updatedSalesInvoicesCount,
        syncedProductsCount: products.length,
        discrepanciesResolved,
        details
    };
}

/**
 * Calculates a complete, zero-discrepancy stock ledger (کاردکس) for a specific product.
 * Integrates:
 * - Purchase Invoices (ورود قطعی به انبار)
 * - Orders delivered / arrived (زنجیره لجستیک و تحویل سفارشات)
 * - Sales Invoices (خروج از انبار)
 * - Pipeline / In-Transit orders (کالای در راه و سفارشات در جریان)
 */
export function calculateComprehensiveCardex(
    product: Product,
    orders: Order[],
    purchaseInvoices: PurchaseInvoice[],
    salesInvoices: SalesInvoice[],
    costingSettings?: CostingSettings | null,
    includePipeline: boolean = false
): { entries: CardexEntry[]; summary: ProductStockSummary } {
    const rawEvents: Array<{
        date: string;
        timestamp: number;
        docType: CardexDocType;
        docTypeLabel: string;
        docNumber: string;
        sourceId: string;
        partyName: string;
        status: string;
        isPhysical: boolean;
        inQty: number;
        outQty: number;
        unitPrice: number;
        currency: Currency;
        notes?: string;
        orderStage?: string;
        approxDeliveryDate?: string;
    }> = [];

    // Track linked purchase invoices to avoid double-counting delivered orders
    const invoiceOrderIds = new Set<string>();
    purchaseInvoices.forEach(inv => {
        if (inv.orderId) invoiceOrderIds.add(inv.orderId);
    });

    const itemsPerCarton = product.itemsPerCarton || 1;
    const cartonCBM = product.cartonCBM || 0.1;
    const unitCBM = itemsPerCarton > 0 ? cartonCBM / itemsPerCarton : 0.01;
    const grossWeightPerCarton = product.grossWeight || 5;
    const netWeightPerCarton = product.netWeight || 4.5;

    // 1. Process Purchase Invoices (Inflows)
    purchaseInvoices.forEach(inv => {
        (inv.items || []).forEach(it => {
            if (isItemMatch(it, product)) {
                rawEvents.push({
                    date: inv.date || new Date().toISOString().split('T')[0],
                    timestamp: new Date(inv.date || 0).getTime(),
                    docType: 'purchase_invoice',
                    docTypeLabel: '📥 فاکتور خرید (ورود رسمی)',
                    docNumber: inv.invoiceNumber,
                    sourceId: inv.id,
                    partyName: inv.supplierName || 'تامین‌کننده',
                    status: inv.status || 'posted',
                    isPhysical: true,
                    inQty: it.quantity || 0,
                    outQty: 0,
                    unitPrice: it.unitPrice || product.purchasePriceUSD || 0,
                    currency: inv.currency || 'AED',
                    notes: it.notes || inv.notes || `فاکتور خرید ${inv.invoiceNumber}`
                });
            }
        });
    });

    // 2. Process Orders & Supply Chain Delivery Stages
    orders.forEach(order => {
        if (order.deletedAt) return;

        const isDelivered = ['Delivered', 'Invoiced', 'Final (System)'].includes(order.status) || order.isFinalized;
        const isInTransit = ['On Board', 'In Transit', 'Arrival', 'Customs'].includes(order.status);
        const isPipeline = ['Draft', 'Sample Received (Sampling/Test)', 'PI Issued', 'Deposit Paid', 'Production (Order Process)', 'Packaging Approved', 'PSI (Inspection)', 'Booking'].includes(order.status);

        // Check if already covered by an explicit Purchase Invoice to prevent double-counting
        const isCoveredByInvoice = invoiceOrderIds.has(order.id);

        (order.items || []).forEach(it => {
            if (isItemMatch(it, product)) {
                if (isDelivered && !isCoveredByInvoice) {
                    // Physical Inflow from delivered PO
                    rawEvents.push({
                        date: order.orderDate || new Date().toISOString().split('T')[0],
                        timestamp: new Date(order.orderDate || 0).getTime(),
                        docType: 'order_delivered',
                        docTypeLabel: '🚢 تحویل سفارش بازرگانی (ورود انبار)',
                        docNumber: order.id,
                        sourceId: order.id,
                        partyName: order.supplier || 'تامین‌کننده خارجی',
                        status: order.status,
                        isPhysical: true,
                        inQty: it.quantity || 0,
                        outQty: 0,
                        unitPrice: it.price || product.purchasePriceUSD || 0,
                        currency: order.currency || 'USD',
                        notes: `سفارش بازرگانی ${order.id} - وضعیت تحویل: ${order.status}`,
                        orderStage: order.status,
                        approxDeliveryDate: order.approxLoadingDate
                    });
                } else if (includePipeline && (isInTransit || isPipeline)) {
                    // Supply Chain In-Transit / Pipeline receipt
                    const stageLabel = isInTransit 
                        ? '🔄 کالای در راه / بین‌راهی (In-Transit)' 
                        : '⏳ سفارش در جریان تولید (Production Pipeline)';
                    
                    rawEvents.push({
                        date: order.approxLoadingDate || order.orderDate || new Date().toISOString().split('T')[0],
                        timestamp: new Date(order.approxLoadingDate || order.orderDate || 0).getTime(),
                        docType: 'order_pipeline',
                        docTypeLabel: stageLabel,
                        docNumber: order.id,
                        sourceId: order.id,
                        partyName: order.supplier || 'تامین‌کننده خارجی',
                        status: order.status,
                        isPhysical: false,
                        inQty: it.quantity || 0,
                        outQty: 0,
                        unitPrice: it.price || product.purchasePriceUSD || 0,
                        currency: order.currency || 'USD',
                        notes: `پیش‌بینی ورود: ${order.approxLoadingDate || 'نامشخص'} | مرحله: ${order.status}`,
                        orderStage: order.status,
                        approxDeliveryDate: order.approxLoadingDate
                    });
                }
            }
        });
    });

    // 3. Process Sales Invoices (Outflows)
    salesInvoices.forEach(inv => {
        (inv.items || []).forEach(it => {
            if (isItemMatch(it, product)) {
                rawEvents.push({
                    date: inv.date || new Date().toISOString().split('T')[0],
                    timestamp: new Date(inv.date || 0).getTime(),
                    docType: 'sales_invoice',
                    docTypeLabel: '📤 فاکتور فروش (خروج کالا)',
                    docNumber: inv.invoiceNumber,
                    sourceId: inv.id,
                    partyName: inv.customerName || 'مشتری',
                    status: inv.status || 'posted',
                    isPhysical: true,
                    inQty: 0,
                    outQty: it.quantity || 0,
                    unitPrice: it.unitPrice || 0,
                    currency: inv.currency || 'AED',
                    notes: inv.notes || `فاکتور فروش شماره ${inv.invoiceNumber} به ${inv.customerName}`
                });
            }
        });
    });

    // Sort chronologically
    rawEvents.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate Running Balances and Metrics
    let runningQty = 0;
    let runningCartons = 0;
    let runningCBM = 0;
    let runningGrossWeight = 0;

    let totalPhysicalIn = 0;
    let totalPhysicalOut = 0;
    let totalPipelineIn = 0;

    let totalCostUSDAccum = 0;
    let totalQtyAccumForCost = 0;

    const fxUsdAed = costingSettings?.fx?.usd_aed || 3.67;
    const fxAedToman = costingSettings?.fx?.aed_toman || 27000;

    const entries: CardexEntry[] = rawEvents.map((evt, idx) => {
        const inCartons = evt.inQty > 0 ? Math.ceil(evt.inQty / itemsPerCarton) : 0;
        const inCBM = parseFloat((inCartons * cartonCBM).toFixed(3));
        const inGrossWeight = parseFloat((inCartons * grossWeightPerCarton).toFixed(2));

        const outCartons = evt.outQty > 0 ? Math.ceil(evt.outQty / itemsPerCarton) : 0;
        const outCBM = parseFloat((outCartons * cartonCBM).toFixed(3));
        const outGrossWeight = parseFloat((outCartons * grossWeightPerCarton).toFixed(2));

        if (evt.isPhysical) {
            runningQty += (evt.inQty - evt.outQty);
            totalPhysicalIn += evt.inQty;
            totalPhysicalOut += evt.outQty;

            if (evt.inQty > 0) {
                let priceUSD = evt.unitPrice;
                if (evt.currency === 'AED') priceUSD = evt.unitPrice / fxUsdAed;
                if (evt.currency === 'TOMAN') priceUSD = evt.unitPrice / (fxUsdAed * fxAedToman);
                totalCostUSDAccum += (priceUSD * evt.inQty);
                totalQtyAccumForCost += evt.inQty;
            }
        } else {
            totalPipelineIn += evt.inQty;
        }

        runningCartons = runningQty > 0 ? Math.ceil(runningQty / itemsPerCarton) : 0;
        runningCBM = parseFloat((runningCartons * cartonCBM).toFixed(3));
        runningGrossWeight = parseFloat((runningCartons * grossWeightPerCarton).toFixed(2));

        const weightedAvgCostUSD = totalQtyAccumForCost > 0 
            ? totalCostUSDAccum / totalQtyAccumForCost 
            : (product.landedCostUSD || product.purchasePriceUSD || 0);

        const weightedAvgCostAED = weightedAvgCostUSD * fxUsdAed;
        const weightedAvgCostTOMAN = weightedAvgCostAED * fxAedToman;

        return {
            id: `cardex-${idx}-${evt.sourceId}`,
            date: evt.date,
            docType: evt.docType,
            docTypeLabel: evt.docTypeLabel,
            docNumber: evt.docNumber,
            sourceId: evt.sourceId,
            partyName: evt.partyName,
            status: evt.status,
            isPhysical: evt.isPhysical,
            inQty: evt.inQty,
            inCartons,
            inCBM,
            inGrossWeight,
            outQty: evt.outQty,
            outCartons,
            outCBM,
            outGrossWeight,
            unitPrice: evt.unitPrice,
            currency: evt.currency,
            totalAmount: (evt.inQty || evt.outQty) * evt.unitPrice,
            runningQty,
            runningCartons,
            runningCBM,
            runningGrossWeight,
            runningWeightedAverageCostUSD: parseFloat(weightedAvgCostUSD.toFixed(2)),
            runningWeightedAverageCostAED: parseFloat(weightedAvgCostAED.toFixed(2)),
            runningWeightedAverageCostTOMAN: Math.round(weightedAvgCostTOMAN),
            notes: evt.notes,
            orderStage: evt.orderStage,
            approxDeliveryDate: evt.approxDeliveryDate
        };
    });

    const physicalStockQty = Math.max(0, totalPhysicalIn - totalPhysicalOut);
    const physicalStockCartons = physicalStockQty > 0 ? Math.ceil(physicalStockQty / itemsPerCarton) : 0;
    const physicalStockCBM = parseFloat((physicalStockCartons * cartonCBM).toFixed(3));
    const physicalStockWeight = parseFloat((physicalStockCartons * grossWeightPerCarton).toFixed(2));

    const pipelineStockCartons = totalPipelineIn > 0 ? Math.ceil(totalPipelineIn / itemsPerCarton) : 0;
    const pipelineStockCBM = parseFloat((pipelineStockCartons * cartonCBM).toFixed(3));

    const totalExpectedQty = physicalStockQty + totalPipelineIn;
    const totalExpectedCartons = totalExpectedQty > 0 ? Math.ceil(totalExpectedQty / itemsPerCarton) : 0;
    const totalExpectedCBM = parseFloat((totalExpectedCartons * cartonCBM).toFixed(3));

    const avgCostUSD = totalQtyAccumForCost > 0 ? (totalCostUSDAccum / totalQtyAccumForCost) : (product.landedCostUSD || product.purchasePriceUSD || 0);
    const avgCostAED = avgCostUSD * fxUsdAed;
    const avgCostTOMAN = avgCostAED * fxAedToman;

    // Discrepancy checks
    const discrepancies: string[] = [];
    if (!product.internalCode || !product.internalCode.trim()) {
        discrepancies.push('⚠️ فاقد کد داخلی استاندارد (ورود موقت)');
    }
    if (!product.itemsPerCarton || product.itemsPerCarton <= 0) {
        discrepancies.push('⚠️ عدم تعریف تعداد در کارتن (پیش‌فرض ۱ عدد)');
    }
    if (!product.cartonCBM || product.cartonCBM <= 0) {
        discrepancies.push('⚠️ عدم تعریف CBM کارتن (پیش‌فرض ۰.۱ m³)');
    }
    if (totalPhysicalIn < totalPhysicalOut) {
        discrepancies.push(`⛔ کسری موجودی فیزیکی انبار: خروج بیش از ورود (${totalPhysicalOut - totalPhysicalIn} عدد منفی)`);
    }

    const summary: ProductStockSummary = {
        productId: product.id,
        internalCode: product.internalCode || 'فاقد کد',
        partNumber: product.supplierCode || '',
        productNameFa: product.productNameFa || product.description || 'بدون عنوان',
        productNameEn: product.description || '',
        itemsPerCarton,
        cartonCBM,
        unitCBM: parseFloat(unitCBM.toFixed(4)),
        grossWeight: grossWeightPerCarton,
        netWeight: netWeightPerCarton,
        hsCode: product.hsCode || '---',
        physicalStockQty,
        physicalStockCartons,
        physicalStockCBM,
        physicalStockWeight,
        pipelineStockQty: totalPipelineIn,
        pipelineStockCartons,
        pipelineStockCBM,
        totalExpectedQty,
        totalExpectedCartons,
        totalExpectedCBM,
        averageLandedCostUSD: parseFloat(avgCostUSD.toFixed(2)),
        averageLandedCostAED: parseFloat(avgCostAED.toFixed(2)),
        averageLandedCostTOMAN: Math.round(avgCostTOMAN),
        totalStockValueUSD: parseFloat((physicalStockQty * avgCostUSD).toFixed(2)),
        totalStockValueAED: parseFloat((physicalStockQty * avgCostAED).toFixed(2)),
        totalStockValueTOMAN: Math.round(physicalStockQty * avgCostTOMAN),
        hasDiscrepancies: discrepancies.length > 0,
        discrepancies,
        isTemporaryItem: !product.internalCode || !product.internalCode.trim()
    };

    return { entries, summary };
}

/**
 * Generates an Excel Sheet of the Product Cardex with RTL formatting and official layout
 */
export async function exportCardexToExcel(
    product: Product,
    entries: CardexEntry[],
    summary: ProductStockSummary
): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Newland Warehouse ERP';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`کارتکس ${product.internalCode || 'کالا'}`, {
        views: [{ rightToLeft: true, state: 'normal' }],
        properties: { defaultRowHeight: 22 }
    });

    // 1. Header Banner
    sheet.mergeCells('A1:L1');
    const title = sheet.getCell('A1');
    title.value = `کارتکس ریالی و تعدادی انبار و مشخصات کالا - ${summary.productNameFa} (${summary.internalCode})`;
    title.font = { name: 'Tahoma', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 36;

    // 2. Product Specs Snapshot Box (Rows 2 to 4)
    sheet.mergeCells('A2:F2');
    sheet.getCell('A2').value = `کد داخلی: ${summary.internalCode} | پارت‌نامبر: ${summary.partNumber || '---'} | کد تعرفه HS: ${summary.hsCode}`;
    sheet.getCell('A2').font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FF1E293B' } };
    sheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    sheet.mergeCells('G2:L2');
    sheet.getCell('G2').value = `بسته‌بندی: ${summary.itemsPerCarton} عدد در کارتن | CBM کارتن: ${summary.cartonCBM} m³ | وزن کارتن: ${summary.grossWeight} kg`;
    sheet.getCell('G2').font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FF1E293B' } };
    sheet.getCell('G2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    sheet.mergeCells('A3:F3');
    sheet.getCell('A3').value = `موجودی فیزیکی: ${summary.physicalStockQty.toLocaleString()} عدد (${summary.physicalStockCartons} کارتن - ${summary.physicalStockCBM} m³) | سفارشات در راه: ${summary.pipelineStockQty.toLocaleString()} عدد`;
    sheet.getCell('A3').font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FF047857' } };
    sheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };

    sheet.mergeCells('G3:L3');
    sheet.getCell('G3').value = `ارزش کل دپو: ${summary.totalStockValueAED.toLocaleString()} AED (${summary.totalStockValueTOMAN.toLocaleString()} تومان) | بهای میانگین: ${summary.averageLandedCostAED.toLocaleString()} AED`;
    sheet.getCell('G3').font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FF4338CA' } };
    sheet.getCell('G3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };

    sheet.getRow(4).height = 10;

    // 3. Table Column Headers
    const headers = [
        { header: 'ردیف', key: 'idx', width: 8 },
        { header: 'تاریخ', key: 'date', width: 14 },
        { header: 'نوع سند', key: 'docType', width: 28 },
        { header: 'شماره سند', key: 'docNumber', width: 18 },
        { header: 'طرف حساب / مبدا', key: 'party', width: 26 },
        { header: 'وارده (عدد)', key: 'inQty', width: 14 },
        { header: 'وارده (کارتن)', key: 'inCartons', width: 14 },
        { header: 'وارده (CBM)', key: 'inCBM', width: 14 },
        { header: 'صادره (عدد)', key: 'outQty', width: 14 },
        { header: 'صادره (کارتن)', key: 'outCartons', width: 14 },
        { header: 'صادره (CBM)', key: 'outCBM', width: 14 },
        { header: 'مانده موجودی', key: 'balance', width: 16 }
    ];

    sheet.getRow(5).values = headers.map(h => h.header);
    sheet.getRow(5).height = 28;
    sheet.columns = headers.map(h => ({ width: h.width }));

    const headerRow = sheet.getRow(5);
    headerRow.eachCell((cell) => {
        cell.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Populate data rows
    entries.forEach((e, idx) => {
        const row = sheet.addRow([
            idx + 1,
            e.date,
            e.docTypeLabel,
            e.docNumber,
            e.partyName,
            e.inQty > 0 ? e.inQty : '-',
            e.inCartons > 0 ? e.inCartons : '-',
            e.inCBM > 0 ? e.inCBM : '-',
            e.outQty > 0 ? e.outQty : '-',
            e.outCartons > 0 ? e.outCartons : '-',
            e.outCBM > 0 ? e.outCBM : '-',
            e.runningQty
        ]);

        row.font = { name: 'Tahoma', size: 9 };
        row.alignment = { vertical: 'middle', horizontal: 'center' };
        row.height = 22;

        if (e.inQty > 0) {
            row.getCell(6).font = { bold: true, color: { argb: 'FF047857' } };
            row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        }
        if (e.outQty > 0) {
            row.getCell(9).font = { bold: true, color: { argb: 'FFE11D48' } };
            row.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } };
        }
        row.getCell(12).font = { bold: true, color: { argb: 'FF1E293B' } };
        row.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cardex_${product.internalCode || 'Product'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Generates an official printable Cardex HTML document
 */
export function generateCardexPrintableHtml(
    product: Product,
    entries: CardexEntry[],
    summary: ProductStockSummary,
    companyInfo?: CompanyInfo
): string {
    const rowsHtml = entries.map((e, idx) => `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
            <td style="padding: 6px; text-align: center;">${idx + 1}</td>
            <td style="padding: 6px; text-align: center; font-family: monospace;">${e.date}</td>
            <td style="padding: 6px; font-weight: bold;">${e.docTypeLabel}</td>
            <td style="padding: 6px; text-align: center; font-family: monospace; font-weight: bold; color: #4338ca;">${e.docNumber}</td>
            <td style="padding: 6px;">${e.partyName}</td>
            <td style="padding: 6px; text-align: center; font-weight: bold; color: #059669; background-color: #ecfdf5;">${e.inQty > 0 ? e.inQty.toLocaleString() : '-'}</td>
            <td style="padding: 6px; text-align: center;">${e.inCartons > 0 ? e.inCartons : '-'}</td>
            <td style="padding: 6px; text-align: center; font-weight: bold; color: #e11d48; background-color: #fff1f2;">${e.outQty > 0 ? e.outQty.toLocaleString() : '-'}</td>
            <td style="padding: 6px; text-align: center;">${e.outCartons > 0 ? e.outCartons : '-'}</td>
            <td style="padding: 6px; text-align: center; font-weight: bold; font-family: monospace; background-color: #f8fafc;">${e.runningQty.toLocaleString()}</td>
            <td style="padding: 6px; text-align: center; font-family: monospace;">${e.runningCartons.toLocaleString()}</td>
            <td style="padding: 6px; text-align: center; font-family: monospace;">${e.runningCBM} m³</td>
        </tr>
    `).join('');

    return `
    <!DOCTYPE html>
    <html dir="rtl" lang="fa">
    <head>
        <meta charset="utf-8">
        <title>کارتکس رسمی کالا - ${summary.internalCode}</title>
        <style>
            @media print {
                @page { size: A4 landscape; margin: 10mm; }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            body { font-family: Tahoma, 'Vazirmatn', sans-serif; color: #1e293b; background: #fff; margin: 0; padding: 20px; }
            .header-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
            .specs-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 15px; background: #f8fafc; display: flex; justify-content: space-between; font-size: 11px; }
            .cardex-table { width: 100%; border-collapse: collapse; text-align: right; }
            .cardex-table th { background-color: #1e293b; color: #fff; padding: 8px 6px; font-size: 11px; font-weight: bold; }
            .summary-badge { padding: 4px 8px; border-radius: 4px; font-weight: bold; }
        </style>
    </head>
    <body>
        <table class="header-table">
            <tr>
                <td style="text-align: right; width: 33%;">
                    <h2 style="margin: 0; font-size: 16px; color: #1e293b;">کارتکس رسمی و زنجیره انبارداری</h2>
                    <p style="margin: 3px 0 0 0; font-size: 11px; color: #64748b;">شرکت بازرگانی نیولند (NEWLAND)</p>
                </td>
                <td style="text-align: center; width: 34%;">
                    <div style="border: 2px solid #2563eb; border-radius: 6px; padding: 6px; display: inline-block;">
                        <span style="font-size: 14px; font-weight: bold; color: #1e293b;">کد کالا: ${summary.internalCode}</span>
                    </div>
                </td>
                <td style="text-align: left; width: 33%; font-size: 11px; color: #475569;">
                    تاریخ گزارش: ${new Date().toLocaleDateString('fa-IR')}<br>
                    موجودی فیزیکی: <strong>${summary.physicalStockQty.toLocaleString()} عدد</strong>
                </td>
            </tr>
        </table>

        <div class="specs-box">
            <div>
                <strong>نام کالا:</strong> ${summary.productNameFa} (${summary.productNameEn})<br>
                <strong>پارت‌نامبر:</strong> ${summary.partNumber || '---'} | <strong>کد تعرفه HS:</strong> ${summary.hsCode}
            </div>
            <div>
                <strong>تعداد در کارتن:</strong> ${summary.itemsPerCarton} عدد | <strong>CBM کارتن:</strong> ${summary.cartonCBM} m³<br>
                <strong>وزن کارتن:</strong> ${summary.grossWeight} کیلوگرم | <strong>CBM هر عدد:</strong> ${summary.unitCBM} m³
            </div>
            <div>
                <strong>موجودی فیزیکی انبار:</strong> ${summary.physicalStockQty.toLocaleString()} عدد (${summary.physicalStockCartons} کارتن - ${summary.physicalStockCBM} m³)<br>
                <strong>ارزش موجودی:</strong> ${summary.totalStockValueAED.toLocaleString()} AED (${summary.totalStockValueTOMAN.toLocaleString()} تومان)
            </div>
        </div>

        <table class="cardex-table" border="1" borderColor="#cbd5e1">
            <thead>
                <tr>
                    <th>ردیف</th>
                    <th>تاریخ</th>
                    <th>نوع سند</th>
                    <th>شماره سند</th>
                    <th>طرف حساب / تامین‌کننده</th>
                    <th>وارده (عدد)</th>
                    <th>کارتن</th>
                    <th>صادره (عدد)</th>
                    <th>کارتن</th>
                    <th>مانده تعداد</th>
                    <th>مانده کارتن</th>
                    <th>مانده CBM</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>

        <div style="margin-top: 30px; display: flex; justify-content: space-between; font-size: 11px; text-align: center;">
            <div style="width: 25%;">
                امضای انباردار:<br><br>_________________
            </div>
            <div style="width: 25%;">
                مسئول حسابداری انبار:<br><br>_________________
            </div>
            <div style="width: 25%;">
                مدیریت زنجیره تامین:<br><br>_________________
            </div>
        </div>
    </body>
    </html>
    `;
}
