import { db } from '../db';
import {
    PurchaseInvoice,
    SalesInvoice,
    JournalVoucher,
    JournalVoucherItem,
    DetailedLedgerAccount,
    Supplier,
    Currency
} from '../types';

/**
 * Ensures a counterparty (Supplier or Customer) has an active Detailed Ledger Account (حساب تفصیلی)
 * in the Chart of Accounts. If missing, allocates the next sequential code and persists it.
 */
export async function ensurePartyDetailedAccount(
    partyType: 'supplier' | 'customer',
    name: string,
    opts?: {
        partyId?: string;
        phone?: string;
        address?: string;
        customCode?: string;
    }
): Promise<DetailedLedgerAccount> {
    const cleanName = (name || '').trim();
    if (!cleanName) {
        throw new Error('نام طرف حساب الزامی است');
    }

    const parentSubsidiaryCode = partyType === 'supplier' ? '3101' : '2101'; // 3101 = تامین کنندگان داخلی | 2101 = مشتریان تهران / حسابهای دریافتنی

    // Search existing detailed accounts in DB
    const existingAccounts = await db.detailedLedgerAccounts.toArray();
    
    // Look for exact match by partyId or by clean name under the parent subsidiary
    let match = existingAccounts.find(acc => 
        (opts?.partyId && acc.partyId === opts.partyId) ||
        (acc.subsidiaryLedgerAccountId === parentSubsidiaryCode && 
         (acc.name.toLowerCase() === cleanName.toLowerCase() || (acc.name_fa && acc.name_fa.toLowerCase() === cleanName.toLowerCase())))
    );

    if (match) {
        // If match exists but lacks partyId or partyType, update it
        if ((!match.partyId && opts?.partyId) || !match.partyType) {
            match = {
                ...match,
                partyId: opts?.partyId || match.partyId,
                partyType,
                phone: opts?.phone || match.phone,
                address: opts?.address || match.address
            };
            await db.detailedLedgerAccounts.put(match);
        }
        return match;
    }

    // Determine next sequential code under subsidiary
    const currentSubAccounts = existingAccounts.filter(acc => acc.subsidiaryLedgerAccountId === parentSubsidiaryCode);
    const numericSuffixes = currentSubAccounts
        .map(acc => {
            const numPart = acc.code.replace(parentSubsidiaryCode, '');
            return parseInt(numPart, 10);
        })
        .filter(n => !isNaN(n));

    const nextSeq = numericSuffixes.length > 0 ? Math.max(...numericSuffixes) + 1 : 1;
    const nextCode = opts?.customCode || `${parentSubsidiaryCode}${nextSeq.toString().padStart(2, '0')}`;

    const newAccount: DetailedLedgerAccount = {
        id: `dl-${nextCode}`,
        code: nextCode,
        name: cleanName,
        name_fa: cleanName,
        subsidiaryLedgerAccountId: parentSubsidiaryCode,
        partyType,
        partyId: opts?.partyId,
        phone: opts?.phone,
        address: opts?.address,
        nature: partyType === 'supplier' ? 'credit' : 'debit'
    };

    await db.detailedLedgerAccounts.add(newAccount);

    // If it's a supplier in db.suppliers, update its code if missing
    if (partyType === 'supplier' && opts?.partyId) {
        const sup = await db.suppliers.get(opts.partyId);
        if (sup && (!sup.code || sup.code !== nextCode)) {
            await db.suppliers.update(opts.partyId, { code: nextCode });
        }
    }

    return newAccount;
}

/**
 * Bulk synchronizes all registered Suppliers and Customers from Invoices/Tables
 * with the Chart of Accounts Detailed Ledger.
 */
