import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomsBookCell, CellStyle, Selection, SelectionRange, CellAddress } from '../types';
import { db } from '../db';
import { persianArabicToEnglish } from '../utils/formatters';

const NUM_ROWS = 3000;
const NUM_COLS = 100;

export const getRangeBounds = (range: SelectionRange) => ({
    minRow: Math.min(range.start.row, range.end.row),
    maxRow: Math.max(range.start.row, range.end.row),
    minCol: Math.min(range.start.col, range.end.col),
    maxCol: Math.max(range.start.col, range.end.col),
});

export type ClipboardData = { data: any[][]; styles: (CellStyle | undefined)[][]; sourceRange: SelectionRange; isCut: boolean };
type UndoableItem = CustomsBookCell;
type UndoAction = { bookId: string, before: UndoableItem[]; after: UndoableItem[] };

interface UseCustomsBookClipboardProps {
    targetRef: React.RefObject<HTMLElement>;
    selection: Selection;
    currentBookId: string | null;
    dataMap: Map<string, any>;
    styleMap: Map<string, CellStyle>;
    pushUndoAction: (action: Omit<UndoAction, 'bookId'>) => void;
    setSelection: React.Dispatch<React.SetStateAction<Selection>>;
    addToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

const copyToClipboardWithTextarea = (text: string): boolean => {
    const textArea = document.createElement('textarea');
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        return true;
    } catch (err) {
        console.error('Fallback copy failed', err);
        return false;
    } finally {
        document.body.removeChild(textArea);
    }
};

