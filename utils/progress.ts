import { Order, OrderItem } from '../types';

/**
 * Calculates the progress of a single order item based on its checklist.
 * Progress is the ratio of the sum of weights of completed tasks to the total weight of all tasks.
 * @param item - The order item.
 * @returns A progress value between 0 and 1.
 */
export const calculateItemProgress = (item: OrderItem): number => {
    if (!item.checklist || item.checklist.length === 0) {
        return 0;
    }

    const totalWeight = item.checklist.reduce((sum, task) => sum + task.task_weight, 0);
    if (totalWeight === 0) {
        return 0; // Avoid division by zero
    }

    const doneWeight = item.checklist
        .filter(task => task.is_done)
        .reduce((sum, task) => sum + task.task_weight, 0);

    return doneWeight / totalWeight;
};

/**
 * Calculates the overall progress of an order.
 * This is the average of the progress of all its items.
 * @param order - The order.
 * @returns A progress value between 0 and 1.
 */
export const calculateOrderProgress = (order: Order): number => {
    if (!order.items || order.items.length === 0) {
        return 0;
    }

    const itemProgresses = order.items.map(calculateItemProgress);
    const totalProgress = itemProgresses.reduce((sum, p) => sum + p, 0);

    return totalProgress / order.items.length;
};
