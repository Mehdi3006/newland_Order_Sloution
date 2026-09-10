import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useModals } from '../contexts/ModalContext';
import { GeneralLedgerAccount, SubsidiaryLedgerAccount, DetailedLedgerAccount } from '../types';

interface Account {
  id: string;
  code: string;
  name: string;
  name_fa?: string;
}

interface AccountColumnProps<T extends Account> {
  title: string;
  levelName: string;
  items: T[];
  selectedItemId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (data: { code: string; name: string; name_fa?: string }) => Promise<void>;
  onUpdate: (id: string, updates: Partial<T>) => Promise<void>;
  onDelete: (item: T) => Promise<void>;
  parentId: string | null;
  parentRequired?: boolean;
}

const AccountColumn = <T extends Account>({
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
}: AccountColumnProps<T>) => {
  const { t } = useTranslation();
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemNameFa, setNewItemNameFa] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editedCode, setEditedCode] = useState('');
  const [editedName, setEditedName] = useState('');
  const [editedNameFa, setEditedNameFa] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newItemCode.trim() && newItemName.trim()) {
      await onAdd({ code: newItemCode.trim(), name: newItemName.trim(), name_fa: newItemNameFa.trim() || undefined });
      setNewItemCode('');
      setNewItemName('');
      setNewItemNameFa('');
      setIsAdding(false);
    }
  };

  const handleEditClick = (item: T) => {
    setEditingItemId(item.id);
    setEditedCode(item.code);
    setEditedName(item.name);
    setEditedNameFa(item.name_fa || '');
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
  };

  const handleSaveEdit = async () => {
    if (editingItemId && editedCode.trim() && editedName.trim()) {
      const updates: Partial<T> = { code: editedCode.trim(), name: editedName.trim(), name_fa: editedNameFa.trim() || undefined } as Partial<T>;
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
            <div className="flex items-center justify-center h-full text-sm text-slate-400 p-4 text-center">Select a parent account to continue.</div>
        ) : (
            items.map(item => {
                if (editingItemId === item.id) {
                    return (
                        <div key={item.id} className="p-2 bg-indigo-50 rounded space-y-2">
                            <input type="text" value={editedCode} onChange={e => setEditedCode(e.target.value)} placeholder={t('settings.chartOfAccounts.code') as string} className="w-full bg-white text-gray-900 border border-indigo-400 rounded p-1.5 text-sm" autoFocus />
                            <input type="text" value={editedName} onChange={e => setEditedName(e.target.value)} placeholder={t('settings.chartOfAccounts.name') as string} className="w-full bg-white text-gray-900 border border-indigo-400 rounded p-1.5 text-sm" />
                            <input type="text" value={editedNameFa} onChange={e => setEditedNameFa(e.target.value)} placeholder={t('settings.chartOfAccounts.nameFa') as string} className="w-full bg-white text-gray-900 border border-indigo-400 rounded p-1.5 text-sm" dir="rtl" />
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
                        <div className="flex items-center gap-x-2 truncate">
                            <span className="font-mono text-xs bg-slate-200 px-1.5 py-0.5 rounded">{item.code}</span>
                            <span className="truncate">{item.name}</span>
                        </div>
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
             <input type="text" value={newItemCode} onChange={e => setNewItemCode(e.target.value)} placeholder={t('settings.chartOfAccounts.code') as string} className="w-full bg-white text-gray-900 border border-indigo-400 rounded p-1.5 text-sm" autoFocus required />
             <input type="text" value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder={`${t('settings.chartOfAccounts.name')}`} className="w-full bg-white text-gray-900 border border-indigo-400 rounded p-1.5 text-sm" required/>
             <input type="text" value={newItemNameFa} onChange={e => setNewItemNameFa(e.target.value)} placeholder={`${t('settings.chartOfAccounts.nameFa')}`} className="w-full bg-white text-gray-900 border border-indigo-400 rounded p-1.5 text-sm" dir="rtl"/>
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

const ChartOfAccounts: React.FC = () => {
    const { t } = useTranslation();
    const { showConfirmation, addToast } = useModals();

    const [selectedGL, setSelectedGL] = useState<string | null>(null);
    const [selectedSL, setSelectedSL] = useState<string | null>(null);

    const generalLedgerAccounts = useLiveQuery(() => db.generalLedgerAccounts.orderBy('code').toArray(), []) || [];
    const subsidiaryLedgerAccounts = useLiveQuery(() => selectedGL ? db.subsidiaryLedgerAccounts.where({ generalLedgerAccountId: selectedGL }).sortBy('code') : Promise.resolve([]), [selectedGL]) || [];
    const detailedLedgerAccounts = useLiveQuery(() => selectedSL ? db.detailedLedgerAccounts.where({ subsidiaryLedgerAccountId: selectedSL }).sortBy('code') : Promise.resolve([]), [selectedSL]) || [];

    const handleSelectGL = (id: string | null) => { setSelectedGL(id); setSelectedSL(null); };
    const handleSelectSL = (id: string | null) => { setSelectedSL(id); };

    const handleAddGL = async (data: { code: string; name: string; name_fa?: string }) => { await db.generalLedgerAccounts.add({ id: crypto.randomUUID(), ...data }); };
    const handleAddSL = async (data: { code: string; name: string; name_fa?: string }) => { await db.subsidiaryLedgerAccounts.add({ id: crypto.randomUUID(), ...data, generalLedgerAccountId: selectedGL! }); };
    const handleAddDL = async (data: { code: string; name: string; name_fa?: string }) => { await db.detailedLedgerAccounts.add({ id: crypto.randomUUID(), ...data, subsidiaryLedgerAccountId: selectedSL! }); };

    const handleUpdateGL = async (id: string, updates: Partial<GeneralLedgerAccount>) => { await db.generalLedgerAccounts.update(id, updates); };
    const handleUpdateSL = async (id: string, updates: Partial<SubsidiaryLedgerAccount>) => { await db.subsidiaryLedgerAccounts.update(id, updates); };
    const handleUpdateDL = async (id: string, updates: Partial<DetailedLedgerAccount>) => { await db.detailedLedgerAccounts.update(id, updates); };

    const confirmAndDelete = (item: { id: string; name: string }, deleteFunc: () => Promise<void>) => {
        showConfirmation({ title: t('settings.chartOfAccounts.deleteConfirmTitle', { name: item.name }), message: t('settings.chartOfAccounts.deleteConfirmBody'), variant: 'destructive', onConfirm: deleteFunc });
    };

    const handleDeleteGL = async (item: GeneralLedgerAccount) => {
        const childrenCount = await db.subsidiaryLedgerAccounts.where({ generalLedgerAccountId: item.id }).count();
        if (childrenCount > 0) { addToast(t('settings.chartOfAccounts.deleteErrorHasChildren', { name: item.name }), 'error'); return; }
        confirmAndDelete(item, () => db.generalLedgerAccounts.delete(item.id));
    };
    const handleDeleteSL = async (item: SubsidiaryLedgerAccount) => {
        const childrenCount = await db.detailedLedgerAccounts.where({ subsidiaryLedgerAccountId: item.id }).count();
        if (childrenCount > 0) { addToast(t('settings.chartOfAccounts.deleteErrorHasChildren', { name: item.name }), 'error'); return; }
        confirmAndDelete(item, () => db.subsidiaryLedgerAccounts.delete(item.id));
    };
    const handleDeleteDL = async (item: DetailedLedgerAccount) => { confirmAndDelete(item, () => db.detailedLedgerAccounts.delete(item.id)); };

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">{t('settings.chartOfAccounts.title')}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <AccountColumn
                    title={t('settings.chartOfAccounts.generalLedger')}
                    levelName="general ledger"
                    items={generalLedgerAccounts}
                    selectedItemId={selectedGL}
                    onSelect={handleSelectGL}
                    onAdd={handleAddGL}
                    onUpdate={handleUpdateGL}
                    onDelete={handleDeleteGL}
                    parentId={null}
                />
                <AccountColumn
                    title={t('settings.chartOfAccounts.subsidiaryLedger')}
                    levelName="subsidiary ledger"
                    items={subsidiaryLedgerAccounts}
                    selectedItemId={selectedSL}
                    onSelect={handleSelectSL}
                    onAdd={handleAddSL}
                    onUpdate={handleUpdateSL}
                    onDelete={handleDeleteSL}
                    parentId={selectedGL}
                    parentRequired
                />
                <AccountColumn
                    title={t('settings.chartOfAccounts.detailedLedger')}
                    levelName="detailed ledger"
                    items={detailedLedgerAccounts}
                    selectedItemId={null}
                    onSelect={() => {}}
                    onAdd={handleAddDL}
                    onUpdate={handleUpdateDL}
                    onDelete={handleDeleteDL}
                    parentId={selectedSL}
                    parentRequired
                />
            </div>
        </div>
    );
};

export default ChartOfAccounts;