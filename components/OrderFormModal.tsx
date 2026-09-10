
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
// FIX: Moved GeneratedSection import to `types` to resolve module export error.
import { Order, OrderItem, Payment, OrderItemAttribute, NewOrderData, AISettings, MainGroup, Category, SubCategory, Brand, CostingSettings, ChecklistTask, AnalysisIssue, Attachment, GeneratedSection, Currency } from '../types';
import CustomDateInput from './CustomDateInput';
import NumericInput from './NumericInput';
import { parseAttributesFromText, analyzeOrderForIssues, generateChecklistFromDescription, parseAttributesFromImage, getHSCodeForProduct } from '../utils/ai';
import { useModals } from '../contexts/ModalContext';
import Select from './Select';
import { persianArabicToEnglish } from '../utils/formatters';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useSettings } from '../hooks/useSettings';
import LoadingOverlay from './LoadingOverlay';

// --- TYPE DEFINITIONS ---

interface OrderFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (orderData: NewOrderData, orderId?: string, finalize?: boolean) => void;
    orderToEdit?: Order | null;
    aiSettings?: AISettings;
    isFinalStatus?: boolean;
}

// Internal state type for an item, allowing for a temporary string-based ID for new items
type ModalOrderItem = Omit<OrderItem, 'id' | 'attributes'> & {
    id: string; // Can be real ID or a temporary `new-` ID
    attributes?: (Omit<OrderItemAttribute, 'id'> & { id?: string })[];
};

// Internal state type for the order data being edited in the form
type ModalOrderData = Omit<NewOrderData, 'items' | 'payments'> & {
    items: ModalOrderItem[];
    payments: Payment[];
};

// --- INITIAL STATE ---

const initialItemState = (): ModalOrderItem => ({
    id: `new-${crypto.randomUUID()}`,
    internalCode: '',
    supplierCode: '',
    productName: '',
    productNameFa: '',
    quantity: 0,
    itemsPerCarton: 0,
    price: 0,
    cartonCBM: 0,
    hsCode: '',
    netWeight: 0,
    grossWeight: 0,
    attributes: [],
    attachments: [],
    checklist: [],
    templateIds: [],
    customsValue: 0,
    customsValueBasis: 'unit',
});

const getInitialOrderState = (): ModalOrderData => ({
    supplier: '',
    internalCode: '',
    orderDate: '',
    approxLoadingDate: '',
    originPort: '',
    destinationPort: '',
    items: [initialItemState()],
    payments: [],
    purchaseType: 'cash',
    creditPaymentDueDate: '',
    currency: 'USD',
});

// --- SUB-COMPONENTS ---

const handleFormKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
            return;
        }
        
        e.preventDefault();
        const form = target.closest('form');
        if (!form) return;
        
        const focusable = Array.from(
            form.querySelectorAll('input:not([type="hidden"]), select, textarea, button:not([tabindex="-1"])')
        ).filter(el => {
            const htmlEl = el as HTMLElement;
            return !htmlEl.hasAttribute('disabled') && !htmlEl.hasAttribute('readonly') && htmlEl.offsetParent !== null;
        }) as HTMLElement[];
        
        const index = focusable.indexOf(target);
        
        if (index > -1 && index < focusable.length - 1) {
            focusable[index + 1].focus();
        } else if (index === focusable.length - 1) {
            const submitButton = focusable.find(el => el.tagName === 'BUTTON' && (el as HTMLButtonElement).type === 'submit');
            if (submitButton) {
                submitButton.focus();
            }
        }
    }
};


