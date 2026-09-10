import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
// FIX: Moved AI type imports to `types` to resolve module export error.
import { Product, ProductImage, OrderItemAttribute, AISettings, BrochureData, BrochureTranslationInput, BrochureTranslationOutput } from '../types';
import { useModals } from '../contexts/ModalContext';
import { generateProductBrochureHtml, BrochureContent } from '../utils/formatters';
import { generateMarketingCopy, translateBrochureContent } from '../utils/ai';
import { useSettings } from '../hooks/useSettings';
import LoadingOverlay from './LoadingOverlay';
import ImageCropperModal from './ImageCropperModal';
import { db } from '../db';

interface BrochureWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    aiSettings?: AISettings;
}

const BrochureWizardModal: React.FC<BrochureWizardModalProps> = ({ isOpen, onClose, product, aiSettings }) => {
    const { t, i18n } = useTranslation();
    const { addToast } = useModals();
    const { settings } = useSettings();

    // State for user selections
    const [orderedImages, setOrderedImages] = useState<ProductImage[]>([]);
    const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
    const [selectedAttributeIds, setSelectedAttributeIds] = useState<Set<string>>(new Set());

    // State for AI-generated and translated content
    const [marketingCopyEn, setMarketingCopyEn] = useState('');
    const [marketingCopyFa, setMarketingCopyFa] = useState('');
    const [translatedAttributes, setTranslatedAttributes] = useState<Record<string, { key_fa: string; value_fa: string }>>({});
    const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // State for brochure preview
    const [brochureHtml, setBrochureHtml] = useState('');

    // State for drag & drop
    const [draggedImageId, setDraggedImageId] = useState<string | null>(null);

    // State for image cropping
    const [cropperState, setCropperState] = useState<{ isOpen: boolean; src: string | null; imageIdToEdit: string | null }>({ isOpen: false, src: null, imageIdToEdit: null });

    const companyInfo = useMemo(() => settings.find(s => s.key === 'companyInfo')?.value, [settings]);
    const companyLogo = useMemo(() => settings.find(s => s.key === 'companyLogo')?.value, [settings]);

    useEffect(() => {
        if (isOpen && product) {
            const brochureData = product.brochureData;
            const initialImages = product.images || [];

            if (brochureData) {
                // Restore from saved data
                const orderMap = new Map<string, number>(brochureData.orderedImageIds.map((id, index) => [id, index]));
                const sortedImages = [...initialImages].sort((a, b) => ((orderMap.get(a.id) ?? Infinity) as number) - ((orderMap.get(b.id) ?? Infinity) as number));
                setOrderedImages(sortedImages);
                setSelectedImageIds(new Set(brochureData.selectedImageIds));
                setSelectedAttributeIds(new Set(brochureData.selectedAttributeIds));
                setMarketingCopyEn(brochureData.marketingCopyEn);
                setMarketingCopyFa(brochureData.marketingCopyFa);
                setTranslatedAttributes(brochureData.translatedAttributes || {});
            } else {
                // Initialize with defaults
                setOrderedImages(initialImages);
                setSelectedImageIds(new Set(initialImages.map(img => img.id)));
                setSelectedAttributeIds(new Set((product.attributes || []).map(attr => attr.id)));
                setMarketingCopyEn('');
                setMarketingCopyFa('');
                setTranslatedAttributes({});
            }
        }
    }, [isOpen, product]);
    
    // Auto-saving effect
    useEffect(() => {
        if (!product || !isOpen) return;

        // This effect handles the debounced auto-saving
        const handler = setTimeout(() => {
            setIsSaving(true);
            const brochureData: BrochureData = {
                orderedImageIds: orderedImages.map(img => img.id),
                selectedImageIds: Array.from(selectedImageIds),
                selectedAttributeIds: Array.from(selectedAttributeIds),
                marketingCopyEn,
                marketingCopyFa,
                translatedAttributes,
            };
            
            db.products.update(product.id, { brochureData })
                .catch(err => {
                    console.error("Auto-save failed:", err);
                    addToast('Auto-save failed.', 'error');
                })
                .finally(() => {
                    setIsSaving(false);
                });
        }, 1000); // Debounce for 1 second

        return () => {
            clearTimeout(handler);
        };
    }, [isOpen, product, orderedImages, selectedImageIds, selectedAttributeIds, marketingCopyEn, marketingCopyFa, translatedAttributes, addToast]);
    
    useEffect(() => {
        if (!isOpen || !product || !companyInfo) return;

        const selectedImages = orderedImages.filter(img => selectedImageIds.has(img.id));
        const selectedAttributes = (product.attributes || [])
            .filter(attr => selectedAttributeIds.has(attr.id))
            .map(attr => ({
                ...attr,
                ...translatedAttributes[attr.id]
            }));

        const content: BrochureContent = {
            images: selectedImages,
            attributes: selectedAttributes,
            marketingCopyEn,
            marketingCopyFa,
        };

        const html = generateProductBrochureHtml(product, content, companyInfo, companyLogo, t);
        setBrochureHtml(html);

    }, [isOpen, product, orderedImages, selectedImageIds, selectedAttributeIds, marketingCopyEn, marketingCopyFa, translatedAttributes, companyInfo, companyLogo, t]);


    const handleToggleImage = (id: string) => {
        setSelectedImageIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    
    const handleToggleAttribute = (id: string) => {
        setSelectedAttributeIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    
    const handleGenerateCopy = async () => {
        if (!product || !aiSettings?.apiKey) {
            addToast(t('toasts.ai.apiKeyNotConfigured'), 'error');
            return;
        }
        setIsGeneratingCopy(true);
        try {
            const selectedAttrs = (product.attributes || []).filter(attr => selectedAttributeIds.has(attr.id));
            const model = aiSettings.checklistGenerationModel || 'gemini-3.5-flash';
            const copy = await generateMarketingCopy(product.description, selectedAttrs, aiSettings.apiKey, model);
            setMarketingCopyEn(copy);
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Failed to generate copy", "error");
        } finally {
            setIsGeneratingCopy(false);
        }
    };
    
    const handleTranslate = async () => {
        if (!product || !aiSettings?.apiKey) {
            addToast(t('toasts.ai.apiKeyNotConfigured'), 'error');
            return;
        }
        setIsTranslating(true);
        try {
            const selectedAttrs = (product.attributes || []).filter(attr => selectedAttributeIds.has(attr.id));
            const input: BrochureTranslationInput = {
                marketingCopy: marketingCopyEn,
                attributes: selectedAttrs.map(({ id, key, value }) => ({ id, key, value })),
            };
            const model = aiSettings.checklistGenerationModel || 'gemini-3.5-flash';
            const result = await translateBrochureContent(input, aiSettings.apiKey, model);
            
            setMarketingCopyFa(result.marketingCopy_fa);
            const newTranslations: Record<string, { key_fa: string; value_fa: string }> = {};
            result.translatedAttributes.forEach(attr => {
                newTranslations[attr.id] = { key_fa: attr.key_fa, value_fa: attr.value_fa };
            });
            setTranslatedAttributes(newTranslations);

        } catch (error) {
            addToast(error instanceof Error ? error.message : "Failed to translate content", "error");
        } finally {
            setIsTranslating(false);
        }
    };

    const handleSaveAsPdf = async () => {
        if (!product) return;
        if ((window as any).electronAPI?.saveHtmlAsPdf) {
            try {
                // Sanitize file name parts to remove invalid characters
                const safeInternalCode = (product.internalCode || 'product').replace(/[\\/:"*?<>|]/g, '-');
                const safeDescription = (product.description || 'brochure').replace(/[\\/:"*?<>|]/g, '-');
                const defaultFileName = `${safeInternalCode} Brochure - ${safeDescription}.pdf`;

                const result = await (window as any).electronAPI.saveHtmlAsPdf({
                    htmlContent: brochureHtml,
                    defaultFileName: defaultFileName
                });
                if (result.success) addToast('Brochure saved successfully!', 'success');
                else if (result.error && !result.error.toLowerCase().includes('cancelled')) addToast(`Failed to save: ${result.error}`, 'error');
            } catch (error) {
                addToast(`An error occurred while saving the PDF.`, 'error');
            }
        } else {
            addToast("PDF saving is only available in the desktop app.", "error");
        }
    };

    const handlePrint = () => {
        if ((window as any).electronAPI?.printLargeHtml) {
            (window as any).electronAPI.printLargeHtml(brochureHtml);
        } else if ((window as any).electronAPI) {
            (window as any).electronAPI.printComponent(brochureHtml);
        } else {
            const printWindow = window.open('', '_blank');
            if(printWindow) {
                printWindow.document.write(brochureHtml);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => { printWindow.print(); }, 500);
            }
        }
    };
    
    const handleDrop = (targetImageId: string) => {
        if (!draggedImageId || draggedImageId === targetImageId) return;
    
        setOrderedImages(prev => {
            const draggedIndex = prev.findIndex(p => p.id === draggedImageId);
            const targetIndex = prev.findIndex(p => p.id === targetImageId);
    
            if (draggedIndex === -1 || targetIndex === -1) return prev;
    
            const newArray = [...prev];
            const [draggedItem] = newArray.splice(draggedIndex, 1);
            newArray.splice(targetIndex, 0, draggedItem);
            return newArray;
        });
        setDraggedImageId(null);
    };

    const handleEditImageClick = (e: React.MouseEvent, image: ProductImage) => {
        e.stopPropagation(); // Prevent toggling selection
        setCropperState({ isOpen: true, src: image.data, imageIdToEdit: image.id });
    };

    const handleCropComplete = (croppedImageUrl: string) => {
        if (cropperState.imageIdToEdit) {
            setOrderedImages(prev => prev.map(img => 
                img.id === cropperState.imageIdToEdit ? { ...img, data: croppedImageUrl } : img
            ));
        }
        setCropperState({ isOpen: false, src: null, imageIdToEdit: null });
    };

    if (!isOpen || !product) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={onClose}>
                {(isGeneratingCopy || isTranslating) && <LoadingOverlay message={isGeneratingCopy ? "Generating copy..." : "Translating..."} />}
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <header className="p-4 border-b border-slate-200 flex-shrink-0 flex justify-between items-center">
                        <h2 className="text-lg font-bold text-gray-800">Brochure Wizard: {product.description}</h2>
                        <button onClick={onClose} className="p-2 rounded-full text-slate-500 hover:bg-slate-100" aria-label={t('common.close')}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </header>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 min-h-0">
                        {/* Controls Panel */}
                        <div className="md:col-span-1 bg-slate-50 p-4 border-e border-slate-200 grid grid-rows-[1fr_auto] gap-y-4">
                            {/* Scrollable Area for Content Selection */}
                            <div className="overflow-y-auto space-y-4 -m-2 p-2 min-h-0">
                                <div>
                                    <h3 className="font-semibold text-slate-700 mb-2">Select Images</h3>
                                    <div className="grid grid-cols-4 gap-2 border rounded-md p-2 bg-slate-100">
                                        {orderedImages.map(img => (
                                            <div 
                                                key={img.id} 
                                                draggable
                                                onDragStart={() => setDraggedImageId(img.id)}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={() => handleDrop(img.id)}
                                                className={`relative cursor-pointer group aspect-square transition-opacity ${draggedImageId === img.id ? 'opacity-50' : ''}`} 
                                                onClick={() => handleToggleImage(img.id)}
                                            >
                                                <img src={img.data} alt={img.name} className="w-full h-full object-cover rounded-md"/>
                                                <div className={`absolute inset-0 rounded-md transition-all ${selectedImageIds.has(img.id) ? 'ring-2 ring-offset-2 ring-indigo-500 bg-black/10' : 'bg-black/50'}`}></div>
                                                {selectedImageIds.has(img.id) && <div className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full h-5 w-5 flex items-center justify-center">&#x2713;</div>}
                                                <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={(e) => handleEditImageClick(e, img)} className="p-1 bg-white/70 text-slate-800 rounded-full hover:bg-white">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-slate-700 mb-2">Select Attributes</h3>
                                    <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
                                        {(product.attributes || []).map(attr => (
                                            <label key={attr.id} className="flex items-center gap-x-2 p-1.5 rounded hover:bg-slate-200 cursor-pointer">
                                                <input type="checkbox" checked={selectedAttributeIds.has(attr.id)} onChange={() => handleToggleAttribute(attr.id)} className="h-4 w-4 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500"/>
                                                <span className="text-sm text-slate-800">{attr.key}: <span className="text-slate-600">{attr.value}</span></span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Pinned Bottom Area for Actions */}
                            <div className="space-y-2 pt-4 border-t border-slate-200">
                                <h3 className="font-semibold text-slate-700">Marketing Copy</h3>
                                <textarea value={marketingCopyEn} onChange={e => setMarketingCopyEn(e.target.value)} rows={3} className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder="AI-generated marketing text (EN)..."/>
                                <button onClick={handleGenerateCopy} disabled={isGeneratingCopy} className="bg-purple-600 text-white px-3 py-1.5 rounded-md hover:bg-purple-700 text-xs font-semibold disabled:opacity-50">Generate with AI</button>
                                <textarea value={marketingCopyFa} onChange={e => setMarketingCopyFa(e.target.value)} rows={3} dir="rtl" className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder="...متن بازاریابی (FA)"/>
                                <button onClick={handleTranslate} disabled={isTranslating || !marketingCopyEn} className="bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 text-xs font-semibold disabled:opacity-50">Translate to Persian</button>
                            </div>
                        </div>

                        {/* Preview Panel */}
                        <main className="md:col-span-2 overflow-auto p-2 bg-slate-200">
                            <iframe
                                srcDoc={brochureHtml}
                                title="Brochure Preview"
                                className="w-full h-full border-none bg-white shadow-inner"
                            />
                        </main>
                    </div>
                    <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-between items-center border-t border-slate-200">
                        <div>
                            {isSaving && <span className="text-xs text-slate-500 italic">Saving...</span>}
                        </div>
                        <div className="flex gap-x-3">
                            <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.close')}</button>
                            <button type="button" onClick={handlePrint} className="bg-white border border-indigo-600 text-indigo-600 px-4 py-2 rounded-md hover:bg-indigo-50">{t('buttons.print')}</button>
                            <button type="button" onClick={handleSaveAsPdf} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('buttons.saveAsPdf')}</button>
                        </div>
                    </footer>
                </div>
            </div>
            <ImageCropperModal
                isOpen={cropperState.isOpen}
                src={cropperState.src}
                onClose={() => setCropperState({ isOpen: false, src: null, imageIdToEdit: null })}
                onCropComplete={handleCropComplete}
            />
        </>
    );
};

export default BrochureWizardModal;