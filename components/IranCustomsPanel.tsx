import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderItem, CostingSettings, Cost } from '../types';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../hooks/useSettings';
import NumericInput from './NumericInput';
import { useModals } from '../contexts/ModalContext';
import Select from './Select';

interface IranCustomsPanelProps {
    order: Order;
    onUpdate: (updates: Partial<Order>) => void;
    isReadOnly: boolean;
}

type ItemCustomsData = {
    value: number; // customs value in USD
    basis: 'unit' | 'kg';
};

const IranCustomsPanel: React.FC<IranCustomsPanelProps> = ({ order, onUpdate, isReadOnly }) => {
    const { t } = useTranslation();
    const { settings: dbSettings } = useSettings();
    const { addToast, showConfirmation } = useModals();
    const [customsData, setCustomsData] = useState<Record<string, ItemCustomsData>>({});

    useEffect(() => {
        const initialData: Record<string, ItemCustomsData> = {};
        order.items.forEach(item => {
            initialData[item.id] = {
                value: item.customsValue || 0,
                basis: item.customsValueBasis || 'unit'
            };
        });
        setCustomsData(initialData);
    }, [order.items]);
    
    const areCostsApplied = useMemo(() => order.iranCosts?.some(c => c.category === 'system_customs'), [order.iranCosts]);

    const costingSettings = useMemo(() => {
        const cs = dbSettings.find(s => s.key === 'perShipmentCostingSettings');
        return cs?.value as CostingSettings | undefined;
    }, [dbSettings]);

    const handleDataChange = (itemId: string, field: keyof ItemCustomsData, value: number | 'unit' | 'kg') => {
        setCustomsData(prev => ({
            ...prev,
            [itemId]: { ...prev[itemId], [field]: value }
        }));
    };
    
    const handleApplyToOrder = () => {
         // First, save the entered customs values back to the order items
        const updatedItems = order.items.map(item => {
            const data = customsData[item.id];
            if (data) {
                return { ...item, customsValue: data.value, customsValueBasis: data.basis };
            }
            return item;
        });

        // Second, calculate total costs and prepare cost objects
        let totalDuty = 0, totalVat = 0, totalBroker = 0, totalShip = 0, totalInland = 0, totalStandardFee = 0, totalLoadingUnloading = 0;
        
        calculatedCosts.forEach((costs, itemId) => {
            const item = order.items.find(i => i.id === itemId);
            if(item && costs) {
                totalDuty += (Number(costs.finalDuty) || 0) * item.quantity;
                totalVat += (Number(costs.importVat) || 0) * item.quantity;
                totalBroker += (Number(costs.brokerFee) || 0) * item.quantity;
                totalShip += (Number(costs.shipFreight) || 0) * item.quantity;
                totalInland += (Number(costs.inlandFreight) || 0) * item.quantity;
                totalStandardFee += (Number(costs.standardFee) || 0) * item.quantity;
                totalLoadingUnloading += (Number(costs.loadingUnloadingFee) || 0) * item.quantity;
            }
        });
        
        const systemCostDefaults = {
            currency: 'TOMAN' as const,
            basis: 'equal' as const,
            category: 'system_customs' as const,
        };

        const newCosts: Cost[] = [
            { id: crypto.randomUUID(), name: t('iranCustomsPanel.finalDutyToman'), amount: totalDuty, ...systemCostDefaults },
            { id: crypto.randomUUID(), name: t('iranCustomsPanel.importVatToman'), amount: totalVat, ...systemCostDefaults },
            { id: crypto.randomUUID(), name: t('iranCustomsPanel.brokerFee'), amount: totalBroker, ...systemCostDefaults },
            { id: crypto.randomUUID(), name: t('iranCustomsPanel.shipFreight'), amount: totalShip, ...systemCostDefaults },
            { id: crypto.randomUUID(), name: t('iranCustomsPanel.inlandFreight'), amount: totalInland, ...systemCostDefaults },
            { id: crypto.randomUUID(), name: t('iranCustomsPanel.standardFee'), amount: totalStandardFee, ...systemCostDefaults },
            { id: crypto.randomUUID(), name: t('iranCustomsPanel.loadingUnloadingFee'), amount: totalLoadingUnloading, ...systemCostDefaults },
        ].filter(cost => isFinite(cost.amount) && cost.amount > 0);

        const existingManualCosts = (order.iranCosts || []).filter(c => c.category !== 'system_customs');

        onUpdate({ 
            items: updatedItems,
            iranCosts: [...existingManualCosts, ...newCosts]
        });
        addToast(t('iranCustomsPanel.costsApplied'), 'success');
    };

    const handleRemoveCosts = () => {
        showConfirmation({
            title: t('confirmationModal.removeCustomsCostsTitle'),
            message: t('confirmationModal.removeCustomsCostsBody'),
            variant: 'destructive',
            confirmText: t('buttons.delete'),
            onConfirm: () => {
                const updatedItems = order.items.map(item => ({
                    ...item,
                    customsValue: undefined,
                    customsValueBasis: undefined
                }));
                const updatedIranCosts = (order.iranCosts || []).filter(c => c.category !== 'system_customs');
                
                onUpdate({
                    items: updatedItems,
                    iranCosts: updatedIranCosts
                });
                
                addToast(t('toasts.customsCostsRemoved'), 'success');
            }
        });
    };

    const calculatedCosts = useMemo(() => {
        const results = new Map<string, Record<string, number>>();
        if (!costingSettings) return results;
        const ic = costingSettings.iranCustoms;

        order.items.forEach(item => {
            const data = customsData[item.id];
            if (!data) return;

            const grossWeightPerUnit = (item.itemsPerCarton > 0 && item.grossWeight) ? item.grossWeight / item.itemsPerCarton : 0;
            const baseValueUsd = data.basis === 'kg' ? data.value * grossWeightPerUnit : data.value;
            
            // 1. Final Duty
            const dutyBaseToman = baseValueUsd * ic.customsUsdRate;
            const totalTariff = (ic.servicesTariffRate / 100) + (ic.importDutyRate / 100);
            const duty = dutyBaseToman * totalTariff;
            const postVat = duty * (ic.postCustomsVatRate / 100);
            const finalDuty = duty + postVat;

            // 2. Import VAT
            const vatBaseToman = baseValueUsd * ic.vatUsdRate;
            const importVat = vatBaseToman * (ic.importVatRate / 100);

            // 3. Broker Fee
            const feePerCarton = ic.brokerFeePerCarton;
            const feePerUnit = item.itemsPerCarton > 0 ? feePerCarton / item.itemsPerCarton : 0;
            const brokerFee = feePerUnit * (1 + ic.servicesVatRate / 100);

            // 4. Ship Freight
            const shipRatePerCbm = ic.woodenShipFreightVolume > 0 ? ic.woodenShipFreightRate / ic.woodenShipFreightVolume : 0;
            const shipCostPerCarton = shipRatePerCbm * item.cartonCBM;
            const shipCostPerUnit = item.itemsPerCarton > 0 ? shipCostPerCarton / item.itemsPerCarton : 0;
            const shipFreight = shipCostPerUnit * (1 + ic.woodenShipFreightVatRate / 100);

            // 5. Inland Freight
            const inlandRatePerCbm = ic.inlandFreightVolume > 0 ? ic.inlandFreightRate / ic.inlandFreightVolume : 0;
            const inlandCostPerCarton = inlandRatePerCbm * item.cartonCBM;
            const inlandCostPerUnit = item.itemsPerCarton > 0 ? inlandCostPerCarton / item.itemsPerCarton : 0;
            const inlandFreight = inlandCostPerUnit * (1 + ic.inlandFreightVatRate / 100);
            
            // 6. Standard Fee
            const standardFeeBase = dutyBaseToman * (ic.standardFeeRate / 100);
            const standardFee = standardFeeBase * (1 + (ic.standardFeeVatRate || 0) / 100);

            // 7. Loading/Unloading Fee
            const weightInTons = grossWeightPerUnit / 1000;
            const totalFeePerTon = ic.unloadingFeePerTon + ic.loadingFeePerTon;
            const avgVatRate = ((ic.unloadingFeeVatRate || 0) + (ic.loadingFeeVatRate || 0)) / 200;
            const loadingUnloadingBase = weightInTons * totalFeePerTon;
            const loadingUnloadingFee = loadingUnloadingBase * (1 + avgVatRate);

            const totalPerUnit = finalDuty + importVat + brokerFee + shipFreight + inlandFreight + standardFee + loadingUnloadingFee;

            results.set(item.id, { baseValueUsd, finalDuty, importVat, brokerFee, shipFreight, inlandFreight, standardFee, loadingUnloadingFee, totalPerUnit });
        });

        return results;
    }, [costingSettings, customsData, order.items]);

    if (!costingSettings) {
        return <div className="p-6 text-center text-slate-500">Costing settings are not configured.</div>;
    }

    const tomanFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

    const headerClasses = {
        calc: "p-3 text-xs text-white uppercase tracking-wider font-bold bg-slate-800",
        total: "p-3 text-xs text-white uppercase tracking-wider font-bold bg-cyan-500",
    };
    const cellClasses = {
        product: "p-2 text-right font-medium text-white bg-slate-800",
        input: "p-2 w-32 bg-slate-800",
        calc: "p-2 font-mono bg-slate-800 text-white",
        total: "p-2 font-mono font-bold bg-cyan-100 text-cyan-800",
    };

    return (
        <div className="p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-1">{t('iranCustomsPanel.title')}</h3>
            <p className="text-sm text-slate-600 mb-4">{t('iranCustomsPanel.description')}</p>
            
            <div className="border border-slate-300 rounded-lg overflow-x-auto">
                <table className="min-w-full text-sm text-center">
                     <thead className="bg-slate-100">
                        <tr>
                            <th className={`${headerClasses.calc} text-right rounded-tl-lg`}>{t('labels.internalCode')}</th>
                            <th className={`${headerClasses.calc} text-right`}>{t('orderModal.table.productName')}</th>
                            <th className={`${headerClasses.calc} text-center`}>{t('iranCustomsPanel.customsValueUsd')}</th>
                            <th className={`${headerClasses.calc} text-center`}>{t('iranCustomsPanel.customsBasis')}</th>
                            <th className={`${headerClasses.calc} text-center`}>{t('iranCustomsPanel.finalDutyToman')}</th>
                            <th className={`${headerClasses.calc} text-center`}>{t('iranCustomsPanel.importVatToman')}</th>
                            <th className={`${headerClasses.calc} text-center`}>{t('iranCustomsPanel.brokerFee')}</th>
                            <th className={`${headerClasses.calc} text-center`}>{t('iranCustomsPanel.shipFreight')}</th>
                            <th className={`${headerClasses.calc} text-center`}>{t('iranCustomsPanel.inlandFreight')}</th>
                            <th className={`${headerClasses.calc} text-center`}>{t('iranCustomsPanel.standardFee')}</th>
                            <th className={`${headerClasses.calc} text-center`}>{t('iranCustomsPanel.loadingUnloadingFee')}</th>
                            <th className={`${headerClasses.total} text-center rounded-tr-lg`}>{t('iranCustomsPanel.totalPerUnit')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                        {order.items.map(item => {
                            const data = customsData[item.id] || { value: 0, basis: 'unit' };
                            const costs = calculatedCosts.get(item.id);
                            return (
                                <tr key={item.id}>
                                    <td className={cellClasses.product}>{item.internalCode}</td>
                                    <td className={cellClasses.product}>{item.productName}</td>
                                     <td className={cellClasses.input}>
                                        <NumericInput
                                            value={data.value}
                                            onChange={v => handleDataChange(item.id, 'value', v)}
                                            disabled={isReadOnly}
                                            className="w-full text-center bg-slate-700 text-white border border-slate-500 rounded-md p-1.5 text-sm disabled:bg-slate-800 disabled:text-slate-400"
                                        />
                                    </td>
                                     <td className={cellClasses.input}>
                                        <Select 
                                            value={data.basis} 
                                            onChange={e => handleDataChange(item.id, 'basis', e.target.value as 'unit' | 'kg')}
                                            disabled={isReadOnly}
                                            className="bg-slate-700 text-white border-slate-500 p-1.5 disabled:bg-slate-800 disabled:text-slate-400"
                                        >
                                            <option value="unit">{t('orderFormModal.customsBasisOptions.unit')}</option>
                                            <option value="kg">{t('orderFormModal.customsBasisOptions.kg')}</option>
                                        </Select>
                                     </td>
                                     <td className={cellClasses.calc}>{tomanFormatter.format(costs?.finalDuty || 0)}</td>
                                     <td className={cellClasses.calc}>{tomanFormatter.format(costs?.importVat || 0)}</td>
                                     <td className={cellClasses.calc}>{tomanFormatter.format(costs?.brokerFee || 0)}</td>
                                     <td className={cellClasses.calc}>{tomanFormatter.format(costs?.shipFreight || 0)}</td>
                                     <td className={cellClasses.calc}>{tomanFormatter.format(costs?.inlandFreight || 0)}</td>
                                     <td className={cellClasses.calc}>{tomanFormatter.format(costs?.standardFee || 0)}</td>
                                     <td className={cellClasses.calc}>{tomanFormatter.format(costs?.loadingUnloadingFee || 0)}</td>
                                     <td className={cellClasses.total}>{tomanFormatter.format(costs?.totalPerUnit || 0)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

             {!isReadOnly && (
                <div className="mt-4 flex justify-end">
                    {areCostsApplied ? (
                        <button 
                            onClick={handleRemoveCosts} 
                            className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
                        >
                            {t('buttons.removeAppliedCosts')}
                        </button>
                    ) : (
                        <button onClick={handleApplyToOrder} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
                            {t('buttons.applyCosts')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default IranCustomsPanel;
