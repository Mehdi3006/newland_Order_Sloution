import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
// FIX: Import Cost type and change NewOrderData import path from App to types.
import { Order, OrderItem, Product, Cost, NewOrderData, Attachment, PriceHistory, Currency, Payment } from '../types';
import { useCallback } from 'react';
import { calculateFinalProducts } from '../utils/costCalculator';
import i18n from 'i18next';
import { Toast } from '../components/Toast';
import { sanitizeForIDB } from '../utils/sanitize';

// FIX: Define CostKey to be used by cost management functions, resolving errors in App.tsx.
type CostKey = 'shipCosts' | 'dubaiCosts' | 'iranCosts';

// Type for items being picked/moved
export interface PickerItem {
    sourceOrderId: string;
    originalItem: OrderItem;
    quantityToMove: number;
}

export const useOrders = () => {
    const orders = useLiveQuery(() => 
        db.orders.orderBy('orderDate').reverse().filter(o => !o.deletedAt).toArray(), 
    []);

    const updateOrderStatus = useCallback(async (orderId: string, newStatus: string) => {
        const update = { status: newStatus };
        await db.orders.update(orderId, sanitizeForIDB(update));
    }, []);

    const updateOrder = useCallback(async (orderId: string, updates: Partial<Order>) => {
        await db.orders.update(orderId, sanitizeForIDB(updates));
    }, []);
    
    const archiveOrder = useCallback(async (orderId: string) => {
        const order = await db.orders.get(orderId);
        if (order) {
            const now = new Date().toISOString();
            const update = {
                isArchived: !order.isArchived,
                // Set archivedAt when archiving, clear it when un-archiving
                archivedAt: !order.isArchived ? now : undefined,
            };
            await db.orders.update(orderId, sanitizeForIDB(update));
        }
    }, []);

    const calculateOrderMetrics = (items: (Omit<OrderItem, 'id'> | OrderItem)[]) => {
        let totalVolumeCBM = 0;
        let totalGrossWeight = 0;
        let totalNetWeight = 0;

        items.forEach(item => {
            if (item.quantity > 0 && item.itemsPerCarton > 0) {
                const totalCartons = Math.ceil(item.quantity / item.itemsPerCarton);
                totalVolumeCBM += totalCartons * item.cartonCBM;
                // FIX: Corrected weight calculation. The type definition specifies that grossWeight and netWeight are per carton, not per item.
                totalGrossWeight += (item.grossWeight || 0) * totalCartons;
                totalNetWeight += (item.netWeight || 0) * totalCartons;
            }
        });

        return {
            volumeCBM: parseFloat(totalVolumeCBM.toFixed(2)),
            totalGrossWeight: parseFloat(totalGrossWeight.toFixed(2)),
            totalNetWeight: parseFloat(totalNetWeight.toFixed(2)),
        };
    };

    const addOrder = useCallback(async (orderData: NewOrderData, statusName?: string) => {
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2);
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const prefix = `PO-${year}${month}-`;
        
        const allOrders = await db.orders.toArray();
        const currentMonthOrders = allOrders.filter(o => o.id.startsWith(prefix));
        
        const maxId = currentMonthOrders.reduce((max, o) => {
            const num = parseInt(o.id.replace(prefix, ''), 10);
            return num > max ? num : max;
        }, 0);
        
        const newIdNumber = (maxId + 1).toString().padStart(3, '0');
        const newOrderId = `${prefix}${newIdNumber}`;

        const { volumeCBM, totalGrossWeight, totalNetWeight } = calculateOrderMetrics(orderData.items);

        let targetStatusName = statusName;
        if (!targetStatusName) {
            const firstStatus = await db.statuses.orderBy('order').first();
            if (!firstStatus) {
                console.error("No statuses found in the database. Cannot add order.");
                return;
            }
            targetStatusName = firstStatus.name;
        }


        const newOrder: Order = {
            ...orderData,
            id: newOrderId,
            items: orderData.items.map((item, index) => ({
                ...item,
                id: `${newOrderId}-I${index + 1}`,
                attributes: item.attributes?.map(attr => ({
                    ...attr,
                    id: crypto.randomUUID(),
                })),
            })),
            status: targetStatusName,
            volumeCBM,
            totalGrossWeight,
            totalNetWeight,
            isArchived: false,
            // FIX: Added missing `isFinalized` and `finalizedAt` properties to satisfy the Order type.
            isFinalized: false,
            finalizedAt: undefined,
            deletedAt: null,
            manualOrder: 0, // Default to top or 0
        };
        
        await db.orders.add(sanitizeForIDB(newOrder));
        return newOrderId; // Return ID for subsequent actions
    }, []);

    const updateOrderDetails = useCallback(async (orderId: string, orderData: NewOrderData) => {
        const { volumeCBM, totalGrossWeight, totalNetWeight } = calculateOrderMetrics(orderData.items);
        
        const updatedOrderData = {
            ...orderData,
            items: orderData.items.map((item) => ({
                ...item,
                id: item.id || `${orderId}-I${crypto.randomUUID().slice(0, 4)}`,
                attributes: item.attributes?.map(attr => ({
                    ...attr,
                    id: attr.id || crypto.randomUUID(),
                })),
            })),
            volumeCBM,
            totalGrossWeight,
            totalNetWeight,
        };

        await db.orders.update(orderId, sanitizeForIDB(updatedOrderData));
    }, []);
    
    const deleteOrder = useCallback(async (orderId: string) => {
        const update = { deletedAt: new Date().toISOString() };
        await db.orders.update(orderId, sanitizeForIDB(update));
    }, []);

    const deleteOrders = useCallback(async (orderIds: string[]) => {
        const now = new Date().toISOString();
        const modification = { deletedAt: now };
        await db.orders.where('id').anyOf(orderIds).modify(sanitizeForIDB(modification));
    }, []);

    const restoreOrder = useCallback(async (orderId: string) => {
        const update = { deletedAt: null };
        await db.orders.update(orderId, sanitizeForIDB(update));
    }, []);

    const restoreOrders = useCallback(async (orderIds: string[]) => {
        const modification = { deletedAt: null };
        await db.orders.where('id').anyOf(orderIds).modify(sanitizeForIDB(modification));
    }, []);
    
    const permanentlyDeleteOrder = useCallback(async (orderId: string) => {
        await db.orders.delete(orderId);
    }, []);

    const permanentlyDeleteOrders = useCallback(async (orderIds: string[]) => {
        await db.orders.bulkDelete(orderIds);
    }, []);

    // FIX: Implement cost management functions required by OrderModal.
    const addCost = useCallback(async (orderId: string, costKey: CostKey, newCost: Omit<Cost, 'id'>) => {
        const order = await db.orders.get(orderId);
        if (!order) return;

        const updatedCost: Cost = {
            ...newCost,
            id: crypto.randomUUID(),
        };

        const existingCosts = order[costKey] || [];
        const newCosts = [...existingCosts, updatedCost];

        // FIX: When using a computed property for a key, TypeScript infers a generic string index signature
        // which is incompatible with Dexie's strict typing. Explicitly creating a Partial<Order> object
        // assures TypeScript that the key is valid for the Order type, resolving the error.
        const updateData: Partial<Order> = { [costKey]: newCosts };
        await db.orders.update(orderId, sanitizeForIDB(updateData));
    }, []);

    const updateCost = useCallback(async (orderId: string, costKey: CostKey, updatedCost: Cost) => {
        const order = await db.orders.get(orderId);
        if (!order) return;

        const existingCosts = order[costKey] || [];
        const newCosts = existingCosts.map(c => c.id === updatedCost.id ? updatedCost : c);

        // FIX: When using a computed property for a key, TypeScript infers a generic string index signature
        // which is incompatible with Dexie's strict typing. Explicitly creating a Partial<Order> object
        // assures TypeScript that the key is valid for the Order type, resolving the error.
        const updateData: Partial<Order> = { [costKey]: newCosts };
        await db.orders.update(orderId, sanitizeForIDB(updateData));
    }, []);

    const removeCost = useCallback(async (orderId: string, costKey: CostKey, costId: string) => {
        const order = await db.orders.get(orderId);
        if (!order) return;
        
        const existingCosts = order[costKey] || [];
        const newCosts = existingCosts.filter(c => c.id !== costId);

        // FIX: When using a computed property for a key, TypeScript infers a generic string index signature
        // which is incompatible with Dexie's strict typing. Explicitly creating a Partial<Order> object
        // assures TypeScript that the key is valid for the Order type, resolving the error.
        const updateData: Partial<Order> = { [costKey]: newCosts };
        await db.orders.update(orderId, sanitizeForIDB(updateData));
    }, []);

    const finalizeOrder = useCallback(async (orderId: string, addToast: (message: string, type: Toast['type']) => void, skipProductUpdate: boolean = false) => {
        await (db as any).transaction('rw', db.orders, db.settings, db.products, db.priceHistory, async () => {
            const order = await db.orders.get(orderId);
            
            if (!order) throw new Error("Order not found");

            if (!skipProductUpdate) {
                const settings = await db.settings.get('perShipmentCostingSettings');
                if (!settings?.value) throw new Error("Costing settings not found");
        
                const calculatedProductsData = calculateFinalProducts(order, settings.value);
        
                const productsToUpsert: Product[] = [];
                const historyToAdd: Omit<PriceHistory, 'id'>[] = [];
        
                // De-dupe pData based on internalCode, keeping the last occurrence to avoid race conditions.
                const uniquePDataMap = new Map<string, typeof calculatedProductsData[0]>();
                const pDataWithoutCode: (typeof calculatedProductsData[0])[] = [];

                for (const pData of calculatedProductsData) {
                    if (pData.internalCode && pData.internalCode.trim() !== '') {
                        uniquePDataMap.set(pData.internalCode.trim().toLowerCase(), pData);
                    } else {
                        pDataWithoutCode.push(pData);
                    }
                }
                const finalPDataToProcess = [...pDataWithoutCode, ...Array.from(uniquePDataMap.values())];

                for (const pData of finalPDataToProcess) {
                    // Products without an internal code cannot be reliably matched/updated, so they are always new.
                    if (!pData.internalCode || pData.internalCode.trim() === '') {
                        const newProduct: Product = {
                            ...pData,
                            id: `prod-${crypto.randomUUID()}`,
                            finalizedAt: new Date().toISOString(),
                            settingsSnapshot: settings.value,
                            deletedAt: null,
                            order: 0, // Placeholder, will be recalculated
                            createdAt: new Date().toISOString(),
                        };
                        productsToUpsert.push(newProduct);
                        continue;
                    }
        
                    const existingProduct = await db.products.where('internalCode').equalsIgnoreCase(pData.internalCode.trim()).first();
        
                    if (existingProduct) {
                        // UPDATE existing product
                        const hasPriceChanged = JSON.stringify(existingProduct.sellingPrices) !== JSON.stringify(pData.sellingPrices);
                        const hasCostChanged = Math.abs(existingProduct.landedCostTOMAN - pData.landedCostTOMAN) > 0.01;
        
                        if (hasPriceChanged || hasCostChanged) {
                            historyToAdd.push({
                                productId: existingProduct.id,
                                timestamp: new Date().toISOString(),
                                oldPrices: existingProduct.sellingPrices,
                                oldLandedCostAED: existingProduct.landedCostAED,
                                oldLandedCostTOMAN: existingProduct.landedCostTOMAN,
                            });
                        }
                        
                        const updatedProduct: Product = {
                            ...existingProduct, // Preserve original id, createdAt etc.
                            ...pData, // Apply new calculated data
                            settingsSnapshot: settings.value, // Update settings snapshot
                            finalizedAt: new Date().toISOString(), // Update finalized date
                            sourceOrderId: order.id, // Update to the latest source order
                            order: 0, // Placeholder, will be recalculated
                        };
                        productsToUpsert.push(updatedProduct);
                    } else {
                        // ADD new product
                        const newProduct: Product = {
                            ...pData,
                            id: `prod-${pData.internalCode.trim().replace(/\s/g, '-')}-${crypto.randomUUID().slice(0, 4)}`,
                            finalizedAt: new Date().toISOString(),
                            settingsSnapshot: settings.value,
                            deletedAt: null,
                            order: 0, // Placeholder, will be recalculated
                            createdAt: new Date().toISOString(),
                        };
                        productsToUpsert.push(newProduct);
                    }
                }
                
                if (historyToAdd.length > 0) {
                    await db.priceHistory.bulkAdd(historyToAdd as PriceHistory[]);
                }
                
                if (productsToUpsert.length > 0) {
                    // Get IDs of products we just processed
                    const upsertedProductIds = new Set(productsToUpsert.map(p => p.id));
        
                    // Get all other existing products, sorted by their current order
                    const otherExistingProducts = await db.products
                        .filter(p => !upsertedProductIds.has(p.id) && !p.deletedAt)
                        .sortBy('order');
        
                    // Combine the lists: new/updated products first, then the rest.
                    const allProductsReordered = [...productsToUpsert, ...otherExistingProducts];
        
                    // Re-assign the 'order' property based on the new sequence.
                    const finalProductsWithNewOrder = allProductsReordered.map((p, index) => ({
                        ...p,
                        order: index + 1
                    }));
                    
                    // Save everything back to the database. bulkPut will handle create/update.
                    await db.products.bulkPut(finalProductsWithNewOrder);
                }
            }
    
            // Mark order as finalized
            const update = { isFinalized: true, finalizedAt: new Date().toISOString() };
            await db.orders.update(orderId, sanitizeForIDB(update));
        });
        
        if (skipProductUpdate) {
            addToast(i18n.t('toasts.orderFinalizedNoUpdate'), 'success');
        } else {
            addToast(i18n.t('toasts.orderFinalized'), 'success');
        }
    }, []);

    const addAttachment = useCallback(async (orderId: string, attachment: Attachment, itemId?: string) => {
        const order = await db.orders.get(orderId);
        if (!order) return;

        if (itemId) {
            const updatedItems = order.items.map(item => {
                if (item.id === itemId) {
                    const newAttachments = [...(item.attachments || []), attachment];
                    return { ...item, attachments: newAttachments };
                }
                return item;
            });
            const update = { items: updatedItems };
            await db.orders.update(orderId, sanitizeForIDB(update));
        } else {
            const newAttachments = [...(order.attachments || []), attachment];
            const update = { attachments: newAttachments };
            await db.orders.update(orderId, sanitizeForIDB(update));
        }
    }, []);

    const deleteAttachment = useCallback(async (orderId: string, attachmentId: string, itemId?: string) => {
        const order = await db.orders.get(orderId);
        if (!order) return;

        if (itemId) {
            const updatedItems = order.items.map(item => {
                if (item.id === itemId) {
                    const newAttachments = (item.attachments || []).filter(a => a.id !== attachmentId);
                    return { ...item, attachments: newAttachments };
                }
                return item;
            });
            const update = { items: updatedItems };
            await db.orders.update(orderId, sanitizeForIDB(update));
        } else {
            const newAttachments = (order.attachments || []).filter(a => a.id !== attachmentId);
            const update = { attachments: newAttachments };
            await db.orders.update(orderId, sanitizeForIDB(update));
        }
    }, []);

    const addPayment = useCallback(async (orderId: string, payment: Omit<Payment, 'id'>) => {
        const order = await db.orders.get(orderId);
        if (!order) return;
        const newPayment: Payment = { ...payment, id: crypto.randomUUID() };
        const updatedPayments = [...(order.payments || []), newPayment];
        await db.orders.update(orderId, sanitizeForIDB({ payments: updatedPayments }));
    }, []);

    const updatePayment = useCallback(async (orderId: string, updatedPayment: Payment) => {
        const order = await db.orders.get(orderId);
        if (!order) return;
        const updatedPayments = (order.payments || []).map(p => p.id === updatedPayment.id ? updatedPayment : p);
        await db.orders.update(orderId, sanitizeForIDB({ payments: updatedPayments }));
    }, []);

    const deletePayment = useCallback(async (orderId: string, paymentId: string) => {
        const order = await db.orders.get(orderId);
        if (!order) return;
        const updatedPayments = (order.payments || []).filter(p => p.id !== paymentId);
        await db.orders.update(orderId, sanitizeForIDB({ payments: updatedPayments }));
    }, []);

    const duplicateOrder = useCallback(async (originalOrderId: string) => {
        const originalOrder = await db.orders.get(originalOrderId);
        if (!originalOrder) return;

        const now = new Date();
        const year = now.getFullYear().toString().slice(-2);
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const prefix = `PO-${year}${month}-`;
        
        const allOrders = await db.orders.toArray();
        const currentMonthOrders = allOrders.filter(o => o.id.startsWith(prefix));
        
        const maxId = currentMonthOrders.reduce((max, o) => {
            const num = parseInt(o.id.replace(prefix, ''), 10);
            return num > max ? num : max;
        }, 0);
        
        const newIdNumber = (maxId + 1).toString().padStart(3, '0');
        const newOrderId = `${prefix}${newIdNumber}`;
        
        // Copy items and give them new IDs
        const newItems = originalOrder.items.map((item, index) => ({
            ...item,
            id: `${newOrderId}-I${index + 1}`,
            attributes: item.attributes ? item.attributes.map(attr => ({...attr, id: crypto.randomUUID()})) : [],
            checklist: item.checklist ? item.checklist.map(task => ({...task, is_done: false})) : [], // Reset checklist progress
            // Clear source pointers for duplicated items to treat them as fresh copies
            source_po_id: undefined,
            source_po_item_id: undefined
        }));

        const newOrder: Order = {
            ...originalOrder,
            id: newOrderId,
            orderDate: now.toISOString().split('T')[0], // Set to today
            items: newItems,
            payments: [], // Clear payments
            isFinalized: false,
            finalizedAt: undefined,
            isArchived: false,
            archivedAt: undefined,
            deletedAt: null,
            // Keep other fields like supplier, status, costs, etc.
        };

        await db.orders.add(sanitizeForIDB(newOrder));
    }, []);

    const reorderOrders = useCallback(async (reorderedOrders: Order[]) => {
        // Updates the manualOrder field for a batch of orders based on their array index
        const updates = reorderedOrders.map((order, index) => ({
            key: order.id,
            changes: { manualOrder: index }
        }));
        await db.orders.bulkUpdate(updates);
    }, []);

    // --- Order Picker Logic ---
    // Strictly related to Orders and moving items between them. NO product logic here.
    const createOrderFromPicker = useCallback(async (pickedItems: PickerItem[]): Promise<string | undefined> => {
        if (pickedItems.length === 0) return;

        const firstItem = pickedItems[0];
        const sourceOrder = await db.orders.get(firstItem.sourceOrderId);
        if (!sourceOrder) throw new Error("Source order not found");

        const supplier = sourceOrder.supplier;

        // Verify supplier consistency
        for (const item of pickedItems) {
            const order = await db.orders.get(item.sourceOrderId);
            if (order && order.supplier !== supplier) {
                throw new Error("All picked items must come from the same supplier.");
            }
        }

        // Prepare new order data structure
        const newOrderItems: OrderItem[] = [];
        let createdOrderId: string | undefined;

        // Transaction to ensure atomicity
        await db.transaction('rw', db.orders, async () => {
            // 1. Generate New Order ID
            const now = new Date();
            const year = now.getFullYear().toString().slice(-2);
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const prefix = `PO-${year}${month}-`;
            
            const allOrders = await db.orders.toArray();
            const currentMonthOrders = allOrders.filter(o => o.id.startsWith(prefix));
            const maxId = currentMonthOrders.reduce((max, o) => {
                const num = parseInt(o.id.replace(prefix, ''), 10);
                return num > max ? num : max;
            }, 0);
            const newIdNumber = (maxId + 1).toString().padStart(3, '0');
            const newOrderId = `${prefix}${newIdNumber}`;
            createdOrderId = newOrderId;

            // 2. Process Picked Items -> Create New Order Items
            pickedItems.forEach((picked, index) => {
                const original = picked.originalItem;
                const newItem: OrderItem = {
                    ...original,
                    id: `${newOrderId}-I${index + 1}`,
                    quantity: picked.quantityToMove,
                    // Link back to source
                    source_po_id: picked.sourceOrderId,
                    source_po_item_id: original.id,
                    // Reset or carry over other fields? Carrying over seems correct for a split.
                };
                newOrderItems.push(newItem);
            });

            // 3. Update Original Orders (Deduct Quantities)
            const sourceOrderIds = Array.from(new Set(pickedItems.map(i => i.sourceOrderId)));
            
            for (const srcId of sourceOrderIds) {
                const srcOrder = await db.orders.get(srcId);
                if (!srcOrder) continue;

                const updatedSrcItems = srcOrder.items.filter(item => {
                    const picked = pickedItems.find(p => p.sourceOrderId === srcId && p.originalItem.id === item.id);
                    if (picked) {
                        const remaining = item.quantity - picked.quantityToMove;
                        if (remaining <= 0) return false; // Remove item if fully moved
                        item.quantity = remaining; // Update quantity in place (mutable reference in filter is tricky, better map)
                        return true;
                    }
                    return true;
                }).map(item => {
                     // Re-map to ensure the quantity update is captured if filter didn't catch it
                     const picked = pickedItems.find(p => p.sourceOrderId === srcId && p.originalItem.id === item.id);
                     if (picked) {
                         return { ...item, quantity: item.quantity }; // quantity was mutated above, or we set it here
                     }
                     return item;
                });
                
                const metrics = calculateOrderMetrics(updatedSrcItems);
                
                await db.orders.update(srcId, { 
                    items: updatedSrcItems,
                    volumeCBM: metrics.volumeCBM,
                    totalGrossWeight: metrics.totalGrossWeight,
                    totalNetWeight: metrics.totalNetWeight
                });
            }

            // 4. Create the New Order
            const newMetrics = calculateOrderMetrics(newOrderItems);
            const newOrder: Order = {
                id: newOrderId,
                supplier: supplier,
                internalCode: '', // New order, new code potentially
                orderDate: now.toISOString().split('T')[0],
                approxLoadingDate: now.toISOString().split('T')[0], // Default to today
                status: 'Draft',
                currency: sourceOrder.currency, // Inherit currency
                items: newOrderItems,
                payments: [],
                shipCosts: [], // Costs might need re-allocation, start empty for safety
                dubaiCosts: [],
                iranCosts: [],
                volumeCBM: newMetrics.volumeCBM,
                totalGrossWeight: newMetrics.totalGrossWeight,
                totalNetWeight: newMetrics.totalNetWeight,
                isArchived: false,
                isFinalized: false,
                deletedAt: null,
                manualOrder: 0,
            };

            await db.orders.add(sanitizeForIDB(newOrder));
        });

        return createdOrderId;
    }, []);


    // FIX: Add `addCost`, `updateCost`, and `removeCost` to the returned object.
    return { orders: orders || [], updateOrderStatus, updateOrder, archiveOrder, addOrder, updateOrderDetails, deleteOrder, deleteOrders, finalizeOrder, restoreOrder, restoreOrders, permanentlyDeleteOrder, permanentlyDeleteOrders, addCost, updateCost, removeCost, addAttachment, deleteAttachment, addPayment, updatePayment, deletePayment, duplicateOrder, reorderOrders, createOrderFromPicker };
};