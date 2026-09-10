
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Order, Status, ChecklistTemplate, CurrencyRates, Task, OrderItem, CostingSettings, DisplaySettings, ListViewHeaderDisplaySettings, StickyNote, CalendarTask, CalendarStickyNote, AISettings, DailyImage, DailyAttachment, Currency } from '../types';
import { useTranslation } from 'react-i18next';
import { getContainerInfo, formatToman, getTomanUnitLabel, getOrderValueInUSD } from '../utils/formatters';
import { getYearMonthKey, getMonthNameAndYear, stringToDate, dateFromYearMonthKey, getCurrentYearMonthKey, formatDisplayDate } from '../utils/dateUtils';
import jalaali from 'jalaali-js';
import KanbanBoard from './KanbanBoard';
import { useModals } from '../contexts/ModalContext';
import { useSettings } from '../hooks/useSettings';
// Import the new type for picking
import { PickerItem } from '../hooks/useOrders';
import { db } from '../db';


interface OrdersViewProps {
    // Shared props
    orders: Order[];
    currencyRates: CurrencyRates;
    updateOrder: (orderId: string, updates: Partial<Order>) => Promise<void>;
    onImportPoClick: () => void;
    onDownloadPoTemplate: () => void;
    onImportFromTemplate: () => void;
    
    // List/Kanban Card props
    onOrderClick: (order: Order) => void;
    onCardClick: (order: Order) => void;

    // List View specific
    deleteOrders: (orderIds: string[]) => void;
    
    // Kanban Board specific
    statuses: Status[];
    templates: ChecklistTemplate[];
    onOrderStatusChange: (orderId: string, newStatusName: string) => void;
    onAddStatus: (name: string) => void;
    onUpdateStatusName: (id: string, newName: string) => void;
    onUpdateStatusesOrder: (reorderedStatuses: Status[]) => void;
    onDeleteStatus: (id: string) => void;
    onArchiveOrder: (orderId: string) => void;
    onNewTemplateClick: () => void;
    onNewOrderInStatus: (statusName: string) => void;
    onSetReminder: (item: Order | Task | CalendarTask, type: 'order' | 'task' | 'calendarTask') => void;
    stickyNotes: StickyNote[];
    onAddStickyNote: (statusName: string) => void;
    onUpdateStickyNote: (noteId: string, updates: Partial<StickyNote>) => void;
    onDeleteStickyNote: (noteId: string) => void;
    onMoveStickyNote: (noteId: string, targetStatusName: string, targetIndex: number) => void;
    onOpenNoteDetail: (note: StickyNote) => void;
    // Calendar props left for compatibility if needed but unused in this view now
    calendarTasks: CalendarTask[];
    addCalendarTask: (date: string, title: string, categoryId?: string) => Promise<number>;
    addCalendarTasks: (date: string, titles: string[]) => Promise<number[]>;
    updateCalendarTask: (taskId: number, updates: Partial<CalendarTask>) => Promise<void>;
    deleteCalendarTask: (taskId: number) => Promise<void>;
    calendarStickyNotes: CalendarStickyNote[];
    addCalendarStickyNote: (date: string, content?: string) => Promise<string>;
    updateCalendarStickyNote: (noteId: string, updates: Partial<CalendarStickyNote>) => Promise<void>;
    deleteCalendarStickyNote: (noteId: string) => Promise<void>;
    moveCalendarItem: (itemId: string | number, itemType: 'task' | 'note', newDate: string) => Promise<void>;
    aiSettings?: AISettings;
    onOpenDailyView: (date: string) => void;
    tasks: Task[];
    onProjectTaskClick: (task: Task) => void;
    updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
    duplicateOrder: (orderId: string) => Promise<void>;
    // NEW: reorderOrders function from useOrders hook
    reorderOrders: (reorderedOrders: Order[]) => Promise<void>;
    // NEW: Create order from picker - returns new order ID
    createOrderFromPicker: (pickedItems: PickerItem[]) => Promise<string | undefined>;
}


// +++ NEW COMPONENT +++
interface GlobalSummaryBlockProps {
    orders: Order[];
    currencyRates: CurrencyRates;
    costingSettings: CostingSettings | null;
}

const GlobalSummaryBlock: React.FC<GlobalSummaryBlockProps> = ({ orders, currencyRates, costingSettings }) => {
    const { t, i18n } = useTranslation();
    const [isCollapsed, setIsCollapsed] = useState(false);
    
    const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0, numberingSystem: 'latn' } as any);
    const numberFormatter = new Intl.NumberFormat(i18n.language, { numberingSystem: 'latn', maximumFractionDigits: 2 } as any);
    const tomanUnitLabel = getTomanUnitLabel(costingSettings);

    const summary = useMemo(() => {
        const goodsOrders = orders.filter(o => o.orderType !== 'payment_only');
        const paymentOrders = orders.filter(o => o.orderType === 'payment_only');

        const totalValue = goodsOrders.reduce((sum, order) => sum + getOrderValueInUSD(order, currencyRates), 0);
        
        const totalPaidOnGoodsOrders = goodsOrders.reduce((sum, order) => sum + (order.payments || []).reduce((pSum, p) => pSum + p.amountUSD, 0), 0);
        const totalStandalonePayments = paymentOrders.reduce((sum, order) => sum + getOrderValueInUSD(order, currencyRates), 0);
        const totalBalanceDue = totalValue - totalPaidOnGoodsOrders - totalStandalonePayments;

        const totalVolume = goodsOrders.reduce((acc, order) => acc + order.volumeCBM, 0);
        const totalCartons = goodsOrders.reduce((acc, order) => acc + order.items.reduce((sum, item) => sum + (item.itemsPerCarton > 0 ? Math.ceil(item.quantity / item.itemsPerCarton) : 0), 0), 0);

        return { totalValue, totalVolume, totalBalanceDue, totalCartons, orderCount: goodsOrders.length };
    }, [orders, currencyRates]);
    
    const SummaryItem: React.FC<{label: string, children: React.ReactNode}> = ({label, children}) => (
        <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
            <div className="font-semibold text-white">{children}</div>
        </div>
    );

    if (orders.length === 0) {
        return null; // Don't show the block if there are no active orders
    }

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg mb-4">
            <div 
                className="p-3 flex justify-between items-center cursor-pointer"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex-1 flex items-center gap-x-2">
                    <button 
                        className="p-1 rounded-full text-slate-300 hover:bg-slate-700" 
                        aria-expanded={!isCollapsed}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <h2 className="font-bold text-xl text-white">{t('listView.globalSummaryTitle')}</h2>
                </div>
            </div>
            
            <div className={`transition-[max-height,padding] duration-500 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0' : 'max-h-[9999px]'}`}>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-3 text-sm p-4 border-t border-slate-700">
                    <SummaryItem label={t('listView.totalOrders')}>
                        <p className="font-mono text-lg">{summary.orderCount}</p>
                    </SummaryItem>
                    <SummaryItem label={t('listView.totalValueMonth')}>
                        <p className="font-mono">{usdFormatter.format(summary.totalValue)}</p>
                        <p className="font-mono text-xs text-slate-400">{formatToman(summary.totalValue * currencyRates.toman, costingSettings)} {t('common.toman')}{tomanUnitLabel}</p>
                    </SummaryItem>
                    <SummaryItem label={t('listView.totalBalanceDueMonth')}>
                        <p className="font-mono">{usdFormatter.format(summary.totalBalanceDue)}</p>
                        <p className="font-mono text-xs text-slate-400">{formatToman(summary.totalBalanceDue * currencyRates.toman, costingSettings)} {t('common.toman')}{tomanUnitLabel}</p>
                    </SummaryItem>
                    <SummaryItem label={t('labels.totalCartons')}>
                        <p className="font-mono">{numberFormatter.format(summary.totalCartons)}</p>
                    </SummaryItem>
                    <SummaryItem label={t('labels.volumeCbm')}>
                        <p className="font-mono">{numberFormatter.format(summary.totalVolume)} m³</p>
                    </SummaryItem>
                </div>
            </div>
        </div>
    );
};

