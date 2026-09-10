import ExcelJS from 'exceljs';
import { Product, PurchaseInvoiceItem } from '../types';
import { persianArabicToEnglish } from './formatters';

/**
 * Generates and downloads a beautifully designed Excel template for Purchase Invoices.
 * Users can fill large quantities of rows and re-upload into the system.
 */
export async function downloadPurchaseInvoiceTemplate(): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Newland Order Solution';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('فاکتور خرید (Purchase Invoice)', {
        views: [{ rightToLeft: true, state: 'normal' }],
        properties: { defaultRowHeight: 22 }
    });

    // 1. Title Banner
    sheet.mergeCells('A1:I1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'الگوی استاندارد بارگذاری اقلام فاکتور خرید - شرکت بازرگانی نیولند (NEWLAND)';
    titleCell.font = { name: 'Tahoma', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Slate-800
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 36;

    // 2. Instructions Banner
    sheet.mergeCells('A2:I2');
    const noteCell = sheet.getCell('A2');
    noteCell.value = 'راهنما: ستون «کد داخلی کالا» اختیاری است. در صورت خالی بودن، کالا با تگ «عدم وجود کد داخلی» به صورت موقت وارد می‌شود و تا زمان تکمیل کد داخلی در بخش فاکتورهای خرید، امکان صدور فاکتور فروش برای آن وجود نخواهد داشت. ستون‌های «نام کالا»، «تعداد» و «قیمت واحد» اجباری هستند.';
    noteCell.font = { name: 'Tahoma', size: 9, italic: true, color: { argb: 'FF334155' } };
    noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Slate-100
    noteCell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
    sheet.getRow(2).height = 28;

    // Blank row 3
    sheet.getRow(3).height = 10;

    // 3. Table Column Headers (Row 4)
    const headers = [
        { header: 'کد داخلی کالا (Internal Code)', key: 'internalCode', width: 22 },
        { header: 'پارت نامبر / کد سازنده (Part Number)', key: 'partNumber', width: 24 },
        { header: 'نام و شرح کالا (Product Name) *', key: 'productName', width: 38 },
        { header: 'تعداد (Quantity) *', key: 'quantity', width: 14 },
        { header: 'قیمت واحد (Unit Price) *', key: 'unitPrice', width: 16 },
        { header: 'تعداد کارتن (Cartons)', key: 'cartonCount', width: 15 },
        { header: 'حجم کل متر مکعب (CBM)', key: 'cbm', width: 16 },
        { header: 'وزن ناخالص کیلوگرم (Gross Weight)', key: 'grossWeight', width: 20 },
        { header: 'توضیحات و مشخصات (Notes)', key: 'notes', width: 28 }
    ];

    sheet.getRow(4).values = headers.map(h => h.header);
    sheet.getRow(4).height = 28;
    sheet.columns = headers.map(h => ({ width: h.width }));

    // Style Header Row
    const headerRow = sheet.getRow(4);
    headerRow.eachCell((cell) => {
        cell.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Blue-600
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
            top: { style: 'medium', color: { argb: 'FF1D4ED8' } },
            bottom: { style: 'medium', color: { argb: 'FF1D4ED8' } },
            left: { style: 'thin', color: { argb: 'FF93C5FD' } },
            right: { style: 'thin', color: { argb: 'FF93C5FD' } }
        };
    });

    // 4. Sample Rows
    const sampleRows = [
        {
            internalCode: 'NL-SMX-101',
            partNumber: 'SMX-500W-SL',
            productName: 'همزن کاسه‌دار ۵ لیتری حرفه‌ای ۵۰۰ وات نیولند',
            quantity: 120,
            unitPrice: 42.5,
            cartonCount: 30,
            cbm: 3.8,
            grossWeight: 540,
            notes: 'رنگ استیل/مشکی - بسته‌بندی ۵ لایه'
        },
        {
            internalCode: 'NL-BL-202',
            partNumber: 'BL-800G-BK',
            productName: 'مخلوط‌کن شیشه‌ای ۸۰۰ وات با آسیاب پیرکس',
            quantity: 200,
            unitPrice: 28.0,
            cartonCount: 50,
            cbm: 4.2,
            grossWeight: 650,
            notes: 'تیغه تیتانیوم ۶ پره'
        },
        {
            internalCode: '', // Intentionally blank for demonstration of temporary entry
            partNumber: 'AF-DIGI-5L',
            productName: 'سرخ‌کن بدون روغن دیجیتال لمسی ۵ لیتری (کالای جدید)',
            quantity: 150,
            unitPrice: 55.0,
            cartonCount: 38,
            cbm: 5.4,
            grossWeight: 720,
            notes: '⚠️ کد داخلی خالی است (ورود موقت ثبت می‌شود)'
        },
        {
            internalCode: 'NL-KT-303',
            partNumber: 'KT-2200-SS',
            productName: 'کتری برقی استیل ضدزنگ ۲۲۰۰ وات ۱.۷ لیتری',
            quantity: 300,
            unitPrice: 16.5,
            cartonCount: 50,
            cbm: 3.5,
            grossWeight: 420,
            notes: 'پایه چرخشی ۳۶۰ درجه'
        }
    ];

    sampleRows.forEach((row, idx) => {
        const r = sheet.addRow([
            row.internalCode,
            row.partNumber,
            row.productName,
            row.quantity,
            row.unitPrice,
            row.cartonCount,
            row.cbm,
            row.grossWeight,
            row.notes
        ]);
        r.height = 24;

        const isEven = idx % 2 === 0;
        const bgColor = isEven ? 'FFFFFFFF' : 'FFF8FAFC'; // White or Slate-50

        r.eachCell((cell, colNum) => {
            cell.font = { name: 'Tahoma', size: 9, color: { argb: 'FF1E293B' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };

            // Formatting
            if (colNum === 1) {
                // Internal Code column
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                if (!cell.value) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Amber light highlight
                }
            } else if (colNum === 2) {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            } else if (colNum === 3) {
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
            } else if (colNum >= 4 && colNum <= 8) {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                if (colNum === 5 || colNum === 7) {
                    cell.numFmt = '#,##0.00';
                } else {
                    cell.numFmt = '#,##0';
                }
            } else {
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
            }
        });
    });

    // Generate and download buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Newland_Purchase_Invoice_Template_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

export interface ExcelParseResult {
    items: PurchaseInvoiceItem[];
    totalRows: number;
    validCount: number;
    missingCodeCount: number;
    totalAmount: number;
    warnings: string[];
}

/**
 * Parses an uploaded Excel file for Purchase Invoices and validates items against existing products.
 */
export async function parsePurchaseInvoiceExcel(
    file: File,
    existingProducts: Product[] = []
): Promise<ExcelParseResult> {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
        throw new Error('فایل اکسل انتخابی دارای شیت معتبر نمی‌باشد.');
    }

    // Product lookup map by internal code and supplier code
    const productByCode = new Map<string, Product>();
    const productByPartNumber = new Map<string, Product>();
    const productByName = new Map<string, Product>();

    existingProducts.forEach(p => {
        if (p.internalCode) {
            productByCode.set(p.internalCode.trim().toLowerCase(), p);
        }
        if (p.supplierCode) {
            productByPartNumber.set(p.supplierCode.trim().toLowerCase(), p);
        }
        if (p.description) {
            productByName.set(p.description.trim().toLowerCase(), p);
        }
        if (p.productNameFa) {
            productByName.set(p.productNameFa.trim().toLowerCase(), p);
        }
    });

    // Detect header row (look for 'code', 'internal', 'کد', 'نام', 'name', 'qty', 'تعداد')
    let headerRowIndex = 4;
    for (let r = 1; r <= 15; r++) {
        const row = sheet.getRow(r);
        const rowValues = (row.values as any[]) || [];
        const rowText = rowValues.map(v => (v ? String(v).toLowerCase() : '')).join(' ');
        if (
            (rowText.includes('کد') || rowText.includes('code') || rowText.includes('internal')) &&
            (rowText.includes('نام') || rowText.includes('name') || rowText.includes('product')) &&
            (rowText.includes('تعداد') || rowText.includes('qty') || rowText.includes('quantity') || rowText.includes('قیمت') || rowText.includes('price'))
        ) {
            headerRowIndex = r;
            break;
        }
    }

    // Map column indices from header row
    const headerRow = sheet.getRow(headerRowIndex);
    let colInternalCode = -1;
    let colPartNumber = -1;
    let colProductName = -1;
    let colQty = -1;
    let colPrice = -1;
    let colCartons = -1;
    let colCBM = -1;
    let colGrossWeight = -1;
    let colNotes = -1;

    headerRow.eachCell((cell, colNumber) => {
        const txt = (cell.value ? String(cell.value) : '').toLowerCase().trim();
        if (txt.includes('کد داخلی') || (txt.includes('internal') && txt.includes('code'))) {
            colInternalCode = colNumber;
        } else if (txt.includes('پارت') || txt.includes('part') || txt.includes('سازنده') || txt.includes('supplier')) {
            colPartNumber = colNumber;
        } else if (txt.includes('نام') || txt.includes('شرح') || txt.includes('product') || txt.includes('name') || txt.includes('description')) {
            colProductName = colNumber;
        } else if (txt.includes('تعداد') || txt.includes('qty') || txt.includes('quantity') || txt.includes('مقدار')) {
            colQty = colNumber;
        } else if (txt.includes('قیمت') || txt.includes('price') || txt.includes('نرخ') || txt.includes('فی')) {
            colPrice = colNumber;
        } else if (txt.includes('کارتن') || txt.includes('carton') || txt.includes('ctn')) {
            colCartons = colNumber;
        } else if (txt.includes('cbm') || txt.includes('حجم') || txt.includes('volume')) {
            colCBM = colNumber;
        } else if (txt.includes('وزن') || txt.includes('weight') || txt.includes('gross')) {
            colGrossWeight = colNumber;
        } else if (txt.includes('توضیح') || txt.includes('note') || txt.includes('مشخصات')) {
            colNotes = colNumber;
        }
    });

    // Fallback standard positions if header matching was partial
    if (colInternalCode === -1) colInternalCode = 1;
    if (colPartNumber === -1) colPartNumber = 2;
    if (colProductName === -1) colProductName = 3;
    if (colQty === -1) colQty = 4;
    if (colPrice === -1) colPrice = 5;
    if (colCartons === -1) colCartons = 6;
    if (colCBM === -1) colCBM = 7;
    if (colGrossWeight === -1) colGrossWeight = 8;
    if (colNotes === -1) colNotes = 9;

    const items: PurchaseInvoiceItem[] = [];
    const warnings: string[] = [];
    let validCount = 0;
    let missingCodeCount = 0;
    let totalAmount = 0;

    const rowCount = sheet.rowCount;

    for (let r = headerRowIndex + 1; r <= rowCount; r++) {
        const row = sheet.getRow(r);
        const getCellVal = (col: number) => {
            if (col <= 0) return '';
            const cell = row.getCell(col);
            if (!cell || cell.value === null || cell.value === undefined) return '';
            if (typeof cell.value === 'object' && 'result' in cell.value) {
                return (cell.value as any).result ?? '';
            }
            if (typeof cell.value === 'object' && 'text' in cell.value) {
                return (cell.value as any).text ?? '';
            }
            return cell.value;
        };

        const rawInternal = persianArabicToEnglish(String(getCellVal(colInternalCode))).trim();
        const rawPart = persianArabicToEnglish(String(getCellVal(colPartNumber))).trim();
        const rawName = String(getCellVal(colProductName)).trim();
        const rawQty = parseFloat(persianArabicToEnglish(String(getCellVal(colQty))).replace(/,/g, ''));
        const rawPrice = parseFloat(persianArabicToEnglish(String(getCellVal(colPrice))).replace(/,/g, ''));
        const rawCartons = parseFloat(persianArabicToEnglish(String(getCellVal(colCartons))).replace(/,/g, ''));
        const rawCbm = parseFloat(persianArabicToEnglish(String(getCellVal(colCBM))).replace(/,/g, ''));
        const rawGw = parseFloat(persianArabicToEnglish(String(getCellVal(colGrossWeight))).replace(/,/g, ''));
        const rawNotes = String(getCellVal(colNotes)).trim();

        // Skip completely empty rows
        if (!rawInternal && !rawPart && !rawName && isNaN(rawQty) && isNaN(rawPrice)) {
            continue;
        }

        const quantity = !isNaN(rawQty) && rawQty > 0 ? rawQty : 1;
        const unitPrice = !isNaN(rawPrice) && rawPrice >= 0 ? rawPrice : 0;
        const totalPrice = quantity * unitPrice;
        const cartonCount = !isNaN(rawCartons) && rawCartons > 0 ? rawCartons : Math.ceil(quantity / 1);
        const cbm = !isNaN(rawCbm) ? rawCbm : 0;
        const grossWeight = !isNaN(rawGw) ? rawGw : 0;

        let internalCode = rawInternal;
        let productName = rawName;
        let productId: string | undefined = undefined;
        let matchedProduct: Product | undefined = undefined;
        let hasMissingInternalCode = false;

        // Validation against Product database
        if (internalCode) {
            matchedProduct = productByCode.get(internalCode.toLowerCase());
            if (matchedProduct) {
                productId = matchedProduct.id;
                if (!productName) {
                    productName = matchedProduct.productNameFa || matchedProduct.description;
                }
                hasMissingInternalCode = false;
            } else {
                // Code specified by user, but not in DB yet
                hasMissingInternalCode = false;
            }
        } else {
            // Missing internal code in file -> Try to find by partNumber or Name
            if (rawPart) {
                matchedProduct = productByPartNumber.get(rawPart.toLowerCase());
            }
            if (!matchedProduct && productName) {
                matchedProduct = productByName.get(productName.toLowerCase());
            }

            if (matchedProduct) {
                internalCode = matchedProduct.internalCode;
                productId = matchedProduct.id;
                hasMissingInternalCode = false;
            } else {
                // Truly missing internal code -> Tag as temporary item
                hasMissingInternalCode = true;
                if (!productName) {
                    productName = rawPart ? `کالای جدید (${rawPart})` : `کالای ردیف ${items.length + 1}`;
                }
            }
        }

        if (hasMissingInternalCode) {
            missingCodeCount++;
            warnings.push(`ردیف ${r}: قلم «${productName || 'بدون نام'}» فاقد کد داخلی است و به صورت موقت وارد شد.`);
        } else {
            validCount++;
        }

        totalAmount += totalPrice;

        const itemsPerCarton = matchedProduct?.itemsPerCarton || (cartonCount > 0 ? Math.ceil(quantity / cartonCount) : 1);
        const looseUnits = quantity % itemsPerCarton;
        const unitType = (cartonCount > 0 && looseUnits === 0 && quantity === cartonCount * itemsPerCarton)
            ? 'carton'
            : (looseUnits > 0 && cartonCount > 0)
                ? 'mixed'
                : 'piece';

        const cartonPrice = Number((unitPrice * itemsPerCarton).toFixed(2));

        items.push({
            id: `pitem-${Date.now()}-${items.length}-${Math.random().toString(36).slice(2, 6)}`,
            productId,
            internalCode: internalCode || undefined,
            partNumber: rawPart || undefined,
            productName: productName || `کالای نامشخص ${items.length + 1}`,
            unitType,
            itemsPerCarton,
            quantity,
            cartonCount,
            looseUnits,
            pricingBasis: 'per_unit',
            unitPrice,
            cartonPrice,
            totalPrice,
            cbm,
            grossWeight,
            hasMissingInternalCode,
            notes: rawNotes || undefined
        });
    }

    if (items.length === 0) {
        throw new Error('هیچ ردیف اطلاعاتی معتبری در فایل اکسل یافت نشد. لطفاً از الگوی استاندارد استفاده نمایید.');
    }

    return {
        items,
        totalRows: items.length,
        validCount,
        missingCodeCount,
        totalAmount,
        warnings
    };
}
