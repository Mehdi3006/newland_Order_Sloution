import { persianArabicToEnglish } from './formatters';

// --- Type Definitions ---
type CellAddress = { row: number; col: number };
type DataMap = Map<string, any>;

// --- Constants ---
const SANITIZATION_REGEX = /[^-.\d\s()+*/%e]/gi; // Added '%' to allow percentages

// --- Cell Coordinate Helpers ---

/**
 * Converts a column header like 'A', 'B', 'AA' to a 1-based index.
 * @param header The column header string.
 * @returns The 1-based column index.
 */
const colHeaderToIndex = (header: string): number => {
    let index = 0;
    for (let i = 0; i < header.length; i++) {
        index = index * 26 + (header.charCodeAt(i) - 64);
    }
    return index;
};

/**
 * Converts a cell reference string like 'A1' or 'BC23' to a CellAddress object.
 * @param cellRef The cell reference string.
 * @returns A CellAddress object with 1-based row and col.
 */
export const cellHeaderToIndex = (cellRef: string): CellAddress | null => {
    const match = cellRef.match(/^([A-Z]+)(\d+)$/i);
    if (!match) return null;
    const [, colStr, rowStr] = match;
    return { row: parseInt(rowStr, 10), col: colHeaderToIndex(colStr.toUpperCase()) };
};

/**
 * Converts a 1-based column index to a cell reference string.
 * @param col The 0-based column index.
 * @returns A cell reference string like 'A'.
 */
export const colIndexToHeader = (col: number): string => {
    let header = '';
    let num = col + 1; // Convert to 1-based for calculation
    while (num > 0) {
        let remainder = (num - 1) % 26;
        header = String.fromCharCode(65 + remainder) + header;
        num = Math.floor((num - 1) / 26);
    }
    return header;
};


// --- Formula Evaluation Engine ---

const functions: { [key: string]: (args: number[]) => number } = {
    SUM: (args) => args.reduce((a, b) => a + b, 0),
    AVERAGE: (args) => args.length > 0 ? args.reduce((a, b) => a + b, 0) / args.length : 0,
    COUNT: (args) => args.length,
    MIN: (args) => Math.min(...args),
    MAX: (args) => Math.max(...args),
};

const getNumericValue = (value: any): number | null => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const num = parseFloat(persianArabicToEnglish(String(value).replace(/,/g, '')));
    return isNaN(num) || !isFinite(num) ? null : num;
};

// Recursive evaluation helper to prevent infinite loops
const evaluateCell = (row: number, col: number, dataMap: DataMap, visited: Set<string>): string | number => {
    const key = `${row}-${col}`;
    if (visited.has(key)) {
        throw new Error("Circular reference detected");
    }
    visited.add(key);
    
    let value = dataMap.get(key);
    if (typeof value === 'string' && value.startsWith('=')) {
        // Pass a copy of the visited set for the new evaluation branch
        value = evaluateFormula(value, dataMap, new Set(visited));
    }
    
    visited.delete(key); // Backtrack for this branch
    return value;
};


export const evaluateFormula = (formula: string, dataMap: DataMap, visited: Set<string> = new Set()): string | number => {
    if (typeof formula !== 'string' || !formula.startsWith('=')) {
        return formula;
    }

    let expression = persianArabicToEnglish(formula.substring(1));

    // NEW: Treat a range in parentheses as a SUM function.
    expression = expression.replace(/^\(\s*([A-Z]+\d+\s*:\s*[A-Z]+\d+)\s*\)$/i, 'SUM($1)');

    try {
        expression = expression.replace(/(SUM|AVERAGE|COUNT|MIN|MAX)\(([^)]+)\)/gi, (match, funcName, args) => {
            const func = functions[funcName.toUpperCase()];
            if (!func) throw new Error(`Unknown function ${funcName}`);

            const values: number[] = [];
            
            const rangeMatch = args.match(/^\s*([A-Z]+)(\d+)\s*:\s*([A-Z]+)(\d+)\s*$/i);
            
            if (rangeMatch) {
                const [, startColStr, startRowStr, endColStr, endRowStr] = rangeMatch;
                const startCol = colHeaderToIndex(startColStr.toUpperCase());
                const endCol = colHeaderToIndex(endColStr.toUpperCase());
                const startRow = parseInt(startRowStr, 10);
                const endRow = parseInt(endRowStr, 10);

                const minCol = Math.min(startCol, endCol);
                const maxCol = Math.max(startCol, endCol);
                const minRow = Math.min(startRow, endRow);
                const maxRow = Math.max(startRow, endRow);

                for (let r = minRow; r <= maxRow; r++) {
                    for (let c = minCol; c <= maxCol; c++) {
                        const valFromMap = evaluateCell(r, c, dataMap, visited);
                        const val = getNumericValue(valFromMap);
                        if (val !== null) {
                            values.push(val);
                        }
                    }
                }
            } else {
                const expressionWithValues = args.replace(/([A-Z]+)(\d+)/gi, (cellRef: string) => {
                    const cellAddress = cellHeaderToIndex(cellRef);
                    if (!cellAddress) return '0';
                    const valFromMap = evaluateCell(cellAddress.row, cellAddress.col, dataMap, visited);
                    const val = getNumericValue(valFromMap);
                    return String(val ?? 0);
                });

                const parts = expressionWithValues.split(',');
                for (const part of parts) {
                    const trimmedPart = part.trim();
                    const sanitizedPart = trimmedPart.replace(SANITIZATION_REGEX, '');
                    if (sanitizedPart !== trimmedPart) {
                        throw new Error(`Invalid characters in formula argument: "${trimmedPart}"`);
                    }
                    if (sanitizedPart) {
                        const evaluatablePart = sanitizedPart.replace(/(\d+(\.\d+)?)%/g, '($1/100)');
                        const result = new Function(`return ${evaluatablePart}`)();
                        if (typeof result === 'number' && isFinite(result)) {
                            values.push(result);
                        }
                    }
                }
            }
            return String(func(values));
        });

        expression = expression.replace(/([A-Z]+)(\d+)/gi, (match) => {
            const cellAddress = cellHeaderToIndex(match);
            if (!cellAddress) return '0';
            const valFromMap = evaluateCell(cellAddress.row, cellAddress.col, dataMap, visited);
            const val = getNumericValue(valFromMap);
            return String(val ?? 0);
        });

        const trimmedExpression = expression.trim();
        const sanitizedExpression = trimmedExpression.replace(SANITIZATION_REGEX, '');
        if (sanitizedExpression !== trimmedExpression) {
             throw new Error("Invalid characters in formula");
        }
        
        if (!sanitizedExpression.trim()) return 0;

        const evaluatableExpression = sanitizedExpression.replace(/(\d+(\.\d+)?)%/g, '($1/100)');
        const result = new Function(`return ${evaluatableExpression}`)();
        return typeof result === 'number' ? result : '#ERROR!';

    } catch (error) {
        console.error("Formula evaluation error:", error);
        if (error instanceof Error) {
            if (error.message.includes("Invalid range")) return '#REF!';
            if (error.message.includes("Circular reference")) return '#REF!';
            if (error.message.includes("Invalid characters")) return '#NAME?';
        }
        return '#ERROR!';
    }
};