// --- Extracted LineItemTable Component ---
// This is moved outside OrderAccordionRow to prevent re-mounting on every render,
// which causes input focus loss in Picking Mode.
interface LineItemTableProps {
    items: OrderItem[];
    currency: string;
    isPickingMode: boolean;
    pickedItems: Map<string, number>;
    onItemPick: (item: OrderItem, quantity: number, isChecked: boolean) => void;
}

const LineItemTable: React.FC<LineItemTableProps> = ({ items, currency, isPickingMode, pickedItems, onItemPick }) => {
    const { t, i18n } = useTranslation();
    const numberFormatter = new Intl.NumberFormat(i18n.language, { numberingSystem: 'latn', maximumFractionDigits: 0 } as any);

    return (
        <div className="px-4 pb-3 pt-2 bg-gray-100 border-t border-slate-200">
             <table className="min-w-full text-sm">
                <thead className="text-xs text-gray-900 font-bold">
                    <tr>
                        <th className="p-2 text-left rtl:text-right">{t('labels.internalCode')}</th>
                        <th className="p-2 text-left rtl:text-right">{t('orderModal.table.productName')}</th>
                        <th className="p-2 text-center">{t('orderModal.table.totalCartons')}</th>
                        <th className="p-2 text-center">{t('orderModal.table.itemsPerCarton')}</th>
                        <th className="p-2 text-center">{t('orderModal.table.quantity')}</th>
                        {isPickingMode && <th className="p-2 text-center w-24">Move Qty</th>}
                        <th className="p-2 text-center">{t('orderModal.table.totalCbm')}</th>
                        <th className="p-2 text-right rtl:text-left">{t('orderModal.table.unitPrice')} ({currency})</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {items.map(item => {
                        const lineTotalCartons = item.itemsPerCarton > 0 ? Math.ceil(item.quantity / item.itemsPerCarton) : 0;
                        const lineTotalCBM = lineTotalCartons * item.cartonCBM;
                        const isPicked = pickedItems.has(item.id);
                        const pickedQty = pickedItems.get(item.id);

                        return (
                             <tr key={item.id} className={isPicked ? "bg-indigo-50" : ""}>
                                <td className="p-2 font-mono text-slate-800">{item.internalCode}</td>
                                <td className="p-2 text-slate-900">{item.productName}</td>
                                <td className="p-2 text-center font-mono text-slate-800">{lineTotalCartons}</td>
                                <td className="p-2 text-center font-mono text-slate-800">{item.itemsPerCarton}</td>
                                <td className="p-2 text-center font-mono font-semibold text-slate-900">{numberFormatter.format(item.quantity)}</td>
                                {isPickingMode && (
                                    <td className="p-2 text-center">
                                        <input 
                                            type="number" 
                                            min="0" 
                                            max={item.quantity} 
                                            value={pickedQty ?? ''} 
                                            placeholder="0"
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                                const valStr = e.target.value;
                                                const val = parseInt(valStr);
                                                if (!isNaN(val) && val > 0) {
                                                     onItemPick(item, val, true);
                                                } else {
                                                     onItemPick(item, 0, false);
                                                }
                                            }}
                                            className={`w-20 p-1 text-center border rounded text-xs font-bold transition-colors ${isPicked ? 'border-indigo-500 text-indigo-700 bg-white ring-1 ring-indigo-500' : 'border-slate-300 text-slate-600 bg-slate-50 focus:border-indigo-500 focus:bg-white'}`}
                                        />
                                    </td>
                                )}
                                <td className="p-2 text-center font-mono text-slate-800">{lineTotalCBM.toFixed(3)}</td>
                                <td className="p-2 text-right rtl:text-left font-mono text-slate-800">{item.price.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            </tr>
                        )
                    })}
                </tbody>
             </table>
        </div>
    );
};