const AttributesModal: React.FC<{
    attributes: (Omit<OrderItemAttribute, 'id'> & { id?: string })[];
    onSave: (newAttributes: OrderItemAttribute[]) => void;
    onClose: () => void;
    productName: string;
    aiSettings?: AISettings;
}> = ({ attributes, onSave, onClose, productName, aiSettings }) => {
    const { t } = useTranslation();
    const { addToast } = useModals();
    const [localAttributes, setLocalAttributes] = useState(attributes);
    const [bulkText, setBulkText] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const handleAttrChange = (index: number, field: 'key' | 'value', value: string) => {
        const newAttrs = [...localAttributes];
        newAttrs[index] = { ...newAttrs[index], [field]: value };
        setLocalAttributes(newAttrs);
    };

    const addAttribute = () => {
        setLocalAttributes([...localAttributes, { key: '', value: '' }]);
    };
    
    const removeAttribute = (index: number) => {
        setLocalAttributes(localAttributes.filter((_, i) => i !== index));
    };
    
    const handleParseBulk = async () => {
        if (!bulkText.trim() || isParsing) return;
        if (!aiSettings?.apiKey) {
            addToast(t('toasts.ai.apiKeyNotConfigured'), "error");
            return;
        }
        setIsParsing(true);
        addToast(t('orderFormModal.analyzing'), 'info');
        try {
            const model = aiSettings?.attributeParsingModel || 'gemini-3.5-flash';
            const parsed = await parseAttributesFromText(bulkText, model, aiSettings.apiKey);
            const newAttrs = parsed.map(p => ({ key: p.key, value: p.value }));
            setLocalAttributes(prev => [...prev, ...newAttrs]);
            setBulkText('');
            addToast(t('orderFormModal.importSuccess'), 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : t('orderFormModal.importError');
            addToast(message, 'error');
        } finally {
            setIsParsing(false);
        }
    };

    const handleImageParse = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || isParsing) return;
        if (!aiSettings?.apiKey) {
            addToast(t('toasts.ai.apiKeyNotConfigured'), "error");
            return;
        }
        if (file.size > 4 * 1024 * 1024) { // Gemini has a 4MB limit for inline data
            addToast(`Image "${file.name}" is too large (max 4MB).`, 'error');
            return;
        }

        setIsParsing(true);
        addToast(t('orderFormModal.analyzing'), 'info');
        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onloadend = async () => {
                const base64data = (reader.result as string).split(',')[1];
                try {
                    const model = aiSettings?.attributeParsingModel || 'gemini-3.5-flash';
                    const parsed = await parseAttributesFromImage({ mimeType: file.type, data: base64data }, model, aiSettings.apiKey);
                    const newAttrs = parsed.map(p => ({ key: p.key, value: p.value }));
                    setLocalAttributes(prev => [...prev.filter(a => a.key || a.value), ...newAttrs]);
                    addToast(t('orderFormModal.importSuccess'), 'success');
                } catch (aiError) {
                    const message = aiError instanceof Error ? aiError.message : t('orderFormModal.importError');
                    addToast(message, 'error');
                } finally {
                    setIsParsing(false);
                }
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : t('orderFormModal.importError');
            addToast(message, 'error');
            setIsParsing(false);
        } finally {
            if (event.target) event.target.value = '';
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-gray-800">{t('orderFormModal.attributesModalTitle', { productName })}</h2>
                </header>
                <main className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Manual attribute entry */}
                    <div className="space-y-2">
                        {localAttributes.map((attr, index) => (
                            <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                                <input type="text" placeholder={t('orderFormModal.attributeKey') as string} value={attr.key} onChange={e => handleAttrChange(index, 'key', e.target.value)} onKeyDown={handleFormKeyDown} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" />
                                <input type="text" placeholder={t('orderFormModal.attributeValue') as string} value={attr.value} onChange={e => handleAttrChange(index, 'value', e.target.value)} onKeyDown={handleFormKeyDown} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" />
                                <button type="button" onClick={() => removeAttribute(index)} className="text-red-500 hover:text-red-700 p-1">&times;</button>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={addAttribute} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">{t('orderFormModal.addAttribute')}</button>
                    
                    {/* Bulk add with AI */}
                    <div className="pt-4 border-t border-slate-200">
                        <label htmlFor="bulk-attributes" className="block text-sm font-medium text-slate-700 mb-1">{t('orderFormModal.bulkAddPrompt')}</label>
                        <textarea id="bulk-attributes" value={bulkText} onChange={e => setBulkText(e.target.value)} rows={4} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" />
                        <div className="mt-2 flex items-center gap-x-2">
                            <button type="button" onClick={handleParseBulk} disabled={isParsing || !aiSettings?.apiKey} className="bg-purple-700 text-white px-3 py-1.5 rounded-md hover:bg-purple-800 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-x-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 3zM6.03 5.23a.75.75 0 01.04 1.06l-1.72 1.72a.75.75 0 01-1.06-1.06l-1.72-1.72a.75.75 0 011.02 0zm8 0a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06zM10 18a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5H10a.75.75 0 01-.75-.75zM4.75 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm9.25-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zM6.03 14.77a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06z" clipRule="evenodd" /></svg>
                                {isParsing ? t('orderFormModal.analyzing') : t('orderFormModal.parseWithAI')}
                            </button>
                            <input type="file" ref={imageInputRef} onChange={handleImageParse} accept="image/*" className="hidden" />
                            <button type="button" onClick={() => imageInputRef.current?.click()} disabled={isParsing || !aiSettings?.apiKey} className="bg-green-700 text-white px-3 py-1.5 rounded-md hover:bg-green-800 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-x-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M1 3a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V3zm2 2v10h14V5H3zm11 2a1 1 0 10-2 0v2H9a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
                                Analyze Image
                            </button>
                        </div>
                    </div>
                </main>
                <footer className="p-4 border-t border-slate-200 flex justify-end gap-x-3">
                    <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                    <button type="button" onClick={() => onSave(localAttributes.filter(a => a.key.trim() && a.value.trim()).map(a => ({...a, id: a.id || crypto.randomUUID()})))} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('buttons.save')}</button>
                </footer>
            </div>
        </div>
    );
};


export const OrderFormModal: React.FC<OrderFormModalProps> = ({ isOpen, onClose, onSubmit, orderToEdit, aiSettings, isFinalStatus }) => {
    const { t, i18n } = useTranslation();
    
    // This is the core fix. The state initializer function now runs on every mount.
    // Because the component's `key` changes in App.tsx, this guarantees a fresh state.
    const [data, setData] = useState<ModalOrderData>(() => {
        if (orderToEdit) {
            const modalData: ModalOrderData = {
                ...orderToEdit,
                items: orderToEdit.items.map(item => ({ ...item })),
                purchaseType: orderToEdit.purchaseType || 'cash',
                creditPaymentDueDate: orderToEdit.creditPaymentDueDate || '',
                payments: orderToEdit.payments || [],
            };
            return modalData;
        }
        return getInitialOrderState();
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [attributesModalState, setAttributesModalState] = useState<{ isOpen: boolean, itemIndex: number | null }>({ isOpen: false, itemIndex: null });
    const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(() => 
        new Set(orderToEdit ? orderToEdit.items.map(i => i.id) : [getInitialOrderState().items[0].id])
    );
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isGeneratingChecklist, setIsGeneratingChecklist] = useState<string | null>(null);
    const { showConfirmation, addToast } = useModals();
    const [analysisIssues, setAnalysisIssues] = useState<AnalysisIssue[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadTargetIndex, setUploadTargetIndex] = useState<number | null>(null);
    const [isFetchingHsCode, setIsFetchingHsCode] = useState<string | null>(null);


    const mainGroups = useLiveQuery(() => db.mainGroups.toArray(), []) || [];
    const categories = useLiveQuery(() => db.categories.toArray(), []) || [];
    const subCategories = useLiveQuery(() => db.subCategories.toArray(), []) || [];
    const brands = useLiveQuery(() => db.brands.toArray(), []) || [];
    const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) || []; // Fetch legacy suppliers
    const subsidiaryAccounts = useLiveQuery(() => db.subsidiaryLedgerAccounts.toArray(), []) || [];
    const detailedAccounts = useLiveQuery(() => db.detailedLedgerAccounts.toArray(), []) || [];
    const masterProducts = useLiveQuery(() => db.products.toArray(), []) || [];

    // Combine supplier accounts from Accounting Chart of Accounts
    const supplierSuggestions = useMemo(() => {
        const list: { code: string; name: string }[] = [];
        
        // Detailed accounts under 3101 or 31..
        detailedAccounts.forEach(acc => {
            if (acc.code.startsWith('31') || acc.subsidiaryLedgerAccountId === '3101') {
                list.push({ code: acc.code, name: acc.name_fa || acc.name });
            }
        });
        
        // Subsidiary accounts under 31
        subsidiaryAccounts.forEach(acc => {
            if (acc.code.startsWith('31')) {
                list.push({ code: acc.code, name: acc.name_fa || acc.name });
            }
        });

        // Legacy suppliers table
        suppliers.forEach(s => {
            if (!list.some(item => item.name === s.name || item.code === s.code)) {
                list.push({ code: s.code || '', name: s.name });
            }
        });

        return list;
    }, [detailedAccounts, subsidiaryAccounts, suppliers]);
    
    const { settings: dbSettings } = useSettings();
    const costingSettings = useMemo(() => {
        const cs = dbSettings.find(s => s.key === 'perShipmentCostingSettings');
        return cs?.value as CostingSettings | undefined;
    }, [dbSettings]);
    
    // This useEffect is now removed as the logic is handled by the useState initializer.
    // This prevents stale state from being set after the initial render.
    /*
    useEffect(() => {
        if (isOpen) {
            // ... OLD LOGIC ...
        }
    }, [isOpen, orderToEdit]);
    */
    
    const getSubmitData = (): NewOrderData => {
        const submitData: NewOrderData = {
            supplier: data.supplier,
            internalCode: data.internalCode,
            orderDate: data.orderDate,
            approxLoadingDate: data.approxLoadingDate,
            originPort: data.originPort,
            destinationPort: data.destinationPort,
            currency: data.currency,
            purchaseType: data.purchaseType,
            creditPaymentDueDate: data.creditPaymentDueDate,
            payments: data.payments.map(p => ({ ...p })),
            shipCosts: data.shipCosts?.map(c => ({...c})),
            dubaiCosts: data.dubaiCosts?.map(c => ({...c})),
            iranCosts: data.iranCosts?.map(c => ({...c})),
            attachments: data.attachments?.map(a => ({...a})),
            items: data.items.map(itemInState => {
                const item: (Omit<OrderItem, 'id'> & { id?: string }) = {
                    internalCode: itemInState.internalCode,
                    supplierCode: itemInState.supplierCode,
                    productName: itemInState.productName,
                    productNameFa: itemInState.productNameFa,
                    quantity: itemInState.quantity,
                    itemsPerCarton: itemInState.itemsPerCarton,
                    price: itemInState.price,
                    cartonCBM: itemInState.cartonCBM,
                    hsCode: itemInState.hsCode,
                    netWeight: itemInState.netWeight,
                    grossWeight: itemInState.grossWeight,
                    attributes: itemInState.attributes?.map(attr => ({
                        id: attr.id || crypto.randomUUID(),
                        key: attr.key,
                        value: attr.value,
                    })),
                    checklist: itemInState.checklist?.map(c => ({...c})),
                    templateIds: itemInState.templateIds ? [...itemInState.templateIds] : [],
                    attachments: itemInState.attachments?.map(a => ({...a})),
                    customsValue: itemInState.customsValue,
                    customsValueBasis: itemInState.customsValueBasis,
                    mainGroupId: itemInState.mainGroupId,
                    categoryId: itemInState.categoryId,
                    subCategoryId: itemInState.subCategoryId,
                    brandId: itemInState.brandId
                };
                if (itemInState.id && !itemInState.id.startsWith('new-')) {
                    item.id = itemInState.id;
                }
                return item;
            })
        };
        return submitData;
    };

    const clearFieldIssue = (fieldPath: string) => {
        setAnalysisIssues(prev => prev.filter(issue => issue.field !== fieldPath));
        setErrors(prev => {
            const newErrors = {...prev};
            delete newErrors[fieldPath];
            return newErrors;
        });
    };
    
    const handleOrderChange = <K extends keyof ModalOrderData>(field: K, value: ModalOrderData[K]) => {
        clearFieldIssue(field as string);
        setData(prev => ({ ...prev, [field]: value }));
    };
    
    const handleSupplierCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const code = e.target.value;
        handleOrderChange('internalCode', code);

        // Auto-fill Supplier Name if code matches existing supplier
        if (code) {
             const match = suppliers.find(s => s.code.toLowerCase() === code.toLowerCase());
             if (match) {
                 handleOrderChange('supplier', match.name);
             }
        }
    };

    const handleItemChange = (index: number, field: keyof ModalOrderItem, value: any) => {
        clearFieldIssue(`items.${index}.${field}`);
        const newItems = [...data.items];
        const sanitizedValue = typeof value === 'string' ? persianArabicToEnglish(value) : value;
        (newItems[index] as any)[field] = sanitizedValue;

        // Auto-fill product specs from Master Product Repository when internalCode or supplierCode is entered
        if ((field === 'internalCode' || field === 'supplierCode') && typeof sanitizedValue === 'string' && sanitizedValue.trim()) {
            const query = sanitizedValue.trim().toLowerCase();
            const matchedProduct = masterProducts.find(p => 
                (p.internalCode && p.internalCode.toLowerCase() === query) ||
                (p.supplierCode && p.supplierCode.toLowerCase() === query)
            );

            if (matchedProduct) {
                newItems[index] = {
                    ...newItems[index],
                    internalCode: matchedProduct.internalCode || newItems[index].internalCode,
                    supplierCode: matchedProduct.supplierCode || newItems[index].supplierCode,
                    productName: matchedProduct.description || matchedProduct.productNameFa || newItems[index].productName,
                    productNameFa: matchedProduct.productNameFa || newItems[index].productNameFa,
                    itemsPerCarton: matchedProduct.itemsPerCarton || newItems[index].itemsPerCarton,
                    cartonCBM: matchedProduct.cartonCBM || newItems[index].cartonCBM,
                    netWeight: matchedProduct.netWeight || newItems[index].netWeight,
                    grossWeight: matchedProduct.grossWeight || newItems[index].grossWeight,
                    hsCode: matchedProduct.hsCode || newItems[index].hsCode,
                    price: matchedProduct.purchasePriceUSD || newItems[index].price,
                    mainGroupId: matchedProduct.mainGroupId || newItems[index].mainGroupId,
                    categoryId: matchedProduct.categoryId || newItems[index].categoryId,
                    subCategoryId: matchedProduct.subCategoryId || newItems[index].subCategoryId,
                    brandId: matchedProduct.brandId || newItems[index].brandId,
                    customsValue: matchedProduct.customsValue !== undefined ? matchedProduct.customsValue : newItems[index].customsValue,
                    customsValueBasis: matchedProduct.customsValueBasis || newItems[index].customsValueBasis,
                };
            }
        }

        setData(prev => ({ ...prev, items: newItems }));
    };

    const applyMasterProductToItem = (index: number, productId: string) => {
        const product = masterProducts.find(p => p.id === productId);
        if (!product) return;

        const newItems = [...data.items];
        newItems[index] = {
            ...newItems[index],
            internalCode: product.internalCode || newItems[index].internalCode,
            supplierCode: product.supplierCode || newItems[index].supplierCode,
            productName: product.description || product.productNameFa || newItems[index].productName,
            productNameFa: product.productNameFa || newItems[index].productNameFa,
            itemsPerCarton: product.itemsPerCarton || newItems[index].itemsPerCarton,
            cartonCBM: product.cartonCBM || newItems[index].cartonCBM,
            netWeight: product.netWeight || newItems[index].netWeight,
            grossWeight: product.grossWeight || newItems[index].grossWeight,
            hsCode: product.hsCode || newItems[index].hsCode,
            price: product.purchasePriceUSD || newItems[index].price,
            mainGroupId: product.mainGroupId || newItems[index].mainGroupId,
            categoryId: product.categoryId || newItems[index].categoryId,
            subCategoryId: product.subCategoryId || newItems[index].subCategoryId,
            brandId: product.brandId || newItems[index].brandId,
            customsValue: product.customsValue !== undefined ? product.customsValue : newItems[index].customsValue,
            customsValueBasis: product.customsValueBasis || newItems[index].customsValueBasis,
        };
        setData(prev => ({ ...prev, items: newItems }));
        addToast(`مشخصات کامل کالا (${product.internalCode}) اعمال شد.`, 'success');
    };
    
     const handleItemCategoryChange = (index: number, level: 'mainGroupId' | 'categoryId' | 'subCategoryId' | 'brandId', value: string) => {
        clearFieldIssue(`items.${index}.${level}`);
        const newItems = [...data.items];
        const currentItem = { ...newItems[index] };

        (currentItem as any)[level] = value || undefined; // Use undefined for empty selection

        // Reset children when a parent changes
        if (level === 'mainGroupId') {
            currentItem.categoryId = undefined;
            currentItem.subCategoryId = undefined;
            currentItem.brandId = undefined;
        } else if (level === 'categoryId') {
            currentItem.subCategoryId = undefined;
            currentItem.brandId = undefined;
        } else if (level === 'subCategoryId') {
            currentItem.brandId = undefined;
        }
        
        newItems[index] = currentItem;
        setData(prev => ({ ...prev, items: newItems }));
    };

    // FIX: Corrected the creation of the down payment object to satisfy the full `Payment` type.
    // Assumes the down payment is entered in USD, as this modal doesn't handle currency conversion.
    const handleDownPaymentChange = (field: 'amount' | 'date', value: number | string) => {
        setData(prev => {
            const newPayments = prev.payments.filter(p => p.type !== 'down_payment');
            const dp = prev.payments.find(p => p.type === 'down_payment');
            
            let amount = dp?.amount || 0;
            let date = dp?.date || '';
            
            if (field === 'amount') amount = value as number;
            if (field === 'date') date = value as string;
    
            if (amount > 0) {
                newPayments.push({ 
                    id: dp?.id || crypto.randomUUID(), 
                    type: 'down_payment', 
                    amount: amount,
                    currency: 'USD',
                    amountUSD: amount, // Assuming down payment is in USD
                    date: date,
                    description: 'Down Payment'
                });
            }
            
            return { ...prev, payments: newPayments };
        });
    };

    const addItem = () => {
        setAnalysisIssues([]);
        const newItem = initialItemState();
        setData(prev => ({ ...prev, items: [...prev.items, newItem] }));
        // Automatically expand the new item
        setExpandedItemIds(prev => new Set(prev).add(newItem.id));
    };
    
    const removeItem = (index: number) => {
        setAnalysisIssues([]);
        if (data.items.length > 1) {
            const itemToRemove = data.items[index];
            setExpandedItemIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(itemToRemove.id);
                return newSet;
            });
            setData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
        }
    };
    
    const openAttributesModal = (itemIndex: number) => {
        setAttributesModalState({ isOpen: true, itemIndex });
    };

    const saveAttributes = (newAttributes: OrderItemAttribute[]) => {
        if (attributesModalState.itemIndex !== null) {
            handleItemChange(attributesModalState.itemIndex, 'attributes', newAttributes);
        }
        setAttributesModalState({ isOpen: false, itemIndex: null });
    };

    const toggleItemExpansion = (itemId: string) => {
        setExpandedItemIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) {
                newSet.delete(itemId);
            } else {
                newSet.add(itemId);
            }
            return newSet;
        });
    };

    const handleGenerateChecklist = async (index: number) => {
        const item = data.items[index];
        if (!item.productName.trim()) {
            addToast(t('toasts.ai.noProductName'), 'error');
            return;
        }
        if (!aiSettings?.apiKey) {
            addToast(t('toasts.ai.apiKeyNotConfigured'), "error");
            return;
        }
        setIsGeneratingChecklist(item.id);
        try {
            const model = aiSettings?.checklistGenerationModel || 'gemini-3.5-flash';
            const generatedSections = await generateChecklistFromDescription(item.productName, model, aiSettings.apiKey);
            
            const newChecklist: ChecklistTask[] = generatedSections.flatMap((section, secIndex) => {
                const sectionId = secIndex + 1;
                return section.tasks.map(task => ({
                    section_id: sectionId,
                    section_en: section.section_en,
                    section_fa: section.section_fa,
                    task_id: `ai-${crypto.randomUUID()}`, // Unique ID for each AI-generated task
                    task_en: task.task_en,
                    task_fa: task.task_fa,
                    task_weight: task.task_weight,
                    is_done: false,
                }));
            });

            handleItemChange(index, 'checklist', newChecklist);
            addToast(t('toasts.ai.checklistGenerated', { productName: item.productName }), 'success');

        } catch (error) {
            const message = error instanceof Error ? error.message : t('toasts.ai.generateError');
            addToast(message, 'error');
        } finally {
            setIsGeneratingChecklist(null);
        }
    };

    const handleAttachmentUploadClick = (index: number) => {
        setUploadTargetIndex(index);
        fileInputRef.current?.click();
    };

    const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || uploadTargetIndex === null) return;

        const reader = new FileReader();
        reader.onload = () => {
            const newAttachment: Attachment = {
                id: crypto.randomUUID(),
                name: file.name,
                type: file.type,
                size: file.size,
                data: reader.result as ArrayBuffer,
                createdAt: new Date().toISOString(),
            };
            const currentAttachments = data.items[uploadTargetIndex].attachments || [];
            handleItemChange(uploadTargetIndex, 'attachments', [...currentAttachments, newAttachment]);
        };
        reader.readAsArrayBuffer(file);
    };

    const handleRemoveAttachment = (itemIndex: number, attachmentId: string) => {
        const currentAttachments = data.items[itemIndex].attachments || [];
        const updatedAttachments = currentAttachments.filter(a => a.id !== attachmentId);
        handleItemChange(itemIndex, 'attachments', updatedAttachments);
    };
    
    const handleFetchHsCode = async (index: number) => {
        const item = data.items[index];
        if (!aiSettings?.apiKey) {
            addToast(t('toasts.ai.apiKeyNotConfigured'), 'error');
            return;
        }

        setIsFetchingHsCode(item.id);
        addToast(t('toasts.ai.fetchingHsCodes'), 'info');
        try {
            const model = aiSettings.poAnalysisModel || 'gemini-3.5-flash';
            const hsCode = await getHSCodeForProduct(
                item.productName,
                (item.attributes || []) as OrderItemAttribute[],
                aiSettings.apiKey,
                model
            );
            if (hsCode) {
                handleItemChange(index, 'hsCode', hsCode);
                addToast(`HS Code ${hsCode} found for ${item.productName}`, 'success');
            } else {
                addToast(`Could not find HS Code for ${item.productName}`, 'error');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to fetch HS Code.";
            addToast(message, 'error');
        } finally {
            setIsFetchingHsCode(null);
        }
    };


    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};
        if (!data.supplier.trim()) newErrors.supplier = t('validation.supplierRequired');
        if (!data.orderDate) newErrors.orderDate = t('validation.orderDateRequired');
        if (!data.approxLoadingDate) newErrors.approxLoadingDate = t('validation.loadingDateRequired');
        if (data.orderDate && data.approxLoadingDate && new Date(data.approxLoadingDate) < new Date(data.orderDate)) {
            newErrors.approxLoadingDate = t('orderFormModal.dateValidationError');
        }
        data.items.forEach((item, index) => {
            if (!item.productName.trim()) newErrors[`item_${index}_productName`] = t('validation.productNameRequired');
            if (item.quantity <= 0) newErrors[`item_${index}_quantity`] = t('validation.quantityPositive');
            if (item.price < 0) newErrors[`item_${index}_price`] = t('validation.priceNonNegative');
            
            if (item.quantity > 0 && item.itemsPerCarton <= 0) {
                 newErrors[`item_${index}_itemsPerCarton`] = t('validation.itemsPerCartonZero');
            }
            if ((item.netWeight || 0) > 0 && (item.grossWeight || 0) > 0 && item.netWeight! > item.grossWeight!) {
                 newErrors[`item_${index}_grossWeight`] = t('validation.netWeightExceedsGross', { name: item.productName });
            }
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleAnalyzeWithAI = async () => {
        if (!costingSettings) {
            addToast(t('toasts.costingSettingsNeeded'), "error");
            return;
        }
        if (!aiSettings?.apiKey) {
            addToast(t('toasts.ai.apiKeyNotConfigured'), "error");
            return;
        }
        setIsAnalyzing(true);
        try {
            const { items, ...restOfData } = data;
            const orderForAnalysis: Order = {
                ...restOfData,
                id: orderToEdit?.id || '',
                status: orderToEdit?.status || '',
                isArchived: orderToEdit?.isArchived || false,
                volumeCBM: 0,
                isFinalized: false,
                finalizedAt: undefined,
                deletedAt: null,
                items: items.map((item): OrderItem => {
                    const { id, attributes, ...restOfItem } = item;
                    return {
                        id,
                        ...restOfItem,
                        attributes: (attributes || []).map(attr => ({
                            id: attr.id || crypto.randomUUID(),
                            key: attr.key || '',
                            value: attr.value || '',
                        })),
                    };
                }),
            };
            const model = aiSettings?.poAnalysisModel || 'gemini-3.5-flash';
            const { summary, issues } = await analyzeOrderForIssues(orderForAnalysis, costingSettings, model, aiSettings.apiKey);
            
            setAnalysisIssues(issues);

            const summaryToShow = summary === 'OK' 
                ? t('toasts.aiAnalysisOk')
                : summary;

            showConfirmation({
                title: t('orderFormModal.aiAnalysisReportTitle'),
                message: summaryToShow,
                confirmText: "Done",
                onConfirm: () => {}, 
                variant: 'primary',
                cancelText: undefined,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "An unknown error occurred during AI analysis.";
            addToast(message, 'error');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            onSubmit(getSubmitData(), orderToEdit?.id, false);
        }
    };

    const handleSaveAndFinalize = () => {
        if (validate() && orderToEdit) {
            onSubmit(getSubmitData(), orderToEdit.id, true);
        }
    };
    
    if (!isOpen) return null;

    const currentItemForAttributes = attributesModalState.itemIndex !== null ? data.items[attributesModalState.itemIndex] : null;
    const downPayment = useMemo(() => data.payments.find(p => p.type === 'down_payment'), [data.payments]);
    const getIssueMessage = (fieldPath: string) => analysisIssues.find(i => i.field === fieldPath)?.message;


    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
                <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <input type="file" ref={fileInputRef} onChange={handleFileSelected} className="hidden" />
                    <header className="p-4 border-b border-slate-200">
                        <h2 className="text-lg font-bold text-gray-800">{orderToEdit?.id ? t('orderFormModal.editOrder') : t('buttons.newOrder')}</h2>
                    </header>
                    <main className="flex-1 overflow-y-auto p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                             <div className="lg:col-span-2" title={getIssueMessage('supplier')}>
                                <label className="block text-xs font-medium text-slate-700 mb-1">{t('labels.supplier')}<span className="text-red-500">*</span></label>
                                <input 
                                    type="text" 
                                    list="accounting-suppliers-list"
                                    value={data.supplier} 
                                    onChange={e => handleOrderChange('supplier', e.target.value)} 
                                    onKeyDown={handleFormKeyDown} 
                                    onFocus={() => clearFieldIssue('supplier')} 
                                    placeholder="کد یا نام تامین‌کننده حسابداری..."
                                    required 
                                    className={`w-full bg-white text-gray-900 border rounded-md p-2 text-sm ${errors.supplier || getIssueMessage('supplier') ? 'border-red-500' : 'border-slate-300'}`}
                                />
                                <datalist id="accounting-suppliers-list">
                                    {supplierSuggestions.map((s, idx) => (
                                        <option key={idx} value={s.code ? `${s.code} - ${s.name}` : s.name}>
                                            {s.code ? `[کد: ${s.code}] ${s.name}` : s.name}
                                        </option>
                                    ))}
                                </datalist>
                                <p className="text-red-500 text-xs mt-1">{errors.supplier || getIssueMessage('supplier')}</p>
                             </div>
                            
                            {/* Order PO / Internal Code Input */}
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">{t('labels.internalCode')}</label>
                                <input 
                                    type="text" 
                                    value={data.internalCode || ''} 
                                    onChange={handleSupplierCodeChange} 
                                    onKeyDown={handleFormKeyDown} 
                                    onFocus={() => clearFieldIssue('internalCode')} 
                                    className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm"
                                    placeholder="e.g. PO-2026-001"
                                />
                            </div>

                            <div><CustomDateInput label={t('labels.orderDate')} name="orderDate" value={data.orderDate} onChange={(n, v) => handleOrderChange(n as any, v)} onFocus={() => clearFieldIssue('orderDate')} required error={errors.orderDate || getIssueMessage('orderDate')} /></div>
                            <div><CustomDateInput label={t('labels.loadingDate')} name="approxLoadingDate" value={data.approxLoadingDate} onChange={(n, v) => handleOrderChange(n as any, v)} onFocus={() => clearFieldIssue('approxLoadingDate')} required error={errors.approxLoadingDate || getIssueMessage('approxLoadingDate')}/></div>
                             <div className="lg:col-span-2 grid grid-cols-2 gap-3">
                                <div><label className="block text-xs font-medium text-slate-700 mb-1">{t('labels.originPort')}</label><input type="text" value={data.originPort || ''} onChange={e => handleOrderChange('originPort', e.target.value)} onKeyDown={handleFormKeyDown} onFocus={() => clearFieldIssue('originPort')} className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm"/></div>
                                <div><label className="block text-xs font-medium text-slate-700 mb-1">{t('labels.destinationPort')}</label><input type="text" value={data.destinationPort || ''} onChange={e => handleOrderChange('destinationPort', e.target.value)} onKeyDown={handleFormKeyDown} onFocus={() => clearFieldIssue('destinationPort')} className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm"/></div>
                            </div>
                            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
                                <div><label className="block text-xs font-medium text-slate-700 mb-1">Currency</label><Select value={data.currency} onChange={e => handleOrderChange('currency', e.target.value as any)} onKeyDown={handleFormKeyDown as any}><option>USD</option><option>CNY</option><option>AED</option><option>TOMAN</option></Select></div>
                                <div><label className="block text-xs font-medium text-slate-700 mb-1">{t('labels.purchaseType')}</label><Select value={data.purchaseType} onChange={e => handleOrderChange('purchaseType', e.target.value as any)} onKeyDown={handleFormKeyDown as any} onFocus={() => clearFieldIssue('purchaseType')}><option value="cash">{t('labels.cash')}</option><option value="credit">{t('labels.credit')}</option></Select></div>
                            </div>
                            {data.purchaseType === 'credit' && <div className="lg:col-span-2"><CustomDateInput label={t('labels.paymentDueDate')} name="creditPaymentDueDate" value={data.creditPaymentDueDate || ''} onChange={(n, v) => handleOrderChange(n as any, v)} onFocus={() => clearFieldIssue('creditPaymentDueDate')} /></div>}
                        </div>
                         <div className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-3">
                             <div className="md:col-span-2">
                                <NumericInput
                                    label={`${t('labels.downPayment')} (USD)`}
                                    value={downPayment?.amount || 0}
                                    onChange={v => handleDownPaymentChange('amount', v)}
                                    onKeyDown={handleFormKeyDown}
                                />
                             </div>
                             <div className="md:col-span-2">
                                 <CustomDateInput
                                    label={t('labels.downPaymentDate')}
                                    name="downPaymentDate"
                                    value={downPayment?.date || ''}
                                    onChange={(_, v) => handleDownPaymentChange('date', v)}
                                />
                             </div>
                        </div>
                         <div className="overflow-x-auto border border-slate-200 rounded-lg">
                             <table className="min-w-full text-sm divide-y divide-slate-200">
                                <thead className="bg-slate-300 text-slate-900">
                                    <tr className="text-xs uppercase tracking-wider">
                                        <th className="p-3 w-10"></th>
                                        <th className="p-3 text-left font-bold">{t('orderModal.table.productName')}</th>
                                        <th className="p-3 text-center w-24 font-bold">{t('orderModal.table.quantity')}</th>
                                        <th className="p-3 text-center w-28 font-bold">{t('orderFormModal.table.price')} ({data.currency})</th>
                                        <th className="p-3 text-center w-28 font-bold">{t('orderFormModal.table.totalPrice')} ({data.currency})</th>
                                        <th className="p-3 text-center w-24 font-bold">{t('orderModal.table.itemsPerCarton')}</th>
                                        <th className="p-3 text-center w-24 font-bold">{t('orderModal.table.cartonCbm')}</th>
                                        <th className="p-3 text-center w-28 font-bold">{t('orderFormModal.table.customsValue')}</th>
                                        <th className="p-3 text-center w-32 font-bold">{t('orderFormModal.table.customsBasis')}</th>
                                        <th className="p-3 w-28 font-bold text-center">{t('common.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {data.items.map((item, index) => {
                                        const isExpanded = expandedItemIds.has(item.id);
                                        const itemErrors = Object.keys(errors)
                                            .filter(key => key.startsWith(`item_${index}_`))
                                            .reduce((acc, key) => {
                                                acc[key.replace(`item_${index}_`, '')] = errors[key];
                                                return acc;
                                            }, {} as Record<string, string>);
                                        
                                        const filteredCategories = item.mainGroupId ? categories.filter(c => c.mainGroupId === item.mainGroupId) : [];
                                        const filteredSubCategories = item.categoryId ? subCategories.filter(sc => sc.categoryId === item.categoryId) : [];
                                        const filteredBrands = item.subCategoryId ? brands.filter(b => b.subCategoryId === item.subCategoryId) : [];

                                        return (
                                            <React.Fragment key={item.id}>
                                                {/* Main row */}
                                                <tr className={isExpanded ? 'bg-indigo-50' : ''}>
                                                    <td className="p-2 align-middle text-center">
                                                        <button type="button" onClick={() => toggleItemExpansion(item.id)} className="p-1 text-slate-400 hover:text-slate-700">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                                                        </button>
                                                    </td>
                                                    <td className="p-2 align-top">
                                                        <input type="text" value={item.productName} onChange={e => handleItemChange(index, 'productName', e.target.value)} onKeyDown={handleFormKeyDown} onFocus={() => clearFieldIssue(`item_${index}_productName`)} className={`w-full bg-white text-gray-900 border rounded p-1.5 text-sm ${itemErrors.productName || getIssueMessage(`items.${index}.productName`) ? 'border-red-500' : 'border-slate-300'}`} />
                                                        {itemErrors.productName && <p className="text-red-500 text-xs mt-1">{itemErrors.productName}</p>}
                                                    </td>
                                                    <td className="p-2 align-top"><NumericInput value={item.quantity} onChange={v => handleItemChange(index, 'quantity', v)} onKeyDown={handleFormKeyDown} onFocus={() => clearFieldIssue(`item_${index}_quantity`)} error={itemErrors.quantity || getIssueMessage(`items.${index}.quantity`)} /></td>
                                                    <td className="p-2 align-top"><NumericInput value={item.price} onChange={v => handleItemChange(index, 'price', v)} onKeyDown={handleFormKeyDown} onFocus={() => clearFieldIssue(`item_${index}_price`)} error={itemErrors.price || getIssueMessage(`items.${index}.price`)} fractionDigits={3} /></td>
                                                    <td className="p-2 align-middle font-mono text-center text-gray-900 font-bold">{(item.quantity * item.price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                                    <td className="p-2 align-top"><NumericInput value={item.itemsPerCarton} onChange={v => handleItemChange(index, 'itemsPerCarton', v)} onKeyDown={handleFormKeyDown} onFocus={() => clearFieldIssue(`item_${index}_itemsPerCarton`)} error={itemErrors.itemsPerCarton || getIssueMessage(`items.${index}.itemsPerCarton`)} /></td>
                                                    <td className="p-2 align-top"><NumericInput value={item.cartonCBM} onChange={v => handleItemChange(index, 'cartonCBM', v)} onKeyDown={handleFormKeyDown} onFocus={() => clearFieldIssue(`item_${index}_cartonCBM`)} error={itemErrors.cartonCBM || getIssueMessage(`items.${index}.cartonCBM`)} fractionDigits={3} /></td>
                                                    <td className="p-2 align-top"><NumericInput value={item.customsValue || 0} onChange={v => handleItemChange(index, 'customsValue', v)} onKeyDown={handleFormKeyDown} onFocus={() => clearFieldIssue(`items.${index}.customsValue`)} error={itemErrors.customsValue || getIssueMessage(`items.${index}.customsValue`)} /></td>
                                                    <td className="p-2 align-top"><Select wrapperClassName="min-w-32" value={item.customsValueBasis || 'unit'} onChange={e => handleItemChange(index, 'customsValueBasis', e.target.value)} onKeyDown={handleFormKeyDown as any} onFocus={() => clearFieldIssue(`items.${index}.customsValueBasis`)}><option value="unit">{t('orderFormModal.customsBasisOptions.unit')}</option><option value="kg">{t('orderFormModal.customsBasisOptions.kg')}</option></Select></td>
                                                    <td className="p-2 align-middle text-center">
                                                        <button type="button" onClick={() => removeItem(index)} disabled={data.items.length <= 1} className="text-red-500 hover:text-red-700 disabled:text-slate-300 p-1 rounded-full hover:bg-red-100 disabled:hover:bg-transparent">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan={10} className="p-3 bg-slate-50">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                                                {/* Quick Master Product Selector Banner */}
                                                                <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-indigo-50/80 p-2.5 rounded-lg border border-indigo-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                                                            </svg>
                                                                            فراخوانی کالا از مخزن کدهای یکتای نیولند:
                                                                        </span>
                                                                        {item.internalCode && masterProducts.some(p => p.internalCode?.toLowerCase() === item.internalCode?.toLowerCase()) && (
                                                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                                                                                ✓ متصل به مخزن کالا
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="w-full sm:w-72">
                                                                        <Select 
                                                                            wrapperClassName="w-full"
                                                                            value={masterProducts.find(p => (p.internalCode && p.internalCode.toLowerCase() === item.internalCode?.toLowerCase()) || (p.supplierCode && p.supplierCode.toLowerCase() === item.supplierCode?.toLowerCase()))?.id || ''}
                                                                            onChange={(e) => applyMasterProductToItem(index, e.target.value)}
                                                                        >
                                                                            <option value="">-- انتخاب از مخزن کالاها --</option>
                                                                            {masterProducts.map(p => (
                                                                                <option key={p.id} value={p.id}>
                                                                                    {p.internalCode ? `[${p.internalCode}] ` : ''}{p.productNameFa || p.description} {p.supplierCode ? `(کد سوپلایر: ${p.supplierCode})` : ''}
                                                                                </option>
                                                                            ))}
                                                                        </Select>
                                                                    </div>
                                                                </div>

                                                                {/* Details Inputs */}
                                                                <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('orderFormModal.table.itemCode')} (کد یکتای نیولند)</label><input type="text" value={item.internalCode || ''} onKeyDown={handleFormKeyDown} onChange={e => handleItemChange(index, 'internalCode', e.target.value)} placeholder="مثلاً NL-101" className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/></div>
                                                                <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('orderFormModal.table.supplierCode')} (کد موقت سوپلایر)</label><input type="text" value={item.supplierCode || ''} onKeyDown={handleFormKeyDown} onChange={e => handleItemChange(index, 'supplierCode', e.target.value)} placeholder="کد موقت..." className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/></div>
                                                                <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('orderFormModal.table.productNameFa')}</label><input type="text" value={item.productNameFa || ''} onKeyDown={handleFormKeyDown} onChange={e => handleItemChange(index, 'productNameFa', e.target.value)} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" dir="rtl"/></div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-slate-600 mb-1">{t('orderModal.table.hsCode')}</label>
                                                                    <div className="relative">
                                                                        <input type="text" value={item.hsCode || ''} onKeyDown={handleFormKeyDown} onChange={e => handleItemChange(index, 'hsCode', e.target.value)} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm pr-10"/>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleFetchHsCode(index)}
                                                                            disabled={isFetchingHsCode === item.id || !item.productName.trim()}
                                                                            className="absolute inset-y-0 right-0 px-2 flex items-center text-slate-500 hover:text-indigo-600 disabled:text-slate-300 disabled:cursor-not-allowed"
                                                                            title={t('toasts.ai.fetchingHsCodes') as string}
                                                                        >
                                                                            {isFetchingHsCode === item.id ? (
                                                                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                                </svg>
                                                                            ) : (
                                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 3zM6.03 5.23a.75.75 0 01.04 1.06l-1.72 1.72a.75.75 0 01-1.06-1.06l-1.72-1.72a.75.75 0 011.02 0zm8 0a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06zM10 18a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5H10a.75.75 0 01-.75-.75zM4.75 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm9.25-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zM6.03 14.77a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06z" clipRule="evenodd" /></svg>
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <NumericInput label={t('orderModal.table.netWeightKg')} value={item.netWeight || 0} onChange={v => handleItemChange(index, 'netWeight', v)} onKeyDown={handleFormKeyDown} fractionDigits={2}/>
                                                                <NumericInput label={t('orderModal.table.grossWeightKg')} value={item.grossWeight || 0} onChange={v => handleItemChange(index, 'grossWeight', v)} onKeyDown={handleFormKeyDown} fractionDigits={2} error={itemErrors.grossWeight}/>
                                                                <div className="lg:col-span-2 flex items-end">
                                                                    <button type="button" onClick={() => openAttributesModal(index)} className="w-full bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-50 text-sm font-semibold">{t('orderFormModal.editAttributes')} ({(item.attributes || []).length})</button>
                                                                </div>

                                                                {/* Category Selectors */}
                                                                <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-200 mt-2">
                                                                    <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('views.products.table.mainGroup')}</label><Select value={item.mainGroupId || ''} onChange={e => handleItemCategoryChange(index, 'mainGroupId', e.target.value)} onKeyDown={handleFormKeyDown as any}><option value="">Select...</option>{mainGroups.map(g => <option key={g.id} value={g.id}>{i18n.language === 'fa' && g.name_fa ? g.name_fa : g.name}</option>)}</Select></div>
                                                                    <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('views.products.table.category')}</label><Select value={item.categoryId || ''} onChange={e => handleItemCategoryChange(index, 'categoryId', e.target.value)} onKeyDown={handleFormKeyDown as any} disabled={!item.mainGroupId}><option value="">Select...</option>{filteredCategories.map(c => <option key={c.id} value={c.id}>{i18n.language === 'fa' && c.name_fa ? c.name_fa : c.name}</option>)}</Select></div>
                                                                    <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('views.products.table.subCategory')}</label><Select value={item.subCategoryId || ''} onChange={e => handleItemCategoryChange(index, 'subCategoryId', e.target.value)} onKeyDown={handleFormKeyDown as any} disabled={!item.categoryId}><option value="">Select...</option>{filteredSubCategories.map(sc => <option key={sc.id} value={sc.id}>{i18n.language === 'fa' && sc.name_fa ? sc.name_fa : sc.name}</option>)}</Select></div>
                                                                    <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('views.products.table.brand')}</label><Select value={item.brandId || ''} onChange={e => handleItemCategoryChange(index, 'brandId', e.target.value)} onKeyDown={handleFormKeyDown as any} disabled={!item.subCategoryId}><option value="">Select...</option>{filteredBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></div>
                                                                </div>
                                                                {/* Attachments Section */}
                                                                <div className="lg:col-span-4 pt-4 border-t border-slate-200 mt-2">
                                                                    <h4 className="text-xs font-bold text-slate-600 uppercase mb-2">{t('labels.attachments')}</h4>
                                                                    <div className="space-y-2">
                                                                        {(item.attachments || []).map(att => (
                                                                            <div key={att.id} className="flex items-center justify-between bg-slate-200 p-2 rounded-md">
                                                                                <span className="text-sm text-slate-700 truncate">{att.name}</span>
                                                                                <button type="button" onClick={() => handleRemoveAttachment(index, att.id)} className="text-red-500 hover:text-red-700 p-1">&times;</button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                    <button type="button" onClick={() => handleAttachmentUploadClick(index)} className="mt-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800">{t('labels.uploadFile')}</button>
                                                                </div>
                                                                <div className="lg:col-span-4 pt-4 border-t border-slate-200 mt-2">
                                                                     <button
                                                                        type="button"
                                                                        onClick={() => handleGenerateChecklist(index)}
                                                                        disabled={isGeneratingChecklist === item.id || !aiSettings?.apiKey}
                                                                        className="bg-purple-100 text-purple-800 px-3 py-1.5 rounded-md hover:bg-purple-200 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-x-2"
                                                                    >
                                                                         <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isGeneratingChecklist === item.id ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 3zM6.03 5.23a.75.75 0 01.04 1.06l-1.72 1.72a.75.75 0 01-1.06-1.06l-1.72-1.72a.75.75 0 011.02 0zm8 0a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06zM10 18a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5H10a.75.75 0 01-.75-.75zM4.75 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm9.25-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zM6.03 14.77a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06z" clipRule="evenodd" /></svg>
                                                                        {isGeneratingChecklist === item.id ? t('toasts.ai.generating') : t('buttons.generateChecklistAI')}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                    )})}
                                </tbody>
                            </table>
                        </div>

                        <button type="button" onClick={addItem} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 self-start mt-2">
                            {t('orderFormModal.addItem')}
                        </button>
                    </main>
                    <footer className="p-4 bg-slate-50 rounded-b-xl flex-shrink-0 flex justify-between items-center">
                        <div>
                            <button
                                type="button"
                                onClick={handleAnalyzeWithAI}
                                disabled={isAnalyzing || !aiSettings?.apiKey}
                                className="bg-purple-700 text-white px-4 py-2 rounded-md hover:bg-purple-800 text-sm font-semibold disabled:bg-purple-400 flex items-center justify-center gap-x-2"
                            >
                                 <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isAnalyzing ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 3zM6.03 5.23a.75.75 0 01.04 1.06l-1.72 1.72a.75.75 0 01-1.06-1.06l-1.72-1.72a.75.75 0 011.02 0zm8 0a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06zM10 18a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5H10a.75.75 0 01-.75-.75zM4.75 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm9.25-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zM6.03 14.77a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06z" clipRule="evenodd" /></svg>
                                 {isAnalyzing ? t('orderFormModal.analyzing') : t('orderFormModal.analyzeWithAI')}
                            </button>
                        </div>
                        <div className="flex justify-end gap-x-3">
                            <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                            {isFinalStatus && orderToEdit && (
                                 <button type="button" onClick={handleSaveAndFinalize} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700">{t('buttons.saveAndFinalize')}</button>
                            )}
                            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('buttons.saveChanges')}</button>
                        </div>
                    </footer>
                </form>
            </div>

            {attributesModalState.isOpen && currentItemForAttributes && (
                <AttributesModal
                    attributes={currentItemForAttributes.attributes || []}
                    onSave={saveAttributes}
                    onClose={() => setAttributesModalState({ isOpen: false, itemIndex: null })}
                    productName={currentItemForAttributes.productName}
                    aiSettings={aiSettings}
                />
            )}
        </>
    );
};
