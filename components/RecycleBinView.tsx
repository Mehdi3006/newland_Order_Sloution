import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useOrders } from '../hooks/useOrders';
import { useProjects } from '../hooks/useProjects';
import { useTasks } from '../hooks/useTasks';
import { Order, Project, Task, Product } from '../types';
import { useModals } from '../contexts/ModalContext';
import { formatDisplayDate } from '../utils/dateUtils';
import { useProducts } from '../hooks/useProducts';

type Tab = 'orders' | 'products' | 'projects' | 'tasks';

const RecycleBinView: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [activeTab, setActiveTab] = useState<Tab>('orders');
    const { showConfirmation, addToast } = useModals();

    // Import hooks with new bulk actions
    const { restoreOrder, restoreOrders, permanentlyDeleteOrder, permanentlyDeleteOrders } = useOrders();
    const { restoreProduct, restoreProducts, permanentlyDeleteProduct, permanentlyDeleteProducts } = useProducts();
    const { restoreProject, restoreProjects, permanentlyDeleteProject, permanentlyDeleteProjects } = useProjects();
    const { restoreTask, restoreTasks, permanentlyDeleteTask, permanentlyDeleteTasks } = useTasks();

    const [selectedIds, setSelectedIds] = useState<Record<Tab, Set<string>>>({
        orders: new Set(),
        products: new Set(),
        projects: new Set(),
        tasks: new Set(),
    });

    // Clear selections when tab changes
    useEffect(() => {
        setSelectedIds({ orders: new Set(), products: new Set(), projects: new Set(), tasks: new Set() });
    }, [activeTab]);

    const deletedOrders = useLiveQuery(() => db.orders.where('deletedAt').above('').toArray(), []) || [];
    const deletedProducts = useLiveQuery(() => db.products.where('deletedAt').above('').toArray(), []) || [];
    const deletedProjects = useLiveQuery(() => db.projects.where('deletedAt').above('').toArray(), []) || [];
    const deletedTasks = useLiveQuery(() => db.tasks.where('deletedAt').above('').toArray(), []) || [];
    
    const getItemsForCurrentTab = (): (Order | Project | Task | Product)[] => {
        switch (activeTab) {
            case 'orders': return deletedOrders;
            case 'products': return deletedProducts;
            case 'projects': return deletedProjects;
            case 'tasks': return deletedTasks;
            default: return [];
        }
    };
    
    const currentItems = getItemsForCurrentTab();
    const currentSelection = selectedIds[activeTab];

    const getPurgeDate = (deletedAt: string): string => {
        const date = new Date(deletedAt);
        date.setDate(date.getDate() + 30);
        return date.toISOString().split('T')[0];
    };
    
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        const allIds = new Set(currentItems.map(item => item.id));
        setSelectedIds(prev => ({
            ...prev,
            [activeTab]: isChecked ? allIds : new Set(),
        }));
    };

    const handleSelectItem = (id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev[activeTab]);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return { ...prev, [activeTab]: newSet };
        });
    };
    
    const handleRestoreSelected = () => {
        const ids = Array.from(currentSelection);
        if (ids.length === 0) return;

        showConfirmation({
            title: t('views.recycleBin.restoreConfirmTitle'),
            message: `Are you sure you want to restore ${ids.length} selected item(s)?`,
            variant: 'primary',
            confirmText: t('views.recycleBin.restore'),
            onConfirm: async () => {
                try {
                    if (activeTab === 'orders') await restoreOrders(ids);
                    if (activeTab === 'products') await restoreProducts(ids);
                    if (activeTab === 'projects') await restoreProjects(ids);
                    if (activeTab === 'tasks') await restoreTasks(ids);
                    addToast(`${ids.length} item(s) restored.`, 'success');
                } catch (e) {
                     addToast(`Error restoring items.`, 'error');
                }
            }
        });
    };

    const handleDeleteSelectedForever = () => {
        const ids = Array.from(currentSelection);
        if (ids.length === 0) return;

        showConfirmation({
            title: t('views.recycleBin.deleteConfirmTitle'),
            message: `Are you sure you want to permanently delete ${ids.length} selected item(s)? This action cannot be undone.`,
            variant: 'destructive',
            requireCode: true,
            confirmationCode: 'DELETE',
            onConfirm: async () => {
                try {
                    if (activeTab === 'orders') await permanentlyDeleteOrders(ids);
                    if (activeTab === 'products') await permanentlyDeleteProducts(ids);
                    if (activeTab === 'projects') await permanentlyDeleteProjects(ids);
                    if (activeTab === 'tasks') await permanentlyDeleteTasks(ids);
                    addToast(`${ids.length} item(s) permanently deleted.`, 'success');
                } catch (e) {
                     addToast(`Error deleting items.`, 'error');
                }
            }
        });
    };

    const renderTable = () => {
        if (currentItems.length === 0) {
            return <p className="text-center text-slate-500 p-8">{t('views.recycleBin.empty')}</p>;
        }

        const isAllSelected = currentItems.length > 0 && currentSelection.size === currentItems.length;
        const isPartiallySelected = currentSelection.size > 0 && currentSelection.size < currentItems.length;

        return (
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-xs text-slate-600 uppercase">
                        <tr>
                            <th className="p-3 w-12">
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    // FIX: The ref callback was returning a boolean value, which is invalid. Changed to a block statement that correctly returns void.
                                    ref={el => {
                                        if (el) {
                                            el.indeterminate = isPartiallySelected;
                                        }
                                    }}
                                    onChange={handleSelectAll}
                                    className="h-4 w-4 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500"
                                />
                            </th>
                            <th className="p-3 text-left">{t('views.recycleBin.table.item')}</th>
                            <th className="p-3 text-left">{t('views.recycleBin.table.deletedOn')}</th>
                            <th className="p-3 text-left">{t('views.recycleBin.table.purgedOn')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {currentItems.map(item => {
                            const name = activeTab === 'orders' ? (item as Order).id
                                       : activeTab === 'products' ? (item as Product).description
                                       : ('title' in item ? (item as Task).title : (item as Project).name);
                            const deletedAt = (item as any).deletedAt;
                            return (
                                <tr key={item.id} className={`hover:bg-slate-50 ${currentSelection.has(item.id) ? 'bg-indigo-50' : ''}`}>
                                    <td className="p-3">
                                        <input
                                            type="checkbox"
                                            checked={currentSelection.has(item.id)}
                                            onChange={() => handleSelectItem(item.id)}
                                            className="h-4 w-4 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500"
                                        />
                                    </td>
                                    <td className="p-3 font-medium text-slate-800">{name}</td>
                                    <td className="p-3 font-mono text-slate-600">{formatDisplayDate(deletedAt.split('T')[0], i18n.language)}</td>
                                    <td className="p-3 font-mono text-slate-500">{formatDisplayDate(getPurgeDate(deletedAt), i18n.language)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="p-4 lg:p-6 bg-gray-50 h-full overflow-y-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">{t('views.recycleBin.title')}</h1>
            <p className="text-sm text-slate-600 mb-6">{t('views.recycleBin.description')}</p>

            <div className="border-b border-slate-200 mb-4">
                <nav className="-mb-px flex space-x-6 rtl:space-x-reverse" aria-label="Tabs">
                    <button onClick={() => setActiveTab('orders')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'orders' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                        {t('views.recycleBin.tabs.orders')} ({deletedOrders.length})
                    </button>
                     <button onClick={() => setActiveTab('products')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'products' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                        {t('sidebar.products')} ({deletedProducts.length})
                    </button>
                    <button onClick={() => setActiveTab('projects')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'projects' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                        {t('views.recycleBin.tabs.projects')} ({deletedProjects.length})
                    </button>
                    <button onClick={() => setActiveTab('tasks')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'tasks' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
                        {t('views.recycleBin.tabs.tasks')} ({deletedTasks.length})
                    </button>
                </nav>
            </div>
            
            {currentSelection.size > 0 && (
                 <div className="mb-4 p-2 bg-slate-100 rounded-md flex justify-between items-center">
                    <span className="text-sm font-semibold text-slate-700">{currentSelection.size} item(s) selected</span>
                    <div className="flex items-center gap-x-2">
                        <button onClick={handleRestoreSelected} className="bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 text-xs font-semibold">{t('views.recycleBin.restore')}</button>
                        <button onClick={handleDeleteSelectedForever} className="bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700 text-xs font-semibold">{t('views.recycleBin.deleteForever')}</button>
                    </div>
                </div>
            )}

            <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
                {renderTable()}
            </div>
        </div>
    );
};

export default RecycleBinView;