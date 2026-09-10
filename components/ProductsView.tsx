
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProducts as useDbProducts } from '../hooks/useProducts';
import { CostingSettings, Product, ProductCardDisplaySettings, PriceHistory, OrderItemAttribute, MainGroup, Category, SubCategory, Brand, AISettings, ProductImage, NewProductData, ScannedMedia, Attachment } from '../types';
import { exportProductsToExcel, generatePrintableProductsHtml, generateProductImportTemplate, parseAndImportProducts, formatToman, getTomanUnitLabel, generateProductBrochureHtml, persianArabicToEnglish } from '../utils/formatters';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import NumericInput from './NumericInput';
import { useModals } from '../contexts/ModalContext';
import LoadingOverlay from './LoadingOverlay';
import PriceHistoryModal from './PriceHistoryModal';
import { recalculateProductPrices } from '../utils/costCalculator';
import Select from './Select';
import { parseAttributesFromText, parseAttributesFromImage, categorizeProductWithAI, getHSCodeForProduct } from '../utils/ai';
import ProductFormModal from './ProductFormModal';
import ImageCropperModal from './ImageCropperModal';
import DrilldownFilter from './DrilldownFilter';
import { useSettings } from '../hooks/useSettings';
import ProductMediaUpdaterModal from './ProductMediaUpdaterModal';
import CategoryEditModal from './CategoryEditModal';
import RowCategoryEditor from './RowCategoryEditor';
import { formatDisplayDate } from '../utils/dateUtils';
import ProductCostAnalysisModal from './ProductCostAnalysisModal';
import AICategorizationModal from './AICategorizationModal';
import { ProductAccountingLedgerTab } from './accounting/ProductAccountingLedgerTab';

type ViewMode = 'row' | 'block' | 'card';
type ProductSectionMode = 'pricing_engine' | 'dubai_ledger';
type PriceFilter = 'all' | 'aed' | 'toman';
type CategoryLevel = 'mainGroup' | 'category' | 'subCategory' | 'brand';

// +++ HELPER FUNCTIONS & COMPONENTS +++
const DEFAULT_COL_WIDTH = 120;

const getNestedValue = (obj: any, path: string) => path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);

interface ViewProps {
    products: Product[];
    setProductsForOptimisticUpdate: React.Dispatch<React.SetStateAction<Product[]>>;
    costingSettings: CostingSettings | null;
    allColumns: Record<string, string>;
    columnOrder: string[];
    setColumnOrder: React.Dispatch<React.SetStateAction<string[]>>;
    visibleColumns: Record<string, boolean>;
    columnWidths: Record<string, number>;
    setColumnWidths: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    executeAutoFitCol: (colKey: string) => Promise<void>;
    sortConfig: { key: string | null; direction: 'asc' | 'desc'; };
    handleSort: (key: string) => void;
    selectedProductIds: Set<string>;
    handleSelectAll: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleSelectRow: (productId: string) => void;
    editingCell: { productId: string; columnKey: string; } | null;
    handleCellDoubleClick: (product: Product, columnKey: string) => void;
    editValue: string | number;
    handleEditValueChange: (value: string | number) => void;
    closeEditorAndSave: () => Promise<void>;
    cancelEdit: () => void;
    getStepForKey: (key: string) => number;
    setHistoryModal: React.Dispatch<React.SetStateAction<{ isOpen: boolean; product: Product | null; }>>;
    setAttributesModal: React.Dispatch<React.SetStateAction<{ isOpen: boolean; product: Product | null; }>>;
    formatValue: (value: any, key: string) => string;
    editableColumns: Set<string>;
    productCardSettings: ProductCardDisplaySettings;
    expandedCardIds: Set<string>;
    toggleCardExpansion: (productId: string) => void;
    priceFilter: PriceFilter;
    onEdit: (product: Product) => void;
    onOpenBrochureWizard: (product: Product) => void;
    hiddenBlockColumns: Set<string>;
    setHiddenBlockColumns: React.Dispatch<React.SetStateAction<Set<string>>>;
    blockContextMenu: { x: number; y: number; key?: string; } | null;
    setBlockContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; key?: string; } | null>>;
    handlePriceReset: (productId: string, columnKey: string) => Promise<void>;
    categoryEditableColumns: Set<string>;
    handleCategorySave: (productId: string, updates: Partial<Product>) => Promise<void>;
    textEditableColumns: Set<string>;
    updateProductsOrder: (orderedProducts: Product[]) => void;
    onOpenCategoryModal: (options: Omit<CategoryModalState, 'isOpen'>) => void;
    onOpenAnalysisModal: (product: Product) => void;
    handleProductListKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

const AttributesGalleryModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    onUpdateProduct: (productId: string, updates: Partial<Product>) => Promise<void>;
    aiSettings?: AISettings;
    onOpenBrochureWizard: (product: Product) => void;
}> = ({ isOpen, onClose, product: initialProduct, onUpdateProduct, aiSettings, onOpenBrochureWizard }) => {
    // ... existing implementation remains unchanged ...
    const { t } = useTranslation();
    const { addToast, showConfirmation } = useModals();
    const [bulkText, setBulkText] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const aiImageInputRef = useRef<HTMLInputElement>(null);
    const manualInputRef = useRef<HTMLInputElement>(null);
    const [cropperState, setCropperState] = useState<{ isOpen: boolean; src: string | null; file: File | null; imageIdToEdit: string | null }>({ isOpen: false, src: null, file: null, imageIdToEdit: null });
    
    const [product, setProduct] = useState(initialProduct);

    useEffect(() => {
        if (initialProduct) {
            setProduct(initialProduct);
        }
    }, [initialProduct]);


    if (!isOpen || !product) return null;

    const handleAttributeChange = (index: number, field: 'key' | 'value', value: string) => {
        const newAttributes = [...(product.attributes || [])];
        newAttributes[index] = { ...newAttributes[index], id: newAttributes[index].id || crypto.randomUUID(), [field]: value };
        onUpdateProduct(product.id, { attributes: newAttributes });
    };

    const handleAddAttribute = () => {
        const newAttributes = [...(product.attributes || []), { id: crypto.randomUUID(), key: '', value: '' }];
        onUpdateProduct(product.id, { attributes: newAttributes });
    };

    const handleRemoveAttribute = (index: number) => {
        const newAttributes = (product.attributes || []).filter((_, i) => i !== index);
        onUpdateProduct(product.id, { attributes: newAttributes });
    };

    const handleParseWithAI = async () => {
        if (!bulkText.trim() || isParsing) return;
        if (!aiSettings?.apiKey) {
            addToast(t('toasts.ai.apiKeyNotConfigured'), 'error');
            return;
        }
        setIsParsing(true);
        try {
            const model = aiSettings?.attributeParsingModel || 'gemini-3.5-flash';
            const parsed = await parseAttributesFromText(bulkText, model, aiSettings.apiKey);
            const newAttrs = parsed.map(p => ({ ...p, id: crypto.randomUUID() }));
            const updatedAttributes = [...(product.attributes || []), ...newAttrs];
            await onUpdateProduct(product.id, { attributes: updatedAttributes });
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
                    const newAttrs = parsed.map(p => ({ ...p, id: crypto.randomUUID() }));
                    const updatedAttributes = [...(product.attributes || []).filter(a => a.key || a.value), ...newAttrs];
                    await onUpdateProduct(product.id, { attributes: updatedAttributes });
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
    
    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (file.size > 20 * 1024 * 1024) { // 20MB limit for pre-crop
            addToast(`Image "${file.name}" is too large (max 20MB).`, 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            setCropperState({ isOpen: true, src: e.target?.result as string, file, imageIdToEdit: null });
        };
        reader.readAsDataURL(file);

        // Reset file input to allow uploading the same file again
        if (event.target) {
            event.target.value = '';
        }
    };

    const handleCropComplete = (croppedImageUrl: string) => {
        let updatedImages: ProductImage[];
        if (cropperState.imageIdToEdit) {
            // Editing existing image
            updatedImages = (product.images || []).map(img => 
                img.id === cropperState.imageIdToEdit ? { ...img, data: croppedImageUrl } : img
            );
        } else {
            // Adding new image
            const newImage: ProductImage = {
                id: crypto.randomUUID(),
                data: croppedImageUrl,
                name: cropperState.file?.name || 'cropped-image.jpg',
            };
            updatedImages = [...(product.images || []), newImage];
        }
        onUpdateProduct(product.id, { images: updatedImages });
        setCropperState({ isOpen: false, src: null, file: null, imageIdToEdit: null });
    };
    
    const handleEditImageClick = (e: React.MouseEvent, image: ProductImage) => {
        e.stopPropagation(); // Prevent toggling selection
        setCropperState({ isOpen: true, src: image.data, file: null, imageIdToEdit: image.id });
    };

    const handleRemoveImage = (imageId: string) => {
        const updatedImages = (product.images || []).filter(img => img.id !== imageId);
        onUpdateProduct(product.id, { images: updatedImages });
    };
    
    const handlePreviewBrochure = () => {
        if (!product) return;
        onOpenBrochureWizard(product);
        onClose();
    };

    const downloadImage = (image: ProductImage) => {
        const a = document.createElement('a');
        a.href = image.data;
        a.download = image.name || 'image.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };
    
    const handleManualUploadClick = () => {
        manualInputRef.current?.click();
    };

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !product) return;

        try {
            const data = await file.arrayBuffer();
            const newAttachment: Attachment = {
                id: crypto.randomUUID(),
                name: file.name,
                type: file.type,
                size: file.size,
                data,
                createdAt: new Date().toISOString(),
            };
            const updatedAttachments = [...(product.attachments || []), newAttachment];
            await onUpdateProduct(product.id, { attachments: updatedAttachments });
        } catch (error) {
            console.error('Error reading file:', error);
            addToast('Failed to read the selected file.', 'error');
        } finally {
            if (manualInputRef.current) manualInputRef.current.value = '';
        }
    };

    const downloadAttachment = (attachment: Attachment) => {
        try {
            const blob = new Blob([attachment.data], { type: attachment.type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = attachment.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Download failed:", error);
            addToast("Could not download file.", "error");
        }
    };

    const handleDeleteAttachment = (attachmentId: string) => {
        if (!product) return;
        showConfirmation({
            title: t('confirmationModal.deleteAttachmentTitle'),
            message: t('confirmationModal.deleteAttachmentBody', { fileName: product.attachments?.find(a => a.id === attachmentId)?.name || 'file' }),
            variant: 'destructive',
            onConfirm: async () => {
                const updatedAttachments = (product.attachments || []).filter(a => a.id !== attachmentId);
                await onUpdateProduct(product.id, { attachments: updatedAttachments });
            },
        });
    };

    return (
        <>
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex-shrink-0">
                    <h3 className="text-lg font-bold text-gray-800">{t('attributesGallery.title')}</h3>
                    <p className="text-sm text-slate-600">{product.description}</p>
                </header>
                <main className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-x-6">
                    {/* Left Column: Attributes */}
                    <div className="flex flex-col gap-y-4">
                        <div>
                            <h4 className="font-semibold text-slate-800 mb-2">{t('attributesGallery.specifications')}</h4>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 border rounded-md p-2 bg-slate-50">
                                {(product.attributes || []).map((attr, index) => (
                                    <div key={attr.id || index} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                                        <input type="text" placeholder={t('orderFormModal.attributeKey') as string} value={attr.key} onChange={e => handleAttributeChange(index, 'key', e.target.value)} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/>
                                        <input type="text" placeholder={t('orderFormModal.attributeValue') as string} value={attr.value} onChange={e => handleAttributeChange(index, 'value', e.target.value)} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/>
                                        <button type="button" onClick={() => handleRemoveAttribute(index)} className="text-red-500 hover:text-red-700 p-1">&times;</button>
                                    </div>
                                ))}
                                 {(!product.attributes || product.attributes.length === 0) && <p className="text-sm text-slate-400 text-center py-4">{t('attributesGallery.noSpecifications')}</p>}
                            </div>
                             <button type="button" onClick={handleAddAttribute} className="mt-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800">{t('orderFormModal.addAttribute')}</button>
                        </div>
                        <div className="pt-4 border-t border-slate-200">
                            <label htmlFor="bulk-attributes" className="block text-sm font-medium text-slate-700 mb-1">{t('orderFormModal.bulkAddPrompt')}</label>
                            <textarea id="bulk-attributes" value={bulkText} onChange={e => setBulkText(e.target.value)} rows={4} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" />
                             <div className="mt-2 flex items-center gap-x-2">
                                <button type="button" onClick={handleParseWithAI} disabled={isParsing || !aiSettings?.apiKey} className="bg-purple-700 text-white px-3 py-1.5 rounded-md hover:bg-purple-800 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-x-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 3zM6.03 5.23a.75.75 0 01.04 1.06l-1.72 1.72a.75.75 0 01-1.06-1.06l-1.72-1.72a.75.75 0 011.02 0zm8 0a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06zM10 18a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5H10a.75.75 0 01-.75-.75zM4.75 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm9.25-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zM6.03 14.77a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06z" clipRule="evenodd" /></svg>
                                    {t('orderFormModal.parseWithAI')}
                                </button>
                                <input type="file" ref={aiImageInputRef} onChange={handleImageParse} accept="image/*" className="hidden"/>
                                <button type="button" onClick={() => aiImageInputRef.current?.click()} disabled={isParsing || !aiSettings?.apiKey} className="bg-green-700 text-white px-3 py-1.5 rounded-md hover:bg-green-800 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-x-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M1 3a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V3zm2 2v10h14V5H3zm11 2a1 1 0 10-2 0v2H9a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
                                    {t('attributesGallery.analyzeImage')}
                                </button>
                            </div>
                        </div>
                    </div>
                     {/* Right Column: Image Gallery & Manuals */}
                    <div className="flex flex-col gap-y-4">
                        <div>
                             <h4 className="font-semibold text-slate-800 mb-2">{t('attributesGallery.imageGallery')}</h4>
                             <div className="grid grid-cols-4 gap-2 border rounded-md p-2 bg-slate-100 min-h-[12rem]">
                                {(product.images || []).map(img => (
                                    <div key={img.id} className="relative group aspect-square">
                                        <img src={img.data} alt={img.name} className="w-full h-full object-cover rounded-md"/>
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1 gap-x-1">
                                            <button onClick={(e) => { e.stopPropagation(); downloadImage(img); }} className="text-white p-2 rounded-full hover:bg-black/50" title={t('common.download') as string}>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                            </button>
                                            <button onClick={(e) => handleEditImageClick(e, img)} className="text-white p-2 rounded-full hover:bg-black/50" title={t('buttons.edit') as string}>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                            </button>
                                            <button onClick={() => handleRemoveImage(img.id)} className="text-white p-2 rounded-full hover:bg-black/50" title={t('buttons.delete') as string}>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <button type="button" onClick={() => imageInputRef.current?.click()} className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-md text-slate-400 hover:bg-slate-100 hover:border-slate-400 aspect-square">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                    <span className="text-xs mt-1">{t('attributesGallery.upload')}</span>
                                </button>
                             </div>
                             <input type="file" ref={imageInputRef} onChange={handleImageUpload} multiple accept="image/*" className="hidden"/>
                        </div>
                         <div className="pt-4 border-t border-slate-200">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="font-semibold text-slate-800">Manuals & Attachments</h4>
                                <button onClick={handleManualUploadClick} className="bg-slate-200 text-slate-700 px-3 py-1 rounded-md hover:bg-slate-300 text-xs font-semibold">
                                    {t('labels.uploadFile')}
                                </button>
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2 bg-slate-100">
                                {(product.attachments || []).map(att => (
                                    <div key={att.id} className="flex items-center justify-between p-2 rounded hover:bg-slate-200">
                                        <div className="flex items-center gap-x-2 truncate">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                                            <span className="text-sm text-slate-700 truncate" title={att.name}>{att.name}</span>
                                        </div>
                                        <div className="flex items-center gap-x-2">
                                            <button onClick={() => downloadAttachment(att)} className="text-xs font-semibold text-indigo-600 hover:underline">{t('common.download')}</button>
                                            <button onClick={() => handleDeleteAttachment(att.id)} className="text-xs font-semibold text-red-600 hover:underline">{t('buttons.delete')}</button>
                                        </div>
                                    </div>
                                ))}
                                {(!product.attachments || product.attachments.length === 0) && (
                                    <p className="text-sm text-slate-400 text-center py-2">{t('orderModal.attachments.noAttachments')}</p>
                                )}
                            </div>
                            <input type="file" ref={manualInputRef} onChange={handleFileSelected} className="hidden"/>
                        </div>
                    </div>
                </main>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-x-2">
                         <button type="button" onClick={() => onOpenBrochureWizard(product)} className="bg-white text-slate-700 px-4 py-2 rounded-md hover:bg-slate-50 border border-slate-300 font-semibold text-sm">{t('buttons.previewBrochure')}</button>
                    </div>
                    <div className="flex gap-x-3">
                        <button type="button" onClick={onClose} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('common.close')}</button>
                    </div>
                </footer>
            </div>
        </div>
        <ImageCropperModal
            isOpen={cropperState.isOpen}
            src={cropperState.src}
            onClose={() => setCropperState({ isOpen: false, src: null, file: null, imageIdToEdit: null })}
            onCropComplete={handleCropComplete}
        />
        </>
    );
};


// +++ RENDER FUNCTIONS FOR EACH VIEW +++

const RowView: React.FC<ViewProps> = (props) => {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.dir() === 'rtl';
    const { products, setProductsForOptimisticUpdate: setProducts, columnOrder, setColumnOrder, columnWidths, setColumnWidths, executeAutoFitCol, sortConfig, handleSort, selectedProductIds, handleSelectAll, handleSelectRow, editingCell, handleCellDoubleClick, editValue, handleEditValueChange, closeEditorAndSave, cancelEdit, getStepForKey, setHistoryModal, setAttributesModal, formatValue, allColumns, editableColumns, handlePriceReset, onEdit, onOpenBrochureWizard, onOpenAnalysisModal,
        categoryEditableColumns, handleCategorySave, textEditableColumns, updateProductsOrder, onOpenCategoryModal, handleProductListKeyDown
    } = props;
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const resizingColumnRef = useRef<{ key: string, startX: number, startWidth: number } | null>(null);
    const categoryEditorRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (categoryEditorRef.current && !categoryEditorRef.current.contains(event.target as Node)) {
                cancelEdit();
            }
        }
        if (editingCell && categoryEditableColumns.has(editingCell.columnKey)) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [editingCell, categoryEditableColumns, cancelEdit]);

    // --- State for new features ---
    const [frozenUntilColKey, setFrozenUntilColKey] = useState<string | null>(() => localStorage.getItem('productsFrozenColumn') || null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; key: string } | null>(null);
    const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
    const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
    const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);

    // --- Effects for new features ---
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (contextMenu && !(event.target as HTMLElement).closest('.context-menu')) {
                setContextMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [contextMenu]);
    
    useEffect(() => {
        if(frozenUntilColKey) localStorage.setItem('productsFrozenColumn', frozenUntilColKey);
        else localStorage.removeItem('productsFrozenColumn');
    }, [frozenUntilColKey]);

    // --- Handlers for new features ---
    const handleContextMenu = (e: React.MouseEvent, key: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, key });
    };

    const handleColumnDragStart = (e: React.DragEvent, key: string) => { setDraggedColumnKey(key); e.dataTransfer.effectAllowed = 'move'; };
    const handleColumnDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
    const handleColumnDrop = (e: React.DragEvent, targetKey: string) => {
        e.preventDefault();
        if (!draggedColumnKey || draggedColumnKey === targetKey) return;
        const newOrder = [...columnOrder];
        const draggedIndex = newOrder.indexOf(draggedColumnKey);
        const targetIndex = newOrder.indexOf(targetKey);
        const [draggedItem] = newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, draggedItem);
        setColumnOrder(newOrder);
        setDraggedColumnKey(null);
    };

    const handleRowDragStart = (e: React.DragEvent, productId: string) => { if(sortConfig.key === 'order') setDraggedRowId(productId); };
    const handleRowDragOver = (e: React.DragEvent, targetId: string) => { if(sortConfig.key === 'order') { e.preventDefault(); setDragOverRowId(targetId); }};
    const handleRowDrop = (e: React.DragEvent, targetId: string) => {
        if (sortConfig.key !== 'order' || !draggedRowId || draggedRowId === targetId) return;
        const draggedIndex = products.findIndex(p => p.id === draggedRowId);
        const targetIndex = products.findIndex(p => p.id === targetId);
        if (draggedIndex === -1 || targetIndex === -1) return;
        
        const reordered = [...products];
        const [draggedItem] = reordered.splice(draggedIndex, 1);
        reordered.splice(targetIndex, 0, draggedItem);
        
        // When manually reordering, we must preserve sequential order indices
        const reorderedWithUpdatedOrder = reordered.map((p, index) => ({ ...p, order: index + 1 }));

        setProducts(reorderedWithUpdatedOrder);
        updateProductsOrder(reorderedWithUpdatedOrder);
    };
    const handleRowDragEnd = () => { setDraggedRowId(null); setDragOverRowId(null); };

    const handleResizeMouseDown = useCallback((e: React.MouseEvent, key: string) => {
        e.preventDefault();
        e.stopPropagation();
        resizingColumnRef.current = {
            key,
            startX: e.clientX,
            startWidth: columnWidths[key] ?? DEFAULT_COL_WIDTH
        };

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (resizingColumnRef.current) {
                const { key, startX, startWidth } = resizingColumnRef.current;
                const newWidth = Math.max(40, startWidth + (moveEvent.clientX - startX));
                setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
            }
        };

        const handleMouseUp = () => {
            resizingColumnRef.current = null;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [columnWidths, setColumnWidths]);

    // --- Calculation for frozen columns ---
    const frozenUntilIndex = frozenUntilColKey ? columnOrder.indexOf(frozenUntilColKey) : -1;
    const frozenOffsets = useMemo(() => {
        const offsets = [0];
        let currentOffset = 0;
        for(let i = 0; i < frozenUntilIndex + 1; i++) {
            const key = columnOrder[i];
            const width = columnWidths[key] ?? DEFAULT_COL_WIDTH;
            offsets[i] = currentOffset;
            currentOffset += width;
        }
        return offsets;
    }, [frozenUntilIndex, columnOrder, columnWidths]);


    // --- Component Render ---
    const SortIcon: React.FC<{ direction?: 'asc' | 'desc' }> = ({ direction }) => {
        if (!direction) return <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>;
        return direction === 'asc'
            ? <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
    };

    return (
        <div 
            className="flex-1 overflow-hidden flex flex-col border border-slate-300 rounded-lg bg-white shadow-sm relative h-full outline-none" 
            tabIndex={0} 
            onKeyDown={handleProductListKeyDown}
        >
            <div ref={tableContainerRef} className="flex-1 overflow-auto">
                <table className="min-w-full text-sm border-collapse table-fixed">
                    <thead className="sticky top-0 z-20 bg-slate-100">
                        <tr>
                            {columnOrder.map((key, index) => {
                                const isFrozen = index <= frozenUntilIndex;
                                const style: React.CSSProperties = {
                                    width: `${columnWidths[key] ?? DEFAULT_COL_WIDTH}px`,
                                    minWidth: `${columnWidths[key] ?? DEFAULT_COL_WIDTH}px`,
                                };
                                if (isFrozen) {
                                    style.position = 'sticky';
                                    if (isRtl) {
                                        style.right = frozenOffsets[index];
                                    } else {
                                        style.left = frozenOffsets[index];
                                    }
                                    style.zIndex = 12 - index;
                                }
                                return (
                                    <th 
                                        key={key} 
                                        draggable={key !== 'actions'}
                                        onDragStart={(e) => handleColumnDragStart(e, key)}
                                        onDragOver={handleColumnDragOver}
                                        onDrop={(e) => handleColumnDrop(e, key)}
                                        onDragEnd={() => setDraggedColumnKey(null)}
                                        onContextMenu={(e) => handleContextMenu(e, key)}
                                        className={`group relative p-2 border-b border-r border-slate-300 text-xs text-slate-600 uppercase tracking-wider font-bold bg-slate-100 whitespace-normal text-left rtl:text-right transition-opacity ${draggedColumnKey === key ? 'opacity-50' : ''} ${isFrozen ? 'shadow-md' : ''}`}
                                        style={style}
                                    >
                                        <div className="flex items-center gap-x-2">
                                            {index === 0 && (
                                                <input type="checkbox" checked={selectedProductIds.size > 0 && selectedProductIds.size === products.length} ref={el => { if (el) el.indeterminate = selectedProductIds.size > 0 && selectedProductIds.size < products.length }} onChange={handleSelectAll} className="h-4 w-4 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500"/>
                                            )}
                                            <div className="flex-1 flex items-center justify-between cursor-pointer" onClick={() => handleSort(key)}>
                                                <span className="flex-1">{allColumns[key]}</span>
                                                <div className="w-4 ml-2"><SortIcon direction={sortConfig.key === key ? sortConfig.direction : undefined} /></div>
                                            </div>
                                        </div>
                                        {key !== 'actions' && <div onMouseDown={(e) => handleResizeMouseDown(e, key)} className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-30 group-hover:bg-indigo-300 transition-colors" />}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody onDragLeave={() => setDragOverRowId(null)}>
                        {products.map((p) => {
                            const isOverridden = (key: string) => {
                                 if (!key.startsWith('sellingPrices.')) return false;
                                 const overridePath = key.replace('sellingPrices', 'pricingTiersOverrides');
                                 return getNestedValue(p, overridePath) !== undefined;
                            };
                            return (
                                <tr 
                                    key={p.id} 
                                    draggable={sortConfig.key === 'order'}
                                    onDragStart={(e) => handleRowDragStart(e, p.id)}
                                    onDragOver={(e) => handleRowDragOver(e, p.id)}
                                    onDrop={(e) => handleRowDrop(e, p.id)}
                                    onDragEnd={handleRowDragEnd}
                                    className={`transition-colors relative ${selectedProductIds.has(p.id) ? 'bg-indigo-50' : 'bg-white'} ${sortConfig.key === 'order' ? 'cursor-grab' : ''} ${draggedRowId === p.id ? 'opacity-50' : ''}`}
                                >
                                    {dragOverRowId === p.id && <div className="absolute top-0 left-0 w-full h-0.5 bg-indigo-500 z-30"/>}
                                    {columnOrder.map((key, colIndex) => {
                                        const isEditing = editingCell?.productId === p.id && editingCell?.columnKey === key;
                                        const cellValue = getNestedValue(p, key);
                                        const isFrozen = colIndex <= frozenUntilIndex;
                                        const style: React.CSSProperties = {
                                            width: `${columnWidths[key] ?? DEFAULT_COL_WIDTH}px`,
                                            minWidth: `${columnWidths[key] ?? DEFAULT_COL_WIDTH}px`,
                                        };
                                        if (isFrozen) {
                                            style.position = 'sticky';
                                            if (isRtl) {
                                                style.right = frozenOffsets[colIndex];
                                            } else {
                                                style.left = frozenOffsets[colIndex];
                                            }
                                            style.zIndex = 11 - colIndex;
                                        }
                                        return (
                                            <td key={key} onDoubleClick={() => handleCellDoubleClick(p, key)} className={`p-0 border-b border-r border-slate-200 whitespace-normal break-words align-top ${editableColumns.has(key) ? 'hover:bg-indigo-50/50' : ''} ${isOverridden(key) ? 'bg-amber-100' : (selectedProductIds.has(p.id) ? 'bg-indigo-50' : 'bg-white')} ${isFrozen ? 'shadow-md' : ''}`} style={style}>
                                                {isEditing ? (
                                                    categoryEditableColumns.has(key) ? (
                                                        <RowCategoryEditor
                                                            ref={categoryEditorRef}
                                                            product={p}
                                                            onSave={handleCategorySave}
                                                            onClose={cancelEdit}
                                                        />
                                                    )
                                                    : textEditableColumns.has(key) ? (
                                                        <input
                                                            type="text"
                                                            value={editValue as string}
                                                            onChange={e => handleEditValueChange(e.target.value)}
                                                            onBlur={closeEditorAndSave}
                                                            onKeyDown={e => { if (e.key === 'Enter') closeEditorAndSave(); if (e.key === 'Escape') cancelEdit(); }}
                                                            autoFocus
                                                            className="w-full h-full p-2 border-2 border-indigo-500 rounded-none focus:outline-none text-sm bg-white text-gray-900"
                                                        />
                                                    ) : key === 'customsValueBasis' ? (
                                                        <Select value={editValue as string} onChange={e => handleEditValueChange(e.target.value)} onBlur={closeEditorAndSave} autoFocus className="w-full h-full p-2 border-2 border-indigo-500 rounded-none focus:outline-none text-sm bg-white text-gray-900"><option value="unit">{t('orderFormModal.customsBasisOptions.unit')}</option><option value="kg">{t('orderFormModal.customsBasisOptions.kg')}</option></Select>
                                                    ) : (
                                                        <NumericInput value={Number(editValue)} onChange={handleEditValueChange} onBlur={closeEditorAndSave} onKeyDown={(e) => { if (e.key === 'Enter') closeEditorAndSave(); if (e.key === 'Escape') cancelEdit();}} autoFocus step={getStepForKey(key)} className="w-full h-full p-2 border-2 border-indigo-500 rounded-none focus:outline-none text-sm"/>
                                                    )
                                                ) : key === 'actions' ? (
                                                    <div className="px-2 py-2 h-full flex items-center justify-center gap-x-1">
                                                         <button onClick={() => onEdit(p)} className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-100 rounded" title={t('buttons.edit') as string}><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg></button>
                                                         <button onClick={() => onOpenAnalysisModal(p)} className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-100 rounded" title="Cost Analysis"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" /><path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" /></svg></button>
                                                         <button onClick={() => setHistoryModal({ isOpen: true, product: p })} className="text-xs font-semibold text-indigo-600 hover:bg-indigo-100 rounded p-1">{t('common.history')}</button>
                                                         <button onClick={() => setAttributesModal({ isOpen: true, product: p })} className="text-xs font-semibold text-indigo-600 hover:bg-indigo-100 rounded p-1">{t('views.products.attributes')}</button>
                                                         <button onClick={() => onOpenBrochureWizard(p)} className="text-xs font-semibold text-indigo-600 hover:bg-indigo-100 rounded p-1">Brochure</button>
                                                    </div>
                                                ) : (
                                                    <div className="group px-2 py-2 h-full flex items-center justify-between gap-x-1 w-full">
                                                        <div className="flex items-start gap-x-2">
                                                            {colIndex === 0 && (<input type="checkbox" checked={selectedProductIds.has(p.id)} onChange={() => handleSelectRow(p.id)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500 mt-0.5"/>)}
                                                            <span className={`${typeof cellValue === 'number' || key.startsWith('profit') ? 'font-mono' : ''} ${key === 'description' ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
                                                                {key === 'description'
                                                                  ? (i18n.language === 'fa' && p.productNameFa ? p.productNameFa : p.description)
                                                                  : key === 'attributes'
                                                                    ? (<button onClick={() => setAttributesModal({ isOpen: true, product: p })} className="text-indigo-600 hover:underline text-left rtl:text-right">{t('common.open')} ({p.attributes?.length || 0})</button>)
                                                                    : (formatValue(cellValue, key))
                                                                }
                                                            </span>
                                                        </div>
                                                        {isOverridden(key) && (<button onClick={(e) => { e.stopPropagation(); handlePriceReset(p.id, key); }} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-indigo-600 p-0.5 rounded-full flex-shrink-0" title={t('priceHistoryModal.resetPrice') as string}><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L9.414 11H13a1 1 0 100-2H9.414l1.293-1.293z" clipRule="evenodd" /></svg></button>)}
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            {contextMenu && (
                <div style={{ top: contextMenu.y, left: contextMenu.x }} className="context-menu fixed z-50 bg-white shadow-xl rounded-md border border-slate-200 py-1">
                    <ul className="text-sm text-slate-800">
                        {contextMenu.key && <li><button onClick={() => { executeAutoFitCol(contextMenu.key); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-slate-100">{t('views.products.contextMenu.autoFit')}</button></li>}
                        <li className="h-px bg-slate-200 my-1"></li>
                        <li><button onClick={() => { setFrozenUntilColKey(contextMenu.key); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-slate-100">{t('views.products.contextMenu.freezeColumn')}</button></li>
                        {frozenUntilColKey && <li><button onClick={() => { setFrozenUntilColKey(null); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-slate-100">{t('views.products.contextMenu.unfreezeColumns')}</button></li>}
                    </ul>
                </div>
            )}
        </div>
    );
};

// ... existing BlockView and CardView components ...

const BlockView: React.FC<ViewProps> = (props) => {
    // ... existing implementation ...
    const { 
        products, 
        setProductsForOptimisticUpdate: setProducts,
        costingSettings, 
        selectedProductIds, 
        handleSelectRow, 
        handleSelectAll,
        editingCell, handleCellDoubleClick, editValue, handleEditValueChange, closeEditorAndSave, cancelEdit, getStepForKey,
        updateProductsOrder,
        sortConfig, handleSort,
        priceFilter,
        hiddenBlockColumns, setHiddenBlockColumns,
        blockContextMenu, setBlockContextMenu,
        handlePriceReset,
    } = props;
    // ... existing logic ...
    const { t, i18n } = useTranslation();
    const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
    const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);

     const activeTiers = useMemo(() => {
        if (!costingSettings) return [
            { key: 'tier3' as const, name: 'Retail'}, 
            { key: 'tier2' as const, name: 'Distribution'}, 
            { key: 'tier1' as const, name: 'Wholesale'}
        ];
        return (['tier3', 'tier2', 'tier1'] as const).filter(
            tier => costingSettings.pricingTiers.metadata[tier]?.isActive
        ).map(tier => ({
            key: tier,
            name: costingSettings.pricingTiers.metadata[tier].name
        }));
    }, [costingSettings]);

    // ... existing handlers ...
    const handleRowDragStart = (e: React.DragEvent, productId: string) => {
        if(sortConfig.key === 'order') setDraggedRowId(productId);
    };

    const handleRowDragOver = (e: React.DragEvent, targetId: string) => {
        if(sortConfig.key === 'order') { e.preventDefault(); setDragOverRowId(targetId); }
    };

    const handleRowDrop = (e: React.DragEvent, targetId: string) => {
        if (sortConfig.key !== 'order' || !draggedRowId || draggedRowId === targetId) return;

        const draggedIndex = products.findIndex(p => p.id === draggedRowId);
        const targetIndex = products.findIndex(p => p.id === targetId);
        if (draggedIndex === -1 || targetIndex === -1) return;

        const reordered = [...products];
        const [draggedItem] = reordered.splice(draggedIndex, 1);
        reordered.splice(targetIndex, 0, draggedItem);
        
        const reorderedWithUpdatedOrder = reordered.map((p, index) => ({ ...p, order: index + 1 }));

        setProducts(reorderedWithUpdatedOrder);
        updateProductsOrder(reorderedWithUpdatedOrder);
    };

    const handleRowDragEnd = () => {
        setDraggedRowId(null);
        setDragOverRowId(null);
    };
    
    const handleHeaderContextMenu = (e: React.MouseEvent, key: string) => {
        e.preventDefault();
        setBlockContextMenu({ x: e.clientX, y: e.clientY, key });
    };

    const handleBodyContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setBlockContextMenu({ x: e.clientX, y: e.clientY });
    };
    
    // ... PriceCell and SingleValueCell implementations ...
    const PriceCell: React.FC<{ product: Product, priceKey: string, cost: number, isToman?: boolean }> = ({ product, priceKey, cost, isToman = false }) => {
        const [_, currency, tier] = priceKey.split('.') as ['sellingPrices', 'aed' | 'toman', 'tier1' | 'tier2' | 'tier3'];
        const overridePath = `pricingTiersOverrides.${currency}.${tier}`;
        const isOverridden = getNestedValue(product, overridePath) !== undefined;

        const price = getNestedValue(product, priceKey);
        const profit = price > 0 && cost > 0 ? price - cost : 0;
        
        const format = (value: number) => isToman ? formatToman(value, costingSettings) : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
        const isEditing = editingCell?.productId === product.id && editingCell?.columnKey === priceKey;

        const calculationMethod = costingSettings?.pricingTiers.calculationMethod || 'value'; // 'value' is markup
        let percentage = 0;
        if (calculationMethod === 'margin') {
            if (price > 0) percentage = (profit / price) * 100;
        } else { // markup
            if (cost > 0) percentage = (profit / cost) * 100;
        }
        const percentageText = `${percentage.toFixed(1)}%`;
        
        let percentageColorClass = 'text-green-600'; // Brighter green
        // The user wants conditional coloring ONLY for manually overridden prices.
        if (isOverridden) {
            const defaultPercentage = costingSettings?.pricingTiers[currency]?.[tier];
            if (typeof defaultPercentage === 'number') {
                const epsilon = 0.01; // for float comparison
                if (percentage < defaultPercentage - epsilon) {
                    percentageColorClass = 'text-red-600';
                } else if (percentage > defaultPercentage + epsilon) {
                    percentageColorClass = 'text-blue-600';
                }
            }
        }

        return (
             <td className={`p-0 border-x border-slate-300 align-middle transition-colors ${isOverridden ? 'bg-amber-50' : ''}`} onDoubleClick={() => handleCellDoubleClick(product, priceKey)}>
                {isEditing ? (
                     <NumericInput 
                        value={Number(editValue)} 
                        onChange={handleEditValueChange} 
                        onBlur={closeEditorAndSave} 
                        onKeyDown={(e) => { if (e.key === 'Enter') closeEditorAndSave(); if (e.key === 'Escape') cancelEdit(); }} 
                        autoFocus 
                        step={getStepForKey(priceKey)}
                        className="w-full h-full p-2 border-2 border-indigo-500 rounded-none focus:outline-none text-sm text-center"
                    />
                ) : (
                    <div className="relative group flex flex-col items-center justify-center h-full leading-tight py-1">
                        {isOverridden && (
                            <button onClick={(e) => { e.stopPropagation(); handlePriceReset(product.id, priceKey); }} className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-indigo-600 p-0.5 rounded-full flex-shrink-0" title={t('priceHistoryModal.resetPrice') as string}><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L9.414 11H13a1 1 0 100-2H9.414l1.293-1.293z" clipRule="evenodd" /></svg></button>
                        )}
                        <span className={`font-semibold ${percentageColorClass}`}>{percentageText}</span>
                        <span className="font-bold text-slate-900 text-base my-0.5">{format(price)}</span>
                        <span className="text-slate-800">{format(profit)}</span>
                    </div>
                )}
            </td>
        )
    };

    const SingleValueCell: React.FC<{product: Product, valueKey: string}> = ({ product, valueKey }) => {
        const value = getNestedValue(product, valueKey);
        const isEditing = editingCell?.productId === product.id && editingCell?.columnKey === valueKey;

        return (
            <td className="p-0 border-x border-slate-300 align-middle font-mono text-slate-800" onDoubleClick={() => handleCellDoubleClick(product, valueKey)}>
                 {isEditing ? (
                    <NumericInput 
                        value={Number(editValue)} 
                        onChange={handleEditValueChange} 
                        onBlur={closeEditorAndSave} 
                        onKeyDown={(e) => { if (e.key === 'Enter') closeEditorAndSave(); if (e.key === 'Escape') cancelEdit(); }} 
                        autoFocus 
                        step={getStepForKey(valueKey)}
                        className="w-full h-full p-2 border-2 border-indigo-500 rounded-none focus:outline-none text-sm text-center"
                    />
                ) : (
                    <div className="p-2 h-full flex items-center justify-center">{value ? (typeof value === 'number' ? (valueKey.includes('TOMAN') ? formatToman(value, costingSettings) : value.toFixed(2)) : value) : (valueKey.includes('TOMAN') ? '0' : '0.00')}</div>
                )}
            </td>
        );
    }
    
    // ... colGroups definition ...
    const colGroups = {
        purchase: { name: `${t('labels.purchasePrice')} (USD)`},
        landedAED: { name: `${t('labels.landedCost')} (AED)` },
        sellingAED: { name: t('views.products.columnGroups.aed') },
        totalIranCustomsCosts: { name: `${t('settings.costing.iranCustoms')} (${t('common.toman')})` },
        landedToman: { name: `${t('labels.landedCost')} (${t('common.toman')})` },
        sellingToman: { name: t('views.products.columnGroups.toman') }
    };
    
    const colSpanAED = activeTiers.length;
    const colSpanToman = activeTiers.length;

    return (
        <div className="flex-1 overflow-auto border border-slate-300 rounded-lg bg-white relative">
             <table className="min-w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="text-center text-[10px] font-bold text-slate-600">
                        <th rowSpan={2} className="p-1 border border-slate-300 w-10">
                            <input 
                                type="checkbox" 
                                checked={selectedProductIds.size > 0 && selectedProductIds.size === products.length} 
                                ref={el => { if (el) el.indeterminate = selectedProductIds.size > 0 && selectedProductIds.size < products.length }} 
                                onChange={handleSelectAll} 
                                className="h-4 w-4 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500"
                            />
                        </th>
                        <th rowSpan={2} className="p-1 border border-slate-300 w-32 font-bold text-slate-900">{t('orderFormModal.table.itemCode')}</th>
                        <th rowSpan={2} className="p-1 border border-slate-300 min-w-[200px] text-left font-bold text-slate-900">{t('orderModal.table.productName')}</th>
                        {!hiddenBlockColumns.has('purchase') && <th rowSpan={2} className="p-1 border border-slate-300 w-28 cursor-pointer font-bold text-slate-900" onContextMenu={e => handleHeaderContextMenu(e, 'purchase')}>{t('labels.purchasePrice')} (USD)</th>}
                        {(priceFilter === 'all' || priceFilter === 'aed') && !hiddenBlockColumns.has('landedAED') && <th rowSpan={2} className="p-1 border border-slate-300 w-28 cursor-pointer font-bold text-slate-900" onContextMenu={e => handleHeaderContextMenu(e, 'landedAED')}>{t('labels.landedCost')} (AED)</th>}
                        {(priceFilter === 'all' || priceFilter === 'aed') && !hiddenBlockColumns.has('sellingAED') && colSpanAED > 0 && <th colSpan={colSpanAED} className="p-1 border border-slate-300 cursor-pointer" onContextMenu={e => handleHeaderContextMenu(e, 'sellingAED')}>{t('views.products.columnGroups.aed')}</th>}
                        {(priceFilter === 'all' || priceFilter === 'toman') && !hiddenBlockColumns.has('totalIranCustomsCosts') && <th rowSpan={2} className="p-1 border border-slate-300 w-28 cursor-pointer font-bold text-slate-900" onContextMenu={e => handleHeaderContextMenu(e, 'totalIranCustomsCosts')}>{t('settings.costing.iranCustoms')} ({t('common.toman')})</th>}
                        {(priceFilter === 'all' || priceFilter === 'toman') && !hiddenBlockColumns.has('landedToman') && <th rowSpan={2} className="p-1 border border-slate-300 w-28 cursor-pointer font-bold text-slate-900" onContextMenu={e => handleHeaderContextMenu(e, 'landedToman')}>{t('labels.landedCost')} ({t('common.toman')})</th>}
                        {(priceFilter === 'all' || priceFilter === 'toman') && !hiddenBlockColumns.has('sellingToman') && colSpanToman > 0 && <th colSpan={colSpanToman} className="p-1 border border-slate-300 cursor-pointer" onContextMenu={e => handleHeaderContextMenu(e, 'sellingToman')}>{t('views.products.columnGroups.toman')}</th>}
                    </tr>
                    <tr className="text-center text-[10px] uppercase font-bold text-slate-600">
                        {(priceFilter === 'all' || priceFilter === 'aed') && !hiddenBlockColumns.has('sellingAED') && activeTiers.map(tier => (
                            <th key={tier.key} className="p-1 border border-slate-300 w-28">{tier.name}</th>
                        ))}
                        {(priceFilter === 'all' || priceFilter === 'toman') && !hiddenBlockColumns.has('sellingToman') && activeTiers.map(tier => (
                           <th key={tier.key} className="p-1 border border-slate-300 w-28">{tier.name}</th>
                        ))}
                    </tr>
                </thead>
                <tbody onDragLeave={() => setDragOverRowId(null)} onContextMenu={handleBodyContextMenu}>
                    {products.map(p => (
                        <tr key={p.id} 
                            draggable={sortConfig.key === 'order'}
                            onDragStart={(e) => handleRowDragStart(e, p.id)}
                            onDragOver={(e) => handleRowDragOver(e, p.id)}
                            onDrop={(e) => handleRowDrop(e, p.id)}
                            onDragEnd={handleRowDragEnd}
                            className={`border-b border-slate-200 text-center relative ${selectedProductIds.has(p.id) ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'} ${sortConfig.key === 'order' ? 'cursor-grab' : ''} ${draggedRowId === p.id ? 'opacity-50' : ''}`}
                        >
                            {dragOverRowId === p.id && <div className="absolute top-0 left-0 w-full h-0.5 bg-indigo-500 z-30"/>}
                            <td className="p-1 border-x border-slate-300">
                                <input type="checkbox" checked={selectedProductIds.has(p.id)} onChange={() => handleSelectRow(p.id)} className="h-4 w-4 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500" />
                            </td>
                            <td className="p-1 border-x border-slate-300 font-mono text-slate-800">{p.internalCode}</td>
                            <td className={`p-2 border-x border-slate-300 ${i18n.language === 'fa' ? 'text-right' : 'text-left'} text-slate-800`}>{i18n.language === 'fa' && p.productNameFa ? p.productNameFa : p.description}</td>
                            {!hiddenBlockColumns.has('purchase') && <SingleValueCell product={p} valueKey="purchasePriceUSD" />}
                            {(priceFilter === 'all' || priceFilter === 'aed') && !hiddenBlockColumns.has('landedAED') && <SingleValueCell product={p} valueKey="landedCostAED" />}
                            {(priceFilter === 'all' || priceFilter === 'aed') && !hiddenBlockColumns.has('sellingAED') && activeTiers.map(tier => (
                                <PriceCell key={tier.key} product={p} priceKey={`sellingPrices.aed.${tier.key}`} cost={p.landedCostAED} />
                            ))}
                            {(priceFilter === 'all' || priceFilter === 'toman') && !hiddenBlockColumns.has('totalIranCustomsCosts') && <SingleValueCell product={p} valueKey="totalIranCustomsCosts" />}
                            {(priceFilter === 'all' || priceFilter === 'toman') && !hiddenBlockColumns.has('landedToman') &&
                                <td className="p-1 border-x border-slate-300 font-mono text-slate-800" onDoubleClick={() => handleCellDoubleClick(p, 'landedCostTOMAN')}>
                                    {editingCell?.productId === p.id && editingCell?.columnKey === 'landedCostTOMAN' ? (
                                        <NumericInput value={Number(editValue)} onChange={handleEditValueChange} onBlur={closeEditorAndSave} onKeyDown={(e) => { if (e.key === 'Enter') closeEditorAndSave(); if (e.key === 'Escape') cancelEdit(); }} autoFocus step={1000} className="w-full h-full p-2 border-2 border-indigo-500 rounded-none focus:outline-none text-sm text-center" />
                                    ) : (
                                        <div className="p-2 h-full flex items-center justify-center">{formatToman(p.landedCostTOMAN, costingSettings)}</div>
                                    )}
                                </td>
                            }
                            {(priceFilter === 'all' || priceFilter === 'toman') && !hiddenBlockColumns.has('sellingToman') && activeTiers.map(tier => (
                                <PriceCell key={tier.key} product={p} priceKey={`sellingPrices.toman.${tier.key}`} cost={p.landedCostTOMAN} isToman />
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
             {blockContextMenu && (
                <div style={{ top: blockContextMenu.y, left: blockContextMenu.x }} className="block-context-menu fixed z-50 bg-white shadow-xl rounded-md border border-slate-200 py-1">
                    <ul className="text-sm text-slate-800">
                        {blockContextMenu.key && <li><button onClick={() => { setHiddenBlockColumns(prev => new Set(prev).add(blockContextMenu.key!)); setBlockContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-slate-100">{t('views.products.contextMenu.hideGroup', { groupName: colGroups[blockContextMenu.key as keyof typeof colGroups]?.name || '' })}</button></li>}
                        <li><button onClick={() => { setHiddenBlockColumns(new Set()); setBlockContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-slate-100">{t('views.products.contextMenu.showAllGroups')}</button></li>
                    </ul>
                </div>
            )}
        </div>
    );
};

const CardView: React.FC<ViewProps> = (props) => {
    // ... existing implementation ...
    const { 
        products, 
        setProductsForOptimisticUpdate: setProducts,
        selectedProductIds, 
        handleSelectRow, 
        updateProductsOrder,
        sortConfig
    } = props;
    
    const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
    const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);

    const handleRowDragStart = (e: React.DragEvent, productId: string) => {
        if(sortConfig.key === 'order') setDraggedRowId(productId);
    };

    const handleRowDragOver = (e: React.DragEvent, targetId: string) => {
        if(sortConfig.key === 'order') { e.preventDefault(); setDragOverRowId(targetId); }
    };

    const handleRowDrop = (e: React.DragEvent, targetId: string) => {
        if (sortConfig.key !== 'order' || !draggedRowId || draggedRowId === targetId) return;

        const draggedIndex = products.findIndex(p => p.id === draggedRowId);
        const targetIndex = products.findIndex(p => p.id === targetId);
        if (draggedIndex === -1 || targetIndex === -1) return;

        const reordered = [...products];
        const [draggedItem] = reordered.splice(draggedIndex, 1);
        reordered.splice(targetIndex, 0, draggedItem);
        
        const reorderedWithUpdatedOrder = reordered.map((p, index) => ({ ...p, order: index + 1 }));

        setProducts(reorderedWithUpdatedOrder);
        updateProductsOrder(reorderedWithUpdatedOrder);
    };

    const handleRowDragEnd = () => {
        setDraggedRowId(null);
        setDragOverRowId(null);
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 h-full">
             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {products.map(p => (
                    <div 
                        key={p.id}
                        draggable={sortConfig.key === 'order'}
                        onDragStart={(e) => handleRowDragStart(e, p.id)}
                        onDragOver={(e) => handleRowDragOver(e, p.id)}
                        onDrop={(e) => handleRowDrop(e, p.id)}
                        onDragEnd={handleRowDragEnd}
                        className={`relative group transition-opacity ${draggedRowId === p.id ? 'opacity-50' : ''}`}
                    >
                        {/* Selection Checkbox Overlay */}
                        <div className="absolute top-2 left-2 z-20">
                             <input 
                                type="checkbox" 
                                checked={selectedProductIds.has(p.id)} 
                                onChange={() => handleSelectRow(p.id)} 
                                className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shadow-md cursor-pointer"
                            />
                        </div>
                        
                        {/* Drag Indicator Overlay */}
                        {dragOverRowId === p.id && (
                            <div className="absolute inset-0 border-2 border-indigo-500 rounded-lg z-30 pointer-events-none bg-indigo-50/20" />
                        )}

                        <ProductCard product={p} {...props} />
                    </div>
                ))}
            </div>
        </div>
    );
};

// ... ProductCard component remains mostly same, just check for prop changes ...
interface ProductCardProps extends ViewProps {
    product: Product & { totalIranCustomsCosts?: number };
}

const ProductCard: React.FC<ProductCardProps> = (props) => {
    // ... existing implementation ...
     const { 
        product, 
        costingSettings,
        productCardSettings,
        expandedCardIds,
        toggleCardExpansion,
        onEdit, 
        setHistoryModal, 
        setAttributesModal,
        onOpenBrochureWizard,
        onOpenAnalysisModal,
        formatValue,
        priceFilter
    } = props;
    const { t, i18n } = useTranslation();
    const isExpanded = expandedCardIds.has(product.id);
    const tomanUnitLabel = getTomanUnitLabel(costingSettings);

     const activeTiers = useMemo(() => {
        if (!costingSettings) return [
            { key: 'tier3' as const, name: 'Retail' },
            { key: 'tier2' as const, name: 'Distribution' },
            { key: 'tier1' as const, name: 'Wholesale' },
        ];
        return (['tier3', 'tier2', 'tier1'] as const)
            .filter(tier => costingSettings.pricingTiers.metadata[tier]?.isActive)
            .map(tier => ({
                key: tier,
                name: costingSettings.pricingTiers.metadata[tier].name
            }));
    }, [costingSettings]);

    const InfoRow: React.FC<{ label: string; value: string | number; mono?: boolean }> = ({ label, value, mono }) => (
        <div className="flex justify-between text-xs">
            <span className="text-slate-500">{label}</span>
            <span className={`font-semibold text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</span>
        </div>
    );

    const PriceTier: React.FC<{ tier: string; aed: number; toman: number; showAed: boolean; showToman: boolean }> = ({ tier, aed, toman, showAed, showToman }) => (
        <div className="flex justify-between text-xs">
            <span className="text-slate-500">{tier}</span>
            <div className="flex gap-x-3 font-mono font-semibold">
                {showAed && <span className="text-slate-700 w-16 text-right">{formatValue(aed, 'sellingPrices.aed.tier1')} AED</span>}
                {showToman && <span className="text-slate-700 w-20 text-right">{formatValue(toman, 'sellingPrices.toman.tier1')} {t('common.toman')}{tomanUnitLabel}</span>}
            </div>
        </div>
    );

    const primaryImage = product.images?.[0]?.data;

    return (
        <div className="bg-white rounded-lg shadow-md border border-slate-200 flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
            <div className="relative aspect-square bg-slate-100">
                {primaryImage ? (
                    <img src={primaryImage} alt={product.description} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                )}
            </div>
            <div className="p-3 flex-1 flex flex-col">
                <p className="font-bold text-slate-800 text-sm leading-tight flex-1">{i18n.language === 'fa' && product.productNameFa ? product.productNameFa : product.description}</p>
                <p className="text-xs text-slate-500 font-mono mt-1">{product.internalCode}</p>

                <div className="mt-3 space-y-1">
                    {productCardSettings.showLandedCost && (
                         <div className="flex justify-between items-center text-xs py-1 border-t border-b border-slate-200">
                            <span className="text-slate-500 font-semibold">{t('labels.landedCost')}</span>
                            <div className="flex gap-x-3 font-mono font-semibold">
                                {(priceFilter === 'all' || priceFilter === 'aed') && <span className="text-emerald-600">{formatValue(product.landedCostAED, 'landedCostAED')} AED</span>}
                                {(priceFilter === 'all' || priceFilter === 'toman') && <span className="text-emerald-600">{formatValue(product.landedCostTOMAN, 'landedCostTOMAN')} {t('common.toman')}{tomanUnitLabel}</span>}
                            </div>
                        </div>
                    )}
                    {(productCardSettings.showAedPricing || productCardSettings.showTomanPricing) && activeTiers.map(tier => (
                        <PriceTier
                            key={tier.key}
                            tier={tier.name}
                            aed={product.sellingPrices.aed[tier.key]}
                            toman={product.sellingPrices.toman[tier.key]}
                            showAed={productCardSettings.showAedPricing && (priceFilter === 'all' || priceFilter === 'aed')}
                            showToman={productCardSettings.showTomanPricing && (priceFilter === 'all' || priceFilter === 'toman')}
                        />
                    ))}
                </div>
            </div>
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-96' : 'max-h-0'}`}>
                <div className="p-3 border-t border-slate-200 space-y-2">
                    {productCardSettings.showPhysicalSpecs && (
                        <div>
                            <h4 className="font-semibold text-xs text-slate-600 mb-1">{t('labels.physicalSpecs')}</h4>
                            <div className="space-y-0.5">
                                <InfoRow label={t('views.products.table.itemsPerCarton')} value={product.itemsPerCarton} mono />
                                <InfoRow label={t('views.products.table.grossWeight')} value={`${product.grossWeight || 0} kg`} mono />
                                <InfoRow label={t('views.products.table.cartonCBM')} value={`${product.cartonCBM || 0} m³`} mono />
                            </div>
                        </div>
                    )}
                     {productCardSettings.showCostBreakdown && (
                        <div>
                            <h4 className="font-semibold text-xs text-slate-600 mb-1">{t('labels.costBreakdown')}</h4>
                            <div className="space-y-0.5">
                                <InfoRow label={t('labels.purchasePrice')} value={`${formatValue(product.purchasePriceUSD, 'purchasePriceUSD')} USD`} mono />
                                <InfoRow label={t('labels.shipStageCosts')} value={`${formatValue(product.shipStageCostsUSD, 'shipStageCostsUSD')} USD`} mono />
                                <InfoRow label={t('labels.dubaiStageCosts')} value={`${formatValue(product.dubaiStageCostsAED, 'dubaiStageCostsAED')} AED`} mono />
                                <InfoRow label={t('labels.iranStageCosts')} value={`${formatValue(product.iranStageCostsTOMAN, 'iranStageCostsTOMAN')} ${t('common.toman')}${tomanUnitLabel}`} mono />
                                <InfoRow label={t('settings.costing.iranCustoms')} value={`${formatValue(product.totalIranCustomsCosts, 'totalIranCustomsCosts')} ${t('common.toman')}${tomanUnitLabel}`} mono />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-slate-50/70 p-1.5 flex justify-between items-center text-xs text-slate-500 border-t border-slate-200">
                 <button onClick={() => toggleCardExpansion(product.id)} className="font-semibold p-1.5 rounded hover:bg-slate-200 flex items-center gap-x-1">
                    {isExpanded ? t('common.collapse') : t('common.expand')}
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
                 <div className="flex items-center">
                    <button onClick={() => onEdit(product)} className="p-1.5 rounded hover:bg-slate-200" title={t('buttons.edit') as string}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                    </button>
                    <button onClick={() => onOpenAnalysisModal(product)} className="p-1.5 rounded hover:bg-slate-200" title="Cost Analysis">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" /><path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" /></svg>
                    </button>
                    <button onClick={() => setAttributesModal({ isOpen: true, product })} className="p-1.5 rounded hover:bg-slate-200" title={t('views.products.attributes') as string}>
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                    </button>
                     <button onClick={() => setHistoryModal({ isOpen: true, product })} className="p-1.5 rounded hover:bg-slate-200" title={t('common.history') as string}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                    </button>
                     <button onClick={() => onOpenBrochureWizard(product)} className="p-1.5 rounded hover:bg-slate-200" title="Brochure">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

// ... ColumnSelector and PrintExportModal components ...
const ColumnSelector: React.FC<{
    isOpen: boolean;
    allColumns: Record<string, string>;
    visibleColumns: Record<string, boolean>;
    setVisibleColumns: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}> = ({ isOpen, allColumns, visibleColumns, setVisibleColumns }) => {
    // ... same as before
    const { t } = useTranslation();
    if (!isOpen) return null;

    const handleToggle = (key: string) => {
        setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
    };
    
    const handleSelectAll = (select: boolean) => {
        const newVisible: Record<string, boolean> = {};
        Object.keys(allColumns).forEach(key => {
            newVisible[key] = select;
        });
        setVisibleColumns(newVisible);
    };

    return (
        <div className="absolute top-full end-0 mt-2 w-72 bg-white rounded-md shadow-lg border border-slate-200 z-40">
            <div className="p-2 border-b flex justify-between">
                <button onClick={() => handleSelectAll(true)} className="text-xs font-semibold text-indigo-600">{t('columnSelector.selectAll')}</button>
                <button onClick={() => handleSelectAll(false)} className="text-xs font-semibold text-indigo-600">Deselect All</button>
            </div>
            <ul className="p-2 max-h-80 overflow-y-auto">
                {Object.entries(allColumns).map(([key, label]) => (
                    <li key={key}>
                        <label className="flex items-center gap-x-2 p-1.5 rounded hover:bg-slate-100 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!visibleColumns[key]}
                                onChange={() => handleToggle(key)}
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">{label}</span>
                        </label>
                    </li>
                ))}
            </ul>
        </div>
    );
};

interface PrintExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (options: { columns: string[], title: string, notes: string }) => void;
    onPrint: (options: { columns: string[], title: string, notes: string }) => void;
    allColumns: Record<string, string>;
    columnOrder: string[];
    selectedColumns: Set<string>;
    setSelectedColumns: React.Dispatch<React.SetStateAction<Set<string>>>;
    selectedRowCount: number;
    totalRowCount: number;
}
const PrintExportModal: React.FC<PrintExportModalProps> = ({ isOpen, onClose, onExport, onPrint, allColumns, columnOrder, selectedColumns, setSelectedColumns, selectedRowCount, totalRowCount }) => {
    // ... same as before
    const { t, i18n } = useTranslation();
    const [exportScope, setExportScope] = useState<'selected' | 'all'>('all');
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [printableColumns, setPrintableColumns] = useState<{ key: string; label: string }[]>([]);
    const [draggedItemKey, setDraggedItemKey] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setExportScope(selectedRowCount > 0 ? 'selected' : 'all');
            setTitle(`${t('views.products.printPriceList')} - ${formatDisplayDate(new Date().toISOString().split('T')[0], i18n.language)}`);
            setNotes('');
            
            const initialPrintable = columnOrder.map(key => ({ key, label: allColumns[key] }));
            setPrintableColumns(initialPrintable);
        }
    }, [isOpen, selectedRowCount, t, i18n.language, columnOrder, allColumns]);

    const handleToggleColumn = (key: string) => {
        setSelectedColumns(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };
    
    const handleToggleAll = (select: boolean) => {
        setSelectedColumns(select ? new Set(printableColumns.map(c => c.key)) : new Set());
    };

    const handleDragStart = (key: string) => setDraggedItemKey(key);
    const handleDragOver = (e: React.DragEvent) => e.preventDefault();
    const handleDrop = (targetKey: string) => {
        if (!draggedItemKey || draggedItemKey === targetKey) {
            setDraggedItemKey(null);
            return;
        }
        const newColumns = [...printableColumns];
        const draggedIndex = newColumns.findIndex(c => c.key === draggedItemKey);
        const targetIndex = newColumns.findIndex(c => c.key === targetKey);

        if (draggedIndex > -1 && targetIndex > -1) {
            const [draggedItem] = newColumns.splice(draggedIndex, 1);
            newColumns.splice(targetIndex, 0, draggedItem);
            setPrintableColumns(newColumns);
        }
        setDraggedItemKey(null);
    };

    const getFinalColumns = () => {
        return printableColumns
            .map(col => col.key)
            .filter(key => selectedColumns.has(key) && key !== 'actions');
    };

    const handleExportClick = () => onExport({ columns: getFinalColumns(), title, notes });
    const handlePrintClick = () => onPrint({ columns: getFinalColumns(), title, notes });

    if (!isOpen) return null;
    const rowCount = exportScope === 'selected' ? selectedRowCount : totalRowCount;
    
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-gray-800">{t('views.products.printOptions.title')}</h2>
                </header>
                <main className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-6">
                    <div>
                        <h3 className="font-semibold text-slate-800 mb-2">Columns to Include (Drag to Reorder)</h3>
                        <div className="border rounded-md p-2 max-h-64 overflow-y-auto space-y-1">
                            <div className="flex justify-between items-center mb-1">
                               <button onClick={() => handleToggleAll(true)} className="text-xs font-semibold text-indigo-600">{t('columnSelector.selectAll')}</button>
                               <button onClick={() => handleToggleAll(false)} className="text-xs font-semibold text-indigo-600">Deselect All</button>
                            </div>
                            {printableColumns.filter(c => c.key !== 'actions').map(({ key, label }) => (
                                <label
                                    key={key}
                                    draggable
                                    onDragStart={() => handleDragStart(key)}
                                    onDragOver={handleDragOver}
                                    onDrop={() => handleDrop(key)}
                                    onDragEnd={() => setDraggedItemKey(null)}
                                    className={`flex items-center gap-x-2 p-1.5 rounded hover:bg-slate-200 cursor-grab ${draggedItemKey === key ? 'opacity-50 ring-2 ring-indigo-400' : ''}`}
                                >
                                    <input type="checkbox" checked={selectedColumns.has(key)} onChange={() => handleToggleColumn(key)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"/>
                                    <span className="text-sm text-slate-700">{label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h3 className="font-semibold text-slate-800 mb-2">Export Scope</h3>
                        <div className="flex items-center gap-x-4">
                           <label className="flex items-center gap-x-2"><input type="radio" name="scope" value="all" checked={exportScope === 'all'} onChange={() => setExportScope('all')} /><span>{t('exportModal.exportingAll', { count: totalRowCount })}</span></label>
                           <label className="flex items-center gap-x-2"><input type="radio" name="scope" value="selected" checked={exportScope === 'selected'} onChange={() => setExportScope('selected')} disabled={selectedRowCount === 0} /><span>{t('exportModal.exportingSelected', { count: selectedRowCount })}</span></label>
                        </div>

                        <h3 className="font-semibold text-slate-800 mb-2 pt-4 border-t">Document Options</h3>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/>
                        </div>
                    </div>
                </main>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3">
                    <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                    <button type="button" onClick={handlePrintClick} disabled={rowCount === 0} className="bg-white border border-indigo-600 text-indigo-600 px-4 py-2 rounded-md hover:bg-indigo-50">{t('buttons.print')}</button>
                    <button type="button" onClick={handleExportClick} disabled={rowCount === 0} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('buttons.exportToExcel')}</button>
                </footer>
            </div>
        </div>
    );
};


// +++ MAIN COMPONENT +++
interface ProductsViewProps { 
    costingSettings: CostingSettings | null; 
    onOpenBrochureWizard: (product: Product) => void;
    aiSettings?: AISettings;
}

interface CategoryModalState {
    isOpen: boolean;
    level: CategoryLevel;
    parentId: string | null;
    itemToEdit: MainGroup | Category | SubCategory | Brand | null;
    onSaveSuccess: (newItemId: string) => void;
}

export const ProductsView: React.FC<ProductsViewProps> = ({ costingSettings, onOpenBrochureWizard, aiSettings }) => {
    const { t, i18n } = useTranslation();
    const { products: baseProducts, updateProduct, deleteProducts, addProduct, updateProductsOrder, reindexActiveProducts } = useDbProducts();
    const { addToast, showConfirmation } = useModals();
    const { settings } = useSettings();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const columnSelectorRef = useRef<HTMLDivElement>(null);
    const columnSelectorButtonRef = useRef<HTMLButtonElement>(null);
    const textMeasureRef = useRef<HTMLSpanElement | null>(null);
    const debounceTimerRef = useRef<number | null>(null);
    
    // --- State Management ---
    const [sectionMode, setSectionMode] = useState<ProductSectionMode>('pricing_engine');
    const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('productsViewMode') as ViewMode) || 'row');
    const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({ mainGroupId: '', categoryId: '', subCategoryId: '', brandId: '' });
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false);
    const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
    const [editingCell, setEditingCell] = useState<{ productId: string; columnKey: string } | null>(null);
    const [editValue, setEditValue] = useState<string | number>('');
    const [isImporting, setIsImporting] = useState(false);
    const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; product: Product | null }>({ isOpen: false, product: null });
    const [attributesModal, setAttributesModal] = useState<{ isOpen: boolean; product: Product | null }>({ isOpen: false, product: null });
    const [analysisModal, setAnalysisModal] = useState<{ isOpen: boolean; product: Product | null }>({ isOpen: false, product: null });
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
        try {
            const saved = localStorage.getItem('productsColumnWidths');
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });
    const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: 'order', direction: 'asc' });
    const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());
    const [isProductFormOpen, setIsProductFormOpen] = useState(false);
    const [productToEdit, setProductToEdit] = useState<Product | null>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSearchVisible, setIsSearchVisible] = useState(false);
    const [hiddenBlockColumns, setHiddenBlockColumns] = useState<Set<string>>(() => {
        try { const saved = localStorage.getItem('views.products.hiddenBlockColumns'); return saved ? new Set(JSON.parse(saved)) : new Set(); } catch { return new Set(); }
    });
    const [blockContextMenu, setBlockContextMenu] = useState<{ x: number; y: number; key?: string; } | null>(null);
    const [isMediaUpdaterOpen, setIsMediaUpdaterOpen] = useState(false);
    // AI Categorization State
    const [isCategorizing, setIsCategorizing] = useState(false);
    const [categorizationProgress, setCategorizationProgress] = useState({ current: 0, total: 0 });
    const [isAiCategorizationModalOpen, setIsAiCategorizationModalOpen] = useState(false);
    const [categoryModalState, setCategoryModalState] = useState<CategoryModalState | null>(null);

    const companyInfo = useMemo(() => settings.find(s => s.key === 'companyInfo')?.value, [settings]);
    const companyLogo = useMemo(() => settings.find(s => s.key === 'companyLogo')?.value, [settings]);

    const textEditableColumns = useMemo(() => new Set(['description', 'productNameFa', 'internalCode', 'oldSystemCode', 'supplierCode', 'hsCode']), []);
    const categoryEditableColumns = useMemo(() => new Set(['mainGroupId', 'categoryId', 'subCategoryId', 'brandId']), []);
    const editableColumns = useMemo(() => new Set([
        ...textEditableColumns,
        ...categoryEditableColumns,
        'purchasePriceUSD', 'shipStageCostsUSD', 'dubaiStageCostsAED', 'iranStageCostsTOMAN', 
        'itemsPerCarton', 'netWeight', 'grossWeight', 'cartonCBM', 'customsValue', 'customsValueBasis', 'landedCostTOMAN',
        'sellingPrices.aed.tier1', 'sellingPrices.aed.tier2', 'sellingPrices.aed.tier3', 
        'sellingPrices.toman.tier1', 'sellingPrices.toman.tier2', 'sellingPrices.toman.tier3'
    ]), [textEditableColumns, categoryEditableColumns]);

    const addPriceHistoryIfNeeded = useCallback(async (product: Product) => {
        const todayStr = new Date().toISOString().split('T')[0];
        
        const todaysHistoryCount = await db.priceHistory
            .where({ productId: product.id })
            .filter(history => history.timestamp.startsWith(todayStr))
            .count();

        if (todaysHistoryCount === 0) {
            await db.priceHistory.add({
                productId: product.id,
                timestamp: new Date().toISOString(),
                oldPrices: product.sellingPrices,
                oldLandedCostAED: product.landedCostAED,
                oldLandedCostTOMAN: product.landedCostTOMAN,
            });
        }
    }, []);

    const debouncedUpdateProductsOrder = useCallback((orderedProducts: Product[]) => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = window.setTimeout(() => {
            updateProductsOrder(orderedProducts);
        }, 750);
    }, [updateProductsOrder]);

    useEffect(() => { localStorage.setItem('views.products.hiddenBlockColumns', JSON.stringify(Array.from(hiddenBlockColumns))); }, [hiddenBlockColumns]);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (blockContextMenu && !(event.target as HTMLElement).closest('.block-context-menu')) setBlockContextMenu(null); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [blockContextMenu]);
    
    useEffect(() => {
        if (baseProducts) {
            if (costingSettings) {
                const updatedProducts = baseProducts.map(p => {
                    const recalculated = recalculateProductPrices(p, costingSettings);
                    const totalIranCustomsCosts = Object.values(recalculated.iranCustomsCosts || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
                    return { ...recalculated, totalIranCustomsCosts };
                });
                setProducts(updatedProducts);
            } else {
                setProducts(baseProducts);
            }
        }
    }, [baseProducts, costingSettings]);
    
    useEffect(() => { localStorage.setItem('productsColumnWidths', JSON.stringify(columnWidths)); }, [columnWidths]);
    
    useEffect(() => {
        if (attributesModal.isOpen && attributesModal.product) {
            const updatedProductInList = baseProducts.find(p => p.id === attributesModal.product!.id);
            if (updatedProductInList && updatedProductInList !== attributesModal.product) {
                setAttributesModal(prev => ({ ...prev, product: updatedProductInList }));
            }
        }
    }, [baseProducts, attributesModal.isOpen, attributesModal.product]);
    
    const displaySettingsData = useLiveQuery(() => db.settings.get('displaySettings'), []);
    const mainGroups = useLiveQuery(() => db.mainGroups.orderBy('name').toArray(), []) || [];
    const categories = useLiveQuery(() => db.categories.toArray(), []) || [];
    const subCategories = useLiveQuery(() => db.subCategories.toArray(), []) || [];
    const brands = useLiveQuery(() => db.brands.toArray(), []) || [];
    
    const categoryMaps = useMemo(() => ({
        mainGroups: new Map(mainGroups.map(i => [i.id, i])),
        categories: new Map(categories.map(i => [i.id, i])),
        subCategories: new Map(subCategories.map(i => [i.id, i])),
        brands: new Map(brands.map(i => [i.id, i])),
    }), [mainGroups, categories, subCategories, brands]);

    const productCardSettings: ProductCardDisplaySettings = useMemo(() => {
        const defaults: ProductCardDisplaySettings = { showAedPricing: true, showTomanPricing: true, showLandedCost: true, showPhysicalSpecs: true, showCostBreakdown: true };
        return displaySettingsData?.value?.productCard || defaults;
    }, [displaySettingsData]);

    const tomanUnitLabel = getTomanUnitLabel(costingSettings);

    const allColumns = useMemo(() => ({
        'order': t('views.products.table.order'),
        'internalCode': t('orderFormModal.table.itemCode'),
        'supplierCode': t('views.dashboard.table.supplierCode'),
        'oldSystemCode': t('views.products.table.oldSystemCode'),
        'description': t('orderModal.table.productName'),
        'productNameFa': t('orderFormModal.table.productNameFa'),
        'mainGroupId': t('views.products.table.mainGroup'),
        'categoryId': t('views.products.table.category'),
        'subCategoryId': t('views.products.table.subCategory'),
        'brandId': t('views.products.table.brand'),
        'attributes': t('views.products.attributes'),
        'itemsPerCarton': t('views.products.table.itemsPerCarton'),
        'netWeight': t('views.products.table.netWeight'),
        'grossWeight': t('views.products.table.grossWeight'),
        'cartonCBM': t('views.products.table.cartonCBM'),
        'hsCode': t('orderModal.table.hsCode'),
        'customsValue': t('orderFormModal.table.customsValue'),
        'customsValueBasis': t('orderFormModal.table.customsValueBasis'),
        'purchasePriceInSourceCurrency': t('views.products.table.purchasePriceSource'),
        'sourceCurrency': t('views.products.table.sourceCurrency'),
        'purchasePriceUSD': `${t('labels.purchasePrice')} (USD)`,
        'shipStageCostsUSD': `${t('labels.shipStageCosts')} (USD)`,
        'dubaiStageCostsAED': `${t('labels.dubaiStageCosts')} (AED)`,
        'iranStageCostsTOMAN': `${t('labels.iranStageCosts')} (${t('common.toman')}${tomanUnitLabel})`,
        'landedCostAED': t('views.products.table.landedAed'),
        'totalIranCustomsCosts': `${t('settings.costing.iranCustoms')} (${t('common.toman')}${tomanUnitLabel})`,
        'landedCostTOMAN': `${t('labels.landedCost')} (${t('common.toman')}${tomanUnitLabel})`,
        'sellingPrices.aed.tier1': `AED ${costingSettings?.pricingTiers.metadata.tier1.name || 'T1'}`,
        'sellingPrices.aed.tier2': `AED ${costingSettings?.pricingTiers.metadata.tier2.name || 'T2'}`,
        'sellingPrices.aed.tier3': `AED ${costingSettings?.pricingTiers.metadata.tier3.name || 'T3'}`,
        'sellingPrices.toman.tier1': `${t('common.toman')} ${costingSettings?.pricingTiers.metadata.tier1.name || 'T1'}${tomanUnitLabel}`,
        'sellingPrices.toman.tier2': `${t('common.toman')} ${costingSettings?.pricingTiers.metadata.tier2.name || 'T2'}${tomanUnitLabel}`,
        'sellingPrices.toman.tier3': `${t('common.toman')} ${costingSettings?.pricingTiers.metadata.tier3.name || 'T3'}${tomanUnitLabel}`,
        'createdAt': t('views.products.table.createdAt'),
        'actions': t('common.actions'),
    }), [t, tomanUnitLabel, costingSettings]);

    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
        const saved = localStorage.getItem('productsVisibleColumns');
        if (saved) try { return JSON.parse(saved); } catch (e) {}
        const defaults: Record<string, boolean> = { 'order': true, 'internalCode': true, 'description': true, 'mainGroupId': true, 'purchasePriceUSD': true, 'landedCostAED': true, 'totalIranCustomsCosts': true, 'landedCostTOMAN': true, 'sellingPrices.aed.tier1': true, 'sellingPrices.toman.tier1': true, 'actions': true };
        Object.keys(allColumns).forEach(key => { if (!(key in defaults)) defaults[key] = false; });
        return defaults;
    });
    useEffect(() => { localStorage.setItem('productsVisibleColumns', JSON.stringify(visibleColumns)); }, [visibleColumns]);

    const [printExportColumns, setPrintExportColumns] = useState<Set<string>>(() => {
        const saved = localStorage.getItem('productsPrintExportColumns');
        if (saved) try { return new Set(JSON.parse(saved)); } catch (e) {}
        return new Set(Object.keys(visibleColumns).filter(key => visibleColumns[key]));
    });

    useEffect(() => {
        localStorage.setItem('productsPrintExportColumns', JSON.stringify(Array.from(printExportColumns)));
    }, [printExportColumns]);

    const [columnOrder, setColumnOrder] = useState<string[]>(() => {
        const savedOrder = localStorage.getItem('productsColumnOrder');
        if (savedOrder) {
            try {
                const parsedOrder = JSON.parse(savedOrder);
                const allKeys = new Set(Object.keys(allColumns));
                const filteredOrder = parsedOrder.filter((key: string) => allKeys.has(key));
                const currentKeys = new Set(filteredOrder);
                const newKeys = Object.keys(allColumns).filter(key => !currentKeys.has(key));
                return [...filteredOrder, ...newKeys];
            } catch (e) {}
        }
        return Object.keys(allColumns);
    });
    useEffect(() => { localStorage.setItem('productsColumnOrder', JSON.stringify(columnOrder)); }, [columnOrder]);

    const displayedColumnOrder = useMemo(() => columnOrder.filter(key => visibleColumns[key]), [columnOrder, visibleColumns]);
    
    const formatValue = useCallback((value: any, key: string) => {
        if (value === undefined || value === null) return '—';
        if (key === 'createdAt' || key === 'finalizedAt') {
            if (typeof value === 'string' && value) {
                return formatDisplayDate(value.split('T')[0], i18n.language);
            }
            return '—';
        }
        
        // Correct lookup based on the ID value in the cell
        if (key === 'mainGroupId') return categoryMaps.mainGroups.get(value)?.name || '—';
        if (key === 'categoryId') return categoryMaps.categories.get(value)?.name || '—';
        if (key === 'subCategoryId') return categoryMaps.subCategories.get(value)?.name || '—';
        if (key === 'brandId') return categoryMaps.brands.get(value)?.name || '—';
        
        if (key === 'customsValueBasis') return t(`orderFormModal.customsBasisOptions.${value as string}` as any, { defaultValue: value });
        if (typeof value !== 'number') return String(value);
        if (key.startsWith('profitPercent')) return `${value.toFixed(1)}%`;
        if (key.toLowerCase().includes('toman')) return formatToman(value, costingSettings);
        return value.toLocaleString('en-US', {maximumFractionDigits: 2});
    }, [i18n.language, categoryMaps, costingSettings, t]);

    const filteredAndSortedProducts = useMemo(() => {
        let filtered = products.filter(p => !p.deletedAt);
        const q = persianArabicToEnglish(searchQuery.toLowerCase().trim());
        if (q) {
            filtered = filtered.filter(p => p.description.toLowerCase().includes(q) || (p.productNameFa && p.productNameFa.includes(q)) || p.internalCode.toLowerCase().includes(q) || (p.supplierCode && p.supplierCode.toLowerCase().includes(q)) || (p.oldSystemCode && p.oldSystemCode.toLowerCase().includes(q)));
        }
        if (filters.mainGroupId) filtered = filtered.filter(p => p.mainGroupId === filters.mainGroupId);
        if (filters.categoryId) filtered = filtered.filter(p => p.categoryId === filters.categoryId);
        if (filters.subCategoryId) filtered = filtered.filter(p => p.subCategoryId === filters.subCategoryId);
        if (filters.brandId) filtered = filtered.filter(p => p.brandId === filters.brandId);

        if (sortConfig.key) {
            filtered.sort((a, b) => {
                let valA = getNestedValue(a, sortConfig.key!);
                let valB = getNestedValue(b, sortConfig.key!);
                if (valA === undefined) valA = '';
                if (valB === undefined) valB = '';
                if (typeof valA === 'number' && typeof valB === 'number') return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                return sortConfig.direction === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
            });
        }
        return filtered;
    }, [products, searchQuery, filters, sortConfig]);

    const handleSort = (key: string) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    const handleSelectRow = (id: string) => setSelectedProductIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => setSelectedProductIds(e.target.checked ? new Set(filteredAndSortedProducts.map(p => p.id)) : new Set());

    const handleCellDoubleClick = (product: Product, columnKey: string) => {
        if (!editableColumns.has(columnKey)) return;
        setEditingCell({ productId: product.id, columnKey });
        const val = getNestedValue(product, columnKey);
        setEditValue(val ?? '');
    };

    const handleEditValueChange = (value: string | number) => setEditValue(value);

    const closeEditorAndSave = async () => {
        if (!editingCell || !costingSettings) return;
        const { productId, columnKey } = editingCell;
        const product = products.find(p => p.id === productId);
        if (!product) return;

        let updates: Partial<Product> = {};
        if (columnKey.startsWith('sellingPrices.')) {
            const [_, currency, tier] = columnKey.split('.');
            const overrides = JSON.parse(JSON.stringify(product.pricingTiersOverrides || { aed: {}, toman: {} }));
            overrides[currency][tier] = Number(editValue) || undefined;
            updates.pricingTiersOverrides = overrides;
        } else {
            (updates as any)[columnKey] = textEditableColumns.has(columnKey) ? String(editValue) : Number(editValue);
        }

        const updatedProduct = recalculateProductPrices({ ...product, ...updates }, costingSettings);
        setProducts(prev => prev.map(p => p.id === productId ? updatedProduct : p));
        await updateProduct(productId, updatedProduct);
        setEditingCell(null);
    };

    const cancelEdit = () => { setEditingCell(null); setEditValue(''); };
    const getStepForKey = (key: string) => key.toLowerCase().includes('toman') ? 1000 : 0.01;

    const handlePriceReset = async (productId: string, columnKey: string) => {
        const product = products.find(p => p.id === productId);
        if (!product || !costingSettings) return;
        const [_, currency, tier] = columnKey.split('.');
        const overrides = JSON.parse(JSON.stringify(product.pricingTiersOverrides || { aed: {}, toman: {} }));
        delete overrides[currency][tier];
        const updates = { pricingTiersOverrides: overrides };
        const updatedProduct = recalculateProductPrices({ ...product, ...updates }, costingSettings);
        setProducts(prev => prev.map(p => p.id === productId ? updatedProduct : p));
        await updateProduct(productId, updatedProduct);
        addToast(t('priceHistoryModal.priceReset'), 'info');
    };

    const handleCategorySave = async (productId: string, updates: Partial<Product>) => {
        const product = products.find(p => p.id === productId);
        if (!product || !costingSettings) return;
        const updatedProduct = { ...product, ...updates };
        setProducts(prev => prev.map(p => p.id === productId ? updatedProduct : p));
        await updateProduct(productId, updatedProduct);
    };

    const handleBulkDelete = () => {
        if (selectedProductIds.size === 0) return;
        showConfirmation({
            title: t('views.products.deleteConfirmTitle'),
            message: t('views.products.deleteConfirmBody', { count: selectedProductIds.size }),
            variant: 'destructive',
            onConfirm: async () => {
                await deleteProducts(Array.from(selectedProductIds));
                setSelectedProductIds(new Set());
                addToast(t('toasts.deleteSuccess'), 'success');
            }
        });
    };
    
    // Keyboard Reordering Logic
    const handleProductListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (editingCell) return;
        if (selectedProductIds.size === 0) return;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter') return;

        e.preventDefault();

        const allProducts = [...filteredAndSortedProducts];
        // Get currently selected product indices in the current sorted view
        const selectedIndices = allProducts
            .map((p, index) => selectedProductIds.has(p.id) ? index : -1)
            .filter(i => i !== -1)
            .sort((a, b) => a - b);
        
        if (selectedIndices.length === 0) return;

        // Check if contiguous
        const isContiguous = selectedIndices.every((val, i, arr) => i === 0 || val === arr[i - 1] + 1);

        let newProducts = [...allProducts];

        if (!isContiguous) {
             // 1. Cluster logic: Move all selected to become a contiguous block starting at the first selected index
             // Remove selected from their original positions first
             const selectedItems = selectedIndices.map(i => allProducts[i]);
             const nonSelectedItems = allProducts.filter((_, i) => !selectedProductIds.has(allProducts[i].id));
             
             // The insertion point is the index of the first selected item, adjusted for items removed before it.
             // Actually simpler: just insert at `firstIndex` into the non-selected array.
             // But we need to map back to the visual position.
             // If first selected was at index 2, we want the block to start at 2.
             const firstIndex = selectedIndices[0];
             
             // Reconstruct:
             // [0...firstIndex-1 (non-selected)] + [selected block] + [rest of non-selected]
             // We need to find where to split nonSelectedItems.
             // Any non-selected item that was originally *before* firstIndex stays before.
             
             const before = [];
             const after = [];
             let originalIndexCounter = 0;
             
             for (const item of allProducts) {
                 if (selectedProductIds.has(item.id)) {
                     // skip, we have them in selectedItems
                 } else {
                     if (originalIndexCounter < firstIndex) {
                         before.push(item);
                     } else {
                         after.push(item);
                     }
                 }
                 originalIndexCounter++;
             }
             
             newProducts = [...before, ...selectedItems, ...after];
             
        } else {
             // 2. Shift logic: Move the contiguous block up or down
             const blockStart = selectedIndices[0];
             const blockEnd = selectedIndices[selectedIndices.length - 1];
             
             if (e.key === 'ArrowUp') {
                 if (blockStart > 0) {
                     // Swap the item before the block with the entire block
                     // Effective change: move the item at blockStart-1 to blockEnd
                     const itemBefore = newProducts[blockStart - 1];
                     newProducts.splice(blockStart - 1, 1); // remove itemBefore
                     newProducts.splice(blockEnd, 0, itemBefore); // insert after block
                 }
             } else if (e.key === 'ArrowDown') {
                 if (blockEnd < newProducts.length - 1) {
                     // Swap the item after the block with the entire block
                     // Effective change: move item at blockEnd+1 to blockStart
                     const itemAfter = newProducts[blockEnd + 1];
                     newProducts.splice(blockEnd + 1, 1); // remove itemAfter
                     newProducts.splice(blockStart, 0, itemAfter); // insert before block
                 }
             }
        }

        // Re-index all
        const reorderedWithUpdatedOrder = newProducts.map((p, index) => ({ ...p, order: index + 1 }));
        
        // Optimistic update
        setProducts(reorderedWithUpdatedOrder);
        
        // Commit to DB (debounced)
        if (e.key === 'Enter') {
            // Force immediate save on Enter
             updateProductsOrder(reorderedWithUpdatedOrder);
        } else {
            // Debounced save for arrows
            debouncedUpdateProductsOrder(reorderedWithUpdatedOrder);
        }
    };
    
    // Listen for Enter key to commit reordering explicitly if desired, though debounced handles it.
    // The prompt requested explicit commit on Enter.
    // The handleProductListKeyDown handles the logic, but we need to ensure the listener is active.
    // It's attached to the container div via onKeyDown.


    const executeAutoFitCol = async (colKey: string) => {
        const textMeasureEl = textMeasureRef.current;
        if (!textMeasureEl) return;
        let maxWidth = 0;
        textMeasureEl.style.fontWeight = 'bold';
        textMeasureEl.textContent = allColumns[colKey] || colKey;
        maxWidth = textMeasureEl.offsetWidth;
        textMeasureEl.style.fontWeight = 'normal';
        products.forEach(p => {
            const val = formatValue(getNestedValue(p, colKey), colKey);
            textMeasureEl.textContent = val;
            maxWidth = Math.max(maxWidth, textMeasureEl.offsetWidth);
        });
        const newWidth = Math.min(600, Math.max(40, maxWidth + 24));
        setColumnWidths(prev => ({ ...prev, [colKey]: newWidth }));
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !costingSettings) return;

        setIsImporting(true);
        addToast(t('toasts.productImportInProgress'), 'info');
        try {
            const buffer = await file.arrayBuffer();
            const parsedData = await parseAndImportProducts(buffer);
            
            // 1. Load all active products
            const activeProducts = await db.products.filter(p => !p.deletedAt).toArray();
            const productMap = new Map(activeProducts.map(p => [p.internalCode.toLowerCase().trim(), p]));

            // Buckets for re-ordering logic
            const explicitMoves: { item: Product, order: number, rowIndex: number }[] = [];
            const implicitNew: Product[] = [];
            const implicitExisting: Product[] = [];
            const processedIds = new Set<string>();

            // 2. Process Excel Rows
            for (const item of parsedData) {
                const code = item.data.internalCode?.toLowerCase().trim();
                if (!code) continue;

                const existing = productMap.get(code);
                const excelOrder = item.data.order; // Parsed from 'Display Order' column

                // Prepare the product object (Update vs Create)
                let productToSave: Product;
                
                // Helper to extract non-empty data
                const updatePayload: any = {};
                Object.entries(item.data).forEach(([key, val]) => {
                     // Exclude special handling keys
                     if (['mainGroup', 'category', 'subCategory', 'brand', 'order'].includes(key)) return;
                     // Safe Update Rule: Only non-empty cells
                     if (val !== undefined && val !== null && val !== '') {
                         updatePayload[key] = val;
                     }
                });

                // Category Mapping (Same as before)
                // Note: We only update category IDs if names are provided in Excel
                 if (item.data.mainGroup) {
                    const mg = mainGroups.find(g => g.name.toLowerCase() === item.data.mainGroup?.toLowerCase() || g.name_fa === item.data.mainGroup);
                    if (mg) updatePayload.mainGroupId = mg.id;
                }
                if (item.data.category && updatePayload.mainGroupId) {
                    const cat = categories.find(c => (c.name.toLowerCase() === item.data.category?.toLowerCase() || c.name_fa === item.data.category) && c.mainGroupId === updatePayload.mainGroupId);
                    if (cat) updatePayload.categoryId = cat.id;
                }
                if (item.data.subCategory && updatePayload.categoryId) {
                     const sub = subCategories.find(s => (s.name.toLowerCase() === item.data.subCategory?.toLowerCase() || s.name_fa === item.data.subCategory) && s.categoryId === updatePayload.categoryId);
                     if (sub) updatePayload.subCategoryId = sub.id;
                }
                if (item.data.brand && updatePayload.subCategoryId) {
                    const b = brands.find(brand => brand.name.toLowerCase() === item.data.brand?.toLowerCase() && brand.subCategoryId === updatePayload.subCategoryId);
                    if (b) updatePayload.brandId = b.id;
                }

                if (existing) {
                    processedIds.add(existing.id);
                    productToSave = { ...existing, ...updatePayload };
                    // Recalculate prices if cost factors changed
                    productToSave = recalculateProductPrices(productToSave, productToSave.settingsSnapshot || costingSettings);
                } else {
                    const newProdSkeleton: Product = {
                        id: `prod-${crypto.randomUUID()}`,
                        sourceOrderId: `import-${new Date().toISOString()}`,
                        finalizedAt: new Date().toISOString(),
                        settingsSnapshot: costingSettings,
                        deletedAt: null,
                        order: 0, // Temp
                        createdAt: new Date().toISOString(),
                        iranCustomsCosts: { finalDuty_TOMAN: 0, importVat_TOMAN: 0, brokerFee_TOMAN: 0, shipFreight_TOMAN: 0, inlandFreight_TOMAN: 0, standardFee_TOMAN: 0, loadingUnloadingFee_TOMAN: 0 },
                        landedCostUSD: 0, landedCostAED: 0, landedCostTOMAN: 0,
                        sellingPrices: { aed: { tier1: 0, tier2: 0, tier3: 0 }, toman: { tier1: 0, tier2: 0, tier3: 0 } },
                        purchasePriceUSD: 0, purchasePriceInSourceCurrency: 0, sourceCurrency: 'USD',
                        shipStageCostsUSD: 0, dubaiStageCostsAED: 0, iranStageCostsTOMAN: 0,
                        description: '', itemsPerCarton: 1, cartonCBM: 0,
                        ...updatePayload
                    };
                    productToSave = recalculateProductPrices(newProdSkeleton, costingSettings);
                }

                // Bucket Assignment
                if (typeof excelOrder === 'number' && excelOrder >= 1) {
                    explicitMoves.push({ item: productToSave, order: excelOrder, rowIndex: item.rowNum });
                } else {
                    if (existing) {
                        implicitExisting.push(productToSave);
                    } else {
                        implicitNew.push(productToSave);
                    }
                }
            }

            // 3. Add Untouched Existing Products
            activeProducts.forEach(p => {
                if (!processedIds.has(p.id)) {
                    implicitExisting.push(p);
                }
            });

            // 4. Reconstruct Order Sequence
            
            // Sort implicit existing by their previous order to maintain relative positions
            implicitExisting.sort((a, b) => a.order - b.order);

            // Base List: New (Top) + Existing (Relative)
            const baseList = [...implicitNew, ...implicitExisting];

            // Sort explicit moves
            explicitMoves.sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return a.rowIndex - b.rowIndex; // Stable sort for duplicates
            });

            // Insert explicit moves
            for (const move of explicitMoves) {
                // Target index is order - 1 (1-based to 0-based)
                let targetIndex = move.order - 1;
                
                // Case B: If target is beyond current list, append
                if (targetIndex >= baseList.length) {
                    baseList.push(move.item);
                } else {
                    // Case A: Insert at position
                    baseList.splice(targetIndex, 0, move.item);
                }
            }

            // 5. Final Re-index and Save
            const finalProducts = baseList.map((p, index) => ({
                ...p,
                order: index + 1
            }));

            await db.transaction('rw', db.products, async () => {
                await db.products.bulkPut(finalProducts);
            });

            // 6. Safety Re-index check (handled by transaction usually, but good practice per prompt)
             await reindexActiveProducts();

            addToast(t('toasts.productImportSuccess', { count: parsedData.length }), 'success');
        } catch (error) {
            console.error(error);
            addToast(t('toasts.productImportError'), 'error');
        } finally {
            setIsImporting(false);
            if (event.target) event.target.value = '';
        }
    };

    const handleMediaSync = async (scannedData: ScannedMedia[]) => {
        let updatedCount = 0, imagesAdded = 0, manualsAdded = 0;
        const allProducts = await db.products.toArray();
        const productMap = new Map(allProducts.map(p => [p.internalCode.toLowerCase().trim(), p]));

        await db.transaction('rw', db.products, async () => {
            for (const data of scannedData) {
                const product = productMap.get(data.productCode.toLowerCase().trim());
                if (product) {
                    const newImages = data.images.map(img => ({ id: crypto.randomUUID(), name: img.name, data: `data:${img.mimeType};base64,${img.data}` }));
                    const newManuals = data.manuals.map(man => ({ id: crypto.randomUUID(), name: man.name, type: man.mimeType, size: 0, data: new Uint8Array(atob(man.data).split('').map(c => c.charCodeAt(0))).buffer, createdAt: new Date().toISOString() }));
                    
                    const existingImageNames = new Set((product.images || []).map(i => i.name));
                    const filteredNewImages = newImages.filter(i => !existingImageNames.has(i.name));
                    
                    const existingManualNames = new Set((product.attachments || []).map(a => a.name));
                    const filteredNewManuals = newManuals.filter(m => !existingManualNames.has(m.name));

                    if (filteredNewImages.length > 0 || filteredNewManuals.length > 0) {
                        await db.products.update(product.id, {
                            images: [...(product.images || []), ...filteredNewImages],
                            attachments: [...(product.attachments || []), ...filteredNewManuals]
                        });
                        updatedCount++;
                        imagesAdded += filteredNewImages.length;
                        manualsAdded += filteredNewManuals.length;
                    }
                }
            }
        });
        return { updatedCount, imagesAdded, manualsAdded };
    };

    const handleBulkCategorize = async (options: { updateCategories: boolean; updateHsCodes: boolean }) => {
        const idsToProcess = Array.from(selectedProductIds);
        const productsToProcess = products.filter(p => idsToProcess.includes(p.id));
        
        if (productsToProcess.length === 0) return;
        if (!aiSettings?.apiKey) { addToast(t('toasts.ai.apiKeyNotConfigured'), 'error'); return; }

        setIsAiCategorizationModalOpen(false);
        setIsCategorizing(true);
        setCategorizationProgress({ current: 0, total: productsToProcess.length });

        const structure = { mainGroups, categories, subCategories, brands };
        const model = aiSettings.checklistGenerationModel || 'gemini-3.5-flash';

        let successCount = 0;
        for (const [index, product] of productsToProcess.entries()) {
            setCategorizationProgress({ current: index + 1, total: productsToProcess.length });
            try {
                let updates: Partial<Product> = {};

                if (options.updateCategories) {
                    const result = await categorizeProductWithAI(product.description, structure, aiSettings.apiKey, model);
                    if (result.matchType === 'existing' && result.existingIds) {
                        updates = { ...updates, ...result.existingIds };
                    } else if (result.matchType === 'new' && result.newNames) {
                        const { mainGroup, mainGroup_fa, category, category_fa, subCategory, subCategory_fa } = result.newNames;
                        
                        let mgId = mainGroups.find(g => g.name === mainGroup)?.id;
                        if (!mgId) mgId = await db.mainGroups.add({ id: crypto.randomUUID(), name: mainGroup!, name_fa: mainGroup_fa });

                        let catId = categories.find(c => c.name === category && c.mainGroupId === mgId)?.id;
                        if (!catId) catId = await db.categories.add({ id: crypto.randomUUID(), name: category!, name_fa: category_fa, mainGroupId: mgId! });

                        let subId = subCategories.find(s => s.name === subCategory && s.categoryId === catId)?.id;
                        if (!subId) subId = await db.subCategories.add({ id: crypto.randomUUID(), name: subCategory!, name_fa: subCategory_fa, categoryId: catId! });

                        let bId = brands.find(b => b.name === 'Newland' && b.subCategoryId === subId)?.id;
                        if (!bId) bId = await db.brands.add({ id: crypto.randomUUID(), name: 'Newland', subCategoryId: subId! });

                        updates = { ...updates, mainGroupId: mgId, categoryId: catId, subCategoryId: subId, brandId: bId };
                    }
                }

                if (options.updateHsCodes) {
                    const hsCode = await getHSCodeForProduct(product.description, product.attributes || [], aiSettings.apiKey, model);
                    if (hsCode) updates.hsCode = hsCode;
                }

                if (Object.keys(updates).length > 0) {
                    await updateProduct(product.id, updates);
                    successCount++;
                }
            } catch (err) { console.error(`Failed to update product ${product.internalCode}:`, err); }
        }

        setIsCategorizing(false);
        setSelectedProductIds(new Set());
        addToast(t('views.products.categorizeSuccess', { count: successCount }), 'success');
    };

    const commonViewProps: ViewProps = {
        products: filteredAndSortedProducts,
        setProductsForOptimisticUpdate: setProducts,
        costingSettings,
        allColumns,
        columnOrder,
        setColumnOrder,
        visibleColumns,
        columnWidths,
        setColumnWidths,
        executeAutoFitCol,
        sortConfig,
        handleSort,
        selectedProductIds,
        handleSelectAll,
        handleSelectRow,
        editingCell,
        handleCellDoubleClick,
        editValue,
        handleEditValueChange,
        closeEditorAndSave,
        cancelEdit,
        getStepForKey,
        setHistoryModal,
        setAttributesModal,
        formatValue,
        editableColumns,
        productCardSettings,
        expandedCardIds,
        toggleCardExpansion: (id) => setExpandedCardIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
        priceFilter,
        onEdit: (p) => { setProductToEdit(p); setIsProductFormOpen(true); },
        onOpenBrochureWizard,
        hiddenBlockColumns,
        setHiddenBlockColumns,
        blockContextMenu,
        setBlockContextMenu,
        handlePriceReset,
        categoryEditableColumns,
        handleCategorySave,
        textEditableColumns,
        updateProductsOrder: debouncedUpdateProductsOrder,
        onOpenCategoryModal: (options) => setCategoryModalState({ ...options, isOpen: true }),
        onOpenAnalysisModal: (p) => setAnalysisModal({ isOpen: true, product: p }),
        handleProductListKeyDown,
    };

    return (
        <div className="h-full flex flex-col gap-y-4 bg-gray-50 overflow-hidden" dir={i18n.dir()}>
            {isImporting && <LoadingOverlay message={t('toasts.productImportInProgress')} />}
            {isCategorizing && <LoadingOverlay message={t('views.products.categorizingProgress', categorizationProgress)} />}
            
            <span ref={textMeasureRef} className="invisible absolute whitespace-nowrap text-sm" aria-hidden="true" />
            
            <header className="flex flex-col gap-y-3 px-4 pt-4 lg:px-6 lg:pt-6 flex-shrink-0">
                {/* Top Tabs: Dual Mode (Advisory Pricing vs Dubai Ledger) */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                            <span className="bg-indigo-600 text-white p-1.5 rounded-lg shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                            </span>
                            کاتالوگ و حسابداری کالا
                        </h1>
                        <div className="flex bg-slate-200/80 p-1 rounded-xl shadow-inner border border-slate-300/60">
                            <button
                                onClick={() => setSectionMode('pricing_engine')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
                                    sectionMode === 'pricing_engine'
                                        ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                                }`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                سیستم قیمت‌گذاری و بهای تمام‌شده ارشادی
                            </button>
                            <button
                                onClick={() => setSectionMode('dubai_ledger')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
                                    sectionMode === 'dubai_ledger'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                                }`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                دفتر معین و انبار دبی (حسابداری واقعی)
                                <span className="bg-emerald-500/30 text-emerald-900 text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-400/40">Real Ledger</span>
                            </button>
                        </div>
                    </div>
                </div>

                {sectionMode === 'pricing_engine' ? (
                    <>
                        <div className="flex justify-between items-center">
                            <div className="text-xs text-slate-500 font-medium">
                                محاسبات، فرمول‌بندی بهای تمام‌شده ایران و قیمت‌های ارشادی فروش درهمی/تومانی
                            </div>
                            <div className="flex items-center gap-x-2">
                                <div className="flex bg-gray-200 rounded-lg p-1">
                                    <button onClick={() => setViewMode('row')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'row' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>{t('views.products.rowView')}</button>
                                    <button onClick={() => setViewMode('block')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'block' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>{t('views.products.blockView')}</button>
                                    <button onClick={() => setViewMode('card')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'card' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>{t('views.products.cardView')}</button>
                                </div>
                                <div className="h-6 w-px bg-gray-300 mx-2" />
                                <button onClick={() => setIsMediaUpdaterOpen(true)} className="p-2 text-slate-500 hover:bg-slate-200 rounded-full" title={t('views.products.syncMedia')}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></button>
                                <button onClick={async () => await generateProductImportTemplate(t, products, { mainGroups, categories, subCategories, brands })} className="p-2 text-slate-500 hover:bg-slate-200 rounded-full" title={t('views.products.downloadTemplate')}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                                <button onClick={() => document.getElementById('product-import-input')?.click()} className="p-2 text-slate-500 hover:bg-slate-200 rounded-full" title={t('views.products.importProducts')}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></button>
                                <input type="file" id="product-import-input" className="hidden" accept=".xlsx" onChange={handleFileChange} />
                                <button onClick={() => { setProductToEdit(null); setIsProductFormOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-x-2 font-medium text-sm transition-colors shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>{t('views.products.newProduct')}</button>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                            <div className="relative flex-1 min-w-[300px]">
                                <input type="text" ref={searchInputRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t('views.products.searchPlaceholder') as string} className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <DrilldownFilter filters={filters} onFilterChange={(level, value) => setFilters(prev => ({ ...prev, [level]: value }))} onClear={() => setFilters({ mainGroupId: '', categoryId: '', subCategoryId: '', brandId: '' })} data={{ mainGroups, categories, subCategories, brands }} />
                            <Select value={priceFilter} onChange={e => setPriceFilter(e.target.value as PriceFilter)} wrapperClassName="!w-40"><option value="all">{t('views.products.priceFilter.all')}</option><option value="aed">{t('views.products.priceFilter.aed')}</option><option value="toman">{t('views.products.priceFilter.toman')}</option></Select>
                            
                            <div className="h-8 w-px bg-slate-200 mx-1" />
                            
                            <div className="flex items-center gap-x-2">
                                {selectedProductIds.size > 0 && (
                                    <>
                                        <button onClick={() => setIsAiCategorizationModalOpen(true)} className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-purple-200 transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                                            AI Update
                                        </button>
                                        <button onClick={handleBulkDelete} className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-red-200 transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                            {t('views.products.deleteSelected', { count: selectedProductIds.size })}
                                        </button>
                                        <div className="h-6 w-px bg-slate-200 mx-1" />
                                    </>
                                )}
                                <button onClick={() => setIsExportModalOpen(true)} className="p-2 text-slate-500 hover:bg-slate-200 rounded-full" title={t('buttons.printExport') as string}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg></button>
                                <div className="relative" ref={columnSelectorRef}>
                                    <button ref={columnSelectorButtonRef} onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)} className="p-2 text-slate-500 hover:bg-slate-200 rounded-full" title={t('views.products.showHideColumns') as string}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 0V7" /></svg></button>
                                    <ColumnSelector isOpen={isSearchVisible || isColumnSelectorOpen} allColumns={allColumns} visibleColumns={visibleColumns} setVisibleColumns={setVisibleColumns} />
                                </div>
                            </div>
                        </div>
                    </>
                ) : null}
            </header>

            <main className="flex-1 overflow-hidden px-4 lg:px-6 pb-4">
                {sectionMode === 'dubai_ledger' ? (
                    <div className="h-full overflow-y-auto bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                        <ProductAccountingLedgerTab />
                    </div>
                ) : (
                    <>
                        {viewMode === 'row' && <RowView {...commonViewProps} />}
                        {viewMode === 'block' && <BlockView {...commonViewProps} />}
                        {viewMode === 'card' && <CardView {...commonViewProps} />}
                    </>
                )}
            </main>

            {/* Modals */}
            <PriceHistoryModal isOpen={historyModal.isOpen} onClose={() => setHistoryModal({ isOpen: false, product: null })} product={historyModal.product} />
            <AttributesGalleryModal isOpen={attributesModal.isOpen} onClose={() => setAttributesModal({ isOpen: false, product: null })} product={attributesModal.product} onUpdateProduct={async (id, updates) => { setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p)); await updateProduct(id, updates); }} aiSettings={aiSettings} onOpenBrochureWizard={onOpenBrochureWizard} />
            <PrintExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} allColumns={allColumns} columnOrder={columnOrder} selectedColumns={printExportColumns} setSelectedColumns={setPrintExportColumns} selectedRowCount={selectedProductIds.size} totalRowCount={filteredAndSortedProducts.length} onExport={({ columns, title, notes }) => exportProductsToExcel(selectedProductIds.size > 0 ? filteredAndSortedProducts.filter(p => selectedProductIds.has(p.id)) : filteredAndSortedProducts, columns, allColumns, t, title, notes)} onPrint={({ columns, title, notes }) => { const html = generatePrintableProductsHtml(selectedProductIds.size > 0 ? filteredAndSortedProducts.filter(p => selectedProductIds.has(p.id)) : filteredAndSortedProducts, columns, allColumns, t, { info: companyInfo, logo: companyLogo }, { title, notes, costingSettings }); if ((window as any).electronAPI) (window as any).electronAPI.printComponent(html); else { const win = window.open('', '_blank'); if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 500); } } }} />
            <ProductFormModal isOpen={isProductFormOpen} onClose={() => { setIsProductFormOpen(false); setProductToEdit(null); }} onSubmit={async (formData, id) => { if (costingSettings) { if (id) { const product = products.find(p => p.id === id); if (product) { const updated = recalculateProductPrices({ ...product, ...formData }, costingSettings); setProducts(prev => prev.map(p => p.id === id ? updated : p)); await updateProduct(id, updated); addToast(t('toasts.products.updated'), 'success'); } } else { await addProduct(formData, costingSettings); addToast(t('toasts.products.added'), 'success'); } setIsProductFormOpen(false); setProductToEdit(null); } else { addToast(t('toasts.products.costingSettingsNeeded'), 'error'); } }} productToEdit={productToEdit} onOpenCategoryModal={setCategoryModalState} aiSettings={aiSettings} />
            {categoryModalState?.isOpen && (
                <CategoryEditModal 
                    isOpen={categoryModalState.isOpen} 
                    onClose={() => setCategoryModalState(null)} 
                    level={categoryModalState.level} 
                    itemToEdit={categoryModalState.itemToEdit} 
                    aiSettings={aiSettings}
                    onSave={async (data) => {
                        const { level, parentId } = categoryModalState;
                        let newId = '';
                        if (level === 'mainGroup') newId = await db.mainGroups.add({ id: crypto.randomUUID(), ...data });
                        else if (level === 'category') newId = await db.categories.add({ id: crypto.randomUUID(), ...data, mainGroupId: parentId! });
                        else if (level === 'subCategory') newId = await db.subCategories.add({ id: crypto.randomUUID(), ...data, categoryId: parentId! });
                        else if (level === 'brand') newId = await db.brands.add({ id: crypto.randomUUID(), ...data, subCategoryId: parentId! });

                        categoryModalState.onSaveSuccess(newId);
                        setCategoryModalState(null);
                    }}
                    onUpdate={async (data) => {
                        const { level } = categoryModalState;
                        const { id, ...updates } = data;
                        if (level === 'mainGroup') await db.mainGroups.update(id, updates);
                        else if (level === 'category') await db.categories.update(id, updates);
                        else if (level === 'subCategory') await db.subCategories.update(id, updates);
                        else if (level === 'brand') await db.brands.update(id, updates);
                        
                        categoryModalState.onSaveSuccess(id);
                        setCategoryModalState(null);
                    }}
                />
            )}
            {analysisModal.isOpen && (
                <ProductCostAnalysisModal isOpen={analysisModal.isOpen} onClose={() => setAnalysisModal({ isOpen: false, product: null })} product={analysisModal.product} costingSettings={costingSettings} />
            )}
            {isAiCategorizationModalOpen && (
                <AICategorizationModal isOpen={isAiCategorizationModalOpen} onClose={() => setIsAiCategorizationModalOpen(false)} onSubmit={handleBulkCategorize} productCount={selectedProductIds.size} />
            )}
            {isMediaUpdaterOpen && (
                <ProductMediaUpdaterModal 
                    isOpen={isMediaUpdaterOpen} 
                    onClose={() => setIsMediaUpdaterOpen(false)} 
                    onSync={handleMediaSync} 
                    selectedProductIds={selectedProductIds.size > 0 ? Array.from(selectedProductIds) : undefined} 
                />
            )}
        </div>
    );
};