// --- List View Components ---
const OrderAccordionRow: React.FC<{ 
    order: Order; 
    currencyRates: CurrencyRates;
    isExpanded: boolean;
    onToggle: () => void;
    onOrderClick: (order: Order) => void;
    costingSettings: CostingSettings | null;
    onContextMenu: (e: React.MouseEvent, orderId: string) => void;
    onRowDrop: (targetOrderId: string, sourceOrderId: string) => void;
    onDragStartNotification: (id: string) => void;
    onDragEndNotification: () => void;
    isDragging: boolean;
    // Picking Mode Props
    isPickingMode: boolean;
    onItemPick: (item: OrderItem, quantity: number, isChecked: boolean) => void;
    pickedItems: Map<string, number>; // Map<ItemId, Quantity>
}> = ({ order, currencyRates, isExpanded, onToggle, onOrderClick, costingSettings, onContextMenu, onRowDrop, onDragStartNotification, onDragEndNotification, isDragging, isPickingMode, onItemPick, pickedItems }) => {
    const { t, i18n } = useTranslation();
    const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0, numberingSystem: 'latn' } as any);
    const numberFormatter = new Intl.NumberFormat(i18n.language, { numberingSystem: 'latn', maximumFractionDigits: 0 } as any);
    
    const totalValueUSD = getOrderValueInUSD(order, currencyRates);
    const totalValueToman = totalValueUSD * currencyRates.toman;
    const totalCartons = order.items.reduce((sum, item) => sum + (item.itemsPerCarton > 0 ? Math.ceil(item.quantity / item.itemsPerCarton) : 0), 0);
    const tomanUnitLabel = getTomanUnitLabel(costingSettings);
    const [isDragOver, setIsDragOver] = useState(false);
    
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        if (order.isArchived || isPickingMode) return; // Disable drag in picking mode
        e.dataTransfer.setData('orderId', order.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('sourceComponent', 'OrderRow');
        onDragStartNotification(order.id);
    };

    const handleDragEnd = () => {
        onDragEndNotification();
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); 
        if (!isDragging && !isPickingMode) setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        // Allow MonthBlock to handle drops if not in picking mode
        // Only stop propagation if we are handling a row reorder within the same list/context effectively
        // BUT, MonthBlock wraps this row. If we stopProp here, MonthBlock's onDrop won't fire for moving betwen months.
        // We need to decide: does dropping ON a row trigger row-swap, or date-change?
        // If coming from another month -> date change.
        // If coming from same month -> row swap (reorder).
        
        // Let's pass the drop to the handler provided by MonthBlock, which handles this logic.
        setIsDragOver(false);
        if (isPickingMode) {
             e.stopPropagation();
             return;
        }

        const sourceOrderId = e.dataTransfer.getData('orderId');
        if (sourceOrderId && sourceOrderId !== order.id) {
             // We consume the event here to trigger the specific row drop logic
             e.stopPropagation();
             onRowDrop(order.id, sourceOrderId);
        }
    };
    
    // Special rendering for standalone payments
    if (order.orderType === 'payment_only') {
        const paymentAmount = getOrderValueInUSD(order, currencyRates);
        return (
            <div 
                className={`rounded-lg shadow-sm border transition-all duration-200 ${isExpanded ? 'bg-slate-200 border-indigo-300 ring-1 ring-indigo-300' : 'bg-white border-slate-200'} ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'border-t-4 border-t-indigo-500' : ''}`}
                onContextMenu={(e) => onContextMenu(e, order.id)}
                draggable={!order.isArchived && !isPickingMode}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div onClick={onToggle} className={`grid grid-cols-[auto_20%_1fr_20%_auto] items-center p-2 rounded-t-lg bg-green-50 hover:bg-green-100 cursor-pointer`}>
                    <div className="px-2 text-green-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.5 2.5 0 00-1.168-.21 2.5 2.5 0 00-2.5 2.5 2.5 2.5 0 002.5 2.5 2.5 2.5 0 002.5-2.5V9.018a5.975 5.975 0 011.332-1.3A6.002 6.002 0 0110 3a6 6 0 014.5 10.55a.5.5 0 00.5.5H16a.5.5 0 00.5-.5a7 7 0 00-14 0 .5.5 0 00.5.5h1.05a.5.5 0 00.5-.5a6 6 0 014.5-10.5z" />
                        </svg>
                    </div>
                    <div className="px-2 font-semibold text-green-800 text-sm truncate">{order.id}</div>
                    <div className="px-2 text-slate-800 text-sm truncate">
                        <span className="font-bold">{t('paymentFormModal.payee')}:</span> {order.supplier}
                    </div>
                    <div className="px-2 text-right rtl:text-left text-sm">
                        <div className="font-mono text-gray-900 font-semibold">{usdFormatter.format(paymentAmount)}</div>
                    </div>
                    <div className="px-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => onOrderClick(order)} className="p-1.5 rounded-full text-slate-500 hover:bg-slate-200 hover:text-indigo-600">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                </div>
                {isExpanded && (
                    <div className="px-4 pb-3 pt-2 bg-green-50/50 border-t border-green-200 text-sm text-slate-700">
                        <p><strong>{t('labels.date')}:</strong> {formatDisplayDate(order.orderDate, i18n.language)}</p>
                        <p><strong>{t('paymentFormModal.description')}:</strong> {order.internalCode}</p>
                    </div>
                )}
            </div>
        );
    }


    return (
        <div 
            className={`rounded-lg shadow-sm border transition-all duration-200 ${isExpanded ? 'bg-slate-200 border-indigo-300 ring-1 ring-indigo-300' : 'bg-white border-slate-200'} ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'border-t-4 border-t-indigo-500' : ''}`}
            onContextMenu={(e) => onContextMenu(e, order.id)}
            draggable={!order.isArchived && !isPickingMode}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div
                onClick={onToggle}
                className={`grid grid-cols-[auto_20%_25%_15%_10%_10%_1fr_auto] items-center p-2 rounded-t-lg ${order.isArchived ? 'bg-slate-200/50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-grab'}`}
            >
                <div className="px-1 text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                </div>
                <div className="px-2 font-semibold text-indigo-600 text-sm truncate">{order.id}</div>
                <div className="px-2 text-slate-800 text-sm truncate">{order.supplier}</div>
                <div className="px-2 text-slate-800 text-sm">{t(`statuses.${order.status}`, { defaultValue: order.status })}</div>
                <div className="px-2 text-slate-700 text-sm flex items-center gap-x-1.5 font-mono">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    <span>{order.volumeCBM}</span>
                </div>
                 <div className="px-2 text-slate-700 text-sm flex items-center gap-x-1.5 font-mono">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                    <span>{numberFormatter.format(totalCartons)}</span>
                </div>
                <div className="px-2 text-right rtl:text-left text-sm">
                    <div className="font-mono text-gray-900 font-semibold">{usdFormatter.format(totalValueUSD)}</div>
                    <div className="font-mono text-xs text-slate-600">{formatToman(totalValueToman, costingSettings)} {t('common.toman')}{tomanUnitLabel}</div>
                </div>
                <div className="px-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onOrderClick(order)} className="p-1.5 rounded-full text-slate-500 hover:bg-slate-200 hover:text-indigo-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                    </button>
                </div>
            </div>
            {isExpanded && (
                <LineItemTable 
                    items={order.items}
                    currency={order.currency}
                    isPickingMode={isPickingMode}
                    pickedItems={pickedItems}
                    onItemPick={onItemPick}
                />
            )}
        </div>
    );
};

interface MonthBlockProps {
    monthKey: string;
    orders: Order[]; // These are ONLY the orders for this month
    allOrders: Order[]; // NEW: Need access to ALL orders for cross-month lookups
    onOrderClick: (order: Order) => void;
    updateOrder: (orderId: string, updates: Partial<Order>) => Promise<void>;
    onDeleteMonth: (orderIds: string[]) => void;
    currencyRates: CurrencyRates;
    costingSettings: CostingSettings | null;
    displaySettings: ListViewHeaderDisplaySettings;
    onRemoveMonth?: () => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onContextMenu: (e: React.MouseEvent, orderId: string) => void;
    // New props for sorting
    reorderOrders: (reorderedOrders: Order[]) => Promise<void>;
    // Picking Mode
    isPickingMode: boolean;
    onItemPick: (item: OrderItem, quantity: number, isChecked: boolean) => void;
    pickedItems: Map<string, number>;
}

