import React, { useState, useMemo, useEffect, useId, useRef } from 'react';
import { Order, OrderItem, ChecklistTask, CurrencyRates, Cost, CostingSettings, Product, AISettings, AnalysisIssue, Attachment, ProductIranCustomsCosts, CostBasis, Payment } from '../types';
import { useTranslation } from 'react-i18next';
import { getContainerInfo, exportOrderToExcel, generatePackingListHtml, formatToman, persianArabicToEnglish, getTomanUnitLabel } from '../utils/formatters';
import { generateEnhancedPrintableOrderHtml } from '../utils/printHelpers';
import { useModals } from '../contexts/ModalContext';
import { calculateItemProgress } from '../utils/progress';
import NumericInput from './NumericInput';
import { useSettings } from '../hooks/useSettings';
import { usePresetCosts } from '../hooks/usePresetCosts';
import IranCustomsPanel from './IranCustomsPanel';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatDisplayDate } from '../utils/dateUtils';
import Select from './Select';
import { analyzeOrderForIssues } from '../utils/ai';
import LoadingOverlay from './LoadingOverlay';
import { calculateIranCustomsCosts } from '../utils/costCalculator';
import PaymentsTab from './PaymentsTab';


type CostKey = 'shipCosts' | 'dubaiCosts' | 'iranCosts';

interface OrderModalProps {
    order: Order;
    onClose: () => void;
    onEdit: (order: Order) => void;
    onDelete: () => void;
    isFinalStatus: boolean;
    currencyRates: CurrencyRates;
    updateOrder: (orderId: string, updates: Partial<Order>) => void;
    onFinalize: (orderId: string, skipProductUpdate?: boolean) => Promise<void>;
    addCost: (orderId: string, costKey: CostKey, newCost: Omit<Cost, 'id'>) => void;
    updateCost: (orderId: string, costKey: CostKey, updatedCost: Cost) => void;
    removeCost: (orderId: string, costKey: CostKey, costId: string) => void;
    addAttachment: (orderId: string, attachment: Attachment, itemId?: string) => Promise<void>;
    deleteAttachment: (orderId: string, attachmentId: string, itemId?: string) => Promise<void>;
    addPayment: (orderId: string, payment: Omit<Payment, 'id'>) => Promise<void>;
    updatePayment: (orderId: string, payment: Payment) => Promise<void>;
    deletePayment: (orderId: string, paymentId: string) => Promise<void>;
    aiSettings?: AISettings;
    onGenerateDocument: (order: Order, type: 'packing-list') => void;
    onOpenInvoiceModal: (order: Order) => void;
    onOpenPackingListModal: (order: Order) => void;
}

type DetailedItemCosts = {
    purchasePriceUSD: number;
    purchasePriceSource: number;
    shipCostsPerUnitUSD: number;
    dubaiCostsPerUnitAED: number;
    landedCostDubaiAED: number;
    iranCostsPerUnitTOMAN: number;
    iranCustomsCostsPerUnitTOMAN: number;
    finalLandedCostTOMAN: number;
};


