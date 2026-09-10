import React, { useState, useMemo } from 'react';
import { Order, Payment, CurrencyRates } from '../types';
import { useTranslation } from 'react-i18next';
import { useModals } from '../contexts/ModalContext';
import { formatDisplayDate } from '../utils/dateUtils';
import NumericInput from './NumericInput';
import CustomDateInput from './CustomDateInput';
import Select from './Select';

interface PaymentsTabProps {
    order: Order;
    addPayment: (orderId: string, payment: Omit<Payment, 'id'>) => Promise<void>;
    updatePayment: (orderId: string, payment: Payment) => Promise<void>;
    deletePayment: (orderId: string, paymentId: string) => Promise<void>;
    isReadOnly: boolean;
    // FIX: Added missing currencyRates prop to satisfy the parent component and enable currency conversion.
    currencyRates: CurrencyRates;
}

const PaymentsTab: React.FC<PaymentsTabProps> = ({ order, addPayment, updatePayment, deletePayment, isReadOnly, currencyRates }) => {
    const { t, i18n } = useTranslation();
    const { showConfirmation } = useModals();

    const [isFormVisible, setIsFormVisible] = useState(false);
    const [editingPayment, setEditingPayment] = useState<Partial<Payment> | null>(null);

    const totalValue = useMemo(() => order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0), [order.items]);
    const totalPaidInUSD = useMemo(() => (order.payments || []).reduce((sum, p) => sum + p.amountUSD, 0), [order.payments]);

    const totalPaidInOrderCurrency = useMemo(() => {
        if (!currencyRates) return totalPaidInUSD; // Fallback to USD if rates are missing

        switch (order.currency) {
            case 'USD':
                return totalPaidInUSD;
            case 'CNY':
                return currencyRates.cny > 0 ? totalPaidInUSD / currencyRates.cny : 0;
            case 'AED':
                return totalPaidInUSD * currencyRates.aed;
            case 'TOMAN':
                return totalPaidInUSD * currencyRates.toman;
            default:
                return totalPaidInUSD; // Should not happen, but safe fallback
        }
    }, [order.currency, totalPaidInUSD, currencyRates]);

    const balanceDue = totalValue - totalPaidInOrderCurrency;

    const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    
    // Create a formatter that doesn't display the currency symbol for a cleaner look
    const orderCurrencyFormatter = new Intl.NumberFormat('en-US', { 
      style: 'decimal', 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });


    const handleAddNew = () => {
        setEditingPayment({ type: 'other', amount: 0, currency: 'USD', date: new Date().toISOString().split('T')[0], description: '' });
        setIsFormVisible(true);
    };

    const handleEdit = (payment: Payment) => {
        setEditingPayment({ ...payment });
        setIsFormVisible(true);
    };

    const handleCancel = () => {
        setEditingPayment(null);
        setIsFormVisible(false);
    };

    // FIX: Updated `handleSave` to correctly calculate `amountUSD` based on the selected currency and amount before saving.
    const handleSave = () => {
        if (!editingPayment || !editingPayment.date || editingPayment.amount === undefined || !editingPayment.currency) return;
    
        // Calculate amountUSD from amount and currency
        let amountUSD = editingPayment.amount;
        if (editingPayment.currency !== 'USD' && currencyRates) {
            switch (editingPayment.currency) {
                case 'AED':
                    amountUSD = currencyRates.aed > 0 ? editingPayment.amount / currencyRates.aed : 0;
                    break;
                case 'TOMAN':
                    amountUSD = currencyRates.toman > 0 ? editingPayment.amount / currencyRates.toman : 0;
                    break;
                case 'CNY':
                    // currencyRates.cny is CNY_TO_USD
                    amountUSD = editingPayment.amount * (currencyRates.cny || 0);
                    break;
                default:
                    break; 
            }
        }
    
        const finalPaymentData = {
            type: editingPayment.type!,
            amount: editingPayment.amount,
            currency: editingPayment.currency!,
            amountUSD: amountUSD,
            date: editingPayment.date,
            description: editingPayment.description || '',
        };
    
        if (editingPayment.id) {
            updatePayment(order.id, { ...finalPaymentData, id: editingPayment.id });
        } else {
            addPayment(order.id, finalPaymentData);
        }
        handleCancel();
    };

    const handleDelete = (paymentId: string) => {
        showConfirmation({
            title: t('confirmationModal.deleteItemTitle'),
            message: t('confirmationModal.deleteItemBody'),
            variant: 'destructive',
            onConfirm: () => deletePayment(order.id, paymentId),
        });
    };
    
    const paymentTypes = {
        down_payment: t('paymentFormModal.types.down_payment'),
        balance: t('paymentFormModal.types.balance'),
        other: t('paymentFormModal.types.other'),
    };

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div className="grid grid-cols-3 gap-4 text-center p-4 bg-slate-50 rounded-lg">
                <div>
                    <p className="text-sm text-slate-500 font-semibold">{t('labels.totalOrderValue')}</p>
                    <p className="text-2xl font-bold font-mono text-slate-800">{orderCurrencyFormatter.format(totalValue)} <span className="text-lg">{order.currency}</span></p>
                </div>
                <div>
                    <p className="text-sm text-slate-500 font-semibold">{t('labels.totalPayments')}</p>
                    <p className="text-2xl font-bold font-mono text-green-600">{usdFormatter.format(totalPaidInUSD)}</p>
                </div>
                <div>
                    <p className="text-sm text-slate-500 font-semibold">{t('labels.balance')}</p>
                    <p className="text-2xl font-bold font-mono text-red-600">{orderCurrencyFormatter.format(balanceDue)} <span className="text-lg">{order.currency}</span></p>
                </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-xs text-slate-600 uppercase">
                        <tr>
                            <th className="p-3 text-left">{t('labels.date')}</th>
                            <th className="p-3 text-left">{t('paymentFormModal.paymentType')}</th>
                            <th className="p-3 text-left">{t('paymentFormModal.description')}</th>
                            <th className="p-3 text-right">{t('paymentFormModal.paymentAmount')}</th>
                            {!isReadOnly && <th className="p-3 text-center">{t('common.actions')}</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {(order.payments || []).map(p => (
                            <tr key={p.id} className="hover:bg-slate-50">
                                <td className="p-3 font-mono">{formatDisplayDate(p.date, i18n.language)}</td>
                                <td className="p-3">{paymentTypes[p.type]}</td>
                                <td className="p-3 text-slate-700">{p.description}</td>
                                <td className="p-3 text-right font-mono font-semibold text-slate-800">{usdFormatter.format(p.amountUSD)}</td>
                                {!isReadOnly && (
                                    <td className="p-3 text-center space-x-2">
                                        <button onClick={() => handleEdit(p)} className="font-semibold text-indigo-600">{t('buttons.edit')}</button>
                                        <button onClick={() => handleDelete(p.id)} className="font-semibold text-red-600">{t('buttons.delete')}</button>
                                    </td>
                                )}
                            </tr>
                        ))}
                         {(order.payments || []).length === 0 && (
                            <tr>
                                <td colSpan={isReadOnly ? 4 : 5} className="p-8 text-center text-slate-400">No payments recorded yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isFormVisible && editingPayment && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                    <h3 className="font-semibold text-lg">{editingPayment.id ? t('paymentFormModal.editPayment') : t('paymentFormModal.newPayment')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <CustomDateInput 
                            label={t('labels.paymentDate')} 
                            name="paymentDate"
                            value={editingPayment.date || ''}
                            onChange={(_, v) => setEditingPayment(p => p ? {...p, date: v} : null)}
                            required
                        />
                         <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
                                <Select value={editingPayment.currency || 'USD'} onChange={e => setEditingPayment(p => p ? {...p, currency: e.target.value as Payment['currency']} : null)}>
                                    <option>USD</option>
                                    <option>AED</option>
                                    <option>TOMAN</option>
                                    <option>CNY</option>
                                </Select>
                            </div>
                            <div className="col-span-2">
                                <NumericInput 
                                    label={t('paymentFormModal.paymentAmount')}
                                    value={editingPayment.amount || 0}
                                    onChange={v => setEditingPayment(p => p ? {...p, amount: v} : null)}
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">{t('paymentFormModal.paymentType')}</label>
                            <Select value={editingPayment.type || 'other'} onChange={e => setEditingPayment(p => p ? {...p, type: e.target.value as Payment['type']} : null)}>
                                {Object.entries(paymentTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </Select>
                        </div>
                        <div className="md:col-span-2">
                             <label className="block text-xs font-medium text-slate-600 mb-1">{t('paymentFormModal.description')}</label>
                            <input
                                type="text"
                                value={editingPayment.description || ''}
                                onChange={e => setEditingPayment(p => p ? {...p, description: e.target.value} : null)}
                                className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-x-2">
                        <button type="button" onClick={handleCancel} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                        <button type="button" onClick={handleSave} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('buttons.save')}</button>
                    </div>
                </div>
            )}
            
            {!isReadOnly && !isFormVisible && (
                 <button onClick={handleAddNew} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-semibold flex items-center gap-x-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                    {t('buttons.newPayment')}
                </button>
            )}
        </div>
    );
};
export default PaymentsTab;