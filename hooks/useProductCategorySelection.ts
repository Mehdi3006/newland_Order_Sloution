import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Product, MainGroup, Category, SubCategory, Brand } from '../types';

interface UseProductCategorySelectionProps {
    product: Product;
    onSave: (productId: string, updates: Partial<Product>) => void;
}

/**
 * A dedicated hook to manage the logic for selecting a product's full category hierarchy.
 * It fetches all category data, manages the state of the selections, provides filtered
 * lists for dependent dropdowns, and calls a save function on any change.
 */
export const useProductCategorySelection = ({ product, onSave }: UseProductCategorySelectionProps) => {
    const allMainGroups = useLiveQuery(() => db.mainGroups.orderBy('name').toArray(), []) || [];
    const allCategories = useLiveQuery(() => db.categories.toArray(), []) || [];
    const allSubCategories = useLiveQuery(() => db.subCategories.toArray(), []) || [];
    const allBrands = useLiveQuery(() => db.brands.toArray(), []) || [];

    const [selectedMainGroupId, setSelectedMainGroupId] = useState<string | undefined>(product.mainGroupId);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(product.categoryId);
    const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string | undefined>(product.subCategoryId);
    const [selectedBrandId, setSelectedBrandId] = useState<string | undefined>(product.brandId);

    // Sync with external product changes if the product prop updates
    useEffect(() => {
        setSelectedMainGroupId(product.mainGroupId);
        setSelectedCategoryId(product.categoryId);
        setSelectedSubCategoryId(product.subCategoryId);
        setSelectedBrandId(product.brandId);
    }, [product]);

    const availableCategories = useMemo(() => {
        if (!selectedMainGroupId) return [];
        return allCategories.filter(c => c.mainGroupId === selectedMainGroupId);
    }, [selectedMainGroupId, allCategories]);

    const availableSubCategories = useMemo(() => {
        if (!selectedCategoryId) return [];
        return allSubCategories.filter(sc => sc.categoryId === selectedCategoryId);
    }, [selectedCategoryId, allSubCategories]);

    const availableBrands = useMemo(() => {
        if (!selectedSubCategoryId) return [];
        return allBrands.filter(b => b.subCategoryId === selectedSubCategoryId);
    }, [selectedSubCategoryId, allBrands]);

    const handleMainGroupChange = (newId: string) => {
        const updates: Partial<Product> = {
            mainGroupId: newId || undefined,
            categoryId: undefined,
            subCategoryId: undefined,
            brandId: undefined,
        };
        onSave(product.id, updates);
    };

    const handleCategoryChange = (newId: string) => {
        const updates: Partial<Product> = {
            categoryId: newId || undefined,
            subCategoryId: undefined,
            brandId: undefined,
        };
        onSave(product.id, updates);
    };

    const handleSubCategoryChange = (newId: string) => {
        const updates: Partial<Product> = {
            subCategoryId: newId || undefined,
            brandId: undefined,
        };
        onSave(product.id, updates);
    };

    const handleBrandChange = (newId: string) => {
        const updates: Partial<Product> = {
            brandId: newId || undefined,
        };
        onSave(product.id, updates);
    };

    return {
        allMainGroups,
        availableCategories,
        availableSubCategories,
        availableBrands,
        selectedMainGroupId,
        selectedCategoryId,
        selectedSubCategoryId,
        selectedBrandId,
        handleMainGroupChange,
        handleCategoryChange,
        handleSubCategoryChange,
        handleBrandChange,
    };
};