export async function syncAllPartiesDetailedAccounts(): Promise<{
    suppliersSynced: number;
    customersSynced: number;
    newAccountsCreated: number;
}> {
    const suppliers = await db.suppliers.toArray();
    const purchaseInvoices = await db.purchaseInvoices.toArray();
    const salesInvoices = await db.salesInvoices.toArray();

    const existingBefore = await db.detailedLedgerAccounts.count();

    // 1. Sync Suppliers
    const supplierNames = new Set<string>();
    suppliers.forEach(s => supplierNames.add(s.name));
    purchaseInvoices.forEach(p => {
        if (p.supplierName) supplierNames.add(p.supplierName);
    });

    let suppliersSynced = 0;
    for (const sName of Array.from(supplierNames)) {
        const foundSup = suppliers.find(s => s.name === sName);
        await ensurePartyDetailedAccount('supplier', sName, {
            partyId: foundSup?.id,
            phone: foundSup?.phone,
            address: foundSup?.address
        });
        suppliersSynced++;
    }

    // 2. Sync Customers
    const customerNames = new Set<string>();
    salesInvoices.forEach(s => {
        if (s.customerName) customerNames.add(s.customerName);
    });

    let customersSynced = 0;
    for (const cName of Array.from(customerNames)) {
        const matchedInv = salesInvoices.find(s => s.customerName === cName);
        await ensurePartyDetailedAccount('customer', cName, {
            phone: matchedInv?.customerPhone
        });
        customersSynced++;
    }

    const existingAfter = await db.detailedLedgerAccounts.count();
    const newAccountsCreated = existingAfter - existingBefore;

    return {
        suppliersSynced,
        customersSynced,
        newAccountsCreated
    };
}

/**
 * Calculates real-time balance and transaction history for a specific Detailed Account
 */
export async function getDetailedAccountBalance(accountCode: string): Promise<{
    accountCode: string;
    totalDebit: number;
    totalCredit: number;
    netBalance: number; // Positive = Debit balance, Negative = Credit balance
    statusText: string;
    transactionsCount: number;
}> {
    const vouchers = await db.journalVouchers.toArray();
    let totalDebit = 0;
    let totalCredit = 0;
    let count = 0;

    vouchers.forEach(v => {
        if (v.status === 'posted' || !v.status) {
            (v.items || []).forEach(it => {
                if (it.accountCode === accountCode || it.accountId === accountCode) {
                    totalDebit += Number(it.debit) || 0;
                    totalCredit += Number(it.credit) || 0;
                    count++;
                }
            });
        }
    });

    const netBalance = totalDebit - totalCredit;
    let statusText = 'بی‌حساب (تسویه کامل)';
    if (netBalance > 0.01) {
        statusText = `بدهکار (${netBalance.toLocaleString()} درهم)`;
    } else if (netBalance < -0.01) {
        statusText = `بستانکار (${Math.abs(netBalance).toLocaleString()} درهم)`;
    }

    return {
        accountCode,
        totalDebit,
        totalCredit,
        netBalance,
        statusText,
        transactionsCount: count
    };
}

/**
 * Cascade Synchronizes (Creates or Updates) a Double-Entry Journal Voucher for a Purchase Invoice.
 * 
 * Standard Accounting Entry:
 * بدهکار (Debit): حساب موجودی کالا و انبار خرید (کد 1004 یا 4401)
 * بستانکار (Credit): حساب تفصیلی تامین‌کننده (کد 3101xx)
 */
