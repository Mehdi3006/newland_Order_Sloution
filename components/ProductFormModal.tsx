import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Product, NewProductData, MainGroup, Category, SubCategory, Brand, AISettings, OrderItemAttribute } from '../types';
import NumericInput from './NumericInput';
import Select from './Select';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useModals } from '../contexts/ModalContext';
import { getHSCodeForProduct } from '../utils/ai';

interface ProductFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (formData: NewProductData, productId?: string) => void;
    productToEdit: Product | null;
    onOpenCategoryModal: (options: any) => void;
    aiSettings?: AISettings;
}

const initialProductData: Partial<NewProductData> = {
    internalCode: '',
    description: '',
    itemsPerCarton: 0,
    cartonCBM: 0,
    purchasePriceUSD: 0,
    purchasePriceInSourceCurrency: 0,
    sourceCurrency: 'USD',
    shipStageCostsUSD: 0,
    dubaiStageCostsAED: 0,
    iranStageCostsTOMAN: 0,
};

const ProductFormModal: React.FC<ProductFormModalProps> = ({ isOpen, onClose, onSubmit, productToEdit, onOpenCategoryModal, aiSettings }) => {
    const { t, i18n } = useTranslation();
    const { addToast } = useModals();
    const [data, setData] = useState<Partial<NewProductData>>(initialProductData);
    const [isFetchingHsCode, setIsFetchingHsCode] = useState(false);

    const mainGroups = useLiveQuery(() => db.mainGroups.orderBy('name').toArray(), []) || [];
    const categories = useLiveQuery(() => db.categories.toArray(), []) || [];
    const subCategories = useLiveQuery(() => db.subCategories.toArray(), []) || [];
    const brands = useLiveQuery(() => db.brands.toArray(), []) || [];
    
    // FIX: Changed dependency from `productToEdit` to `productToEdit?.id` to prevent form state reset on parent re-render.
    useEffect(() => {
        if (isOpen) {
            if (productToEdit) {
                setData(productToEdit);
            } else {
                setData(initialProductData);
            }
        }
    }, [isOpen, productToEdit?.id]);

    const handleChange = (field: keyof NewProductData, value: any) => {
        setData(prev => ({ ...prev, [field]: value }));
    };
    
    const handleCategoryChange = (level: 'mainGroupId' | 'categoryId' | 'subCategoryId' | 'brandId', value: string) => {
        setData(prev => {
            const newData: Partial<NewProductData> = { ...prev, [level]: value || undefined };
            if (level === 'mainGroupId') {
                newData.categoryId = undefined;
                newData.subCategoryId = undefined;
                newData.brandId = undefined;
            } else if (level === 'categoryId') {
                newData.subCategoryId = undefined;
                newData.brandId = undefined;
            } else if (level === 'subCategoryId') {
                newData.brandId = undefined;
            }
            return newData;
        });
    };
    
    const handleFetchHsCode = async () => {
        if (!aiSettings?.apiKey) {
            addToast(t('toasts.ai.apiKeyNotConfigured'), 'error');
            return;
        }
        if (!data.description?.trim()) {
            addToast('Please enter a product name first.', 'error');
            return;
        }

        setIsFetchingHsCode(true);
        addToast(t('toasts.ai.fetchingHsCodes'), 'info');
        try {
            const model = aiSettings.poAnalysisModel || 'gemini-3.5-flash';
            const hsCode = await getHSCodeForProduct(
                data.description,
                (data.attributes || []) as OrderItemAttribute[],
                aiSettings.apiKey,
                model
            );
            if (hsCode) {
                handleChange('hsCode', hsCode);
                addToast(`HS Code ${hsCode} found for ${data.description}`, 'success');
            } else {
                addToast(`Could not find HS Code for ${data.description}`, 'error');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to fetch HS Code.";
            addToast(message, 'error');
        } finally {
            setIsFetchingHsCode(false);
        }
    };


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(data as NewProductData, productToEdit?.id);
    };

    if (!isOpen) return null;
    
    const filteredCategories = data.mainGroupId ? categories.filter(c => c.mainGroupId === data.mainGroupId) : [];
    const filteredSubCategories = data.categoryId ? subCategories.filter(sc => sc.categoryId === data.categoryId) : [];
    const filteredBrands = data.subCategoryId ? brands.filter(b => b.subCategoryId === data.subCategoryId) : [];
    
    const currentMainGroup = data.mainGroupId ? mainGroups.find(i => i.id === data.mainGroupId) : null;
    const currentCategory = data.categoryId ? categories.find(i => i.id === data.categoryId) : null;
    const currentSubCategory = data.subCategoryId ? subCategories.find(i => i.id === data.subCategoryId) : null;
    const currentBrand = data.brandId ? brands.find(i => i.id === data.brandId) : null;


    const renderCategorySelector = (level: 'mainGroupId' | 'categoryId' | 'subCategoryId' | 'brandId', label: string, options: any[], parentId: string | null | undefined, disabled: boolean, value: string | undefined, itemToEdit: any) => (
        <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
            <div className="flex items-center gap-x-1">
                <Select value={value || ''} onChange={e => handleCategoryChange(level, e.target.value)} disabled={disabled}>
                    <option value="">Select...</option>
                    {options.map(o => <option key={o.id} value={o.id}>{i18n.language === 'fa' && o.name_fa ? o.name_fa : o.name}</option>)}
                </Select>
                <button type="button" onClick={() => onOpenCategoryModal({ level: level.replace('Id', ''), parentId, itemToEdit: null, onSaveSuccess: (newId: string) => handleCategoryChange(level, newId) })} disabled={level !== 'mainGroupId' && !parentId} className="p-1.5 rounded hover:bg-slate-200 text-slate-600 disabled:text-slate-300" title="Add New">+</button>
                <button type="button" onClick={() => itemToEdit && onOpenCategoryModal({ level: level.replace('Id', ''), parentId, itemToEdit, onSaveSuccess: () => {} })} disabled={!value} className="p-1.5 rounded hover:bg-slate-200 text-slate-600 disabled:text-slate-300" title="Edit">✏️</button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-gray-800">{productToEdit ? t('views.products.productForm.editTitle') : t('views.products.productForm.title')}</h2>
                </header>
                <main className="flex-1 overflow-y-auto p-6 space-y-6">
                    <section>
                        <h3 className="text-md font-semibold text-slate-800 border-b pb-2 mb-4">{t('views.products.productForm.basicInfo')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('orderFormModal.table.itemCode')}</label><input type="text" value={data.internalCode || ''} onChange={e => handleChange('internalCode', e.target.value)} required className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/></div>
                            <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('orderModal.table.productName')}</label><input type="text" value={data.description || ''} onChange={e => handleChange('description', e.target.value)} required className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/></div>
                             <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('orderFormModal.table.productNameFa')}</label><input type="text" value={data.productNameFa || ''} onChange={e => handleChange('productNameFa', e.target.value)} dir="rtl" className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/></div>
                            <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('orderFormModal.table.supplierCode')}</label><input type="text" value={data.supplierCode || ''} onChange={e => handleChange('supplierCode', e.target.value)} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/></div>
                             <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('views.products.table.oldSystemCode')}</label><input type="text" value={data.oldSystemCode || ''} onChange={e => handleChange('oldSystemCode', e.target.value)} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/></div>
                        </div>
                    </section>
                    <section>
                        <h3 className="text-md font-semibold text-slate-800 border-b pb-2 mb-4">{t('views.products.productForm.category')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {renderCategorySelector('mainGroupId', t('views.products.table.mainGroup'), mainGroups, null, false, data.mainGroupId, currentMainGroup)}
                            {renderCategorySelector('categoryId', t('views.products.table.category'), filteredCategories, data.mainGroupId, !data.mainGroupId, data.categoryId, currentCategory)}
                            {renderCategorySelector('subCategoryId', t('views.products.table.subCategory'), filteredSubCategories, data.categoryId, !data.categoryId, data.subCategoryId, currentSubCategory)}
                            {renderCategorySelector('brandId', t('views.products.table.brand'), filteredBrands, data.subCategoryId, !data.subCategoryId, data.brandId, currentBrand)}
                        </div>
                    </section>
                    <section>
                         <h3 className="text-md font-semibold text-slate-800 border-b pb-2 mb-4">{t('views.products.productForm.physicalSpecs')}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <NumericInput label={t('views.products.table.itemsPerCarton')} value={data.itemsPerCarton || 0} onChange={v => handleChange('itemsPerCarton', v)} />
                            <NumericInput label={t('views.products.table.netWeight')} value={data.netWeight || 0} onChange={v => handleChange('netWeight', v)} fractionDigits={2} />
                            <NumericInput label={t('views.products.table.grossWeight')} value={data.grossWeight || 0} onChange={v => handleChange('grossWeight', v)} fractionDigits={2} />
                            <NumericInput label={t('views.products.table.cartonCBM')} value={data.cartonCBM || 0} onChange={v => handleChange('cartonCBM', v)} fractionDigits={3} />
                        </div>
                    </section>
                    <section>
                        <h3 className="text-md font-semibold text-slate-800 border-b pb-2 mb-4">{t('views.products.productForm.customs')}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">{t('orderModal.table.hsCode')}</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        value={data.hsCode || ''} 
                                        onChange={e => handleChange('hsCode', e.target.value)} 
                                        className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-1.5 text-sm pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleFetchHsCode}
                                        disabled={isFetchingHsCode || !data.description?.trim()}
                                        className="absolute inset-y-0 right-0 px-2 flex items-center text-slate-500 hover:text-indigo-600 disabled:text-slate-300 disabled:cursor-not-allowed"
                                        title={t('toasts.ai.fetchingHsCodes') as string}
                                    >
                                        {isFetchingHsCode ? (
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
                            <NumericInput label={t('orderFormModal.table.customsValue')} value={data.customsValue || 0} onChange={v => handleChange('customsValue', v)} />
                            <div><label className="block text-xs font-medium text-slate-600 mb-1">{t('orderFormModal.table.customsBasis')}</label><Select value={data.customsValueBasis || 'unit'} onChange={e => handleChange('customsValueBasis', e.target.value)}><option value="unit">{t('orderFormModal.customsBasisOptions.unit')}</option><option value="kg">{t('orderFormModal.customsBasisOptions.kg')}</option></Select></div>
                        </div>
                    </section>
                     <section>
                        <h3 className="text-md font-semibold text-slate-800 border-b pb-2 mb-4">{t('views.products.productForm.costing')}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <NumericInput label={`${t('labels.purchasePrice')} (USD)`} value={data.purchasePriceUSD || 0} onChange={v => handleChange('purchasePriceUSD', v)} fractionDigits={3}/>
                            <NumericInput label={`${t('labels.shipStageCosts')} (USD)`} value={data.shipStageCostsUSD || 0} onChange={v => handleChange('shipStageCostsUSD', v)} fractionDigits={3}/>
                            <NumericInput label={`${t('labels.dubaiStageCosts')} (AED)`} value={data.dubaiStageCostsAED || 0} onChange={v => handleChange('dubaiStageCostsAED', v)} fractionDigits={3}/>
                            <NumericInput label={`${t('labels.iranStageCosts')} (TOMAN)`} value={data.iranStageCostsTOMAN || 0} onChange={v => handleChange('iranStageCostsTOMAN', v)} />
                        </div>
                    </section>
                </main>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3">
                    <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('buttons.save')}</button>
                </footer>
            </form>
        </div>
    );
};

export default ProductFormModal;