import React, { useState, useRef, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { PurchaseInvoice, PurchaseInvoiceItem, Order, Product, Supplier, Currency, SubsidiaryLedgerAccount, DetailedLedgerAccount } from '../../types';
import { db } from '../../db';
import { downloadPurchaseInvoiceTemplate, parsePurchaseInvoiceExcel } from '../../utils/purchaseInvoiceExcel';
import {
    cascadeSyncPurchaseInvoiceVoucher,
    cascadeVoidPurchaseInvoice,
    syncAllPartiesDetailedAccounts,
    ensurePartyDetailedAccount
} from '../../utils/accountingEngine';
import { numberToPersianWords } from '../../utils/formatters';
import { InvoiceSettlementModal } from './InvoiceSettlementModal';
import { PartyStatementModal } from './PartyStatementModal';
import { ProductSearchCombobox } from '../common/ProductSearchCombobox';
import { PartySearchCombobox, PartyOption } from '../common/PartySearchCombobox';

interface PurchaseInvoicesTabProps {
    purchaseInvoices: PurchaseInvoice[];
    orders: Order[];
    products: Product[];
    suppliers: Supplier[];
    subsidiaryAccounts?: SubsidiaryLedgerAccount[];
    detailedAccounts?: DetailedLedgerAccount[];
    onOpenDocModal: (inv: PurchaseInvoice, type: 'invoice' | 'packing_list') => void;
}

export const PurchaseInvoicesTab: React.FC<PurchaseInvoicesTabProps> = ({
    purchaseInvoices,
    orders,
    products,
    suppliers,
    subsidiaryAccounts = [],
    detailedAccounts = [],
    onOpenDocModal
}) => {
    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [codeFilter, setCodeFilter] = useState<'all' | 'incomplete' | 'complete'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid' | 'partial' | 'voided'>('all');
    const [currencyFilter, setCurrencyFilter] = useState<string>('all');

    // Modals State
    const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string>('');
    const [convertInvoiceNumber, setConvertInvoiceNumber] = useState<string>('');

    // Settlement & Statement Modals State
    const [settlingInvoice, setSettlingInvoice] = useState<PurchaseInvoice | null>(null);
    const [statementAccountCode, setStatementAccountCode] = useState<string | null>(null);
    const [statementPartyName, setStatementPartyName] = useState<string | undefined>(undefined);
    const [isSyncingAccounts, setIsSyncingAccounts] = useState(false);

    // Invoice Form Modal (New / Edit / Excel Loaded)
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
    const [formInvoiceNumber, setFormInvoiceNumber] = useState('');
    const [formSupplierId, setFormSupplierId] = useState('');
    const [formSupplierName, setFormSupplierName] = useState('');
    const [formSupplierPhone, setFormSupplierPhone] = useState('');
    const [formSupplierAccountCode, setFormSupplierAccountCode] = useState('');
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
    const [formDueDate, setFormDueDate] = useState('');
    const [formCurrency, setFormCurrency] = useState<Currency>('AED');
    const [formAdditionalCosts, setFormAdditionalCosts] = useState<number>(0);
    const [formDiscount, setFormDiscount] = useState<number>(0);
    const [formNotes, setFormNotes] = useState('');
    const [formItems, setFormItems] = useState<PurchaseInvoiceItem[]>([
        {
            id: `pitem-${Date.now()}-0`,
            internalCode: '',
            partNumber: '',
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
            grossWeight: 5,
            hasMissingInternalCode: false
        }
    ]);
    const [excelImportBanner, setExcelImportBanner] = useState<{
        total: number;
        valid: number;
        missing: number;
    } | null>(null);

    // Complete Missing Codes Modal State
    const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
    const [completingInvoice, setCompletingInvoice] = useState<PurchaseInvoice | null>(null);
    const [codeResolutions, setCodeResolutions] = useState<Record<string, { internalCode: string; saveToProducts: boolean; productNameFa?: string }>>({});

    // Excel file input ref
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isParsingExcel, setIsParsingExcel] = useState(false);

    // Map for quick product lookup
    const productByCode = useMemo(() => {
        const map = new Map<string, Product>();
        products.forEach(p => {
            if (p.internalCode) map.set(p.internalCode.trim().toLowerCase(), p);
        });
        return map;
    }, [products]);

    // Unified supplier / counterparty options
    const supplierOptions: PartyOption[] = useMemo(() => {
        const list: PartyOption[] = [];
        const seen = new Set<string>();

        suppliers.forEach(s => {
            list.push({
                id: s.id,
                name: s.name,
                code: s.code,
                accountCode: s.detailedAccountCode,
                phone: s.phone,
                type: 'supplier'
            });
            seen.add(s.name.trim().toLowerCase());
        });

        detailedAccounts.forEach(d => {
            if (!seen.has(d.name.trim().toLowerCase())) {
                list.push({
                    id: d.id || d.code,
                    name: d.name,
                    code: d.code,
                    accountCode: d.code,
                    phone: d.phone,
                    type: 'supplier'
                });
                seen.add(d.name.trim().toLowerCase());
            }
        });

        return list;
    }, [suppliers, detailedAccounts]);

    // Open direct new invoice form
    const handleOpenNewInvoiceModal = () => {
        setEditingInvoiceId(null);
        setFormInvoiceNumber(`PUR-${Date.now().toString().slice(-6)}`);
        const firstSup = suppliers.length > 0 ? suppliers[0] : null;
        setFormSupplierId(firstSup ? firstSup.id : '');
        setFormSupplierName(firstSup ? firstSup.name : '');
        setFormSupplierPhone(firstSup?.phone || '');
        setFormSupplierAccountCode(firstSup?.detailedAccountCode || '');
        setFormDate(new Date().toISOString().split('T')[0]);
        setFormDueDate('');
        setFormCurrency('AED');
        setFormAdditionalCosts(0);
        setFormDiscount(0);
        setFormNotes('');
        setExcelImportBanner(null);
        setFormItems([
            {
                id: `pitem-${Date.now()}-0`,
                internalCode: '',
                partNumber: '',
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
                grossWeight: 5,
                hasMissingInternalCode: false
            }
        ]);
        setIsFormModalOpen(true);
    };

    // Handle Supplier Selection
    const handleSelectSupplier = (supId: string) => {
        setFormSupplierId(supId);
        const sup = suppliers.find(s => s.id === supId);
        if (sup) {
            setFormSupplierName(sup.name);
            setFormSupplierPhone(sup.phone || '');
            setFormSupplierAccountCode(sup.detailedAccountCode || '');
        }
    };

    // Handle Excel file selection & parse
    const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setIsParsingExcel(true);
            const parseResult = await parsePurchaseInvoiceExcel(file, products);

            setEditingInvoiceId(null);
            setFormInvoiceNumber(`PUR-${Date.now().toString().slice(-6)}`);
            setFormSupplierId(suppliers.length > 0 ? suppliers[0].id : '');
            setFormSupplierName(suppliers.length > 0 ? suppliers[0].name : 'تامین‌کننده پیش‌فرض');
            setFormSupplierPhone(suppliers.length > 0 ? suppliers[0].phone || '' : '');
            setFormSupplierAccountCode(suppliers.length > 0 ? suppliers[0].detailedAccountCode || '' : '');
            setFormDate(new Date().toISOString().split('T')[0]);
            setFormDueDate('');
            setFormCurrency('AED');
            setFormAdditionalCosts(0);
            setFormDiscount(0);
            setFormNotes(`بارگذاری‌شده از فایل اکسل: ${file.name}`);
            setFormItems(parseResult.items);
            setExcelImportBanner({
                total: parseResult.totalRows,
                valid: parseResult.validCount,
                missing: parseResult.missingCodeCount
            });

            setIsFormModalOpen(true);
        } catch (error: any) {
            console.error('Error parsing Excel:', error);
            alert(`❌ خطا در بازخوانی فایل اکسل: ${error.message || 'فایل نامعتبر است'}`);
        } finally {
            setIsParsingExcel(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Smart Decomposition: Splits a single row with cartons + loose remainder into 2 separate clean rows
    const handleDecomposeRow = (idx: number) => {
        setFormItems(prev => {
            const it = prev[idx];
            if (!it) return prev;

            const prod = it.productId ? products.find(p => p.id === it.productId) : null;
            const ipc = Math.max(1, Number(it.itemsPerCarton) || prod?.itemsPerCarton || 1);
            const totalQ = Math.max(0, Number(it.quantity) || 0);

            const fullCartons = Math.floor(totalQ / ipc);
            const remainder = totalQ % ipc;

            if (fullCartons > 0 && remainder > 0) {
                // Split into 2 rows: 1st row = full cartons, 2nd row = loose units
                const row1: PurchaseInvoiceItem = {
                    ...it,
                    id: `pitem-${Date.now()}-c`,
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

                const row2: PurchaseInvoiceItem = {
                    ...it,
                    id: `pitem-${Date.now()}-rem`,
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
        setFormItems(prev => {
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
                const row1: PurchaseInvoiceItem = {
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
                const row2: PurchaseInvoiceItem = {
                    ...it,
                    id: `pitem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
    const handleDecomposeAllRows = () => {
        setFormItems(prev => {
            const nextList: PurchaseInvoiceItem[] = [];
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
                            id: `pitem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

    // Select existing product from dropdown/autocomplete for a row
    const handleSelectExistingProduct = (idx: number, productId: string) => {
        const prod = products.find(p => p.id === productId);
        if (!prod) return;

        setFormItems(prev => {
            const arr = [...prev];
            const itemsPerCarton = prod.itemsPerCarton || 1;
            const isCarton = arr[idx].unitType !== 'piece';
            const cartonCount = isCarton ? (Number(arr[idx].cartonCount) || 1) : 1;
            const qty = isCarton ? (cartonCount * itemsPerCarton) : (Number(arr[idx].quantity) || 1);

            const itemCBM = parseFloat(((cartonCount || 1) * (prod.cartonCBM || 0.1)).toFixed(3));
            const itemGrossWeight = parseFloat(((cartonCount || 1) * (prod.grossWeight || 5)).toFixed(2));
            const unitPrice = arr[idx].unitPrice || prod.purchasePriceUSD || 0;
            const cartonPrice = Number((unitPrice * itemsPerCarton).toFixed(3));

            arr[idx] = {
                ...arr[idx],
                productId: prod.id,
                internalCode: prod.internalCode,
                partNumber: prod.supplierCode || arr[idx].partNumber || '',
                productName: prod.productNameFa || prod.description || arr[idx].productName,
                unitType: isCarton ? 'carton' : 'piece',
                itemsPerCarton: isCarton ? itemsPerCarton : 1,
                quantity: qty,
                cartonCount: isCarton ? cartonCount : 1,
                looseUnits: 0,
                unitPrice: unitPrice,
                cartonPrice: cartonPrice,
                totalPrice: Number((qty * unitPrice).toFixed(3)),
                cbm: itemCBM,
                grossWeight: itemGrossWeight,
                hasMissingInternalCode: false
            };
            return arr;
        });
    };

    // Handle Form Item Field Changes
    const handleFormItemChange = (idx: number, field: string, value: any) => {
        setFormItems(prev => {
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
                    currentItem.cartonCount = 1;
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

            // Calculate CBM & grossWeight
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
                    if (!currentItem.productName || currentItem.productName.startsWith('کالای')) {
                        currentItem.productName = matched.productNameFa || matched.description;
                    }
                    if (matched.supplierCode && !currentItem.partNumber) {
                        currentItem.partNumber = matched.supplierCode;
                    }
                    currentItem.itemsPerCarton = matched.itemsPerCarton || 1;
                    if (!currentItem.unitPrice && matched.purchasePriceUSD) {
                        currentItem.unitPrice = matched.purchasePriceUSD;
                        currentItem.cartonPrice = Number((matched.purchasePriceUSD * (matched.itemsPerCarton || 1)).toFixed(3));
                    }
                    if (currentItem.unitType === 'carton') {
                        currentItem.quantity = (Number(currentItem.cartonCount) || 1) * (matched.itemsPerCarton || 1);
                    }
                    const cCount = Number(currentItem.cartonCount) || 1;
                    currentItem.cbm = Number(((matched.cartonCBM || 0.1) * cCount).toFixed(3));
                    currentItem.grossWeight = Number(((matched.grossWeight || 5) * cCount).toFixed(2));
                    currentItem.hasMissingInternalCode = false;
                } else {
                    currentItem.hasMissingInternalCode = !code;
                }
            }

            arr[idx] = currentItem;
            return arr;
        });
    };

    // Add empty row
    const handleAddRow = () => {
        setFormItems(prev => [
            ...prev,
            {
                id: `pitem-${Date.now()}-${prev.length}`,
                internalCode: '',
                partNumber: '',
                productName: '',
                unitType: 'carton',
                itemsPerCarton: 1,
                quantity: 1,
                cartonCount: 1,
                looseUnits: 0,
                unitPrice: 0,
                cartonPrice: 0,
                totalPrice: 0,
                cbm: 0.1,
                grossWeight: 5,
                hasMissingInternalCode: false
            }
        ]);
    };

    // Remove row
    const handleRemoveRow = (idx: number) => {
        if (formItems.length <= 1) return;
        setFormItems(prev => prev.filter((_, i) => i !== idx));
    };

    // Calculate totals
    const subtotal = formItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
    const totalCartons = formItems.reduce((s, it) => s + (it.unitType === 'piece' ? 0 : (Number(it.cartonCount) || 0)), 0);
    const totalUnits = formItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const totalAdditionalCosts = Number(formAdditionalCosts) || 0;
    const totalDiscount = Number(formDiscount) || 0;
    const totalAmount = Math.max(0, subtotal + totalAdditionalCosts - totalDiscount);
    const hasAnyMissingCode = formItems.some(it => it.hasMissingInternalCode || !it.internalCode?.trim());

    // Save Purchase Invoice
    const handleSavePurchaseInvoice = async () => {
        if (!formSupplierName.trim()) {
            alert('لطفاً نام تامین‌کننده یا شخص طرف حساب را مشخص فرمایید.');
            return;
        }

        if (formItems.length === 0 || subtotal <= 0) {
            alert('فاکتور خرید باید حداقل شامل یک قلم کالا با تعداد و قیمت معتبر باشد.');
            return;
        }

        const invNumber = formInvoiceNumber.trim() || `PUR-${Date.now().toString().slice(-6)}`;
        const invoiceId = editingInvoiceId || `pur-${Date.now()}`;

        // Ensure party has detailed ledger account
        const partyAcc = await ensurePartyDetailedAccount(
            'supplier',
            formSupplierName.trim(),
            { partyId: formSupplierId, customCode: formSupplierAccountCode }
        );
        const accountCode = partyAcc.code;

        const cleanedItems: PurchaseInvoiceItem[] = formItems.map((it, idx) => {
            const hasMissing = !it.internalCode || !it.internalCode.trim() || it.hasMissingInternalCode === true;
            return {
                ...it,
                id: it.id || `pitem-${Date.now()}-${idx}`,
                productName: it.productName.trim() || `کالای ردیف ${idx + 1}`,
                unitType: it.unitType || 'carton',
                itemsPerCarton: Number(it.itemsPerCarton) || 1,
                cartonCount: Number(it.cartonCount) || 1,
                looseUnits: Number(it.looseUnits) || 0,
                quantity: Number(it.quantity) || 1,
                unitPrice: Number(it.unitPrice) || 0,
                cartonPrice: Number(it.cartonPrice) || 0,
                totalPrice: (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0),
                cbm: Number(it.cbm) || 0,
                grossWeight: Number(it.grossWeight) || 0,
                hasMissingInternalCode: hasMissing
            };
        });

        const invoiceData: PurchaseInvoice = {
            id: invoiceId,
            invoiceNumber: invNumber,
            supplierId: formSupplierId || undefined,
            supplierName: formSupplierName.trim(),
            supplierAccountCode: accountCode,
            date: formDate,
            dueDate: formDueDate || undefined,
            items: cleanedItems,
            subtotal,
            additionalCosts: Number(formAdditionalCosts) || 0,
            totalAmount,
            currency: formCurrency,
            currencyRate: 1,
            status: 'posted',
            hasIncompleteCodes: hasAnyMissingCode,
            notes: formNotes,
            createdAt: new Date().toISOString()
        };

        if (editingInvoiceId) {
            await db.purchaseInvoices.put(invoiceData);
        } else {
            await db.purchaseInvoices.add(invoiceData);
        }

        // Auto-post double-entry journal voucher for purchase
        await cascadeSyncPurchaseInvoiceVoucher(invoiceData);

        setIsFormModalOpen(false);
        setEditingInvoiceId(null);
        alert(`✅ فاکتور خرید شماره ${invNumber} با موفقیت در سیستم ثبت و سند حسابداری دوبل صادر شد.`);
    };

    // Edit Invoice
    const handleEditInvoice = (inv: PurchaseInvoice) => {
        if (inv.isLocked) {
            alert(`🔒 این فاکتور خرید قفل شده است و به دلیل تسویه نهایی یا بسته‌شدن اسناد مالی، قابل ویرایش نمی‌باشد.`);
            return;
        }
        setEditingInvoiceId(inv.id);
        setFormInvoiceNumber(inv.invoiceNumber);
        setFormSupplierId(inv.supplierId || '');
        setFormSupplierName(inv.supplierName);
        setFormSupplierPhone('');
        setFormSupplierAccountCode(inv.supplierAccountCode || '');
        setFormDate(inv.date || new Date().toISOString().split('T')[0]);
        setFormDueDate(inv.dueDate || '');
        setFormCurrency(inv.currency || 'AED');
        setFormAdditionalCosts(inv.additionalCosts || 0);
        setFormDiscount(0);
        setFormNotes(inv.notes || '');
        setFormItems(inv.items.map(it => ({ ...it })));
        setIsFormModalOpen(true);
    };

    // Void Invoice (Cascade Void)
    const handleVoidInvoice = async (inv: PurchaseInvoice) => {
        const reason = prompt(`لطفاً دلیل ابطال فاکتور خرید شماره ${inv.invoiceNumber} را وارد نمایید:`, 'ابطال توافقی فاکتور');
        if (reason === null) return;
        await cascadeVoidPurchaseInvoice(inv.id, reason);
        alert(`✅ فاکتور خرید ${inv.invoiceNumber} و سند دوبل متناظر با آن با موفقیت ابطال شد.`);
    };

    // Delete Invoice
    const handleDeleteInvoice = async (inv: PurchaseInvoice) => {
        if (!confirm(`آیا از حذف کامل فاکتور خرید شماره ${inv.invoiceNumber} و اسناد مالی مرتبط با آن اطمینان دارید؟`)) {
            return;
        }

        await db.purchaseInvoices.delete(inv.id);
        const linkedVouchers = await db.journalVouchers.where('sourceId').equals(inv.id).toArray();
        for (const v of linkedVouchers) {
            await db.journalVouchers.delete(v.id);
        }
        alert('فاکتور خرید و اسناد مرتبط حذف گردید.');
    };

    // Sync All Counterparty Detailed Accounts
    const handleSyncParties = async () => {
        setIsSyncingAccounts(true);
        try {
            const res = await syncAllPartiesDetailedAccounts();
            alert(`✅ همگام‌سازی کامل طرف‌های حساب انجام شد:\n\n• تامین‌کنندگان متصل: ${res.suppliersSynced}\n• مشتریان متصل: ${res.customersSynced}\n• حساب‌های تفصیلی جدید: ${res.newAccountsCreated}`);
        } catch (err: any) {
            alert(`خطا در همگام‌سازی: ${err.message || err}`);
        } finally {
            setIsSyncingAccounts(false);
        }
    };

    // Complete codes modal handler
    const handleOpenCompleteModal = (inv: PurchaseInvoice) => {
        setCompletingInvoice(inv);
        const initialResolutions: Record<string, { internalCode: string; saveToProducts: boolean; productNameFa?: string }> = {};
        inv.items.forEach(it => {
            if (it.hasMissingInternalCode || !it.internalCode) {
                initialResolutions[it.id] = {
                    internalCode: it.internalCode || '',
                    saveToProducts: true,
                    productNameFa: it.productName
                };
            }
        });
        setCodeResolutions(initialResolutions);
        setIsCompleteModalOpen(true);
    };

    // Save Completed Codes
    const handleSaveCompletedCodes = async () => {
        if (!completingInvoice) return;

        const updatedItems = completingInvoice.items.map(it => {
            const res = codeResolutions[it.id];
            if (res && res.internalCode && res.internalCode.trim()) {
                return {
                    ...it,
                    internalCode: res.internalCode.trim(),
                    productName: res.productNameFa || it.productName,
                    hasMissingInternalCode: false
                };
            }
            return it;
        });

        const hasRemainingMissing = updatedItems.some(it => it.hasMissingInternalCode || !it.internalCode?.trim());
        const updatedInvoice: PurchaseInvoice = {
            ...completingInvoice,
            items: updatedItems,
            hasIncompleteCodes: hasRemainingMissing
        };

        await db.purchaseInvoices.put(updatedInvoice);
        setIsCompleteModalOpen(false);
        setCompletingInvoice(null);
        alert('✅ کدهای داخلی اقلام با موفقیت به‌روزرسانی و در سیستم ذخیره گردید.');
    };

    // Export All Purchase Invoices to Excel
    const handleExportPurchaseInvoicesExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Newland Trading Group';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Purchase_Invoices', {
            views: [{ rightToLeft: true }]
        });

        sheet.mergeCells('A1:H1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'فهرست جامع فاکتورهای خرید کالا - شرکت بازرگانی بین‌المللی نیولند';
        titleCell.font = { name: 'Tahoma', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 32;

        const headers = ['شماره فاکتور', 'تاریخ', 'تامین‌کننده', 'کد تفصیلی', 'تعداد اقلام', 'ارز', 'مبلغ کل', 'وضعیت تسویه'];
        const headerRow = sheet.addRow(headers);
        headerRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 24;

        filteredInvoices.forEach(inv => {
            const statusFa = inv.status === 'paid' ? 'تسویه کامل' : inv.status === 'partial' ? 'تسویه ناقص' : inv.status === 'voided' ? 'ابطال شده' : 'پرداخت‌نشده';
            const r = sheet.addRow([
                inv.invoiceNumber,
                inv.date,
                inv.supplierName,
                inv.supplierAccountCode || '-',
                inv.items.length,
                inv.currency,
                inv.totalAmount,
                statusFa
            ]);
            r.font = { name: 'Tahoma', size: 9 };
            r.alignment = { horizontal: 'center', vertical: 'middle' };
            r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
        });

        // Totals
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
        a.download = `NewLand_Purchase_Invoices_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Filtered Invoices
    const filteredInvoices = purchaseInvoices.filter(inv => {
        const matchesSearch =
            inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.supplierAccountCode && inv.supplierAccountCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
            inv.items.some(it => it.productName.toLowerCase().includes(searchTerm.toLowerCase()) || (it.internalCode && it.internalCode.toLowerCase().includes(searchTerm.toLowerCase())));

        if (!matchesSearch) return false;

        const hasIncomplete = inv.hasIncompleteCodes || inv.items.some(it => it.hasMissingInternalCode || !it.internalCode);
        if (codeFilter === 'incomplete' && !hasIncomplete) return false;
        if (codeFilter === 'complete' && hasIncomplete) return false;

        if (currencyFilter !== 'all' && inv.currency !== currencyFilter) return false;

        if (statusFilter === 'unpaid' && (inv.status === 'paid' || inv.status === 'voided')) return false;
        if (statusFilter === 'paid' && inv.status !== 'paid') return false;
        if (statusFilter === 'partial' && inv.status !== 'partial') return false;
        if (statusFilter === 'voided' && inv.status !== 'voided') return false;

        return true;
    });

    // KPI Calculations
    const totalPurchasesAED = purchaseInvoices.filter(i => i.status !== 'voided' && i.currency === 'AED').reduce((s, i) => s + (i.totalAmount || 0), 0);
    const totalPurchasesUSD = purchaseInvoices.filter(i => i.status !== 'voided' && i.currency === 'USD').reduce((s, i) => s + (i.totalAmount || 0), 0);
    const totalPurchasesCNY = purchaseInvoices.filter(i => i.status !== 'voided' && i.currency === 'CNY').reduce((s, i) => s + (i.totalAmount || 0), 0);
    const totalPurchasesTOMAN = purchaseInvoices.filter(i => i.status !== 'voided' && i.currency === 'TOMAN').reduce((s, i) => s + (i.totalAmount || 0), 0);
    const unpaidPurchasesCount = purchaseInvoices.filter(i => i.status !== 'paid' && i.status !== 'voided').length;
    const totalCartonsSum = purchaseInvoices.filter(i => i.status !== 'voided').reduce((s, inv) => s + (inv.items?.reduce((isum, it) => isum + (Number(it.cartonCount) || 0), 0) || 0), 0);

    return (
        <div className="space-y-5">
            {/* Top KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-slate-500 text-xs font-medium mb-1.5">
                        کل فاکتورهای خرید
                    </div>
                    <div className="text-xl font-bold text-slate-800 font-mono">
                        {purchaseInvoices.length} <span className="text-xs font-normal text-slate-500 font-sans">فاکتور</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                        {unpaidPurchasesCount} فاکتور در انتظار تسویه
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-slate-500 text-xs font-medium mb-1.5">
                        مجموع خرید (درهم AED)
                    </div>
                    <div className="text-xl font-bold text-emerald-700 font-mono">
                        {totalPurchasesAED.toLocaleString()} <span className="text-xs font-bold font-sans">AED</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                        دلار: {totalPurchasesUSD.toLocaleString()} $ | یوان: {totalPurchasesCNY.toLocaleString()} ¥
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-slate-500 text-xs font-medium mb-1.5">
                        مجموع کارتن‌های ورودی
                    </div>
                    <div className="text-xl font-bold text-indigo-700 font-mono">
                        {totalCartonsSum.toLocaleString()} <span className="text-xs font-normal font-sans">کارتن</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                        تحویل‌شده به انبارهای بازرگانی
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <div className="text-slate-500 text-xs font-medium mb-1.5">
                        خرید ریالی / تومانی
                    </div>
                    <div className="text-xl font-bold text-slate-800 font-mono">
                        {totalPurchasesTOMAN.toLocaleString()} <span className="text-xs font-normal font-sans">تومان</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                        خریدها و هزینه‌های داخلی
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-800">
                        فاکتورهای خرید کالا (Purchase Invoices)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        مدیریت فاکتورهای رسمی خرید، اتصال به حساب‌های تفصیلی و ورود به کاردکس انبار
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {/* Hidden Excel Input */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleExcelFileChange}
                        accept=".xlsx, .xls"
                        className="hidden"
                    />

                    {/* Sync Accounts */}
                    <button
                        onClick={handleSyncParties}
                        disabled={isSyncingAccounts}
                        className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg border border-slate-200 transition flex items-center gap-1.5 disabled:opacity-50"
                        title="همگام‌سازی حساب‌های تفصیلی تامین‌کنندگان"
                    >
                        <span>حساب‌های تفصیلی</span>
                    </button>

                    {/* Download Template */}
                    <button
                        onClick={downloadPurchaseInvoiceTemplate}
                        className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg border border-slate-200 transition flex items-center gap-1.5"
                        title="دانلود فایل نمونه اکسل جهت بارگذاری سریع فاکتور"
                    >
                        <span>قالب اکسل</span>
                    </button>

                    {/* Upload Excel */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isParsingExcel}
                        className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg border border-slate-200 transition flex items-center gap-1.5"
                        title="ورود خودکار اقلام فاکتور از فایل اکسل"
                    >
                        <span>{isParsingExcel ? 'در حال خواندن...' : 'ورود از اکسل'}</span>
                    </button>

                    {/* Export Invoices */}
                    <button
                        onClick={handleExportPurchaseInvoicesExcel}
                        className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg border border-slate-200 transition flex items-center gap-1.5"
                    >
                        <span>خروجی اکسل</span>
                    </button>

                    {/* New Purchase Invoice Button */}
                    <button
                        onClick={handleOpenNewInvoiceModal}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg shadow-xs transition flex items-center gap-1.5"
                    >
                        <span className="text-base leading-none">+</span>
                        <span>فاکتور خرید جدید</span>
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
                            <option value="all">همه وضعیت‌ها ({purchaseInvoices.length})</option>
                            <option value="unpaid">تسویه نشده (بدهکار)</option>
                            <option value="partial">تسویه ناقص</option>
                            <option value="paid">تسویه کامل (پرداخت‌شده)</option>
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

                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-semibold">وضعیت کدها:</span>
                        <select
                            value={codeFilter}
                            onChange={(e) => setCodeFilter(e.target.value as any)}
                            className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-semibold"
                        >
                            <option value="all">همه فاکتورها</option>
                            <option value="incomplete">⚠️ دارای کدهای موقت</option>
                            <option value="complete">✓ کدهای کامل انبار</option>
                        </select>
                    </div>
                </div>

                <div className="w-full md:w-72">
                    <input
                        type="text"
                        placeholder="جستجو در شماره فاکتور، تامین‌کننده، شرح کالا..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
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
                                <th className="p-3 min-w-[180px]">تامین‌کننده / فروشنده</th>
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
                                        هیچ فاکتور خریدی یافت نشد. با کلیک بر روی دکمه «صدور فاکتور خرید جدید» فاکتور ثبت کنید.
                                    </td>
                                </tr>
                            ) : (
                                filteredInvoices.map((inv, idx) => {
                                    const isVoided = inv.status === 'voided';
                                    const isPaid = inv.status === 'paid';
                                    const isPartial = inv.status === 'partial';
                                    const paid = inv.paidAmount || 0;
                                    const hasIncomplete = inv.hasIncompleteCodes || inv.items.some(it => it.hasMissingInternalCode || !it.internalCode);
                                    const totalCtns = inv.items?.reduce((s, it) => s + (Number(it.cartonCount) || 0), 0) || 0;
                                    const totalUnitsCount = inv.items?.reduce((s, it) => s + (Number(it.quantity) || 0), 0) || 0;

                                    return (
                                        <tr key={inv.id} className={`hover:bg-slate-50/80 transition ${isVoided ? 'bg-rose-50/40 opacity-70' : ''}`}>
                                            <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                                            <td className="p-3 font-mono font-bold text-blue-700">
                                                {inv.invoiceNumber}
                                                {isVoided && <span className="block text-[10px] text-rose-600 font-bold">🚫 ابطال شده</span>}
                                            </td>
                                            <td className="p-3 font-semibold text-slate-800">
                                                <div className="flex items-center gap-1.5">
                                                    <span>{inv.supplierName}</span>
                                                    <button
                                                        onClick={() => {
                                                            setStatementAccountCode(inv.supplierAccountCode || '3101001');
                                                            setStatementPartyName(inv.supplierName);
                                                        }}
                                                        className="text-[10px] text-blue-600 hover:text-blue-800 font-normal underline mr-1"
                                                        title="مشاهده صورتحساب تفصیلی این تامین‌کننده"
                                                    >
                                                        (صورتحساب)
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                    {inv.supplierAccountCode || '۳۱۰۱۰xx'}
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
                                                    <div className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-0.5">
                                                        تسویه ناقص ({paid.toLocaleString()})
                                                    </div>
                                                ) : (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                        ⏳ تسویه نشده
                                                    </span>
                                                )}
                                                {hasIncomplete && !isVoided && (
                                                    <button
                                                        onClick={() => handleOpenCompleteModal(inv)}
                                                        className="block mt-1 text-[10px] text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded px-1.5 py-0.5 mx-auto font-bold"
                                                    >
                                                        ⚠️ تکمیل کدها
                                                    </button>
                                                )}
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex flex-wrap justify-center items-center gap-1.5">
                                                    {!isVoided && !isPaid && (
                                                        <button
                                                            onClick={() => setSettlingInvoice(inv)}
                                                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1"
                                                            title="ثبت سند پرداخت و تسویه بدهی به تامین‌کننده"
                                                        >
                                                            💳 پرداخت
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
                                                            title="ویرایش فاکتور خرید"
                                                        >
                                                            ✏️
                                                        </button>
                                                    )}
                                                    {!isVoided && (
                                                        <button
                                                            onClick={() => handleVoidInvoice(inv)}
                                                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200 transition"
                                                            title="ابطال فاکتور خرید"
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

            {/* Standard Purchase Invoice Creation / Editing Modal */}
            {isFormModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-6xl w-full p-5 sm:p-7 space-y-5 max-h-[94vh] flex flex-col my-auto">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center pb-4 border-b border-slate-200">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base sm:text-lg flex items-center gap-2">
                                    <span className="w-3 h-3 bg-blue-600 rounded-full ring-4 ring-blue-100" />
                                    {editingInvoiceId ? 'ویرایش فاکتور خرید کالا' : 'صدور فاکتور خرید کالا و خدمات'}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    ثبت اقلام خریداری‌شده، تعیین بسته‌بندی کارتن و صدور خودکار سند دوبل مالی
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200 transition flex items-center gap-1"
                                >
                                    📊 بارگذاری از اکسل
                                </button>
                                <button
                                    onClick={() => setIsFormModalOpen(false)}
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Excel Import Alert Banner */}
                        {excelImportBanner && (
                            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div className="text-blue-900">
                                    📊 <strong>فایل اکسل با موفقیت بازخوانی شد:</strong> مجموع {excelImportBanner.total} قلم استخراج شد ({excelImportBanner.valid} قلم منطبق با کاتالوگ انبار).
                                </div>
                                <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-3 py-1 rounded-lg">
                                    لطفاً طرف حساب و مبالغ را بررسی و تایید فرمایید.
                                </span>
                            </div>
                        )}

                        <div className="overflow-y-auto flex-1 space-y-5 pr-1">
                            {/* Metadata Section - 2 Balance Cards */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Card 1: Counterparty Details */}
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                                    <div className="text-xs font-semibold text-slate-800 border-b border-slate-200 pb-2">
                                        <span>مشخصات طرف حساب و تامین‌کننده</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div className="sm:col-span-2">
                                            <PartySearchCombobox
                                                parties={supplierOptions}
                                                value={formSupplierName}
                                                onSelectParty={(party) => {
                                                    setFormSupplierId(String(party.id));
                                                    setFormSupplierName(party.name);
                                                    if (party.accountCode) setFormSupplierAccountCode(party.accountCode);
                                                    if (party.phone) setFormSupplierPhone(party.phone);
                                                }}
                                                onChangeText={(text) => {
                                                    setFormSupplierName(text);
                                                }}
                                                placeholder="جستجو یا انتخاب تامین‌کننده با نام، کد یا تلفن..."
                                                label="نام طرف حساب / تامین‌کننده:"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-slate-600 font-semibold mb-1">کد حساب تفصیلی:</label>
                                            <input
                                                type="text"
                                                value={formSupplierAccountCode}
                                                onChange={(e) => setFormSupplierAccountCode(e.target.value)}
                                                placeholder="۳۱۰۱۰۰۱"
                                                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 text-xs font-mono font-medium focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-slate-600 font-semibold mb-1">شماره تماس:</label>
                                            <input
                                                type="text"
                                                value={formSupplierPhone}
                                                onChange={(e) => setFormSupplierPhone(e.target.value)}
                                                placeholder="0912..."
                                                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 text-xs font-mono focus:ring-2 focus:ring-indigo-500"
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
                                            <label className="block text-slate-600 font-semibold mb-1">شماره فاکتور خرید:</label>
                                            <input
                                                type="text"
                                                value={formInvoiceNumber}
                                                onChange={(e) => setFormInvoiceNumber(e.target.value)}
                                                placeholder="PUR-1001"
                                                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 text-xs font-mono font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-slate-600 font-semibold mb-1">واحد پولی فاکتور:</label>
                                            <select
                                                value={formCurrency}
                                                onChange={(e) => setFormCurrency(e.target.value as Currency)}
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
                                                value={formDate}
                                                onChange={(e) => setFormDate(e.target.value)}
                                                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 text-xs font-mono focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-slate-600 font-semibold mb-1">تاریخ سررسید تسویه:</label>
                                            <input
                                                type="date"
                                                value={formDueDate}
                                                onChange={(e) => setFormDueDate(e.target.value)}
                                                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-800 text-xs font-mono focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Standard Items Table Section */}
                            <div className="space-y-2.5">
                                <div className="flex flex-wrap justify-between items-center gap-2">
                                    <div className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                                        <span>اقلام فاکتور خرید ({formItems.length} ردیف کالا)</span>
                                        {hasAnyMissingCode && (
                                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[11px]">
                                                دارای اقلام فاقد کد کاتالوگ
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleDecomposeAllRows}
                                            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition"
                                            title="تفکیک سطرهای دارای باقیمانده به کارتن‌های سالم و سطرهای جدید خرد"
                                        >
                                            <span>تفکیک خودکار اقلام خرد</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAddRow}
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
                                                <th className="p-2.5 w-28 text-center">فی واحد ({formCurrency})</th>
                                                <th className="p-2.5 w-32 text-center">مبلغ کل ({formCurrency})</th>
                                                <th className="p-2.5 w-14 text-center">حذف</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {formItems.map((it, idx) => {
                                                const isMissing = it.hasMissingInternalCode || !it.internalCode?.trim();
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
                                                                    hasError={isMissing}
                                                                    onSelectProduct={(p) => handleSelectExistingProduct(idx, p.id)}
                                                                    onChangeText={(text) => handleFormItemChange(idx, 'internalCode', text)}
                                                                />
                                                            </td>

                                                            {/* Description Search & Combobox */}
                                                            <td className="p-2 min-w-[220px]">
                                                                <ProductSearchCombobox
                                                                    products={products}
                                                                    mode="name"
                                                                    value={it.productName || ''}
                                                                    placeholder="نام یا شرح کالا..."
                                                                    onSelectProduct={(p) => handleSelectExistingProduct(idx, p.id)}
                                                                    onChangeText={(text) => handleFormItemChange(idx, 'productName', text)}
                                                                />
                                                            </td>

                                                            {/* Prominent Numeric Input: Total Quantity (PCS) with Auto-Decompose on Blur */}
                                                            <td className="p-2 text-center bg-slate-50/50 border-x border-slate-200">
                                                                <div className="space-y-1">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        value={it.quantity !== undefined ? it.quantity : 0}
                                                                        onChange={(e) => handleFormItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
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
                                                                    onChange={(e) => handleFormItemChange(idx, 'itemsPerCarton', parseFloat(e.target.value) || 1)}
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
                                                                    onChange={(e) => handleFormItemChange(idx, 'cartonCount', parseFloat(e.target.value) || 0)}
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
                                                                    onChange={(e) => handleFormItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
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
                                                                        onClick={() => handleRemoveRow(idx)}
                                                                        disabled={formItems.length <= 1}
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
                                                                                {it.cartonCount || 0} کارتن × {ipc} تایی = {it.quantity || 0} عدد × {(it.unitPrice || 0).toLocaleString()} {formCurrency} = {((it.quantity || 0) * (it.unitPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })} {formCurrency}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="bg-white text-slate-700 border border-slate-200 px-2 py-0.5 rounded font-medium">
                                                                                {it.quantity || 0} عدد (خرد) × {(it.unitPrice || 0).toLocaleString()} {formCurrency} = {((it.quantity || 0) * (it.unitPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })} {formCurrency}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {/* Quick Decomposition Trigger Button */}
                                                                    {hasRemainder && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDecomposeRow(idx)}
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
                                    <label className="block text-slate-700 font-bold text-xs">توضیحات، شرایط پرداخت و تحویل فاکتور:</label>
                                    <textarea
                                        value={formNotes}
                                        onChange={(e) => setFormNotes(e.target.value)}
                                        rows={4}
                                        placeholder="توضیحات و شرایط فاکتور، شماره بارنامه، هماهنگی‌های پرداخت بانکی..."
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
                                        <span className="font-mono font-bold text-slate-800">{subtotal.toLocaleString()} {formCurrency}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-200">
                                        <span>هزینه‌های جانبی و حمل:</span>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                value={formAdditionalCosts || ''}
                                                onChange={(e) => setFormAdditionalCosts(parseFloat(e.target.value) || 0)}
                                                placeholder="0"
                                                className="w-24 bg-white border border-slate-300 rounded-lg p-1 text-xs text-center font-mono font-bold"
                                            />
                                            <span className="font-bold">{formCurrency}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-600">
                                        <span>تخفیف کلی فاکتور:</span>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                value={formDiscount || ''}
                                                onChange={(e) => setFormDiscount(parseFloat(e.target.value) || 0)}
                                                placeholder="0"
                                                className="w-24 bg-white border border-slate-300 rounded-lg p-1 text-xs text-center font-mono font-bold text-rose-600"
                                            />
                                            <span className="font-bold">{formCurrency}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-900 font-black border-t-2 border-slate-300 pt-2 text-sm sm:text-base">
                                        <span>مبلغ خالص و قابل پرداخت:</span>
                                        <span className="font-mono text-emerald-700">{totalAmount.toLocaleString()} {formCurrency}</span>
                                    </div>
                                    {totalAmount > 0 && (
                                        <div className="text-[11px] text-slate-500 pt-1 leading-normal">
                                            مبلغ به حروف: <strong className="text-slate-800">{numberToPersianWords(totalAmount)} {formCurrency === 'AED' ? 'درهم' : formCurrency === 'USD' ? 'دلار' : formCurrency === 'CNY' ? 'یوان' : 'تومان'}</strong>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer Controls */}
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-200">
                            <div className="text-xs text-slate-500">
                                ✓ با ثبت فاکتور خرید، سند دوبل مالی صادر و موجودی کالا به کاردکس انبار اضافه می‌گردد.
                            </div>
                            <div className="flex items-center gap-2.5 w-full sm:w-auto">
                                <button
                                    type="button"
                                    onClick={() => setIsFormModalOpen(false)}
                                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex-1 sm:flex-none"
                                >
                                    انصراف
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSavePurchaseInvoice}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex-1 sm:flex-none"
                                >
                                    ثبت و صدور نهایی فاکتور خرید
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Complete Missing Internal Codes Modal */}
            {isCompleteModalOpen && completingInvoice && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col my-auto">
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                            <div>
                                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
                                    تکمیل کدهای کاتالوگ انبار (فاکتور {completingInvoice.invoiceNumber})
                                </h3>
                            </div>
                            <button onClick={() => setIsCompleteModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>

                        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                            {completingInvoice.items
                                .filter(it => it.hasMissingInternalCode || !it.internalCode)
                                .map((it, idx) => (
                                    <div key={it.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                                        <div className="flex justify-between items-start font-bold text-slate-800">
                                            <span>#{idx + 1} {it.productName}</span>
                                            <span className="font-mono text-blue-700">{it.quantity} عدد</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-slate-600 font-semibold mb-1">انتخاب از انبار کالاها:</label>
                                                <select
                                                    value={codeResolutions[it.id]?.internalCode || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setCodeResolutions(prev => ({
                                                            ...prev,
                                                            [it.id]: {
                                                                ...prev[it.id],
                                                                internalCode: val
                                                            }
                                                        }));
                                                    }}
                                                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs font-mono font-bold"
                                                >
                                                    <option value="">-- انتخاب از کاتالوگ انبار --</option>
                                                    {products.map(p => (
                                                        <option key={p.id} value={p.internalCode}>
                                                            {p.internalCode} - {p.productNameFa || p.description}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-slate-600 font-semibold mb-1">یا تایپ کد داخلی مستقیم:</label>
                                                <input
                                                    type="text"
                                                    value={codeResolutions[it.id]?.internalCode || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setCodeResolutions(prev => ({
                                                            ...prev,
                                                            [it.id]: {
                                                                ...prev[it.id],
                                                                internalCode: val
                                                            }
                                                        }));
                                                    }}
                                                    placeholder="مثال: NL-101"
                                                    className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs font-mono font-bold"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                            <button
                                onClick={() => setIsCompleteModalOpen(false)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleSaveCompletedCodes}
                                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold"
                            >
                                ذخیره کدهای تکمیلی
                            </button>
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
                    invoiceType="purchase"
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
                    partyType="supplier"
                />
            )}
        </div>
    );
};