export async function cascadeSyncPurchaseInvoiceVoucher(invoice: PurchaseInvoice): Promise<JournalVoucher> {
    // 1. Ensure supplier detailed account exists
    const supplierAcc = await ensurePartyDetailedAccount('supplier', invoice.supplierName, {
        partyId: invoice.supplierId
    });

    const totalAmount = Number(invoice.totalAmount) || 0;
    const invNumber = invoice.invoiceNumber;
    const date = invoice.date || new Date().toISOString().split('T')[0];
    const currency = invoice.currency || 'AED';

    // 2. Find if voucher already exists for this invoice
    let existingVoucher: JournalVoucher | undefined;
    if (invoice.voucherId) {
        existingVoucher = await db.journalVouchers.get(invoice.voucherId);
    }
    if (!existingVoucher) {
        existingVoucher = await db.journalVouchers.where('sourceId').equals(invoice.id).first();
    }

    const nextVoucherNumber = existingVoucher
        ? existingVoucher.voucherNumber
        : (await getNextVoucherNumber());

    const voucherId = existingVoucher ? existingVoucher.id : `vpur-${Date.now()}`;

    const items: JournalVoucherItem[] = [
        {
            id: `vitem-deb-${Date.now()}`,
            accountId: '1004',
            accountCode: '1004',
            accountName: 'موجودی کالا (انبار خرید)',
            debit: totalAmount,
            credit: 0,
            currency,
            currencyRate: invoice.currencyRate || 1,
            foreignAmount: totalAmount,
            description: `خرید کالا فاکتور شماره ${invNumber} (${invoice.items.length} قلم)`
        },
        {
            id: `vitem-crd-${Date.now()}`,
            accountId: supplierAcc.id,
            accountCode: supplierAcc.code,
            accountName: `تامین‌کننده: ${supplierAcc.name_fa || supplierAcc.name}`,
            debit: 0,
            credit: totalAmount,
            currency,
            currencyRate: invoice.currencyRate || 1,
            foreignAmount: totalAmount,
            partyType: 'supplier',
            partyId: invoice.supplierId,
            partyName: invoice.supplierName,
            description: `بستانکاری خرید کالا فاکتور شماره ${invNumber}`
        }
    ];

    const voucherData: JournalVoucher = {
        id: voucherId,
        voucherNumber: nextVoucherNumber,
        date,
        description: `فاکتور خرید کالا شماره ${invNumber} از ${invoice.supplierName}`,
        sourceType: 'purchase_invoice',
        sourceId: invoice.id,
        referenceNumber: invNumber,
        status: invoice.status === 'voided' ? 'voided' : 'posted',
        totalDebit: totalAmount,
        totalCredit: totalAmount,
        createdAt: existingVoucher?.createdAt || new Date().toISOString(),
        items
    };

    if (existingVoucher) {
        await db.journalVouchers.put(voucherData);
    } else {
        await db.journalVouchers.add(voucherData);
    }

    // Update invoice with supplier account info and voucher link
    await db.purchaseInvoices.update(invoice.id, {
        supplierAccountId: supplierAcc.id,
        supplierAccountCode: supplierAcc.code,
        voucherId: voucherId
    });

    return voucherData;
}

/**
 * Cascade Voids a Purchase Invoice and updates linked Journal Voucher.
 */
export async function cascadeVoidPurchaseInvoice(invoiceId: string, reason?: string): Promise<void> {
    const invoice = await db.purchaseInvoices.get(invoiceId);
    if (!invoice) return;

    await db.purchaseInvoices.update(invoiceId, {
        status: 'voided',
        notes: invoice.notes ? `${invoice.notes} | [ابطال‌شده: ${reason || 'درخواست کاربر'}]` : `[ابطال‌شده: ${reason || 'درخواست کاربر'}]`
    });

    // Update linked voucher status to voided
    const linkedVouchers = await db.journalVouchers.where('sourceId').equals(invoiceId).toArray();
    for (const v of linkedVouchers) {
        await db.journalVouchers.update(v.id, {
            status: 'voided',
            description: `[ابطال‌شده] ${v.description} (${reason || 'ابطال فاکتور'})`
        });
    }
}

/**
 * Cascade Settle a Purchase Invoice (Pay Supplier).
 * 
 * Standard Double-Entry Payment Voucher:
 * بدهکار (Debit): حساب تفصیلی تامین‌کننده (کد 3101xx) - تسویه بدهی
 * بستانکار (Credit): حساب پرداخت‌کننده (بانک/صندوق کد 0601 یا 1101)
 */
