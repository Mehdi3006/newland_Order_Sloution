import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MainGroup, Category, SubCategory, Brand } from '../types';

interface DrilldownFilterProps {
  filters: { mainGroupId: string; categoryId: string; subCategoryId: string; brandId: string; };
  onFilterChange: (level: 'mainGroupId' | 'categoryId' | 'subCategoryId' | 'brandId', value: string) => void;
  onClear: () => void;
  data: {
    mainGroups: MainGroup[];
    categories: Category[];
    subCategories: SubCategory[];
    brands: Brand[];
  };
}

type ViewLevel = 'mainGroups' | 'categories' | 'subCategories' | 'brands';

interface HistoryItem {
  level: ViewLevel;
  parentId: string | null;
  title: string;
}

const levelToFilterKeyMap: Record<ViewLevel, 'mainGroupId' | 'categoryId' | 'subCategoryId' | 'brandId'> = {
    mainGroups: 'mainGroupId',
    categories: 'categoryId',
    subCategories: 'subCategoryId',
    brands: 'brandId'
};


const DrilldownFilter: React.FC<DrilldownFilterProps> = ({ filters, onFilterChange, onClear, data }) => {
    const { t, i18n } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [history, setHistory] = useState<HistoryItem[]>([{ level: 'mainGroups', parentId: null, title: t('views.products.filters.allMainGroups') }]);
    const popoverRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const currentView = history[history.length - 1];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && popoverRef.current && !popoverRef.current.contains(event.target as Node) && buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);
    
    // When filters are cleared externally, reset the history
    useEffect(() => {
        if (!filters.mainGroupId && !filters.categoryId && !filters.subCategoryId && !filters.brandId) {
            setHistory([{ level: 'mainGroups', parentId: null, title: t('views.products.filters.allMainGroups') }]);
        }
    }, [filters, t]);


    const handleBack = () => {
        if (history.length > 1) {
            setHistory(prev => prev.slice(0, -1));
        }
    };
    
    const handleClear = () => {
        onClear();
        setIsOpen(false);
    };

    const handleItemSelect = (level: ViewLevel, item: { id: string; name: string; name_fa?: string }) => {
        const filterKey = levelToFilterKeyMap[level];
        onFilterChange(filterKey, item.id);
        
        const nextLevelMap: Record<ViewLevel, ViewLevel | null> = {
            mainGroups: 'categories',
            categories: 'subCategories',
            subCategories: 'brands',
            brands: null
        };

        const nextLevel = nextLevelMap[level];
        if (nextLevel) {
            setHistory(prev => [...prev, { level: nextLevel, parentId: item.id, title: i18n.language === 'fa' && item.name_fa ? item.name_fa : item.name }]);
        } else {
            setIsOpen(false); // We've reached the end of the drilldown
        }
    };
    
    const renderList = () => {
        let items: any[] = [];
        switch (currentView.level) {
            case 'mainGroups': items = data.mainGroups; break;
            case 'categories': items = data.categories.filter(c => c.mainGroupId === currentView.parentId); break;
            case 'subCategories': items = data.subCategories.filter(sc => sc.categoryId === currentView.parentId); break;
            case 'brands': items = data.brands.filter(b => b.subCategoryId === currentView.parentId); break;
        }

        return (
            <ul className="space-y-1">
                {items.map(item => (
                    <li key={item.id}>
                        <button
                            onClick={() => handleItemSelect(currentView.level, item)}
                            className="w-full text-left rtl:text-right px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-md"
                        >
                            {i18n.language === 'fa' && item.name_fa ? item.name_fa : item.name}
                        </button>
                    </li>
                ))}
                 {items.length === 0 && <div className="text-center text-xs text-slate-400 p-4">No items in this category.</div>}
            </ul>
        );
    };

    const filterPath = useMemo(() => {
        const path: string[] = [];
        if(filters.mainGroupId) {
            const mg = data.mainGroups.find(g => g.id === filters.mainGroupId);
            if(mg) path.push(i18n.language === 'fa' && mg.name_fa ? mg.name_fa : mg.name);
        }
        if(filters.categoryId) {
            const cat = data.categories.find(c => c.id === filters.categoryId);
            if(cat) path.push(i18n.language === 'fa' && cat.name_fa ? cat.name_fa : cat.name);
        }
        if(filters.subCategoryId) {
            const sub = data.subCategories.find(s => s.id === filters.subCategoryId);
             if(sub) path.push(i18n.language === 'fa' && sub.name_fa ? sub.name_fa : sub.name);
        }
        if(filters.brandId) {
            const brand = data.brands.find(b => b.id === filters.brandId);
            if(brand) path.push(brand.name);
        }
        return path.length > 0 ? path.join(' > ') : t('views.products.filters.filterByCategory');
    }, [filters, data, t, i18n.language]);

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className="min-w-64 w-full bg-white border border-slate-300 rounded-md py-2 px-4 text-sm flex items-center justify-between"
            >
                <span className="truncate">{filterPath}</span>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
            
            {isOpen && (
                <div
                    ref={popoverRef}
                    className="absolute top-full start-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-slate-200 z-40"
                >
                    <div className="p-2 border-b border-slate-200 flex items-center">
                        {history.length > 1 && (
                            <button onClick={handleBack} className="p-1 rounded-full hover:bg-slate-100">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                        )}
                        <h4 className="flex-1 text-center font-semibold text-slate-800 truncate px-2">{currentView.title}</h4>
                        <button onClick={handleClear} className="text-xs font-semibold text-red-600 hover:underline">{t('views.products.filters.clear')}</button>
                    </div>
                    <div className="p-2 max-h-64 overflow-y-auto">
                        {renderList()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DrilldownFilter;