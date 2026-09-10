import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useModals } from '../contexts/ModalContext';
import { MainGroup, Category, SubCategory, Brand, AISettings } from '../types';
import { translateText } from '../utils/ai';

interface CategoryManagerProps {
    aiSettings?: AISettings;
}

interface CategoryColumnProps<T extends { id: string; name: string; name_fa?: string }> {
  title: string;
  levelName: string;
  items: T[];
  selectedItemId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (name: string, name_fa?: string) => Promise<void>;
  onUpdate: (id: string, updates: Partial<T>) => Promise<void>;
  onDelete: (item: T) => Promise<void>;
  parentId: string | null;
  parentRequired?: boolean;
  hasFarsiName: boolean;
  aiSettings?: AISettings;
}

const CategoryColumn = <T extends { id: string; name: string; name_fa?: string }>({
  title,
  levelName,
  items,
  selectedItemId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  parentId,
  parentRequired = false,
  hasFarsiName,
  aiSettings,
}: CategoryColumnProps<T>) => {
  const { t, i18n } = useTranslation();
  const { addToast } = useModals();
  const [newItemName, setNewItemName] = useState('');
  const [newItemNameFa, setNewItemNameFa] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedNameFa, setEditedNameFa] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newItemName.trim()) {
      await onAdd(newItemName.trim(), newItemNameFa.trim() || undefined);
      setNewItemName('');
      setNewItemNameFa('');
      setIsAdding(false);
    }
  };

  const handleTranslate = async () => {
    if (!newItemName.trim() || !aiSettings?.apiKey) {
      if (!aiSettings?.apiKey) addToast(t('toasts.ai.apiKeyNotConfigured'), 'error');
      return;
    }
    setIsTranslating(true);
    try {
        const model = aiSettings.checklistGenerationModel || 'gemini-3.5-flash';
        const translation = await translateText(newItemName, 'Persian', aiSettings.apiKey, model);
        setNewItemNameFa(translation);
    } catch (error) {
        addToast((error as Error).message, 'error');
    } finally {
        setIsTranslating(false);
    }
  };

  const handleEditClick = (item: T) => {
      setEditingItemId(item.id);
      setEditedName(item.name);
      if (hasFarsiName) {
        setEditedNameFa(item.name_fa || '');
      }
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
  };

  const handleSaveEdit = async () => {
    if (editingItemId && editedName.trim()) {
      const updates: Partial<T> = { name: editedName.trim() } as Partial<T>;
      if (hasFarsiName) {
        updates.name_fa = editedNameFa.trim() || undefined;
      }
      await onUpdate(editingItemId, updates);
      setEditingItemId(null);
    }
  };

  const isDisabled = parentRequired && !parentId;

  return (
    <div className={`flex flex-col bg-white border border-slate-200 rounded-lg shadow-sm ${isDisabled ? 'opacity-50' : ''}`}>
      <h3 className="p-3 font-bold text-slate-800 border-b border-slate-200">{title}</h3>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[300px]">
        {isDisabled ? (
            <div className="flex items-center justify-center h-full text-sm text-slate-400 p-4 text-center">Select a parent item to continue.</div>
        ) : (
            items.map(item => {
                if (editingItemId === item.id) {
                    return (
                        <div key={item.id} className="p-2 bg-indigo-50 rounded space-y-2">
                            <input type="text" value={editedName} onChange={e => setEditedName(e.target.value)} placeholder={t('settings.categories.addPlaceholder', { level: levelName }) as string} className="w-full bg-white text-gray-900 border border-indigo-400 rounded p-1.5 text-sm" autoFocus />
                            {hasFarsiName && <input type="text" value={editedNameFa} onChange={e => setEditedNameFa(e.target.value)} placeholder={`${t('settings.categories.addPlaceholder', { level: levelName })} (FA)`} className="w-full bg-white text-gray-900 border border-indigo-400 rounded p-1.5 text-sm" dir="rtl" />}
                            <div className="flex gap-x-2">
                                <button onClick={handleSaveEdit} className="flex-1 bg-green-600 text-white px-3 py-1 rounded text-sm font-semibold hover:bg-green-700">{t('buttons.save')}</button>
                                <button type="button" onClick={handleCancelEdit} className="flex-1 bg-slate-200 text-slate-700 px-3 py-1 rounded text-sm hover:bg-slate-300">{t('common.cancel')}</button>
                            </div>
                        </div>
                    )
                }
                return (
                    <div
                        key={item.id}
                        onClick={() => onSelect(selectedItemId === item.id ? null : item.id)}
                        className={`group flex justify-between items-center p-2 rounded cursor-pointer text-sm ${
                        selectedItemId === item.id ? 'bg-indigo-100 text-indigo-800 font-semibold' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                        <span className="truncate">{i18n.language === 'fa' && item.name_fa ? item.name_fa : item.name}</span>
                        <div className="opacity-0 group-hover:opacity-100 flex-shrink-0 flex items-center">
                            <button onClick={(e) => { e.stopPropagation(); handleEditClick(item); }} className="text-slate-500 hover:text-indigo-600 p-1" title={t('buttons.edit') as string}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onDelete(item); }} className="text-red-500 hover:text-red-700 p-1" title={t('buttons.delete') as string}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                            </button>
                        </div>
                    </div>
                );
            })
        )}
      </div>
      <div className="p-2 border-t border-slate-200">
        {isAdding ? (
          <form onSubmit={handleAdd} className="space-y-2">
            <input type="text" value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder={t('settings.categories.addPlaceholder', { level: levelName }) as string} className="w-full bg-white text-gray-900 border border-indigo-400 rounded p-1.5 text-sm" autoFocus required />
            {hasFarsiName && 
              <div className="flex items-center gap-x-2">
                <input type="text" value={newItemNameFa} onChange={e => setNewItemNameFa(e.target.value)} placeholder={`${t('settings.categories.addPlaceholder', { level: levelName })} (FA)`} className="w-full bg-white text-gray-900 border border-indigo-400 rounded p-1.5 text-sm" dir="rtl" />
                <button type="button" onClick={handleTranslate} disabled={isTranslating} title="Translate from English" className="p-1.5 text-purple-600 hover:bg-purple-100 rounded disabled:opacity-50">
                   {isTranslating ? 
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    :
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 3zM6.03 5.23a.75.75 0 01.04 1.06l-1.72 1.72a.75.75 0 01-1.06-1.06l-1.72-1.72a.75.75 0 011.02 0zm8 0a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06zM10 18a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5H10a.75.75 0 01-.75-.75zM4.75 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm9.25-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zM6.03 14.77a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06z" clipRule="evenodd" /></svg>
                    }
                </button>
              </div>
            }
            <div className="flex gap-x-2">
                <button type="submit" className="flex-1 bg-indigo-600 text-white px-3 py-1 rounded text-sm font-semibold hover:bg-indigo-700">{t('common.add')}</button>
                <button type="button" onClick={() => setIsAdding(false)} className="flex-1 bg-slate-200 text-slate-700 px-3 py-1 rounded text-sm hover:bg-slate-300">{t('common.cancel')}</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setIsAdding(true)} disabled={isDisabled} className="w-full flex items-center justify-center gap-x-2 p-2 rounded text-slate-600 hover:bg-slate-100 hover:text-slate-800 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
            {t('common.add')}
          </button>
        )}
      </div>
    </div>
  );
};


const CategoryManager: React.FC<CategoryManagerProps> = ({ aiSettings }) => {
    const { t } = useTranslation();
    const { showConfirmation, addToast } = useModals();

    const [selectedMainGroup, setSelectedMainGroup] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);

    const mainGroups = useLiveQuery(() => db.mainGroups.orderBy('name').toArray(), []) || [];
    const categories = useLiveQuery(() => selectedMainGroup ? db.categories.where({ mainGroupId: selectedMainGroup }).sortBy('name') : Promise.resolve([]), [selectedMainGroup]) || [];
    const subCategories = useLiveQuery(() => selectedCategory ? db.subCategories.where({ categoryId: selectedCategory }).sortBy('name') : Promise.resolve([]), [selectedCategory]) || [];
    const brands = useLiveQuery(() => selectedSubCategory ? db.brands.where({ subCategoryId: selectedSubCategory }).sortBy('name') : Promise.resolve([]), [selectedSubCategory]) || [];
    
    const handleSelectMainGroup = (id: string | null) => { setSelectedMainGroup(id); setSelectedCategory(null); setSelectedSubCategory(null); };
    const handleSelectCategory = (id: string | null) => { setSelectedCategory(id); setSelectedSubCategory(null); };
    const handleSelectSubCategory = (id: string | null) => { setSelectedSubCategory(id); };

    // --- Add ---
    const handleAddMainGroup = async (name: string, name_fa?: string) => { await db.mainGroups.add({ id: crypto.randomUUID(), name, name_fa }); };
    const handleAddCategory = async (name: string, name_fa?: string) => { await db.categories.add({ id: crypto.randomUUID(), name, name_fa, mainGroupId: selectedMainGroup! }); };
    const handleAddSubCategory = async (name: string, name_fa?: string) => { await db.subCategories.add({ id: crypto.randomUUID(), name, name_fa, categoryId: selectedCategory! }); };
    const handleAddBrand = async (name: string) => { await db.brands.add({ id: crypto.randomUUID(), name, subCategoryId: selectedSubCategory! }); };

    // --- Update ---
    const handleUpdateMainGroup = async (id: string, updates: Partial<MainGroup>) => { await db.mainGroups.update(id, updates); };
    const handleUpdateCategory = async (id: string, updates: Partial<Category>) => { await db.categories.update(id, updates); };
    const handleUpdateSubCategory = async (id: string, updates: Partial<SubCategory>) => { await db.subCategories.update(id, updates); };
    const handleUpdateBrand = async (id: string, updates: Partial<Brand>) => { await db.brands.update(id, updates); };
    
    // --- Delete ---
    const confirmAndDelete = (item: { id: string, name: string }, deleteFunc: () => Promise<void>) => {
        showConfirmation({ title: t('settings.categories.deleteConfirmTitle', { name: item.name }), message: t('settings.categories.deleteConfirmBody'), variant: 'destructive', onConfirm: deleteFunc });
    };

    const handleDeleteMainGroup = async (item: MainGroup) => {
        const childrenCount = await db.categories.where({ mainGroupId: item.id }).count();
        if (childrenCount > 0) { addToast(t('settings.categories.deleteErrorHasChildren', { name: item.name }), 'error'); return; }
        confirmAndDelete(item, () => db.mainGroups.delete(item.id));
    };
    const handleDeleteCategory = async (item: Category) => {
        const childrenCount = await db.subCategories.where({ categoryId: item.id }).count();
        if (childrenCount > 0) { addToast(t('settings.categories.deleteErrorHasChildren', { name: item.name }), 'error'); return; }
        confirmAndDelete(item, () => db.categories.delete(item.id));
    };
    const handleDeleteSubCategory = async (item: SubCategory) => {
        const childrenCount = await db.brands.where({ subCategoryId: item.id }).count();
        if (childrenCount > 0) { addToast(t('settings.categories.deleteErrorHasChildren', { name: item.name }), 'error'); return; }
        confirmAndDelete(item, () => db.subCategories.delete(item.id));
    };
    const handleDeleteBrand = async (item: Brand) => { confirmAndDelete(item, () => db.brands.delete(item.id)); };
    
    return (
        <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">{t('settings.categories.title')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <CategoryColumn<MainGroup>
                    title={t('settings.categories.mainGroup')} levelName="main group" items={mainGroups} selectedItemId={selectedMainGroup} onSelect={handleSelectMainGroup}
                    onAdd={handleAddMainGroup} onUpdate={handleUpdateMainGroup} onDelete={handleDeleteMainGroup} parentId={null} hasFarsiName={true} aiSettings={aiSettings}
                />
                <CategoryColumn<Category>
                    title={t('settings.categories.category')} levelName="category" items={categories} selectedItemId={selectedCategory} onSelect={handleSelectCategory}
                    onAdd={handleAddCategory} onUpdate={handleUpdateCategory} onDelete={handleDeleteCategory} parentId={selectedMainGroup} parentRequired hasFarsiName={true} aiSettings={aiSettings}
                />
                <CategoryColumn<SubCategory>
                    title={t('settings.categories.subCategory')} levelName="sub-category" items={subCategories} selectedItemId={selectedSubCategory} onSelect={handleSelectSubCategory}
                    onAdd={handleAddSubCategory} onUpdate={handleUpdateSubCategory} onDelete={handleDeleteSubCategory} parentId={selectedCategory} parentRequired hasFarsiName={true} aiSettings={aiSettings}
                />
                <CategoryColumn<Brand>
                    title={t('settings.categories.brand')} levelName="brand" items={brands} selectedItemId={null} onSelect={() => {}}
                    onAdd={handleAddBrand} onUpdate={handleUpdateBrand} onDelete={handleDeleteBrand} parentId={selectedSubCategory} parentRequired hasFarsiName={false} aiSettings={aiSettings}
                />
            </div>
        </div>
    );
};

export default CategoryManager;