export async function cascadeSettlePurchaseInvoice(params: {
    invoiceId: string;
    amount: number;
    date: string;
    paymentAccountId: string; // e.g. '0601' (Bank Dubai), '1101' (Cash)
    paymentAccountCode: string;
    paymentAccountName: string;
    referenceNumber?: string;
    notes?: string;
}): Promise<JournalVoucher> {
    const invoice = await db.purchaseInvoices.get(params.invoiceId);
    if (!invoice) throw new Error('فاکتور خرید یافت نشد');

    const supplierAcc = await ensurePartyDetailedAccount('supplier', invoice.supplierName, {
        partyId: invoice.supplierId
    });

    const amount = Number(params.amount) || 0;
    if (amount <= 0) throw new Error('مبلغ تسویه باید بزرگتر از صفر باشد');

    const nextVoucherNum = await getNextVoucherNumber();
    const voucherId = `vpay-${Date.now()}`;

    const paymentVoucher: JournalVoucher = {
        id: voucherId,
        voucherNumber: nextVoucherNum,
        date: params.date,
        description: `پرداخت وجه بابت تسویه فاکتور خرید ${invoice.invoiceNumber} به ${invoice.supplierName}`,
        sourceType: 'payment',
        sourceId: invoice.id,
        referenceNumber: params.referenceNumber || invoice.invoiceNumber,
        status: 'posted',
        totalDebit: amount,
        totalCredit: amount,
        createdAt: new Date().toISOString(),
        items: [
            {
                id: `vpay-deb-${Date.now()}`,
                accountId: supplierAcc.id,
                accountCode: supplierAcc.code,
                accountName: `تامین‌کننده: ${supplierAcc.name_fa || supplierAcc.name}`,
                debit: amount,
                credit: 0,
                currency: invoice.currency,
                foreignAmount: amount,
                partyType: 'supplier',
                partyId: invoice.supplierId,
                partyName: invoice.supplierName,
                description: `تسویه بدهی فاکتور خرید ${invoice.invoiceNumber} (${params.notes || ''})`
            },
            {
                id: `vpay-crd-${Date.now()}`,
                accountId: params.paymentAccountId,
                accountCode: params.paymentAccountCode,
                accountName: params.paymentAccountName,
                debit: 0,
                credit: amount,
                currency: invoice.currency,
                foreignAmount: amount,
                description: `پرداخت وجه از ${params.paymentAccountName} بابت فاکتور ${invoice.invoiceNumber}`
            }
        ]
    };

    await db.journalVouchers.add(paymentVoucher);

    // Update invoice paid amount and status
    const currentPaid = Number(invoice.paidAmount) || 0;
    const newPaid = currentPaid + amount;
    const isFullyPaid = newPaid >= (invoice.totalAmount - 0.01);

    await db.purchaseInvoices.update(invoice.id, {
        paidAmount: newPaid,
        status: isFullyPaid ? 'paid' : 'partial'
    });

    return paymentVoucher;
}

/**
 * Cascade Synchronizes (Creates or Updates) a Double-Entry Journal Voucher for a Sales Invoice.
 * 
 * Standard Accounting Entry:
 * بدهکار (Debit): حساب تفصیلی مشتری (کد 2101xx) - بدهکاری مشتری
 * بستانکار (Credit): درآمد حاصل از فروش کالا (کد 4001) - درآمد فروش
 */
