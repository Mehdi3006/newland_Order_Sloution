
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Product } from '../types';
import Select from './Select';
import { useProductCategorySelection } from '../hooks/useProductCategorySelection';

interface RowCategoryEditorProps {
    product: Product;
    onSave: (productId: string, updates: Partial<Product>) => void;
    onClose: () => void;
}

const RowCategoryEditor = React.forwardRef<HTMLDivElement, RowCategoryEditorProps>(({ product, onSave, onClose }, ref) => {
    const { t, i18n } = useTranslation();
    const {
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
    } = useProductCategorySelection({ product, onSave });

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onClose();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    return (
        <div 
            ref={ref} 
            className="p-2 space-y-2 bg-indigo-50 border-2 border-indigo-500 rounded-md shadow-lg min-w-[200px]"
            onKeyDown={handleKeyDown}
        >
            <Select
                value={selectedMainGroupId || ''}
                onChange={e => handleMainGroupChange(e.target.value)}
                autoFocus
            >
                <option value="">{t('views.products.filters.allMainGroups')}</option>
                {allMainGroups.map(g => <option key={g.id} value={g.id}>{i18n.language === 'fa' && g.name_fa ? g.name_fa : g.name}</option>)}
            </Select>
            <Select
                value={selectedCategoryId || ''}
                onChange={e => handleCategoryChange(e.target.value)}
                disabled={!selectedMainGroupId}
            >
                <option value="">{t('views.products.filters.allCategories')}</option>
                {availableCategories.map(c => <option key={c.id} value={c.id}>{i18n.language === 'fa' && c.name_fa ? c.name_fa : c.name}</option>)}
            </Select>
            <Select
                value={selectedSubCategoryId || ''}
                onChange={e => handleSubCategoryChange(e.target.value)}
                disabled={!selectedCategoryId}
            >
                <option value="">{t('views.products.filters.allSubCategories')}</option>
                {availableSubCategories.map(sc => <option key={sc.id} value={sc.id}>{i18n.language === 'fa' && sc.name_fa ? sc.name_fa : sc.name}</option>)}
            </Select>
            <Select
                value={selectedBrandId || ''}
                onChange={e => handleBrandChange(e.target.value)}
                disabled={!selectedSubCategoryId}
            >
                <option value="">{t('views.products.filters.allBrands')}</option>
                {availableBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            
            <button 
                onClick={onClose} 
                className="w-full bg-indigo-600 text-white text-xs font-bold py-1 rounded hover:bg-indigo-700 transition-colors"
            >
                {t('common.done')}
            </button>
        </div>
    );
});

export default RowCategoryEditor;
