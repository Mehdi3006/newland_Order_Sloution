import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { db } from '../db';
import { SalesInvoice, PurchaseInvoice } from '../types';
import { useFxRates } from '../hooks/useFxRates';
import { convertToUSD } from '../utils/fxEngine';
import { seedAccountingSampleData } from '../utils/accountingSampleData';

import { AccountingHeader, AccountingTab } from './accounting/AccountingHeader';
import { AccountingDashboardTab } from './accounting/AccountingDashboardTab';
import { JournalVouchersTab } from './accounting/JournalVouchersTab';
import { FxRevaluationTab } from './accounting/FxRevaluationTab';
import { PurchaseInvoicesTab } from './accounting/PurchaseInvoicesTab';
import { SalesInvoicesTab } from './accounting/SalesInvoicesTab';
import { ChartOfAccountsTab } from './accounting/ChartOfAccountsTab';
import { InventoryCardexTab } from './accounting/InventoryCardexTab';
import { ProductAccountingLedgerTab } from './accounting/ProductAccountingLedgerTab';
import { DatabaseExportTab } from './accounting/DatabaseExportTab';
import { DocumentModal } from './accounting/DocumentModal';

interface AccountingViewProps {
    activeTab?: AccountingTab;
    setActiveTab?: (tab: AccountingTab) => void;
}

