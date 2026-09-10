import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Status } from '../types';
// FIX: Changed i18n import to a named import to resolve the "no default export" error.
import i18n from 'i18next';

export const useStatuses = () => {
    const statuses = useLiveQuery(() => db.statuses.orderBy('order').toArray(), []);

    const addStatus = async (name: string) => {
        const trimmedName = name.trim();
        if (!trimmedName) return; 

        const existingStatus = await db.statuses.where('name').equalsIgnoreCase(trimmedName).first();
        if (existingStatus) {
            alert(`A status named "${trimmedName}" already exists.`);
            return;
        }
        const highestOrder = await db.statuses.orderBy('order').last();
        const newOrder = highestOrder ? highestOrder.order + 1 : 0;
        const newStatus: Status = {
            id: crypto.randomUUID(),
            name: trimmedName,
            order: newOrder,
            isSystem: false
        };
        await db.statuses.add(newStatus);
    };
    
    const updateStatusName = async (id: string, newName: string) => {
        const trimmedName = newName.trim();
        if (!trimmedName) return;
        
        const oldStatus = await db.statuses.get(id);
        if(oldStatus?.isSystem){
            alert("System columns cannot be renamed.");
            return;
        }

        const existingStatus = await db.statuses.where('name').equalsIgnoreCase(trimmedName).first();
        if (existingStatus && existingStatus.id !== id) {
             alert(`A status named "${trimmedName}" already exists.`);
             return;
        }
        
        if(oldStatus && oldStatus.name !== trimmedName) {
            await (db as any).transaction('rw', db.orders, db.statuses, async () => {
                // Update status name
                await db.statuses.update(id, { name: trimmedName });

                // Find all orders with the old status name and update them
                const ordersToUpdate = await db.orders.where('status').equals(oldStatus.name).toArray();
                const orderUpdatePromises = ordersToUpdate.map(order => 
                    db.orders.update(order.id, { status: trimmedName })
                );
                await Promise.all(orderUpdatePromises);
            });
        }
    };

    const updateStatusesOrder = async (reorderedStatuses: Status[]) => {
        const updates = reorderedStatuses.map((status, index) => ({
            key: status.id,
            changes: { order: index }
        }));
        await db.statuses.bulkUpdate(updates);
    };

    const deleteStatus = async (statusId: string) => {
        const statusToDelete = await db.statuses.get(statusId);
        if (!statusToDelete) return;

        if (statusToDelete.isSystem) {
            alert("System columns cannot be deleted.");
            return;
        }
        
        const orderCount = await db.orders.where('status').equals(statusToDelete.name).count();
        if (orderCount > 0) {
            alert(i18n.t('kanban.deleteColumnError', { name: statusToDelete.name, count: orderCount }));
            return;
        }
        
        // Confirmation should be handled in the component before calling this function
        await db.statuses.delete(statusId);
    };

    return { statuses: statuses || [], addStatus, updateStatusName, updateStatusesOrder, deleteStatus };
};