import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import CustomDateInput from './CustomDateInput';
import NumericInput from './NumericInput';
import { persianArabicToEnglish } from '../utils/formatters';
import { Currency, Order } from '../types';
import Select from './Select';

interface PaymentFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { payee: string; amount: number; date: string; description: string; currency: Currency; }, paymentId?: string) => void;
    paymentToEdit?: Order | null;
    initialDate?: string;
}

const PaymentFormModal: React.FC<PaymentFormModalProps> = ({ isOpen, onClose, onSubmit, paymentToEdit, initialDate }) => {
    const { t } = useTranslation();
    const [payee, setPayee] = useState('');
    const [amount, setAmount] = useState(0);
    const [date, setDate] = useState('');
    const [description, setDescription] = useState('');
    const [currency, setCurrency] = useState<Currency>('USD');

    useEffect(() => {
        if (isOpen) {
            if (paymentToEdit) {
                setPayee(paymentToEdit.supplier);
                setAmount(paymentToEdit.items[0]?.price || 0);
                setDate(paymentToEdit.orderDate);
                setDescription(paymentToEdit.internalCode || '');
                setCurrency(paymentToEdit.currency || 'USD');
            } else {
                setPayee('');
                setAmount(0);
                setDate(initialDate || new Date().toISOString().split('T')[0]);
                setDescription('');
                setCurrency('USD');
            }
        }
    }, [isOpen, paymentToEdit, initialDate]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (payee.trim() && amount > 0 && date) {
            onSubmit({ 
                payee: payee.trim(), 
                amount, 
                date, 
                description: description.trim(),
                currency
            }, paymentToEdit?.id);
        }
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-gray-800">{paymentToEdit ? t('paymentFormModal.editPayment') : t('paymentFormModal.newPayment')}</h2>
                </header>
                <main className="flex-1 p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentFormModal.payee')}</label>
                        <input
                            type="text"
                            value={payee}
                            onChange={e => setPayee(persianArabicToEnglish(e.target.value))}
                            required
                            autoFocus
                            className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                     <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-1">
                           <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                           <Select value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
                               <option>USD</option>
                               <option>CNY</option>
                               <option>AED</option>
                               <option>TOMAN</option>
                           </Select>
                        </div>
                        <div className="col-span-2">
                           <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentFormModal.paymentAmount')}</label>
                           <NumericInput value={amount} onChange={setAmount} required />
                        </div>
                    </div>
                    <div>
                        <CustomDateInput label={t('labels.paymentDate')} name="paymentDate" value={date} onChange={(_, v) => setDate(v)} required />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentFormModal.description')}</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(persianArabicToEnglish(e.target.value))}
                            rows={3}
                            className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                </main>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-end gap-x-3">
                    <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">{t('buttons.save')}</button>
                </footer>
            </form>
        </div>
    );
};

export default PaymentFormModal;