export async function cascadeSyncSalesInvoiceVoucher(invoice: SalesInvoice): Promise<JournalVoucher> {
    // 1. Ensure customer detailed account exists
    const customerAcc = await ensurePartyDetailedAccount('customer', invoice.customerName, {
        phone: invoice.customerPhone,
        partyId: invoice.customerId
    });

    const totalAmount = Number(invoice.totalAmount) || 0;
    const invNumber = invoice.invoiceNumber;
    const date = invoice.date || new Date().toISOString().split('T')[0];
    const currency = invoice.currency || 'AED';

    // 2. Find existing voucher
    let existingVoucher: JournalVoucher | undefined;
    if (invoice.voucherId) {
        existingVoucher = await db.journalVouchers.get(invoice.voucherId);
    }
    if (!existingVoucher) {
        existingVoucher = await db.journalVouchers.where('sourceId').equals(invoice.id).first();
    }

    const nextVoucherNumber = existingVoucher
        ? existingVoucher.voucherNumber
        : (await getNextVoucherNumber());

    const voucherId = existingVoucher ? existingVoucher.id : `vsal-${Date.now()}`;

    const items: JournalVoucherItem[] = [
        {
            id: `vsal-deb-${Date.now()}`,
            accountId: customerAcc.id,
            accountCode: customerAcc.code,
            accountName: `مشتری: ${customerAcc.name_fa || customerAcc.name}`,
            debit: totalAmount,
            credit: 0,
            currency,
            currencyRate: invoice.currencyRate || 1,
            foreignAmount: totalAmount,
            partyType: 'customer',
            partyId: invoice.customerId,
            partyName: invoice.customerName,
            description: `بدهکاری فروش کالا فاکتور شماره ${invNumber}`
        },
        {
            id: `vsal-crd-${Date.now()}`,
            accountId: '4001',
            accountCode: '4001',
            accountName: 'درآمد حاصل از فروش کالا',
            debit: 0,
            credit: totalAmount,
            currency,
            currencyRate: invoice.currencyRate || 1,
            foreignAmount: totalAmount,
            description: `فروش کالا فاکتور شماره ${invNumber} به ${invoice.customerName}`
        }
    ];

    const voucherData: JournalVoucher = {
        id: voucherId,
        voucherNumber: nextVoucherNumber,
        date,
        description: `فاکتور فروش کالا شماره ${invNumber} به ${invoice.customerName}`,
        sourceType: 'sales_invoice',
        sourceId: invoice.id,
        referenceNumber: invNumber,
        status: invoice.status === 'voided' ? 'voided' : 'posted',
        totalDebit: totalAmount,
        totalCredit: totalAmount,
        createdAt: existingVoucher?.createdAt || new Date().toISOString(),
        items
    };

    if (existingVoucher) {
        await db.journalVouchers.put(voucherData);
    } else {
        await db.journalVouchers.add(voucherData);
    }

    // Update sales invoice with customer account info and voucher link
    await db.salesInvoices.update(invoice.id, {
        customerAccountId: customerAcc.id,
        customerAccountCode: customerAcc.code,
        voucherId: voucherId
    });

    return voucherData;
}

/**
 * Cascade Voids a Sales Invoice and updates linked Journal Voucher.
 */
export async function cascadeVoidSalesInvoice(invoiceId: string, reason?: string): Promise<void> {
    const invoice = await db.salesInvoices.get(invoiceId);
    if (!invoice) return;

    await db.salesInvoices.update(invoiceId, {
        status: 'voided',
        notes: invoice.notes ? `${invoice.notes} | [ابطال‌شده: ${reason || 'درخواست کاربر'}]` : `[ابطال‌شده: ${reason || 'درخواست کاربر'}]`
    });

    const linkedVouchers = await db.journalVouchers.where('sourceId').equals(invoiceId).toArray();
    for (const v of linkedVouchers) {
        await db.journalVouchers.update(v.id, {
            status: 'voided',
            description: `[ابطال‌شده] ${v.description} (${reason || 'ابطال فاکتور'})`
        });
    }
}

/**
 * Cascade Settle a Sales Invoice (Receive from Customer).
 * 
 * Standard Double-Entry Receipt Voucher:
 * بدهکار (Debit): حساب دریافت‌کننده (بانک/صندوق کد 0601 یا 1101) - وصول وجه
 * بستانکار (Credit): حساب تفصیلی مشتری (کد 2101xx) - تسویه حساب مشتری
 */