// Custom hook for live, detailed cost calculation
const useDetailedCostCalculator = (order: Order, rates: CurrencyRates, costingSettings: CostingSettings | null): Map<string, DetailedItemCosts> => {
    return useMemo(() => {
        const results = new Map<string, DetailedItemCosts>();
        if (!order || !order.items || !costingSettings) return results;

        const { fx } = costingSettings;
        const aedToTomanRate = fx.aed_toman;

        const convertToUsd = (price: number, currency: Order['currency']) => {
            switch (currency) {
                case 'CNY': return price * rates.cny;
                case 'AED': return rates.aed > 0 ? price / rates.aed : 0;
                case 'TOMAN': return rates.toman > 0 ? price / rates.toman : 0;
                case 'USD': default: return price;
            }
        };

        // 1. Pre-calculate item metrics
        const itemMetrics = new Map(order.items.map(item => {
            const priceInUsd = convertToUsd(item.price, order.currency);
            const totalCartons = item.itemsPerCarton > 0 ? Math.ceil(item.quantity / item.itemsPerCarton) : 0;
            const totalGrossWeight = (item.grossWeight || 0) * totalCartons;
            const totalCBM = totalCartons * item.cartonCBM;
            const totalValueUSD = priceInUsd * item.quantity;
            return [item.id, { totalCartons, totalCBM, totalValueUSD, quantity: item.quantity, totalGrossWeight }];
        }));
        
        const allocate = (costs: Cost[], targetCurrency: 'USD' | 'AED' | 'TOMAN') => {
            const perUnitCosts = new Map<string, number>(order.items.map(i => [i.id, 0]));
            if (!costs || costs.length === 0) return perUnitCosts;
        
            costs.forEach(cost => {
                const itemsInScope = cost.itemId ? order.items.filter(i => i.id === cost.itemId) : order.items;
                if (itemsInScope.length === 0) return;
        
                const scopeTotalValue = itemsInScope.reduce((sum, item) => sum + (itemMetrics.get(item.id)?.totalValueUSD || 0), 0);
                const scopeTotalQty = itemsInScope.reduce((sum, item) => sum + item.quantity, 0);
                const scopeTotalCartons = itemsInScope.reduce((sum, item) => sum + (itemMetrics.get(item.id)?.totalCartons || 0), 0);
                const scopeTotalCBM = itemsInScope.reduce((sum, item) => sum + (itemMetrics.get(item.id)?.totalCBM || 0), 0);
                const scopeTotalGrossWeight = itemsInScope.reduce((sum, item) => sum + (itemMetrics.get(item.id)?.totalGrossWeight || 0), 0);

                let amountInTargetCurrency = cost.amount;
                if (cost.currency !== targetCurrency) {
                    let usdAmount = 0;
                    switch (cost.currency) {
                        case 'USD':   usdAmount = cost.amount; break;
                        case 'AED':   usdAmount = rates.aed > 0 ? cost.amount / rates.aed : 0; break;
                        case 'TOMAN': usdAmount = rates.toman > 0 ? cost.amount / rates.toman : 0; break;
                        case 'CNY':   usdAmount = cost.amount * rates.cny; break;
                    }
                    switch (targetCurrency) {
                        case 'USD':   amountInTargetCurrency = usdAmount; break;
                        case 'AED':   amountInTargetCurrency = usdAmount * rates.aed; break;
                        case 'TOMAN': amountInTargetCurrency = usdAmount * rates.toman; break;
                    }
                }
        
                itemsInScope.forEach(item => {
                    const metrics = itemMetrics.get(item.id)!;
                    let share = 0;
                    switch (cost.basis) {
                        case 'value':  share = scopeTotalValue > 0 ? metrics.totalValueUSD / scopeTotalValue : 1 / itemsInScope.length; break;
                        case 'qty':    share = scopeTotalQty > 0 ? item.quantity / scopeTotalQty : 1 / itemsInScope.length; break;
                        case 'carton': share = scopeTotalCartons > 0 ? metrics.totalCartons / scopeTotalCartons : 1 / itemsInScope.length; break;
                        case 'cbm':    share = scopeTotalCBM > 0 ? metrics.totalCBM / scopeTotalCBM : 1 / itemsInScope.length; break;
                        case 'grossWeight': share = scopeTotalGrossWeight > 0 ? metrics.totalGrossWeight / scopeTotalGrossWeight : 1 / itemsInScope.length; break;
                        case 'equal':  share = 1 / itemsInScope.length; break;
                    }
                    const perUnitCost = item.quantity > 0 ? (amountInTargetCurrency * share) / item.quantity : 0;
                    perUnitCosts.set(item.id, (perUnitCosts.get(item.id) || 0) + perUnitCost);
                });
            });
            return perUnitCosts;
        };
        
        const isFixed = (c: Cost) => !c.basis.startsWith('percent_');
        const isPercent = (c: Cost) => c.basis.startsWith('percent_');

        const fixedShipCosts = allocate(order.shipCosts?.filter(isFixed), 'USD');
        const fixedDubaiCosts = allocate(order.dubaiCosts?.filter(isFixed), 'AED');
        const fixedIranCosts = allocate((order.iranCosts || []).filter(c => c.category !== 'system_customs' && isFixed(c)), 'TOMAN');
        
        const percentShipCosts = order.shipCosts?.filter(isPercent) || [];
        const percentDubaiCosts = order.dubaiCosts?.filter(isPercent) || [];
        const percentIranCosts = (order.iranCosts || []).filter(c => c.category !== 'system_customs' && isPercent(c));
        
        // This is the flag that tells us if "Apply Costs to Order" has been clicked.
        const areCustomsApplied = order.iranCosts?.some(c => c.category === 'system_customs') ?? false;

        order.items.forEach(item => {
            const purchasePriceUSD = convertToUsd(item.price, order.currency);
            const purchasePriceSource = item.price;
            
            // --- Ship Stage ---
            const baseShipCostsPerUnitUSD = fixedShipCosts.get(item.id) || 0;
            let percentBasedShipCostsUSD = 0;
            percentShipCosts.forEach(cost => {
                if (cost.basis === 'percent_purchase_usd') {
                    percentBasedShipCostsUSD += purchasePriceUSD * (cost.amount / 100);
                }
            });
            const shipCostsPerUnitUSD = baseShipCostsPerUnitUSD + percentBasedShipCostsUSD;
            
            // --- Dubai Stage ---
            const baseDubaiCostsPerUnitAED = fixedDubaiCosts.get(item.id) || 0;
            const landedCostDubaiAED_before_percent = ((purchasePriceUSD + shipCostsPerUnitUSD) * rates.aed) + baseDubaiCostsPerUnitAED;
            let percentBasedDubaiCostsAED = 0;
            percentDubaiCosts.forEach(cost => {
                if (cost.basis === 'percent_purchase_usd') {
                    percentBasedDubaiCostsAED += (purchasePriceUSD * rates.aed) * (cost.amount / 100);
                } else if (cost.basis === 'percent_landed_aed') {
                    percentBasedDubaiCostsAED += landedCostDubaiAED_before_percent * (cost.amount / 100);
                }
            });
            const dubaiCostsPerUnitAED = baseDubaiCostsPerUnitAED + percentBasedDubaiCostsAED;
            const landedCostDubaiAED = landedCostDubaiAED_before_percent + percentBasedDubaiCostsAED;
            
            // --- Iran Stage ---
            const customsCostsPerUnitObject = areCustomsApplied 
                ? calculateIranCustomsCosts(item, costingSettings)
                : { // Return a zeroed-out object if not applied
                    finalDuty_TOMAN: 0, importVat_TOMAN: 0, brokerFee_TOMAN: 0,
                    shipFreight_TOMAN: 0, inlandFreight_TOMAN: 0, standardFee_TOMAN: 0,
                    loadingUnloadingFee_TOMAN: 0
                  };

            const iranCustomsCostsPerUnitTOMAN = Object.values(customsCostsPerUnitObject).reduce((sum, val) => sum + (val || 0), 0);
            
            const baseIranCostsPerUnitTOMAN = fixedIranCosts.get(item.id) || 0;
            const landedCostToman_before_percent = (landedCostDubaiAED * aedToTomanRate) + baseIranCostsPerUnitTOMAN + iranCustomsCostsPerUnitTOMAN;
            
            let percentBasedIranCostsTOMAN = 0;
            percentIranCosts.forEach(cost => {
                if(cost.basis === 'percent_purchase_usd'){
                    percentBasedIranCostsTOMAN += (purchasePriceUSD * rates.toman) * (cost.amount / 100);
                } else if (cost.basis === 'percent_landed_aed') {
                    percentBasedIranCostsTOMAN += (landedCostDubaiAED * aedToTomanRate) * (cost.amount / 100);
                } else if (cost.basis === 'percent_landed_toman') {
                    percentBasedIranCostsTOMAN += landedCostToman_before_percent * (cost.amount / 100);
                }
            });
            const iranCostsPerUnitTOMAN = baseIranCostsPerUnitTOMAN + percentBasedIranCostsTOMAN;
            const finalLandedCostTOMAN = landedCostToman_before_percent + percentBasedIranCostsTOMAN;

            results.set(item.id, { 
                purchasePriceUSD, 
                purchasePriceSource,
                shipCostsPerUnitUSD, 
                dubaiCostsPerUnitAED,
                landedCostDubaiAED,
                iranCostsPerUnitTOMAN,
                iranCustomsCostsPerUnitTOMAN,
                finalLandedCostTOMAN
            });
        });

        return results;
    }, [order, rates, costingSettings]);
};


// --- Sub-components for OrderModal ---