export const useCustomsBookClipboard = ({
    targetRef,
    selection,
    currentBookId,
    dataMap,
    styleMap,
    pushUndoAction,
    setSelection,
    addToast
}: UseCustomsBookClipboardProps) => {
    const { t } = useTranslation();
    const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

    const copy = useCallback(async (isCut = false) => {
        if (!currentBookId) return;
        const { minRow, maxRow, minCol, maxCol } = getRangeBounds(selection.range);
        const data: any[][] = [];
        const styles: (CellStyle | undefined)[][] = [];
        const textDataRows: string[] = [];
    
        for (let r = minRow; r <= maxRow; r++) {
            const rowData: any[] = [];
            const rowStyles: (CellStyle | undefined)[] = [];
            const rowTextParts: string[] = [];
            for (let c = minCol; c <= maxCol; c++) {
                const value = dataMap.get(`${r}-${c}`) ?? '';
                const style = styleMap.get(`${r}-${c}`);
                rowData.push(value);
                rowStyles.push(style);
                const textValue = String(value).replace(/\n/g, ' ').replace(/\t/g, ' ');
                rowTextParts.push(textValue);
            }
            data.push(rowData);
            styles.push(rowStyles);
            textDataRows.push(rowTextParts.join('\t'));
        }
        const textToCopy = textDataRows.join('\n');
    
        let success = false;
        if ((window as any).electronAPI?.clipboardWriteText) {
            (window as any).electronAPI.clipboardWriteText(textToCopy);
            success = true;
        } else {
            success = copyToClipboardWithTextarea(textToCopy);
        }

        if (!success) {
            addToast(t('toasts.clipboard.copyError'), 'error');
            return;
        }

        if (isCut) {
            setClipboard({ data, styles, sourceRange: selection.range, isCut: true });
            addToast(t('toasts.clipboard.cut'), 'info');
        } else {
            setClipboard(null);
            addToast(t('toasts.clipboard.copied'), 'success');
        }
    }, [selection.range, dataMap, styleMap, addToast, currentBookId, t]);

    const cut = useCallback(() => copy(true), [copy]);

    const paste = useCallback(async (clipboardText: string) => {
        if (!currentBookId) return;
        
        const isCutOperation = clipboard?.isCut;
        
        let dataToPaste: any[][];
        let stylesToPaste: (CellStyle | undefined)[][] | undefined;
        let sourceRange: SelectionRange | undefined;
    
        if (isCutOperation) {
            dataToPaste = clipboard.data;
            stylesToPaste = clipboard.styles;
            sourceRange = clipboard.sourceRange;
        } else {
            dataToPaste = clipboardText.split('\n').map(row => row.split('\t').map(cell => cell.replace(/\r$/, '')));
            stylesToPaste = undefined;
        }
    
        if (!dataToPaste || dataToPaste.length === 0 || dataToPaste[0].length === 0) return;
    
        const { row: startRow, col: startCol } = selection.active;
        const numRows = dataToPaste.length;
        const numCols = dataToPaste[0].length;
        
        const targetRange = {
            start: { row: startRow, col: startCol },
            end: { row: startRow + numRows - 1, col: startCol + numCols - 1 }
        };
    
        const beforeState: CustomsBookCell[] = [];
        const afterState: CustomsBookCell[] = [];
        const keysToDeleteFromDB: [string, number, number][] = [];
    
        await db.transaction('rw', db.customsBookCells, async () => {
            const keysToFetch = new Set<string>();
            for (let r = targetRange.start.row; r <= targetRange.end.row; r++) {
                for (let c = targetRange.start.col; c <= targetRange.end.col; c++) {
                    keysToFetch.add(`${currentBookId},${r},${c}`);
                }
            }
            if (isCutOperation && sourceRange) {
                const { minRow, maxRow, minCol, maxCol } = getRangeBounds(sourceRange);
                for (let r = minRow; r <= maxRow; r++) {
                    for (let c = minCol; c <= maxCol; c++) {
                        keysToFetch.add(`${currentBookId},${r},${c}`);
                    }
                }
            }
            const dbKeys = Array.from(keysToFetch).map(k => k.split(',').map((p, i) => i === 0 ? p : Number(p)) as [string, number, number]);
            const existingCells = await db.customsBookCells.bulkGet(dbKeys);
            beforeState.push(...(existingCells.filter(Boolean) as CustomsBookCell[]));
    
            for (let r = 0; r < numRows; r++) {
                for (let c = 0; c < numCols; c++) {
                    const targetRow = startRow + r;
                    const targetCol = startCol + c;
                    if (targetRow > NUM_ROWS || targetCol > NUM_COLS) continue;
    
                    const value = dataToPaste[r % dataToPaste.length][c % dataToPaste[0].length];
                    const style = stylesToPaste ? stylesToPaste[r % stylesToPaste.length]?.[c % stylesToPaste[0].length] : undefined;
                    
                    const existingCell = beforeState.find(cell => cell.row === targetRow && cell.col === targetCol);
                    
                    const hasNewContent = (value !== null && value !== undefined && String(value).trim() !== '') || style;
                    if(hasNewContent) {
                        const newCell: CustomsBookCell = { ...(existingCell || {}), bookId: currentBookId, row: targetRow, col: targetCol, value, style: style || existingCell?.style };
                        afterState.push(newCell);
                    } else if (existingCell) {
                         keysToDeleteFromDB.push([currentBookId, targetRow, targetCol]);
                    }
                }
            }
    
            if (isCutOperation && sourceRange) {
                const { minRow, maxRow, minCol, maxCol } = getRangeBounds(sourceRange);
                for (let r = minRow; r <= maxRow; r++) {
                    for (let c = minCol; c <= maxCol; c++) {
                         const cell = beforeState.find(cell => cell.row === r && cell.col === c);
                         if (cell) {
                            const hasStyle = cell.style && Object.keys(cell.style).length > 0;
                            if (hasStyle) {
                                afterState.push({ ...cell, value: '' });
                            } else {
                                keysToDeleteFromDB.push([currentBookId, r, c]);
                            }
                         }
                    }
                }
            }
    
            const finalKeysToDelete = [...new Set(keysToDeleteFromDB.map(k => k.join(',')))].map(k => k.split(',').map((p, i) => i === 0 ? p : Number(p)) as [string, number, number]);
            if (finalKeysToDelete.length > 0) await db.customsBookCells.bulkDelete(finalKeysToDelete);
            if (afterState.length > 0) await db.customsBookCells.bulkPut(afterState);
        });
    
        pushUndoAction({ before: beforeState, after: afterState });
        
        if (isCutOperation) {
            setClipboard(null);
        }
        
        setSelection({
            active: selection.active,
            range: targetRange,
        });
        
        addToast(t('toasts.clipboard.pasted'), 'info');
    }, [currentBookId, clipboard, selection.active, pushUndoAction, addToast, t, setSelection]);
    
    const pasteFromButton = useCallback(async () => {
        if ((window as any).electronAPI?.clipboardReadText) {
            try {
                const clipboardText = await (window as any).electronAPI.clipboardReadText();
                if (clipboardText) await paste(clipboardText);
            } catch (err) {
                console.error('Electron clipboard read failed:', err);
                addToast(t('toasts.clipboard.pasteError'), 'error');
            }
            return;
        }

        if (!navigator.clipboard?.readText) {
            addToast(t('toasts.clipboard.pasteNotSupported'), 'error');
            return;
        }

        try {
            const permission = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
            if (permission.state === 'denied') {
                addToast(t('toasts.clipboard.permissionDenied'), 'error');
                return;
            }
            const clipboardText = await navigator.clipboard.readText();
            if (clipboardText) await paste(clipboardText);
        } catch (err) {
            console.error('Failed to read clipboard contents: ', err);
            addToast(t('toasts.clipboard.pasteError'), 'error');
        }
    }, [paste, addToast, t]);

    useEffect(() => {
        const element = targetRef.current;
        if (!element) return;

        const handlePasteEvent = async (event: ClipboardEvent) => {
            event.preventDefault();
            const text = event.clipboardData?.getData('text/plain');
            if (text) {
                await paste(text);
            }
        };

        element.addEventListener('paste', handlePasteEvent);
        return () => {
            element.removeEventListener('paste', handlePasteEvent);
        };
    }, [targetRef, paste]);

    return { copy, cut, paste: pasteFromButton, clipboard };
};