export async function cascadeSettleSalesInvoice(params: {
    invoiceId: string;
    amount: number;
    date: string;
    receiptAccountId: string; // e.g. '0601' (Bank Dubai), '1101' (Cash)
    receiptAccountCode: string;
    receiptAccountName: string;
    referenceNumber?: string;
    notes?: string;
}): Promise<JournalVoucher> {
    const invoice = await db.salesInvoices.get(params.invoiceId);
    if (!invoice) throw new Error('فاکتور فروش یافت نشد');

    const customerAcc = await ensurePartyDetailedAccount('customer', invoice.customerName, {
        phone: invoice.customerPhone,
        partyId: invoice.customerId
    });

    const amount = Number(params.amount) || 0;
    if (amount <= 0) throw new Error('مبلغ وصولی باید بزرگتر از صفر باشد');

    const nextVoucherNum = await getNextVoucherNumber();
    const voucherId = `vrec-${Date.now()}`;

    const receiptVoucher: JournalVoucher = {
        id: voucherId,
        voucherNumber: nextVoucherNum,
        date: params.date,
        description: `دریافت وجه بابت تسویه فاکتور فروش ${invoice.invoiceNumber} از ${invoice.customerName}`,
        sourceType: 'receipt',
        sourceId: invoice.id,
        referenceNumber: params.referenceNumber || invoice.invoiceNumber,
        status: 'posted',
        totalDebit: amount,
        totalCredit: amount,
        createdAt: new Date().toISOString(),
        items: [
            {
                id: `vrec-deb-${Date.now()}`,
                accountId: params.receiptAccountId,
                accountCode: params.receiptAccountCode,
                accountName: params.receiptAccountName,
                debit: amount,
                credit: 0,
                currency: invoice.currency,
                foreignAmount: amount,
                description: `وصول وجه به ${params.receiptAccountName} بابت فاکتور فروش ${invoice.invoiceNumber}`
            },
            {
                id: `vrec-crd-${Date.now()}`,
                accountId: customerAcc.id,
                accountCode: customerAcc.code,
                accountName: `مشتری: ${customerAcc.name_fa || customerAcc.name}`,
                debit: 0,
                credit: amount,
                currency: invoice.currency,
                foreignAmount: amount,
                partyType: 'customer',
                partyId: invoice.customerId,
                partyName: invoice.customerName,
                description: `تسویه بدهی فاکتور فروش ${invoice.invoiceNumber} (${params.notes || ''})`
            }
        ]
    };

    await db.journalVouchers.add(receiptVoucher);

    // Update invoice paid amount and status
    const currentPaid = Number(invoice.paidAmount) || 0;
    const newPaid = currentPaid + amount;
    const isFullyPaid = newPaid >= (invoice.totalAmount - 0.01);

    await db.salesInvoices.update(invoice.id, {
        paidAmount: newPaid,
        status: isFullyPaid ? 'paid' : 'partial'
    });

    return receiptVoucher;
}

/**
 * Gets the next sequential Journal Voucher number
 */
export async function getNextVoucherNumber(): Promise<number> {
    const vouchers = await db.journalVouchers.toArray();
    if (vouchers.length === 0) return 1001;
    const max = Math.max(...vouchers.map(v => Number(v.voucherNumber) || 0));
    return max > 0 ? max + 1 : 1001;
}

/**
 * Extracts full statement of account for any counterparty or detailed account
 */
export async function getPartyAccountStatement(accountCode: string): Promise<{
    accountInfo: DetailedLedgerAccount | null;
    entries: Array<{
        voucherId: string;
        voucherNumber: number;
        date: string;
        description: string;
        debit: number;
        credit: number;
        balance: number; // Running balance
        sourceType?: string;
        referenceNumber?: string;
    }>;
    totalDebit: number;
    totalCredit: number;
    finalBalance: number;
}> {
    const accountInfo = await db.detailedLedgerAccounts.where('code').equals(accountCode).first() || null;
    const allVouchers = await db.journalVouchers.toArray();

    // Filter posted vouchers that contain this account
    const matchedRows: Array<{
        voucherId: string;
        voucherNumber: number;
        date: string;
        description: string;
        debit: number;
        credit: number;
        sourceType?: string;
        referenceNumber?: string;
    }> = [];

    allVouchers
        .filter(v => v.status === 'posted' || !v.status)
        .sort((a, b) => (a.date > b.date ? 1 : -1))
        .forEach(v => {
            (v.items || []).forEach(it => {
                if (it.accountCode === accountCode || it.accountId === accountCode) {
                    matchedRows.push({
                        voucherId: v.id,
                        voucherNumber: v.voucherNumber,
                        date: v.date,
                        description: it.description || v.description,
                        debit: Number(it.debit) || 0,
                        credit: Number(it.credit) || 0,
                        sourceType: v.sourceType,
                        referenceNumber: v.referenceNumber
                    });
                }
            });
        });

    let runningBalance = 0;
    const entries = matchedRows.map(row => {
        runningBalance += (row.debit - row.credit);
        return {
            ...row,
            balance: runningBalance
        };
    });

    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

    return {
        accountInfo,
        entries,
        totalDebit,
        totalCredit,
        finalBalance: runningBalance
    };
}

