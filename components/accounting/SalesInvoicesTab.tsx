import React, { useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { SalesInvoice, SalesInvoiceItem, Product, PurchaseInvoice, Currency, SubsidiaryLedgerAccount, DetailedLedgerAccount } from '../../types';
import { db } from '../../db';
import {
    cascadeSyncSalesInvoiceVoucher,
    cascadeVoidSalesInvoice,
    syncAllPartiesDetailedAccounts,
    ensurePartyDetailedAccount
} from '../../utils/accountingEngine';
import { numberToPersianWords } from '../../utils/formatters';
import { InvoiceSettlementModal } from './InvoiceSettlementModal';
import { PartyStatementModal } from './PartyStatementModal';
import { ProductSearchCombobox } from '../common/ProductSearchCombobox';
import { PartySearchCombobox, PartyOption } from '../common/PartySearchCombobox';

interface SalesInvoicesTabProps {
    salesInvoices: SalesInvoice[];
    products: Product[];
    purchaseInvoices: PurchaseInvoice[];
    subsidiaryAccounts?: SubsidiaryLedgerAccount[];
    detailedAccounts?: DetailedLedgerAccount[];
    onOpenDocModal: (inv: SalesInvoice, type: 'invoice' | 'packing_list') => void;
}

export const SalesInvoicesTab: React.FC<SalesInvoicesTabProps> = ({
    salesInvoices,
    products,
    purchaseInvoices,
    subsidiaryAccounts = [],
    detailedAccounts = [],
    onOpenDocModal
}) => {
    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid' | 'voided'>('all');
    const [currencyFilter, setCurrencyFilter] = useState<string>('all');

    // Modals State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

    // Form fields
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerAccountCode, setCustomerAccountCode] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState('');
    const [currency, setCurrency] = useState<Currency>('AED');
    const [additionalCosts, setAdditionalCosts] = useState<number>(0);
    const [discount, setDiscount] = useState<number>(0);
    const [notes, setNotes] = useState('');

    // Settlement & Statement Modals State
    const [settlingInvoice, setSettlingInvoice] = useState<SalesInvoice | null>(null);
    const [statementAccountCode, setStatementAccountCode] = useState<string | null>(null);
    const [statementPartyName, setStatementPartyName] = useState<string | undefined>(undefined);
    const [isSyncingAccounts, setIsSyncingAccounts] = useState(false);

    // Form Items State
    const [items, setItems] = useState<Array<{
        id: string;
        productId?: string;
        internalCode?: string;
        productName: string;
        unitType?: 'carton' | 'piece' | 'mixed';
        itemsPerCarton?: number;
        cartonCount?: number;
        looseUnits?: number;
        quantity: number;
        unitPrice: number;
        cartonPrice?: number;
        totalPrice?: number;
        cbm?: number;
        grossWeight?: number;
    }>>([
        {
            id: `sitem-${Date.now()}-0`,
            productName: '',
            unitType: 'carton',
            itemsPerCarton: 1,
            cartonCount: 1,
            looseUnits: 0,
            quantity: 1,
            unitPrice: 0,
            cartonPrice: 0,
            totalPrice: 0,
            cbm: 0.1,
            grossWeight: 5
        }
    ]);

    // Fast product lookup map
    const productByCode = useMemo(() => {
        const map = new Map<string, Product>();
        products.forEach(p => {
            if (p.internalCode) map.set(p.internalCode.trim().toLowerCase(), p);
        });
        return map;
    }, [products]);

    // Unified customer / counterparty options
    const customerOptions: PartyOption[] = useMemo(() => {
        const list: PartyOption[] = [];
        const seen = new Set<string>();

        salesInvoices.forEach(inv => {
            if (inv.customerName && !seen.has(inv.customerName.trim().toLowerCase())) {
                list.push({
                    id: inv.id,
                    name: inv.customerName,
                    phone: inv.customerPhone,
                    accountCode: inv.customerAccountCode,
                    type: 'customer'
                });
                seen.add(inv.customerName.trim().toLowerCase());
            }
        });

        detailedAccounts.forEach(d => {
            if (!seen.has(d.name.trim().toLowerCase())) {
                list.push({
                    id: d.id || d.code,
                    name: d.name,
                    code: d.code,
                    accountCode: d.code,
                    phone: d.phone,
                    type: 'customer'
                });
                seen.add(d.name.trim().toLowerCase());
            }
        });

        return list;
    }, [salesInvoices, detailedAccounts]);

    // Open create modal
    const handleOpenCreateModal = () => {
        setEditingInvoiceId(null);
        setInvoiceNumber(`SAL-${Date.now().toString().slice(-6)}`);
        setCustomerName('');
        setCustomerPhone('');
        setCustomerAccountCode('');
        setDate(new Date().toISOString().split('T')[0]);
        setDueDate('');
        setCurrency('AED');
        setAdditionalCosts(0);
        setDiscount(0);
        setNotes('');
        setItems([
            {
                id: `sitem-${Date.now()}-0`,
                productName: '',
                unitType: 'carton',
                itemsPerCarton: 1,
                cartonCount: 1,
                looseUnits: 0,
                quantity: 1,
                unitPrice: 0,
                cartonPrice: 0,
                totalPrice: 0,
                cbm: 0.1,
                grossWeight: 5
            }
        ]);
        setIsCreateModalOpen(true);
    };

    // Open edit modal
    const handleEditInvoice = (inv: SalesInvoice) => {
        if (inv.isLocked) {
            alert(`🔒 این فاکتور قفل شده است و به دلیل نهایی‌شدن تسویه یا اسناد مالی، قابل ویرایش نمی‌باشد.`);
            return;
        }
        setEditingInvoiceId(inv.id);
        setInvoiceNumber(inv.invoiceNumber);
        setCustomerName(inv.customerName);
        setCustomerPhone(inv.customerPhone || '');
        setCustomerAccountCode(inv.customerAccountCode || '');
        setDate(inv.date);
        setDueDate(inv.dueDate || '');
        setCurrency(inv.currency);
        setAdditionalCosts(0);
        setDiscount(0);
        setNotes(inv.notes || '');
        setItems(inv.items.map(it => {
            const prod = it.productId ? products.find(p => p.id === it.productId) : null;
            const itemsPerCarton = Math.max(1, Number(it.itemsPerCarton) || prod?.itemsPerCarton || 1);
            return {
                id: it.id,
                productId: it.productId,
                internalCode: it.internalCode || it.partNumber,
                productName: it.productName,
                unitType: (it.unitType as any) || 'carton',
                itemsPerCarton: itemsPerCarton,
                cartonCount: it.cartonCount || (itemsPerCarton > 0 ? Math.ceil(it.quantity / itemsPerCarton) : 1),
                looseUnits: it.looseUnits || 0,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                cartonPrice: it.cartonPrice || (it.unitPrice * itemsPerCarton),
                totalPrice: it.totalPrice || (it.quantity * it.unitPrice),
                cbm: it.cbm || 0.1,
                grossWeight: it.grossWeight || 5
            };
        }));
        setIsCreateModalOpen(true);
    };

    // Handle Item Selection from Catalog
    const handleSelectProduct = (idx: number, productId: string) => {
        const prod = products.find(p => p.id === productId);
        if (!prod) return;

        setItems(prev => {
            const arr = [...prev];
            const itemsPerCarton = prod.itemsPerCarton || 1;
            const isCarton = arr[idx].unitType !== 'piece';
            const cartonCount = isCarton ? (Number(arr[idx].cartonCount) || 1) : 1;
            const qty = isCarton ? (cartonCount * itemsPerCarton) : (Number(arr[idx].quantity) || 1);
            const unitPrice = arr[idx].unitPrice || (prod.purchasePriceUSD ? Number((prod.purchasePriceUSD * 1.15).toFixed(3)) : 0);
            const cartonPrice = Number((unitPrice * itemsPerCarton).toFixed(3));

            arr[idx] = {
                ...arr[idx],
                productId: prod.id,
                internalCode: prod.internalCode,
                productName: prod.productNameFa || prod.description,
                unitType: isCarton ? 'carton' : 'piece',
                itemsPerCarton: isCarton ? itemsPerCarton : 1,
                cartonCount: isCarton ? cartonCount : 1,
                looseUnits: 0,
                quantity: qty,
                unitPrice: unitPrice,
                cartonPrice: cartonPrice,
                totalPrice: Number((qty * unitPrice).toFixed(3)),
                cbm: Number(((prod.cartonCBM || 0.1) * cartonCount).toFixed(3)),
                grossWeight: Number(((prod.grossWeight || 5) * cartonCount).toFixed(2))
            };
            return arr;
        });
    };

    // Smart Decomposition: Splits a single row with cartons + loose remainder into 2 separate clean rows
    const handleDecomposeItem = (idx: number) => {
        setItems(prev => {
            const it = prev[idx];
            if (!it) return prev;

            const prod = it.productId ? products.find(p => p.id === it.productId) : null;
            const ipc = Math.max(1, Number(it.itemsPerCarton) || prod?.itemsPerCarton || 1);
            const totalQ = Math.max(0, Number(it.quantity) || 0);

            const fullCartons = Math.floor(totalQ / ipc);
            const remainder = totalQ % ipc;

            if (fullCartons > 0 && remainder > 0) {
                // Split into 2 rows: 1st row = full cartons, 2nd row = loose units
                const row1: SalesInvoiceItem = {
                    ...it,
                    id: `sitem-${Date.now()}-c`,
                    unitType: 'carton',
                    cartonCount: fullCartons,
                    itemsPerCarton: ipc,
                    quantity: fullCartons * ipc,
                    looseUnits: 0,
                    cartonPrice: Number(((it.unitPrice || 0) * ipc).toFixed(3)),
                    totalPrice: Number((fullCartons * ipc * (it.unitPrice || 0)).toFixed(3)),
                    cbm: Number(((prod?.cartonCBM || 0.1) * fullCartons).toFixed(3)),
                    grossWeight: Number(((prod?.grossWeight || 5) * fullCartons).toFixed(2))
                };

                const row2: SalesInvoiceItem = {
                    ...it,
                    id: `sitem-${Date.now()}-rem`,
                    unitType: 'piece',
                    cartonCount: 0,
                    itemsPerCarton: 1,
                    quantity: remainder,
                    looseUnits: 0,
                    cartonPrice: Number((it.unitPrice || 0).toFixed(3)),
                    totalPrice: Number((remainder * (it.unitPrice || 0)).toFixed(3)),
                    cbm: Number(((prod?.cartonCBM || 0.1) * (remainder / ipc)).toFixed(3)),
                    grossWeight: Number(((prod?.grossWeight || 5) * (remainder / ipc)).toFixed(2))
                };

                const updated = [...prev];
                updated.splice(idx, 1, row1, row2);
                return updated;
            } else if (fullCartons === 0 && remainder > 0) {
                // Only loose units exist
                const updated = [...prev];
                updated[idx] = {
                    ...it,
                    unitType: 'piece',
                    cartonCount: 0,
                    itemsPerCarton: ipc,
                    quantity: remainder,
                    looseUnits: 0,
                    totalPrice: Number((remainder * (it.unitPrice || 0)).toFixed(3))
                };
                return updated;
            }
            return prev;
        });
    };

    // Automatic Split on Quantity Blur / Finish:
    // When user enters total quantity as a single number (e.g. 50 pcs for 12/ctn product),
    // system keeps the integer cartons (4 ctns = 48 pcs) in current row and automatically registers
    // the remainder (2 pcs) in a new row right below!
    const handleQuantityBlur = (idx: number) => {
        setItems(prev => {
            const it = prev[idx];
            if (!it) return prev;

            const prod = it.productId ? products.find(p => p.id === it.productId) : null;
            const ipc = Math.max(1, Number(it.itemsPerCarton) || prod?.itemsPerCarton || 1);
            const totalQ = Math.max(0, Number(it.quantity) || 0);

            if (ipc <= 1 || totalQ <= 0) return prev;

            const fullCartons = Math.floor(totalQ / ipc);
            const remainder = totalQ % ipc;

            if (fullCartons > 0 && remainder > 0) {
                // 1st row: full integer cartons
                const row1: SalesInvoiceItem = {
                    ...it,
                    unitType: 'carton',
                    cartonCount: fullCartons,
                    itemsPerCarton: ipc,
                    quantity: fullCartons * ipc,
                    looseUnits: 0,
                    cartonPrice: Number(((it.unitPrice || 0) * ipc).toFixed(3)),
                    totalPrice: Number((fullCartons * ipc * (it.unitPrice || 0)).toFixed(3)),
                    cbm: Number(((prod?.cartonCBM || 0.1) * fullCartons).toFixed(3)),
                    grossWeight: Number(((prod?.grossWeight || 5) * fullCartons).toFixed(2))
                };

                // 2nd row: remainder loose pieces in a new row
                const row2: SalesInvoiceItem = {
                    ...it,
                    id: `sitem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    unitType: 'piece',
                    cartonCount: 0,
                    itemsPerCarton: 1,
                    quantity: remainder,
                    looseUnits: 0,
                    cartonPrice: Number((it.unitPrice || 0).toFixed(3)),
                    totalPrice: Number((remainder * (it.unitPrice || 0)).toFixed(3)),
                    cbm: Number(((prod?.cartonCBM || 0.1) * (remainder / ipc)).toFixed(3)),
                    grossWeight: Number(((prod?.grossWeight || 5) * (remainder / ipc)).toFixed(2))
                };

                const updated = [...prev];
                updated.splice(idx, 1, row1, row2);
                return updated;
            } else if (fullCartons > 0 && remainder === 0) {
                // Exact integer cartons
                const updated = [...prev];
                updated[idx] = {
                    ...it,
                    unitType: 'carton',
                    cartonCount: fullCartons,
                    itemsPerCarton: ipc,
                    quantity: totalQ,
                    looseUnits: 0,
                    cartonPrice: Number(((it.unitPrice || 0) * ipc).toFixed(3)),
                    totalPrice: Number((totalQ * (it.unitPrice || 0)).toFixed(3)),
                    cbm: Number(((prod?.cartonCBM || 0.1) * fullCartons).toFixed(3)),
                    grossWeight: Number(((prod?.grossWeight || 5) * fullCartons).toFixed(2))
                };
                return updated;
            } else if (fullCartons === 0 && remainder > 0) {
                // Total quantity is less than 1 carton, mark as piece
                const updated = [...prev];
                updated[idx] = {
                    ...it,
                    unitType: 'piece',
                    cartonCount: 0,
                    itemsPerCarton: ipc,
                    quantity: remainder,
                    looseUnits: 0,
                    totalPrice: Number((remainder * (it.unitPrice || 0)).toFixed(3))
                };
                return updated;
            }
            return prev;
        });
    };

    // Split all rows in invoice that have carton remainders
    const handleDecomposeAllItems = () => {
        setItems(prev => {
            const nextList: typeof prev = [];
            let splitCount = 0;

            for (const it of prev) {
                const prod = it.productId ? products.find(p => p.id === it.productId) : null;
                const ipc = Math.max(1, Number(it.itemsPerCarton) || prod?.itemsPerCarton || 1);
                const totalQ = Math.max(0, Number(it.quantity) || 0);

                if (ipc > 1 && totalQ > 0) {
                    const fullCartons = Math.floor(totalQ / ipc);
                    const remainder = totalQ % ipc;

                    if (fullCartons > 0 && remainder > 0) {
                        splitCount++;
                        nextList.push({
                            ...it,
                            unitType: 'carton',
                            cartonCount: fullCartons,
                            itemsPerCarton: ipc,
                            quantity: fullCartons * ipc,
                            looseUnits: 0,
                            cartonPrice: Number(((it.unitPrice || 0) * ipc).toFixed(3)),
                            totalPrice: Number((fullCartons * ipc * (it.unitPrice || 0)).toFixed(3)),
                            cbm: Number(((prod?.cartonCBM || 0.1) * fullCartons).toFixed(3)),
                            grossWeight: Number(((prod?.grossWeight || 5) * fullCartons).toFixed(2))
                        });

                        nextList.push({
                            ...it,
                            id: `sitem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                            unitType: 'piece',
                            cartonCount: 0,
                            itemsPerCarton: 1,
                            quantity: remainder,
                            looseUnits: 0,
                            cartonPrice: Number((it.unitPrice || 0).toFixed(3)),
                            totalPrice: Number((remainder * (it.unitPrice || 0)).toFixed(3)),
                            cbm: Number(((prod?.cartonCBM || 0.1) * (remainder / ipc)).toFixed(3)),
                            grossWeight: Number(((prod?.grossWeight || 5) * (remainder / ipc)).toFixed(2))
                        });
                        continue;
                    }
                }
                nextList.push(it);
            }

            if (splitCount > 0) {
                alert(`✅ تعداد ${splitCount} ردیف با موفقیت به کارتن‌های سالم و ردیف‌های باقیمانده خرد تفکیک شدند.`);
            } else {
                alert('تمام ردیف‌ها در حال حاضر به صورت کارتن عدد صحیح یا اقلام خرد بدون باقیمانده هستند.');
            }

            return nextList;
        });
    };

    // Handle Item Field Changes
    const handleItemChange = (idx: number, field: string, value: any) => {
        setItems(prev => {
            const arr = [...prev];
            const currentItem = { ...arr[idx], [field]: value };
            const prod = currentItem.productId ? products.find(p => p.id === currentItem.productId) : null;
            let itemsPerCarton = Math.max(1, Number(currentItem.itemsPerCarton) || prod?.itemsPerCarton || 1);

            // Unit type changed (single packaging model per row)
            if (field === 'unitType') {
                const uType = value as 'carton' | 'piece';
                currentItem.unitType = uType;
                if (uType === 'carton') {
                    itemsPerCarton = prod?.itemsPerCarton || (currentItem.itemsPerCarton > 1 ? currentItem.itemsPerCarton : 1);
                    currentItem.itemsPerCarton = itemsPerCarton;
                    const ctns = Math.max(1, Number(currentItem.cartonCount) || 1);
                    currentItem.cartonCount = ctns;
                    currentItem.looseUnits = 0;
                    currentItem.quantity = ctns * itemsPerCarton;
                } else if (uType === 'piece') {
                    currentItem.itemsPerCarton = 1;
                    currentItem.cartonCount = 0;
                    currentItem.looseUnits = 0;
                    const q = Math.max(1, Number(currentItem.quantity) || 1);
                    currentItem.quantity = q;
                }
            }

            // Carton count changed (entered directly as integer cartons)
            if (field === 'cartonCount') {
                const ctns = Math.max(0, Math.floor(Number(value) || 0));
                currentItem.cartonCount = ctns;
                currentItem.unitType = ctns > 0 ? 'carton' : 'piece';
                currentItem.quantity = ctns * itemsPerCarton;
                currentItem.looseUnits = 0;
            }

            // Total quantity changed directly as integer piece number
            if (field === 'quantity') {
                const q = Math.max(0, Math.floor(Number(value) || 0));
                currentItem.quantity = q;
                if (itemsPerCarton > 0) {
                    const fullCtns = Math.floor(q / itemsPerCarton);
                    const remainder = q % itemsPerCarton;
                    currentItem.cartonCount = fullCtns;
                    currentItem.looseUnits = remainder;
                    if (fullCtns > 0) {
                        currentItem.unitType = 'carton';
                    } else {
                        currentItem.unitType = 'piece';
                    }
                }
            }

            // Items per carton changed
            if (field === 'itemsPerCarton') {
                const ipc = Math.max(1, Number(value) || 1);
                currentItem.itemsPerCarton = ipc;
                if (currentItem.unitType === 'carton') {
                    currentItem.quantity = (Number(currentItem.cartonCount) || 1) * ipc;
                }
            }

            // Unit Price entered
            if (field === 'unitPrice') {
                const up = Math.max(0, Number(value) || 0);
                currentItem.unitPrice = up;
                currentItem.cartonPrice = Number((up * itemsPerCarton).toFixed(3));
            }

            // Calculate total price
            const totalQty = Number(currentItem.quantity) || 0;
            const uPrice = Number(currentItem.unitPrice) || 0;
            currentItem.totalPrice = Number((totalQty * uPrice).toFixed(3));

            // Calculate CBM & weight
            const effCartons = Math.max(1, Number(currentItem.cartonCount) || 1);
            if (prod) {
                currentItem.cbm = Number(((prod.cartonCBM || 0.1) * effCartons).toFixed(3));
                currentItem.grossWeight = Number(((prod.grossWeight || 5) * effCartons).toFixed(2));
            }

            if (field === 'internalCode') {
                const code = String(value || '').trim();
                const matched = productByCode.get(code.toLowerCase());
                if (matched) {
                    currentItem.productId = matched.id;
                    currentItem.productName = matched.productNameFa || matched.description;
                    currentItem.itemsPerCarton = matched.itemsPerCarton || 1;
                    if (!currentItem.unitPrice && matched.purchasePriceUSD) {
                        currentItem.unitPrice = Number((matched.purchasePriceUSD * 1.15).toFixed(3));
                    }
                    if (currentItem.unitType === 'carton') {
                        currentItem.quantity = (Number(currentItem.cartonCount) || 1) * (matched.itemsPerCarton || 1);
                    }
                    const cCount = Number(currentItem.cartonCount) || 1;
                    currentItem.cbm = Number(((matched.cartonCBM || 0.1) * cCount).toFixed(3));
                    currentItem.grossWeight = Number(((matched.grossWeight || 5) * cCount).toFixed(2));
                }
            }

            arr[idx] = currentItem;
            return arr;
        });
    };

    // Add empty row
    const handleAddItem = () => {
        setItems(prev => [
            ...prev,
            {
                id: `sitem-${Date.now()}-${prev.length}`,
                productName: '',
                unitType: 'carton',
                itemsPerCarton: 1,
                cartonCount: 1,
                looseUnits: 0,
                quantity: 1,
                unitPrice: 0,
                cartonPrice: 0,
                totalPrice: 0,
                cbm: 0.1,
                grossWeight: 5
            }
        ]);
    };

    // Remove row
    const handleRemoveItem = (idx: number) => {
        if (items.length <= 1) return;
        setItems(prev => prev.filter((_, i) => i !== idx));
    };

    // Calculate totals
    const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
    const totalCartons = items.reduce((s, it) => s + (Number(it.cartonCount) || 0), 0);
    const totalUnits = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const totalAdditionalCosts = Number(additionalCosts) || 0;
    const totalDiscount = Number(discount) || 0;
    const totalAmount = Math.max(0, subtotal + totalAdditionalCosts - totalDiscount);

    // Save Sales Invoice
    const handleSaveInvoice = async () => {
        if (!customerName.trim()) {
            alert('لطفاً نام خریدار / مشتری را وارد نمایید.');
            return;
        }

        if (items.length === 0 || subtotal <= 0) {
            alert('فاکتور فروش باید شامل حداقل یک قلم کالا با تعداد و قیمت معتبر باشد.');
            return;
        }

        const invNumber = invoiceNumber.trim() || `SAL-${Date.now().toString().slice(-6)}`;
        const invoiceId = editingInvoiceId || `sal-${Date.now()}`;

        // Ensure party has detailed ledger account
        const partyAcc = await ensurePartyDetailedAccount(
            'customer',
            customerName.trim(),
            { phone: customerPhone.trim() || undefined, customCode: customerAccountCode }
        );
        const accountCode = partyAcc.code;

        // Advisory Credit Limit Check (Non-blocking alert to maintain user autonomy)
        const targetAcc = detailedAccounts.find(a => a.code === accountCode);
        if (targetAcc && targetAcc.creditLimit && targetAcc.creditLimit > 0) {
            const currentDebt = (targetAcc.currentDebit || 0) - (targetAcc.currentCredit || 0);
            const projectedDebt = currentDebt + totalAmount;
            if (projectedDebt > targetAcc.creditLimit) {
                const proceed = confirm(
                    `⚠️ هشدار ارشادی سقف اعتبار مشتری:\n\n` +
                    `مشتری: ${customerName}\n` +
                    `سقف اعتبار تعیین‌شده: ${targetAcc.creditLimit.toLocaleString()} ${currency}\n` +
                    `بدهی جاری: ${currentDebt.toLocaleString()} ${currency}\n` +
                    `مبلغ این فاکتور: ${totalAmount.toLocaleString()} ${currency}\n` +
                    `بدهی پس از ثبت: ${projectedDebt.toLocaleString()} ${currency}\n\n` +
                    `آیا با وجود عبور از سقف اعتبار، مایل به ثبت و صدور این فاکتور می‌باشید؟`
                );
                if (!proceed) return;
            }
        }

        const salesItems: SalesInvoiceItem[] = items.map((it, idx) => ({
            id: it.id || `sitem-${Date.now()}-${idx}`,
            productId: it.productId,
            internalCode: it.internalCode || undefined,
            partNumber: it.internalCode || undefined,
            productName: it.productName.trim() || `کالای ردیف ${idx + 1}`,
            unitType: it.unitType || 'carton',
            itemsPerCarton: Number(it.itemsPerCarton) || 1,
            cartonCount: Number(it.cartonCount) || 1,
            looseUnits: Number(it.looseUnits) || 0,
            quantity: Number(it.quantity) || 1,
            unitPrice: Number(it.unitPrice) || 0,
            cartonPrice: Number(it.cartonPrice) || (Number(it.unitPrice) * (Number(it.itemsPerCarton) || 1)),
            totalPrice: (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0),
            cbm: Number(it.cbm) || 0.1,
            grossWeight: Number(it.grossWeight) || 5
        }));

        const invoiceData: SalesInvoice = {
            id: invoiceId,
            invoiceNumber: invNumber,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim() || undefined,
            customerAccountCode: accountCode,
            date: date,
            dueDate: dueDate || undefined,
            items: salesItems,
            subtotal: subtotal,
            discount: totalDiscount,
            tax: 0,
            totalAmount: totalAmount,
            paidAmount: editingInvoiceId ? (salesInvoices.find(s => s.id === editingInvoiceId)?.paidAmount || 0) : 0,
            currency: currency,
            currencyRate: 1,
            status: editingInvoiceId ? (salesInvoices.find(s => s.id === editingInvoiceId)?.status || 'unpaid') : 'unpaid',
            notes: notes,
            createdAt: new Date().toISOString()
        };

        if (editingInvoiceId) {
            await db.salesInvoices.put(invoiceData);
        } else {
            await db.salesInvoices.add(invoiceData);
        }

        // Auto-post double-entry journal voucher for sales
        await cascadeSyncSalesInvoiceVoucher(invoiceData);

        setIsCreateModalOpen(false);
        setEditingInvoiceId(null);
        alert(`✅ فاکتور فروش شماره ${invNumber} با موفقیت صادر و سند حسابداری دوبل تفصیلی ثبت شد.`);
    };

    // Void Invoice (Cascade Void)
    const handleVoidInvoice = async (inv: SalesInvoice) => {
        const reason = prompt(`لطفاً دلیل ابطال فاکتور فروش شماره ${inv.invoiceNumber} را وارد نمایید:`, 'ابطال توافقی فاکتور فروش');
        if (reason === null) return;
        await cascadeVoidSalesInvoice(inv.id, reason);
        alert(`✅ فاکتور فروش ${inv.invoiceNumber} و سند دوبل متناظر با موفقیت ابطال شد.`);
    };

    // Delete Invoice
    const handleDeleteInvoice = async (inv: SalesInvoice) => {
        if (!confirm(`آیا از حذف کامل فاکتور فروش شماره ${inv.invoiceNumber} اطمینان دارید؟`)) {
            return;
        }
        await db.salesInvoices.delete(inv.id);
        const linkedVouchers = await db.journalVouchers.where('sourceId').equals(inv.id).toArray();
        for (const v of linkedVouchers) {
            await db.journalVouchers.delete(v.id);
        }
        alert('فاکتور فروش و اسناد متناظر حذف شد.');
    };

    // Sync All Customers Detailed Accounts
    const handleSyncParties = async () => {
        setIsSyncingAccounts(true);
        try {
            const res = await syncAllPartiesDetailedAccounts();
            alert(`✅ همگام‌سازی حساب‌های تفصیلی انجام شد:\n\n• مشتریان متصل: ${res.customersSynced}\n• تامین‌کنندگان متصل: ${res.suppliersSynced}\n• حساب‌های تفصیلی جدید: ${res.newAccountsCreated}`);
        } catch (err: any) {
            alert(`خطا در همگام‌سازی: ${err.message || err}`);
        } finally {
            setIsSyncingAccounts(false);
        }
    };

    // Export All Sales Invoices to Excel
    const handleExportSalesInvoicesExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Newland Trading Group';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Sales_Invoices', {
            views: [{ rightToLeft: true }]
        });

        sheet.mergeCells('A1:H1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'فهرست جامع فاکتورهای فروش کالا - شرکت بازرگانی بین‌المللی نیولند';
        titleCell.font = { name: 'Tahoma', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 32;

        const headers = ['شماره فاکتور', 'تاریخ', 'خریدار / مشتری', 'کد تفصیلی', 'تعداد اقلام', 'ارز', 'مبلغ کل', 'وضعیت تسویه'];
        const headerRow = sheet.addRow(headers);
        headerRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 24;

        filteredInvoices.forEach(inv => {
            const statusFa = inv.status === 'paid' ? 'تسویه کامل' : inv.status === 'partial' ? 'تسویه ناقص' : inv.status === 'voided' ? 'ابطال شده' : 'تسویه نشده';
            const r = sheet.addRow([
                inv.invoiceNumber,
                inv.date,
                inv.customerName,
                inv.customerAccountCode || '-',
                inv.items.length,
                inv.currency,
                inv.totalAmount,
                statusFa
            ]);
            r.font = { name: 'Tahoma', size: 9 };
            r.alignment = { horizontal: 'center', vertical: 'middle' };
            r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
        });

        const totalSum = filteredInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
        const totRow = sheet.addRow(['جمع کل فاکتورها', '', '', '', '', '', totalSum, '']);
        totRow.font = { name: 'Tahoma', size: 10, bold: true };
        totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        totRow.alignment = { horizontal: 'center', vertical: 'middle' };

        sheet.columns = [
            { width: 16 },
            { width: 14 },
            { width: 30 },
            { width: 16 },
            { width: 14 },
            { width: 12 },
            { width: 20 },
            { width: 16 }
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewLand_Sales_Invoices_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Filtered Invoices
    const filteredInvoices = salesInvoices.filter(inv => {
        const matchesSearch =
            inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.customerAccountCode && inv.customerAccountCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
            inv.items.some(it => it.productName.toLowerCase().includes(searchTerm.toLowerCase()) || (it.internalCode && it.internalCode.toLowerCase().includes(searchTerm.toLowerCase())));

        if (!matchesSearch) return false;

        if (currencyFilter !== 'all' && inv.currency !== currencyFilter) return false;

        if (statusFilter === 'unpaid' && (inv.status === 'paid' || inv.status === 'voided')) return false;
        if (statusFilter === 'paid' && inv.status !== 'paid') return false;
        if (statusFilter === 'partial' && inv.status !== 'partial') return false;
        if (statusFilter === 'voided' && inv.status !== 'voided') return false;

        return true;
    });

    // KPI Calculations
    const totalSalesAED = salesInvoices.filter(i => i.status !== 'voided' && i.currency === 'AED').reduce((s, i) => s + (i.totalAmount || 0), 0);
    const totalSalesUSD = salesInvoices.filter(i => i.status !== 'voided' && i.currency === 'USD').reduce((s, i) => s + (i.totalAmount || 0), 0);
    const totalSalesCNY = salesInvoices.filter(i => i.status !== 'voided' && i.currency === 'CNY').reduce((s, i) => s + (i.totalAmount || 0), 0);
    const totalSalesTOMAN = salesInvoices.filter(i => i.status !== 'voided' && i.currency === 'TOMAN').reduce((s, i) => s + (i.totalAmount || 0), 0);
    const unpaidSalesCount = salesInvoices.filter(i => i.status !== 'paid' && i.status !== 'voided').length;
    const totalCartonsSum = salesInvoices.filter(i => i.status !== 'voided').reduce((s, inv) => s + (inv.items?.reduce((isum, it) => isum + (Number(it.cartonCount) || 0), 0) || 0), 0);

    return (
        <div className="space-y-5">
            {/* Top Financial KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-slate-500 text-xs font-medium mb-1.5">
                        کل فاکتورهای فروش
                    </div>
                    <div className="text-xl font-bold text-slate-800 font-mono">
                        {salesInvoices.length} <span className="text-xs font-normal text-slate-500 font-sans">فاکتور</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                        {unpaidSalesCount} فاکتور با مطالبات باز
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-slate-500 text-xs font-medium mb-1.5">
                        مجموع فروش (درهم AED)
                    </div>
                    <div className="text-xl font-bold text-emerald-700 font-mono">
                        {totalSalesAED.toLocaleString()} <span className="text-xs font-bold font-sans">AED</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                        دلار: {totalSalesUSD.toLocaleString()} $ | یوان: {totalSalesCNY.toLocaleString()} ¥
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-slate-500 text-xs font-medium mb-1.5">
                        مجموع کارتن‌های فروخته‌شده
                    </div>
                    <div className="text-xl font-bold text-indigo-700 font-mono">
                        {totalCartonsSum.toLocaleString()} <span className="text-xs font-normal font-sans">کارتن</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                        خروج رسمی از انبارهای بازرگانی
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-slate-500 text-xs font-medium mb-1.5">
                        فروش ریالی / تومانی
                    </div>
                    <div className="text-xl font-bold text-slate-800 font-mono">
                        {totalSalesTOMAN.toLocaleString()} <span className="text-xs font-normal font-sans">تومان</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                        فروش‌ها و عواید داخلی
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-800">
                        فاکتورهای فروش کالا (Sales Invoices)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        صدور و مدیریت فاکتورهای رسمی فروش، پکینگ لیست‌ها و ثبت خودکار اسناد دریافت
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {/* Sync Accounts */}
                    <button
                        onClick={handleSyncParties}
                        disabled={isSyncingAccounts}
                        className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg border border-slate-200 transition flex items-center gap-1.5 disabled:opacity-50"
                        title="همگام‌سازی حساب‌های تفصیلی مشتریان"
                    >
                        <span>حساب‌های تفصیلی</span>
                    </button>

                    {/* Export Invoices */}
                    <button
                        onClick={handleExportSalesInvoicesExcel}
                        className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg border border-slate-200 transition flex items-center gap-1.5"
                    >
                        <span>خروجی اکسل</span>
                    </button>

                    {/* New Sales Invoice Button */}
                    <button
                        onClick={handleOpenCreateModal}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg shadow-xs transition flex items-center gap-1.5"
                    >
                        <span className="text-base leading-none">+</span>
                        <span>فاکتور فروش جدید</span>
                    </button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-center gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-semibold">وضعیت تسویه:</span>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-semibold"
                        >
                            <option value="all">همه وضعیت‌ها ({salesInvoices.length})</option>
                            <option value="unpaid">تسویه نشده (بدهکار مشتری)</option>
                            <option value="partial">تسویه ناقص</option>
                            <option value="paid">تسویه کامل (دریافت شده)</option>
                            <option value="voided">ابطال شده</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-semibold">ارز:</span>
                        <select
                            value={currencyFilter}
                            onChange={(e) => setCurrencyFilter(e.target.value)}
                            className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-semibold"
                        >
                            <option value="all">همه ارزها</option>
                            <option value="AED">درهم (AED)</option>
                            <option value="USD">دلار (USD)</option>
                            <option value="CNY">یوان (CNY)</option>
                            <option value="TOMAN">تومان (TOMAN)</option>
                        </select>
                    </div>
                </div>

                <div className="w-full md:w-72">
                    <input
                        type="text"
                        placeholder="جستجو در شماره فاکتور، خریدار، شرح کالا..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
            </div>

            {/* Invoices Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                                <th className="p-3 w-10 text-center">#</th>
                                <th className="p-3 min-w-[130px]">شماره فاکتور</th>
                                <th className="p-3 min-w-[180px]">خریدار / مشتری</th>
                                <th className="p-3 text-center min-w-[100px]">کد تفصیلی</th>
                                <th className="p-3 min-w-[100px]">تاریخ صدور</th>
                                <th className="p-3 text-center min-w-[120px]">تعداد و کارتن</th>
                                <th className="p-3 text-center min-w-[120px]">مبلغ کل</th>
                                <th className="p-3 text-center min-w-[70px]">ارز</th>
                                <th className="p-3 text-center min-w-[110px]">وضعیت تسویه</th>
                                <th className="p-3 text-center min-w-[190px]">اسناد و عملیات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {filteredInvoices.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="p-8 text-center text-slate-400 font-medium">
                                        هیچ فاکتور فروشی یافت نشد. با کلیک بر روی دکمه «صدور فاکتور فروش جدید» فاکتور ثبت کنید.
                                    </td>
                                </tr>
                            ) : (
                                filteredInvoices.map((inv, idx) => {
                                    const isVoided = inv.status === 'voided';
                                    const isPaid = inv.status === 'paid';
                                    const isPartial = inv.status === 'partial';
                                    const paid = inv.paidAmount || 0;
                                    const totalCtns = inv.items?.reduce((s, it) => s + (Number(it.cartonCount) || 0), 0) || 0;
                                    const totalUnitsCount = inv.items?.reduce((s, it) => s + (Number(it.quantity) || 0), 0) || 0;

                                    return (
                                        <tr key={inv.id} className={`hover:bg-slate-50/80 transition ${isVoided ? 'bg-rose-50/40 opacity-70' : ''}`}>
                                            <td className="p-3 text-center text-slate-400 font-mono font-bold">{idx + 1}</td>
                                            <td className="p-3 font-mono font-bold text-indigo-700">
                                                {inv.invoiceNumber}
                                                {isVoided && <span className="block text-[10px] text-rose-600 font-bold">🚫 ابطال شده</span>}
                                            </td>
                                            <td className="p-3 font-semibold text-slate-800">
                                                <div className="flex items-center gap-1.5">
                                                    <span>{inv.customerName}</span>
                                                    {inv.customerPhone && <span className="text-slate-400 font-mono text-[11px]">({inv.customerPhone})</span>}
                                                    <button
                                                        onClick={() => {
                                                            setStatementAccountCode(inv.customerAccountCode || '2101001');
                                                            setStatementPartyName(inv.customerName);
                                                        }}
                                                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-normal underline mr-1"
                                                        title="مشاهده صورتحساب تفصیلی این مشتری"
                                                    >
                                                        (صورتحساب)
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                    {inv.customerAccountCode || '۲۱۰۱۰xx'}
                                                </span>
                                            </td>
                                            <td className="p-3 font-mono text-slate-600">{inv.date}</td>
                                            <td className="p-3 text-center">
                                                <div className="font-mono font-bold text-slate-800">{totalCtns.toLocaleString()} کارتن</div>
                                                <div className="text-[10px] text-slate-500 font-mono">({totalUnitsCount.toLocaleString()} عدد)</div>
                                            </td>
                                            <td className="p-3 text-center font-mono font-bold text-emerald-700 text-sm">
                                                {inv.totalAmount.toLocaleString()}
                                            </td>
                                            <td className="p-3 text-center font-bold text-slate-700">{inv.currency}</td>
                                            <td className="p-3 text-center">
                                                {isVoided ? (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                                        ابطال شده
                                                    </span>
                                                ) : isPaid ? (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        ✓ تسویه کامل
                                                    </span>
                                                ) : isPartial ? (
                                                    <div className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-0.5">
                                                        تسویه ناقص ({paid.toLocaleString()})
                                                    </div>
                                                ) : (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                        ⏳ تسویه نشده
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex flex-wrap justify-center items-center gap-1.5">
                                                    {!isVoided && !isPaid && (
                                                        <button
                                                            onClick={() => setSettlingInvoice(inv)}
                                                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1"
                                                            title="ثبت سند دریافت وجه و تسویه مطالبات از مشتری"
                                                        >
                                                            💳 دریافت وجه
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => onOpenDocModal(inv, 'invoice')}
                                                        className="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold border border-blue-200 transition"
                                                        title="مشاهده و چاپ فاکتور رسمی"
                                                    >
                                                        📄 فاکتور
                                                    </button>
                                                    <button
                                                        onClick={() => onOpenDocModal(inv, 'packing_list')}
                                                        className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold border border-emerald-200 transition"
                                                        title="مشاهده پکینگ لیست"
                                                    >
                                                        📦 پکینگ
                                                    </button>
                                                    {!isVoided && (
                                                        <button
                                                            onClick={() => handleEditInvoice(inv)}
                                                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition"
                                                            title="ویرایش فاکتور فروش"
                                                        >
                                                            ✏️
                                                        </button>
                                                    )}
                                                    {!isVoided && (
                                                        <button
                                                            onClick={() => handleVoidInvoice(inv)}
                                                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200 transition"
                                                            title="ابطال فاکتور فروش"
                                                        >
                                                            🚫
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDeleteInvoice(inv)}
                                                        className="px-2 py-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs transition"
                                                        title="حذف فاکتور"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Standard Sales Invoice Creation / Editing Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-6xl w-full p-5 sm:p-7 space-y-5 max-h-[94vh] flex flex-col my-auto">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center pb-4 border-b border-slate-200">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base sm:text-lg flex items-center gap-2">
                                    <span className="w-3 h-3 bg-indigo-600 rounded-full ring-4 ring-indigo-100" />
                                    {editingInvoiceId ? 'ویرایش فاکتور فروش کالا' : 'صدور فاکتور فروش رسمی کالا و خدمات'}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    انتخاب اقلام از کاتالوگ انبار، تعیین بسته‌بندی کارتن و ثبت خودکار سند دوبل مالی
                                </p>
                            </div>
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 space-y-5 pr-1">
                            {/* Metadata Section - 2 Balance Cards */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Card 1: Customer Details */}
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                                    <div className="text-xs font-semibold text-slate-800 border-b border-slate-200 pb-2">
                                        <span>مشخصات طرف حساب و خریدار</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div className="sm:col-span-2">
                                            <PartySearchCombobox
                                                parties={customerOptions}
                                                value={customerName}
                                                onSelectParty={(party) => {
                                                    setCustomerName(party.name);
                                                    if (party.phone) setCustomerPhone(party.phone);
                                                    if (party.accountCode) setCustomerAccountCode(party.accountCode);
                                                }}
                                                onChangeText={(text) => {
                                                    setCustomerName(text);
                                                }}
                                                placeholder="جستجو یا انتخاب خریدار با نام، کد یا تلفن..."
                                                label="نام طرف حساب / خریدار:"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-slate-600 font-semibold mb-1">شماره تماس / موبایل:</label>
                                            <input
                                                type="text"
                                                value={customerPhone}
                                                onChange={(e) => setCustomerPhone(e.target.value)}
                                                placeholder="0912..."
                                                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 text-xs font-mono focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-slate-600 font-semibold mb-1">کد حساب تفصیلی:</label>
                                            <input
                                                type="text"
                                                value={customerAccountCode}
                                                onChange={(e) => setCustomerAccountCode(e.target.value)}
                                                placeholder="۲۱۰۱۰۰۱"
                                                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 text-xs font-mono font-medium focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Card 2: Invoice Properties */}
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                                    <div className="text-xs font-semibold text-slate-800 border-b border-slate-200 pb-2">
                                        <span>مشخصات و تاریخ فاکتور</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div>
                                            <label className="block text-slate-600 font-semibold mb-1">شماره فاکتور فروش:</label>
                                            <input
                                                type="text"
                                                value={invoiceNumber}
                                                onChange={(e) => setInvoiceNumber(e.target.value)}
                                                placeholder="SAL-1001"
                                                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 text-xs font-mono font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-slate-600 font-semibold mb-1">واحد پولی فاکتور:</label>
                                            <select
                                                value={currency}
                                                onChange={(e) => setCurrency(e.target.value as Currency)}
                                                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="AED">درهم امارات (AED)</option>
                                                <option value="USD">دلار آمریکا (USD)</option>
                                                <option value="CNY">یوان چین (CNY)</option>
                                                <option value="TOMAN">تومان ایران (TOMAN)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-slate-600 font-semibold mb-1">تاریخ صدور فاکتور:</label>
                                            <input
                                                type="date"
                                                value={date}
                                                onChange={(e) => setDate(e.target.value)}
                                                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 text-xs font-mono focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-slate-600 font-semibold mb-1">تاریخ سررسید تسویه:</label>
                                            <input
                                                type="date"
                                                value={dueDate}
                                                onChange={(e) => setDueDate(e.target.value)}
                                                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 text-xs font-mono focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Standard Items Table Section */}
                            <div className="space-y-2.5">
                                <div className="flex flex-wrap justify-between items-center gap-2">
                                    <div className="text-xs font-semibold text-slate-800">
                                        <span>اقلام فاکتور فروش ({items.length} ردیف کالا)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleDecomposeAllItems}
                                            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition"
                                            title="تفکیک تمام سطرهای دارای باقیمانده به کارتن‌های سالم و سطرهای جدید خرد"
                                        >
                                            <span>تفکیک خودکار اقلام خرد</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAddItem}
                                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5 shadow-xs"
                                        >
                                            <span>+ افزودن سطر کالا</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Smart UX Guidance Banner */}
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 px-3 text-[11px] text-slate-600 flex items-center justify-between gap-2">
                                    <span>
                                        <strong>راهنمای تعداد:</strong> تعداد کل را به عدد وارد کنید؛ سیستم تعداد کارتن و اقلام خرد باقیمانده را محاسبه می‌کند.
                                    </span>
                                </div>

                                <div className="overflow-x-auto rounded-xl border border-slate-200 min-h-[280px] pb-24">
                                    <table className="w-full text-right text-xs">
                                        <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                                            <tr>
                                                <th className="p-2.5 w-8 text-center">#</th>
                                                <th className="p-2.5 min-w-[180px]">کد و کاتالوگ انبار</th>
                                                <th className="p-2.5 min-w-[170px]">نام و شرح کالا</th>
                                                <th className="p-2.5 w-28 text-center bg-slate-100/80 text-slate-800 font-bold border-x border-slate-200">
                                                    تعداد کل (عدد)
                                                </th>
                                                <th className="p-2.5 w-24 text-center">تعداد در کارتن</th>
                                                <th className="p-2.5 w-24 text-center">تعداد کارتن</th>
                                                <th className="p-2.5 w-28 text-center">نوع بسته</th>
                                                <th className="p-2.5 w-28 text-center">فی واحد ({currency})</th>
                                                <th className="p-2.5 w-32 text-center">مبلغ کل ({currency})</th>
                                                <th className="p-2.5 w-14 text-center">حذف</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {items.map((it, idx) => {
                                                const ipc = Math.max(1, Number(it.itemsPerCarton) || 1);
                                                const totalQty = Number(it.quantity) || 0;
                                                const fullCtns = Math.floor(totalQty / ipc);
                                                const remainderPieces = totalQty % ipc;
                                                const hasRemainder = ipc > 1 && totalQty > 0 && fullCtns > 0 && remainderPieces > 0;
                                                const isPieceRow = it.unitType === 'piece' || (it.cartonCount === 0 && fullCtns === 0);

                                                return (
                                                    <React.Fragment key={it.id || idx}>
                                                        <tr className={`transition hover:bg-slate-50 ${isPieceRow ? 'bg-slate-50/60' : ''}`}>
                                                            <td className="p-2 text-center text-slate-400 font-mono font-medium">{idx + 1}</td>

                                                            {/* Item Code Search & Combobox */}
                                                            <td className="p-2 min-w-[170px]">
                                                                <ProductSearchCombobox
                                                                    products={products}
                                                                    mode="code"
                                                                    value={it.internalCode || ''}
                                                                    placeholder="کد کالا (NL-101)..."
                                                                    onSelectProduct={(p) => handleSelectProduct(idx, p.id)}
                                                                    onChangeText={(text) => handleItemChange(idx, 'internalCode', text)}
                                                                />
                                                            </td>

                                                            {/* Description Search & Combobox */}
                                                            <td className="p-2 min-w-[220px]">
                                                                <ProductSearchCombobox
                                                                    products={products}
                                                                    mode="name"
                                                                    value={it.productName || ''}
                                                                    placeholder="نام یا شرح کالا..."
                                                                    onSelectProduct={(p) => handleSelectProduct(idx, p.id)}
                                                                    onChangeText={(text) => handleItemChange(idx, 'productName', text)}
                                                                />
                                                            </td>

                                                            {/* Prominent Numeric Input: Total Quantity (PCS) with Auto-Decompose on Blur */}
                                                            <td className="p-2 text-center bg-slate-50/50 border-x border-slate-200">
                                                                <div className="space-y-1">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        value={it.quantity !== undefined ? it.quantity : 0}
                                                                        onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                                                        onBlur={() => handleQuantityBlur(idx)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                e.preventDefault();
                                                                                handleQuantityBlur(idx);
                                                                            }
                                                                        }}
                                                                        className="w-full rounded-lg p-1.5 text-xs text-center font-bold font-mono bg-white border border-slate-300 text-slate-900 focus:ring-2 focus:ring-indigo-500"
                                                                        placeholder="تعداد به عدد..."
                                                                    />
                                                                    {hasRemainder && (
                                                                        <div className="text-[10px] text-slate-500 font-medium leading-tight">
                                                                            {fullCtns} کارتن + {remainderPieces} خرد
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            {/* Items per Carton (Ratio) */}
                                                            <td className="p-2 text-center">
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    value={it.itemsPerCarton || 1}
                                                                    onChange={(e) => handleItemChange(idx, 'itemsPerCarton', parseFloat(e.target.value) || 1)}
                                                                    onBlur={() => handleQuantityBlur(idx)}
                                                                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-center font-medium font-mono text-slate-700"
                                                                />
                                                            </td>

                                                            {/* Carton Count (Integer cartons) */}
                                                            <td className="p-2 text-center">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="1"
                                                                    value={it.cartonCount !== undefined ? it.cartonCount : 0}
                                                                    onChange={(e) => handleItemChange(idx, 'cartonCount', parseFloat(e.target.value) || 0)}
                                                                    className="w-full rounded-lg p-1.5 text-xs text-center font-medium font-mono bg-white border border-slate-300 text-slate-800"
                                                                    placeholder="0"
                                                                />
                                                            </td>

                                                            {/* Packaging Type Badge */}
                                                            <td className="p-2 text-center">
                                                                {isPieceRow ? (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                                                        خرد / باقیمانده
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                                                        کارتن کامل
                                                                    </span>
                                                                )}
                                                            </td>

                                                            {/* Unit Price */}
                                                            <td className="p-2 text-center">
                                                                <input
                                                                    type="number"
                                                                    step="any"
                                                                    min="0"
                                                                    value={it.unitPrice !== undefined ? it.unitPrice : 0}
                                                                    onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                                                                    placeholder="0.00"
                                                                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-center font-semibold font-mono text-slate-800"
                                                                />
                                                            </td>

                                                            {/* Total Price */}
                                                            <td className="p-2 text-center font-mono font-bold text-slate-800 text-xs">
                                                                {((it.quantity || 0) * (it.unitPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
                                                            </td>

                                                            {/* Actions */}
                                                            <td className="p-2 text-center">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveItem(idx)}
                                                                        disabled={items.length <= 1}
                                                                        className="text-slate-400 hover:text-red-600 disabled:opacity-20 p-1.5 transition rounded-lg hover:bg-red-50"
                                                                        title="حذف سطر"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>

                                                        {/* Sub-row: Formula Breakdown and Smart Decomposition Trigger */}
                                                        <tr className="bg-slate-50/60 border-b border-slate-200">
                                                            <td colSpan={10} className="px-3 py-1.5 text-[11px]">
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <div className="flex items-center gap-2 text-slate-600 font-mono">
                                                                        {!isPieceRow ? (
                                                                            <span className="bg-white text-slate-700 border border-slate-200 px-2 py-0.5 rounded font-medium">
                                                                                {it.cartonCount || 0} کارتن × {ipc} تایی = {it.quantity || 0} عدد × {(it.unitPrice || 0).toLocaleString()} {currency} = {((it.quantity || 0) * (it.unitPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="bg-white text-slate-700 border border-slate-200 px-2 py-0.5 rounded font-medium">
                                                                                {it.quantity || 0} عدد (خرد) × {(it.unitPrice || 0).toLocaleString()} {currency} = {((it.quantity || 0) * (it.unitPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {/* Quick Decomposition Trigger Button */}
                                                                    {hasRemainder && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDecomposeItem(idx)}
                                                                            className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded text-[11px] font-medium transition flex items-center gap-1"
                                                                            title="تفکیک فوری این سطر به کارتن کامل و سطر جدید باقیمانده"
                                                                        >
                                                                            تفکیک به ۲ سطر: {fullCtns} کارتن ({fullCtns * ipc} عدد) + {remainderPieces} عدد خرد
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Accounting Summary Box & Notes */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                                {/* Notes and Terms */}
                                <div className="space-y-2">
                                    <label className="block text-slate-700 font-bold text-xs">توضیحات، شرایط تحویل و تسویه فاکتور فروش:</label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={4}
                                        placeholder="توضیحات و شرایط فروش، شیوه ارسال و تحویل کالا، شماره حساب جهت واریز وجه..."
                                        className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3 text-slate-800 text-xs leading-relaxed"
                                    />
                                </div>

                                {/* Financial Summary Totals Card */}
                                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2 text-xs">
                                    <div className="flex justify-between text-slate-600">
                                        <span>تعداد کل کارتن‌ها:</span>
                                        <span className="font-mono font-bold text-indigo-700">{totalCartons.toLocaleString()} کارتن</span>
                                    </div>
                                    <div className="flex justify-between text-slate-600">
                                        <span>مجموع تعداد کل اقلام (عدد):</span>
                                        <span className="font-mono font-bold text-slate-800">{totalUnits.toLocaleString()} عدد</span>
                                    </div>
                                    <div className="flex justify-between text-slate-600">
                                        <span>جمع کل اقلام (Subtotal):</span>
                                        <span className="font-mono font-bold text-slate-800">{subtotal.toLocaleString()} {currency}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-200">
                                        <span>هزینه‌های جانبی و خدمات:</span>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                value={additionalCosts || ''}
                                                onChange={(e) => setAdditionalCosts(parseFloat(e.target.value) || 0)}
                                                placeholder="0"
                                                className="w-24 bg-white border border-slate-300 rounded-lg p-1 text-xs text-center font-mono font-bold"
                                            />
                                            <span className="font-bold">{currency}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-600">
                                        <span>تخفیف به مشتری:</span>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                value={discount || ''}
                                                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                                                placeholder="0"
                                                className="w-24 bg-white border border-slate-300 rounded-lg p-1 text-xs text-center font-mono font-bold text-rose-600"
                                            />
                                            <span className="font-bold">{currency}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-900 font-black border-t-2 border-slate-300 pt-2 text-sm sm:text-base">
                                        <span>مبلغ خالص و قابل پرداخت:</span>
                                        <span className="font-mono text-emerald-700">{totalAmount.toLocaleString()} {currency}</span>
                                    </div>
                                    {totalAmount > 0 && (
                                        <div className="text-[11px] text-slate-500 pt-1 leading-normal">
                                            مبلغ به حروف: <strong className="text-slate-800">{numberToPersianWords(totalAmount)} {currency === 'AED' ? 'درهم' : currency === 'USD' ? 'دلار' : currency === 'CNY' ? 'یوان' : 'تومان'}</strong>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer Controls */}
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-200">
                            <div className="text-xs text-slate-500">
                                ✓ با ثبت فاکتور فروش، سند حسابداری دوبل صادر و موجودی از کاردکس انبار کسر می‌گردد.
                            </div>
                            <div className="flex items-center gap-2.5 w-full sm:w-auto">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex-1 sm:flex-none"
                                >
                                    انصراف
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveInvoice}
                                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex-1 sm:flex-none"
                                >
                                    ثبت و صدور نهایی فاکتور فروش
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Settlement Modal */}
            {settlingInvoice && (
                <InvoiceSettlementModal
                    isOpen={!!settlingInvoice}
                    onClose={() => setSettlingInvoice(null)}
                    invoice={settlingInvoice}
                    invoiceType="sales"
                    subsidiaryAccounts={subsidiaryAccounts}
                    detailedAccounts={detailedAccounts}
                />
            )}

            {/* Counterparty Statement Modal */}
            {statementAccountCode && (
                <PartyStatementModal
                    isOpen={!!statementAccountCode}
                    onClose={() => {
                        setStatementAccountCode(null);
                        setStatementPartyName(undefined);
                    }}
                    accountCode={statementAccountCode}
                    partyName={statementPartyName}
                    partyType="customer"
                />
            )}
        </div>
    );
};
