

import { TFunction } from 'i18next';
import { Order, CurrencyRates, Product, CostingSettings, OrderItem, OrderItemAttribute, Cost, ChecklistTask, ProductImage, NewProductData, CompanyInfo, NewOrderData, MainGroup, Category, SubCategory, Brand, CalendarTask } from '../types';
import i18n from 'i18next';
import ExcelJS from 'exceljs';
import { formatDisplayDate } from './dateUtils';
import { recalculateProductPrices } from './costCalculator';
import { db } from '../db';

// --- Text & Number Formatters ---

export const persianArabicToEnglish = (s: any): string => {
    if (s === null || s === undefined) return '';
    const str = String(s);
    return str
        .replace(/[\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) - 0x06F0))
        .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660))
        .replace(/\u066B/g, '.')
        .replace(/[\u066C\u060C]/g, ',');
};

const getNumericValue = (value: any): number | null => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const strVal = persianArabicToEnglish(String(value)).replace(/,/g, '').trim();
    if (!/^-?\d+(\.\d+)?$/.test(strVal) && !/^-?\.\d+$/.test(strVal)) return null; 
    
    const num = parseFloat(strVal);
    return isNaN(num) || !isFinite(num) ? null : num;
};

export const normalizeNumberInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  const converted = persianArabicToEnglish(input);
  let sanitized = converted.replace(/,/g, '');
  const minusCount = (sanitized.match(/-/g) || []).length;
  if (minusCount > 1 || (minusCount === 1 && sanitized.indexOf('-') !== 0)) {
    sanitized = sanitized.replace(/-/g, '');
  }
  const dotIndex = sanitized.indexOf('.');
  if (dotIndex > -1) {
    sanitized = sanitized.substring(0, dotIndex + 1) + sanitized.substring(dotIndex + 1).replace(/\./g, '');
  }
  sanitized = sanitized.replace(/[^\d.-]/g, '');
  return sanitized;
};

export const formatToman = (value: number, settings: CostingSettings | null): string => {
    const divisor = settings?.rounding?.tomanDisplayDivisor || 1;
    const dividedValue = value / divisor;
    return dividedValue.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

export const getTomanUnitLabel = (settings: CostingSettings | null): string => {
    return '';
};

export const numberToPersianWords = (num: number): string => {
    if (num === 0) return 'صفر';
    if (!num || isNaN(num)) return '';

    const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
    const dahgan = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
    const dahha = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
    const sadgan = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
    const scales = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

    const intPart = Math.floor(Math.abs(num));
    const decPart = Math.round((Math.abs(num) - intPart) * 100);

    const get3Digits = (n: number) => {
        const s = Math.floor(n / 100);
        const d = Math.floor((n % 100) / 10);
        const y = n % 10;
        const parts: string[] = [];
        if (s > 0) parts.push(sadgan[s]);
        if (d === 1) {
            parts.push(dahha[y]);
        } else {
            if (d > 1) parts.push(dahgan[d]);
            if (y > 0) parts.push(yekan[y]);
        }
        return parts.join(' و ');
    };

    let temp = intPart;
    let scaleIndex = 0;
    const wordParts: string[] = [];

    while (temp > 0) {
        const chunk = temp % 1000;
        if (chunk > 0) {
            const chunkWord = get3Digits(chunk);
            const sc = scales[scaleIndex];
            wordParts.unshift(sc ? `${chunkWord} ${sc}` : chunkWord);
        }
        temp = Math.floor(temp / 1000);
        scaleIndex++;
    }

    let result = wordParts.join(' و ');
    if (!result) result = 'صفر';
    if (decPart > 0) {
        result += ` و ${get3Digits(decPart)} صدم`;
    }
    return (num < 0 ? 'منفی ' : '') + result;
};


// --- UI Helpers ---

export const getContainerInfo = (totalCBM: number, t: TFunction): { text: string; className: string } => {
    const CBM_20GP = 29;
    const CBM_40HQ = 69;
    let text = '';
    let className = 'text-slate-600';
    if (totalCBM <= 0) return { text: '', className: '' };
    if (totalCBM < CBM_20GP) {
        const percentage = Math.round((totalCBM / CBM_20GP) * 100);
        text = t('listView.lcl', { percentage });
        className = 'text-red-700';
    } else {
        const full40s = Math.floor(totalCBM / CBM_40HQ);
        const remainder = totalCBM % CBM_40HQ;
        let containers = [];
        if (full40s > 0) {
            containers.push(t('listView.containerCount', { count: full40s, container: "40' HQ" }));
        }
        if (remainder > 0) {
            const percentage = Math.round((remainder / CBM_40HQ) * 100);
            if (full40s > 0) {
                containers.push(t('listView.lastContainerFill', { count: 1, container: "40' HQ", percentage }));
            } else {
                const remainingPercent = 100 - percentage;
                text = t('listView.fills40hq', { fill: percentage, remaining: remainingPercent });
                 className = percentage > 85 ? 'text-green-600' : 'text-indigo-600';
            }
        }
        if (containers.length > 0) {
            text = containers.join(' + ');
            className = 'text-green-600';
        }
    }
    return { text, className };
};

export const getOrderValueInUSD = (order: Order, rates: CurrencyRates): number => {
    return order.items.reduce((sum, item) => {
        let priceInUsd = item.price;
        switch (order.currency) {
            case 'AED':
                priceInUsd = rates.aed > 0 ? item.price / rates.aed : 0;
                break;
            case 'TOMAN':
                priceInUsd = rates.toman > 0 ? item.price / rates.toman : 0;
                break;
            case 'CNY':
                priceInUsd = item.price * rates.cny;
                break;
            case 'USD':
            default:
                priceInUsd = item.price;
        }
        return sum + (priceInUsd * item.quantity);
    }, 0);
};

// --- Clipboard Formatters ---

export const formatCalendarEventsForClipboard = (events: any[], t: TFunction): string => {
    if (!events || events.length === 0) return '';
    
    // Sort events by date
    const sortedEvents = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const lines = sortedEvents.map(event => {
        const dateStr = formatDisplayDate(event.date, i18n.language);
        let typeLabel = '';
        let description = '';
        
        switch(event.type) {
            case 'order_loading': 
                typeLabel = '📦 LOAD'; 
                description = `${event.item.supplier} (${event.item.id})`; 
                break;
            case 'order_payment': 
                typeLabel = '💰 PAY'; 
                description = `${event.item.supplier} (${event.item.id})`; 
                break;
            case 'project_task': 
                typeLabel = '✅ TASK'; 
                description = event.item.title; 
                break;
            case 'calendar_task': 
                typeLabel = event.item.isDone ? '☑️ DONE' : '⬜ TODO'; 
                description = event.item.title; 
                break;
            case 'calendar_note': 
                typeLabel = '📝 NOTE'; 
                description = event.item.content.substring(0, 50).replace(/\n/g, ' '); 
                break;
            default: 
                typeLabel = 'EVENT'; 
                description = 'Unknown event';
        }
        
        return `${dateStr} - ${typeLabel}: ${description}`;
    });
    
    return lines.join('\n');
};

export const formatReminderListForClipboard = (listName: string, tasks: CalendarTask[]): string => {
    const header = `*${listName}*`;
    const items = tasks.map(task => {
        const status = task.isDone ? '[x]' : '[ ]';
        return `- ${status} ${task.title}`;
    });
    return [header, ...items].join('\n');
};


// --- Exporting & Printing ---

const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export async function exportOrderToExcel(
    order: Order,
    finalizedProducts: Product[] | null,
    costingSettings: CostingSettings | null,
    t: TFunction
) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'New Land Order Solution';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(`Order ${order.id}`);

    sheet.mergeCells('A1:B1');
    sheet.getCell('A1').value = t('orderModal.title');
    sheet.getCell('A1').font = { size: 16, bold: true };
    
    let currentRow = 3;
    const summaryData = [
        [t('labels.orderId'), order.id],
        [t('labels.supplier'), order.supplier],
        [t('labels.orderDate'), formatDisplayDate(order.orderDate, i18n.language)],
        [t('labels.loadingDate'), formatDisplayDate(order.approxLoadingDate, i18n.language)],
        [t('labels.volumeCbm'), `${order.volumeCBM} m³`],
    ];

    summaryData.forEach(([label, value]) => {
        sheet.getCell(`A${currentRow}`).value = label;
        sheet.getCell(`A${currentRow}`).font = { bold: true };
        sheet.getCell(`B${currentRow}`).value = value;
        currentRow++;
    });

    currentRow++;

    const itemsHeaderRow = sheet.getRow(currentRow);
    const itemHeaders = [
        t('labels.internalCode'),
        t('orderModal.table.productName'),
        t('orderModal.table.quantity'),
        t('orderModal.table.itemsPerCarton'),
        t('orderModal.table.totalCartons'),
        t('orderModal.table.cartonCbm'),
        t('orderModal.table.totalCbm'),
        t('orderModal.table.grossWeightKg') + '/Ctn',
        t('labels.totalGrossWeightKg'),
        `${t('orderModal.table.unitPrice')} (${order.currency})`,
        `${t('orderModal.table.totalPrice')} (${order.currency})`,
    ];
    if (finalizedProducts && costingSettings) {
        itemHeaders.push(`${t('labels.landedCost')} (AED)`);
        itemHeaders.push(`${t('labels.landedCost')} (${t('common.toman')})`);
    }
    itemsHeaderRow.values = itemHeaders;
    itemsHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    itemsHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    currentRow++;

    order.items.forEach(item => {
        const product = finalizedProducts?.find(p => p.internalCode === item.internalCode);
        const totalCartons = Math.ceil(item.quantity / (item.itemsPerCarton || 1));
        const totalPrice = item.quantity * item.price;
        const totalCBM = totalCartons * item.cartonCBM;
        const totalGrossWeight = totalCartons * (item.grossWeight || 0);

        const rowData: (string | number | undefined)[] = [
            item.internalCode,
            item.productName,
            item.quantity,
            item.itemsPerCarton,
            totalCartons,
            item.cartonCBM,
            totalCBM,
            item.grossWeight,
            totalGrossWeight,
            item.price,
            totalPrice,
        ];

        if (finalizedProducts && costingSettings && product) {
            rowData.push(product.landedCostAED);
            rowData.push(product.landedCostTOMAN);
        }

        const row = sheet.addRow(rowData);
        
        row.getCell(3).numFmt = '#,##0';
        row.getCell(4).numFmt = '#,##0';
        row.getCell(5).numFmt = '#,##0';
        row.getCell(6).numFmt = '#,##0.000';
        row.getCell(7).numFmt = '#,##0.000';
        row.getCell(8).numFmt = '#,##0.00';
        row.getCell(9).numFmt = '#,##0.00';
        row.getCell(10).numFmt = '#,##0.00';
        row.getCell(11).numFmt = '#,##0.00';
        
        if (finalizedProducts && costingSettings && product) {
            row.getCell(12).numFmt = '#,##0.00';
            row.getCell(13).numFmt = '#,##0';
        }
    });

    sheet.columns.forEach(column => {
        if (!column.values) return;
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
            let cellLength = cell.value ? cell.value.toString().length : 0;
            if (cellLength > maxLength) {
                maxLength = cellLength;
            }
        });
        column.width = maxLength < 10 ? 12 : maxLength + 4;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `Order_${order.id}_Export_${new Date().toISOString().split('T')[0]}.xlsx`;

    if ((window as any).electronAPI?.saveExcelFile) {
        const result = await (window as any).electronAPI.saveExcelFile({
            buffer,
            defaultPath: fileName
        });
        if (!result.success && result.error && !result.error.toLowerCase().includes('cancel')) {
            throw new Error(result.error);
        }
    } else {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        triggerDownload(blob, fileName);
    }
}

