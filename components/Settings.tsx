import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useModals } from '../contexts/ModalContext';
import { ChecklistTemplate, CostingSettings, PresetCost, DisplaySettings, AISettings, CompanyInfo, Order, Product, Project, ProjectStatus, Task, CustomsBook, CustomsBookCell, CustomsBookRowHeight, CustomsBookMerge } from '../types';
import { useSettings } from '../hooks/useSettings';
import { db } from '../db';
import NumericInput from './NumericInput';
import { usePresetCosts } from '../hooks/usePresetCosts';
import Select from './Select';
import CategoryManager from './CategoryManager';
import ChartOfAccounts from './ChartOfAccounts';
import SystemCheckPanel from './SystemCheckPanel';


interface TemplateSettingsProps {
    templates?: ChecklistTemplate[];
    onNew: () => void;
    onEdit: (template: ChecklistTemplate) => void;
    onDeleteTemplate: (templateId: string) => void;
}

const TemplateSettings: React.FC<TemplateSettingsProps> = ({ templates, onNew, onEdit, onDeleteTemplate }) => {
    const { t } = useTranslation();
    const { showConfirmation } = useModals();

    const handleDelete = (template: ChecklistTemplate) => {
        showConfirmation({
            title: t('settings.templates.deleteTitle'),
            message: t('settings.templates.deleteBody', { name: template.name }),
            onConfirm: () => onDeleteTemplate(template.id),
        });
    };

    return (
        <div className="p-4 sm:p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800">{t('settings.templates.title')}</h2>
                <button onClick={onNew} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-semibold">
                    {t('settings.templates.new')}
                </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
                <ul className="divide-y divide-slate-200">
                    {(templates || []).map(template => (
                        <li key={template.id} className="p-4 flex justify-between items-center">
                            <div>
                                <p className="font-semibold text-slate-800">{template.name}</p>
                                <p className="text-sm text-slate-500">{template.description}</p>
                            </div>
                            <div className="flex items-center gap-x-2">
                                <button onClick={() => onEdit(template)} className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm">{t('buttons.edit')}</button>
                                <button onClick={() => handleDelete(template)} className="text-red-600 hover:text-red-800 font-semibold text-sm">{t('buttons.delete')}</button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

const PresetCostsSettings: React.FC = () => {
    const { t } = useTranslation();
    const { presetCosts, addPresetCost, updatePresetCost, deletePresetCost } = usePresetCosts();
    const [editingCost, setEditingCost] = useState<PresetCost | null>(null);
    const [newCost, setNewCost] = useState<Omit<PresetCost, 'id'>>({ name_en: '', name_fa: '', defaultAmount: 0 });

    const handleSave = (cost: PresetCost) => {
        updatePresetCost(cost.id, { name_en: cost.name_en, name_fa: cost.name_fa, defaultAmount: cost.defaultAmount });
        setEditingCost(null);
    };

    const handleAdd = () => {
        if (!newCost.name_en.trim() || !newCost.name_fa.trim()) return;
        addPresetCost(newCost);
        setNewCost({ name_en: '', name_fa: '', defaultAmount: 0 });
    };

    const handleEditChange = <K extends keyof PresetCost>(field: K, value: PresetCost[K]) => {
        if (!editingCost) return;
        setEditingCost(prev => (prev ? { ...prev, [field]: value } : null));
    };

    return (
        <div className="p-4 sm:p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{t('settings.presetCosts.title')}</h2>
            <p className="text-sm text-slate-600 mb-4">{t('settings.presetCosts.description')}</p>
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
                <div className="divide-y divide-slate-200">
                    {presetCosts.map(cost => (
                        editingCost?.id === cost.id ? (
                            <div key={cost.id} className="p-2 bg-indigo-50 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                                <input type="text" value={editingCost.name_en} onChange={e => handleEditChange('name_en', e.target.value)} className="bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/>
                                <input type="text" value={editingCost.name_fa} onChange={e => handleEditChange('name_fa', e.target.value)} className="bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" dir="rtl"/>
                                <NumericInput value={editingCost.defaultAmount} onChange={v => handleEditChange('defaultAmount', v)} />
                                <div className="flex items-center gap-x-2">
                                    <button onClick={() => handleSave(editingCost)} className="text-green-600 hover:text-green-800 font-semibold text-sm">{t('buttons.save')}</button>
                                    <button onClick={() => setEditingCost(null)} className="text-slate-600 hover:text-slate-800 font-semibold text-sm">{t('common.cancel')}</button>
                                </div>
                            </div>
                        ) : (
                            <div key={cost.id} className="p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                                <p className="font-semibold text-slate-800">{cost.name_en}</p>
                                <p className="text-slate-700" dir="rtl">{cost.name_fa}</p>
                                <p className="font-mono text-slate-600">{cost.defaultAmount.toLocaleString()}</p>
                                <div className="flex items-center gap-x-2">
                                    <button onClick={() => setEditingCost(cost)} className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm">{t('buttons.edit')}</button>
                                    <button onClick={() => deletePresetCost(cost.id)} className="text-red-600 hover:text-red-800 font-semibold text-sm">{t('buttons.delete')}</button>
                                </div>
                            </div>
                        )
                    ))}
                </div>
                <div className="p-2 bg-slate-50 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                     <input type="text" placeholder={t('settings.presetCosts.nameEn') as string} value={newCost.name_en} onChange={e => setNewCost(p => ({...p, name_en: e.target.value}))} className="bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/>
                     <input type="text" placeholder={t('settings.presetCosts.nameFa') as string} value={newCost.name_fa} onChange={e => setNewCost(p => ({...p, name_fa: e.target.value}))} className="bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm" dir="rtl"/>
                     <NumericInput value={newCost.defaultAmount} onChange={v => setNewCost(p => ({...p, defaultAmount: v}))} />
                     <button onClick={handleAdd} className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-md hover:bg-indigo-200 text-sm font-semibold">{t('settings.presetCosts.addCost')}</button>
                </div>
            </div>
        </div>
    );
};

const CompanyInfoSettings: React.FC = () => {
    const { t } = useTranslation();
    const { settings, updateSetting } = useSettings();
    const { addToast } = useModals();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [info, setInfo] = useState<CompanyInfo>({ en: '', fa: '' });
    const [logo, setLogo] = useState<string | null>(null);

    useEffect(() => {
        const infoSetting = settings.find(s => s.key === 'companyInfo');
        if (infoSetting) {
            // Handle backward compatibility for old string format
            if (typeof infoSetting.value === 'string') {
                setInfo({ en: infoSetting.value, fa: '' });
            } else {
                setInfo(infoSetting.value || { en: '', fa: '' });
            }
        }
        
        const logoSetting = settings.find(s => s.key === 'companyLogo');
        setLogo(logoSetting?.value || null);
    }, [settings]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogo(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
        if (event.target) {
            event.target.value = '';
        }
    };

    const handleDeleteLogo = () => {
        setLogo(null);
    };

    const handleSave = () => {
        Promise.all([
            updateSetting('companyInfo', info),
            updateSetting('companyLogo', logo || '')
        ]).then(() => {
            addToast(t('settings.costing.saveSuccess'), 'success');
        });
    };

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">{t('settings.companyInfo.title')}</h2>
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h3 className="font-semibold text-slate-800">{t('settings.companyInfo.logoHeader')}</h3>
                    <div className="mt-2 flex items-center gap-x-4">
                        <div className="w-24 h-24 bg-slate-100 rounded-md border border-slate-300 flex items-center justify-center overflow-hidden">
                            {logo ? (
                                <img src={logo} alt={t('settings.companyInfo.logoPreview')} className="max-w-full max-h-full object-contain" />
                            ) : (
                                <span className="text-xs text-slate-400">{t('settings.companyInfo.logoPreview')}</span>
                            )}
                        </div>
                        <div className="space-y-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept="image/png, image/jpeg, image/gif, image/svg+xml"
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-300 text-sm font-semibold"
                            >
                                {logo ? t('settings.companyInfo.changeLogo') : t('settings.companyInfo.uploadLogo')}
                            </button>
                            {logo && (
                                <button
                                    type="button"
                                    onClick={handleDeleteLogo}
                                    className="text-red-600 hover:text-red-800 font-semibold text-sm"
                                >
                                    {t('settings.companyInfo.deleteLogo')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                 <div>
                    <h3 className="font-semibold text-slate-800">{t('settings.companyInfo.addressHeader')} (English)</h3>
                    <textarea
                        value={info.en}
                        onChange={(e) => setInfo(prev => ({ ...prev, en: e.target.value }))}
                        rows={6}
                        className="mt-2 w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500 font-mono"
                    />
                </div>
                 <div className="md:col-span-2">
                    <h3 className="font-semibold text-slate-800">{t('settings.companyInfo.addressHeader')} (Farsi)</h3>
                    <textarea
                        value={info.fa}
                        onChange={(e) => setInfo(prev => ({ ...prev, fa: e.target.value }))}
                        rows={6}
                        dir="rtl"
                        className="mt-2 w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500 font-sans"
                    />
                </div>
            </div>
            <div className="flex justify-end">
                <button onClick={handleSave} className="bg-indigo-600 text-white px-5 py-2 rounded-md hover:bg-indigo-700 text-sm font-semibold shadow-sm">
                    {t('buttons.save')}
                </button>
            </div>
        </div>
    );
};

const FileSystemSettings: React.FC = () => {
    const { t } = useTranslation();
    const { settings, updateSetting } = useSettings();
    const { addToast } = useModals();
    const [folderStructure, setFolderStructure] = useState<string[]>([]);
    const [newFolderName, setNewFolderName] = useState('');

    const rootPath = useMemo(() => settings.find(s => s.key === 'fileSystemRootPath')?.value, [settings]);
    const fsSetting = useMemo(() => settings.find(s => s.key === 'folderStructure'), [settings]);

    useEffect(() => {
        if (fsSetting) {
            setFolderStructure(fsSetting.value);
        }
    }, [fsSetting]);

    const handleFolderChange = (index: number, value: string) => {
        const newStructure = [...folderStructure];
        newStructure[index] = value;
        setFolderStructure(newStructure);
    };

    const handleAddFolder = () => {
        if (newFolderName.trim() && !folderStructure.includes(newFolderName.trim())) {
            setFolderStructure([...folderStructure, newFolderName.trim()]);
            setNewFolderName('');
        }
    };

    const handleDeleteFolder = (index: number) => {
        setFolderStructure(folderStructure.filter((_, i) => i !== index));
    };

    const handleSaveChanges = () => {
        updateSetting('folderStructure', folderStructure);
        addToast(t('toasts.settings.folderStructureSaved'), 'success');
    };
    
    const handleChangeDirectory = async () => {
        try {
            const newPath = await (window as any).electronAPI.getRootPath();
            if (newPath) {
                await updateSetting('fileSystemRootPath', newPath);
                addToast(t('toasts.settings.rootDirectoryUpdated'), "success");
            }
        } catch(e) {
            console.error(e);
            addToast(t('toasts.settings.rootDirectoryError'), "error");
        }
    }

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-800">{t('settings.fileSystem.title')}</h2>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                 <h3 className="font-semibold text-slate-800">{t('settings.fileSystem.rootDirectory')}</h3>
                 <p className="text-sm text-slate-500 mt-2 break-all">{rootPath ? `Set to: ${rootPath}` : t('settings.fileSystem.notSet')}</p>
                 <button onClick={handleChangeDirectory} className="mt-3 bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-300 text-sm font-semibold">{t('settings.fileSystem.changeDirectory')}</button>
            </div>
             <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                 <h3 className="font-semibold text-slate-800">{t('settings.fileSystem.folderStructure')}</h3>
                 <p className="text-sm text-slate-500 mt-2">{t('settings.fileSystem.folderStructureDesc')}</p>
                 <div className="mt-4 space-y-2">
                    {folderStructure.map((folder, index) => (
                        <div key={index} className="flex items-center gap-x-2">
                            <input
                                type="text"
                                value={folder}
                                onChange={(e) => handleFolderChange(index, e.target.value)}
                                className="flex-1 bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"
                            />
                            <button onClick={() => handleDeleteFolder(index)} className="text-red-500 hover:text-red-700 p-1">
                                {t('buttons.delete')}
                            </button>
                        </div>
                    ))}
                 </div>
                  <div className="mt-4 flex items-center gap-x-2 border-t border-slate-200 pt-4">
                    <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder={t('settings.fileSystem.folderName') as string}
                        className="flex-1 bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"
                    />
                    <button onClick={handleAddFolder} className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-md hover:bg-indigo-200 text-sm font-semibold">
                        {t('settings.fileSystem.addFolder')}
                    </button>
                </div>
                <div className="mt-4 text-right">
                    <button onClick={handleSaveChanges} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-semibold">
                        {t('buttons.save')}
                    </button>
                </div>
            </div>
        </div>
    );
}

const BackupRestoreSettings: React.FC<{ onOpenRecovery: () => void; }> = ({ onOpenRecovery }) => {
    const { t } = useTranslation();
    const { settings, updateSetting } = useSettings();
    const { addToast, showConfirmation } = useModals();
    const [userDataPath, setUserDataPath] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const backupDefaultPath = useMemo(() => settings.find(s => s.key === 'backupDefaultPath')?.value, [settings]);

    useEffect(() => {
        if ((window as any).electronAPI?.getUserDataPath) {
            (window as any).electronAPI.getUserDataPath().then((path: string) => {
                if (path) {
                    setUserDataPath(path);
                }
            }).catch((err: Error) => console.error("Failed to get user data path:", err));
        }
    }, []);

    const handleSelectBackupPath = async () => {
        if ((window as any).electronAPI?.getRootPath) {
            try {
                const path = await (window as any).electronAPI.getRootPath();
                if (path) {
                    await updateSetting('backupDefaultPath', path);
                    addToast(t('toasts.settings.backupLocationSet'), 'success');
                }
            } catch (err) {
                console.error("Error setting backup path:", err);
                addToast(t('toasts.settings.backupLocationError'), "error");
            }
        } else {
            addToast(t('toasts.settings.rootDirectoryError'), "error");
        }
    };

    const handleExport = async () => {
        setIsLoading(true);
        try {
            const allTables = await (db as any).transaction('r', (db as any).tables, async () => {
                const data: Record<string, any[]> = {};
                for (const table of (db as any).tables) {
                    let tableData = await table.toArray();
    
                    // Helper function to strip 'data' field from an object
                    const stripBinaryData = (obj: any, fields: string[]) => {
                        if (!obj) return obj;
                        const newObj = { ...obj };
                        for (const field of fields) {
                            delete newObj[field];
                        }
                        return newObj;
                    };
    
                    // Define which fields to strip for which tables
                    const fieldsToStrip: { [tableName: string]: string[] } = {
                        productAttachments: ['data'],
                        productImages: ['data'],
                    };

                    if (fieldsToStrip[table.name]) {
                        tableData = tableData.map((record: any) => stripBinaryData(record, fieldsToStrip[table.name]));
                    } else if (table.name === 'orders') {
                        tableData = tableData.map((order: any) => {
                            const newOrder = { ...order };
                            if (newOrder.attachments) {
                                newOrder.attachments = newOrder.attachments.map((att: any) => stripBinaryData(att, ['data']));
                            }
                            if (newOrder.items) {
                                newOrder.items = newOrder.items.map((item: any) => {
                                    if (item.attachments) {
                                        return { ...item, attachments: item.attachments.map((att: any) => stripBinaryData(att, ['data'])) };
                                    }
                                    return item;
                                });
                            }
                            return newOrder;
                        });
                    } else if (table.name === 'products') {
                         tableData = tableData.map((product: any) => {
                            const newProduct = { ...product };
                            if (newProduct.attachments) {
                                newProduct.attachments = newProduct.attachments.map((att: any) => stripBinaryData(att, ['data']));
                            }
                             if (newProduct.images) {
                                newProduct.images = newProduct.images.map((img: any) => stripBinaryData(img, ['data']));
                            }
                            return newProduct;
                        });
                    }
    
                    data[table.name] = tableData;
                }
                return data;
            });

            const jsonString = JSON.stringify(allTables, null, 2);
            
            if ((window as any).electronAPI?.saveBackupFile) {
                const defaultFileName = `newland-data-backup-${new Date().toISOString().split('T')[0]}.json`;
                const defaultPath = backupDefaultPath ? `${backupDefaultPath}/${defaultFileName}` : defaultFileName;

                const result = await (window as any).electronAPI.saveBackupFile({
                    jsonData: jsonString,
                    defaultPath: defaultPath,
                });

                if (result.success) {
                    addToast(t('toasts.settings.backupSuccess', { filePath: result.filePath }), 'success');
                } else if (result.error && !result.error.toLowerCase().includes('cancel')) {
                    throw new Error(result.error);
                }
            } else {
                const link = document.createElement("a");
                link.href = `data:text/json;charset=utf-8,${encodeURIComponent(jsonString)}`;
                link.download = `newland-data-backup-${new Date().toISOString().split('T')[0]}.json`;
                link.click();
            }
        } catch (error) {
            console.error("Failed to backup data:", error);
            addToast(`Error backing up data: ${(error as Error).message}`, "error");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleExportMedia = async () => {
        if (!(window as any).electronAPI?.saveMediaBackup) {
            addToast("Media export is only available in the desktop app.", "error");
            return;
        }

        setIsLoading(true);
        try {
            const allProducts = await db.products.toArray();
            const allOrders = await db.orders.toArray();
            
            const allMediaData: { productCode: string, type: 'image' | 'attachment', fileName: string, base64Data: string }[] = [];

            // Helper to convert ArrayBuffer to base64
            const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
                let binary = '';
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                return window.btoa(binary);
            };

            // Gather product media
            for (const product of allProducts) {
                if (product.images) {
                    for (const image of product.images) {
                        allMediaData.push({
                            productCode: product.internalCode,
                            type: 'image',
                            fileName: image.name,
                            base64Data: image.data.split(',')[1] // Remove data URL prefix
                        });
                    }
                }
                if (product.attachments) {
                     for (const attachment of product.attachments) {
                        allMediaData.push({
                            productCode: product.internalCode,
                            type: 'attachment',
                            fileName: attachment.name,
                            base64Data: arrayBufferToBase64(attachment.data)
                        });
                    }
                }
            }
            
            // Gather order media (less common but possible)
            for (const order of allOrders) {
                // Order-level attachments
                if (order.attachments) {
                    for (const attachment of order.attachments) {
                        allMediaData.push({
                            productCode: `_ORDER_${order.id}`,
                            type: 'attachment',
                            fileName: attachment.name,
                            base64Data: arrayBufferToBase64(attachment.data)
                        });
                    }
                }
                // Item-level attachments
                 for (const item of order.items) {
                    if (item.attachments) {
                         for (const attachment of item.attachments) {
                            allMediaData.push({
                                productCode: item.internalCode || item.productName,
                                type: 'attachment',
                                fileName: attachment.name,
                                base64Data: arrayBufferToBase64(attachment.data)
                            });
                        }
                    }
                }
            }
            
            const result = await (window as any).electronAPI.saveMediaBackup(allMediaData);

            if (result.success) {
                addToast(t('toasts.settings.mediaExportSuccess', { count: result.filesSaved }), 'success');
            } else if (result.error && !result.error.toLowerCase().includes('cancel')) {
                throw new Error(result.error);
            }

        } catch (error) {
             console.error("Failed to export media:", error);
            addToast(t('toasts.settings.mediaExportError', { message: (error as Error).message }), "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target?.result as string);
                    if (data && typeof data === 'object') {
                        showConfirmation({
                            title: t('settings.backup.importConfirmation'),
                            message: "This will overwrite all existing data in the application.",
                            onConfirm: async () => {
                                 await (db as any).transaction('rw', (db as any).tables, async () => {
                                    for (const table of (db as any).tables) {
                                        if (data[table.name] && Array.isArray(data[table.name])) {
                                            // Clear any default data from seeding before putting backup data
                                            await table.clear();
                                            await table.bulkPut(data[table.name]);
                                        }
                                    }
                                });
                                addToast(t('settings.backup.restoreSuccess'), 'success');
                                setTimeout(() => window.location.reload(), 1000);
                            }
                        });
                    } else {
                        addToast(t('settings.backup.invalidFile'), 'error');
                    }
                } catch (error) {
                    console.error("Failed to restore data:", error);
                    addToast(t('settings.backup.restoreError'), 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleSelectiveExport = async (moduleName: 'orders' | 'products' | 'projects' | 'customsBook') => {
        setIsLoading(true);
        try {
            const dataToExport: { module: string; version: number; timestamp: string; data: any } = {
                module: moduleName,
                version: 1,
                timestamp: new Date().toISOString(),
                data: null,
            };

            await (db as any).transaction('r', (db as any).tables, async () => {
                switch (moduleName) {
                    case 'orders':
                        dataToExport.data = await db.orders.toArray();
                        break;
                    case 'products':
                        dataToExport.data = await db.products.toArray();
                        break;
                    case 'projects':
                        dataToExport.data = {
                            projects: await db.projects.toArray(),
                            statuses: await db.projectStatuses.toArray(),
                            tasks: await db.tasks.toArray(),
                        };
                        break;
                    case 'customsBook':
                        dataToExport.data = {
                            books: await db.customsBooks.toArray(),
                            cells: await db.customsBookCells.toArray(),
                            rowHeights: await db.customsBookRowHeights.toArray(),
                            merges: await db.customsBookMerges.toArray(),
                        };
                        break;
                    default:
                        throw new Error(`Unknown module for export: ${moduleName}`);
                }
            });

            const jsonString = JSON.stringify(dataToExport, null, 2);
            const defaultFileName = `newland-export_${moduleName}_${new Date().toISOString().split('T')[0]}.json`;

            if ((window as any).electronAPI?.saveBackupFile) {
                const result = await (window as any).electronAPI.saveBackupFile({ jsonData: jsonString, defaultPath: defaultFileName });
                if (result.success) addToast(t('toasts.settings.exportSuccess', { module: moduleName }), 'success');
                else if (result.error && !result.error.toLowerCase().includes('cancel')) throw new Error(result.error);
            } else {
                const link = document.createElement("a");
                link.href = `data:text/json;charset=utf-8,${encodeURIComponent(jsonString)}`;
                link.download = defaultFileName;
                link.click();
            }
        } catch (error) {
            addToast(t('toasts.settings.exportError', { message: (error as Error).message }), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectiveImport = (expectedModule: 'orders' | 'products' | 'projects' | 'customsBook') => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            setIsLoading(true);
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target?.result as string);
                    if (!data.module || data.module !== expectedModule) {
                        throw new Error(t('toasts.settings.importInvalidFile', { expected: expectedModule, got: data.module || 'unknown' }));
                    }

                    showConfirmation({
                        title: t('settings.backup.selectiveImportTitle', { module: expectedModule }),
                        message: t('settings.backup.selectiveImportBody', { module: expectedModule }),
                        variant: 'primary',
                        onConfirm: async () => {
                            try {
                                setIsLoading(true);
                                switch (expectedModule) {
                                    case 'orders':
                                        await db.orders.bulkPut(data.data as Order[]);
                                        break;
                                    case 'products':
                                        await db.products.bulkPut(data.data as Product[]);
                                        break;
                                    case 'projects':
                                        await (db as any).transaction('rw', db.projects, db.projectStatuses, db.tasks, async () => {
                                            await db.projects.bulkPut(data.data.projects as Project[]);
                                            await db.projectStatuses.bulkPut(data.data.statuses as ProjectStatus[]);
                                            await db.tasks.bulkPut(data.data.tasks as Task[]);
                                        });
                                        break;
                                    case 'customsBook':
                                        await (db as any).transaction('rw', db.customsBooks, db.customsBookCells, db.customsBookRowHeights, db.customsBookMerges, async () => {
                                            await db.customsBooks.bulkPut(data.data.books as CustomsBook[]);
                                            await db.customsBookCells.bulkPut(data.data.cells as CustomsBookCell[]);
                                            await db.customsBookRowHeights.bulkPut(data.data.rowHeights as CustomsBookRowHeight[]);
                                            await db.customsBookMerges.bulkPut(data.data.merges as CustomsBookMerge[]);
                                        });
                                        break;
                                }
                                addToast(t('toasts.settings.importSuccess', { module: expectedModule }), 'success');
                            } catch (importError) {
                                throw importError;
                            } finally {
                                setIsLoading(false);
                            }
                        },
                        onCancel: () => setIsLoading(false),
                    });
                } catch (error) {
                    addToast(t('toasts.settings.importError', { message: (error as Error).message }), 'error');
                } finally {
                    if (!isConfirmationOpen()) {
                       setIsLoading(false);
                    }
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const isConfirmationOpen = () => {
        // A simple check to see if our modal is likely open to prevent flicker
        return document.querySelector('[role="dialog"]') !== null;
    }


    const handleReset = () => {
        showConfirmation({
            title: t('confirmationModal.resetAppTitle'),
            message: t('confirmationModal.resetAppBody'),
            variant: 'destructive',
            confirmText: t('settings.backup.resetButton'),
            requireCode: true,
            confirmationCode: 'RESET',
            onConfirm: async () => {
                try {
                    await (db as any).delete();
                    addToast(t('toasts.settings.resetSuccess'), "success");
                    setTimeout(() => window.location.reload(), 1500);
                } catch (error) {
                    console.error("Failed to reset database:", error);
                    let message = "Failed to reset database. ";
                    if (error instanceof Error && error.name === "InvalidStateError") {
                        message += "Another tab might be open. Please close all tabs of this application and try again.";
                    } else if (error instanceof Error) {
                        message += error.message;
                    }
                    addToast(message, "error");
                }
            }
        });
    };
    
    const handlePurgeMedia = () => {
        showConfirmation({
            title: t('settings.backup.deleteAllMediaConfirmTitle'),
            message: t('settings.backup.deleteAllMediaConfirmBody'),
            variant: 'destructive',
            confirmText: t('settings.backup.deleteAllMedia'),
            requireCode: true,
            confirmationCode: 'DELETE MEDIA',
            onConfirm: async () => {
                try {
                    setIsLoading(true);
                    const count = await db.products
                        .filter(p => (p.images && p.images.length > 0) || (p.attachments && p.attachments.length > 0))
                        .modify({ images: [], attachments: [] });
                    
                    addToast(t('settings.backup.deleteAllMediaSuccess', { count }), "success");
                } catch (error) {
                    console.error("Failed to purge media:", error);
                    addToast("Failed to delete media.", "error");
                } finally {
                    setIsLoading(false);
                }
            }
        });
    };

    const selectiveModules: { key: 'orders' | 'products' | 'projects' | 'customsBook'; label: string }[] = [
        { key: 'orders', label: t('sidebar.orders') },
        { key: 'products', label: t('sidebar.products') },
        { key: 'projects', label: t('sidebar.projects') },
        { key: 'customsBook', label: t('sidebar.customsBook') },
    ];


    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-800">{t('settings.backup.title')}</h2>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                 <h3 className="font-semibold text-slate-800">{t('settings.backup.fullBackupTitle')}</h3>
                 <p className="text-sm text-slate-600 mt-1">{t('settings.backup.description')}</p>
                 {userDataPath && (
                    <div className="mt-4 p-3 bg-slate-100 rounded-md border border-slate-200">
                        <p className="text-xs font-semibold text-slate-600">{t('settings.backup.currentDataPath')}</p>
                        <code className="text-sm text-slate-800 break-all">{userDataPath}</code>
                    </div>
                 )}
                 <div className="mt-4 pt-4 border-t border-slate-200">
                    <h4 className="font-semibold text-slate-800">{t('settings.backup.defaultBackupLocation')}</h4>
                    <p className="text-sm text-slate-500 mt-1 break-all">
                        {backupDefaultPath || t('settings.fileSystem.notSet')}
                    </p>
                    <button onClick={handleSelectBackupPath} className="mt-2 bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-300 text-sm font-semibold">
                        {t('settings.backup.selectLocation')}
                    </button>
                </div>
                 <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col gap-y-4">
                    {/* Data Export */}
                    <div>
                        <button onClick={handleExport} disabled={isLoading} className="bg-slate-600 text-white px-4 py-2 rounded-md hover:bg-slate-700 text-sm font-semibold flex items-center gap-x-2 disabled:opacity-50">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                            {t('settings.backup.exportButtonWithoutMedia')}
                        </button>
                    </div>
                    {/* Media Export */}
                    <div>
                        <button onClick={handleExportMedia} disabled={isLoading} className="bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700 text-sm font-semibold flex items-center gap-x-2 disabled:opacity-50">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                            {t('settings.backup.exportMediaButton')}
                        </button>
                        <p className="text-xs text-slate-500 mt-1">{t('settings.backup.exportMediaDescription')}</p>
                    </div>
                     {/* Import */}
                     <div>
                        <button onClick={handleImport} disabled={isLoading} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-semibold flex items-center gap-x-2 disabled:opacity-50">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            {t('settings.backup.importButton')}
                        </button>
                     </div>
                 </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-300">
                <h3 className="text-lg font-bold text-slate-800">{t('settings.backup.selectiveTitle')}</h3>
                <p className="text-sm text-slate-600 mt-2">{t('settings.backup.selectiveDescription')}</p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectiveModules.map(module => (
                        <div key={module.key} className="bg-white border border-slate-200 rounded-lg p-4 flex justify-between items-center">
                            <span className="font-semibold text-slate-700">{module.label}</span>
                            <div className="flex gap-x-2">
                                <button onClick={() => handleSelectiveExport(module.key)} disabled={isLoading} className="text-sm font-semibold text-indigo-600 px-3 py-1 rounded hover:bg-indigo-50 disabled:opacity-50">Export</button>
                                <button onClick={() => handleSelectiveImport(module.key)} disabled={isLoading} className="text-sm font-semibold text-indigo-600 px-3 py-1 rounded hover:bg-indigo-50 disabled:opacity-50">Import</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>


            <div className="mt-8 pt-6 border-t border-red-300">
                <h3 className="text-lg font-bold text-red-700">{t('settings.backup.dangerZone')}</h3>
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-x-4">
                    <div className="flex-shrink-0">
                        <svg className="h-6 w-6 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-amber-800">{t('settings.backup.manualRecoveryDescription')}</p>
                        <button onClick={onOpenRecovery} className="mt-3 bg-amber-500 text-white px-4 py-2 rounded-md hover:bg-amber-600 text-sm font-semibold">
                            {t('settings.backup.openRecoveryMode')}
                        </button>
                    </div>
                </div>
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-x-4">
                    <div className="flex-shrink-0">
                        <svg className="h-6 w-6 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-red-800">{t('settings.backup.resetDescription')}</p>
                        <button onClick={handleReset} disabled={isLoading} className="mt-3 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 text-sm font-semibold disabled:opacity-50">
                            {t('settings.backup.resetButton')}
                        </button>
                    </div>
                </div>
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-x-4">
                    <div className="flex-shrink-0">
                        <svg className="h-6 w-6 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-red-800">{t('settings.backup.deleteAllMediaDescription')}</p>
                        <button onClick={handlePurgeMedia} disabled={isLoading} className="mt-3 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 text-sm font-semibold disabled:opacity-50">
                            {t('settings.backup.deleteAllMedia')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

const CostingSettingsPanel: React.FC<{ settingsKey: string; title: string }> = ({ settingsKey, title }) => {
    const { t } = useTranslation();
    const { settings, updateSetting } = useSettings();
    const { addToast } = useModals();
    const [costingSettings, setCostingSettings] = useState<CostingSettings | null>(null);

    useEffect(() => {
        const setting = settings.find(s => s.key === settingsKey);
        if (setting) {
            setCostingSettings(setting.value as CostingSettings);
        }
    }, [settings, settingsKey]);

    const handleNestedChange = (path: string, value: any) => {
        if (!costingSettings) return;
        const keys = path.split('.');
        setCostingSettings(prev => {
            const newSettings = JSON.parse(JSON.stringify(prev)); // Deep copy
            let current = newSettings;
            for (let i = 0; i < keys.length - 1; i++) {
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            return newSettings;
        });
    };
    
    const handleSave = () => {
        if (costingSettings) {
            updateSetting(settingsKey, costingSettings);
            addToast(t('settings.costing.saveSuccess'), 'success');
        }
    };

    if (!costingSettings) return <div>Loading settings...</div>;

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
                <button onClick={handleSave} className="bg-indigo-600 text-white px-5 py-2 rounded-md hover:bg-indigo-700 text-sm font-semibold shadow-sm">
                    {t('buttons.save')}
                </button>
            </div>
            
            {/* FX Central Rates Matrix (Single Source of Truth) */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
                            نرخ‌های پایه برابری ارز و تسعیر (FX Rates Matrix)
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            منبع واحد حقیقت (SSOT) برای محاسبات بهای تمام‌شده، فاکتورها، حسابداری و قیمت‌گذاری کالاها
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
                            ارز پایه محاسبات: USD & AED
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                        <NumericInput 
                            label="نرخ برابری دلار به درهم (USD ➔ AED)" 
                            value={costingSettings.fx?.usd_aed ?? 3.6725} 
                            onChange={v => handleNestedChange('fx.usd_aed', v)} 
                        />
                        <p className="text-[11px] text-slate-500 mt-1.5 font-mono">
                            1 USD = {(costingSettings.fx?.usd_aed ?? 3.6725).toLocaleString()} AED
                        </p>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                        <NumericInput 
                            label="نرخ برابری درهم به تومان (AED ➔ TOMAN)" 
                            value={costingSettings.fx?.aed_toman ?? 27000} 
                            onChange={v => handleNestedChange('fx.aed_toman', v)} 
                        />
                        <p className="text-[11px] text-slate-500 mt-1.5 font-mono">
                            1 AED = {(costingSettings.fx?.aed_toman ?? 27000).toLocaleString()} تومان
                        </p>
                    </div>

                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                        <NumericInput 
                            label="نرخ برابری درهم به یوان (AED ➔ CNY)" 
                            value={costingSettings.fx?.aed_cny ?? 1.95} 
                            onChange={v => handleNestedChange('fx.aed_cny', v)} 
                        />
                        <p className="text-[11px] text-slate-500 mt-1.5 font-mono">
                            1 CNY = {(costingSettings.fx?.aed_cny ? (1 / costingSettings.fx.aed_cny).toFixed(4) : '0.5128')} AED
                        </p>
                    </div>
                </div>

                {/* Real-time Calculated Matrix Preview */}
                <div className="bg-amber-50/60 border border-amber-200/70 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700">
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold text-amber-900">برابری محاسبه شده دلار به تومان:</span>
                        <span className="font-mono font-bold text-amber-800">
                            1 USD = {((costingSettings.fx?.usd_aed ?? 3.6725) * (costingSettings.fx?.aed_toman ?? 27000)).toLocaleString()} تومان
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold text-amber-900">برابری دلار به یوان:</span>
                        <span className="font-mono font-bold text-amber-800">
                            1 USD = {((costingSettings.fx?.usd_aed ?? 3.6725) * (costingSettings.fx?.aed_cny ?? 1.95)).toFixed(3)} CNY
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold text-amber-900">برابری یوان به تومان:</span>
                        <span className="font-mono font-bold text-amber-800">
                            1 CNY = {Math.round((costingSettings.fx?.aed_cny ? (1 / costingSettings.fx.aed_cny) : 0.5128) * (costingSettings.fx?.aed_toman ?? 27000)).toLocaleString()} تومان
                        </span>
                    </div>
                </div>
            </div>

            {/* Iran Customs */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                 <h3 className="font-semibold text-slate-800 mb-4 pb-2 border-b">{t('settings.costing.iranCustoms')}</h3>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                    <NumericInput label={t('settings.costing.servicesTariffRate')} value={costingSettings.iranCustoms.servicesTariffRate} onChange={v => handleNestedChange('iranCustoms.servicesTariffRate', v)} />
                    <NumericInput label={t('settings.costing.importDutyRate')} value={costingSettings.iranCustoms.importDutyRate} onChange={v => handleNestedChange('iranCustoms.importDutyRate', v)} />
                    <NumericInput label={t('settings.costing.postCustomsVatRate')} value={costingSettings.iranCustoms.postCustomsVatRate} onChange={v => handleNestedChange('iranCustoms.postCustomsVatRate', v)} />
                    <NumericInput label={t('settings.costing.importVatRate')} value={costingSettings.iranCustoms.importVatRate} onChange={v => handleNestedChange('iranCustoms.importVatRate', v)} />
                    <NumericInput label={t('settings.costing.customsUsdRate')} value={costingSettings.iranCustoms.customsUsdRate} onChange={v => handleNestedChange('iranCustoms.customsUsdRate', v)} />
                    <NumericInput label={t('settings.costing.vatUsdRate')} value={costingSettings.iranCustoms.vatUsdRate} onChange={v => handleNestedChange('iranCustoms.vatUsdRate', v)} />
                    <NumericInput label={t('settings.costing.brokerFeePerCarton')} value={costingSettings.iranCustoms.brokerFeePerCarton} onChange={v => handleNestedChange('iranCustoms.brokerFeePerCarton', v)} />
                    <NumericInput label={t('settings.costing.servicesVatRate')} value={costingSettings.iranCustoms.servicesVatRate} onChange={v => handleNestedChange('iranCustoms.servicesVatRate', v)} />
                    <NumericInput label={t('settings.costing.standardFeeRate')} value={costingSettings.iranCustoms.standardFeeRate} onChange={v => handleNestedChange('iranCustoms.standardFeeRate', v)} />
                    <NumericInput label={t('settings.costing.standardFeeVatRate')} value={costingSettings.iranCustoms.standardFeeVatRate} onChange={v => handleNestedChange('iranCustoms.standardFeeVatRate', v)} />
                </div>
                 <h4 className="font-semibold text-slate-700 mt-6 mb-2 pb-2 border-b">{t('settings.costing.woodenShipFreight')}</h4>
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                     <NumericInput label={t('settings.costing.freightRate')} value={costingSettings.iranCustoms.woodenShipFreightRate} onChange={v => handleNestedChange('iranCustoms.woodenShipFreightRate', v)} />
                     <NumericInput label={t('settings.costing.freightVolume')} value={costingSettings.iranCustoms.woodenShipFreightVolume} onChange={v => handleNestedChange('iranCustoms.woodenShipFreightVolume', v)} />
                     <NumericInput label={t('settings.costing.woodenShipFreightVatRate')} value={costingSettings.iranCustoms.woodenShipFreightVatRate} onChange={v => handleNestedChange('iranCustoms.woodenShipFreightVatRate', v)} />
                </div>
                 <h4 className="font-semibold text-slate-700 mt-6 mb-2 pb-2 border-b">{t('settings.costing.inlandFreight')}</h4>
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                     <NumericInput label={t('settings.costing.freightRate')} value={costingSettings.iranCustoms.inlandFreightRate} onChange={v => handleNestedChange('iranCustoms.inlandFreightRate', v)} />
                     <NumericInput label={t('settings.costing.freightVolume')} value={costingSettings.iranCustoms.inlandFreightVolume} onChange={v => handleNestedChange('iranCustoms.inlandFreightVolume', v)} />
                     <NumericInput label={t('settings.costing.inlandFreightVatRate')} value={costingSettings.iranCustoms.inlandFreightVatRate} onChange={v => handleNestedChange('iranCustoms.inlandFreightVatRate', v)} />
                </div>
                 <h4 className="font-semibold text-slate-700 mt-6 mb-2 pb-2 border-b">{t('settings.costing.loadingUnloadingFees')}</h4>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                     <NumericInput label={t('settings.costing.unloadingFeePerTon')} value={costingSettings.iranCustoms.unloadingFeePerTon} onChange={v => handleNestedChange('iranCustoms.unloadingFeePerTon', v)} />
                     <NumericInput label={t('settings.costing.unloadingFeeVatRate')} value={costingSettings.iranCustoms.unloadingFeeVatRate} onChange={v => handleNestedChange('iranCustoms.unloadingFeeVatRate', v)} />
                     <NumericInput label={t('settings.costing.loadingFeePerTon')} value={costingSettings.iranCustoms.loadingFeePerTon} onChange={v => handleNestedChange('iranCustoms.loadingFeePerTon', v)} />
                     <NumericInput label={t('settings.costing.loadingFeeVatRate')} value={costingSettings.iranCustoms.loadingFeeVatRate} onChange={v => handleNestedChange('iranCustoms.loadingFeeVatRate', v)} />
                 </div>
            </div>
            
             {/* Pricing Tiers */}
             <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                 <h3 className="font-semibold text-slate-800 mb-4">{t('settings.costing.pricingTiers')}</h3>
                 
                 <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('settings.costing.calculationMethod')}</label>
                    <Select
                        value={costingSettings.pricingTiers.calculationMethod}
                        onChange={e => handleNestedChange('pricingTiers.calculationMethod', e.target.value)}
                    >
                        <option value="value">{t('settings.costing.markup')}</option>
                        <option value="margin">{t('settings.costing.margin')}</option>
                    </Select>
                </div>
                 
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    {(['tier1', 'tier2', 'tier3'] as const).map(tier => (
                        <div key={tier} className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-3">
                            <div className="flex justify-between items-center">
                                <input
                                    type="text"
                                    value={costingSettings.pricingTiers.metadata[tier].name}
                                    onChange={e => handleNestedChange(`pricingTiers.metadata.${tier}.name`, e.target.value)}
                                    className="flex-1 bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm font-semibold"
                                />
                                <input
                                    type="checkbox"
                                    checked={costingSettings.pricingTiers.metadata[tier].isActive}
                                    onChange={e => handleNestedChange(`pricingTiers.metadata.${tier}.isActive`, e.target.checked)}
                                    className="ml-3 h-5 w-5 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    id={`is-active-${tier}`}
                                    title="Active"
                                />
                            </div>
                            <div>
                                <NumericInput
                                    label={`AED ${costingSettings.pricingTiers.calculationMethod === 'margin' ? t('views.products.marginPercent') : t('views.products.markupPercent')}`}
                                    value={costingSettings.pricingTiers.aed[tier]}
                                    onChange={v => handleNestedChange(`pricingTiers.aed.${tier}`, v)}
                                />
                            </div>
                            <div>
                                <NumericInput
                                    label={`TOMAN ${costingSettings.pricingTiers.calculationMethod === 'margin' ? t('views.products.marginPercent') : t('views.products.markupPercent')}`}
                                    value={costingSettings.pricingTiers.toman[tier]}
                                    onChange={v => handleNestedChange(`pricingTiers.toman.${tier}`, v)}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* VAT */}
                 <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                     <h3 className="font-semibold text-slate-800">{t('settings.costing.vat')}</h3>
                     <div className="mt-3 space-y-3">
                         <div>
                            <label className="flex items-center gap-x-2"><input type="checkbox" checked={costingSettings.vat.aed.enabled} onChange={e => handleNestedChange('vat.aed.enabled', e.target.checked)}/> {t('settings.costing.aedVat')}</label>
                            <NumericInput value={costingSettings.vat.aed.value} onChange={v => handleNestedChange('vat.aed.value', v)} disabled={!costingSettings.vat.aed.enabled}/>
                         </div>
                         <div>
                            <label className="flex items-center gap-x-2"><input type="checkbox" checked={costingSettings.vat.toman.enabled} onChange={e => handleNestedChange('vat.toman.enabled', e.target.checked)}/> {t('settings.costing.tomanVat')}</label>
                            <NumericInput value={costingSettings.vat.toman.value} onChange={v => handleNestedChange('vat.toman.value', v)} disabled={!costingSettings.vat.toman.enabled}/>
                         </div>
                     </div>
                 </div>
                 {/* Rounding & Allocation */}
                 <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                    <h3 className="font-semibold text-slate-800">{t('settings.costing.rounding')} & {t('settings.costing.allocation')}</h3>
                     <div className="mt-3 space-y-3">
                        <NumericInput label={t('settings.costing.aedRoundingRule')} value={costingSettings.rounding.aed} onChange={v => handleNestedChange('rounding.aed', v)} />
                        <NumericInput label={t('settings.costing.tomanRoundingRule')} value={costingSettings.rounding.toman} onChange={v => handleNestedChange('rounding.toman', v)} />
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t('settings.costing.tomanDisplayDivisor')}</label>
                            <Select value={costingSettings.rounding.tomanDisplayDivisor} onChange={e => handleNestedChange('rounding.tomanDisplayDivisor', Number(e.target.value))}>
                                <option value={1}>1 (No division)</option>
                                <option value={1000}>1,000 (Thousands)</option>
                                <option value={10000}>10,000</option>
                                <option value={1000000}>1,000,000 (Millions)</option>
                            </Select>
                        </div>
                     </div>
                 </div>
            </div>
            
        </div>
    )
}

const DisplaySettingsPanel: React.FC<{
    settings: any[]; 
    updateSetting: (key: string, value: any) => void;
    fontScaleStep: number;
    setFontScaleStep: (step: number) => void;
}> = ({ settings, updateSetting, fontScaleStep, setFontScaleStep }) => {
    const { t } = useTranslation();
    const displaySettings = settings.find(s => s.key === 'displaySettings')?.value as DisplaySettings;

    const handleToggle = (path: string, value: boolean) => {
        if (!displaySettings) return;
        const keys = path.split('.');
        const newSettings = JSON.parse(JSON.stringify(displaySettings));
        let current = newSettings;
        for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        updateSetting('displaySettings', newSettings);
    };

    if (!displaySettings) return <div>Loading...</div>;

    const Toggle = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (val: boolean) => void }) => (
        <label className="flex items-center justify-between p-2 rounded hover:bg-slate-50 cursor-pointer">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
        </label>
    );

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                <h3 className="font-semibold text-slate-800 mb-4 pb-2 border-b">Font Size</h3>
                <div className="flex items-center gap-x-4">
                    <button onClick={() => setFontScaleStep(fontScaleStep - 1)} className="p-2 bg-slate-200 rounded hover:bg-slate-300">-</button>
                    <span className="font-mono">{fontScaleStep}</span>
                    <button onClick={() => setFontScaleStep(fontScaleStep + 1)} className="p-2 bg-slate-200 rounded hover:bg-slate-300">+</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                    <h3 className="font-semibold text-slate-800 mb-4 pb-2 border-b">{t('settings.display.kanbanCardTitle')}</h3>
                    <div className="space-y-1">
                        <Toggle label={t('settings.display.fieldInternalCode')} checked={displaySettings.kanbanCard.showInternalCode} onChange={(v) => handleToggle('kanbanCard.showInternalCode', v)} />
                        <Toggle label={t('settings.display.fieldOrderId')} checked={displaySettings.kanbanCard.showOrderId} onChange={(v) => handleToggle('kanbanCard.showOrderId', v)} />
                        <Toggle label={t('settings.display.fieldProgress')} checked={displaySettings.kanbanCard.showProgress} onChange={(v) => handleToggle('kanbanCard.showProgress', v)} />
                        <Toggle label={t('settings.display.fieldLoadingDate')} checked={displaySettings.kanbanCard.showLoadingDate} onChange={(v) => handleToggle('kanbanCard.showLoadingDate', v)} />
                        <Toggle label={t('settings.display.fieldItemsButton')} checked={displaySettings.kanbanCard.showItemsButton} onChange={(v) => handleToggle('kanbanCard.showItemsButton', v)} />
                        <Toggle label={t('settings.display.fieldArchiveButton')} checked={displaySettings.kanbanCard.showArchiveButton} onChange={(v) => handleToggle('kanbanCard.showArchiveButton', v)} />
                        <Toggle label={t('settings.display.fieldFilesButton')} checked={displaySettings.kanbanCard.showFilesButton} onChange={(v) => handleToggle('kanbanCard.showFilesButton', v)} />
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                    <h3 className="font-semibold text-slate-800 mb-4 pb-2 border-b">{t('settings.display.productCard.title')}</h3>
                    <div className="space-y-1">
                        <Toggle label={t('settings.display.productCard.showAedPricing')} checked={displaySettings.productCard.showAedPricing} onChange={(v) => handleToggle('productCard.showAedPricing', v)} />
                        <Toggle label={t('settings.display.productCard.showTomanPricing')} checked={displaySettings.productCard.showTomanPricing} onChange={(v) => handleToggle('productCard.showTomanPricing', v)} />
                        <Toggle label={t('settings.display.productCard.showLandedCost')} checked={displaySettings.productCard.showLandedCost} onChange={(v) => handleToggle('productCard.showLandedCost', v)} />
                        <Toggle label={t('settings.display.productCard.showPhysicalSpecs')} checked={displaySettings.productCard.showPhysicalSpecs} onChange={(v) => handleToggle('productCard.showPhysicalSpecs', v)} />
                        <Toggle label={t('settings.display.productCard.showCostBreakdown')} checked={displaySettings.productCard.showCostBreakdown} onChange={(v) => handleToggle('productCard.showCostBreakdown', v)} />
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                    <h3 className="font-semibold text-slate-800 mb-4 pb-2 border-b">{t('settings.display.listViewHeaderTitle')}</h3>
                     <div className="space-y-1">
                        <Toggle label={t('settings.display.fieldTotalValue')} checked={displaySettings.listViewHeader.showTotalValue} onChange={(v) => handleToggle('listViewHeader.showTotalValue', v)} />
                        <Toggle label={t('settings.display.fieldTotalDownPayment')} checked={displaySettings.listViewHeader.showTotalDownPayment} onChange={(v) => handleToggle('listViewHeader.showTotalDownPayment', v)} />
                        <Toggle label={t('settings.display.fieldTotalBalanceDue')} checked={displaySettings.listViewHeader.showTotalBalanceDue} onChange={(v) => handleToggle('listViewHeader.showTotalBalanceDue', v)} />
                        <Toggle label={t('settings.display.fieldVolume')} checked={displaySettings.listViewHeader.showVolume} onChange={(v) => handleToggle('listViewHeader.showVolume', v)} />
                        <Toggle label={t('settings.display.fieldTotalCartons')} checked={displaySettings.listViewHeader.showTotalCartons} onChange={(v) => handleToggle('listViewHeader.showTotalCartons', v)} />
                        <Toggle label={t('settings.display.fieldTotalGrossWeight')} checked={displaySettings.listViewHeader.showTotalGrossWeight} onChange={(v) => handleToggle('listViewHeader.showTotalGrossWeight', v)} />
                        <Toggle label={t('settings.display.fieldContainerInfo')} checked={displaySettings.listViewHeader.showContainerInfo} onChange={(v) => handleToggle('listViewHeader.showContainerInfo', v)} />
                    </div>
                </div>

                 <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                    <h3 className="font-semibold text-slate-800 mb-4 pb-2 border-b">{t('settings.display.dashboardTableTitle')}</h3>
                     <div className="space-y-1">
                        <Toggle label={t('settings.display.fieldOrderId')} checked={displaySettings.dashboardTable.showOrderId} onChange={(v) => handleToggle('dashboardTable.showOrderId', v)} />
                        <Toggle label={t('labels.supplier')} checked={displaySettings.dashboardTable.showSupplier} onChange={(v) => handleToggle('dashboardTable.showSupplier', v)} />
                        <Toggle label={t('settings.display.fieldInternalCode')} checked={displaySettings.dashboardTable.showInternalCode} onChange={(v) => handleToggle('dashboardTable.showInternalCode', v)} />
                        <Toggle label={t('orderModal.table.productName')} checked={displaySettings.dashboardTable.showDescription} onChange={(v) => handleToggle('dashboardTable.showDescription', v)} />
                        <Toggle label={t('labels.totalCartons')} checked={displaySettings.dashboardTable.showCartons} onChange={(v) => handleToggle('dashboardTable.showCartons', v)} />
                        <Toggle label={t('orderModal.table.itemsPerCarton')} checked={displaySettings.dashboardTable.showQtyPerCarton} onChange={(v) => handleToggle('dashboardTable.showQtyPerCarton', v)} />
                        <Toggle label={t('orderModal.table.quantity')} checked={displaySettings.dashboardTable.showTotalQty} onChange={(v) => handleToggle('dashboardTable.showTotalQty', v)} />
                        <Toggle label={t('labels.orderDate')} checked={displaySettings.dashboardTable.showOrderDate} onChange={(v) => handleToggle('dashboardTable.showOrderDate', v)} />
                        <Toggle label={t('labels.loadingDate')} checked={displaySettings.dashboardTable.showLoadingDate} onChange={(v) => handleToggle('dashboardTable.showLoadingDate', v)} />
                        <Toggle label={t('labels.status')} checked={displaySettings.dashboardTable.showStatus} onChange={(v) => handleToggle('dashboardTable.showStatus', v)} />
                    </div>
                </div>
            </div>
        </div>
    );
};

const AISettingsPanel: React.FC<{
    aiSettings?: AISettings;
    updateSetting: (key: string, value: any) => void;
}> = ({ aiSettings, updateSetting }) => {
    const { t } = useTranslation();
    const [apiKey, setApiKey] = useState(aiSettings?.apiKey || '');
    const [showKey, setShowKey] = useState(false);

    const handleSave = () => {
        const newSettings: AISettings = {
            ...aiSettings,
            apiKey: apiKey.trim(),
            // Default models if not set
            projectGenerationModel: aiSettings?.projectGenerationModel || 'gemini-3.5-flash',
            poAnalysisModel: aiSettings?.poAnalysisModel || 'gemini-3.5-flash',
            attributeParsingModel: aiSettings?.attributeParsingModel || 'gemini-3.5-flash',
            checklistGenerationModel: aiSettings?.checklistGenerationModel || 'gemini-3.5-flash',
        };
        updateSetting('aiSettings', newSettings);
        alert('AI Settings Saved');
    };

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">{t('settings.ai.title')}</h2>
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 max-w-xl">
                 <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t('settings.ai.apiKey')}</label>
                    <div className="flex gap-2">
                        <input
                            type={showKey ? "text" : "password"}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="flex-1 bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm"
                            placeholder="Enter Google GenAI API Key"
                        />
                        <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200"
                        >
                            {showKey ? t('settings.ai.hideKey') : t('settings.ai.showKey')}
                        </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Get your API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Google AI Studio</a>.
                    </p>
                </div>
                
                <div className="pt-4 border-t border-slate-200">
                    <button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-semibold">
                        {t('buttons.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

interface SettingsProps {
    templates: ChecklistTemplate[];
    onNewTemplate: () => void;
    onEditTemplate: (template: ChecklistTemplate) => void;
    onDeleteTemplate: (templateId: string) => void;
    fontScaleStep: number;
    setFontScaleStep: (step: number) => void;
    aiSettings?: AISettings;
    onOpenRecovery: () => void;
}

const Settings: React.FC<SettingsProps> = ({ 
    templates, onNewTemplate, onEditTemplate, onDeleteTemplate,
    fontScaleStep, setFontScaleStep, aiSettings, onOpenRecovery
}) => {
    const { t, i18n } = useTranslation();
    const { settings, updateSetting } = useSettings();
    const [activeTab, setActiveTab] = useState('templates');

    const tabs = [
        { id: 'templates', label: t('settings.tabs.templates'), icon: '📋' },
        { id: 'presetCosts', label: t('settings.tabs.presetCosts'), icon: '💰' },
        { id: 'companyInfo', label: t('settings.tabs.companyInfo'), icon: '🏢' },
        { id: 'fileSystem', label: t('settings.tabs.fileSystem'), icon: '📂' },
        { id: 'backup', label: t('settings.tabs.backup'), icon: '💾' },
        { id: 'perShipmentCosting', label: t('settings.tabs.perShipmentCosting'), icon: '🧮' },
        { id: 'display', label: t('settings.tabs.display'), icon: '👁️' },
        { id: 'ai', label: t('settings.tabs.ai'), icon: '🤖' },
        { id: 'categoryManagement', label: t('settings.tabs.categoryManagement'), icon: '🏷️' },
        { id: 'chartOfAccounts', label: t('settings.tabs.chartOfAccounts'), icon: '📊' },
        { id: 'systemCheck', label: t('settings.tabs.systemCheck'), icon: '🩺' },
    ];

    return (
        <div className="flex h-full bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
             <aside className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
                <div className="p-4 border-b border-slate-200">
                    <h1 className="text-xl font-bold text-gray-800">{t('settings.settings.title')}</h1>
                </div>
                <nav className="flex-1 overflow-y-auto p-2 space-y-1">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                activeTab === tab.id 
                                ? 'bg-indigo-50 text-indigo-700' 
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                        >
                            <span className="text-lg">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </nav>
             </aside>
             <main className="flex-1 overflow-y-auto">
                {activeTab === 'templates' && (
                    <TemplateSettings 
                        templates={templates} 
                        onNew={onNewTemplate} 
                        onEdit={onEditTemplate} 
                        onDeleteTemplate={onDeleteTemplate} 
                    />
                )}
                {activeTab === 'presetCosts' && <PresetCostsSettings />}
                {activeTab === 'companyInfo' && <CompanyInfoSettings />}
                {activeTab === 'fileSystem' && <FileSystemSettings />}
                {activeTab === 'backup' && <BackupRestoreSettings onOpenRecovery={onOpenRecovery} />}
                {activeTab === 'perShipmentCosting' && <CostingSettingsPanel settingsKey="perShipmentCostingSettings" title={t('settings.tabs.perShipmentCosting')} />}
                {activeTab === 'display' && <DisplaySettingsPanel settings={settings} updateSetting={updateSetting} fontScaleStep={fontScaleStep} setFontScaleStep={setFontScaleStep} />}
                {activeTab === 'ai' && <AISettingsPanel aiSettings={aiSettings} updateSetting={updateSetting} />}
                {activeTab === 'categoryManagement' && <CategoryManager aiSettings={aiSettings} />}
                {activeTab === 'chartOfAccounts' && <ChartOfAccounts />}
                {activeTab === 'systemCheck' && <SystemCheckPanel />}
             </main>
        </div>
    );
};

export default Settings;