const MonthBlock: React.FC<MonthBlockProps> = ({ monthKey, orders, allOrders, onOrderClick, updateOrder, onDeleteMonth, currencyRates, costingSettings, displaySettings, onRemoveMonth, isCollapsed, onToggleCollapse, onContextMenu, reorderOrders, isPickingMode, onItemPick, pickedItems }) => {
    const { t, i18n } = useTranslation();
    const { showConfirmation, addToast } = useModals();
    const [isOver, setIsOver] = React.useState(false);
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
    const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);

    // Expand all if picking mode is activated
    useEffect(() => {
        if (isPickingMode) {
             const allIds = new Set(orders.map(o => o.id));
             setExpandedOrders(allIds);
        } else {
             // Reset to collapsed when exiting picking mode
             setExpandedOrders(new Set());
        }
    }, [isPickingMode, orders]);

    // Sort orders by manualOrder field for display
    const sortedOrders = useMemo(() => {
        return [...orders].sort((a, b) => (a.manualOrder ?? Number.MAX_SAFE_INTEGER) - (b.manualOrder ?? Number.MAX_SAFE_INTEGER));
    }, [orders]);

    const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0, numberingSystem: 'latn' } as any);
    const numberFormatter = new Intl.NumberFormat(i18n.language, { numberingSystem: 'latn', maximumFractionDigits: 2 } as any);
    const tomanUnitLabel = getTomanUnitLabel(costingSettings);

    const monthDate = dateFromYearMonthKey(monthKey, i18n.language);
    const monthName = getMonthNameAndYear(monthDate, i18n.language);

    const summary = useMemo(() => {
        const goodsOrders = orders.filter(o => o.orderType !== 'payment_only');

        const totalValue = goodsOrders.reduce((sum, order) => sum + getOrderValueInUSD(order, currencyRates), 0);
        
        const totalPaid = orders.reduce((sum, order) => {
            const orderTotalPaymentsUSD = (order.payments || []).reduce((pSum, p) => pSum + p.amountUSD, 0);
            return sum + orderTotalPaymentsUSD;
        }, 0);

        const totalBalanceDue = totalValue - totalPaid;
        
        const totalVolume = goodsOrders.reduce((acc, order) => acc + order.volumeCBM, 0);
        const totalGrossWeight = goodsOrders.reduce((acc, order) => acc + (order.totalGrossWeight || 0), 0);
        const totalCartons = goodsOrders.reduce((acc, order) => acc + order.items.reduce((sum, item) => sum + (item.itemsPerCarton > 0 ? Math.ceil(item.quantity / item.itemsPerCarton) : 0), 0), 0);
        
        return { totalValue, totalVolume, totalGrossWeight, totalPaid, totalBalanceDue, totalCartons };
    }, [orders, currencyRates]);

    const containerInfo = getContainerInfo(summary.totalVolume, t);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (isCollapsed || isPickingMode) return;
        setIsOver(true);
    };

    const handleDragLeave = () => setIsOver(false);

    // This handles dropping a row ONTO the month block container (usually empty space)
    const handleContainerDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (isCollapsed || isPickingMode) return;
        setIsOver(false);
        const orderId = e.dataTransfer.getData('orderId');
        
        // If dropping onto self, do nothing
        if (sortedOrders.some(o => o.id === orderId)) return;

        if (orderId) {
            const [year, month] = monthKey.split('-').map(Number);
            let newDateStr = '';
            const day = 15; 
            if (i18n.language === 'fa') {
                const { gy, gm, gd } = jalaali.toGregorian(year, month + 1, day); 
                newDateStr = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
            } else {
                newDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
            updateOrder(orderId, { approxLoadingDate: newDateStr });
        }
    };
    
    // This handles dropping a row ONTO another row.
    // It handles both reordering (same month) AND moving between months (date update).
    const handleRowDrop = async (targetOrderId: string, sourceOrderId: string) => {
         if (sourceOrderId === targetOrderId) return;
         
         const sourceOrder = allOrders.find(o => o.id === sourceOrderId);
         const targetOrder = allOrders.find(o => o.id === targetOrderId);
         
         if (!sourceOrder || !targetOrder) return;

         const sourceIndex = sortedOrders.findIndex(o => o.id === sourceOrderId);
         const targetIndex = sortedOrders.findIndex(o => o.id === targetOrderId);
         
         // Case 1: Cross-month move (Source is not in this month's list, Target is)
         if (sourceIndex === -1 && targetIndex !== -1) {
             // Update source order's date to match target order's date
             // We use targetOrder.approxLoadingDate to ensure it lands in the correct bucket
             if (sourceOrder.approxLoadingDate !== targetOrder.approxLoadingDate) {
                 await updateOrder(sourceOrderId, { approxLoadingDate: targetOrder.approxLoadingDate });
                 // Visual reorder within the new month will happen after re-render if we really want to enforce position, 
                 // but getting it into the right month is the priority here.
             }
             return;
         }

         // Case 2: Same-month reorder
         if (sourceIndex > -1 && targetIndex > -1) {
             const newOrderList = [...sortedOrders];
             const [movedOrder] = newOrderList.splice(sourceIndex, 1);
             newOrderList.splice(targetIndex, 0, movedOrder);
             await reorderOrders(newOrderList);
         }
    };

    const handleDeleteClick = () => {
        if (orders.length > 0) {
            showConfirmation({
                title: t('confirmationModal.deleteMonthTitle', { monthName }),
                message: t('confirmationModal.deleteMonthBody', { monthName }),
                confirmText: t('buttons.delete'),
                cancelText: t('common.cancel'),
                requireCode: true,
                confirmationCode: '1234',
                onConfirm: () => {
                    try {
                        onDeleteMonth(orders.map(o => o.id));
                        addToast(t('toasts.deleteSuccess'), 'success');
                    } catch (error) {
                        addToast(t('toasts.deleteError'), 'error');
                    }
                },
            });
        } else if (onRemoveMonth) {
            onRemoveMonth();
        }
    };
    
    const toggleOrderExpansion = (orderId: string) => {
        setExpandedOrders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(orderId)) {
                newSet.delete(orderId);
            } else {
                newSet.add(orderId);
            }
            return newSet;
        });
    };
    

    const canDeleteOrders = orders.length > 0;
    const canRemoveBlock = !!onRemoveMonth;
    const isActionable = canDeleteOrders || canRemoveBlock;
    
    const SummaryItem: React.FC<{label: string, children: React.ReactNode}> = ({label, children}) => (
        <div>
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">{label}</p>
            <div className="font-semibold text-gray-900">{children}</div>
        </div>
    );

    return (
        <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleContainerDrop}
            className={`bg-white border border-slate-200 rounded-lg shadow-sm transition-all duration-200 ring-2 ${isOver ? 'ring-indigo-400' : 'ring-transparent'}`}
        >
            <div 
                className={`p-3 flex justify-between items-center cursor-pointer`}
                onClick={onToggleCollapse}
            >
                <div className="flex-1 flex items-center gap-x-2">
                    <button 
                        className="p-1 rounded-full text-slate-600 hover:bg-slate-100" 
                        title={isCollapsed ? t('common.expand') : t('common.collapse')}
                        aria-expanded={!isCollapsed}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <h2 className="font-bold text-xl text-gray-800">{monthName}</h2>
                </div>
                
                {isCollapsed && summary.totalBalanceDue > 0 && (
                    <div className="flex items-center gap-x-3 px-4">
                        <span className="font-mono text-sm font-semibold text-slate-600">{usdFormatter.format(summary.totalBalanceDue)}</span>
                        <span className="font-mono text-xs text-slate-400">{formatToman(summary.totalBalanceDue * currencyRates.toman, costingSettings)} {t('common.toman')}</span>
                    </div>
                )}
                
                <div className="flex items-center gap-x-2">
                     <span className="bg-slate-300 text-slate-700 font-semibold text-sm px-2 py-0.5 rounded-full">{t('listView.orderCountBadge', { count: orders.length })}</span>
                    <div onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={handleDeleteClick}
                            disabled={!isActionable}
                            className="text-slate-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-100 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed" 
                            title={canDeleteOrders ? t('listView.deleteMonthButtonTooltip') : (canRemoveBlock ? t('listView.removeEmptyMonthTooltip') : '')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                               <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            
            <div className={`transition-[max-height,padding] duration-500 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0' : 'max-h-[9999px]'}`}>
                <div className="grid grid-cols-2 md:grid-cols-7 gap-x-6 gap-y-3 text-sm p-3 border-t border-b border-slate-300 bg-slate-100">
                    {displaySettings.showTotalValue && <SummaryItem label={t('listView.totalValueMonth')}>
                        <p className="font-mono">{usdFormatter.format(summary.totalValue)}</p>
                        <p className="font-mono text-xs text-slate-500">{formatToman(summary.totalValue * currencyRates.toman, costingSettings)} {t('common.toman')}{tomanUnitLabel}</p>
                    </SummaryItem>}
                    {displaySettings.showTotalDownPayment && <SummaryItem label={t('listView.totalPaidMonth')}>
                        <p className="font-mono">{usdFormatter.format(summary.totalPaid)}</p>
                        <p className="font-mono text-xs text-slate-500">{formatToman(summary.totalPaid * currencyRates.toman, costingSettings)} {t('common.toman')}{tomanUnitLabel}</p>
                    </SummaryItem>}
                    {displaySettings.showTotalBalanceDue && <SummaryItem label={t('listView.totalBalanceDueMonth')}>
                        <p className="font-mono">{usdFormatter.format(summary.totalBalanceDue)}</p>
                        <p className="font-mono text-xs text-slate-500">{formatToman(summary.totalBalanceDue * currencyRates.toman, costingSettings)} {t('common.toman')}{tomanUnitLabel}</p>
                    </SummaryItem>}
                    {displaySettings.showVolume && <SummaryItem label={t('labels.volumeCbm')}>
                        <p className="font-mono">{numberFormatter.format(summary.totalVolume)} m³</p>
                    </SummaryItem>}
                    {displaySettings.showTotalCartons && <SummaryItem label={t('labels.totalCartons')}>
                        <p className="font-mono">{formatToman(summary.totalCartons, null)}</p>
                    </SummaryItem>}
                    {displaySettings.showTotalGrossWeight && <SummaryItem label={t('labels.totalGrossWeightKg')}>
                         <p className="font-mono">{numberFormatter.format(summary.totalGrossWeight)} kg</p>
                    </SummaryItem>}
                    {displaySettings.showContainerInfo && containerInfo.text && (
                        <div className="col-span-2 md:col-span-1">
                             <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">{t('listView.containerInfo')}</p>
                             <p className={`font-semibold ${containerInfo.className}`}>{containerInfo.text}</p>
                        </div>
                    )}
                </div>
                <div className="px-2 pb-2 pt-2 space-y-2">
                    {sortedOrders.length > 0 ? (
                        sortedOrders.map(order => 
                            <OrderAccordionRow 
                                key={order.id} 
                                order={order} 
                                currencyRates={currencyRates} 
                                isExpanded={expandedOrders.has(order.id)}
                                onToggle={() => toggleOrderExpansion(order.id)}
                                onOrderClick={onOrderClick}
                                costingSettings={costingSettings}
                                onContextMenu={onContextMenu}
                                onRowDrop={handleRowDrop}
                                onDragStartNotification={setDraggedOrderId}
                                onDragEndNotification={() => setDraggedOrderId(null)}
                                isDragging={draggedOrderId === order.id}
                                isPickingMode={isPickingMode}
                                onItemPick={onItemPick}
                                pickedItems={pickedItems}
                            />
                        )
                    ) : (
                        <div className="text-center text-slate-400 p-4">{t('listView.empty')}</div>
                    )}
                </div>
            </div>
        </div>
    );
};
// --- End List View Components ---

