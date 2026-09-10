
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { CustomsBook, CustomsBookCell, CellStyle, CustomsBookRowHeight, CustomsBookMerge, Selection, SelectionRange, CellAddress, Product, Order, CostingSettings, CompanyInfo } from '../types';
import { useModals } from '../contexts/ModalContext';
import ExcelJS from 'exceljs';
import LoadingOverlay from './LoadingOverlay';
import { persianArabicToEnglish, numberToWords } from '../utils/formatters';
import Select from './Select';
import { evaluateFormula, colIndexToHeader, cellHeaderToIndex } from '../utils/formulaParser';
import FormattingToolbar from './FormattingToolbar';
import { useCustomsBookClipboard, getRangeBounds } from '../hooks/useCustomsBookClipboard';
import type { ClipboardData } from '../hooks/useCustomsBookClipboard';
import { useProducts as useDbProducts } from '../hooks/useProducts';
import { useSettings } from '../hooks/useSettings';


// --- Constants & Types ---
const NUM_ROWS = 3000;
const NUM_COLS = 100;
const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_COL_WIDTH = 120;
const HEADER_HEIGHT = 30;
const ROW_HEADER_WIDTH = 50;
const FOOTER_HEIGHT = 32; // 2rem or h-8
const FORMULA_BAR_HEIGHT = 36;
const TOOLBAR_HEIGHT = 44; // New toolbar height

interface CustomsBookViewProps {
  documentToGenerate: { order: Order; type: 'invoice' | 'packing-list'; options?: any; } | null;
  onDocumentGenerated: () => void;
  // FIX: Added companyInfo and companyLogo to props to match usage in App.tsx
  companyInfo: CompanyInfo;
  companyLogo: string;
}

type UndoableItem = CustomsBookCell | CustomsBookRowHeight | CustomsBookMerge;
type UndoAction = { bookId: string, before: UndoableItem[]; after: UndoableItem[] };
type ContextMenuType = 'cell' | 'row' | 'col';
type ContextMenuState = { visible: boolean; x: number; y: number; type: ContextMenuType; index: number };
type FormulaSelectionState = {
    isActive: boolean;
    range: SelectionRange;
    initialFormula: string;
    selectionStart: number;
    selectionEnd: number;
};
type StyleChange = {
    bold?: 'toggle';
    italic?: 'toggle';
    underline?: 'toggle';
    align?: 'left' | 'center' | 'right';
    valign?: 'top' | 'middle' | 'bottom';
    bgColor?: string;
    textColor?: string;
    borders?: string;
    fontSize?: number;
    merge?: 'toggle';
};


// --- Helper Functions ---
const getNumericValue = (value: any): number | null => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const num = parseFloat(persianArabicToEnglish(String(value).replace(/,/g, '')));
    return isNaN(num) || !isFinite(num) ? null : num;
};

const rangeToHeaderString = (range: SelectionRange): string => {
    const { start, end } = range;
    const { minRow, maxRow, minCol, maxCol } = getRangeBounds(range);

    const startRef = colIndexToHeader(minCol - 1) + minRow;
    const endRef = colIndexToHeader(maxCol - 1) + maxRow;

    if (startRef === endRef) {
        return startRef;
    }
    return `${startRef}:${endRef}`;
};


// --- Sub-Components ---
interface SummaryData {
    average: number;
    count: number;
    sum: number;
}

interface CustomsBookFooterProps {
    activeCellAddress: string;
    summary: SummaryData | null;
    zoomLevel: number;
    onZoomChange: (level: number) => void;
}

const SummaryItem: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
    <div className="flex items-center gap-x-2 px-3">
        <span className="text-slate-600">{label}:</span>
        <span className="font-semibold font-mono text-slate-800">{value}</span>
    </div>
);

const CustomsBookFooter: React.FC<CustomsBookFooterProps> = ({ activeCellAddress, summary, zoomLevel, onZoomChange }) => {
    const { t } = useTranslation();
    const [isSliderVisible, setIsSliderVisible] = useState(false);
    const zoomRef = useRef<HTMLDivElement>(null);

    const numberFormatter = new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
    });
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isSliderVisible && zoomRef.current && !zoomRef.current.contains(event.target as Node)) {
                setIsSliderVisible(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isSliderVisible]);

    const handleZoomButtonClick = (direction: 'in' | 'out') => {
        const currentPercentage = Math.round(zoomLevel * 100);
        let newPercentage;

        const zoomSteps = [25, 50, 75, 90, 100, 110, 125, 150, 175, 200];
        
        if (direction === 'in') {
            newPercentage = zoomSteps.find(step => step > currentPercentage) || 200;
        } else {
            newPercentage = [...zoomSteps].reverse().find(step => step < currentPercentage) || 25;
        }
        onZoomChange(newPercentage / 100);
    };

    return (
        <div className="flex-shrink-0 h-8 bg-slate-100 border-t border-slate-300 flex items-center justify-between px-2 text-xs rounded-b-lg">
            {/* Left Section */}
            <div className="flex items-center">
                <span className="text-slate-500 px-2">Ready</span>
            </div>

            {/* Middle Section - Summary */}
            <div className="flex items-center h-full">
                {summary && (
                    <>
                        <SummaryItem label="Average" value={numberFormatter.format(summary.average)} />
                        <div className="h-4 w-px bg-slate-300 mx-2"></div>
                        <SummaryItem label="Count" value={summary.count.toLocaleString('en-US')} />
                        <div className="h-4 w-px bg-slate-300 mx-2"></div>
                        <SummaryItem label="Sum" value={numberFormatter.format(summary.sum)} />
                    </>
                )}
            </div>
            
            {/* Right Section */}
            <div className="flex items-center gap-x-4">
                 <div className="font-semibold text-slate-700 px-2">{activeCellAddress}</div>
                 <div ref={zoomRef} className="relative flex items-center gap-x-1 text-slate-600 border-l border-slate-300 pl-2">
                     {isSliderVisible && (
                        <div className="absolute bottom-full right-0 mb-2 bg-white border border-slate-300 shadow-lg rounded-md p-2 flex items-center gap-x-2">
                            <input
                                type="range"
                                min="25"
                                max="200"
                                step="5"
                                value={Math.round(zoomLevel * 100)}
                                onChange={(e) => onZoomChange(parseInt(e.target.value) / 100)}
                                className="w-32"
                            />
                        </div>
                    )}
                     <button onClick={() => handleZoomButtonClick('out')} className="p-1 rounded hover:bg-slate-200" aria-label="Zoom out">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                     </button>
                     <span 
                        className="font-mono w-12 text-center cursor-pointer hover:bg-slate-200 rounded py-1"
                        onClick={() => setIsSliderVisible(!isSliderVisible)}
                     >
                        {Math.round(zoomLevel * 100)}%
                     </span>
                     <button onClick={() => handleZoomButtonClick('in')} className="p-1 rounded hover:bg-slate-200" aria-label="Zoom in">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                     </button>
                 </div>
            </div>
        </div>
    );
};


