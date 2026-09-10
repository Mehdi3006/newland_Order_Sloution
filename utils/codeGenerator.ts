


import { MainGroup, Category, SubCategory } from '../types';

/**
 * Generates a structured product code based on the selected hierarchy.
 * Format: MG-CAT-SUB-XXXX (where XXXX is a sequential number)
 * 
 * Note: A real implementation would need to check the database for the last used sequence.
 * This helper formats the prefix.
 */
export const generateProductCodePrefix = (
    mainGroup: MainGroup | undefined, 
    category: Category | undefined, 
    subCategory: SubCategory | undefined
): string => {
    if (!mainGroup || !category || !subCategory) return '';

    // Helper to extract a 2-char code from a name. 
    // Heuristic: First 2 letters, uppercase.
    const getCode = (name: string) => {
        const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        return clean.substring(0, 2).padEnd(2, 'X');
    };

    const mgCode = getCode(mainGroup.name);
    const catCode = getCode(category.name);
    const subCode = getCode(subCategory.name);

    return `${mgCode}${catCode}${subCode}`;
};