// --- Archive View Components ---
const ArchivedOrderRow: React.FC<{ order: Order; onOrderClick: (order: Order) => void; currencyRates: CurrencyRates; onUnarchive: (orderId: string) => void; }> = ({ order, onOrderClick, currencyRates, onUnarchive }) => {
    const { t, i18n } = useTranslation();
    const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0, numberingSystem: 'latn' } as any);
    const numberFormatter = new Intl.NumberFormat(i18n.language, { numberingSystem: 'latn', maximumFractionDigits: 0 } as any);

    const totalValue = getOrderValueInUSD(order, currencyRates);
    const totalCartons = order.items.reduce((sum, item) => sum + (item.itemsPerCarton > 0 ? Math.ceil(item.quantity / item.itemsPerCarton) : 0), 0);

    return (
        <div onClick={() => onOrderClick(order)} className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_2fr_1fr] gap-2 items-center p-2 border-b border-slate-200 last:border-b-0 bg-white hover:bg-slate-50 cursor-pointer">
            <div className="px-2 font-semibold text-indigo-600 text-sm truncate">{order.id}</div>
            <div className="px-2 text-slate-700 text-sm truncate">{order.supplier}</div>
            <div className="px-2 text-slate-600 text-sm font-mono">{formatDisplayDate(order.archivedAt?.split('T')[0] || '', i18n.language)}</div>
            <div className="px-2 text-slate-600 text-sm font-mono text-center">{order.volumeCBM}</div>
            <div className="px-2 text-slate-600 text-sm font-mono text-center">{numberFormatter.format(totalCartons)}</div>
            <div className="px-2 text-right rtl:text-left text-sm font-mono text-gray-800 font-semibold">{usdFormatter.format(totalValue)}</div>
            <div className="px-2 text-center">
                <button
                    onClick={(e) => { e.stopPropagation(); onUnarchive(order.id); }}
                    className="text-xs font-semibold px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700"
                >
                    {t('common.unarchive')}
                </button>
            </div>
        </div>
    );
};

const SortableHeader: React.FC<{
    label: string;
    sortKey: string;
    sortConfig: { key: string; direction: 'asc' | 'desc' };
    onSort: (key: string) => void;
    className?: string;
}> = ({ label, sortKey, sortConfig, onSort, className = '' }) => {
    const { t } = useTranslation();
    const isSorted = sortConfig.key === sortKey;
    const direction = isSorted ? sortConfig.direction : null;
    const tooltip = direction === 'asc' ? t('common.sortBy.sortDesc') : t('common.sortBy.sortAsc');

    return (
        <div onClick={() => onSort(sortKey)} title={tooltip} className={`flex items-center gap-x-1 cursor-pointer select-none ${className}`}>
            <span>{label}</span>
            {isSorted ? (
                direction === 'asc' ? 
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg> : 
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            ) : (
                 <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
            )}
        </div>
    );
};

interface ArchiveBlockProps {
    orders: Order[];
    onOrderClick: (order: Order) => void;
    currencyRates: CurrencyRates;
    onUnarchive: (orderId: string) => void;
}