export async function exportDashboardItemsToExcel(items: any[], t: TFunction) {
     const workbook = new ExcelJS.Workbook();
    workbook.creator = 'New Land Order Solution';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Active Line Items');

    const headers = [
        t('labels.orderId'),
        t('labels.supplier'),
        t('labels.orderDate'),
        t('labels.loadingDate'),
        t('labels.status'),
        t('orderFormModal.table.itemCode'),
        t('orderFormModal.table.supplierCode'),
        t('orderModal.table.productName'),
        t('orderFormModal.table.productNameFa'),
        t('orderModal.table.hsCode'),
        t('orderModal.table.quantity'),
        'Unit',
        t('orderModal.table.itemsPerCarton'),
        t('orderModal.table.totalCartons'),
        t('orderModal.table.cartonCbm'),
        t('orderModal.table.totalCbm'),
        t('orderModal.table.netWeightKg') + '/Ctn',
        t('orderModal.table.grossWeightKg') + '/Ctn',
        t('labels.totalGrossWeightKg'),
        t('orderModal.table.unitPrice'),
        'Currency',
        t('orderModal.table.totalPrice'),
        "Purchase Price (Source)",
        `${t('labels.shipStageCosts')} (USD)`,
        `${t('labels.dubaiStageCosts')} (AED)`,
        `${t('labels.iranStageCosts')} (${t('common.toman')})`,
        `${t('labels.landedCost')} (USD)`,
        `${t('labels.landedCost')} (AED)`,
        `${t('labels.landedCost')} (${t('common.toman')})`
    ];

    const headerRow = sheet.getRow(1);
    headerRow.values = headers;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.columns = headers.map(() => ({ width: 15 }));
    sheet.getColumn(8).width = 35;
    sheet.getColumn(9).width = 25;

    items.forEach(item => {
        const totalCartons = item.itemsPerCarton > 0 ? Math.ceil(item.quantity / item.itemsPerCarton) : 0;
        const totalCBM = totalCartons * (item.cartonCBM || 0);
        const totalGrossWeight = totalCartons * (item.grossWeight || 0);
        const totalPrice = item.quantity * item.price;
        
        const currency = item.currency || 'USD';

        const rowData = [
            item.orderId,
            item.supplier,
            formatDisplayDate(item.orderDate, i18n.language),
            formatDisplayDate(item.loadingDate, i18n.language),
            t(`statuses.${item.status}`, { defaultValue: item.status }),
            item.internalCode,
            item.supplierCode,
            item.productName,
            item.productNameFa,
            item.hsCode,
            item.quantity,
            item.unit || '',
            item.itemsPerCarton,
            totalCartons,
            item.cartonCBM,
            totalCBM,
            item.netWeight,
            item.grossWeight,
            totalGrossWeight,
            item.price,
            currency,
            totalPrice,
            item.purchasePriceInSourceCurrency || item.price,
            item.shipStageCostsUSD,
            item.dubaiStageCostsAED,
            item.iranStageCostsTOMAN,
            item.landedCostUSD,
            item.landedCostAED,
            item.landedCostTOMAN
        ];

        const row = sheet.addRow(rowData);

        [11, 13, 14].forEach(idx => row.getCell(idx).numFmt = '#,##0');
        [15, 16, 17, 18, 19].forEach(idx => row.getCell(idx).numFmt = '#,##0.00');
        [20, 22].forEach(idx => row.getCell(idx).numFmt = '#,##0.00');
        [23, 24, 25, 27, 28].forEach(idx => row.getCell(idx).numFmt = '#,##0.00');
        [26, 29].forEach(idx => row.getCell(idx).numFmt = '#,##0');
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `Active_Items_Export_${new Date().toISOString().split('T')[0]}.xlsx`;

    if ((window as any).electronAPI?.saveExcelFile) {
        const result = await (window as any).electronAPI.saveExcelFile({
            buffer,
            defaultPath: fileName
        });
        if (!result.success && result.error && !result.error.toLowerCase().includes('cancel')) {
            throw new Error(result.error);
        }
    } else {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        triggerDownload(blob, fileName);
    }
}

const getNestedValue = (obj: any, path: string) => path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);

export async function exportProductsToExcel(
    products: (Product & { mainGroup?: MainGroup, category?: Category, subCategory?: SubCategory, brand?: Brand, totalIranCustomsCosts?: number })[],
    columns: string[],
    allColumns: Record<string, string>,
    t: TFunction,
    title: string,
    notes: string,
) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'New Land Order Solution';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(title.replace(/[\\/*?[\]:]/g, '').substring(0, 30) || 'Products Export');

    let currentRow = 1;
    if (title) {
        sheet.mergeCells(`A${currentRow}:D${currentRow}`);
        const titleCell = sheet.getCell(`A${currentRow}`);
        titleCell.value = title;
        titleCell.font = { size: 16, bold: true };
        currentRow += 1;
    }
    if (notes) {
        sheet.mergeCells(`A${currentRow}:D${currentRow}`);
        const notesCell = sheet.getCell(`A${currentRow}`);
        notesCell.value = notes;
        notesCell.alignment = { wrapText: true, vertical: 'top' };
        notesCell.font = { italic: true };
        currentRow += 2;
    }

    const costingSettings = await db.settings.get('perShipmentCostingSettings').then(s => s?.value as CostingSettings | null);

    const formatValueForExcel = (value: any, key: string): string | number | null => {
        if (value === undefined || value === null) return null;

        if (key === 'createdAt' || key === 'finalizedAt') {
            if (typeof value === 'string' && value) return formatDisplayDate(value.split('T')[0], i18n.language);
            return '';
        }

        if (['mainGroup', 'category', 'subCategory', 'brand'].includes(key)) {
            if (typeof value === 'object' && value.name) return i18n.language === 'fa' && value.name_fa ? value.name_fa : value.name;
            return String(value);
        }

        if (key === 'customsValueBasis') return t(`orderFormModal.customsBasisOptions.${value as string}` as any, { defaultValue: value });

        const textFields = ['description', 'productNameFa', 'internalCode', 'supplierCode', 'oldSystemCode', 'hsCode'];
        if (textFields.includes(key)) {
             return String(value);
        }

        if (key.toLowerCase().includes('toman')) {
            const divisor = costingSettings?.rounding?.tomanDisplayDivisor || 1;
            return (typeof value === 'number') ? value / divisor : getNumericValue(value) || 0;
        }

        const numericValue = getNumericValue(value);
        if (numericValue !== null) {
            return numericValue;
        }
        
        return String(value);
    };

    const headers = columns.map(key => allColumns[key] || key);
    const headerRow = sheet.getRow(currentRow);
    headerRow.values = headers;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    currentRow++;

    products.forEach(product => {
        const rowData = columns.map(key => {
            const value = getNestedValue(product, key);
            return formatValueForExcel(value, key);
        });
        sheet.addRow(rowData);
    });

    columns.forEach((key, index) => {
        const colNumber = index + 1;
        if (key.toLowerCase().includes('price') || key.toLowerCase().includes('cost') || key.toLowerCase().includes('aed') || key === 'cartonCBM' || key === 'netWeight' || key === 'grossWeight' || key === 'customsValue') {
            sheet.getColumn(colNumber).numFmt = '#,##0.00';
        } else if (key.toLowerCase().includes('toman')) {
             sheet.getColumn(colNumber).numFmt = '#,##0';
        }
    });

    sheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
            let cellLength = 0;
            if (cell.value) {
                if (typeof cell.value === 'object' && cell.value !== null && 'richText' in cell.value) {
                    cellLength = (cell.value as ExcelJS.CellRichTextValue).richText.reduce((len, rt) => len + rt.text.length, 0);
                } else {
                    cellLength = cell.value.toString().length;
                }
            }
            if (cellLength > maxLength) {
                maxLength = cellLength;
            }
        });
        column.width = maxLength < 12 ? 12 : maxLength + 5;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `${title.replace(/[\/\\?%*:|"<>]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;

    if ((window as any).electronAPI?.saveExcelFile) {
        const result = await (window as any).electronAPI.saveExcelFile({
            buffer,
            defaultPath: fileName
        });
        if (!result.success && result.error && !result.error.toLowerCase().includes('cancel')) {
            throw new Error(result.error);
        }
    } else {
        triggerDownload(new Blob([buffer]), fileName);
    }
}


const getPrintableHtmlWrapper = (title: string, content: string, companyInfo?: CompanyInfo | string, companyLogo?: string): string => {
    const isFarsi = i18n.language === 'fa';
    const infoText = companyInfo
        ? (typeof companyInfo === 'string'
            ? companyInfo
            : (isFarsi && companyInfo.fa ? companyInfo.fa : companyInfo.en))
        : '';
    const headerDir = isFarsi ? 'rtl' : 'ltr';
    const headerAlign = isFarsi ? 'right' : 'left';

    return `
<!DOCTYPE html>
<html lang="${i18n.language}" dir="${i18n.dir()}">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #333; margin: 0; }
        @media print {
            body { margin: 0.7cm; }
        }
        .container { width: 100%; margin: 0 auto; }
        header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; direction: ${headerDir}; }
        .company-info { white-space: pre-wrap; font-size: 9pt; text-align: ${headerAlign}; flex-grow: 1; }
        .logo { max-width: 150px; max-height: 70px; flex-shrink: 0; }
        h1, h2, h3 { color: #111; margin: 0 0 10px 0; }
        h1 { font-size: 16pt; }
        h2 { font-size: 16pt; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; page-break-inside: auto; table-layout: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        thead { display: table-header-group; }
        th, td { border: 1px solid #ccc; padding: 6px; text-align: left; vertical-align: top; }
        th.no-wrap, td.no-wrap { white-space: nowrap; }
        [dir="rtl"] th, [dir="rtl"] td { text-align: right; }
        thead th { background-color: #f2f2f2; font-weight: bold; }
        .text-right { text-align: right; }
        [dir="rtl"] .text-right { text-align: left; }
        .text-center { text-align: center; }
        .font-mono { font-family: monospace; }
        footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 8pt; color: #777; text-align: center; }
        .print-footer { display: none; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="company-info">${infoText}</div>
            ${companyLogo ? `<img src="${companyLogo}" alt="Company Logo" class="logo" />` : ''}
        </header>
        <h1>${title}</h1>
        ${content}
        <footer>${i18n.t('orderModal.printFooter.environmentalMessage')}</footer>
    </div>
</body>
</html>`;
}

// FIX: Updated generatePrintableProductsHtml to use configuration objects, matching the expected 3-6 argument range for calls while maintaining all required data.
export const generatePrintableProductsHtml = (
    products: (Product & { totalIranCustomsCosts?: number, mainGroup?: MainGroup, category?: Category, subCategory?: SubCategory, brand?: Brand })[],
    columns: string[],
    allColumns: Record<string, string>,
    t: TFunction,
    companyConfig: { info: CompanyInfo | string; logo: string },
    docConfig: { title: string; notes: string; costingSettings: CostingSettings | null }
): string => {
    const { info: companyInfo, logo: companyLogo } = companyConfig;
    const { title, notes, costingSettings } = docConfig;
    
    const formatValue = (value: any, key: string) => {
        if (value === undefined || value === null) return '—';
        if (key === 'createdAt' || key === 'finalizedAt') {
            if (typeof value === 'string' && value) {
                return formatDisplayDate(value.split('T')[0], i18n.language);
            }
            return '—';
        }
        if (['mainGroup', 'category', 'subCategory', 'brand'].includes(key)) {
            if (typeof value === 'object' && value.name) return i18n.language === 'fa' && value.name_fa ? value.name_fa : value.name;
            return String(value);
        }
        if (key === 'customsValueBasis') return t(`orderFormModal.customsBasisOptions.${value as string}` as any, { defaultValue: value });
        if (typeof value !== 'number') return String(value);
        if (key.startsWith('profitPercent')) return `${value.toFixed(1)}%`;
        if (key.toLowerCase().includes('toman')) return formatToman(value, costingSettings);
        return value.toLocaleString('en-US', {maximumFractionDigits: 2});
    };
    
    const tableHeader = `
        <thead>
            <tr>
                ${columns.map(key => `<th class="no-wrap">${allColumns[key] || key}</th>`).join('')}
            </tr>
        </thead>
    `;

    const tableBody = `
        <tbody>
            ${products.map(product => `
                <tr>
                    ${columns.map(key => {
                        const value = getNestedValue(product, key);
                        const formattedValue = formatValue(value, key);
                        const isNumeric = (typeof value === 'number' && !key.includes('itemsPerCarton') && !key.includes('internalCode'));
                        return `<td class="${isNumeric ? 'text-right font-mono' : ''} no-wrap">${formattedValue}</td>`;
                    }).join('')}
                </tr>
            `).join('')}
        </tbody>
    `;

    const content = `
        ${notes ? `<p style="white-space: pre-wrap; font-style: italic;">${notes}</p>` : ''}
        <table>
            ${tableHeader}
            ${tableBody}
        </table>
    `;

    return getPrintableHtmlWrapper(title, content, companyInfo, companyLogo);
};

export const generatePrintableCalendarHtml = (
    events: any[],
    title: string,
    t: TFunction,
    companyInfo: CompanyInfo | string,
    companyLogo: string,
): string => {
    const sortedEvents = events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const tableHeader = `
        <thead>
            <tr>
                <th style="width: 20%">${t('labels.date')}</th>
                <th style="width: 15%">Type</th>
                <th>${t('common.description')}</th>
                <th style="width: 15%">${t('labels.status')}</th>
            </tr>
        </thead>
    `;

    const getEventLabel = (type: string) => {
        switch(type) {
            case 'order_loading': return 'Order Loading';
            case 'order_payment': return 'Payment Due';
            case 'project_task': return 'Project Task';
            case 'calendar_task': return 'Task';
            case 'calendar_note': return 'Note';
            default: return type;
        }
    };

    const tableBody = `
        <tbody>
            ${sortedEvents.map(event => {
                let description = '';
                let status = '';
                let typeLabel = getEventLabel(event.type);

                if (event.type.startsWith('order')) {
                    description = `${event.item.supplier} (ID: ${event.item.id})`;
                    status = event.item.status;
                } else if (event.type === 'project_task') {
                    description = event.item.title;
                } else if (event.type === 'calendar_task') {
                    description = event.item.title;
                    status = event.item.isDone ? 'Done' : 'Pending';
                } else if (event.type === 'calendar_note') {
                    description = event.item.content.substring(0, 100);
                }

                return `
                <tr>
                    <td class="text-center font-mono">${formatDisplayDate(event.date, i18n.language)}</td>
                    <td class="text-center"><span style="font-size: 0.85em; font-weight: bold; text-transform: uppercase;">${typeLabel}</span></td>
                    <td>${description}</td>
                    <td class="text-center">${status}</td>
                </tr>
                `;
            }).join('')}
        </tbody>
    `;

    const content = `
        <table>
            ${tableHeader}
            ${tableBody}
        </table>
    `;

    return getPrintableHtmlWrapper(title, content, companyInfo, companyLogo);
};

export type BrochureContent = {
    images: ProductImage[];
    attributes: (OrderItemAttribute & { key_fa?: string; value_fa?: string })[];
    marketingCopyEn: string;
    marketingCopyFa: string;
};

export const generateProductBrochureHtml = (
    product: Product,
    content: BrochureContent,
    companyInfo: CompanyInfo | string,
    companyLogo: string,
    t: TFunction
): string => {
    const { images, attributes, marketingCopyEn, marketingCopyFa } = content;
    const hasTranslations = marketingCopyFa || attributes.some(a => a.key_fa);

    const heroImage = images.length > 0 ? `<img src="${images[0].data}" alt="${images[0].name}" class="hero-image">` : '<div class="hero-image-placeholder"></div>';
    
    const galleryImages = images.slice(1).map(img => `
        <div class="gallery-item">
            <img src="${img.data}" alt="${img.name}">
        </div>
    `).join('');

    const attributesHtml = attributes.map(attr => `
        <tr>
            <td class="key">${attr.key}</td>
            <td class="value">${attr.value}</td>
            ${hasTranslations ? `<td class="value-fa">${attr.value_fa || ''}</td><td class="key-fa">${attr.key_fa || ''}</td>` : ''}
        </tr>
    `).join('');
    
    const isFarsi = i18n.language === 'fa';
    const infoText = companyInfo 
        ? (typeof companyInfo === 'string' 
            ? companyInfo 
            : (isFarsi && companyInfo.fa ? companyInfo.fa : companyInfo.en))
        : '';
    
    const footerHtml = `
      <div class="footer-inner">
          <div class="footer-info">
              <p>${infoText.replace(/\n/g, '<br>')}</p>
          </div>
          <div class="page-number"></div>
      </div>
    `;

    const subtitleParts = [];
    if (product.productNameFa) {
        subtitleParts.push(product.productNameFa);
    }
    if (product.internalCode) {
        subtitleParts.push(`<span dir="ltr">(${product.internalCode})</span>`);
    }
    const subtitleText = subtitleParts.join(' ');

    return `
    <!DOCTYPE html>
    <html lang="${i18n.language}" dir="${i18n.dir()}">
    <head>
        <meta charset="UTF-8">
        <title>Brochure: ${product.description}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Vazirmatn', sans-serif; font-size: 10pt; line-height: 1.5; color: #333; margin: 0; background-color: #f4f4f5; }
            .page { width: 210mm; min-height: 297mm; padding: 15mm; margin: 20px auto; background: white; box-shadow: 0 0 10px rgba(0,0,0,0.1); box-sizing: border-box; display: flex; flex-direction: column; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; }
            .header-title h1 { margin: 0; font-size: 24pt; color: #1e293b; font-weight: 700; }
            .header-title p.subtitle { margin: 0; font-size: 14pt; color: #475569; font-family: 'Vazirmatn', sans-serif; font-weight: 500; }
            .header-logo { max-height: 50px; max-width: 150px; }
            .main-content { display: flex; gap: 20px; margin-top: 20px; flex: 1; }
            .left-column { flex: 2; display: flex; flex-direction: column; }
            .hero-image { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb; }
            .hero-image-placeholder { width: 100%; aspect-ratio: 4 / 3; background-color: #f3f4f6; border-radius: 8px; display:flex; align-items:center; justify-content:center; color: #9ca3af; }
            .copy-section { margin-top: 20px; }
            .copy-section h2 { font-size: 14pt; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
            .copy-section p { font-size: 10pt; color: #475569; margin: 0; white-space: pre-wrap; }
            .right-column { flex: 3; }
            .specs-table { width: 100%; border-collapse: collapse; }
            .specs-table th { background-color: #f1f5f9; padding: 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
            .specs-table td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
            .specs-table tr:last-child td { border-bottom: none; }
            .specs-table .key { font-weight: 500; color: #475569; }
            .specs-table .value { color: #1e293b; }
            .specs-table .key-fa { font-weight: 500; color: #475569; text-align: right; }
            .specs-table .value-fa { color: #1e293b; text-align: right; }
            .gallery-section { margin-top: 20px; }
            .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
            .gallery-item img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb; }
            .footer { margin-top: auto; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; }
            .footer-inner { display: flex; justify-content: center; align-items: center; width: 100%; }
            .page-number { display: none; }

            /* Print-specific styles for single-page PDF */
            @media print {
                html, body {
                    margin: 0;
                    padding: 0;
                    background: white;
                }
                .page {
                    box-shadow: none;
                    margin: 0;
                    padding: 15mm;
                    width: 210mm;
                    box-sizing: border-box;
                    height: auto !important;
                    min-height: 0 !important;
                }
                .printable-header-container, .main-content-container, .printable-footer-container,
                .header-content-wrapper, .main-content-wrapper, .footer-content-wrapper {
                    display: block;
                    padding: 0;
                }
            }
        </style>
    </head>
    <body>
        <div class="page">
            <div class="printable-header-container">
                <div class="header-content-wrapper">
                    <header class="header">
                        <div class="header-title">
                            <h1>${product.description}</h1>
                            <p class="subtitle" dir="rtl">${subtitleText}</p>
                        </div>
                        ${companyLogo ? `<img src="${companyLogo}" alt="Company Logo" class="header-logo" />` : ''}
                    </header>
                </div>
            </div>

            <div class="main-content-container">
                <div class="main-content-wrapper">
                    <div class="main-content">
                        <div class="left-column">
                            ${heroImage}
                            <div class="copy-section">
                                ${marketingCopyEn ? `<h2>Description</h2><p>${marketingCopyEn.replace(/\n/g, '<br>')}</p>` : ''}
                                ${marketingCopyFa ? `<h2 style="margin-top: 15px;" dir="rtl">توضیحات</h2><p dir="rtl">${marketingCopyFa.replace(/\n/g, '<br>')}</p>` : ''}
                            </div>
                        </div>
                        <div class="right-column">
                            <table class="specs-table">
                                <thead>
                                    <tr>
                                        <th style="width: 30%;">Specification</th>
                                        <th>Value</th>
                                        ${hasTranslations ? `<th style="width: 30%; text-align: right;">مقدار</th><th style="width: 30%; text-align: right;">مشخصات</th>` : ''}
                                    </tr>
                                </thead>
                                <tbody dir="rtl">${attributesHtml}</tbody>
                            </table>
                        </div>
                    </div>
                    ${galleryImages ? `
                    <section class="gallery-section">
                        <h2>Image Gallery</h2>
                        <div class="gallery">${galleryImages}</div>
                    </section>
                    ` : ''}
                </div>
            </div>

            <div class="printable-footer-container">
                <div class="footer-content-wrapper">
                     <footer class="footer">
                        ${footerHtml}
                    </footer>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
};


export const generatePrintableOrderHtml = (
    order: Order, 
    rates: CurrencyRates, 
    t: TFunction, 
    options: { includeChecklist: boolean },
    companyInfo: CompanyInfo | string,
    companyLogo: string,
): string => {
    const totalValue = order.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const downPayment = order.payments.find(p => p.type === 'down_payment')?.amountUSD || 0;
    const balance = totalValue - downPayment;
    
    const checklistHtml = (item: OrderItem) => {
        if (!options.includeChecklist || !item.checklist || item.checklist.length === 0) return '';
        const tasksBySection = item.checklist.reduce((acc, task) => {
            const sectionName = i18n.language === 'fa' ? task.section_fa : task.section_en;
            if (!acc[sectionName]) {
                acc[sectionName] = [];
            }
            acc[sectionName].push(task);
            return acc;
        }, {} as Record<string, ChecklistTask[]>);

        return `
            <div style="margin-top: 10px; padding-left: 20px; font-size: 9pt;">
                ${Object.entries(tasksBySection).map(([section, tasks]) => `
                    <h4 style="font-weight: bold; margin: 8px 0 4px 0;">${section}</h4>
                    <ul style="margin: 0; padding-left: 15px; list-style-type: square;">
                        ${tasks.map(task => `<li>[${task.is_done ? 'X' : ' '}] ${i18n.language === 'fa' ? task.task_fa : task.task_en}</li>`).join('')}
                    </ul>
                `).join('')}
            </div>
        `;
    };

    const content = `
        <h2>${t('orderModal.title')}</h2>
        <table>
            <tr>
                <td><strong>${t('labels.supplier')}:</strong></td><td>${order.supplier}</td>
                <td><strong>${t('labels.orderId')}:</strong></td><td class="font-mono">${order.id}</td>
            </tr>
            <tr>
                <td><strong>${t('labels.orderDate')}:</strong></td><td>${formatDisplayDate(order.orderDate, i18n.language)}</td>
                <td><strong>${t('labels.loadingDate')}:</strong></td><td>${formatDisplayDate(order.approxLoadingDate, i18n.language)}</td>
            </tr>
             <tr>
                <td><strong>${t('labels.originPort')}:</strong></td><td>${order.originPort || '-'}</td>
                <td><strong>${t('labels.destinationPort')}:</strong></td><td>${order.destinationPort || '-'}</td>
            </tr>
        </table>

        <h2>${t('common.lineItems')}</h2>
        <table>
            <thead>
                <tr>
                    <th>${t('orderModal.table.productName')}</th>
                    <th class="text-center">${t('orderModal.table.totalCartons')}</th>
                    <th class="text-center">${t('orderModal.table.itemsPerCarton')}</th>
                    <th class="text-center">${t('orderModal.table.quantity')}</th>
                    <th class="text-right">${t('orderModal.table.unitPrice')}</th>
                    <th class="text-right">${t('orderModal.table.totalPrice')}</th>
                </tr>
            </thead>
            <tbody>
                ${order.items.map(item => {
                    const totalCartons = Math.ceil(item.quantity / (item.itemsPerCarton || 1));
                    return `
                    <tr>
                        <td>
                            ${item.productName}
                            ${checklistHtml(item)}
                        </td>
                        <td class="text-center font-mono">${totalCartons.toLocaleString()}</td>
                        <td class="text-center font-mono">${item.itemsPerCarton.toLocaleString()}</td>
                        <td class="text-center font-mono">${item.quantity.toLocaleString()}</td>
                        <td class="text-right font-mono">${item.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${order.currency}</td>
                        <td class="text-right font-mono">${(item.quantity * item.price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${order.currency}</td>
                    </tr>
                `}).join('')}
                <tr>
                    <td colspan="5" class="text-right"><strong>${t('labels.totalValue')}</strong></td>
                    <td class="text-right font-mono"><strong>${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${order.currency}</strong></td>
                </tr>
            </tbody>
        </table>

        <h2>${t('common.payments')}</h2>
        <table>
            <tbody>
                <tr>
                    <td>${t('labels.downPayment')}</td>
                    <td class="text-right font-mono">${downPayment.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD</td>
                </tr>
                 <tr>
                    <td>${t('labels.balance')}</td>
                    <td class="text-right font-mono">${balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${order.currency}</td>
                </tr>
            </tbody>
        </table>
    `;
    return getPrintableHtmlWrapper(`${t('orderModal.title')} ${order.id}`, content, companyInfo, companyLogo);
};

export const generatePackingListHtml = (
    order: Order,
    products: Product[],
    t: TFunction,
    companyInfo: CompanyInfo | string,
    companyLogo: string,
    billTo: string,
): string => {
    let totalQty = 0;
    let totalCartons = 0;
    let totalNetWeight = 0;
    let totalGrossWeight = 0;
    let totalCBM = 0;

    const itemsHtml = order.items.map((item, index) => {
        const product = products.find(p => (p.internalCode && p.internalCode === item.internalCode) || (!p.internalCode && p.description === item.productName));
        if (!product) return '';

        const actualItemsPerCarton = product.itemsPerCarton > 0 ? product.itemsPerCarton : 1;
        const actualTotalCartons = Math.ceil(item.quantity / actualItemsPerCarton);
        
        const itemTotalNetWeight = (product.netWeight || 0) * actualTotalCartons;
        const itemTotalGrossWeight = (product.grossWeight || 0) * actualTotalCartons;
        const itemTotalCBM = (product.cartonCBM || 0) * actualTotalCartons;
        
        totalQty += item.quantity;
        totalCartons += actualTotalCartons;
        totalNetWeight += itemTotalNetWeight;
        totalGrossWeight += itemTotalGrossWeight;
        totalCBM += itemTotalCBM;

        return `
            <tr>
                <td class="text-center">${index + 1}</td>
                <td>${item.internalCode || item.supplierCode}</td>
                <td>${item.productName}</td>
                <td>${item.hsCode || ''}</td>
                <td class="text-center font-mono">${actualTotalCartons.toLocaleString()}</td>
                <td class="text-center font-mono">${actualItemsPerCarton.toLocaleString()}</td>
                <td class="text-center font-mono">${item.quantity.toLocaleString()}</td>
                <td class="text-center font-mono">${(product.netWeight || 0).toFixed(2)}</td>
                <td class="text-center font-mono">${(product.grossWeight || 0).toFixed(2)}</td>
                <td class="text-center font-mono">${(product.cartonCBM || 0).toFixed(3)}</td>
                <td class="text-center font-mono">${itemTotalCBM.toFixed(3)}</td>
                <td class="text-center font-mono">${itemTotalNetWeight.toFixed(2)}</td>
                <td class="text-center font-mono">${itemTotalGrossWeight.toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    const content = `
        <table style="border: none; margin-bottom: 20px;">
            <tr style="border: none;">
                <td style="border: none; width: 50%; vertical-align: top;">
                    <strong>TO:</strong><br>
                    <pre style="font-family: inherit; margin: 0; white-space: pre-wrap;">${billTo}</pre>
                </td>
                <td style="border: none; width: 50%; vertical-align: top; text-align: right;">
                    <strong>No:</strong> ${order.id}<br>
                    <strong>Date:</strong> ${new Date().toLocaleDateString('en-GB')}
                </td>
            </tr>
        </table>
        <table>
            <thead>
                <tr>
                    <th rowspan="2">No</th>
                    <th rowspan="2">${t('orderModal.table.itemCode')}</th>
                    <th rowspan="2" style="width: 30%;">${t('packingList.productName')}</th>
                    <th rowspan="2">${t('orderModal.table.hsCode')}</th>
                    <th colspan="3" class="text-center">QTY</th>
                    <th colspan="2" class="text-center">Weight</th>
                    <th colspan="2" class="text-center">Volume</th>
                    <th colspan="2" class="text-center">Total Weight</th>
                </tr>
                <tr>
                    <th class="text-center">CTN</th>
                    <th class="text-center">QTY/CTN</th>
                    <th class="text-center">QTY</th>
                    <th class="text-center">N.W.</th>
                    <th class="text-center">G.W.</th>
                    <th class="text-center">CBM/CTN</th>
                    <th class="text-center">Total CBM</th>
                    <th class="text-center">Total N.W.</th>
                    <th class="text-center">Total G.W.</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
                <tr style="font-weight: bold; background-color: #f2f2f2;">
                    <td colspan="4" class="text-right"><strong>Total</strong></td>
                    <td class="text-center font-mono">${totalCartons.toLocaleString()}</td>
                    <td></td>
                    <td class="text-center font-mono">${totalQty.toLocaleString()}</td>
                    <td colspan="3"></td>
                    <td class="text-center font-mono">${totalCBM.toFixed(3)}</td>
                    <td class="text-center font-mono">${totalNetWeight.toFixed(2)}</td>
                    <td class="text-center font-mono">${totalGrossWeight.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>
    `;

    return getPrintableHtmlWrapper(t('packingList.title'), content, companyInfo, companyLogo);
};

export const generatePackingListExcel = async (
    order: Order,
    products: Product[],
    billTo: string
) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'New Land Order Solution';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Packing List');

    // Add company header etc. (simplified for brevity, can duplicate structure from HTML logic)
    
    const headers = [
        'No', 'Item Code', 'Description', 'HS Code', 
        'CTN', 'QTY/CTN', 'QTY', 
        'N.W.', 'G.W.', 'CBM/CTN', 'Total CBM', 'Total N.W.', 'Total G.W.'
    ];
    
    const headerRow = sheet.getRow(1);
    headerRow.values = headers;
    headerRow.font = { bold: true };
    
    let currentRow = 2;
    
    order.items.forEach((item, index) => {
        const product = products.find(p => (p.internalCode && p.internalCode === item.internalCode) || (!p.internalCode && p.description === item.productName));
        if (!product) return;

        const actualItemsPerCarton = product.itemsPerCarton > 0 ? product.itemsPerCarton : 1;
        const actualTotalCartons = Math.ceil(item.quantity / actualItemsPerCarton);
        
        const itemTotalNetWeight = (product.netWeight || 0) * actualTotalCartons;
        const itemTotalGrossWeight = (product.grossWeight || 0) * actualTotalCartons;
        const itemTotalCBM = (product.cartonCBM || 0) * actualTotalCartons;

        const row = sheet.addRow([
            index + 1,
            item.internalCode || item.supplierCode,
            item.productName,
            item.hsCode,
            actualTotalCartons,
            actualItemsPerCarton,
            item.quantity,
            product.netWeight,
            product.grossWeight,
            product.cartonCBM,
            itemTotalCBM,
            itemTotalNetWeight,
            itemTotalGrossWeight
        ]);
        currentRow++;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `PackingList_${order.id}.xlsx`;
    
    if ((window as any).electronAPI?.saveExcelFile) {
        await (window as any).electronAPI.saveExcelFile({ buffer, defaultPath: fileName });
    } else {
        triggerDownload(new Blob([buffer]), fileName);
    }
}

export function numberToWords(num: number, currency: 'AED' | 'TOMAN'): string {
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    
    const inWords = (n: number): string => {
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + a[n % 10] : '');
        if (n < 1000) return a[Math.floor(n / 100)] + ' hundred' + (n % 100 !== 0 ? ' ' + inWords(n % 100) : '');
        if (n < 1000000) return inWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
        return 'Number too large';
    };

    const mainPart = Math.floor(num);
    const decimalPart = Math.round((num - mainPart) * 100);
    let result = inWords(mainPart);
    result = result.charAt(0).toUpperCase() + result.slice(1);
    
    const currencyName = currency === 'AED' ? 'UAE Dirham' : 'Toman';
    const centsName = currency === 'AED' ? 'Fils' : '';

    if (decimalPart > 0 && centsName) {
        result += ` ${currencyName} and ${decimalPart} ${centsName}`;
    } else {
        result += ` ${currencyName}`;
    }

    return result + ' Only.';
}

export const generateInvoiceHtml = (
    order: Order,
    products: Product[],
    tier: 'tier1' | 'tier2' | 'tier3',
    currency: 'aed' | 'toman',
    companyInfo: CompanyInfo | string,
    companyLogo: string,
    billTo: string,
    notes: string,
    applyTax: boolean,
    t: TFunction,
    costingSettings: CostingSettings | null
): string => {
    let subtotal = 0;
    let totalCartonsForSum = 0;
    let totalQuantityForSum = 0;
    const numFormatter = new Intl.NumberFormat('en-US');
    const currencyLabel = currency.toUpperCase();

    const itemsHtml = products.map((product, index) => {
        const orderItem = order.items.find(i => (i.internalCode && i.internalCode === product.internalCode) || (!i.internalCode && i.productName === product.description));
        if (!orderItem) return '';

        const quantity = orderItem.quantity;
        const actualItemsPerCarton = product.itemsPerCarton > 0 ? product.itemsPerCarton : 1;
        const actualTotalCartons = Math.ceil(quantity / actualItemsPerCarton);
        
        const unitPrice = product.sellingPrices[currency][tier];
        const totalAmount = quantity * unitPrice;
        subtotal += totalAmount;
        totalCartonsForSum += actualTotalCartons;
        totalQuantityForSum += quantity;

        return `
            <tr>
                <td class="text-center">${index + 1}</td>
                <td>${product.internalCode}</td>
                <td>${product.description}</td>
                <td class="text-center font-mono">${actualTotalCartons.toLocaleString()}</td>
                <td class="text-center font-mono">${actualItemsPerCarton.toLocaleString()}</td>
                <td class="text-center font-mono">${quantity.toLocaleString()}</td>
                <td class="text-right font-mono">${unitPrice.toLocaleString(undefined, { minimumFractionDigits: currency === 'aed' ? 2 : 0 })}</td>
                <td class="text-right font-mono">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: currency === 'aed' ? 2 : 0 })}</td>
            </tr>
        `;
    }).join('');

    const vatSetting = costingSettings?.vat?.[currency];
    const taxAmount = applyTax && vatSetting?.enabled ? subtotal * (vatSetting.value / 100) : 0;
    const total = subtotal + taxAmount;
    
    const content = `
        <table style="border: none; margin-bottom: 20px;">
            <tr style="border: none;">
                <td style="border: none; width: 50%; vertical-align: top;">
                    <strong>${t('invoiceModal.billTo')}:</strong><br>
                    <pre style="font-family: inherit; margin: 0; white-space: pre-wrap;">${billTo}</pre>
                </td>
                <td style="border: none; width: 50%; vertical-align: top; text-align: right;">
                    <strong>${t('invoiceModal.invoice')} #:</strong> ${order.id}<br>
                    <strong>${t('invoiceModal.date')}:</strong> ${formatDisplayDate(new Date().toISOString().split('T')[0], i18n.language)}<br>
                    <strong>${t('invoiceModal.selectCurrency')}:</strong> ${currencyLabel}
                </td>
            </tr>
        </table>
        
        <table>
            <thead>
                <tr>
                    <th rowspan="2">${t('invoiceModal.table.row')}</th>
                    <th rowspan="2">${t('invoiceModal.table.itemCode')}</th>
                    <th rowspan="2" style="width: 30%">${t('invoiceModal.table.description')}</th>
                    <th colspan="3" class="text-center">QTY</th>
                    <th rowspan="2">${t('invoiceModal.table.unitPrice')} (${currencyLabel})</th>
                    <th rowspan="2">${t('invoiceModal.table.totalAmount')} (${currencyLabel})</th>
                </tr>
                 <tr>
                    <th class="text-center">${t('invoiceModal.table.totalCartons')}</th>
                    <th class="text-center">${t('invoiceModal.table.itemsPerCarton')}</th>
                    <th class="text-center">${t('invoiceModal.table.totalQty')}</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>

        <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
            <table style="width: 40%;">
                <tr>
                    <td><strong>${t('invoiceModal.table.totalCartons')}</strong></td>
                    <td class="text-right font-mono">${numFormatter.format(totalCartonsForSum)}</td>
                </tr>
                 <tr>
                    <td><strong>${t('invoiceModal.table.totalQty')}</strong></td>
                    <td class="text-right font-mono">${numFormatter.format(totalQuantityForSum)}</td>
                </tr>
                <tr>
                    <td><strong>${t('invoiceModal.subtotal')}</strong></td>
                    <td class="text-right font-mono">${subtotal.toLocaleString(undefined, { minimumFractionDigits: currency === 'aed' ? 2 : 0 })}</td>
                </tr>
                ${applyTax && vatSetting?.enabled ? `
                <tr>
                    <td><strong>${t('invoiceModal.tax')} (${vatSetting.value}%)</strong></td>
                    <td class="text-right font-mono">${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
                ` : ''}
                <tr style="font-weight: bold; background-color: #f2f2f2;">
                    <td><strong>${t('invoiceModal.total')}</strong></td>
                    <td class="text-right font-mono">${total.toLocaleString(undefined, { minimumFractionDigits: currency === 'aed' ? 2 : 0 })}</td>
                </tr>
            </table>
        </div>
        
        <div style="margin-top: 20px; font-size: 9pt; text-align: center;">
            <p>${numberToWords(total, currency.toUpperCase() as 'AED' | 'TOMAN')}</p>
            ${notes ? `<p><strong>Notes:</strong><br>${notes}</p>` : ''}
        </div>

        <div style="margin-top: 50px; display: flex; justify-content: space-between; font-size: 9pt;">
            <div>_________________________<br>${t('invoiceModal.preparedBy')}</div>
            <div>_________________________<br>${t('invoiceModal.preparedFor')}</div>
            <div>_________________________<br>${t('invoiceModal.signature')}</div>
        </div>
    `;

    return getPrintableHtmlWrapper(`${t('invoiceModal.invoice')} #${order.id}`, content, companyInfo, companyLogo);
};

export async function generateInvoiceExcel(
    order: Order,
    products: Product[],
    tier: 'tier1' | 'tier2' | 'tier3',
    currency: 'aed' | 'toman',
    companyInfo: CompanyInfo | string,
    companyLogo: string,
    billTo: string,
    notes: string,
    applyTax: boolean,
    t: TFunction,
    costingSettings: CostingSettings
) {
     const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Invoice ${order.id}`);
    const currencyLabel = currency.toUpperCase();

    const isFarsi = i18n.language === 'fa';
    if (isFarsi) {
        sheet.views = [{ rightToLeft: true }];
    }

    let currentRow = 1;

    // --- Company Info & Title ---
    const isFarsiInfo = isFarsi && typeof companyInfo === 'object' && companyInfo.fa;
    const infoText = typeof companyInfo === 'string' ? companyInfo : (isFarsiInfo ? companyInfo.fa : companyInfo.en);
    sheet.mergeCells(currentRow, 1, currentRow + (infoText.split('\n').length - 1), 4);
    sheet.getCell(currentRow, 1).value = infoText;
    sheet.getCell(currentRow, 1).alignment = { wrapText: true, vertical: 'top', horizontal: isFarsiInfo ? 'right' : 'left' };
    sheet.getCell(currentRow, 1).font = { name: isFarsiInfo ? 'Vazirmatn' : 'Calibri', size: 11, bold: true };
    currentRow += infoText.split('\n').length + 1;

    sheet.mergeCells(currentRow, 1, currentRow, 9);
    sheet.getCell(currentRow, 1).value = t('invoiceModal.invoice').toUpperCase();
    sheet.getCell(currentRow, 1).font = { size: 18, bold: true };
    sheet.getCell(currentRow, 1).alignment = { horizontal: 'center' };
    currentRow += 2;

    // --- Bill To & Date ---
    const billToRow = currentRow;
    sheet.getCell(billToRow, 1).value = t('invoiceModal.billTo');
    sheet.getCell(billToRow, 1).font = { bold: true };
    sheet.mergeCells(billToRow, 2, billToRow + 3, 5);
    sheet.getCell(billToRow, 2).value = billTo;
    sheet.getCell(billToRow, 2).alignment = { wrapText: true, vertical: 'top' };

    sheet.getCell(billToRow, 7).value = t('invoiceModal.date') + ':';
    sheet.getCell(billToRow, 8).value = new Date();
    sheet.getCell(billToRow, 8).numFmt = 'dd-mmm-yy';
    sheet.getCell(billToRow, 7).font = { bold: true };
    sheet.getCell(billToRow, 7).alignment = { horizontal: 'right' };

    sheet.getCell(billToRow + 1, 7).value = t('invoiceModal.invoice') + ' #:';
    sheet.getCell(billToRow + 1, 8).value = order.id;
    sheet.getCell(billToRow + 1, 7).font = { bold: true };
    sheet.getCell(billToRow + 1, 7).alignment = { horizontal: 'right' };
    currentRow += 5;
    
    // --- Table Headers ---
    const headerRow1 = sheet.getRow(currentRow);
    const headerRow2 = sheet.getRow(currentRow + 1);

    const headers1 = [
        t('invoiceModal.table.row'), t('invoiceModal.table.itemCode'), t('invoiceModal.table.description'), t('orderModal.table.hsCode'),
        'QTY', '', '', t('invoiceModal.table.unitPrice'), t('invoiceModal.table.totalAmount'),
    ];
    headerRow1.values = headers1;

    const headers2 = [
        '', '', '', '',
        t('invoiceModal.table.totalCartons'), t('invoiceModal.table.itemsPerCarton'), t('invoiceModal.table.totalQty'), '', ''
    ];
    headerRow2.values = headers2;

    sheet.mergeCells(currentRow, 1, currentRow + 1, 1); // No
    sheet.mergeCells(currentRow, 2, currentRow + 1, 2); // Item Code
    sheet.mergeCells(currentRow, 3, currentRow + 1, 3); // Description
    sheet.mergeCells(currentRow, 4, currentRow + 1, 4); // HS Code
    sheet.mergeCells(currentRow, 5, currentRow, 7);     // QTY
    sheet.mergeCells(currentRow, 8, currentRow + 1, 8); // Unit Price
    sheet.mergeCells(currentRow, 9, currentRow + 1, 9); // Total Amount

    [headerRow1, headerRow2].forEach((row) => {
        row.font = { bold: true, color: { argb: 'FF000000' } };
        row.alignment = { vertical: 'middle', horizontal: 'center' };
        row.eachCell(cell => {
             cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } };
             cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
    });
    
    currentRow += 2;


    let subtotal = 0;
    let totalCartonsForSum = 0;
    let totalQuantityForSum = 0;
    const numFmt = currency === 'aed' ? `#,##0.00` : `#,##0`;

    products.forEach((product, index) => {
        const orderItem = order.items.find(i => (i.internalCode && i.internalCode === product.internalCode) || (!i.internalCode && i.productName === product.description));
        if (!orderItem) return;

        const quantity = orderItem.quantity;
        const actualItemsPerCarton = product.itemsPerCarton > 0 ? product.itemsPerCarton : 1;
        const actualTotalCartons = Math.ceil(quantity / actualItemsPerCarton);
        
        const unitPrice = product.sellingPrices[currency][tier];
        const totalAmount = quantity * unitPrice;
        subtotal += totalAmount;
        totalCartonsForSum += actualTotalCartons;
        totalQuantityForSum += quantity;

        const row = sheet.addRow([
            index + 1,
            product.internalCode,
            product.description,
            product.hsCode || '',
            actualTotalCartons,
            actualItemsPerCarton,
            quantity,
            unitPrice,
            totalAmount
        ]);
        row.getCell(5).numFmt = '#,##0'; // CTN
        row.getCell(6).numFmt = '#,##0'; // QTY/CTN
        row.getCell(7).numFmt = '#,##0'; // Total QTY
        row.getCell(8).numFmt = numFmt;
        row.getCell(9).numFmt = numFmt;
        row.eachCell(cell => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
    });

    currentRow += products.length + 1;
    
    // --- Footer Totals ---
    sheet.mergeCells(currentRow, 1, currentRow + 4, 6);
    sheet.getCell(currentRow, 1).value = numberToWords(subtotal, currencyLabel as 'AED' | 'TOMAN');
    sheet.getCell(currentRow, 1).font = { bold: true, italic: true };
    sheet.getCell(currentRow, 1).alignment = { vertical: 'middle' };

    sheet.getCell(currentRow, 8).value = t('invoiceModal.subtotal');
    sheet.getCell(currentRow, 9).value = subtotal;
    sheet.getCell(currentRow, 9).numFmt = numFmt;
    sheet.getRow(currentRow).font = { bold: true };
    currentRow++;

    const vatSetting = costingSettings.vat[currency];
    const taxAmount = applyTax && vatSetting.enabled ? subtotal * (vatSetting.value / 100) : 0;
    const total = subtotal + taxAmount;

    if (taxAmount > 0) {
        sheet.getCell(currentRow, 8).value = `${t('invoiceModal.tax')} (${vatSetting.value}%)`;
        sheet.getCell(currentRow, 9).value = taxAmount;
        sheet.getCell(currentRow, 9).numFmt = `#,##0.00`;
        currentRow++;
    }

    sheet.getCell(currentRow, 8).value = t('invoiceModal.total');
    sheet.getCell(currentRow, 9).value = total;
    sheet.getCell(currentRow, 9).numFmt = numFmt;
    sheet.getRow(currentRow).font = { bold: true, size: 12 };
    
    // Auto-size columns
    sheet.columns.forEach((column, index) => {
        if (index === 2) { // Description column
            column.width = 45;
        } else {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, (cell) => {
                const cellLength = cell.value ? cell.value.toString().length : 10;
                if (cellLength > maxLength) maxLength = cellLength;
            });
            column.width = maxLength < 12 ? 12 : maxLength + 2;
        }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `Invoice_${order.id}_${new Date().toISOString().split('T')[0]}.xlsx`;

    if ((window as any).electronAPI?.saveExcelFile) {
        const result = await (window as any).electronAPI.saveExcelFile({
            buffer,
            defaultPath: fileName
        });
        if (!result.success && result.error && !result.error.toLowerCase().includes('cancel')) {
            throw new Error(result.error);
        }
    } else {
        triggerDownload(new Blob([buffer]), fileName);
    }
}

// ... other existing exports ...

export const generateProductImportTemplate = async (
    t: TFunction,
    products: Product[],
    categoriesData: { mainGroups: MainGroup[], categories: Category[], subCategories: SubCategory[], brands: Brand[] }
) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'New Land Order Solution';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Product Import Template');

    // Define columns
    sheet.columns = [
        { header: 'Internal Code (Required)', key: 'internalCode', width: 20 },
        { header: 'Description (EN) (Required)', key: 'description', width: 30 },
        { header: 'Description (FA)', key: 'productNameFa', width: 30 },
        { header: 'Supplier Code', key: 'supplierCode', width: 20 },
        { header: 'Old System Code', key: 'oldSystemCode', width: 20 },
        { header: 'Items/Carton', key: 'itemsPerCarton', width: 15 },
        { header: 'N.W./Ctn (kg)', key: 'netWeight', width: 15 },
        { header: 'G.W./Ctn (kg)', key: 'grossWeight', width: 15 },
        { header: 'CBM/Ctn', key: 'cartonCBM', width: 15 },
        { header: 'HS Code', key: 'hsCode', width: 15 },
        { header: 'Purchase Price (USD)', key: 'purchasePriceUSD', width: 20 },
        { header: 'Ship Stage Cost (USD)', key: 'shipStageCostsUSD', width: 20 },
        { header: 'Dubai Stage Cost (AED)', key: 'dubaiStageCostsAED', width: 20 },
        { header: 'Iran Stage Cost (TOMAN)', key: 'iranStageCostsTOMAN', width: 20 },
        { header: 'Customs Value ($)', key: 'customsValue', width: 20 },
        { header: 'Customs Basis (unit/kg)', key: 'customsValueBasis', width: 20 },
        { header: 'Main Group', key: 'mainGroup', width: 20 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Sub-Category', key: 'subCategory', width: 20 },
        { header: 'Brand', key: 'brand', width: 20 },
        { header: 'Display Order', key: 'order', width: 15 },
    ];

    // Add a sample row to guide the user
    sheet.addRow({
        internalCode: 'SAMPLE-001',
        description: 'Sample Product',
        productNameFa: 'محصول نمونه',
        supplierCode: 'SUP-001',
        oldSystemCode: 'OLD-001',
        itemsPerCarton: 10,
        netWeight: 8.5,
        grossWeight: 9.0,
        cartonCBM: 0.05,
        hsCode: '8509.40',
        purchasePriceUSD: 15.50,
        shipStageCostsUSD: 1.20,
        dubaiStageCostsAED: 5.00,
        iranStageCostsTOMAN: 50000,
        customsValue: 12.00,
        customsValueBasis: 'unit',
        mainGroup: categoriesData.mainGroups[0]?.name || 'Home Appliances',
        category: 'Kitchen',
        subCategory: 'Blenders',
        brand: 'Newland',
        order: 1
    });
    
    // Add validation help/comments for headers
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.getCell(1).note = 'Unique Identifier for the product.';
    headerRow.getCell(16).note = "Must be 'unit' or 'kg'";

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `Product_Import_Template.xlsx`;

    if ((window as any).electronAPI?.saveExcelFile) {
        await (window as any).electronAPI.saveExcelFile({
            buffer,
            defaultPath: fileName
        });
    } else {
        triggerDownload(new Blob([buffer]), fileName);
    }
};

export const parseAndImportProducts = async (buffer: ArrayBuffer): Promise<{ data: any; rowNum: number }[]> => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    
    const parsedData: { data: any; rowNum: number }[] = [];
    
    const headerRow = sheet.getRow(1);
    const keyMap: Record<number, string> = {};
    
    headerRow.eachCell((cell, colNumber) => {
        const header = String(cell.value).toLowerCase().trim();
        if (header.includes('internal code')) keyMap[colNumber] = 'internalCode';
        else if (header.includes('description (en)')) keyMap[colNumber] = 'description';
        else if (header.includes('description (fa)')) keyMap[colNumber] = 'productNameFa';
        else if (header.includes('supplier code')) keyMap[colNumber] = 'supplierCode';
        else if (header.includes('old system')) keyMap[colNumber] = 'oldSystemCode';
        else if (header.includes('items/carton')) keyMap[colNumber] = 'itemsPerCarton';
        else if (header.includes('n.w.')) keyMap[colNumber] = 'netWeight';
        else if (header.includes('g.w.')) keyMap[colNumber] = 'grossWeight';
        else if (header.includes('cbm')) keyMap[colNumber] = 'cartonCBM';
        else if (header.includes('hs code')) keyMap[colNumber] = 'hsCode';
        else if (header.includes('purchase price')) keyMap[colNumber] = 'purchasePriceUSD';
        else if (header.includes('ship stage')) keyMap[colNumber] = 'shipStageCostsUSD';
        else if (header.includes('dubai stage')) keyMap[colNumber] = 'dubaiStageCostsAED';
        else if (header.includes('iran stage')) keyMap[colNumber] = 'iranStageCostsTOMAN';
        else if (header.includes('customs value')) keyMap[colNumber] = 'customsValue';
        else if (header.includes('customs basis')) keyMap[colNumber] = 'customsValueBasis';
        else if (header.includes('main group')) keyMap[colNumber] = 'mainGroup';
        else if (header.includes('category') && !header.includes('sub')) keyMap[colNumber] = 'category';
        else if (header.includes('sub-category')) keyMap[colNumber] = 'subCategory';
        else if (header.includes('brand')) keyMap[colNumber] = 'brand';
        else if (header.includes('display order')) keyMap[colNumber] = 'order';
    });

    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const rowData: any = {};
        let hasData = false;

        row.eachCell((cell, colNumber) => {
            const key = keyMap[colNumber];
            if (key) {
                let value = cell.value;
                if (typeof value === 'object' && value !== null) {
                    if ('text' in value) value = (value as any).text; // Rich text
                    else if ('result' in value) value = (value as any).result; // Formula
                }
                
                // Clean up string values
                if (typeof value === 'string') {
                    value = value.trim();
                    // Handle numbers stored as strings with persian/arabic digits
                    if (['itemsPerCarton', 'netWeight', 'grossWeight', 'cartonCBM', 'purchasePriceUSD', 'shipStageCostsUSD', 'dubaiStageCostsAED', 'iranStageCostsTOMAN', 'customsValue', 'order'].includes(key)) {
                         const num = parseFloat(persianArabicToEnglish(value));
                         if (!isNaN(num)) value = num;
                    }
                }
                
                rowData[key] = value;
                hasData = true;
            }
        });

        if (hasData && rowData.internalCode) {
            parsedData.push({ data: rowData, rowNum: rowNumber });
        }
    });

    return parsedData;
};

export const generateOrderPoTemplate = async (t: TFunction) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Purchase Order Template');

    sheet.columns = [
        { header: 'Supplier', key: 'supplier', width: 25 },
        { header: 'Order/PO Code', key: 'orderInternalCode', width: 20 },
        { header: 'Order Date (YYYY-MM-DD)', key: 'orderDate', width: 20 },
        { header: 'Loading Date (YYYY-MM-DD)', key: 'approxLoadingDate', width: 20 },
        { header: 'Currency', key: 'currency', width: 10 },
        { header: 'Item Internal Code (Product Code)', key: 'itemInternalCode', width: 25 },
        { header: 'Supplier Item Code', key: 'supplierItemCode', width: 20 },
        { header: 'Product Name', key: 'productName', width: 30 },
        { header: 'Product Name (FA)', key: 'productNameFa', width: 30 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Items/Carton', key: 'itemsPerCarton', width: 12 },
        { header: 'Unit Price', key: 'price', width: 12 },
        { header: 'Carton CBM', key: 'cartonCBM', width: 12 },
        { header: 'Net Weight (KG)', key: 'netWeight', width: 15 },
        { header: 'Gross Weight (KG)', key: 'grossWeight', width: 15 },
        { header: 'HS Code', key: 'hsCode', width: 15 },
    ];

    // Add a sample row
    sheet.addRow({
        supplier: 'Sample Supplier',
        orderInternalCode: 'PO-2026-001',
        orderDate: new Date().toISOString().split('T')[0],
        approxLoadingDate: new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0],
        currency: 'USD',
        itemInternalCode: 'PRD-1001',
        supplierItemCode: 'SUP-ITEM-101',
        productName: 'Sample Product',
        productNameFa: 'محصول نمونه',
        quantity: 100,
        itemsPerCarton: 10,
        price: 5.5,
        cartonCBM: 0.05,
        netWeight: 8,
        grossWeight: 9,
        hsCode: '1234.56',
    });

    const buffer = await workbook.xlsx.writeBuffer();
    triggerDownload(new Blob([buffer]), 'PO_Template.xlsx');
};

const extractRawCellValue = (cell: ExcelJS.Cell): any => {
    if (!cell) return null;
    const v = cell.value;
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') {
        if ('result' in v) return (v as any).result;
        if ('text' in v) return (v as any).text;
        if ('richText' in v && Array.isArray((v as any).richText)) {
            return (v as any).richText.map((rt: any) => rt.text).join('');
        }
        if (v instanceof Date) return v;
    }
    return v;
};

const formatExcelDateValue = (val: any): string => {
    if (!val) return '';
    if (val instanceof Date) {
        if (!isNaN(val.getTime())) {
            return val.toISOString().split('T')[0];
        }
    }
    if (typeof val === 'number' && val > 30000 && val < 60000) {
        const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
        if (!isNaN(dateObj.getTime())) {
            return dateObj.toISOString().split('T')[0];
        }
    }
    const str = String(val).trim();
    return str;
};

export const parseOrderFromTemplate = async (buffer: ArrayBuffer, t: TFunction): Promise<{ data: Order | null; errors: string[] }> => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    const errors: string[] = [];
    
    if (!sheet) {
        return { data: null, errors: ["هیچ برگه‌ای در فایل اکسل یافت نشد."] };
    }

    const items: OrderItem[] = [];
    let orderMetadata: Partial<Order> = {};

    // Find header row by scanning rows 1 through 10
    let bestHeaderRowIndex = 1;
    let maxMatchCount = -1;
    const colMap: Record<string, number> = {};

    const knownKeywords = [
        'supplier', 'vendor', 'تامین', 'فروشنده',
        'order', 'po', 'سفارش', 'کد po',
        'product', 'item', 'کالا', 'نام کالا', 'شرح',
        'quantity', 'qty', 'تعداد', 'مقدار',
        'price', 'قیمت',
        'cbm', 'حجم'
    ];

    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
        const row = sheet.getRow(r);
        let count = 0;
        row.eachCell((cell) => {
            const rawStr = String(extractRawCellValue(cell) || '').toLowerCase();
            if (knownKeywords.some(k => rawStr.includes(k))) {
                count++;
            }
        });
        if (count > maxMatchCount) {
            maxMatchCount = count;
            bestHeaderRowIndex = r;
        }
    }

    const headerRow = sheet.getRow(bestHeaderRowIndex);

    headerRow.eachCell((cell, colNumber) => {
        const header = String(extractRawCellValue(cell) || '').toLowerCase().trim();
        if (!header) return;

        if (header.includes('supplier item code') || header.includes('vendor code') || header.includes('supplier code') || header.includes('کد تامین کننده') || header.includes('کد کالا نزد تامین کننده')) {
            colMap['supplierItemCode'] = colNumber;
        } else if (header.includes('item internal code') || header.includes('product code') || header.includes('item code') || header.includes('کد کالا') || header.includes('کد انترنال') || header.includes('کد داخلی کالا') || (header.includes('internal code') && (header.includes('item') || header.includes('product')))) {
            colMap['itemInternalCode'] = colNumber;
        } else if (header.includes('order/po code') || header.includes('po code') || header.includes('po number') || header.includes('order code') || header.includes('کد سفارش') || header.includes('شماره سفارش') || header.includes('کد po') || (header.includes('internal code') && !colMap['itemInternalCode']) || (header.includes('کد داخلی') && !colMap['itemInternalCode'])) {
            colMap['orderInternalCode'] = colNumber;
        } else if (header.includes('supplier') || header.includes('vendor') || header.includes('تامین کننده') || header.includes('فروشنده')) {
            colMap['supplier'] = colNumber;
        } else if (header.includes('order date') || header.includes('تاریخ سفارش')) {
            colMap['orderDate'] = colNumber;
        } else if (header.includes('loading date') || header.includes('approx loading date') || header.includes('shipment date') || header.includes('تاریخ بارگیری') || header.includes('تاریخ خروج')) {
            colMap['loadingDate'] = colNumber;
        } else if (header.includes('currency') || header.includes('ارز') || header.includes('واحد پول')) {
            colMap['currency'] = colNumber;
        } else if (header.includes('product name (fa)') || header.includes('name (fa)') || header.includes('farsi') || header.includes('(fa)') || header.includes('نام فارسی') || header.includes('نام کالا (فارسی)')) {
            colMap['productNameFa'] = colNumber;
        } else if (header.includes('product name') || header.includes('description') || header.includes('item name') || header.includes('نام کالا') || header.includes('شرح کالا') || header.includes('نام جنس')) {
            colMap['productName'] = colNumber;
        } else if (header.includes('quantity') || header === 'qty' || header.includes('تعداد') || header.includes('مقدار')) {
            colMap['quantity'] = colNumber;
        } else if (header.includes('items/carton') || header.includes('qty/ctn') || header.includes('items per carton') || header.includes('pcs/ctn') || header.includes('تعداد در کارتن') || header.includes('تعداد در بسته')) {
            colMap['itemsPerCarton'] = colNumber;
        } else if (header.includes('unit price') || header.includes('price') || header.includes('قیمت واحد') || header.includes('قیمت')) {
            colMap['price'] = colNumber;
        } else if (header.includes('carton cbm') || header.includes('cbm') || header.includes('حجم کارتن') || header.includes('سی بی ام')) {
            colMap['cartonCBM'] = colNumber;
        } else if (header.includes('net weight') || header.includes('n.w') || header.includes('وزن خالص')) {
            colMap['netWeight'] = colNumber;
        } else if (header.includes('gross weight') || header.includes('g.w') || header.includes('وزن ناخالص')) {
            colMap['grossWeight'] = colNumber;
        } else if (header.includes('hs code') || header.includes('hs-code') || header.includes('کد تعرفه') || header.includes('تعرفه')) {
            colMap['hsCode'] = colNumber;
        }
    });

    const getColVal = (row: ExcelJS.Row, key: string, fallbackCol: number): string => {
        const colIdx = colMap[key] || fallbackCol;
        if (!colIdx) return '';
        const cell = row.getCell(colIdx);
        const raw = extractRawCellValue(cell);
        if (raw === null || raw === undefined) return '';
        if (raw instanceof Date) return formatExcelDateValue(raw);
        return String(raw).trim();
    };

    const getColNum = (row: ExcelJS.Row, key: string, fallbackCol: number): number => {
        const colIdx = colMap[key] || fallbackCol;
        if (!colIdx) return 0;
        const cell = row.getCell(colIdx);
        const raw = extractRawCellValue(cell);
        if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
        if (!raw) return 0;
        const cleaned = persianArabicToEnglish(String(raw)).replace(/,/g, '').trim();
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
    };

    const isNewFormat = Boolean(colMap['itemInternalCode'] || colMap['supplierItemCode']);

    sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= bestHeaderRowIndex) return; // Skip header and any top rows

        const supplierCandidate = getColVal(row, 'supplier', 1);
        if (supplierCandidate && !orderMetadata.supplier) {
            orderMetadata.supplier = supplierCandidate;
        }

        const poCodeCandidate = getColVal(row, 'orderInternalCode', 2);
        if (poCodeCandidate && !orderMetadata.internalCode) {
            orderMetadata.internalCode = poCodeCandidate;
        }

        const orderDateCandidate = getColVal(row, 'orderDate', 3);
        if (orderDateCandidate && !orderMetadata.orderDate) {
            orderMetadata.orderDate = formatExcelDateValue(orderDateCandidate);
        }

        const approxLoadingDateCandidate = getColVal(row, 'loadingDate', 4);
        if (approxLoadingDateCandidate && !orderMetadata.approxLoadingDate) {
            orderMetadata.approxLoadingDate = formatExcelDateValue(approxLoadingDateCandidate);
        }

        const currencyCandidate = getColVal(row, 'currency', 5);
        if (currencyCandidate && !orderMetadata.currency) {
            orderMetadata.currency = currencyCandidate as any;
        }

        const productNameCol = isNewFormat ? (colMap['productName'] || 8) : (colMap['productName'] || 6);
        let productName = getColVal(row, 'productName', productNameCol);

        const itemInternalCodeCol = isNewFormat ? (colMap['itemInternalCode'] || 6) : (colMap['orderInternalCode'] || 2);
        const supplierItemCodeCol = isNewFormat ? (colMap['supplierItemCode'] || 7) : 0;
        
        const itemInternalCode = getColVal(row, 'itemInternalCode', itemInternalCodeCol);
        const supplierItemCode = supplierItemCodeCol ? getColVal(row, 'supplierItemCode', supplierItemCodeCol) : '';

        const productNameFaCol = isNewFormat ? (colMap['productNameFa'] || 9) : (colMap['productNameFa'] || 7);
        const quantityCol = isNewFormat ? (colMap['quantity'] || 10) : (colMap['quantity'] || 8);
        const itemsPerCartonCol = isNewFormat ? (colMap['itemsPerCarton'] || 11) : (colMap['itemsPerCarton'] || 9);
        const priceCol = isNewFormat ? (colMap['price'] || 12) : (colMap['price'] || 10);
        const cartonCBMCol = isNewFormat ? (colMap['cartonCBM'] || 13) : (colMap['cartonCBM'] || 11);
        const netWeightCol = isNewFormat ? (colMap['netWeight'] || 14) : (colMap['netWeight'] || 12);
        const grossWeightCol = isNewFormat ? (colMap['grossWeight'] || 15) : (colMap['grossWeight'] || 13);
        const hsCodeCol = isNewFormat ? (colMap['hsCode'] || 16) : (colMap['hsCode'] || 14);

        const quantity = getColNum(row, 'quantity', quantityCol);
        const price = getColNum(row, 'price', priceCol);

        // If productName is empty but item code or quantity exists, fallback productName
        if (!productName && (itemInternalCode || supplierItemCode || quantity > 0)) {
            productName = itemInternalCode || supplierItemCode || `محصول ${items.length + 1}`;
        }

        if (productName) {
            items.push({
                id: crypto.randomUUID(),
                internalCode: itemInternalCode,
                supplierCode: supplierItemCode,
                productName,
                productNameFa: getColVal(row, 'productNameFa', productNameFaCol),
                quantity: quantity,
                itemsPerCarton: getColNum(row, 'itemsPerCarton', itemsPerCartonCol),
                price: price,
                cartonCBM: getColNum(row, 'cartonCBM', cartonCBMCol),
                netWeight: getColNum(row, 'netWeight', netWeightCol),
                grossWeight: getColNum(row, 'grossWeight', grossWeightCol),
                hsCode: getColVal(row, 'hsCode', hsCodeCol),
                attributes: [],
                checklist: [],
                attachments: []
            });
        }
    });

    if (items.length === 0) {
        errors.push("هیچ آیتمی در فایل الگوی اکسل پیدا نشد.");
        return { data: null, errors };
    }
    
    if (!orderMetadata.supplier) {
        orderMetadata.supplier = "تامین کننده نمونه";
    }

    if (!orderMetadata.orderDate) {
        orderMetadata.orderDate = new Date().toISOString().split('T')[0];
    }

    if (!orderMetadata.currency) {
        orderMetadata.currency = 'USD';
    }

    const order: Order = {
        id: '',
        ...orderMetadata as any,
        items,
        status: 'Draft',
        volumeCBM: 0,
        isArchived: false,
        isFinalized: false,
        deletedAt: null,
        manualOrder: 0,
    };

    return { data: order, errors };
};