const AccountingView: React.FC<AccountingViewProps> = ({
    activeTab: propActiveTab,
    setActiveTab: propSetActiveTab
}) => {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.dir() === 'rtl';

    const [localActiveTab, setLocalActiveTab] = useState<AccountingTab>('dashboard');
    const activeTab = propActiveTab !== undefined ? propActiveTab : localActiveTab;
    const setActiveTab = propSetActiveTab !== undefined ? propSetActiveTab : setLocalActiveTab;
    const { rates } = useFxRates();

    // Auto-seed sample test records if empty
    useEffect(() => {
        const checkAndSeed = async () => {
            const pinvCount = await db.purchaseInvoices?.count() || 0;
            const sinvCount = await db.salesInvoices?.count() || 0;
            const jvCount = await db.journalVouchers?.count() || 0;
            if (pinvCount === 0 && sinvCount === 0 && jvCount === 0) {
                console.log('Seeding initial comprehensive accounting sample test records...');
                await seedAccountingSampleData();
            }
        };
        checkAndSeed();
    }, []);

    // Live Dexie Data
    const orders = useLiveQuery(() => db.orders.toArray()) || [];
    const products = useLiveQuery(() => db.products.toArray()) || [];
    const salesInvoices = useLiveQuery(() => db.salesInvoices.toArray()) || [];
    const purchaseInvoices = useLiveQuery(() => db.purchaseInvoices?.toArray() || Promise.resolve([])) || [];
    const journalVouchers = useLiveQuery(() => db.journalVouchers?.toArray() || Promise.resolve([])) || [];
    const expenses = useLiveQuery(() => db.expenses.toArray()) || [];

    const suppliers = useLiveQuery(() => db.suppliers.toArray()) || [];

    const generalAccounts = useLiveQuery(() => db.generalLedgerAccounts.toArray()) || [];
    const subsidiaryAccounts = useLiveQuery(() => db.subsidiaryLedgerAccounts.toArray()) || [];
    const detailedAccounts = useLiveQuery(() => db.detailedLedgerAccounts.toArray()) || [];

    // Document Modal State
    const [isDocModalOpen, setIsDocModalOpen] = useState(false);
    const [docModalType, setDocModalType] = useState<'invoice' | 'packing_list'>('invoice');
    const [docModalInvoiceType, setDocModalInvoiceType] = useState<'sales' | 'purchase'>('sales');
    const [selectedDoc, setSelectedDoc] = useState<SalesInvoice | PurchaseInvoice | null>(null);

    const handleOpenDocModal = (doc: SalesInvoice | PurchaseInvoice, type: 'invoice' | 'packing_list') => {
        setSelectedDoc(doc);
        setDocModalType(type);
        setDocModalInvoiceType('items' in doc && 'customerName' in doc ? 'sales' : 'purchase');
        setIsDocModalOpen(true);
    };

    // Double-Entry Trial Balance Calculation
    const trialBalance = useMemo(() => {
        const accountBalances = new Map<string, { code: string; name: string; debit: number; credit: number }>();

        // Initialize from Chart of Accounts
        subsidiaryAccounts.forEach(acc => {
            accountBalances.set(acc.code, { code: acc.code, name: acc.name_fa || acc.name, debit: 0, credit: 0 });
        });

        // Sum debits & credits from posted journal vouchers
        journalVouchers.forEach(voucher => {
            if (voucher.status === 'posted' || !voucher.status) {
                (voucher.items || []).forEach(item => {
                    const code = item.accountCode || item.accountId;
                    if (code) {
                        if (!accountBalances.has(code)) {
                            accountBalances.set(code, { code, name: item.accountName || code, debit: 0, credit: 0 });
                        }
                        const entry = accountBalances.get(code)!;
                        entry.debit += item.debit || 0;
                        entry.credit += item.credit || 0;
                    }
                });
            }
        });

        const list = Array.from(accountBalances.values()).map(acc => {
            const net = acc.debit - acc.credit;
            return {
                ...acc,
                endingDebit: net > 0 ? net : 0,
                endingCredit: net < 0 ? Math.abs(net) : 0
            };
        });

        const totalDebitMovement = list.reduce((s, i) => s + i.debit, 0);
        const totalCreditMovement = list.reduce((s, i) => s + i.credit, 0);
        const totalEndingDebit = list.reduce((s, i) => s + i.endingDebit, 0);
        const totalEndingCredit = list.reduce((s, i) => s + i.endingCredit, 0);

        return {
            list: list.filter(i => i.debit > 0 || i.credit > 0 || i.code.length <= 4),
            totalDebitMovement,
            totalCreditMovement,
            totalEndingDebit,
            totalEndingCredit,
            isBalanced: Math.abs(totalDebitMovement - totalCreditMovement) < 0.01
        };
    }, [journalVouchers, subsidiaryAccounts]);

    // Financial KPI Stats using Centralized FX Rates
    const financialStats = useMemo(() => {
        const totalSalesUSD = salesInvoices.reduce((sum, inv) => sum + convertToUSD(inv.totalAmount, inv.currency, rates), 0);
        const totalPurchasesUSD = purchaseInvoices.reduce((sum, inv) => sum + convertToUSD(inv.totalAmount, inv.currency, rates), 0);
        const totalExpensesUSD = expenses.reduce((sum, exp) => sum + convertToUSD(exp.amount, exp.currency, rates), 0);

        const grossProfitUSD = totalSalesUSD - totalPurchasesUSD;
        const netProfitUSD = grossProfitUSD - totalExpensesUSD;
        const profitMargin = totalSalesUSD > 0 ? (netProfitUSD / totalSalesUSD) * 100 : 0;

        return {
            totalSalesUSD,
            totalPurchasesUSD,
            totalExpensesUSD,
            grossProfitUSD,
            netProfitUSD,
            profitMargin,
            voucherCount: journalVouchers.length,
            purchaseCount: purchaseInvoices.length,
            salesCount: salesInvoices.length
        };
    }, [salesInvoices, purchaseInvoices, expenses, journalVouchers, rates]);

    return (
        <div className={`p-4 md:p-6 bg-slate-50 min-h-screen text-slate-800 font-sans ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="max-w-7xl mx-auto space-y-6">
                <AccountingHeader
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    voucherCount={financialStats.voucherCount}
                    purchaseCount={financialStats.purchaseCount}
                    salesCount={financialStats.salesCount}
                />

                {activeTab === 'dashboard' && (
                    <AccountingDashboardTab
                        financialStats={financialStats}
                        trialBalance={trialBalance}
                    />
                )}

                {activeTab === 'vouchers' && (
                    <JournalVouchersTab
                        journalVouchers={journalVouchers}
                        subsidiaryAccounts={subsidiaryAccounts}
                    />
                )}

                {activeTab === 'fxRevaluation' && (
                    <FxRevaluationTab
                        journalVouchers={journalVouchers}
                        subsidiaryAccounts={subsidiaryAccounts}
                    />
                )}

                {activeTab === 'purchases' && (
                    <PurchaseInvoicesTab
                        purchaseInvoices={purchaseInvoices}
                        orders={orders}
                        products={products}
                        suppliers={suppliers}
                        subsidiaryAccounts={subsidiaryAccounts}
                        detailedAccounts={detailedAccounts}
                        onOpenDocModal={handleOpenDocModal}
                    />
                )}

                {activeTab === 'sales' && (
                    <SalesInvoicesTab
                        salesInvoices={salesInvoices}
                        products={products}
                        purchaseInvoices={purchaseInvoices}
                        subsidiaryAccounts={subsidiaryAccounts}
                        detailedAccounts={detailedAccounts}
                        onOpenDocModal={handleOpenDocModal}
                    />
                )}

                {activeTab === 'chartOfAccounts' && (
                    <ChartOfAccountsTab
                        generalAccounts={generalAccounts}
                        subsidiaryAccounts={subsidiaryAccounts}
                        detailedAccounts={detailedAccounts}
                        journalVouchers={journalVouchers}
                    />
                )}

                {activeTab === 'inventory' && (
                    <InventoryCardexTab
                        products={products}
                        orders={orders}
                        purchaseInvoices={purchaseInvoices}
                        salesInvoices={salesInvoices}
                    />
                )}

                {activeTab === 'dubaiLedger' && (
                    <ProductAccountingLedgerTab
                        products={products}
                        purchaseInvoices={purchaseInvoices}
                        salesInvoices={salesInvoices}
                        journalVouchers={journalVouchers}
                        detailedAccounts={detailedAccounts}
                    />
                )}

                {activeTab === 'database' && (
                    <DatabaseExportTab />
                )}

                <DocumentModal
                    isOpen={isDocModalOpen}
                    onClose={() => setIsDocModalOpen(false)}
                    type={docModalType}
                    invoiceType={docModalInvoiceType}
                    doc={selectedDoc}
                />
            </div>
        </div>
    );
};

export default AccountingView;