const ArchiveBlock: React.FC<ArchiveBlockProps> = ({ orders, onOrderClick, currencyRates, onUnarchive }) => {
    const { t } = useTranslation();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'archivedAt', direction: 'desc' });
    const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0, numberingSystem: 'latn' } as any);

    const summary = useMemo(() => {
        return orders.reduce((acc, order) => {
            acc.totalValue += getOrderValueInUSD(order, currencyRates);
            acc.totalVolume += order.volumeCBM;
            acc.totalCartons += order.items.reduce((sum, item) => sum + (item.itemsPerCarton > 0 ? Math.ceil(item.quantity / item.itemsPerCarton) : 0), 0);
            return acc;
        }, { totalValue: 0, totalVolume: 0, totalCartons: 0 });
    }, [orders, currencyRates]);

    const handleSort = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const sortedOrders = useMemo(() => {
        const sortable = [...orders];
        sortable.sort((a, b) => {
            let aValue: any, bValue: any;
            if (sortConfig.key === 'totalValue') {
                aValue = getOrderValueInUSD(a, currencyRates);
                bValue = getOrderValueInUSD(b, currencyRates);
            } else if (sortConfig.key === 'totalCartons') {
                aValue = a.items.reduce((s, i) => s + (i.itemsPerCarton > 0 ? Math.ceil(i.quantity / i.itemsPerCarton) : 0), 0);
                bValue = b.items.reduce((s, i) => s + (i.itemsPerCarton > 0 ? Math.ceil(i.quantity / i.itemsPerCarton) : 0), 0);
            } else {
                aValue = a[sortConfig.key as keyof Order] || '';
                bValue = b[sortConfig.key as keyof Order] || '';
            }
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sortable;
    }, [orders, sortConfig, currencyRates]);

    return (
        <div className="rounded-lg border border-slate-300">
            <div className="p-3 bg-slate-700 text-white flex justify-between items-center cursor-pointer rounded-t-lg" onClick={() => setIsCollapsed(p => !p)}>
                 <div className="flex items-center gap-x-2">
                     <button className="p-1 rounded-full hover:bg-slate-600">
                         <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-300 ${isCollapsed ? 'rtl:-rotate-90 ltr:rotate-90' : 'rotate-180'}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                    <h2 className="font-bold text-xl">{t('common.archiveList')}</h2>
                 </div>
                 <div className="text-sm font-mono">{orders.length} Orders</div>
            </div>
            <div className={`grid grid-cols-3 text-sm p-3 bg-slate-100`}>
                 <div>{t('labels.totalOrderValue')}: <span className="font-semibold font-mono">{usdFormatter.format(summary.totalValue)}</span></div>
                 <div>{t('labels.volumeCbm')}: <span className="font-semibold font-mono">{summary.totalVolume.toFixed(2)} m³</span></div>
                 <div>{t('labels.totalCartons')}: <span className="font-semibold font-mono">{summary.totalCartons.toLocaleString()}</span></div>
            </div>
             <div className={`transition-[max-height] duration-500 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0' : 'max-h-[9999px]'}`}>
                <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_2fr_1fr] gap-2 p-2 bg-slate-50 border-y border-slate-200 text-xs font-bold text-slate-700">
                    <SortableHeader label={t('labels.orderId')} sortKey="id" sortConfig={sortConfig} onSort={handleSort} className="px-2" />
                    <SortableHeader label={t('labels.supplier')} sortKey="supplier" sortConfig={sortConfig} onSort={handleSort} className="px-2" />
                    <SortableHeader label={t('labels.archivedDate')} sortKey="archivedAt" sortConfig={sortConfig} onSort={handleSort} className="px-2" />
                    <SortableHeader label="CBM" sortKey="volumeCBM" sortConfig={sortConfig} onSort={handleSort} className="px-2 justify-center" />
                    <SortableHeader label={t('labels.totalCartons')} sortKey="totalCartons" sortConfig={sortConfig} onSort={handleSort} className="px-2 justify-center" />
                    <SortableHeader label={t('labels.totalValue')} sortKey="totalValue" sortConfig={sortConfig} onSort={handleSort} className="px-2 justify-end" />
                    <div className="px-2 text-center">{t('common.actions')}</div>
                </div>
                <div className="p-2 space-y-1 bg-white rounded-b-lg">
                    {sortedOrders.map(order => <ArchivedOrderRow key={order.id} order={order} onOrderClick={onOrderClick} currencyRates={currencyRates} onUnarchive={onUnarchive} />)}
                </div>
            </div>
        </div>
    );
};
// --- End Archive View Components ---

