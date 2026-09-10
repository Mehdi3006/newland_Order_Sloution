
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Order, OrderItem, Product, NewOrderData, Cost, NewProductData, CostingSettings } from '../types';
import { useCallback } from 'react';
import { calculateFinalProducts, recalculateProductPrices } from '../utils/costCalculator';
import i18n from 'i18next';
import { Toast } from '../components/Toast';

type CostKey = 'shipCosts' | 'dubaiCosts' | 'iranCosts';

export const useProducts = () => {
    const products = useLiveQuery(() => 
        db.products.filter(p => !p.deletedAt).sortBy('order'), 
    []);

    const updateProduct = useCallback(async (productId: string, updates: Partial<Product>) => {
        await db.products.update(productId, updates);
    }, []);

    const reindexActiveProducts = useCallback(async () => {
        await db.transaction('rw', db.products, async () => {
            const activeProducts = await db.products
                .filter(p => !p.deletedAt)
                .sortBy('order');
            
            const updates = activeProducts.map((product, index) => ({
                key: product.id,
                changes: { order: index + 1 }
            }));

            if (updates.length > 0) {
                await db.products.bulkUpdate(updates);
            }
        });
    }, []);

    const deleteProducts = useCallback(async (productIds: string[]) => {
        const now = new Date().toISOString();
        
        await db.transaction('rw', db.products, async () => {
            // 1. Soft delete: Set deletedAt and "free" the row number (set to -1)
            await db.products.where('id').anyOf(productIds).modify({ deletedAt: now, order: -1 });

            // 2. Re-index remaining active products to close gaps
            const remainingProducts = await db.products
                .filter(p => !p.deletedAt)
                .sortBy('order');

            const updates = remainingProducts.map((product, index) => ({
                key: product.id,
                changes: { order: index + 1 }
            }));

            if (updates.length > 0) {
                await db.products.bulkUpdate(updates);
            }
        });
    }, []);

    const restoreProducts = useCallback(async (productIds: string[]) => {
        await db.transaction('rw', db.products, async () => {
            const countToRestore = productIds.length;
            if (countToRestore === 0) return;

            // 1. Shift all existing active products down by N to make room at the top
            const activeProducts = await db.products
                .filter(p => !p.deletedAt)
                .toArray();
            
            const shiftUpdates = activeProducts.map(p => ({
                key: p.id,
                changes: { order: p.order + countToRestore }
            }));
            
            if (shiftUpdates.length > 0) {
                await db.products.bulkUpdate(shiftUpdates);
            }

            // 2. Restore items to the top (1..N)
            // We fetch them to ensure we only restore valid IDs
            const productsToRestore = await db.products.where('id').anyOf(productIds).toArray();
            
            const restoreUpdates = productsToRestore.map((product, index) => ({
                key: product.id,
                changes: { 
                    deletedAt: null,
                    order: index + 1 
                }
            }));

            if (restoreUpdates.length > 0) {
                await db.products.bulkUpdate(restoreUpdates);
            }
            
            // 3. Safety re-index to ensure strictly 1-based no-gap ordering
            // (Implicitly handled by logic above, but good for robustness if concurrent edits happen)
        });
    }, []);

    const restoreProduct = useCallback(async (productId: string) => {
        await restoreProducts([productId]);
    }, [restoreProducts]);
    
    const permanentlyDeleteProduct = useCallback(async (productId: string) => {
        await db.products.delete(productId);
    }, []);

    const permanentlyDeleteProducts = useCallback(async (productIds: string[]) => {
        await db.products.bulkDelete(productIds);
    }, []);

    const addProduct = useCallback(async (formData: NewProductData, costingSettings: CostingSettings) => {
        await db.transaction('rw', db.products, async () => {
            // 1. Shift all existing active products down by 1
            const activeProducts = await db.products.filter(p => !p.deletedAt).toArray();
            const shiftUpdates = activeProducts.map(p => ({
                key: p.id,
                changes: { order: p.order + 1 }
            }));
            if (shiftUpdates.length > 0) {
                await db.products.bulkUpdate(shiftUpdates);
            }

            // 2. Create new product at order #1
            const productSkeleton: Product = {
                id: '', // Will be set later
                sourceOrderId: `manual-${new Date().toISOString()}`,
                finalizedAt: new Date().toISOString(),
                settingsSnapshot: costingSettings,
                deletedAt: null,
                ...formData,
                iranCustomsCosts: { finalDuty_TOMAN: 0, importVat_TOMAN: 0, brokerFee_TOMAN: 0, shipFreight_TOMAN: 0, inlandFreight_TOMAN: 0, standardFee_TOMAN: 0, loadingUnloadingFee_TOMAN: 0 },
                landedCostUSD: 0,
                landedCostAED: 0,
                landedCostTOMAN: 0,
                sellingPrices: { aed: { tier1: 0, tier2: 0, tier3: 0 }, toman: { tier1: 0, tier2: 0, tier3: 0 } },
                order: 1, // Explicitly #1
                createdAt: new Date().toISOString(),
            };
            
            const calculatedProduct = recalculateProductPrices(productSkeleton, costingSettings);

            const newProduct: Product = {
                ...calculatedProduct,
                id: `prod-${crypto.randomUUID()}`
            };

            await db.products.add(newProduct);
        });
    }, []);


    const resetAllProductOverrides = useCallback(async () => {
        await db.transaction('rw', db.products, db.priceHistory, async () => {
            const productsWithOverrides = await db.products
                .filter(p => !!p.pricingTiersOverrides && (Object.keys(p.pricingTiersOverrides.aed || {}).length > 0 || Object.keys(p.pricingTiersOverrides.toman || {}).length > 0))
                .toArray();
            
            if (productsWithOverrides.length === 0) return;

            const historyEntries = productsWithOverrides.map(p => ({
                productId: p.id,
                timestamp: new Date().toISOString(),
                oldPrices: p.sellingPrices,
                oldLandedCostAED: p.landedCostAED,
                oldLandedCostTOMAN: p.landedCostTOMAN,
            }));

            await db.priceHistory.bulkAdd(historyEntries);

            const productIds = productsWithOverrides.map(p => p.id);
            await db.products.where('id').anyOf(productIds).modify({ pricingTiersOverrides: undefined });
        });
    }, []);

    const updateProductsOrder = useCallback(async (orderedProducts: Product[]) => {
        // Ensure 1-based indexing for drag-and-drop operations
        const updates = orderedProducts.map((product, index) => ({
            key: product.id,
            changes: { order: index + 1 }
        }));
        await db.products.bulkUpdate(updates);
    }, []);

    return { 
        products: products || [], 
        updateProduct,
        deleteProducts,
        restoreProduct,
        restoreProducts,
        permanentlyDeleteProduct,
        permanentlyDeleteProducts,
        resetAllProductOverrides,
        addProduct,
        updateProductsOrder,
        reindexActiveProducts,
    };
};