const CustomsBookView: React.FC<CustomsBookViewProps> = ({ documentToGenerate, onDocumentGenerated, companyInfo, companyLogo }) => {
    const { t, i18n } = useTranslation();
    const { showConfirmation, addToast } = useModals();
    const { products } = useDbProducts();
    const { settings } = useSettings();
    
    // --- Refs ---
    const rootRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const gridContainerRef = useRef<HTMLDivElement>(null);
    const colHeaderRef = useRef<HTMLDivElement>(null);
    const rowHeaderRef = useRef<HTMLDivElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);
    const textMeasureRef = useRef<HTMLSpanElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);
    const frozenRowsRef = useRef<HTMLDivElement>(null);
    const frozenColsRef = useRef<HTMLDivElement>(null);
    const bookActionsMenuRef = useRef<HTMLDivElement>(null);
    const formulaBarRef = useRef<HTMLInputElement>(null);
    const functionMenuRef = useRef<HTMLDivElement>(null);
    const resizingRowRef = useRef<{ row: number; startY: number; startHeight: number } | null>(null);
    const resizingColumnRef = useRef<{ key: number; startX: number; startWidth: number } | null>(null);

    // --- State ---
    const [currentBookId, setCurrentBookId] = useState<string | null>(null);
    const [isBookActionsOpen, setIsBookActionsOpen] = useState(false);
    const [isCreatingNewBook, setIsCreatingNewBook] = useState(false);
    const [isRenamingBook, setIsRenamingBook] = useState(false);
    const [bookNameInput, setBookNameInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [scrollPos, setScrollPos] = useState({ top: 0, left: 0 });
    const [selection, setSelection] = useState<Selection>({ active: { row: 1, col: 1 }, range: { start: { row: 1, col: 1 }, end: { row: 1, col: 1 } } });
    const [editingCell, setEditingCell] = useState<CellAddress | null>(null);
    const [editorContent, setEditorContent] = useState('');
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [searchResults, setSearchResults] = useState<CellAddress[]>([]);
    const [currentResultIndex, setCurrentResultIndex] = useState(-1);
    const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectingHeader, setSelectingHeader] = useState<'row' | 'col' | null>(null);
    const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
    const [redoStack, setRedoStack] = useState<UndoAction[]>([]);
    const [frozenAt, setFrozenAt] = useState<{ row: number; col: number } | null>(null);
    const [centerOnScrollTo, setCenterOnScrollTo] = useState<CellAddress | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1); // 1 = 100%
    const [dragOverRange, setDragOverRange] = useState<SelectionRange | null>(null);
    const [formulaSelection, setFormulaSelection] = useState<FormulaSelectionState | null>(null);
    const [editInitiator, setEditInitiator] = useState<'cell' | 'formulaBar' | null>(null);
    const [isFunctionMenuOpen, setIsFunctionMenuOpen] = useState(false);
    const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
    const [dragFillSourceData, setDragFillSourceData] = useState<ClipboardData | null>(null);
    
    const costingSettings = useMemo(() => settings.find(s => s.key === 'perShipmentCostingSettings')?.value as CostingSettings | null, [settings]);


    // --- Data Fetching & Callbacks ---
    const books = useLiveQuery(() => db.customsBooks.toArray(), []);
    const cells = useLiveQuery(() => currentBookId ? db.customsBookCells.where({ bookId: currentBookId }).toArray() : [], [currentBookId]);
    const merges = useLiveQuery(() => currentBookId ? db.customsBookMerges.where({ bookId: currentBookId }).toArray() : [], [currentBookId]);
    const dbRowHeights = useLiveQuery(() => currentBookId ? db.customsBookRowHeights.where({ bookId: currentBookId }).toArray() : [], [currentBookId]);
    
    useEffect(() => {
        if (dbRowHeights) {
            const heightMap: Record<number, number> = {};
            for (const rh of dbRowHeights) {
                heightMap[rh.row] = rh.height;
            }
            setRowHeights(heightMap);
        }
    }, [dbRowHeights]);
    
    useEffect(() => {
        if (books && books.length > 0 && !currentBookId) {
            setCurrentBookId(books[0].id);
        }
    }, [books, currentBookId]);
    
    const getRowHeight = useCallback((row: number) => (rowHeights[row] ?? DEFAULT_ROW_HEIGHT) * zoomLevel, [rowHeights, zoomLevel]);
    const getColWidth = useCallback((col: number) => (columnWidths[col] ?? DEFAULT_COL_WIDTH) * zoomLevel, [columnWidths, zoomLevel]);
    
    // --- Memoized Calculations (Corrected Order) ---
    const dataMap = useMemo(() => new Map<string, any>(cells?.map(c => [`${c.row}-${c.col}`, c.value])), [cells]);
    const styleMap = useMemo(() => new Map<string, CellStyle>(cells?.filter(c => c.style).map(c => [`${c.row}-${c.col}`, c.style!])), [cells]);
    
    const { mergeMap, mergedCellsSet, findMergeInfo } = useMemo(() => {
        const map = new Map<string, CustomsBookMerge>();
        const set = new Set<string>();
        const infoMap = new Map<string, CustomsBookMerge>();

        if (merges) {
            for (const merge of merges) {
                map.set(`${merge.row}-${merge.col}`, merge);
                for (let r = 0; r < merge.rowspan; r++) {
                    for (let c = 0; c < merge.colspan; c++) {
                        const key = `${merge.row + r}-${merge.col + c}`;
                        set.add(key);
                        infoMap.set(key, merge);
                    }
                }
            }
        }
        return { 
            mergeMap: map, 
            mergedCellsSet: set, 
            findMergeInfo: (row: number, col: number) => infoMap.get(`${row}-${col}`) 
        };
    }, [merges]);

    // --- Undo/Redo Logic ---
    const pushUndoAction = useCallback((action: Omit<UndoAction, 'bookId'>) => {
        if (!currentBookId) return;
        setUndoStack(prev => [...prev, { ...action, bookId: currentBookId }]);
        setRedoStack([]); // Clear redo stack on new action
    }, [currentBookId]);

    // --- Clipboard Logic (using new hook) ---
    const { copy, cut, paste, clipboard } = useCustomsBookClipboard({
        targetRef: rootRef,
        selection,
        currentBookId,
        dataMap,
        styleMap,
        pushUndoAction,
        setSelection,
        addToast,
    });
    
    const formulaBarDisplayValue = useMemo(() => {
        if (editingCell) { return editorContent; }
        const { row, col } = selection.active;
        return String(dataMap.get(`${row}-${col}`) ?? '');
    }, [editingCell, editorContent, selection.active, dataMap]);

    const searchResultsSet = useMemo(() => new Set(searchResults.map(r => `${r.row}-${r.col}`)), [searchResults]);
    
    const { columnLefts, totalWidth } = useMemo(() => {
        const lefts: number[] = []; let currentLeft = 0;
        for (let i = 0; i < NUM_COLS; i++) { lefts[i] = currentLeft; currentLeft += getColWidth(i + 1); }
        return { columnLefts: lefts, totalWidth: currentLeft };
    }, [getColWidth]);

    const { rowTops, totalHeight } = useMemo(() => {
        const tops: number[] = []; let currentTop = 0;
        for (let i = 0; i < NUM_ROWS; i++) { tops[i] = currentTop; currentTop += getRowHeight(i + 1); }
        return { rowTops: tops, totalHeight: currentTop };
    }, [getRowHeight]);

    const getCellFromCoords = useCallback((e: React.MouseEvent | MouseEvent): CellAddress | null => {
        if (!gridContainerRef.current) return null;

        const rect = gridContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollPos.left;
        const y = e.clientY - rect.top + scrollPos.top;

        // Find row index (could be optimized with binary search if needed)
        const rowIndex = rowTops.findIndex((top, i) => y >= top && y < top + getRowHeight(i + 1));
        const colIndex = columnLefts.findIndex((left, i) => x >= left && x < left + getColWidth(i + 1));

        if (rowIndex !== -1 && colIndex !== -1) {
            return { row: rowIndex + 1, col: colIndex + 1 };
        }

        return null;
    }, [scrollPos, rowTops, columnLefts, getRowHeight, getColWidth]);


    const summary = useMemo(() => {
        const { minRow, maxRow, minCol, maxCol } = getRangeBounds(selection.range);
        const numbers: number[] = [];
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                let value = dataMap.get(`${r}-${c}`);
                if (typeof value === 'string' && value.startsWith('=')) {
                    value = evaluateFormula(value, dataMap);
                }
                if (value !== null && value !== undefined && String(value).trim() !== '') {
                    const num = parseFloat(persianArabicToEnglish(String(value).replace(/,/g, '')));
                    if (!isNaN(num) && isFinite(num)) {
                        numbers.push(num);
                    }
                }
            }
        }
        if (numbers.length === 0) return null;
        const sum = numbers.reduce((a, b) => a + b, 0);
        return { sum, count: numbers.length, average: sum / numbers.length };
    }, [selection.range, dataMap]);

    const frozenRowCount = frozenAt ? frozenAt.row - 1 : 0;
    const frozenColCount = frozenAt ? frozenAt.col - 1 : 0;
    
    const frozenHeight = useMemo(() => frozenRowCount > 0 ? rowTops[frozenRowCount - 1] + getRowHeight(frozenRowCount) : 0, [frozenRowCount, rowTops, getRowHeight]);
    const frozenWidth = useMemo(() => frozenColCount > 0 ? columnLefts[frozenColCount - 1] + getColWidth(frozenColCount) : 0, [frozenColCount, columnLefts, getColWidth]);

    const dragOverStyle = useMemo(() => {
        if (!dragOverRange) return { display: 'none' };
        const { minRow, maxRow, minCol, maxCol } = getRangeBounds(dragOverRange);
        return {
            top: rowTops[minRow - 1],
            left: columnLefts[minCol - 1],
            width: (columnLefts[maxCol - 1] + getColWidth(maxCol)) - columnLefts[minCol - 1],
            height: (rowTops[maxRow - 1] + getRowHeight(maxRow)) - rowTops[minRow - 1],
        };
    }, [dragOverRange, rowTops, columnLefts, getColWidth, getRowHeight]);

    const selectionStyle = useMemo(() => {
        const { minRow, maxRow, minCol, maxCol } = getRangeBounds(selection.range);
        return {
            top: rowTops[minRow - 1],
            left: columnLefts[minCol - 1],
            width: (columnLefts[maxCol - 1] + getColWidth(maxCol)) - columnLefts[minCol - 1],
            height: (rowTops[maxRow - 1] + getRowHeight(maxRow)) - rowTops[minRow - 1],
        };
    }, [selection.range, rowTops, columnLefts, getColWidth, getRowHeight]);

    const cutStyle = useMemo(() => {
        const cutRange = clipboard?.isCut ? getRangeBounds(clipboard.sourceRange) : null;
        if (!cutRange) return { display: 'none' };
        return {
            top: rowTops[cutRange.minRow - 1],
            left: columnLefts[cutRange.maxCol - 1],
            width: (columnLefts[cutRange.maxCol - 1] + getColWidth(cutRange.maxCol)) - columnLefts[cutRange.minCol - 1],
            height: (rowTops[cutRange.maxRow - 1] + getRowHeight(cutRange.maxRow)) - rowTops[cutRange.minRow - 1],
        };
    }, [clipboard, rowTops, columnLefts, getColWidth, getRowHeight]);

    const handleExport = useCallback(async () => {
        if (!currentBookId) return;
        setIsLoading(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const currentBookName = books?.find(b => b.id === currentBookId)?.name || 'Customs Book';
            const sheet = workbook.addWorksheet(currentBookName);

            // Set print titles and footers
            const headerRowCount = 12; 
            sheet.pageSetup.printTitlesRow = `1:${headerRowCount}`;
            sheet.headerFooter.oddFooter = "&CPage &P of &N";
            sheet.headerFooter.differentFirst = false;
            sheet.headerFooter.differentOddEven = false;

            // Fetch all data for the book
            const allDbCells = await db.customsBookCells.where({ bookId: currentBookId }).toArray();
            const dbMerges = await db.customsBookMerges.where({ bookId: currentBookId }).toArray();
            const allDbRowHeights = await db.customsBookRowHeights.where({ bookId: currentBookId }).toArray();

            if (allDbCells.length === 0) {
                addToast('No data to export.', 'info');
                setIsLoading(false);
                return;
            }

            // Determine max dimensions from data
            const maxCol = allDbCells.reduce((max, cell) => Math.max(max, cell.col), 0);
            
            // 1. Apply Column Widths
            for (let i = 1; i <= maxCol; i++) {
                const width = columnWidths[i] ?? DEFAULT_COL_WIDTH;
                sheet.getColumn(i).width = width / 7.5; // Pixel to character approx.
            }

            // 2. Apply Row Heights
            allDbRowHeights.forEach(rh => {
                sheet.getRow(rh.row).height = rh.height * 0.75; // px to points
            });

            // 3. Apply Cells, Values, and Styles
            allDbCells.forEach(cell => {
                const row = sheet.getRow(cell.row);
                if (!row.height) { // Set default height for rows not in dbRowHeights
                    row.height = DEFAULT_ROW_HEIGHT * 0.75;
                }
                const sheetCell = row.getCell(cell.col);

                if (/^\d{4}-\d{2}-\d{2}$/.test(String(cell.value))) {
                     sheetCell.value = new Date(String(cell.value) + 'T00:00:00Z'); // Treat as UTC
                     sheetCell.numFmt = 'dd-mmm-yy';
                } else {
                    const numericValue = getNumericValue(cell.value);
                    if (numericValue !== null) {
                        sheetCell.value = numericValue;
                    } else {
                        sheetCell.value = cell.value;
                    }
                }


                if (cell.style) {
                    const { bold, italic, underline, align, valign, bgColor, textColor, borderTop, borderBottom, borderLeft, borderRight, fontSize } = cell.style;

                    const font: Partial<ExcelJS.Font> = {};
                    if(bold) font.bold = true;
                    if(italic) font.italic = true;
                    if(underline) font.underline = true;
                    if(textColor) font.color = { argb: 'FF' + textColor.substring(1) };
                    if(fontSize) font.size = fontSize;
                    sheetCell.font = font;
                    
                    sheetCell.alignment = {
                        horizontal: align,
                        vertical: valign,
                        wrapText: true,
                    };

                    if (bgColor) {
                        sheetCell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF' + bgColor.substring(1) },
                        };
                    }
                    
                    const borderStyle: ExcelJS.BorderStyle = 'thin';
                    const borderColor = { argb: 'FF374151' }; // A dark gray for borders
                    
                    const border: Partial<ExcelJS.Borders> = {};
                    if(borderTop) border.top = { style: borderStyle, color: borderColor };
                    if(borderLeft) border.left = { style: borderStyle, color: borderColor };
                    if(borderBottom) border.bottom = { style: borderStyle, color: borderColor };
                    if(borderRight) border.right = { style: borderStyle, color: borderColor };
                    sheetCell.border = border;
                }
            });

            // 4. Apply Merges
            dbMerges.forEach(merge => {
                sheet.mergeCells(merge.row, merge.col, merge.row + merge.rowspan - 1, merge.col + merge.colspan - 1);
            });

            // 5. Generate and download file
            const buffer = await workbook.xlsx.writeBuffer();
            const fileName = `${currentBookName.replace(/[\/\\?%*:|"<>]/g, '_')}_export.xlsx`;

            if ((window as any).electronAPI?.saveExcelFile) {
                const result = await (window as any).electronAPI.saveExcelFile({
                    buffer,
                    defaultPath: fileName
                });
                if (!result.success && result.error && !result.error.toLowerCase().includes('cancel')) {
                    throw new Error(result.error);
                }
            } else {
                const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument-spreadsheetml.sheet" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }

        } catch (error) {
            console.error('Export failed:', error);
            addToast('Export failed. ' + (error instanceof Error ? error.message : ''), 'error');
        } finally {
            setIsLoading(false);
        }
    }, [currentBookId, books, columnWidths, addToast]);

    // --- Document Generation Logic ---
    const generateDocument = useCallback(async (type: 'packing-list' | 'invoice', orderToGenerate?: Order, options?: any) => {
        setIsLoading(true);
        addToast(t('views.customsBook.generating' + (type === 'packing-list' ? 'PL' : 'Invoice')), 'info');

        const finalInvoiceOptions = {
            tier: 'tier1' as const,
            currency: 'aed' as const,
            billTo: '', 
            notes: '',
            applyTax: false,
            ...options
        };

        try {
            let productsForDoc: Product[];
            let newBookName: string;
            // Use a map to associate products with their order-specific quantities/cartons
            let itemContextMap = new Map<string, { qty: number; cartons: number }>();

            if (orderToGenerate) {
                newBookName = `${type === 'packing-list' ? 'PL' : 'INV'}-${orderToGenerate.id}`;
                
                // Get the internal codes of items in the order.
                const itemCodesInOrder = orderToGenerate.items
                    .map(item => item.internalCode)
                    .filter((code): code is string => !!code && code.trim() !== '');

                // Get names for items that might be missing a code.
                const itemNamesInOrder = orderToGenerate.items
                    .filter(item => !item.internalCode || item.internalCode.trim() === '')
                    .map(item => item.productName);

                // Find the corresponding finalized products from the database using both codes and names.
                const productsByCode = products.filter(p => itemCodesInOrder.includes(p.internalCode));
                const productsByName = products.filter(p => itemNamesInOrder.includes(p.description));
                
                // Combine and remove duplicates
                const allProductsMap = new Map<string, Product>();
                [...productsByCode, ...productsByName].forEach(p => allProductsMap.set(p.id, p));
                productsForDoc = Array.from(allProductsMap.values());

            } else {
                const { minRow, maxRow, minCol, maxCol } = getRangeBounds(selection.range);
                if (maxCol - minCol !== 1) {
                    throw new Error(t('views.customsBook.selectionErrorTwoCols'));
                }
                const selectionInputData: { code: string, cartons: number }[] = [];
                for (let r = minRow; r <= maxRow; r++) {
                    const rawVal = dataMap.get(`${r}-${minCol}`);
                    const cartons = getNumericValue(dataMap.get(`${r}-${minCol + 1}`));
                    
                    if (rawVal !== null && rawVal !== undefined && cartons !== null && cartons > 0) {
                        let code = String(rawVal).trim();
                        // Intelligent matching: use only the last 6 characters if the code is longer (e.g. "2-112506" -> "112506")
                        if (code.length > 6) {
                            code = code.slice(-6);
                        }
                        selectionInputData.push({ code, cartons });
                    }
                }
                if(selectionInputData.length === 0) throw new Error(t('views.customsBook.selectionErrorNoData'));
                
                // Populate map with both internalCode and oldSystemCode for flexible matching
                const productMap = new Map<string, Product>();
                products.forEach(p => {
                    if (p.internalCode) {
                        const trimmedCode = p.internalCode.trim();
                        // Also store the trimmed last 6 chars for matching
                        if (trimmedCode.length > 6) {
                            productMap.set(trimmedCode.slice(-6), p);
                        }
                        productMap.set(trimmedCode, p);
                    }
                    if (p.oldSystemCode) {
                        const trimmedOldCode = p.oldSystemCode.trim();
                        // Also store the trimmed last 6 chars for matching
                        if (trimmedOldCode.length > 6) {
                            productMap.set(trimmedOldCode.slice(-6), p);
                        }
                        productMap.set(trimmedOldCode, p);
                    }
                });
                
                productsForDoc = selectionInputData.map(i => productMap.get(i.code)).filter(Boolean) as Product[];

                productsForDoc.forEach(product => {
                    // Try to match the input code against product codes, checking full and last-6 variations
                    const input = selectionInputData.find(i => {
                        const pCode = product.internalCode?.trim();
                        const pOldCode = product.oldSystemCode?.trim();
                        
                        return i.code === pCode || 
                               i.code === pOldCode ||
                               (pCode && pCode.length > 6 && i.code === pCode.slice(-6)) ||
                               (pOldCode && pOldCode.length > 6 && i.code === pOldCode.slice(-6));
                    });
                    
                    if (input) {
                        const cartons = input.cartons;
                        const qty = (product.itemsPerCarton || 0) * cartons;
                        itemContextMap.set(product.id, { qty, cartons });
                    }
                });

                newBookName = `${type === 'packing-list' ? 'PL' : 'INV'}-${new Date().toISOString().slice(5, 16).replace('T', '-').replace(/:/g, '-')}`;
            }

            if (productsForDoc.length === 0) {
                throw new Error(t('views.customsBook.selectionErrorNoData'));
            }

            const newBook: CustomsBook = { id: crypto.randomUUID(), name: newBookName };
            await db.customsBooks.add(newBook);

            const cellsToPut: CustomsBookCell[] = [];
            const mergesToPut: CustomsBookMerge[] = [];
            
            // --- Styles ---
            const STYLE_H1: CellStyle = { bold: true, fontSize: 20, align: 'center', valign: 'middle' };
            const STYLE_LABEL: CellStyle = { bold: true, align: 'right' };
            const STYLE_TABLE_HEADER: CellStyle = { bold: true, align: 'center', valign: 'middle', bgColor: '#E5E7EB', borderTop: '1px solid #9CA3AF', borderBottom: '1px solid #9CA3AF', borderLeft: '1px solid #9CA3AF', borderRight: '1px solid #9CA3AF' };
            const BORDER_STYLE = '1px solid #D1D5DB';
            const STYLE_TEXT_CELL: CellStyle = { align: 'left', valign: 'middle', borderTop: BORDER_STYLE, borderBottom: BORDER_STYLE, borderLeft: BORDER_STYLE, borderRight: BORDER_STYLE };
            const STYLE_NUMBER_CELL: CellStyle = { align: 'right', valign: 'middle', borderTop: BORDER_STYLE, borderBottom: BORDER_STYLE, borderLeft: BORDER_STYLE, borderRight: BORDER_STYLE };
            const STYLE_TOTAL: CellStyle = { bold: true, bgColor: '#F3F4F6', borderTop: '2px solid #9CA3AF', borderBottom: BORDER_STYLE, borderLeft: BORDER_STYLE, borderRight: BORDER_STYLE, align: 'right', valign: 'middle' };
            const STYLE_TOTAL_LABEL: CellStyle = { ...STYLE_TOTAL, align: 'right' };

            // --- Formatters ---
            const numFormatter = new Intl.NumberFormat('en-US');
            const decFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            
            let maxCols = type === 'packing-list' ? 13 : 9;

            // --- HEADER ---
            // FIX: Handle CompanyInfo object
            const isFarsi = i18n.language === 'fa';
            const infoText = companyInfo
                ? (typeof companyInfo === 'string'
                    ? companyInfo
                    : (isFarsi && companyInfo.fa ? companyInfo.fa : companyInfo.en))
                : 'NEWLAND HOUSEHOLD TRADING CO.L.L.C\nP.O.BOX:3356\nEmail: sinamehr.co@gmail.com\nTel: 052-7703021';

            const [companyName, ...addressLines] = infoText.split('\n');
            const companyAddress = addressLines.join('\n');

            let currentRow = 1;

            cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 1, value: companyName, style: STYLE_H1 });
            mergesToPut.push({ bookId: newBook.id, row: currentRow, col: 1, rowspan: 1, colspan: maxCols });
            currentRow++;

            if (companyAddress) {
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 1, value: companyAddress, style: { ...STYLE_H1, fontSize: 9, bold: false, align: 'center', valign: 'top' } });
                mergesToPut.push({ bookId: newBook.id, row: currentRow, col: 1, rowspan: 1, colspan: maxCols });
                currentRow++;
            }
            currentRow++; // Spacer

            const docTitle = type === 'packing-list' ? "PACKING LIST" : "INVOICE";
            cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 1, value: docTitle, style: { ...STYLE_H1, fontSize: 18 } });
            mergesToPut.push({ bookId: newBook.id, row: currentRow, col: 1, rowspan: 1, colspan: maxCols });
            currentRow += 2; // Spacer

            const today = new Date();
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
            const todayString = `${today.getDate()}-${monthNames[today.getMonth()]}-${String(today.getFullYear()).slice(-2)}`;

            
            if (type === 'packing-list') {
                 // RIGHT SIDE INFO for Packing List
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: maxCols - 2, value: "Date:", style: STYLE_LABEL });
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: maxCols - 1, value: todayString, style: { align: 'left' } });
                mergesToPut.push({ bookId: newBook.id, row: currentRow, col: maxCols - 1, rowspan: 1, colspan: 2 });

                cellsToPut.push({ bookId: newBook.id, row: currentRow + 1, col: maxCols - 2, value: "No:", style: STYLE_LABEL });
                cellsToPut.push({ bookId: newBook.id, row: currentRow + 1, col: maxCols - 1, value: orderToGenerate?.id || "N/A", style: { align: 'left' } });
                mergesToPut.push({ bookId: newBook.id, row: currentRow + 1, col: maxCols - 1, rowspan: 1, colspan: 2 });
                
                const leftAlignedLabelStyle: CellStyle = { ...STYLE_LABEL, align: 'left' };

                // For Packing List, these labels are in columns I and J
                cellsToPut.push({ bookId: newBook.id, row: currentRow + 2, col: 9, value: "DESTINATION:", style: leftAlignedLabelStyle }); // col 9 is 'I'
                mergesToPut.push({ bookId: newBook.id, row: currentRow + 2, col: 9, rowspan: 1, colspan: 2 }); // merge I, J

                cellsToPut.push({ bookId: newBook.id, row: currentRow + 3, col: 9, value: "COUNTRY OF ORIGIN:", style: leftAlignedLabelStyle }); // col 9 is 'I'
                mergesToPut.push({ bookId: newBook.id, row: currentRow + 3, col: 9, rowspan: 1, colspan: 2 }); // merge I, J
                cellsToPut.push({ bookId: newBook.id, row: currentRow + 3, col: 11, value: "CHINA", style: { align: 'left' } }); // value in K
                
                // LEFT SIDE INFO
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 1, value: "DUBAI, UAE" });
                mergesToPut.push({ bookId: newBook.id, row: currentRow, col: 1, rowspan: 1, colspan: 2 });
                cellsToPut.push({ bookId: newBook.id, row: currentRow + 1, col: 1, value: "TO:", style: {bold: true} });
            } else { // invoice
                // RIGHT SIDE INFO for Invoice
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: maxCols - 1, value: "Date:", style: STYLE_LABEL });
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: maxCols, value: todayString, style: { align: 'left' } });

                cellsToPut.push({ bookId: newBook.id, row: currentRow + 1, col: maxCols - 1, value: "No:", style: STYLE_LABEL });
                cellsToPut.push({ bookId: newBook.id, row: currentRow + 1, col: maxCols, value: orderToGenerate?.id || "N/A", style: { align: 'left' } });
                
                // LEFT SIDE INFO for Invoice
                const leftAlignedLabelStyle: CellStyle = { ...STYLE_LABEL, align: 'left' };

                cellsToPut.push({ bookId: newBook.id, row: currentRow + 2, col: 6, value: "DESTINATION:", style: leftAlignedLabelStyle }); // F
                mergesToPut.push({ bookId: newBook.id, row: currentRow + 2, col: 6, rowspan: 1, colspan: 2 }); // F,G

                cellsToPut.push({ bookId: newBook.id, row: currentRow + 3, col: 6, value: "COUNTRY OF ORIGIN:", style: leftAlignedLabelStyle }); // F
                mergesToPut.push({ bookId: newBook.id, row: currentRow + 3, col: 6, rowspan: 1, colspan: 2 }); // F,G
                cellsToPut.push({ bookId: newBook.id, row: currentRow + 3, col: 8, value: "CHINA", style: { align: 'left' } }); // H
                
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 1, value: "DUBAI, UAE" });
                mergesToPut.push({ bookId: newBook.id, row: currentRow, col: 1, rowspan: 1, colspan: 2 });
                cellsToPut.push({ bookId: newBook.id, row: currentRow + 1, col: 1, value: "TO:", style: {bold: true} });
                if (finalInvoiceOptions.billTo) {
                    cellsToPut.push({ bookId: newBook.id, row: currentRow + 2, col: 1, value: finalInvoiceOptions.billTo, style: { valign: 'top' } });
                    mergesToPut.push({ bookId: newBook.id, row: currentRow + 2, col: 1, rowspan: 2, colspan: 4 });
                }
            }


            currentRow += 5;

            // --- TABLE HEADERS ---
            let headers: { label: string, col: number, width?: number, children?: {label: string, col: number, width?: number}[] }[] = [];

            if(type === 'packing-list') {
                maxCols = 13;
                headers = [
                    { label: "No", col: 1, width: 35 }, { label: "Item Number", col: 2, width: 150 }, { label: "Description", col: 3, width: 310 }, { label: "HS Code", col: 4, width: 120 },
                    { label: "QTY", col: 5, children: [{label: "CTN", col: 5, width: 70}, {label: "QTY/CTN", col: 6, width: 70}, {label: "QTY", col: 7, width: 70}] },
                    { label: "Weight", col: 8, children: [{label: "N.W.", col: 8, width: 80}, {label: "G.W.", col: 9, width: 80}] },
                    { label: "Volume", col: 10, children: [{label: "CBM/CTN", col: 10, width: 80}, {label: "Total CBM", col: 11, width: 100}] },
                    { label: "Total Weight", col: 12, children: [{label: "Total N.W.", col: 12, width: 100}, {label: "Total G.W.", col: 13, width: 100}] },
                ];
            } else { // invoice
                maxCols = 9;
                headers = [
                    { label: "No", col: 1, width: 35 }, { label: "Item Number", col: 2, width: 150 }, { label: "Description", col: 3, width: 310 }, { label: "HS Code", col: 4, width: 120 },
                    { label: "QTY", col: 5, children: [{label: "CTN", col: 5, width: 70}, {label: "QTY/CTN", col: 6, width: 70}, {label: "QTY", col: 7, width: 70}] },
                    { label: "FOB PRICE", col: 8, width: 120 }, { label: "TOTAL AMOUNT", col: 9, width: 150 },
                ];
            }
            
            const hasSubHeaders = headers.some(h => h.children);
            if (hasSubHeaders) {
                headers.forEach(h => {
                    const colSpan = h.children ? h.children.length : 1;
                    cellsToPut.push({ bookId: newBook.id, row: currentRow, col: h.col, value: h.label, style: STYLE_TABLE_HEADER });
                    mergesToPut.push({ bookId: newBook.id, row: currentRow, col: h.col, rowspan: h.children ? 1 : 2, colspan: colSpan });
                    h.children?.forEach(sh => {
                        cellsToPut.push({ bookId: newBook.id, row: currentRow + 1, col: sh.col, value: sh.label, style: STYLE_TABLE_HEADER });
                    });
                });
                currentRow += 2;
            } else {
                 headers.forEach(h => {
                    cellsToPut.push({ bookId: newBook.id, row: currentRow, col: h.col, value: h.label, style: STYLE_TABLE_HEADER });
                });
                currentRow++;
            }
            
            // --- DATA ROWS ---
            let totalCartons = 0, totalNetWeight = 0, totalGrossWeight = 0, totalVolume = 0, subtotal = 0, totalQty = 0;

            productsForDoc.forEach((product, index) => {
                const orderItem = orderToGenerate 
                    ? orderToGenerate.items.find(i => (i.internalCode && i.internalCode === product.internalCode) || (!i.internalCode && i.productName === product.description))
                    : null;
                
                let qty: number;
                let actualTotalCartons: number;
                let actualItemsPerCarton: number;

                if (orderToGenerate && orderItem) {
                    qty = orderItem.quantity;
                    const enteredDbItemsPerCarton = product.itemsPerCarton > 0 ? product.itemsPerCarton : 1;
                    actualItemsPerCarton = orderItem.itemsPerCarton; // Use order item data
                    actualTotalCartons = Math.ceil(qty / actualItemsPerCarton);
                } else {
                    const itemCtx = itemContextMap.get(product.id);
                    if (!itemCtx) return; 
                    
                    actualTotalCartons = itemCtx.cartons; 
                    actualItemsPerCarton = product.itemsPerCarton || 0; 
                    qty = actualTotalCartons * actualItemsPerCarton; 
                }
                
                const netWeight = (product.netWeight || 0) * actualTotalCartons;
                const grossWeight = (product.grossWeight || 0) * actualTotalCartons;
                const volume = (product.cartonCBM || 0) * actualTotalCartons;
                const unitPrice = (type === 'invoice') ? product.sellingPrices[finalInvoiceOptions.currency][finalInvoiceOptions.tier] : product.purchasePriceUSD;
                const amount = unitPrice * qty;

                totalCartons += actualTotalCartons;
                totalQty += qty;
                totalNetWeight += netWeight;
                totalGrossWeight += grossWeight;
                totalVolume += volume;
                subtotal += amount;

                const values = type === 'packing-list'
                    ? [ index + 1, product.internalCode, product.description, product.hsCode, actualTotalCartons, actualItemsPerCarton, qty, product.netWeight || 0, product.grossWeight || 0, product.cartonCBM || 0, volume, netWeight, grossWeight ]
                    : [ index + 1, product.internalCode, product.description, product.hsCode, actualTotalCartons, actualItemsPerCarton, qty, unitPrice, amount ];
                
                const formats = type === 'packing-list'
                    ? [ 'num', 'text', 'text', 'text', 'num', 'num', 'num', 'dec', 'dec', 'dec3', 'dec3', 'dec', 'dec' ]
                    : [ 'num', 'text', 'text', 'text', 'num', 'num', 'num', 'dec', 'dec' ];

                values.forEach((val, colIdx) => {
                    const formatType = formats[colIdx];
                    const style = formatType === 'text' ? STYLE_TEXT_CELL : STYLE_NUMBER_CELL;
                    let formattedValue;
                    if (formatType === 'dec') formattedValue = decFormatter.format(val as number);
                    else if (formatType === 'dec3') formattedValue = (val as number).toFixed(3);
                    else if (formatType === 'num') formattedValue = numFormatter.format(val as number);
                    else formattedValue = val;
                    
                    cellsToPut.push({ bookId: newBook.id, row: currentRow, col: colIdx + 1, value: formattedValue, style });
                });
                currentRow++;
            });
            
            // --- TOTAL ROWS ---
            if (type === 'packing-list') {
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 1, value: "TOTAL", style: STYLE_TOTAL_LABEL});
                mergesToPut.push({ bookId: newBook.id, row: currentRow, col: 1, rowspan: 1, colspan: 4});
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 5, value: numFormatter.format(totalCartons), style: STYLE_TOTAL });
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 6, value: '', style: STYLE_TOTAL });
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 7, value: numFormatter.format(totalQty), style: STYLE_TOTAL });
                for(let c of [8, 9, 10]) { cellsToPut.push({ bookId: newBook.id, row: currentRow, col: c, value: '', style: STYLE_TOTAL }); }
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 11, value: totalVolume.toFixed(3), style: STYLE_TOTAL });
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 12, value: decFormatter.format(totalNetWeight), style: STYLE_TOTAL });
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 13, value: decFormatter.format(totalGrossWeight), style: STYLE_TOTAL });
            } else { // invoice
                currentRow++;
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: maxCols - 1, value: "Subtotal:", style: STYLE_LABEL });
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: maxCols, value: decFormatter.format(subtotal), style: STYLE_NUMBER_CELL });
                currentRow++;

                let total = subtotal;
                if (finalInvoiceOptions.applyTax && costingSettings) {
                    const vatSetting = costingSettings.vat[finalInvoiceOptions.currency];
                    if (vatSetting) {
                        const taxAmount = subtotal * (vatSetting.value / 100);
                        total += taxAmount;
                        cellsToPut.push({ bookId: newBook.id, row: currentRow, col: maxCols - 1, value: `Tax (${vatSetting.value}%):`, style: STYLE_LABEL });
                        cellsToPut.push({ bookId: newBook.id, row: currentRow, col: maxCols, value: decFormatter.format(taxAmount), style: STYLE_NUMBER_CELL });
                        currentRow++;
                    }
                }

                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: maxCols - 1, value: "Total:", style: STYLE_TOTAL_LABEL });
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: maxCols, value: decFormatter.format(total), style: STYLE_TOTAL });
                currentRow+=2;

                const totalInWords = numberToWords(total, finalInvoiceOptions.currency.toUpperCase() as 'AED' | 'TOMAN');
                cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 1, value: totalInWords, style: { bold: true, italic: true, valign: 'middle' } });
                mergesToPut.push({ bookId: newBook.id, row: currentRow, col: 1, rowspan: 1, colspan: maxCols });
                currentRow++;

                 if (finalInvoiceOptions.notes) {
                    cellsToPut.push({ bookId: newBook.id, row: currentRow, col: 1, value: `Notes: ${finalInvoiceOptions.notes}`, style: { valign: 'top' } });
                    mergesToPut.push({ bookId: newBook.id, row: currentRow, col: 1, rowspan: 2, colspan: maxCols });
                }
            }


            const newColumnWidths: Record<number, number> = {};
            const allHeaders = headers.flatMap(h => h.children ? h.children : [h]);
            allHeaders.forEach(h => {
                if(h.width) newColumnWidths[h.col] = h.width;
            });
            setColumnWidths(newColumnWidths);

            await db.customsBookCells.bulkPut(cellsToPut);
            await db.customsBookMerges.bulkPut(mergesToPut);
            setCurrentBookId(newBook.id);
            addToast(t('views.customsBook.generationSuccess', { docTitle: docTitle }), 'success');

        } catch (e) {
            console.error("Document generation failed:", e);
            addToast(e instanceof Error ? e.message : "An unknown error occurred.", 'error');
        } finally {
            setIsLoading(false);
        }
    }, [selection.range, dataMap, products, addToast, companyInfo, costingSettings, t, i18n]);

    useEffect(() => {
        if (documentToGenerate && products && products.length > 0 && costingSettings) {
            generateDocument(documentToGenerate.type, documentToGenerate.order, documentToGenerate.options);
            onDocumentGenerated();
        }
    }, [documentToGenerate, onDocumentGenerated, generateDocument, products, costingSettings]);

    const handleGeneratePackingList = () => generateDocument('packing-list');
    const handleGenerateInvoice = () => generateDocument('invoice');

    // --- Search Logic ---
    useEffect(() => {
        if (!searchQuery) {
            setSearchResults([]);
            setCurrentResultIndex(-1);
            return;
        }
        const lowerCaseQuery = searchQuery.toLowerCase();
        const results = (cells || [])
            .filter(cell => {
                let valueToSearch = cell.value;
                if (typeof valueToSearch === 'string' && valueToSearch.startsWith('=')) {
                    valueToSearch = evaluateFormula(valueToSearch, dataMap);
                }
                
                const cellValueString = String(valueToSearch).toLowerCase();
                const query = lowerCaseQuery;

                if (/^-?\d+(\.\d+)?$/.test(query)) {
                    try {
                        const escapedQuery = query.replace('.', '\\.');
                        const regex = new RegExp(`\\b${escapedQuery}(?![.\\d])`);
                        return regex.test(cellValueString);
                    } catch (e) {
                        return cellValueString.includes(query);
                    }
                } else {
                    return cellValueString.includes(query);
                }
            })
            .map(cell => ({ row: cell.row, col: cell.col }))
            .sort((a, b) => a.row - b.row || a.col - b.col);

        setSearchResults(results);
        const newIndex = results.length > 0 ? 0 : -1;
        setCurrentResultIndex(newIndex);
         if (newIndex !== -1) {
            const active = results[newIndex];
            setSelection({ active, range: { start: active, end: active } });
            setCenterOnScrollTo(active);
        }
    }, [searchQuery, cells, dataMap]);

    const handleSearchNavigate = (direction: 'next' | 'prev') => {
        if (searchResults.length === 0) return;
        const newIndex = direction === 'next'
            ? (currentResultIndex + 1) % searchResults.length
            : (currentResultIndex - 1 + searchResults.length) % searchResults.length;
        setCurrentResultIndex(newIndex);
        const active = searchResults[newIndex];
        setSelection({ active: active, range: { start: active, end: active } });
        setCenterOnScrollTo(active);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearchNavigate(e.shiftKey ? 'prev' : 'next');
        }
    };
    
    // --- Undo/Redo Logic ---
    const handleUndo = useCallback(async () => {
        const lastAction = undoStack.find(a => a.bookId === currentBookId);
        if (!lastAction) return;
        setUndoStack(prev => prev.filter(a => a !== lastAction));
        setRedoStack(prev => [...prev, lastAction]);
    
        const beforeCells = lastAction.before.filter(item => 'col' in item) as CustomsBookCell[];
        const afterCells = lastAction.after.filter(item => 'col' in item) as CustomsBookCell[];
        const beforeHeights = lastAction.before.filter(item => 'height' in item) as CustomsBookRowHeight[];
        const afterHeights = lastAction.after.filter(item => 'height' in item) as CustomsBookRowHeight[];
        const beforeMerges = lastAction.before.filter(item => 'rowspan' in item) as CustomsBookMerge[];
        const afterMerges = lastAction.after.filter(item => 'rowspan' in item) as CustomsBookMerge[];

        await db.transaction('rw', db.customsBookCells, db.customsBookRowHeights, db.customsBookMerges, async () => {
            if (afterCells.length > 0) await db.customsBookCells.bulkDelete(afterCells.map(c => [c.bookId, c.row, c.col]));
            if (beforeCells.length > 0) await db.customsBookCells.bulkPut(beforeCells);
            if (afterHeights.length > 0) await db.customsBookRowHeights.bulkDelete(afterHeights.map(h => [h.bookId, h.row]));
            if (beforeHeights.length > 0) await db.customsBookRowHeights.bulkPut(beforeHeights);
            if (afterMerges.length > 0) await db.customsBookMerges.bulkDelete(afterMerges.map(m => [m.bookId, m.row, m.col]));
            if (beforeMerges.length > 0) await db.customsBookMerges.bulkPut(beforeMerges);
        });
    }, [undoStack, currentBookId]);

    const handleRedo = useCallback(async () => {
        const lastAction = redoStack.find(a => a.bookId === currentBookId);
        if (!lastAction) return;
        setRedoStack(prev => prev.filter(a => a !== lastAction));
        setUndoStack(prev => [...prev, lastAction]);

        const beforeCells = lastAction.before.filter(item => 'col' in item) as CustomsBookCell[];
        const afterCells = lastAction.after.filter(item => 'col' in item) as CustomsBookCell[];
        const beforeHeights = lastAction.before.filter(item => 'height' in item) as CustomsBookRowHeight[];
        const afterHeights = lastAction.after.filter(item => 'height' in item) as CustomsBookRowHeight[];
        const beforeMerges = lastAction.before.filter(item => 'rowspan' in item) as CustomsBookMerge[];
        const afterMerges = lastAction.after.filter(item => 'rowspan' in item) as CustomsBookMerge[];

        await db.transaction('rw', db.customsBookCells, db.customsBookRowHeights, db.customsBookMerges, async () => {
            if (beforeCells.length > 0) await db.customsBookCells.bulkDelete(beforeCells.map(c => [c.bookId, c.row, c.col]));
            if (afterCells.length > 0) await db.customsBookCells.bulkPut(afterCells);
            if (beforeHeights.length > 0) await db.customsBookRowHeights.bulkDelete(beforeHeights.map(h => [h.bookId, h.row]));
            if (afterHeights.length > 0) await db.customsBookRowHeights.bulkPut(afterHeights);
            if (beforeMerges.length > 0) await db.customsBookMerges.bulkDelete(beforeMerges.map(m => [m.bookId, m.row, m.col]));
            if (afterMerges.length > 0) await db.customsBookMerges.bulkPut(afterMerges);
        });
    }, [redoStack, currentBookId]);
    
    // --- Core Interaction Handlers ---
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setContextMenu(null); // Close context menu on scroll
        const { scrollTop, scrollLeft } = e.currentTarget;
        setScrollPos({ top: scrollTop, left: scrollLeft });

        // Sync headers and frozen panes
        if(colHeaderRef.current) colHeaderRef.current.scrollLeft = scrollLeft;
        if(rowHeaderRef.current) rowHeaderRef.current.scrollTop = scrollTop;
        if(frozenRowsRef.current) frozenRowsRef.current.scrollLeft = scrollLeft;
        if(frozenColsRef.current) frozenColsRef.current.scrollTop = scrollTop;
    };
    
    const finishEditing = useCallback(async (moveNext?: 'down' | 'right' | 'up' | 'left') => {
        if (!editingCell || !currentBookId) return;

        const finalEditValue = editorContent;
        const { row, col } = editingCell;
        const cellFromDb = await db.customsBookCells.get([currentBookId, row, col]);
        const currentValue = cellFromDb?.value ?? '';
        
        const beforeState = cellFromDb ? [cellFromDb] : [];

        if (String(currentValue) !== finalEditValue) {
            if (finalEditValue.trim() === '' && !cellFromDb?.style) {
                 if (currentValue) {
                    await db.customsBookCells.delete([currentBookId, row, col]);
                    pushUndoAction({ before: beforeState, after: [] });
                }
            } else {
                const newCell: CustomsBookCell = { ...(cellFromDb || {}), bookId: currentBookId, row, col, value: finalEditValue };
                await db.customsBookCells.put(newCell);
                pushUndoAction({ before: beforeState, after: [newCell] });
            }
        }

        setEditingCell(null);
        setEditorContent('');

        if (moveNext) {
            let newRow = row;
            let newCol = col;
            if(moveNext === 'down') newRow = Math.min(NUM_ROWS, row + 1);
            if(moveNext === 'up') newRow = Math.max(1, row - 1);
            if(moveNext === 'right') newCol = Math.min(NUM_COLS, col + 1);
            if(moveNext === 'left') newCol = Math.max(1, col - 1);
            const newActive = { row: newRow, col: newCol };
            setSelection({ active: newActive, range: { start: newActive, end: newActive } });
        }
    }, [editingCell, editorContent, pushUndoAction, currentBookId]);

    const startEditing = useCallback((row: number, col: number, initialValue?: string) => {
        if (editingCell) finishEditing();
        const value = dataMap.get(`${row}-${col}`) ?? '';
        const editContent = initialValue ? persianArabicToEnglish(initialValue) : String(value);
        setEditorContent(editContent);
        const active = { row, col };
        setSelection({ active, range: { start: active, end: active } });
        setEditingCell(active);
    }, [editingCell, dataMap, finishEditing]);
    
    const updateFormulaWithRange = useCallback((range: SelectionRange) => {
        if (!formulaSelection) return;
        const rangeStr = rangeToHeaderString(range);
        const { initialFormula, selectionStart, selectionEnd } = formulaSelection;
        const newFormula = initialFormula.slice(0, selectionStart) + rangeStr + initialFormula.slice(selectionEnd);
        setEditorContent(newFormula);
    }, [formulaSelection]);

    const handleClearSelection = useCallback(async () => {
        if (!currentBookId) return;
        const { minRow, maxRow, minCol, maxCol } = getRangeBounds(selection.range);
        const keysToFetch: [string, number, number][] = [];
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                keysToFetch.push([currentBookId, r, c]);
            }
        }
        const beforeState = (await db.customsBookCells.bulkGet(keysToFetch)).filter(Boolean) as CustomsBookCell[];
        if (beforeState.length === 0) return;

        const cellsToPut: CustomsBookCell[] = [];
        const keysToDelete: [string, number, number][] = [];

        for (const cell of beforeState) {
            const hasStyle = cell.style && Object.keys(cell.style).length > 0 && Object.values(cell.style).some(v => v);
            if (hasStyle) {
                cellsToPut.push({ ...cell, value: '' });
            } else {
                keysToDelete.push([cell.bookId, cell.row, cell.col]);
            }
        }
        if (cellsToPut.length === 0 && keysToDelete.length === 0) return;

        await db.transaction('rw', db.customsBookCells, async () => {
            if (keysToDelete.length > 0) await db.customsBookCells.bulkDelete(keysToDelete);
            if (cellsToPut.length > 0) await db.customsBookCells.bulkPut(cellsToPut);
        });
        pushUndoAction({ before: beforeState, after: cellsToPut });
    }, [currentBookId, selection.range, pushUndoAction]);
    
    const handleApplyStyle = useCallback(async (styleChange: StyleChange) => {
        if (!currentBookId) return;
    
        const { minRow, maxRow, minCol, maxCol } = getRangeBounds(selection.range);
    
        await db.transaction('rw', db.customsBookMerges, db.customsBookCells, async () => {
            if (styleChange.merge === 'toggle') {
                const { active } = selection;
                const mergeToUnmerge = findMergeInfo(active.row, active.col);
        
                if (mergeToUnmerge) {
                    await db.customsBookMerges.delete([currentBookId, mergeToUnmerge.row, mergeToUnmerge.col]);
                    pushUndoAction({ before: [mergeToUnmerge], after: [] });
                } else if (maxRow > minRow || maxCol > minCol) {
                    const newMergeRange = { r1: minRow, c1: minCol, r2: maxRow, c2: maxCol };
                    const overlappingMerges = (merges || []).filter(m => {
                        const existing = { r1: m.row, c1: m.col, r2: m.row + m.rowspan - 1, c2: m.col + m.colspan - 1 };
                        return newMergeRange.r1 <= existing.r2 && newMergeRange.r2 >= existing.r1 &&
                               newMergeRange.c1 <= existing.c2 && newMergeRange.c2 >= existing.r1;
                    });
        
                    const newMerge: CustomsBookMerge = { bookId: currentBookId, row: minRow, col: minCol, rowspan: maxRow - minRow + 1, colspan: maxCol - minCol + 1 };
                    
                    const cellsToClear = await db.customsBookCells.where('bookId').equals(currentBookId)
                        .and(c => c.row >= minRow && c.row <= maxRow && c.col >= minCol && c.col <= maxCol && !(c.row === minRow && c.col === minCol))
                        .toArray();
        
                    if (overlappingMerges.length > 0) {
                        await db.customsBookMerges.bulkDelete(overlappingMerges.map(m => [m.bookId, m.row, m.col]));
                    }
                    if (cellsToClear.length > 0) {
                        await db.customsBookCells.bulkDelete(cellsToClear.map(c => [c.bookId, c.row, c.col]));
                    }
                    await db.customsBookMerges.put(newMerge);
        
                    pushUndoAction({ before: [...overlappingMerges, ...cellsToClear], after: [newMerge] });
                }
                return;
            }
        
            const cellKeys: [string, number, number][] = [];
            for (let r = minRow; r <= maxRow; r++) {
                for (let c = minCol; c <= maxCol; c++) {
                    cellKeys.push([currentBookId, r, c]);
                }
            }
        
            const beforeState = await db.customsBookCells.bulkGet(cellKeys);
            const afterState: CustomsBookCell[] = [];
        
            for (let r = minRow; r <= maxRow; r++) {
                for (let c = minCol; c <= maxCol; c++) {
                    const existing = beforeState.find(cell => cell && cell.row === r && cell.col === c);
                    const newStyle = { ...(existing?.style || {}) };
        
                    if (styleChange.bold === 'toggle') newStyle.bold = !newStyle.bold;
                    if (styleChange.italic === 'toggle') newStyle.italic = !newStyle.italic;
                    if (styleChange.underline === 'toggle') newStyle.underline = !newStyle.underline;
        
                    if (styleChange.align) newStyle.align = styleChange.align;
                    if (styleChange.valign) newStyle.valign = styleChange.valign;
                    if (styleChange.bgColor) newStyle.bgColor = newStyle.bgColor === styleChange.bgColor ? undefined : styleChange.bgColor;
                    if (styleChange.textColor) newStyle.textColor = newStyle.textColor === styleChange.textColor ? undefined : styleChange.textColor;
                    if ('fontSize' in styleChange) newStyle.fontSize = styleChange.fontSize;
        
                    if (styleChange.borders) {
                        const borderStyle = '1px solid #000';
                        const bordersToRemove = ['borderTop', 'borderBottom', 'borderLeft', 'borderRight'];
                        for (const key of bordersToRemove) delete (newStyle as any)[key];
        
                        if (styleChange.borders !== 'none') {
                            if (styleChange.borders === 'all') {
                                newStyle.borderTop = borderStyle; newStyle.borderBottom = borderStyle; newStyle.borderLeft = borderStyle; newStyle.borderRight = borderStyle;
                            } else if (styleChange.borders === 'outside') {
                                if (r === minRow) newStyle.borderTop = borderStyle;
                                if (r === maxRow) newStyle.borderBottom = borderStyle;
                                if (c === minCol) newStyle.borderLeft = borderStyle;
                                if (c === maxCol) newStyle.borderRight = borderStyle;
                            } else {
                                (newStyle as any)[`border${styleChange.borders.charAt(0).toUpperCase() + styleChange.borders.slice(1)}`] = borderStyle;
                            }
                        }
                    }
                    
                    const finalStyle = Object.values(newStyle).some(v => v !== undefined && v !== false && v !== '') ? newStyle : undefined;
    
                    const updatedCell: CustomsBookCell = {
                        bookId: currentBookId, row: r, col: c,
                        value: existing?.value ?? '',
                        style: finalStyle,
                    };
                    afterState.push(updatedCell);
                }
            }
            await db.customsBookCells.bulkPut(afterState);
            pushUndoAction({ before: beforeState.filter(Boolean) as CustomsBookCell[], after: afterState });
        });
    }, [selection, currentBookId, pushUndoAction, merges, findMergeInfo]);
    
    const executeAutoFitCol = useCallback(async (col: number) => {
        if (!currentBookId) return;
        setIsLoading(true);
        try {
            const cellsInCol = await db.customsBookCells.where({ bookId: currentBookId, col }).toArray();
            const textMeasureEl = textMeasureRef.current;
            if (!textMeasureEl) return;
            let maxWidth = 0;
            
            const headerText = colIndexToHeader(col - 1);
            textMeasureEl.style.fontWeight = 'bold';
            textMeasureEl.textContent = headerText;
            maxWidth = textMeasureEl.offsetWidth;
            textMeasureEl.style.fontWeight = 'normal';
    
            for (const cell of cellsInCol) {
                if (cell.value !== null && cell.value !== undefined) {
                    textMeasureEl.textContent = String(cell.value);
                    const width = textMeasureEl.offsetWidth;
                    if (width > maxWidth) maxWidth = width;
                }
            }
    
            const newWidth = Math.max(50, maxWidth + 20); // padding
            setColumnWidths(prev => ({ ...prev, [col]: newWidth }));
        } catch (error) {
            console.error("Autofit failed:", error);
            addToast("Could not auto-fit column.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [addToast, currentBookId]);

    const handleAutoFitCol = useCallback(async (e: React.MouseEvent, col: number) => {
        e.preventDefault();
        e.stopPropagation();
        await executeAutoFitCol(col);
    }, [executeAutoFitCol]);

    const performAction = useCallback(async (action: string) => {
        if (!currentBookId) return;
        setContextMenu(null);

        if (action === 'autoFitCol' && contextMenu && contextMenu.type === 'col') {
            await executeAutoFitCol(contextMenu.index);
            return;
        }

        if (action.startsWith('clearContents')) {
            await handleClearSelection();
            return;
        }

        if (action.startsWith('freeze')) {
            if (frozenAt) {
                setFrozenAt(null);
            } else {
                setFrozenAt({ row: selection.active.row, col: selection.active.col });
            }
            return;
        }

        if (action === 'cut') { await cut(); return; }
        if (action === 'copy') { await copy(); return; }
        if (action === 'paste') { await paste(); return; }
    
        setIsLoading(true);
        try {
            await db.transaction('rw', db.customsBookCells, db.customsBookMerges, async () => {
                const { range } = selection;
                const { minRow, maxRow, minCol, maxCol } = getRangeBounds(range);
                let beforeState: UndoableItem[] = [];
                let afterState: UndoableItem[] = [];
    
                const applyChanges = async () => {
                     const beforeCells = beforeState.filter(item => 'col' in item) as CustomsBookCell[];
                     const afterCells = afterState.filter(item => 'col' in item) as CustomsBookCell[];
                     const beforeMerges = beforeState.filter(item => 'rowspan' in item) as CustomsBookMerge[];
                     const afterMerges = afterState.filter(item => 'rowspan' in item) as CustomsBookMerge[];

                    if (beforeCells.length > 0) await db.customsBookCells.bulkDelete(beforeCells.map(c => [c.bookId, c.row, c.col]));
                    if (afterCells.length > 0) await db.customsBookCells.bulkPut(afterCells);
                    if (beforeMerges.length > 0) await db.customsBookMerges.bulkDelete(beforeMerges.map(m => [m.bookId, m.row, m.col]));
                    if (afterMerges.length > 0) await db.customsBookMerges.bulkPut(afterMerges);
                    
                    pushUndoAction({ before: beforeState, after: afterState });
                };
    
                switch (action) {
                     case 'insertRow': {
                        const numRows = maxRow - minRow + 1;
                        const cellsToShift = await db.customsBookCells.where({ bookId: currentBookId }).and(c => c.row >= minRow).toArray();
                        const mergesToShift = await db.customsBookMerges.where({ bookId: currentBookId }).and(m => m.row >= minRow).toArray();
                        const mergesToExpand = await db.customsBookMerges.where({ bookId: currentBookId }).and(m => m.row < minRow && m.row + m.rowspan > minRow).toArray();

                        beforeState = [...cellsToShift, ...mergesToShift, ...mergesToExpand];
                        afterState = [
                            ...cellsToShift.map(c => ({ ...c, row: c.row + numRows })),
                            ...mergesToShift.map(m => ({ ...m, row: m.row + numRows })),
                            ...mergesToExpand.map(m => ({ ...m, rowspan: m.rowspan + numRows }))
                        ];
                        await applyChanges();
                        break;
                    }
                    case 'deleteRow': {
                        const numRows = maxRow - minRow + 1;
                        const cellsToDelete = await db.customsBookCells.where({ bookId: currentBookId }).and(c => c.row >= minRow && c.row <= maxRow).toArray();
                        const cellsToShift = await db.customsBookCells.where({ bookId: currentBookId }).and(c => c.row > maxRow).toArray();
                        const mergesToDelete = await db.customsBookMerges.where({ bookId: currentBookId }).and(m => m.row >= minRow && m.row <= maxRow).toArray();
                        const mergesToShift = await db.customsBookMerges.where({ bookId: currentBookId }).and(m => m.row > maxRow).toArray();
                        const mergesToShrink = await db.customsBookMerges.where({ bookId: currentBookId }).and(m => m.row < minRow && m.row + m.rowspan > maxRow).toArray();
                        
                        beforeState = [...cellsToDelete, ...cellsToShift, ...mergesToDelete, ...mergesToShift, ...mergesToShrink];
                        afterState = [
                            ...cellsToShift.map(c => ({ ...c, row: c.row - numRows })),
                            ...mergesToShift.map(m => ({ ...m, row: m.row - numRows })),
                            ...mergesToShrink.map(m => ({...m, rowspan: Math.max(1, m.rowspan - numRows)}))
                        ];
                        await applyChanges();
                        break;
                    }
                    case 'insertCol': {
                        const numCols = maxCol - minCol + 1;
                        const cellsToShift = await db.customsBookCells.where({ bookId: currentBookId }).and(c => c.col >= minCol).toArray();
                        const mergesToShift = await db.customsBookMerges.where({ bookId: currentBookId }).and(m => m.col >= minCol).toArray();
                        const mergesToExpand = await db.customsBookMerges.where({ bookId: currentBookId }).and(m => m.col < minCol && m.col + m.colspan > minCol).toArray();

                        beforeState = [...cellsToShift, ...mergesToShift, ...mergesToExpand];
                        afterState = [
                            ...cellsToShift.map(c => ({ ...c, col: c.col + numCols })),
                            ...mergesToShift.map(m => ({ ...m, col: m.col + numCols })),
                            ...mergesToExpand.map(m => ({ ...m, colspan: m.colspan + numCols }))
                        ];
                        await applyChanges();
                        break;
                    }
                    case 'deleteCol': {
                        const numCols = maxCol - minCol + 1;
                        const cellsToDelete = await db.customsBookCells.where({ bookId: currentBookId }).and(c => c.col >= minCol && c.col <= maxCol).toArray();
                        const cellsToShift = await db.customsBookCells.where({ bookId: currentBookId }).and(c => c.col > maxCol).toArray();
                        const mergesToDelete = await db.customsBookMerges.where({ bookId: currentBookId }).and(m => m.col >= minCol && m.col <= maxCol).toArray();
                        const mergesToShift = await db.customsBookMerges.where({ bookId: currentBookId }).and(m => m.col > maxCol).toArray();
                        const mergesToShrink = await db.customsBookMerges.where({ bookId: currentBookId }).and(m => m.col < minCol && m.col + m.colspan > maxCol).toArray();

                        beforeState = [...cellsToDelete, ...cellsToShift, ...mergesToDelete, ...mergesToShift, ...mergesToShrink];
                        afterState = [
                            ...cellsToShift.map(c => ({ ...c, col: c.col - numCols })),
                            ...mergesToShift.map(m => ({ ...m, col: m.col - numCols })),
                            ...mergesToShrink.map(m => ({ ...m, colspan: Math.max(1, m.colspan - numCols) }))
                        ];
                        await applyChanges();
                        break;
                    }
                }
            });
        } catch (error) {
            console.error("Action failed:", error);
            addToast("Operation failed.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [selection, cut, copy, pushUndoAction, addToast, frozenAt, contextMenu, executeAutoFitCol, currentBookId, handleClearSelection, paste]);
    
    // --- Mouse & Keyboard Event Listeners (in useEffect hooks) ---
    useEffect(() => {
        if (editingCell) {
            if (editInitiator === 'cell' && editInputRef.current) {
                editInputRef.current.focus();
            } else if (formulaBarRef.current) { // Default to formula bar
                formulaBarRef.current.focus();
                formulaBarRef.current.select();
            }
        }
    }, [editingCell, editInitiator]);
    
    useEffect(() => {
        const handleGlobalMouseUp = () => {
             if (formulaSelection?.isActive) {
                const formulaBeforeInsert = formulaSelection.initialFormula.slice(0, formulaSelection.selectionStart);
                if (/\b(SUM|AVERAGE|COUNT|MIN|MAX)\($/i.test(formulaBeforeInsert)) {
                    // FIX: The closing parenthesis is already part of the formula from when the range was inserted.
                    // This block now only handles the smart selection of the argument.
                    // Do not add an extra parenthesis.
                    setTimeout(() => {
                         if(formulaBarRef.current) {
                            // The end position is just before the closing parenthesis.
                            const endPos = formulaBarRef.current.value.length - 1;
                            const startPos = formulaSelection.selectionStart;
                            formulaBarRef.current.setSelectionRange(startPos, endPos);
                         }
                    }, 0);
                }
                setFormulaSelection(null);
            }
            setIsSelecting(false);
            setSelectingHeader(null);
        };
        const handleClickOutside = (e: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
                setContextMenu(null);
            }
             if (bookActionsMenuRef.current && !bookActionsMenuRef.current.contains(e.target as Node)) {
                setIsBookActionsOpen(false);
            }
             if (isFunctionMenuOpen && functionMenuRef.current && !functionMenuRef.current.contains(e.target as Node)) {
                setIsFunctionMenuOpen(false);
            }
        };

        window.addEventListener('mouseup', handleGlobalMouseUp);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('mouseup', handleGlobalMouseUp);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [formulaSelection, editorContent, isFunctionMenuOpen]);

    const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        e.stopPropagation();
        
        const finishAndMove = (dir?: 'up'|'down'|'left'|'right') => {
            finishEditing(dir);
            requestAnimationFrame(() => {
                gridContainerRef.current?.focus({ preventScroll: true });
            });
        };
    
        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                finishAndMove(e.shiftKey ? 'up' : 'down');
                break;
            case 'Tab':
                e.preventDefault();
                finishAndMove(e.shiftKey ? 'left' : 'right');
                break;
            case 'Escape':
                e.preventDefault();
                setEditingCell(null);
                setEditorContent(''); // Revert changes
                requestAnimationFrame(() => {
                    gridContainerRef.current?.focus({ preventScroll: true });
                });
                break;
            case 'ArrowUp':
                e.preventDefault();
                finishAndMove('up');
                break;
            case 'ArrowDown':
                e.preventDefault();
                finishAndMove('down');
                break;
            case 'ArrowLeft':
                // Only move if at start of input, allowing cursor movement inside
                if (e.currentTarget.selectionStart === 0) {
                    e.preventDefault();
                    finishAndMove('left');
                }
                break;
            case 'ArrowRight':
                // Only move if at end of input
                if (e.currentTarget.selectionStart === e.currentTarget.value.length) {
                    e.preventDefault();
                    finishAndMove('right');
                }
                break;
            default:
                // Allow default typing behavior
                break;
        }
    };

    const handleKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (editingCell) return;
        
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            if ('cxzbyui'.includes(e.key.toLowerCase())) { // removed 'v'
                e.preventDefault();
            }
            switch(e.key.toLowerCase()) {
                case 'c': await copy(); break;
                case 'x': await cut(); break;
                // 'v' is handled by native paste event listener in the hook
                case 'z': await handleUndo(); break;
                case 'y': await handleRedo(); break;
                case 'b': await handleApplyStyle({ bold: 'toggle' }); break;
                case 'i': await handleApplyStyle({ italic: 'toggle' }); break;
                case 'u': await handleApplyStyle({ underline: 'toggle' }); break;
            }
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            await handleClearSelection();
            return;
        }
        
        const { active, range } = selection;

        if (clipboard?.isCut) {
            // clear clipboard state if user navigates away
        }

        const isNavigationKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key);
        if (!isNavigationKey && e.key.length === 1 && !e.altKey) {
             setEditInitiator('cell');
             startEditing(active.row, active.col, e.key);
             e.preventDefault();
             return;
        }
        if (!isNavigationKey) return;
        
        e.preventDefault();
        
        setCenterOnScrollTo(null);

        const currentMerge = findMergeInfo(active.row, active.col);
        let nextRow = active.row;
        let nextCol = active.col;

        switch (e.key) {
            case 'ArrowUp': nextRow = currentMerge ? currentMerge.row - 1 : active.row - 1; break;
            case 'ArrowDown': nextRow = currentMerge ? currentMerge.row + currentMerge.rowspan : active.row + 1; break;
            case 'ArrowLeft': nextCol = currentMerge ? currentMerge.col - 1 : active.col - 1; break;
            case 'ArrowRight': nextCol = currentMerge ? currentMerge.col + currentMerge.colspan : active.col + 1; break;
            case 'Tab': 
                if (currentMerge) {
                    nextCol = e.shiftKey ? currentMerge.col - 1 : currentMerge.col + currentMerge.colspan;
                } else {
                    nextCol = e.shiftKey ? active.col - 1 : active.col + 1;
                }
                break;
            case 'Enter': 
                 if (e.shiftKey) {
                    const merge = findMergeInfo(active.row, active.col);
                    nextRow = merge ? merge.row - 1 : active.row - 1;
                } else {
                    startEditing(active.row, active.col);
                }
                return;
        }
        
        nextRow = Math.max(1, Math.min(NUM_ROWS, nextRow));
        nextCol = Math.max(1, Math.min(NUM_COLS, nextCol));

        const targetMerge = findMergeInfo(nextRow, nextCol);
        
        let newActive: CellAddress;
        let newRange: SelectionRange;

        if (targetMerge) {
            newActive = { row: targetMerge.row, col: targetMerge.col };
            const endCell = { row: targetMerge.row + targetMerge.rowspan - 1, col: targetMerge.col + targetMerge.colspan - 1 };
            newRange = e.shiftKey ? { start: range.start, end: endCell } : { start: newActive, end: endCell };
        } else {
            newActive = { row: nextRow, col: nextCol };
            newRange = e.shiftKey ? { start: range.start, end: newActive } : { start: newActive, end: newActive };
        }
        
        setSelection({ active: newActive, range: newRange });
        setCurrentResultIndex(-1);
    }, [selection, editingCell, handleUndo, handleRedo, startEditing, clipboard, handleApplyStyle, findMergeInfo, handleClearSelection, copy, cut]);
    
    useEffect(() => {
        if (selection.active && gridContainerRef.current) {
            const { row, col } = selection.active;
            const cellTop = rowTops[row - 1];
            const cellHeight = getRowHeight(row);
            const cellLeft = columnLefts[col - 1];
            
            const grid = gridContainerRef.current;
            
            if (centerOnScrollTo && centerOnScrollTo.row === row && centerOnScrollTo.col === col) {
                const gridHeight = grid.clientHeight;
                const gridWidth = grid.clientWidth;
                const cellWidth = getColWidth(col);

                const targetScrollTop = cellTop - (gridHeight / 2) + (cellHeight / 2);
                const targetScrollLeft = cellLeft - (gridWidth / 2) + (cellWidth / 2);

                grid.scrollTo({
                    top: Math.max(0, targetScrollTop),
                    left: Math.max(0, targetScrollLeft),
                    behavior: 'smooth'
                });
                
                setCenterOnScrollTo(null);
                return;
            }

            if (cellTop < grid.scrollTop + frozenHeight) {
                grid.scrollTop = cellTop - frozenHeight;
            } else if (cellTop + cellHeight > grid.scrollTop + grid.clientHeight) {
                grid.scrollTop = cellTop + cellHeight - grid.clientHeight;
            }
            
            if (cellLeft < grid.scrollLeft + frozenWidth) {
                grid.scrollLeft = cellLeft - frozenWidth;
            } else {
                const cellWidth = getColWidth(col);
                if (cellLeft + cellWidth > grid.scrollLeft + grid.clientWidth) {
                    grid.scrollLeft = cellLeft + cellWidth - grid.clientWidth;
                }
            }
        }
    }, [selection.active, columnLefts, getColWidth, frozenHeight, frozenWidth, centerOnScrollTo, rowTops, getRowHeight]);

    const handleCellContextMenu = (e: React.MouseEvent, row: number, col: number) => {
        e.preventDefault();
        finishEditing(); 

        const { minRow, maxRow, minCol, maxCol } = getRangeBounds(selection.range);
        const isClickInsideSelection = row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;

        if (!isClickInsideSelection) {
            const newActive = { row, col };
            setSelection({ active: newActive, range: { start: newActive, end: newActive } });
        }

        const rootRect = rootRef.current?.getBoundingClientRect();
        setContextMenu({ visible: true, x: e.clientX - (rootRect?.left || 0), y: e.clientY - (rootRect?.top || 0), type: 'cell', index: 0 });
    };

    const handleHeaderContextMenu = (e: React.MouseEvent, type: 'row' | 'col', index: number) => {
        e.preventDefault();
        finishEditing();

        const { minRow, maxRow, minCol, maxCol } = getRangeBounds(selection.range);

        const isClickInsideSelection = (type === 'row' && index >= minRow && index <= maxRow) ||
                                     (type === 'col' && index >= minCol && index <= maxCol);
        
        if (!isClickInsideSelection) {
            if (type === 'row') {
                const newActive = {row: index, col: 1};
                setSelection({ active: newActive, range: {start: {row: index, col: 1}, end: {row: index, col: NUM_COLS}}});
            } else {
                const newActive = {row: 1, col: index};
                setSelection({ active: newActive, range: {start: {row: 1, col: index}, end: {row: NUM_ROWS, col: index}}});
            }
        }
        
        const rootRect = rootRef.current?.getBoundingClientRect();
        setContextMenu({ visible: true, x: e.clientX - (rootRect?.left || 0), y: e.clientY - (rootRect?.top || 0), type, index });
    };
    
    const handleImportClick = () => fileInputRef.current?.click();
    
    const processSheet = (sheet: ExcelJS.Worksheet, bookId: string): CustomsBookCell[] => {
        const newCells: CustomsBookCell[] = [];
        sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                let cellValue: any = cell.value;
                if (cell.isMerged && cell.master) {
                    cellValue = sheet.getCell(cell.master.address).value;
                }

                if (cellValue === null || cellValue === undefined || String(cellValue).trim() === '') return;
                
                if (typeof cellValue === 'string') {
                    cellValue = persianArabicToEnglish(cellValue);
                } else if (cellValue && typeof cellValue === 'object') {
                    if ('result' in cellValue) cellValue = cellValue.result;
                    else if ('richText' in cellValue) cellValue = (cellValue as ExcelJS.CellRichTextValue).richText.map(rt => rt.text).join('');
                    else if (cellValue instanceof Date) {
                         const tzoffset = cellValue.getTimezoneOffset() * 60000;
                         const localISOTime = (new Date(cellValue.getTime() - tzoffset)).toISOString().split('T')[0];
                         cellValue = localISOTime;
                    } else {
                        console.warn(`Skipping complex cell object at ${cell.address}:`, cellValue);
                        return;
                    }
                }
                if (cellValue !== null && cellValue !== undefined) {
                    newCells.push({ bookId, row: rowNumber, col: colNumber, value: cellValue });
                }
            });
        });
        return newCells;
    };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
    
        setIsLoading(true);
        addToast(t('views.customsBook.importing'), 'info');
    
        try {
            const workbook = new ExcelJS.Workbook();
            const buffer = await file.arrayBuffer();
            await workbook.xlsx.load(buffer);
    
            const existingBooks = await db.customsBooks.toArray();
            const existingBookNames = new Set(existingBooks.map(b => b.name.toLowerCase()));
    
            const sheetsToImport = workbook.worksheets.filter(sheet => !existingBookNames.has(sheet.name.toLowerCase()));
            const skippedSheets = workbook.worksheets.filter(sheet => existingBookNames.has(sheet.name.toLowerCase()));
    
            if (skippedSheets.length > 0) {
                addToast(`Skipped existing sheets: ${skippedSheets.map(s => s.name).join(', ')}`, 'info');
            }
    
            if (sheetsToImport.length === 0) {
                if (skippedSheets.length === workbook.worksheets.length) {
                    addToast("All sheets in the file already exist as books.", "info");
                } else {
                    addToast("No new sheets to import.", "info");
                }
                return;
            }
    
            let firstNewBookId: string | null = null;
            await db.transaction('rw', db.customsBooks, db.customsBookCells, async () => {
                for (const sheet of sheetsToImport) {
                    const newBook: CustomsBook = { id: crypto.randomUUID(), name: sheet.name };
                    await db.customsBooks.add(newBook);
                    if (!firstNewBookId) firstNewBookId = newBook.id;
    
                    const newCells = processSheet(sheet, newBook.id);
                    if (newCells.length > 0) {
                        await db.customsBookCells.bulkAdd(newCells);
                    }
                }
            });
    
            if (firstNewBookId) {
                setCurrentBookId(firstNewBookId);
            }
    
            addToast(`${sheetsToImport.length} new book(s) imported from Excel sheets.`, 'success');
        } catch (error) {
            console.error("Import Error:", error);
            addToast(t('views.customsBook.importError'), 'error');
        } finally {
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };
    
    const handleClear = () => {
        if (!currentBookId) return;
        showConfirmation({
            title: t('views.customsBook.clearDataConfirmTitle'),
            message: t('views.customsBook.clearDataConfirmBody'),
            variant: 'destructive',
            requireCode: true,
            confirmationCode: 'DELETE',
            onConfirm: async () => {
                const beforeState = await db.customsBookCells.where({ bookId: currentBookId }).toArray();
                if(beforeState.length > 0) {
                    await db.customsBookCells.where({ bookId: currentBookId }).delete();
                    pushUndoAction({ before: beforeState, after: [] });
                }
                addToast('Data cleared.', 'success');
            }
        });
    };
    
    const handleCellMouseDown = (row: number, col: number, e: React.MouseEvent) => {
        if (e.button !== 0) return;

        if (editingCell) {
            e.preventDefault();
            const formulaBar = formulaBarRef.current;
            if (!formulaBar) return;

            const newRange = { start: { row, col }, end: { row, col } };
            setFormulaSelection({
                isActive: true,
                range: newRange,
                initialFormula: formulaBar.value,
                selectionStart: formulaBar.selectionStart || 0,
                selectionEnd: formulaBar.selectionEnd || 0,
            });
            updateFormulaWithRange(newRange);
            setSelection({ active: { row, col }, range: newRange });
            return;
        }

        finishEditing();
        setCenterOnScrollTo(null);

        const targetMerge = findMergeInfo(row, col);
        let newActive = { row, col };
        let newRangeEnd = { row, col };

        if (targetMerge) {
            newActive = { row: targetMerge.row, col: targetMerge.col };
            newRangeEnd = { row: targetMerge.row + targetMerge.rowspan - 1, col: targetMerge.col + targetMerge.colspan - 1 };
        }
        
        setIsSelecting(true);
        if (e.shiftKey) {
            setSelection(prev => ({ active: newActive, range: { start: prev.range.start, end: newRangeEnd } }));
        } else {
            setSelection({ active: newActive, range: { start: newActive, end: newRangeEnd } });
        }
        setCurrentResultIndex(-1);
    };

    const handleHeaderMouseDown = (e: React.MouseEvent, type: 'row'|'col', index: number) => {
        if (e.button !== 0) return; // Only process left-clicks
        finishEditing();
        setCenterOnScrollTo(null);
        setSelectingHeader(type);
        if(type === 'row') {
            const newActive = {row: index, col: 1};
            setSelection({ active: newActive, range: {start: {row: index, col: 1}, end: {row: index, col: NUM_COLS}}});
        } else {
            const newActive = {row: 1, col: index};
            setSelection({ active: newActive, range: {start: {row: 1, col: index}, end: {row: NUM_ROWS, col: index}}});
        }
    };
    
    const handleHeaderMouseOver = (type: 'row' | 'col', index: number) => {
        if (selectingHeader === type) {
            if (type === 'row') {
                setSelection(prev => ({...prev, range: {...prev.range, end: {row: index, col: NUM_COLS}}}));
            } else {
                 setSelection(prev => ({...prev, range: {...prev.range, end: {row: NUM_ROWS, col: index}}}));
            }
        }
    };

    // FIX: Replaced handleCellMouseOver with a global mousemove listener.
    useEffect(() => {
        if (!isSelecting) return;

        const handleGlobalMouseMove = (e: MouseEvent) => {
            const grid = gridContainerRef.current;
            if (!grid) return;

            // --- 1. Update Selection based on mouse position ---
            const hoveredCell = getCellFromCoords(e);
            if (hoveredCell) {
                const targetMerge = findMergeInfo(hoveredCell.row, hoveredCell.col);
                const endCell = targetMerge
                    ? { row: targetMerge.row + targetMerge.rowspan - 1, col: targetMerge.col + targetMerge.colspan - 1 }
                    : { row: hoveredCell.row, col: hoveredCell.col };
                
                setSelection(prev => {
                    if (prev.range.end.row === endCell.row && prev.range.end.col === endCell.col) {
                        return prev;
                    }
                    return { ...prev, range: { start: prev.range.start, end: endCell } };
                });
            }

            // --- 2. Handle Auto-scroll ---
            const rect = grid.getBoundingClientRect();
            const scrollZone = 40; // px
            const scrollSpeed = 20; // px

            if (e.clientX < rect.left + scrollZone) grid.scrollLeft -= scrollSpeed;
            else if (e.clientX > rect.right - scrollZone) grid.scrollLeft += scrollSpeed;

            if (e.clientY < rect.top + scrollZone) grid.scrollTop -= scrollSpeed;
            else if (e.clientY > rect.bottom - scrollZone) grid.scrollTop += scrollSpeed;
        };

        const handleGlobalMouseUp = () => {
            setIsSelecting(false);
        };

        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [isSelecting, getCellFromCoords, findMergeInfo]);
    
    const handleResizeColMouseDown = useCallback((e: React.MouseEvent, col: number) => {
        e.preventDefault();
        e.stopPropagation();

        resizingColumnRef.current = {
            key: col,
            startX: e.clientX,
            startWidth: (columnWidths[col] ?? DEFAULT_COL_WIDTH)
        };

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (resizingColumnRef.current) {
                const { key, startX, startWidth } = resizingColumnRef.current;
                const newWidth = Math.max(40, startWidth + (moveEvent.clientX - startX) / zoomLevel);
                setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
            }
        };

        const handleMouseUp = () => {
            resizingColumnRef.current = null;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [zoomLevel, columnWidths, setColumnWidths]);
    
    const handleResizeRowMouseDown = useCallback((e: React.MouseEvent, row: number) => {
        e.preventDefault();
        e.stopPropagation();

        resizingRowRef.current = {
            row,
            startY: e.clientY,
            startHeight: (rowHeights[row] ?? DEFAULT_ROW_HEIGHT)
        };

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (resizingRowRef.current) {
                const { row, startY, startHeight } = resizingRowRef.current;
                const newHeight = Math.max(20, startHeight + (moveEvent.clientY - startY) / zoomLevel);
                setRowHeights(prev => ({...prev, [row]: newHeight}));
            }
        };

        const handleMouseUp = async () => {
            if(resizingRowRef.current && currentBookId) {
                const { row, startHeight } = resizingRowRef.current;
                const finalHeight = rowHeights[row] ?? DEFAULT_ROW_HEIGHT;

                if(Math.abs(finalHeight - startHeight) > 1) { // Only save if changed
                    const before = await db.customsBookRowHeights.get([currentBookId, row]);
                    const newHeightRecord = { bookId: currentBookId, row, height: finalHeight };
                    await db.customsBookRowHeights.put(newHeightRecord);
                    pushUndoAction({ before: before ? [before] : [], after: [newHeightRecord]});
                }
            }
            resizingRowRef.current = null;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [zoomLevel, rowHeights, pushUndoAction, currentBookId]);


    const handleNewBookClick = () => {
        setIsCreatingNewBook(true);
        setBookNameInput('');
    };

    const handleSaveNewBook = async () => {
        const name = bookNameInput.trim();
        if (name) {
            const newBook: CustomsBook = { id: crypto.randomUUID(), name };
            await db.customsBooks.add(newBook);
            setCurrentBookId(newBook.id);
            setIsCreatingNewBook(false);
            setBookNameInput('');
        }
    };

    const handleRenameBookClick = () => {
        setIsBookActionsOpen(false);
        if (!currentBookId || !books) return;
        const currentBook = books.find(b => b.id === currentBookId);
        if (currentBook) {
            setBookNameInput(currentBook.name);
            setIsRenamingBook(true);
        }
    };

    const handleSaveRename = async () => {
        const newName = bookNameInput.trim();
        if (newName && currentBookId) {
            await db.customsBooks.update(currentBookId, { name: newName });
        }
        setIsRenamingBook(false);
        setBookNameInput('');
    };


    const handleDeleteBook = () => {
        setIsBookActionsOpen(false);
        if (!currentBookId || !books || books.length <= 1) {
            addToast(t('views.customsBook.deleteLastError'), "error");
            return;
        }
        const currentBook = books.find(b => b.id === currentBookId);
        if (!currentBook) return;
        showConfirmation({
            title: `Delete book '${currentBook.name}'?`,
            message: "This will permanently delete this book and all its data. This cannot be undone.",
            variant: 'destructive',
            confirmationCode: 'DELETE',
            requireCode: true,
            onConfirm: async () => {
                await db.transaction('rw', db.customsBooks, db.customsBookCells, db.customsBookMerges, async () => {
                    await db.customsBookCells.where({ bookId: currentBookId }).delete();
                    await db.customsBookMerges.where({ bookId: currentBookId }).delete();
                    await db.customsBooks.delete(currentBookId as string);
                });
                setCurrentBookId(books.find(b => b.id !== currentBookId)?.id || null);
                addToast(t('views.customsBook.bookDeleted', { name: currentBook.name }), 'success');
            }
        });
    };
    
    const handleDragFillStart = (e: React.DragEvent) => {
        e.stopPropagation();
        setIsSelecting(false); // Stop normal selection process
        const { minRow, maxRow, minCol, maxCol } = getRangeBounds(selection.range);
        const data: any[][] = [];
        const styles: (CellStyle | undefined)[][] = [];
        for (let r = minRow; r <= maxRow; r++) {
            const rowData: any[] = [];
            const rowStyles: (CellStyle | undefined)[] = [];
            for (let c = minCol; c <= maxCol; c++) {
                rowData.push(dataMap.get(`${r}-${c}`) ?? '');
                rowStyles.push(styleMap.get(`${r}-${c}`));
            }
            data.push(rowData);
            styles.push(rowStyles);
        }
        setDragFillSourceData({ data, styles, sourceRange: selection.range, isCut: false });
        e.dataTransfer.setData('text/plain', 'drag-fill'); // Necessary for Firefox
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragFillEnd = () => {
        setDragFillSourceData(null);
        setDragOverRange(null);
    };

    const handleGridDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        const cell = getCellFromCoords(e);
        if (cell) {
            const { range } = selection;
            const { minRow, maxRow, minCol, maxCol } = getRangeBounds(range);
            
            const dx = Math.abs(cell.col - (cell.col > maxCol ? maxCol : minCol));
            const dy = Math.abs(cell.row - (cell.row > maxRow ? maxRow : minRow));

            if (dx > dy) { // Horizontal drag
                setDragOverRange({
                    start: { row: minRow, col: Math.min(minCol, cell.col) },
                    end: { row: maxRow, col: Math.max(maxCol, cell.col) }
                });
            } else { // Vertical drag
                setDragOverRange({
                    start: { row: Math.min(minRow, cell.row), col: minCol },
                    end: { row: Math.max(maxRow, cell.row), col: maxCol }
                });
            }
        }
    };

    const handleGridDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        if (!dragFillSourceData || !dragOverRange || !currentBookId) {
            setDragOverRange(null);
            return;
        }

        const { data: sourceData, styles: sourceStyles, sourceRange } = dragFillSourceData;
        const { minRow: sourceMinRow, maxRow: sourceMaxRow, minCol: sourceMinCol, maxCol: sourceMaxCol } = getRangeBounds(sourceRange);
        const { minRow: targetMinRow, maxRow: targetMaxRow, minCol: targetMinCol, maxCol: targetMaxCol } = getRangeBounds(dragOverRange);

        const sourceNumRows = sourceMaxRow - sourceMinRow + 1;
        const sourceNumCols = sourceMaxCol - sourceMinCol + 1;

        const isSource1D = sourceNumRows === 1 || sourceNumCols === 1;
        const sourceValuesFlat = sourceData.flat();
        const isAllNumeric = sourceValuesFlat.length > 0 && sourceValuesFlat.every((v: any) => getNumericValue(v) !== null);

        const isVerticalFill = targetMinCol === sourceMinCol && targetMaxCol === sourceMaxCol;

        let isSeries = false;
        let commonDifference = 0;

        if (isSource1D && isAllNumeric) {
            const sourceNumbers = sourceValuesFlat.map((v: any) => getNumericValue(v)!);
            if (sourceNumbers.length === 1) {
                isSeries = true;
                commonDifference = 1;
            } else {
                const deltas = [];
                for (let i = 0; i < sourceNumbers.length - 1; i++) {
                    deltas.push(sourceNumbers[i + 1] - sourceNumbers[i]);
                }
                const isArithmetic = deltas.every(d => Math.abs(d - deltas[0]) < 1e-9);
                if (isArithmetic) {
                    isSeries = true;
                    commonDifference = deltas[0];
                }
            }
        }

        const cellsToPut: CustomsBookCell[] = [];
        for (let r = targetMinRow; r <= targetMaxRow; r++) {
            for (let c = targetMinCol; c <= targetMaxCol; c++) {
                if (r >= sourceMinRow && r <= sourceMaxRow && c >= sourceMinCol && c <= sourceMaxCol) {
                    continue;
                }

                let value;
                let style;

                if (isSeries) {
                    const lastSourceVal = getNumericValue(sourceValuesFlat[sourceValuesFlat.length - 1])!;
                    const firstSourceVal = getNumericValue(sourceValuesFlat[0])!;

                    if (isVerticalFill) {
                        if (r > sourceMaxRow) {
                            const steps = r - sourceMaxRow;
                            value = lastSourceVal + (steps * commonDifference);
                        } else {
                            const steps = sourceMinRow - r;
                            value = firstSourceVal - (steps * commonDifference);
                        }
                        const styleIndex = (r > sourceMaxRow) ? sourceNumRows - 1 : 0;
                        style = sourceStyles[styleIndex]?.[0];
                    } else { // Horizontal
                        if (c > sourceMaxCol) {
                            const steps = c - sourceMaxCol;
                            value = lastSourceVal + (steps * commonDifference);
                        } else {
                            const steps = sourceMinCol - c;
                            value = firstSourceVal - (steps * commonDifference);
                        }
                        const styleIndex = (c > sourceMaxCol) ? sourceNumCols - 1 : 0;
                        style = sourceStyles[0]?.[styleIndex];
                    }
                } else { // Default pattern copy
                    const r_idx = (r - sourceMinRow) % sourceNumRows;
                    const c_idx = (c - sourceMinCol) % sourceNumCols;
                    value = sourceData[r_idx]?.[c_idx];
                    style = sourceStyles[r_idx]?.[c_idx];
                }
                
                cellsToPut.push({ bookId: currentBookId, row: r, col: c, value, style });
            }
        }
        
        if (cellsToPut.length > 0) {
            await db.transaction('rw', db.customsBookCells, async () => {
                const beforeKeys = cellsToPut.map(c => [c.bookId, c.row, c.col] as [string, number, number]);
                const beforeState = await db.customsBookCells.bulkGet(beforeKeys);
                await db.customsBookCells.bulkPut(cellsToPut);
                pushUndoAction({ before: beforeState.filter(Boolean) as CustomsBookCell[], after: cellsToPut });
            });
            addToast(t('views.customsBook.cellsFilled'), 'success');
        }
        
        setDragOverRange(null);
    };
    
    const availableFunctions = ['SUM', 'AVERAGE', 'COUNT', 'MIN', 'MAX'];

    const handleFunctionInsert = (funcName: string) => {
        const { row, col } = selection.active;
        const formulaText = `=${funcName.toUpperCase()}()`;
        
        setEditInitiator('formulaBar');
        startEditing(row, col, formulaText);

        setTimeout(() => {
            if (formulaBarRef.current) {
                const cursorPosition = formulaText.length - 1;
                formulaBarRef.current.focus();
                formulaBarRef.current.setSelectionRange(cursorPosition, cursorPosition);
            }
        }, 0);

        setIsFunctionMenuOpen(false);
    };

    // --- Virtualization & Rendering ---
    const gridHeight = (gridContainerRef.current?.clientHeight || 0);
    const gridWidth = (gridContainerRef.current?.clientWidth || 0);
    const { startRow, endRow } = useMemo(() => {
        let start = 0; let tempTop = 0;
        while(start < NUM_ROWS - 1 && tempTop + getRowHeight(start + 1) < scrollPos.top) {
            tempTop += getRowHeight(start + 1);
            start++;
        }
        let end = start; let visibleHeight = 0;
        while(visibleHeight < gridHeight + 200 && end < NUM_ROWS) {
            visibleHeight += getRowHeight(end + 1);
            end++;
        }
        return { startRow: start + 1, endRow: end };
    }, [scrollPos.top, gridHeight, getRowHeight]);

    let startCol = 0;
    let tempLeft = 0;
    while(startCol < NUM_COLS - 1 && tempLeft + getColWidth(startCol + 1) < scrollPos.left) {
        tempLeft += getColWidth(startCol + 1);
        startCol++;
    }

    let endCol = startCol;
    let visibleWidth = 0;
    while(visibleWidth < gridWidth + 200 && endCol < NUM_COLS) {
        visibleWidth += getColWidth(endCol + 1);
        endCol++;
    }

    const activeCellAddress = `${colIndexToHeader(selection.active.col - 1)}${selection.active.row}`;
    
    // RENDER FUNCTIONS FOR PANES
    const renderCells = (rowStart: number, rowEnd: number, colStart: number, colEnd: number) => {
        const cellsToRender = [];
        for (let row = rowStart; row <= rowEnd; row++) {
            for (let col = colStart; col <= colEnd; col++) {
                if (row > NUM_ROWS || col > NUM_COLS) continue;
                
                if (mergedCellsSet.has(`${row}-${col}`) && !mergeMap.has(`${row}-${col}`)) continue;

                const baseStyle = styleMap.get(`${row}-${col}`);
                const style: CellStyle = {
                    ...baseStyle,
                    valign: baseStyle?.valign || 'middle',
                };
                let value = dataMap.get(`${row}-${col}`);
                const isFormula = typeof value === 'string' && value.startsWith('=');
                if (isFormula) {
                    value = evaluateFormula(value, dataMap);
                } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
                    try {
                        value = new Date(String(value) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
                    } catch(e) { /* ignore parse error */ }
                }
                const isNumeric = getNumericValue(value) !== null && !isFormula;
                
                const mergeInfo = mergeMap.get(`${row}-${col}`);
                let cellWidth = getColWidth(col);
                let cellHeight = getRowHeight(row);

                if (mergeInfo) {
                    cellWidth = 0;
                    for (let i = 0; i < mergeInfo.colspan; i++) {
                        cellWidth += getColWidth(col + i);
                    }
                    cellHeight = 0;
                    for (let i = 0; i < mergeInfo.rowspan; i++) {
                        cellHeight += getRowHeight(row + i);
                    }
                }

                const valignMap = {
                    top: 'flex-start',
                    middle: 'center',
                    bottom: 'flex-end',
                };
                 const justifyContentMap = {
                    left: 'flex-start',
                    center: 'center',
                    right: 'flex-end',
                };
                const defaultAlign = isNumeric ? 'right' : 'left';

                const cellInlineStyle: React.CSSProperties = {
                    top: rowTops[row - 1],
                    left: columnLefts[col - 1],
                    width: cellWidth,
                    height: cellHeight,
                    fontWeight: style?.bold ? 'bold' : 'normal',
                    fontStyle: style?.italic ? 'italic' : 'normal',
                    textDecoration: style?.underline ? 'underline' : 'normal',
                    justifyContent: justifyContentMap[style?.align || defaultAlign],
                    alignItems: valignMap[style.valign],
                    backgroundColor: style?.bgColor,
                    color: style?.textColor,
                    fontSize: style?.fontSize ? `${style.fontSize}px` : undefined,
                    borderTop: style?.borderTop,
                    borderBottom: style?.borderBottom,
                    borderLeft: style?.borderLeft,
                    borderRight: style?.borderRight,
                };

                const isSearchResult = searchResultsSet.has(`${row}-${col}`);
                const currentResult = searchResults[currentResultIndex];
                const isCurrentResult = currentResult && currentResult.row === row && currentResult.col === col;
                cellsToRender.push(
                    <div
                        key={`${row}-${col}`}
                        className={`absolute flex border-slate-200 p-1 overflow-hidden whitespace-nowrap select-none ${isFormula ? 'italic text-blue-800' : ''} ${isCurrentResult ? 'ring-2 ring-offset-1 ring-orange-500 z-10' : isSearchResult ? 'bg-yellow-100' : ''} ${!style?.borderRight ? 'border-r' : ''} ${!style?.borderBottom ? 'border-b' : ''}`}
                        style={cellInlineStyle}
                        onMouseDown={(e) => { setEditInitiator('cell'); handleCellMouseDown(row, col, e); }}
                        onDoubleClick={() => { setEditInitiator('cell'); startEditing(row, col); }}
                        onContextMenu={(e) => handleCellContextMenu(e, row, col)}
                    >
                        {value}
                    </div>
                );
            }
        }
        return cellsToRender;
    };
    
    const currentStyle = useMemo(() => {
        const { row, col } = selection.active;
        return styleMap.get(`${row}-${col}`) || {};
    }, [selection.active, styleMap]);
    
    return (
        <div ref={rootRef} className="h-full flex flex-col p-2 bg-gray-50 overflow-hidden relative" dir="ltr" onKeyDown={handleKeyDown} tabIndex={0}>
            {isLoading && <LoadingOverlay message="Processing..." />}
            <input type="file" ref={fileInputRef} onChange={handleFileSelected} className="hidden" accept=".xlsx" />
            
            <div className="flex-shrink-0 mb-2 flex flex-col gap-2">
                 <div className="flex items-center gap-x-2">
                    <div className="flex items-center gap-x-2 flex-grow max-w-sm">
                        {isRenamingBook ? (
                            <input
                                type="text"
                                value={bookNameInput}
                                onChange={e => setBookNameInput(e.target.value)}
                                onBlur={handleSaveRename}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveRename(); if (e.key === 'Escape') setIsRenamingBook(false); }}
                                autoFocus
                                className="w-full bg-white text-gray-900 border border-indigo-500 rounded-md p-2 text-sm"
                            />
                        ) : (
                            <Select value={currentBookId || ''} onChange={e => setCurrentBookId(e.target.value)} wrapperClassName="flex-grow">
                                {books?.map(book => <option key={book.id} value={book.id}>{book.name}</option>)}
                            </Select>
                        )}
                    </div>
                     <div className="relative" ref={bookActionsMenuRef}>
                        <button onClick={() => setIsBookActionsOpen(prev => !prev)} className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded border border-slate-300 bg-white">{t('common.actions')}</button>
                        {isBookActionsOpen && (
                            <div className="absolute top-full left-0 mt-1 w-40 bg-white rounded-md shadow-lg border border-slate-200 z-50">
                                <ul className="p-1 text-sm text-slate-800">
                                    <li><button onClick={handleRenameBookClick} className="w-full text-left px-3 py-2 hover:bg-slate-100 rounded">{t('settings.tabs.rename')}</button></li>
                                    <li><button onClick={handleDeleteBook} disabled={(books?.length || 0) <= 1} className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 rounded disabled:text-slate-400 disabled:hover:bg-transparent">{t('buttons.delete')}</button></li>
                                </ul>
                            </div>
                        )}
                    </div>
                    {isCreatingNewBook ? (
                        <div className="flex items-center gap-x-2">
                            <input
                                type="text"
                                value={bookNameInput}
                                onChange={e => setBookNameInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveNewBook(); if (e.key === 'Escape') setIsCreatingNewBook(false); }}
                                placeholder={t('views.customsBook.newBookPlaceholder') as string}
                                autoFocus
                                className="bg-white text-gray-900 border border-slate-300 rounded-md p-1.5 text-sm"
                            />
                            <button onClick={handleSaveNewBook} className="px-3 py-1.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded">{t('buttons.save')}</button>
                            <button onClick={() => setIsCreatingNewBook(false)} className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded">{t('common.cancel')}</button>
                        </div>
                    ) : (
                        <button onClick={handleNewBookClick} className="px-3 py-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded">{t('views.customsBook.newBook')}</button>
                    )}
                </div>
                <div className="flex items-center gap-x-1 p-1 bg-slate-100 border-b border-t border-slate-300 rounded-t-md -mx-1">
                    <button onClick={paste} title="Paste (Ctrl+V)" className="p-2 hover:bg-slate-200 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-700" viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" /><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" /></svg></button>
                    <button onClick={cut} title="Cut (Ctrl+X)" className="p-2 hover:bg-slate-200 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7v3a1 1 0 001 1h3m-3-4h3m-3 4H5m11 4h.01M12 20h.01M12 16h.01M12 12h.01M12 8h.01M12 4h.01M4 4h.01M16 4h.01M4 8h.01M4 12h.01M4 16h.01M20 12h.01M20 8h.01M20 4h.01M20 16h.01" /></svg></button>
                    <button onClick={() => copy()} title="Copy (Ctrl+C)" className="p-2 hover:bg-slate-200 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-700" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2-2H9a2 2 0 01-2-2V9z" /><path d="M4 3a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2V5a2 2 0 00-2-2H4z" /></svg></button>
                    <div className="h-6 w-px bg-slate-300 mx-1"></div>
                    <button onClick={handleUndo} title="Undo (Ctrl+Z)" className="p-2 hover:bg-slate-200 rounded disabled:opacity-50" disabled={undoStack.filter(a => a.bookId === currentBookId).length === 0}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-700" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg></button>
                    <button onClick={handleRedo} title="Redo (Ctrl+Y)" className="p-2 hover:bg-slate-200 rounded disabled:opacity-50" disabled={redoStack.filter(a => a.bookId === currentBookId).length === 0}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-700" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                    <div className="h-6 w-px bg-slate-300 mx-1"></div>
                    <button onClick={handleGeneratePackingList} className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded">{t('orderModal.printMenu.packingList')}</button>
                    <button onClick={handleGenerateInvoice} className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded">{t('orderModal.printMenu.invoice')}</button>
                    <div className="h-6 w-px bg-slate-300 mx-1"></div>
                    <button onClick={handleImportClick} className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded">{t('views.customsBook.importExcel')}</button>
                    <button onClick={handleExport} className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded">{t('views.customsBook.exportExcel')}</button>
                    <button onClick={handleClear} className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded">{t('views.customsBook.clearData')}</button>
                </div>
                 <FormattingToolbar currentStyle={currentStyle} onStyleChange={handleApplyStyle} />
             </div>
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex items-stretch gap-x-4 bg-slate-100 border-b border-t border-slate-300 p-1 -mx-1">
                     <div className="flex-shrink-0 font-mono text-sm border border-slate-400 bg-slate-200 rounded px-3 py-2 w-24 text-center">{activeCellAddress}</div>
                     <div className="flex items-center w-full max-w-2xl bg-white border border-slate-300 rounded-md focus-within:ring-1 focus-within:ring-indigo-500">
                        <div ref={functionMenuRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsFunctionMenuOpen(p => !p)}
                                className="px-3 text-sm font-mono text-slate-500 border-r border-slate-300 h-full flex items-center hover:bg-slate-100"
                                aria-haspopup="true"
                                aria-expanded={isFunctionMenuOpen}
                            >
                                {t('views.customsBook.fx')}
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            </button>
                            {isFunctionMenuOpen && (
                                <div className="absolute top-full left-0 mt-1 w-40 bg-white rounded-md shadow-lg border border-slate-200 z-50">
                                    <ul className="p-1 text-sm text-slate-800">
                                        {availableFunctions.map(func => (
                                            <li key={func}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleFunctionInsert(func)}
                                                    className="w-full text-left px-4 py-2 hover:bg-slate-100 rounded"
                                                >
                                                    {func}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <input
                            ref={formulaBarRef}
                            type="text"
                            value={formulaBarDisplayValue}
                            onChange={(e) => {
                                setEditInitiator('formulaBar');
                                setEditorContent(e.target.value);
                                if (selection.active) {
                                    setEditingCell(selection.active);
                                }
                            }}
                            onKeyDown={handleEditorKeyDown}
                            className="w-full h-full px-2 py-1.5 text-sm font-mono border-none focus:ring-0 bg-transparent outline-none"
                            placeholder="Enter value or formula..."
                        />
                     </div>
                </div>
                
                <div ref={gridContainerRef} onScroll={handleScroll} className="flex-1 overflow-auto relative bg-white outline-none" tabIndex={0}>
                    <div style={{ width: totalWidth, height: totalHeight }}>
                        {/* Column Headers */}
                        <div ref={colHeaderRef} className="sticky top-0 z-30 flex bg-slate-100 border-b border-slate-300" style={{ height: HEADER_HEIGHT, width: totalWidth }}>
                             {/* Frozen Cols Header */}
                             <div ref={frozenColsRef} className="sticky left-0 z-40 bg-slate-200 flex border-r border-slate-300" style={{ width: frozenWidth, overflow: 'hidden' }}>
                                {columnLefts.slice(0, frozenColCount).map((left, index) => (
                                    <div
                                        key={index}
                                        className={`absolute border-r border-slate-300 flex items-center justify-center text-xs font-semibold text-slate-600 select-none ${selectingHeader === 'col' && selection.range.start.col <= index + 1 && selection.range.end.col >= index + 1 ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 hover:bg-slate-200'}`}
                                        style={{ left, width: getColWidth(index + 1), height: HEADER_HEIGHT }}
                                        onMouseDown={(e) => handleHeaderMouseDown(e, 'col', index + 1)}
                                        onMouseOver={() => handleHeaderMouseOver('col', index + 1)}
                                        onContextMenu={(e) => handleHeaderContextMenu(e, 'col', index + 1)}
                                    >
                                        {colIndexToHeader(index)}
                                        <div className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-indigo-400" onMouseDown={(e) => handleResizeColMouseDown(e, index + 1)}></div>
                                        {index === frozenColCount - 1 && <div className="absolute right-0 top-0 w-0.5 h-full bg-indigo-500 z-50"></div>}
                                    </div>
                                ))}
                             </div>

                             {columnLefts.slice(startCol, endCol + 1).map((left, index) => {
                                 const colIndex = startCol + index + 1;
                                 if (colIndex <= frozenColCount) return null;
                                 return (
                                    <div
                                        key={colIndex}
                                        className={`absolute border-r border-slate-300 flex items-center justify-center text-xs font-semibold text-slate-600 select-none ${selectingHeader === 'col' && selection.range.start.col <= colIndex && selection.range.end.col >= colIndex ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 hover:bg-slate-200'}`}
                                        style={{ left, width: getColWidth(colIndex), height: HEADER_HEIGHT }}
                                        onMouseDown={(e) => handleHeaderMouseDown(e, 'col', colIndex)}
                                        onMouseOver={() => handleHeaderMouseOver('col', colIndex)}
                                        onContextMenu={(e) => handleHeaderContextMenu(e, 'col', colIndex)}
                                    >
                                        {colIndexToHeader(colIndex - 1)}
                                        <div className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-indigo-400" onMouseDown={(e) => handleResizeColMouseDown(e, colIndex)}></div>
                                    </div>
                                 )
                             })}
                        </div>

                        {/* Row Headers */}
                        <div ref={rowHeaderRef} className="sticky left-0 z-20 bg-slate-100 border-r border-slate-300" style={{ top: HEADER_HEIGHT, height: totalHeight, width: ROW_HEADER_WIDTH }}>
                             {/* Frozen Rows Header */}
                             <div ref={frozenRowsRef} className="sticky top-0 z-30 bg-slate-200 border-b border-slate-300" style={{ height: frozenHeight, overflow: 'hidden' }}>
                                 {rowTops.slice(0, frozenRowCount).map((top, index) => (
                                     <div
                                        key={index}
                                        className={`absolute border-b border-slate-300 flex items-center justify-center text-xs font-semibold text-slate-600 select-none ${selectingHeader === 'row' && selection.range.start.row <= index + 1 && selection.range.end.row >= index + 1 ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 hover:bg-slate-200'}`}
                                        style={{ top, height: getRowHeight(index + 1), width: ROW_HEADER_WIDTH }}
                                        onMouseDown={(e) => handleHeaderMouseDown(e, 'row', index + 1)}
                                        onMouseOver={() => handleHeaderMouseOver('row', index + 1)}
                                        onContextMenu={(e) => handleHeaderContextMenu(e, 'row', index + 1)}
                                     >
                                         {index + 1}
                                         <div className="absolute bottom-0 left-0 h-1 w-full cursor-row-resize hover:bg-indigo-400" onMouseDown={(e) => handleResizeRowMouseDown(e, index + 1)}></div>
                                         {index === frozenRowCount - 1 && <div className="absolute bottom-0 left-0 h-0.5 w-full bg-indigo-500 z-50"></div>}
                                     </div>
                                 ))}
                             </div>

                             {rowTops.slice(startRow - 1, endRow).map((top, index) => {
                                 const rowIndex = startRow + index;
                                 if (rowIndex <= frozenRowCount) return null;
                                 return (
                                    <div
                                        key={rowIndex}
                                        className={`absolute border-b border-slate-300 flex items-center justify-center text-xs font-semibold text-slate-600 select-none ${selectingHeader === 'row' && selection.range.start.row <= rowIndex && selection.range.end.row >= rowIndex ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 hover:bg-slate-200'}`}
                                        style={{ top, height: getRowHeight(rowIndex), width: ROW_HEADER_WIDTH }}
                                        onMouseDown={(e) => handleHeaderMouseDown(e, 'row', rowIndex)}
                                        onMouseOver={() => handleHeaderMouseOver('row', rowIndex)}
                                        onContextMenu={(e) => handleHeaderContextMenu(e, 'row', rowIndex)}
                                    >
                                        {rowIndex}
                                        <div className="absolute bottom-0 left-0 h-1 w-full cursor-row-resize hover:bg-indigo-400" onMouseDown={(e) => handleResizeRowMouseDown(e, rowIndex)}></div>
                                    </div>
                                 )
                             })}
                        </div>

                        {/* Main Grid Cells */}
                        <div className="absolute" style={{ top: HEADER_HEIGHT, left: ROW_HEADER_WIDTH }}>
                             {/* Render Frozen Panes */}
                             {frozenRowCount > 0 && (
                                 <div className="sticky top-0 z-20 bg-white shadow-sm" style={{ height: frozenHeight, width: totalWidth }}>
                                     {renderCells(1, frozenRowCount, 1, Math.max(endCol, frozenColCount))}
                                 </div>
                             )}
                             {frozenColCount > 0 && (
                                 <div className="sticky left-0 z-20 bg-white shadow-sm" style={{ top: frozenHeight, width: frozenWidth, height: totalHeight - frozenHeight }}>
                                     {renderCells(Math.max(startRow, frozenRowCount + 1), endRow, 1, frozenColCount)}
                                 </div>
                             )}
                             
                             {/* Render Main Viewport */}
                             {renderCells(Math.max(startRow, frozenRowCount + 1), endRow, Math.max(startCol + 1, frozenColCount + 1), endCol + 1)}
                             
                             {/* Selection Overlay */}
                             <div className="absolute border-2 border-indigo-500 pointer-events-none z-10" style={selectionStyle}>
                                 <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-indigo-500 border border-white cursor-crosshair pointer-events-auto" draggable onDragStart={handleDragFillStart} onDragEnd={handleDragFillEnd}></div>
                             </div>
                             
                             {/* Drag Fill Overlay */}
                             {dragOverRange && (
                                <div className="absolute border-2 border-dashed border-gray-500 bg-gray-200/30 pointer-events-none z-20" style={dragOverStyle}></div>
                             )}

                             {/* Cut Overlay */}
                             {clipboard?.isCut && (
                                <div className="absolute border-2 border-dashed border-orange-500 bg-orange-100/20 pointer-events-none z-10" style={cutStyle}></div>
                             )}

                             {/* Editing Input Overlay */}
                             {editingCell && editInitiator === 'cell' && (
                                <div
                                    className="absolute z-30 bg-white shadow-lg border-2 border-indigo-500"
                                    style={{
                                        top: rowTops[editingCell.row - 1],
                                        left: columnLefts[editingCell.col - 1],
                                        minWidth: getColWidth(editingCell.col),
                                        minHeight: getRowHeight(editingCell.row),
                                    }}
                                >
                                    <input
                                        ref={editInputRef}
                                        type="text"
                                        value={editorContent}
                                        onChange={(e) => setEditorContent(e.target.value)}
                                        onKeyDown={handleEditorKeyDown}
                                        className="w-full h-full p-1 outline-none font-inherit"
                                    />
                                </div>
                             )}
                        </div>
                    </div>
                </div>

                <CustomsBookFooter 
                    activeCellAddress={activeCellAddress} 
                    summary={summary} 
                    zoomLevel={zoomLevel} 
                    onZoomChange={setZoomLevel} 
                />
            </div>
        </div>
    );
};

export default CustomsBookView;