const DetailItem: React.FC<{ icon: React.ReactNode; label: string; value?: string | number; mono?: boolean; }> = ({ icon, label, value, mono = false }) => (
    <div className="flex items-start gap-x-2 text-xs p-2 border border-slate-200 rounded-md">
        <div className="text-slate-400 mt-0.5 flex-shrink-0">{icon}</div>
        <div>
            <p className="text-slate-600 font-bold uppercase tracking-wider mb-0.5">{label}</p>
            <p className={`text-gray-800 font-medium ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
        </div>
    </div>
);

interface ChecklistPanelProps {
    item: OrderItem;
    onTaskToggle: (itemId: string, taskId: string) => void;
    readOnly: boolean;
    onTaskDelete: (itemId: string, taskId: string) => void;
    onTaskUpdate: (itemId: string, taskId: string, newText: string) => void;
    editingTask: { itemId: string; taskId: string; text: string } | null;
    setEditingTask: (task: { itemId: string; taskId: string; text: string } | null) => void;
}

const ChecklistPanel: React.FC<ChecklistPanelProps> = ({ item, onTaskToggle, readOnly, onTaskDelete, onTaskUpdate, editingTask, setEditingTask }) => {
    const { i18n, t } = useTranslation();
    const isLtr = i18n.dir() === 'ltr';
    
    const tasksBySection = useMemo(() => {
        if (!item.checklist) return {};
        return item.checklist.reduce((acc, task) => {
            const sectionName = i18n.language === 'fa' ? task.section_fa : task.section_en;
            if (!acc[sectionName]) acc[sectionName] = [];
            acc[sectionName].push(task);
            return acc;
        }, {} as Record<string, ChecklistTask[]>);
    }, [item.checklist, i18n.language]);

    if (!item.checklist || item.checklist.length === 0) {
        return <div className="p-4 text-center text-slate-500">{t('labels.noChecklist')}</div>;
    }

    return (
        <div className="bg-slate-50 p-4" dir={isLtr ? 'ltr' : 'rtl'}>
            <div className="space-y-4">
                {Object.entries(tasksBySection).map(([sectionName, tasks]) => (
                    <div key={sectionName}>
                        <h5 className="font-semibold text-slate-600 text-sm mb-2 pb-1 border-b border-slate-300">{sectionName}</h5>
                        <ul className="space-y-1.5 text-sm">
                            {tasks.map(task => (
                                <li key={task.task_id}>
                                    {editingTask && editingTask.itemId === item.id && editingTask.taskId === task.task_id ? (
                                        <div className="flex items-center gap-x-3 p-1">
                                            <input
                                                type="text"
                                                value={editingTask.text}
                                                onChange={(e) => setEditingTask({ ...editingTask, text: e.target.value })}
                                                onBlur={() => onTaskUpdate(item.id, task.task_id, editingTask.text)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        onTaskUpdate(item.id, task.task_id, editingTask.text);
                                                    } else if (e.key === 'Escape') {
                                                        setEditingTask(null);
                                                    }
                                                }}
                                                className="flex-1 bg-white border border-indigo-500 rounded px-2 py-1 text-sm focus:outline-none"
                                                autoFocus
                                            />
                                        </div>
                                    ) : (
                                        <div className="group flex items-center gap-x-3 p-1 rounded hover:bg-slate-200">
                                            <input type="checkbox" checked={task.is_done} onChange={() => onTaskToggle(item.id, task.task_id)} disabled={readOnly} className="h-4 w-4 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"/>
                                            <span className={`flex-1 ${task.is_done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{i18n.language === 'fa' ? task.task_fa : task.task_en}</span>
                                            <span className="text-xs font-mono text-slate-400">w: {task.task_weight}</span>
                                            {!readOnly && (
                                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => setEditingTask({ itemId: item.id, taskId: task.task_id, text: i18n.language === 'fa' ? task.task_fa : task.task_en })} className="p-1 text-slate-500 hover:text-indigo-600" title={t('buttons.edit') as string}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                                    </button>
                                                    <button onClick={() => onTaskDelete(item.id, task.task_id)} className="p-1 text-slate-500 hover:text-red-600" title={t('buttons.delete') as string}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};

// FIX: Defined the missing CostsPanel component.
interface CostsPanelProps {
    costs: Cost[];
    onAddCost: (newCost: Omit<Cost, 'id'>) => void;
    onUpdateCost: (updatedCost: Cost) => void;
    onRemoveCost: (costId: string) => void;
    isReadOnly: boolean;
    defaultCurrency: 'USD' | 'AED' | 'TOMAN' | 'CNY';
    orderItems: OrderItem[];
}

const CostsPanel: React.FC<CostsPanelProps> = ({ costs, onAddCost, onUpdateCost, onRemoveCost, isReadOnly, defaultCurrency, orderItems }) => {
    // FIX: Destructured 'i18n' from useTranslation to make it available in the component.
    const { t, i18n } = useTranslation();
    const { presetCosts } = usePresetCosts();
    const { showConfirmation } = useModals();

    const [newCost, setNewCost] = useState<Omit<Cost, 'id'>>({ name: '', amount: 0, currency: defaultCurrency, basis: 'equal', category: 'misc', itemId: '' });
    const [editingCostId, setEditingCostId] = useState<string | null>(null);
    const [editedCost, setEditedCost] = useState<Cost | null>(null);

    const handleNewCostChange = <K extends keyof typeof newCost>(field: K, value: (typeof newCost)[K]) => {
        setNewCost(prev => ({ ...prev, [field]: value }));
    };

    const handlePresetSelect = (presetId: string) => {
        const preset = presetCosts.find(p => p.id === presetId);
        if (preset) {
            setNewCost(prev => ({
                ...prev,
                name: i18n.language === 'fa' ? preset.name_fa : preset.name_en,
                amount: preset.defaultAmount,
            }));
        }
    };

    const handleAddCost = (e: React.FormEvent) => {
        e.preventDefault();
        if (newCost.name.trim() && newCost.amount > 0) {
            onAddCost(newCost);
            setNewCost({ name: '', amount: 0, currency: defaultCurrency, basis: 'equal', category: 'misc', itemId: '' });
        }
    };
    
    const startEditing = (cost: Cost) => {
        setEditingCostId(cost.id);
        setEditedCost({ ...cost });
    };

    const cancelEditing = () => {
        setEditingCostId(null);
        setEditedCost(null);
    };

    const handleUpdateCost = () => {
        if (editedCost) {
            onUpdateCost(editedCost);
            cancelEditing();
        }
    };
    
    const handleDeleteCost = (costId: string) => {
        showConfirmation({
            title: t('confirmationModal.deleteItemTitle'),
            message: t('confirmationModal.deleteItemBody'),
            variant: 'destructive',
            onConfirm: () => onRemoveCost(costId),
        });
    };

    const isPercentageBasis = (basis: CostBasis) => basis.startsWith('percent_');

    return (
        <div className="p-4 sm:p-6 space-y-4">
            <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-xs text-slate-700 uppercase">
                        <tr>
                            <th className="p-3 text-left">{t('orderFormModal.attributeKey')}</th>
                            <th className="p-3 text-right">{editedCost && isPercentageBasis(editedCost.basis) ? t('costsPanel.percentage') : t('costsPanel.amount')}</th>
                            <th className="p-3 text-center">{t('labels.allocationBasis')}</th>
                            <th className="p-3 text-left">{t('labels.appliesTo')}</th>
                            {!isReadOnly && <th className="p-3 text-center">{t('common.actions')}</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {costs.map(cost => (
                            <tr key={cost.id} className="hover:bg-slate-50">
                                {editingCostId === cost.id && editedCost ? (
                                    <>
                                        <td className="p-2"><input type="text" value={editedCost.name} onChange={e => setEditedCost(c => c ? {...c, name: persianArabicToEnglish(e.target.value)} : null)} className="w-full bg-white text-gray-900 border border-slate-300 rounded p-1.5 text-sm"/></td>
                                        <td className="p-2"><NumericInput value={editedCost.amount} onChange={v => setEditedCost(c => c ? {...c, amount: v} : null)} /></td>
                                        <td className="p-2">
                                            <Select value={editedCost.basis} onChange={e => setEditedCost(c => c ? {...c, basis: e.target.value as CostBasis} : null)}>
                                                <option value="value">{t('costBasis.value')}</option>
                                                <option value="qty">{t('costBasis.qty')}</option>
                                                <option value="carton">{t('costBasis.carton')}</option>
                                                <option value="cbm">{t('costBasis.cbm')}</option>
                                                <option value="grossWeight">{t('costBasis.grossWeight')}</option>
                                                <option value="equal">{t('costBasis.equal')}</option>
                                                <option value="percent_purchase_usd">{t('costBasis.percent_purchase_usd')}</option>
                                                <option value="percent_landed_aed">{t('costBasis.percent_landed_aed')}</option>
                                                <option value="percent_landed_toman">{t('costBasis.percent_landed_toman')}</option>
                                            </Select>
                                        </td>
                                        <td className="p-2"><Select value={editedCost.itemId} onChange={e => setEditedCost(c => c ? {...c, itemId: e.target.value} : null)}><option value="">{t('labels.entireShipment')}</option>{orderItems.map(i => <option key={i.id} value={i.id}>{i.productName}</option>)}</Select></td>
                                        <td className="p-2 text-center space-x-2"><button onClick={handleUpdateCost} className="text-green-600 font-semibold">{t('buttons.save')}</button><button onClick={cancelEditing} className="text-slate-600">{t('common.cancel')}</button></td>
                                    </>
                                ) : (
                                    <>
                                        <td className="p-3 font-medium text-slate-800">{cost.name}</td>
                                        <td className="p-3 text-right font-mono text-slate-800">{cost.amount.toLocaleString()} <span className="text-xs text-slate-500">{isPercentageBasis(cost.basis) ? '%' : cost.currency}</span></td>
                                        <td className="p-3 text-center text-slate-600">{t(`costBasis.${cost.basis}`)}</td>
                                        <td className="p-3 text-slate-600">{cost.itemId ? orderItems.find(i => i.id === cost.itemId)?.productName : t('labels.entireShipment')}</td>
                                        {!isReadOnly && <td className="p-3 text-center space-x-2"><button onClick={() => startEditing(cost)} className="font-semibold text-indigo-600">{t('buttons.edit')}</button><button onClick={() => handleDeleteCost(cost.id)} className="font-semibold text-red-600">{t('buttons.delete')}</button></td>}
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!isReadOnly && (
                <form onSubmit={handleAddCost} className="p-3 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                    <div className="md:col-span-2"><label className="block text-xs font-medium text-slate-600 mb-1">{t('costsPanel.costName')}</label><input type="text" value={newCost.name} onChange={e => handleNewCostChange('name', persianArabicToEnglish(e.target.value))} list="preset-costs" required className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm" /><datalist id="preset-costs">{presetCosts.map(p => <option key={p.id} value={i18n.language === 'fa' ? p.name_fa : p.name_en} />)}</datalist></div>
                    <div className="md:col-span-1"><label className="block text-xs font-medium text-slate-600 mb-1">{t('costsPanel.preset')}</label><Select onChange={e => handlePresetSelect(e.target.value)}><option>{t('costsPanel.selectPreset')}</option>{presetCosts.map(p => <option key={p.id} value={p.id}>{i18n.language === 'fa' ? p.name_fa : p.name_en}</option>)}</Select></div>
                    <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-slate-600 mb-1">{isPercentageBasis(newCost.basis) ? t('costsPanel.percentage') : t('costsPanel.amount')}</label>
                        <div className="flex">
                            <NumericInput value={newCost.amount} onChange={v => handleNewCostChange('amount', v)} className="w-full rounded-none rounded-l-md" />
                            {!isPercentageBasis(newCost.basis) && <Select value={newCost.currency} onChange={e => handleNewCostChange('currency', e.target.value as any)} className="rounded-none rounded-r-md !w-20"><option>USD</option><option>AED</option><option>TOMAN</option><option>CNY</option></Select>}
                        </div>
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-slate-600 mb-1">{t('labels.allocationBasis')}</label>
                        <Select value={newCost.basis} onChange={e => handleNewCostChange('basis', e.target.value as any)}>
                            <option value="value">{t('costBasis.value')}</option>
                            <option value="qty">{t('costBasis.qty')}</option>
                            <option value="carton">{t('costBasis.carton')}</option>
                            <option value="cbm">{t('costBasis.cbm')}</option>
                            <option value="grossWeight">{t('costBasis.grossWeight')}</option>
                            <option value="equal">{t('costBasis.equal')}</option>
                            <option value="percent_purchase_usd">{t('costBasis.percent_purchase_usd')}</option>
                            <option value="percent_landed_aed">{t('costBasis.percent_landed_aed')}</option>
                            <option value="percent_landed_toman">{t('costBasis.percent_landed_toman')}</option>
                        </Select>
                    </div>
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-semibold">{t('common.add')}</button>
                </form>
            )}
        </div>
    );
};

interface DetailsTabProps {
    order: Order;
    currencyRates: CurrencyRates;
    costingSettings: CostingSettings | null;
    itemLandedCosts: Map<string, DetailedItemCosts>;
    expandedItemId: string | null;
    setExpandedItemId: (id: string | null) => void;
    onTaskToggle: (itemId: string, taskId: string) => void;
    isReadOnly: boolean;
    onTaskDelete: (itemId: string, taskId: string) => void;
    onTaskUpdate: (itemId: string, taskId: string, newText: string) => void;
    editingTask: { itemId: string; taskId: string; text: string } | null;
    setEditingTask: (task: { itemId: string; taskId: string; text: string } | null) => void;
}

const DetailsTab: React.FC<DetailsTabProps> = ({ order, currencyRates, costingSettings, itemLandedCosts, expandedItemId, setExpandedItemId, onTaskToggle, isReadOnly, onTaskDelete, onTaskUpdate, editingTask, setEditingTask }) => {
    const { t, i18n } = useTranslation();
    const isLtr = i18n.dir() === 'ltr';
    const totalValue = useMemo(() => order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0), [order.items]);
    const downPayment = useMemo(() => order.payments?.find(p => p.type === 'down_payment')?.amountUSD || 0, [order.payments]);
    const balance = totalValue - downPayment;
    const containerInfo = getContainerInfo(order.volumeCBM, t);

    const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
    const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
    const tomanUnitLabel = getTomanUnitLabel(costingSettings);

    const toggleExpand = (itemId: string) => {
        setExpandedItemId(expandedItemId === itemId ? null : itemId);
    };

    return (
        <div className="p-4 sm:p-6 space-y-4">
            {/* Order Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {/* FIX: The label prop was missing. Added label and other relevant props to complete the component. */}
                <DetailItem icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2-2H6a2 2 0 01-2-2V5zm3 4a1 1 0 011-1h6a1 1 0 110 2H8a1 1 0 01-1-1zm1 4a1 1 0 100 2h6a1 1 0 100-2H8z" clipRule="evenodd" /></svg>} label={t('labels.orderId')} value={order.id} mono />
                <DetailItem icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 11a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1v-1z" /></svg>} label={t('labels.supplier')} value={order.supplier} />
                <DetailItem icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>} label={t('labels.orderDate')} value={formatDisplayDate(order.orderDate, i18n.language)} />
                <DetailItem icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>} label={t('labels.loadingDate')} value={formatDisplayDate(order.approxLoadingDate, i18n.language)} />
                <DetailItem icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4zM8 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1H9a1 1 0 01-1-1V4zM15 3a1 1 0 00-1 1v12a1 1 0 001 1h2a1 1 0 001-1V4a1 1 0 00-1-1h-2z" /></svg>} label={t('labels.volumeCbm')} value={`${order.volumeCBM} m³`} mono />
                <DetailItem icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h10a3 3 0 013 3v5a.997.997 0 01-.293-.707zM5 4a1 1 0 00-1 1v5l5.707 5.707a1 1 0 001.414 0L16 10.414V5a1 1 0 00-1-1H5z" clipRule="evenodd" /><path d="M8 8a1 1 0 11-2 0 1 1 0 012 0z" /></svg>} label={t('labels.totalCartons')} value={Math.ceil(order.items.reduce((sum, item) => sum + (item.itemsPerCarton > 0 ? item.quantity / item.itemsPerCarton : 0), 0))} mono />
            </div>
             <div className="overflow-x-auto border border-slate-200 rounded-lg mt-4">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-xs text-gray-900 font-bold uppercase">
                        <tr>
                            <th className="p-3 text-left"></th>
                            <th className="p-3 text-left">{t('orderModal.table.productName')}</th>
                            <th className="p-3 text-center">{t('orderModal.table.quantity')}</th>
                            <th className="p-3 text-right">{t('orderModal.table.unitPrice')}</th>
                            <th className="p-3 text-right">{t('labels.landedCost')} (USD)</th>
                            <th className="p-3 text-right">{t('labels.landedCost')} (AED)</th>
                            <th className="p-3 text-right">{t('labels.landedCost')} (TOMAN)</th>
                            <th className="p-3 text-center">{t('labels.progress')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {order.items.map(item => {
                            const costs = itemLandedCosts.get(item.id);
                            const progress = calculateItemProgress(item);
                            const isExpanded = expandedItemId === item.id;
                            return (
                                <React.Fragment key={item.id}>
                                    <tr onClick={() => toggleExpand(item.id)} className={`cursor-pointer bg-indigo-50 hover:bg-indigo-100 ${isExpanded ? 'bg-indigo-100' : ''}`}>
                                        <td className="p-2 text-center text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg></td>
                                        <td className="p-3 font-medium text-gray-900">{item.productName}</td>
                                        <td className="p-3 text-center font-mono text-gray-900">{item.quantity}</td>
                                        <td className="p-3 text-right font-mono text-gray-900">{item.price.toLocaleString('en-US', { minimumFractionDigits: 2 })} {order.currency}</td>
                                        <td className="p-3 text-right font-mono text-gray-900">{costs?.purchasePriceUSD.toFixed(2)}</td>
                                        <td className="p-3 text-right font-mono text-gray-900">{costs?.landedCostDubaiAED.toFixed(2)}</td>
                                        <td className="p-3 text-right font-mono text-gray-900">{formatToman(costs?.finalLandedCostTOMAN || 0, costingSettings)}</td>
                                        <td className="p-3 text-center"><div className="w-16 mx-auto bg-slate-200 rounded-full h-1.5"><div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${progress * 100}%` }}></div></div></td>
                                    </tr>
                                    {isExpanded && (
                                        <tr><td colSpan={8} className="p-0 bg-white"><ChecklistPanel item={item} onTaskToggle={onTaskToggle} readOnly={isReadOnly} onTaskDelete={onTaskDelete} onTaskUpdate={onTaskUpdate} editingTask={editingTask} setEditingTask={setEditingTask} /></td></tr>
                                    )}
                                </React.Fragment>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// FIX: Add missing CostBreakdownTab and CostSummaryTab components to resolve errors.
interface CostBreakdownTabProps {
    order: Order;
    detailedCosts: Map<string, DetailedItemCosts>;
    costingSettings: CostingSettings | null;
}

const CostBreakdownTab: React.FC<CostBreakdownTabProps> = ({ order, detailedCosts, costingSettings }) => {
    const { t } = useTranslation();
    const tomanUnitLabel = getTomanUnitLabel(costingSettings);
    const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
    const tomanFormatter = (value: number) => formatToman(value, costingSettings);

    const headers = [
        t('orderModal.table.productName'),
        `${t('labels.purchasePrice')} (USD)`,
        `${t('labels.shipStageCosts')} (USD)`,
        `${t('labels.dubaiStageCosts')} (AED)`,
        `${t('labels.landedCost')} (AED)`,
        `${t('labels.iranStageCosts')} (${t('common.toman')}${tomanUnitLabel})`,
        `Customs (${t('common.toman')}${tomanUnitLabel})`,
        `${t('labels.landedCost')} (${t('common.toman')}${tomanUnitLabel})`,
    ];

    return (
        <div className="p-4 sm:p-6">
             <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-xs text-slate-600 uppercase">
                        <tr>
                            {headers.map(h => <th key={h} className="p-3 text-left">{h}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {order.items.map(item => {
                            const costs = detailedCosts.get(item.id);
                            if (!costs) return null;
                            return (
                                <tr key={item.id} className="hover:bg-slate-50">
                                    <td className="p-2 font-medium text-slate-800">{item.productName}</td>
                                    <td className="p-2 font-mono text-center text-slate-800">{numberFormatter.format(costs.purchasePriceUSD)}</td>
                                    <td className="p-2 font-mono text-center text-slate-800">{numberFormatter.format(costs.shipCostsPerUnitUSD)}</td>
                                    <td className="p-2 font-mono text-center text-slate-800">{numberFormatter.format(costs.dubaiCostsPerUnitAED)}</td>
                                    <td className="p-2 font-mono text-center font-semibold text-slate-800">{numberFormatter.format(costs.landedCostDubaiAED)}</td>
                                    <td className="p-2 font-mono text-center text-slate-800">{tomanFormatter(costs.iranCostsPerUnitTOMAN)}</td>
                                    <td className="p-2 font-mono text-center text-slate-800">{tomanFormatter(costs.iranCustomsCostsPerUnitTOMAN)}</td>
                                    <td className="p-2 font-mono text-center font-semibold text-slate-800">{tomanFormatter(costs.finalLandedCostTOMAN)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

interface CostSummaryTabProps {
    order: Order;
    detailedCosts: Map<string, DetailedItemCosts>;
    setActiveTab: (tab: string) => void;
}

// FIX: Implemented the CostSummaryTab component body to calculate and display cost summaries, resolving the "not returning ReactNode" error.
const CostSummaryTab: React.FC<CostSummaryTabProps> = ({ order, detailedCosts, setActiveTab }) => {
    const { t } = useTranslation();
    
    const summary = useMemo(() => {
        let totalPurchaseUSD = 0;
        let totalShipUSD = 0;
        let totalDubaiAED = 0;
        let totalIranTOMAN = 0;
        let totalIranCustomsTOMAN = 0;
        let totalLandedTOMAN = 0;
        
        order.items.forEach(item => {
            const costs = detailedCosts.get(item.id);
            if (costs) {
                totalPurchaseUSD += costs.purchasePriceUSD * item.quantity;
                totalShipUSD += costs.shipCostsPerUnitUSD * item.quantity;
                totalDubaiAED += costs.dubaiCostsPerUnitAED * item.quantity;
                totalIranTOMAN += costs.iranCostsPerUnitTOMAN * item.quantity;
                totalIranCustomsTOMAN += costs.iranCustomsCostsPerUnitTOMAN * item.quantity;
                totalLandedTOMAN += costs.finalLandedCostTOMAN * item.quantity;
            }
        });

        return {
            totalPurchaseUSD,
            totalShipUSD,
            totalDubaiAED,
            totalIranTOMAN,
            totalIranCustomsTOMAN,
            totalLandedTOMAN,
        };
    }, [order, detailedCosts]);

    const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const aedFormatter = new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' });
    const tomanFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

    const SummaryRow: React.FC<{ label: string, value: string, isTotal?: boolean, linkTo?: string }> = ({ label, value, isTotal, linkTo }) => (
        <div className={`flex justify-between items-center py-2 ${isTotal ? 'font-bold text-lg border-t-2 border-slate-300 mt-2 pt-2' : 'border-b border-slate-200'}`}>
            <span className={isTotal ? "text-slate-800" : "text-slate-600"}>{label}</span>
            <div className="flex items-center gap-x-2">
                {linkTo && <button onClick={() => setActiveTab(linkTo)} className="text-xs text-indigo-600 hover:underline">({t('common.details')})</button>}
                <span className="font-mono text-slate-800">{value}</span>
            </div>
        </div>
    );

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">{t('orderModal.tabs.costSummary')}</h3>
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-1">
                <SummaryRow label={t('labels.purchasePrice')} value={usdFormatter.format(summary.totalPurchaseUSD)} />
                <SummaryRow label={t('labels.shipStageCosts')} value={usdFormatter.format(summary.totalShipUSD)} linkTo="ship" />
                <SummaryRow label={t('labels.dubaiStageCosts')} value={aedFormatter.format(summary.totalDubaiAED)} linkTo="dubai" />
                <SummaryRow label={t('labels.iranStageCosts')} value={`${tomanFormatter.format(summary.totalIranTOMAN)} ${t('common.toman')}`} linkTo="iran" />
                <SummaryRow label="Iran Customs Costs" value={`${tomanFormatter.format(summary.totalIranCustomsTOMAN)} ${t('common.toman')}`} linkTo="customs" />
                <SummaryRow label={t('labels.landedCost')} value={`${tomanFormatter.format(summary.totalLandedTOMAN)} ${t('common.toman')}`} isTotal />
            </div>
        </div>
    );
};

const AttachmentsPanel: React.FC<{
    order: Order;
    addAttachment: (orderId: string, attachment: Attachment, itemId?: string) => Promise<void>;
    deleteAttachment: (orderId: string, attachmentId: string, itemId?: string) => Promise<void>;
}> = ({ order, addAttachment, deleteAttachment }) => {
    const { t } = useTranslation();
    const { showConfirmation, addToast } = useModals();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadTarget, setUploadTarget] = useState<{ type: 'order' | 'item'; itemId?: string } | null>(null);

    const handleUploadClick = (type: 'order' | 'item', itemId?: string) => {
        setUploadTarget({ type, itemId });
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !uploadTarget) return;

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
            await addAttachment(order.id, newAttachment, uploadTarget.itemId);
        } catch (error) {
            console.error('Error reading file:', error);
            addToast('Failed to read the selected file.', 'error');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
            setUploadTarget(null);
        }
    };
    
    const downloadFile = (attachment: Attachment) => {
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

    const viewFile = (attachment: Attachment) => {
        try {
            const blob = new Blob([attachment.data], { type: attachment.type });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (error) {
            console.error("View failed:", error);
            addToast("Could not open file for viewing.", "error");
        }
    };
    
    const handleDeleteClick = (attachment: Attachment, itemId?: string) => {
        showConfirmation({
            title: t('confirmationModal.deleteAttachmentTitle'),
            message: t('confirmationModal.deleteAttachmentBody', { fileName: attachment.name }),
            variant: 'destructive',
            onConfirm: () => deleteAttachment(order.id, attachment.id, itemId),
        });
    };

    return (
        <div className="p-4 sm:p-6 space-y-6">
             <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
             {/* Order-level attachments */}
             <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold text-slate-800">{t('orderModal.attachments.orderAttachments')}</h3>
                    <button onClick={() => handleUploadClick('order')} className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-md hover:bg-indigo-200 text-sm font-semibold">{t('labels.uploadFile')}</button>
                </div>
                <div className="bg-slate-50 p-3 rounded-md border border-slate-200 space-y-2">
                    {(order.attachments && order.attachments.length > 0) ? order.attachments.map(att => {
                        const isViewable = att.type.startsWith('image/') || att.type === 'application/pdf';
                        return (
                         <div key={att.id} className="flex items-center justify-between p-2 rounded hover:bg-slate-200">
                             <div className="flex items-center gap-x-2 truncate">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                                <span className="text-sm text-slate-700 truncate" title={att.name}>{att.name}</span>
                             </div>
                             <div className="flex items-center gap-x-2">
                                {isViewable && <button onClick={() => viewFile(att)} className="text-xs font-semibold text-green-600 hover:underline">{t('common.open')}</button>}
                                <button onClick={() => downloadFile(att)} className="text-xs font-semibold text-indigo-600 hover:underline">{t('common.download')}</button>
                                <button onClick={() => handleDeleteClick(att)} className="text-xs font-semibold text-red-600 hover:underline">{t('buttons.delete')}</button>
                             </div>
                         </div>
                    )}) : <p className="text-sm text-slate-500 text-center py-4">{t('orderModal.attachments.noAttachments')}</p>}
                </div>
            </div>
            
            {/* Item-level attachments */}
            <div>
                 <h3 className="text-lg font-semibold text-slate-800 mb-2">{t('orderModal.attachments.itemAttachments')}</h3>
                 <div className="space-y-4">
                     {order.items.map(item => (
                        <div key={item.id}>
                            <div className="flex justify-between items-center mb-1">
                                <h4 className="font-semibold text-slate-700">{item.productName}</h4>
                                <button onClick={() => handleUploadClick('item', item.id)} className="bg-slate-200 text-slate-700 px-3 py-1 rounded-md hover:bg-slate-300 text-xs font-semibold">{t('labels.uploadFile')}</button>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-md border border-slate-200 space-y-2">
                                {(item.attachments && item.attachments.length > 0) ? item.attachments.map(att => {
                                    const isViewable = att.type.startsWith('image/') || att.type === 'application/pdf';
                                    return (
                                    <div key={att.id} className="flex items-center justify-between p-2 rounded hover:bg-slate-200">
                                        <div className="flex items-center gap-x-2 truncate">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                                            <span className="text-sm text-slate-700 truncate" title={att.name}>{att.name}</span>
                                        </div>
                                        <div className="flex items-center gap-x-2">
                                            {isViewable && <button onClick={() => viewFile(att)} className="text-xs font-semibold text-green-600 hover:underline">{t('common.open')}</button>}
                                            <button onClick={() => downloadFile(att)} className="text-xs font-semibold text-indigo-600 hover:underline">{t('common.download')}</button>
                                            <button onClick={() => handleDeleteClick(att, item.id)} className="text-xs font-semibold text-red-600 hover:underline">{t('buttons.delete')}</button>
                                        </div>
                                    </div>
                                )}) : <p className="text-sm text-slate-500 text-center py-2">{t('orderModal.attachments.noAttachments')}</p>}
                            </div>
                        </div>
                     ))}
                 </div>
            </div>
        </div>
    );
};

// --- Main Component ---
export const OrderModal: React.FC<OrderModalProps> = ({
    order,
    onClose,
    onEdit,
    onDelete,
    isFinalStatus,
    currencyRates,
    updateOrder,
    onFinalize,
    addCost,
    updateCost,
    removeCost,
    addAttachment,
    deleteAttachment,
    addPayment,
    updatePayment,
    deletePayment,
    aiSettings,
    onGenerateDocument,
    onOpenInvoiceModal,
    onOpenPackingListModal,
}) => {
    const { t, i18n } = useTranslation();
    const [activeTab, setActiveTab] = useState('details');
    const { showConfirmation, addToast } = useModals();
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
    const { settings: dbSettings } = useSettings();
    const finalizedProducts = useLiveQuery(() => db.products.where({ sourceOrderId: order.id }).toArray(), [order.id]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisIssues, setAnalysisIssues] = useState<AnalysisIssue[]>([]);
    const [editingTask, setEditingTask] = useState<{ itemId: string; taskId: string; text: string } | null>(null);
    const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
    const printMenuRef = useRef<HTMLDivElement>(null);
    const [showFinalizeOptions, setShowFinalizeOptions] = useState(false);


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (printMenuRef.current && !printMenuRef.current.contains(event.target as Node)) {
                setIsPrintMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);


    const costingSettings = useMemo(() => {
        const cs = dbSettings.find(s => s.key === 'perShipmentCostingSettings');
        return cs?.value as CostingSettings | null;
    }, [dbSettings]);

    const companyInfo = useMemo(() => dbSettings.find(s => s.key === 'companyInfo')?.value, [dbSettings]);
    const companyLogo = useMemo(() => dbSettings.find(s => s.key === 'companyLogo')?.value, [dbSettings]);

    const itemLandedCosts = useDetailedCostCalculator(order, currencyRates, costingSettings);

    const handleDelete = () => {
        showConfirmation({
            title: t('confirmationModal.deleteOrderTitle'),
            message: t('confirmationModal.deleteOrderBody', { orderId: order.id }),
            onConfirm: () => {
                onDelete();
                onClose();
            },
        });
    };
    
    const confirmFinalization = (skipProductUpdate: boolean = false) => {
        showConfirmation({
            title: t('orderModal.finalizeConfirmTitle'),
            message: t('orderModal.finalizeConfirmBody'),
            requireCode: true,
            confirmationCode: "1234",
            confirmText: t('buttons.finalize'),
            onConfirm: async () => {
                try {
                    await onFinalize(order.id, skipProductUpdate);
                } catch (error) {
                     const message = error instanceof Error ? error.message : "An unknown error occurred.";
                     addToast(`Finalization failed: ${message}`, 'error');
                }
            },
        });
    };

    const handleFinalizeOptionSelected = (skipUpdate: boolean) => {
        setShowFinalizeOptions(false);
        confirmFinalization(skipUpdate);
    };

    const handleFinalizeClick = () => {
        setShowFinalizeOptions(true);
    };

    const handleUnlock = () => {
        showConfirmation({
            title: t('orderModal.unlockTitle'),
            message: t('orderModal.unlockBody'),
            requireCode: true,
            confirmationCode: "4321",
            confirmText: t('buttons.unlockConfirm'),
            variant: 'primary',
            onConfirm: async () => {
                await updateOrder(order.id, { isFinalized: false });
                addToast(t('toasts.orderUnlocked'), 'info');
            }
        });
    };
    
    const handlePrint = (withChecklist: boolean) => {
        if (companyInfo === undefined || companyLogo === undefined) {
            addToast('Company info not loaded yet.', 'error');
            return;
        }
        // Updated to use the enhanced helper
        const html = generateEnhancedPrintableOrderHtml(order, currencyRates, t, { includeChecklist: withChecklist }, companyInfo, companyLogo);
        if((window as any).electronAPI) {
            (window as any).electronAPI.printComponent(html);
        } else {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                }, 500);
            }
        }
    };

    const handleExportToExcel = async () => {
        try {
            await exportOrderToExcel(order, finalizedProducts, costingSettings, t);
        } catch (err) {
            addToast(err instanceof Error ? err.message : t('toasts.exportFailed'), 'error');
            console.error(err);
        }
        setIsPrintMenuOpen(false);
    };
    
    const handleAnalyzeWithAI = async () => {
        if (!costingSettings) {
            addToast("Costing settings are not available for analysis.", "error");
            return;
        }
        if (!aiSettings?.apiKey) {
            addToast("API Key is not configured. Please set it in Settings > AI Settings.", "error");
            return;
        }
        setIsAnalyzing(true);
        try {
            const model = aiSettings?.poAnalysisModel || 'gemini-3.5-flash';
            const { summary, issues } = await analyzeOrderForIssues(order, costingSettings, model, aiSettings.apiKey);
            
            setAnalysisIssues(issues);

            const summaryToShow = summary === 'OK' 
                ? "AI analysis complete. No critical issues found."
                : summary;

            showConfirmation({
                title: "AI Analysis Report",
                message: summaryToShow,
                confirmText: "Done",
                onConfirm: () => {}, // Just close
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


    const handleTaskToggle = (itemId: string, taskId: string) => {
        const updatedItems = order.items.map(item => {
            if (item.id === itemId) {
                const updatedChecklist = item.checklist?.map(task => 
                    task.task_id === taskId ? { ...task, is_done: !task.is_done } : task
                );
                return { ...item, checklist: updatedChecklist };
            }
            return item;
        });
        updateOrder(order.id, { items: updatedItems });
    };

    const handleTaskUpdate = (itemId: string, taskId: string, newText: string) => {
        const updatedItems = order.items.map(item => {
            if (item.id === itemId) {
                const updatedChecklist = item.checklist?.map(task => 
                    task.task_id === taskId ? { ...task, task_en: newText, task_fa: newText } : task
                );
                return { ...item, checklist: updatedChecklist };
            }
            return item;
        });
        updateOrder(order.id, { items: updatedItems });
        setEditingTask(null);
    };

    // FIX: Added the missing `handleTaskDelete` function to manage checklist item deletion. This resolves the `Cannot find name 'onTaskDelete'` error by providing a valid handler to the `DetailsTab` component.
    const handleTaskDelete = (itemId: string, taskId: string) => {
         const updatedItems = order.items.map(item => {
            if (item.id === itemId) {
                const updatedChecklist = item.checklist?.filter(task => task.task_id !== taskId);
                return { ...item, checklist: updatedChecklist };
            }
            return item;
        });
        updateOrder(order.id, { items: updatedItems });
    };

    const tabs = {
        'details': t('orderModal.tabs.details'),
        'payments': t('orderModal.tabs.payments'),
        'attachments': t('orderModal.tabs.attachments'),
        'ship': t('orderModal.tabs.shipStage'),
        'dubai': t('orderModal.tabs.dubaiStage'),
        'iran': t('orderModal.tabs.iranStage'),
        'customs': t('orderModal.tabs.customsCalc'),
        'breakdown': t('orderModal.tabs.costBreakdown'),
        'summary': t('orderModal.tabs.costSummary'),
    };
    
    return (
        <>
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex-shrink-0">
                    <div className="flex justify-between items-center">
                         <div className="flex items-center gap-x-4">
                            <h2 className="text-xl font-bold text-gray-800">{t('orderModal.title')}: {order.id}</h2>
                            {order.isFinalized && <span className="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">{t('orderModal.finalizedBadge')}</span>}
                        </div>
                        <div className="flex items-center gap-x-2">
                             <button onClick={handleDelete} disabled={isFinalStatus || order.isArchived || order.isFinalized} className="text-red-600 font-semibold text-sm px-3 py-1.5 rounded-md hover:bg-red-50 disabled:text-red-300 disabled:cursor-not-allowed" title={isFinalStatus || order.isArchived ? t('orderModal.deleteDisabledTooltip') : ""}>{t('buttons.delete')}</button>
                             <button onClick={() => onEdit(order)} disabled={order.isFinalized} className="text-indigo-600 font-semibold text-sm px-3 py-1.5 rounded-md hover:bg-indigo-50 disabled:text-indigo-300 disabled:cursor-not-allowed">{t('buttons.edit')}</button>
                             {order.isFinalized ? (
                                <button onClick={handleUnlock} className="bg-yellow-500 text-white px-3 py-1.5 rounded-md hover:bg-yellow-600 text-sm font-semibold">{t('buttons.unlock')}</button>
                             ) : (
                                <button onClick={handleFinalizeClick} className="bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 text-sm font-semibold">{t('buttons.finalize')}</button>
                             )}
                            <button onClick={onClose} className="p-2 rounded-full text-slate-500 hover:bg-slate-100 ml-4">&times;</button>
                        </div>
                    </div>
                     <nav className="mt-4 -mb-4 -mx-4 border-b border-slate-200">
                        <div className="px-4 flex space-x-4 rtl:space-x-reverse overflow-x-auto">
                            {Object.entries(tabs).map(([key, label]) => (
                                 <button key={key} onClick={() => setActiveTab(key)} className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>{label}</button>
                            ))}
                        </div>
                    </nav>
                </header>
                <main className="flex-1 overflow-y-auto">
                    {activeTab === 'details' && <DetailsTab order={order} currencyRates={currencyRates} costingSettings={costingSettings} itemLandedCosts={itemLandedCosts} expandedItemId={expandedItemId} setExpandedItemId={setExpandedItemId} onTaskToggle={handleTaskToggle} isReadOnly={order.isFinalized} onTaskDelete={handleTaskDelete} onTaskUpdate={handleTaskUpdate} editingTask={editingTask} setEditingTask={setEditingTask} />}
                    {activeTab === 'payments' && <PaymentsTab order={order} addPayment={addPayment} updatePayment={updatePayment} deletePayment={deletePayment} isReadOnly={order.isFinalized} currencyRates={currencyRates} />}
                    {activeTab === 'attachments' && <AttachmentsPanel order={order} addAttachment={addAttachment} deleteAttachment={deleteAttachment} />}
                    {activeTab === 'ship' && <CostsPanel costs={order.shipCosts || []} onAddCost={(c) => addCost(order.id, 'shipCosts', c)} onUpdateCost={(c) => updateCost(order.id, 'shipCosts', c)} onRemoveCost={(id) => removeCost(order.id, 'shipCosts', id)} isReadOnly={order.isFinalized} defaultCurrency="USD" orderItems={order.items} />}
                    {activeTab === 'dubai' && <CostsPanel costs={order.dubaiCosts || []} onAddCost={(c) => addCost(order.id, 'dubaiCosts', c)} onUpdateCost={(c) => updateCost(order.id, 'dubaiCosts', c)} onRemoveCost={(id) => removeCost(order.id, 'dubaiCosts', id)} isReadOnly={order.isFinalized} defaultCurrency="AED" orderItems={order.items} />}
                    {activeTab === 'iran' && <CostsPanel costs={(order.iranCosts || []).filter(c => c.category !== 'system_customs')} onAddCost={(c) => addCost(order.id, 'iranCosts', c)} onUpdateCost={(c) => updateCost(order.id, 'iranCosts', c)} onRemoveCost={(id) => removeCost(order.id, 'iranCosts', id)} isReadOnly={order.isFinalized} defaultCurrency="TOMAN" orderItems={order.items} />}
                    {activeTab === 'customs' && <IranCustomsPanel order={order} onUpdate={(u) => updateOrder(order.id, u)} isReadOnly={order.isFinalized} />}
                    {activeTab === 'breakdown' && <CostBreakdownTab order={order} detailedCosts={itemLandedCosts} costingSettings={costingSettings} />}
                    {activeTab === 'summary' && <CostSummaryTab order={order} detailedCosts={itemLandedCosts} setActiveTab={setActiveTab} />}
                </main>
                 <footer className="p-2 bg-slate-50 rounded-b-xl flex-shrink-0 flex justify-between items-center border-t border-slate-200">
                     <div className="flex items-center gap-x-2">
                         <button
                            type="button"
                            onClick={handleAnalyzeWithAI}
                            disabled={isAnalyzing || !aiSettings?.apiKey}
                            className="bg-purple-100 text-purple-800 px-3 py-1.5 rounded-md hover:bg-purple-200 text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-x-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isAnalyzing ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 3zM6.03 5.23a.75.75 0 01.04 1.06l-1.72 1.72a.75.75 0 01-1.06-1.06l-1.72-1.72a.75.75 0 011.02 0zm8 0a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06zM10 18a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5H10a.75.75 0 01-.75-.75zM4.75 11.25a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75zm9.25-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zM6.03 14.77a.75.75 0 011.02 0l1.72 1.72a.75.75 0 11-1.06 1.06l-1.72-1.72a.75.75 0 01.04-1.06z" clipRule="evenodd" /></svg>
                            {isAnalyzing ? t('orderFormModal.analyzing') : t('orderFormModal.analyzeWithAI')}
                        </button>
                     </div>
                     <div className="flex items-center gap-x-2">
                        <div ref={printMenuRef} className="relative">
                            <button 
                                onClick={() => setIsPrintMenuOpen(p => !p)} 
                                className="bg-white text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-200 border border-slate-300 text-sm font-semibold flex items-center"
                            >
                                {t('buttons.printExport')}
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            </button>
                            {isPrintMenuOpen && (
                                <div className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-md shadow-lg border border-slate-200 z-30">
                                    <div className="p-1">
                                        <button onClick={handleExportToExcel} className="w-full text-left p-2 hover:bg-slate-100 rounded text-sm">{t('buttons.exportToExcel')}</button>
                                         <button onClick={() => handlePrint(false)} className="w-full text-left p-2 hover:bg-slate-100 rounded text-sm">{t('orderModal.printMenu.orderDetails')} ({t('orderModal.printOptions.withoutChecklist')})</button>
                                         <button onClick={() => handlePrint(true)} className="w-full text-left p-2 hover:bg-slate-100 rounded text-sm">{t('orderModal.printMenu.orderDetails')} ({t('orderModal.printOptions.withChecklist')})</button>
                                         <button 
                                            onClick={() => { onOpenPackingListModal(order); }} 
                                            className="w-full text-left p-2 hover:bg-slate-100 rounded text-sm disabled:text-slate-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                            disabled={!order.isFinalized}
                                            title={!order.isFinalized ? t('orderModal.finalizeRequiredForPL') : ''}
                                        >
                                            {t('orderModal.printMenu.packingList')}
                                        </button>
                                         <button 
                                            onClick={() => { onOpenInvoiceModal(order); }} 
                                            className="w-full text-left p-2 hover:bg-slate-100 rounded text-sm disabled:text-slate-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                            disabled={!order.isFinalized}
                                            title={!order.isFinalized ? t('orderModal.finalizeRequiredForInvoice') : ''}
                                        >
                                            {t('orderModal.printMenu.invoice')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </footer>
            </div>
            
            {showFinalizeOptions && (
                <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">{t('orderModal.finalizeOptions.title')}</h2>
                        <p className="text-slate-600 mb-6">{t('orderModal.finalizeOptions.body')}</p>
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={() => handleFinalizeOptionSelected(false)}
                                className="w-full bg-indigo-600 text-white px-4 py-3 rounded-lg hover:bg-indigo-700 font-semibold flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                {t('orderModal.finalizeOptions.standard')}
                            </button>
                            <button 
                                onClick={() => handleFinalizeOptionSelected(true)}
                                className="w-full bg-white border-2 border-indigo-600 text-indigo-600 px-4 py-3 rounded-lg hover:bg-indigo-50 font-semibold"
                            >
                                {t('orderModal.finalizeOptions.onlyFinalize')}
                            </button>
                            <button 
                                onClick={() => setShowFinalizeOptions(false)}
                                className="w-full text-slate-500 hover:text-slate-700 font-medium py-2 mt-2"
                            >
                                {t('common.cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </>
    );
};