const OrdersView: React.FC<OrdersViewProps> = (props) => {
    // FIX: Destructure onNewPaymentClick from props. This makes the prop available in the component's scope.
    const { orders, onOrderClick, updateOrder, deleteOrders, currencyRates, onImportPoClick, onArchiveOrder, onDownloadPoTemplate, onImportFromTemplate, duplicateOrder, onCardClick, reorderOrders, createOrderFromPicker } = props;
    const { t, i18n } = useTranslation();
    const { addToast } = useModals();
    const [subView, setSubView] = useState<'list' | 'kanban'>(
        () => {
            const saved = localStorage.getItem('ordersLastSubView');
            // Default to 'list' if saved value is invalid or 'calendar' (which is removed)
            return (saved === 'list' || saved === 'kanban') ? saved : 'list';
        }
    );
    const [visibleMonthKeys, setVisibleMonthKeys] = useState<string[]>([]);
    const [collapsedMonths, setCollapsedMonths] = useState(new Set<string>());
    const { settings } = useSettings();

    const [isSearchVisible, setIsSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);
    
    const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; orderId: string | null }>({ visible: false, x: 0, y: 0, orderId: null });
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // --- PICKING MODE STATE ---
    const [isPickingMode, setIsPickingMode] = useState(false);
    // Key is ItemID, Value is Picked Quantity
    const [pickerBasket, setPickerBasket] = useState<Map<string, number>>(new Map());
    const [pickerItemsDetail, setPickerItemsDetail] = useState<PickerItem[]>([]);

    const pickerStats = useMemo(() => {
        return pickerItemsDetail.reduce((acc, p) => {
            const item = p.originalItem;
            // Calculate cartons based on quantity to move. 
            // Using precise division to support "2.5 cartons" if user picks partial quantities.
            const cartons = item.itemsPerCarton > 0 
                ? p.quantityToMove / item.itemsPerCarton 
                : 0;
            const cbm = cartons * item.cartonCBM;
            
            acc.totalCartons += cartons;
            acc.totalCBM += cbm;
            return acc;
        }, { totalCartons: 0, totalCBM: 0 });
    }, [pickerItemsDetail]);

    useEffect(() => {
        localStorage.setItem('ordersLastSubView', subView);
    }, [subView]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F3') {
                e.preventDefault();
                setIsSearchVisible(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (contextMenu.visible && contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
                setContextMenu({ visible: false, x: 0, y: 0, orderId: null });
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [contextMenu.visible]);

    useEffect(() => {
        if (isSearchVisible) {
            searchInputRef.current?.focus();
        } else {
            setSearchQuery('');
        }
    }, [isSearchVisible]);
    
    const filteredOrders = useMemo(() => {
        if (!searchQuery.trim()) {
            return orders;
        }
        const lowerQuery = searchQuery.toLowerCase().trim();
        return orders.filter(order => {
            return (
                order.id.toLowerCase().includes(lowerQuery) ||
                order.supplier.toLowerCase().includes(lowerQuery) ||
                (order.internalCode && order.internalCode.toLowerCase().includes(lowerQuery)) ||
                order.items.some(item => 
                    item.productName.toLowerCase().includes(lowerQuery) ||
                    (item.productNameFa && item.productNameFa.includes(lowerQuery)) ||
                    (item.internalCode && item.internalCode.toLowerCase().includes(lowerQuery)) ||
                    (item.supplierCode && item.supplierCode.toLowerCase().includes(lowerQuery))
                )
            );
        });
    }, [orders, searchQuery]);

    const costingSettings = useMemo(() => {
        return settings.find(s => s.key === 'perShipmentCostingSettings')?.value as CostingSettings | null;
    }, [settings]);

    const listViewDisplaySettings = useMemo(() => {
        const defaultSettings: ListViewHeaderDisplaySettings = {
            showTotalValue: true,
            showTotalDownPayment: false, // Turned off by default for clarity
            showTotalBalanceDue: true,
            showVolume: true,
            showTotalCartons: true,
            showTotalGrossWeight: true,
            showContainerInfo: true,
        };
        const fromDb = settings.find(s => s.key === 'displaySettings')?.value?.listViewHeader;
        return { ...defaultSettings, ...fromDb };
    }, [settings]);
    
    const archivedOrders = useMemo(() => filteredOrders.filter(o => o.isArchived), [filteredOrders]);
    const activeOrders = useMemo(() => filteredOrders.filter(o => !o.isArchived), [filteredOrders]);

    const toggleMonthCollapse = (monthKey: string) => {
        setCollapsedMonths(prev => {
            const newSet = new Set(prev);
            if (newSet.has(monthKey)) {
                newSet.delete(monthKey);
            } else {
                newSet.add(monthKey);
            }
            return newSet;
        });
    };
    
    const ordersByMonth = useMemo(() => {
        return (activeOrders || []).reduce((acc, order) => {
            const orderDate = stringToDate(order.approxLoadingDate);
            const key = getYearMonthKey(orderDate, i18n.language);
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(order);
            return acc;
        }, {} as Record<string, Order[]>);
    }, [activeOrders, i18n.language]);

    useEffect(() => {
        const monthKeysWithOrders = Object.keys(ordersByMonth);
        const currentMonthKey = getCurrentYearMonthKey(i18n.language);

        const allKeys = new Set(monthKeysWithOrders);
        if (!allKeys.has(currentMonthKey)) {
             allKeys.add(currentMonthKey);
        }
        
        const sortedKeys = Array.from(allKeys).sort((a, b) => {
            const dateA = dateFromYearMonthKey(a, i18n.language);
            const dateB = dateFromYearMonthKey(b, i18n.language);
            return dateB.getTime() - dateA.getTime(); // Newest first
        });

        if (sortedKeys.length === 0) {
            sortedKeys.push(currentMonthKey);
        }

        setVisibleMonthKeys(sortedKeys);
    }, [ordersByMonth, i18n.language]);


    const addPreviousMonth = () => { // Adds an older month to the end of the list
        const lastMonthKey = visibleMonthKeys[visibleMonthKeys.length - 1];
        if (!lastMonthKey) return;
        const [year, month] = lastMonthKey.split('-').map(Number); // month is 0-indexed
        let newKey: string;

        if (i18n.language === 'fa') {
            const prevJMonth = month === 0 ? 11 : month - 1;
            const prevJYear = month === 0 ? year - 1 : year;
            newKey = `${prevJYear}-${prevJMonth}`;
        } else {
            const lastDate = dateFromYearMonthKey(lastMonthKey, 'en');
            lastDate.setUTCMonth(lastDate.getUTCMonth() - 1);
            newKey = getYearMonthKey(lastDate, 'en');
        }
        setVisibleMonthKeys(keys => [...keys, newKey]);
    };

    const addNextMonth = () => { // Adds a newer month to the start of the list
        const firstMonthKey = visibleMonthKeys[0];
        if (!firstMonthKey) return;
        const [year, month] = firstMonthKey.split('-').map(Number); // month is 0-indexed
        let newKey: string;

        if (i18n.language === 'fa') {
            const nextJMonth = month === 11 ? 0 : month + 1;
            const nextJYear = month === 11 ? year + 1 : year;
            newKey = `${nextJYear}-${nextJMonth}`;
        } else {
            const firstDate = dateFromYearMonthKey(firstMonthKey, 'en');
            firstDate.setUTCMonth(firstDate.getUTCMonth() + 1);
            newKey = getYearMonthKey(firstDate, 'en');
        }
        setVisibleMonthKeys(keys => [newKey, ...keys]);
    };

    const removeEmptyMonth = (keyToRemove: string) => {
        setVisibleMonthKeys(keys => keys.filter(k => k !== keyToRemove));
    };

    const handleContextMenu = (e: React.MouseEvent, orderId: string) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            orderId: orderId
        });
    };

    const handleDuplicateOrder = async () => {
        if (contextMenu.orderId) {
            try {
                await duplicateOrder(contextMenu.orderId);
                addToast(t('toasts.newOrderCreated'), 'success');
            } catch (error) {
                console.error("Failed to duplicate order:", error);
                addToast("Failed to duplicate order.", 'error');
            }
            setContextMenu({ visible: false, x: 0, y: 0, orderId: null });
        }
    };
    
    // --- Picker Functions ---
    const handleTogglePicker = () => {
        if (isPickingMode) {
            // Cancel Picking
            setPickerBasket(new Map());
            setPickerItemsDetail([]);
        }
        setIsPickingMode(!isPickingMode);
    };

    const handleItemPick = useCallback((item: OrderItem, quantity: number, isChecked: boolean) => {
        // Find source order ID from orders list by finding the order containing this item
        // This is a bit inefficient but safe. Optimized by checking active orders only.
        const sourceOrder = activeOrders.find(o => o.items.some(i => i.id === item.id));
        if (!sourceOrder) return;

        setPickerBasket(prev => {
            const next = new Map(prev);
            if (isChecked) {
                // Ensure quantity is valid (1 to max available)
                const safeQty = Math.max(1, Math.min(quantity, item.quantity));
                next.set(item.id, safeQty);
            } else {
                next.delete(item.id);
            }
            return next;
        });
        
        setPickerItemsDetail(prev => {
            let next = [...prev];
            if (isChecked) {
                const existingIndex = next.findIndex(p => p.originalItem.id === item.id);
                const safeQty = Math.max(1, Math.min(quantity, item.quantity));
                
                if (existingIndex > -1) {
                    next[existingIndex].quantityToMove = safeQty;
                } else {
                    next.push({
                        sourceOrderId: sourceOrder.id,
                        originalItem: item,
                        quantityToMove: safeQty
                    });
                }
            } else {
                next = next.filter(p => p.originalItem.id !== item.id);
            }
            return next;
        });
    }, [activeOrders]);

    const handleCreateSplitOrder = async () => {
        try {
            const newOrderId = await createOrderFromPicker(pickerItemsDetail);
            addToast("New split order created successfully.", 'success');
            handleTogglePicker(); // Reset mode
            
            // Open the new order immediately for review
            if (newOrderId) {
                const newOrder = await db.orders.get(newOrderId);
                if (newOrder) {
                    onOrderClick(newOrder);
                }
            }
        } catch (error) {
            addToast(error instanceof Error ? error.message : "Failed to create split order", 'error');
        }
    };

    const renderListView = () => (
        <>
            <GlobalSummaryBlock orders={activeOrders} currencyRates={currencyRates} costingSettings={costingSettings} />
            <div className="flex justify-center mb-4">
                <button 
                    onClick={addNextMonth}
                    className="bg-white text-indigo-600 px-4 py-2 rounded-md hover:bg-indigo-50 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex items-center font-semibold text-sm"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 me-2" viewBox="0 0 20 20" fill="currentColor">
                       <path fillRule="evenodd" d="M14.707 12.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L9 14.586V3a1 1 0 012 0v11.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {t('timeline.addNextMonth')}
                </button>
            </div>
            <div className="space-y-4">
                {visibleMonthKeys.map(key => (
                    <MonthBlock
                        key={key}
                        monthKey={key}
                        orders={ordersByMonth[key] || []}
                        allOrders={orders}
                        onOrderClick={onOrderClick}
                        updateOrder={updateOrder}
                        onDeleteMonth={deleteOrders}
                        currencyRates={currencyRates}
                        costingSettings={costingSettings}
                        displaySettings={listViewDisplaySettings}
                        onRemoveMonth={!ordersByMonth[key] ? () => removeEmptyMonth(key) : undefined}
                        isCollapsed={collapsedMonths.has(key)}
                        onToggleCollapse={() => toggleMonthCollapse(key)}
                        onContextMenu={handleContextMenu}
                        reorderOrders={reorderOrders}
                        isPickingMode={isPickingMode}
                        onItemPick={handleItemPick}
                        pickedItems={pickerBasket}
                    />)
                )}
            </div>
            {/* Floating Picker Actions */}
            {isPickingMode && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white p-4 rounded-xl shadow-2xl border-2 border-indigo-600 z-[60] flex items-center gap-6 animate-in slide-in-from-bottom-4">
                    <div className="flex flex-col">
                        <span className="font-bold text-lg text-indigo-900">{pickerBasket.size} Items Selected</span>
                        <span className="text-xs text-indigo-600">from {new Set(pickerItemsDetail.map(i => i.sourceOrderId)).size} orders</span>
                    </div>
                    
                    <div className="h-10 w-px bg-slate-200"></div>

                    <div className="flex flex-col">
                         <span className="font-bold text-lg text-slate-800">{pickerStats.totalCartons.toFixed(2)} CTNS</span>
                         <span className="text-xs text-slate-500 font-mono">{pickerStats.totalCBM.toFixed(2)} m³</span>
                    </div>

                    <div className="h-10 w-px bg-slate-200"></div>
                    
                    <button 
                        onClick={handleCreateSplitOrder}
                        disabled={pickerBasket.size === 0}
                        className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-transform active:scale-95"
                    >
                        Create Order
                    </button>
                    <button 
                        onClick={handleTogglePicker}
                        className="text-slate-500 hover:text-red-600 font-semibold px-2"
                    >
                        Cancel
                    </button>
                </div>
            )}
        </>
    );

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header with view switcher and action buttons */}
            <div className="p-4 lg:p-6 pb-0 flex justify-between items-center flex-shrink-0">
                 <h1 className="text-3xl font-bold text-gray-800">{t('views.orders.title')}</h1>
                 <div className="flex items-center gap-x-2">
                    <div className="flex bg-gray-200 rounded-lg p-1">
                        <button onClick={() => setSubView('list')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${subView === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>{t('views.orders.listView')}</button>
                        <button onClick={() => setSubView('kanban')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${subView === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>{t('views.orders.kanbanView')}</button>
                    </div>
                    <div className="h-6 w-px bg-gray-300 mx-1" />
                    {subView === 'list' && (
                        <button 
                            onClick={handleTogglePicker}
                            className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-colors ${isPickingMode ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
                            title="Split items from existing orders into a new order"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                            {isPickingMode ? 'Exit Picker' : 'Pick / Split'}
                        </button>
                    )}
                     <button onClick={onDownloadPoTemplate} className="p-2 text-slate-500 hover:bg-slate-200 rounded-full" title={t('buttons.downloadTemplate')}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                     <button onClick={onImportFromTemplate} className="p-2 text-slate-500 hover:bg-slate-200 rounded-full" title={t('buttons.importFromTemplate')}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></button>
                    <button onClick={onImportPoClick} className="p-2 text-slate-500 hover:bg-slate-200 rounded-full" title={t('buttons.importPO')}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg></button>
                    <button onClick={() => props.onNewOrderInStatus('Draft')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-x-2 font-medium text-sm transition-colors shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>{t('buttons.newOrder')}</button>
                 </div>
            </div>

             {/* Search Bar */}
            <div className={`px-4 lg:px-6 py-2 transition-all duration-300 overflow-hidden ${isSearchVisible ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="relative">
                     <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                    </div>
                    <input ref={searchInputRef} type="text" className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder={t('common.search')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
            </div>

            <div className="flex-1 overflow-hidden p-4 lg:p-6 pt-2">
                {subView === 'list' ? (
                     <div className="h-full flex flex-col overflow-y-auto pr-1">
                        {renderListView()}
                        <div className="mt-8 mb-4">
                            <ArchiveBlock orders={archivedOrders} onOrderClick={onOrderClick} currencyRates={currencyRates} onUnarchive={onArchiveOrder} />
                        </div>
                    </div>
                ) : (
                    <KanbanBoard orders={filteredOrders} statuses={props.statuses} templates={props.templates} onOrderStatusChange={props.onOrderStatusChange} onCardClick={onCardClick} onAddStatus={props.onAddStatus} onUpdateStatusName={props.onUpdateStatusName} onUpdateStatusesOrder={props.onUpdateStatusesOrder} onDeleteStatus={props.onDeleteStatus} onArchiveOrder={props.onArchiveOrder} updateOrder={props.updateOrder} onNewTemplateClick={props.onNewTemplateClick} onNewOrderInStatus={props.onNewOrderInStatus} onSetReminder={props.onSetReminder} stickyNotes={props.stickyNotes} onAddStickyNote={props.onAddStickyNote} onUpdateStickyNote={props.onUpdateStickyNote} onDeleteStickyNote={props.onDeleteStickyNote} onMoveStickyNote={props.onMoveStickyNote} onOpenNoteDetail={props.onOpenNoteDetail} />
                )}
            </div>
             {contextMenu.visible && (
                <div ref={contextMenuRef} style={{ top: contextMenu.y, left: contextMenu.x }} className="absolute z-50 bg-white shadow-xl rounded-md border border-slate-200 py-1 min-w-[160px]">
                     <button onClick={handleDuplicateOrder} className="w-full text-left rtl:text-right px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" /><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" /></svg>
                        {t('common.duplicate')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default OrdersView;