/**
 * Ensures a Product from the Catalog has an active Detailed Ledger Account (حساب تفصیلی کالا)
 * under the 1104 / 1004 (Inventory / موجودی کالا) subsidiary ledger account.
 */
export async function ensureProductDetailedAccount(product: {
    id: string;
    internalCode?: string;
    supplierCode?: string;
    productNameFa?: string;
    name_en?: string;
    description?: string;
}): Promise<DetailedLedgerAccount> {
    const parentSubsidiaryCode = '1104'; // موجودی انبار کالا دبی
    const cleanCode = (product.internalCode || product.supplierCode || product.id.slice(0, 6)).trim();
    const productName = product.productNameFa || product.description || product.name_en || `کالای ${cleanCode}`;

    const existingAccounts = await db.detailedLedgerAccounts.toArray();

    // Look for match by product partyId or by code/name
    let match = existingAccounts.find(acc =>
        acc.partyId === product.id ||
        (acc.subsidiaryLedgerAccountId === parentSubsidiaryCode &&
         (acc.code.toLowerCase().includes(cleanCode.toLowerCase()) || 
          acc.name.toLowerCase() === productName.toLowerCase() ||
          (acc.name_fa && acc.name_fa.toLowerCase() === productName.toLowerCase())))
    );

    if (match) {
        if (!match.partyId || match.partyType !== 'product') {
            match = {
                ...match,
                partyId: product.id,
                partyType: 'product' as any,
                name: productName,
                name_fa: productName
            };
            await db.detailedLedgerAccounts.put(match);
        }
        return match;
    }

    // Determine next sequential code under 1104
    const currentSubAccounts = existingAccounts.filter(acc => acc.subsidiaryLedgerAccountId === parentSubsidiaryCode);
    const numericSuffixes = currentSubAccounts
        .map(acc => {
            const numPart = acc.code.replace(parentSubsidiaryCode, '').replace(/[^0-9]/g, '');
            return parseInt(numPart, 10);
        })
        .filter(n => !isNaN(n));

    const nextSeq = numericSuffixes.length > 0 ? Math.max(...numericSuffixes) + 1 : 1;
    const nextCode = `${parentSubsidiaryCode}${nextSeq.toString().padStart(3, '0')}`;

    const newAccount: DetailedLedgerAccount = {
        id: `dl-prod-${product.id}`,
        code: nextCode,
        name: productName,
        name_fa: productName,
        subsidiaryLedgerAccountId: parentSubsidiaryCode,
        partyType: 'product' as any,
        partyId: product.id,
        nature: 'debit'
    };

    await db.detailedLedgerAccounts.add(newAccount);
    return newAccount;
}

/**
 * Bulk synchronizes all active catalog products with the Chart of Accounts Detailed Ledger (under 1104).
 */
export async function syncAllProductsDetailedAccounts(): Promise<{
    productsSynced: number;
    newAccountsCreated: number;
}> {
    const products = await db.products.filter(p => !p.deletedAt).toArray();
    const existingBefore = await db.detailedLedgerAccounts.count();

    let productsSynced = 0;
    for (const prod of products) {
        await ensureProductDetailedAccount(prod);
        productsSynced++;
    }

    const existingAfter = await db.detailedLedgerAccounts.count();
    const newAccountsCreated = existingAfter - existingBefore;

    return {
        productsSynced,
        newAccountsCreated
    };
}
