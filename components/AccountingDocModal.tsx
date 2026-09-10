import React, { useState, useMemo } from 'react';
import { SalesInvoice, PurchaseInvoice, Product, CompanyInfo } from '../types';
import ExcelJS from 'exceljs';

interface AccountingDocModalProps {
    isOpen: boolean;
    onClose: () => void;
    docType: 'invoice' | 'packing_list';
    invoiceType: 'sales' | 'purchase';
    invoice: SalesInvoice | PurchaseInvoice | null;
    products: Product[];
    companyInfo?: CompanyInfo;
}

export const AccountingDocModal: React.FC<AccountingDocModalProps> = ({
    isOpen,
    onClose,
    docType,
    invoiceType,
    invoice,
    products,
    companyInfo
}) => {
    const [billTo, setBillTo] = useState<string>('');
    const [isExportingExcel, setIsExportingExcel] = useState(false);

    // Default company info fallback
    const sellerInfo = {
        name: companyInfo?.name || 'NewLand International Trading LLC',
        address: companyInfo?.address || 'Dubai, United Arab Emirates',
        phone: companyInfo?.phone || '+971 4 123 4567',
        email: companyInfo?.email || 'info@newlandtrading.com',
        taxNumber: companyInfo?.taxNumber || 'TRN-100239481200003'
    };

    // Extract invoice party info
    const recipientName = useMemo(() => {
        if (!invoice) return '';
        if ('customerName' in invoice) return invoice.customerName;
        if ('supplierName' in invoice) return invoice.supplierName;
        return '';
    }, [invoice]);

    const recipientPhone = useMemo(() => {
        if (!invoice) return '';
        if ('customerPhone' in invoice && invoice.customerPhone) return invoice.customerPhone;
        return '';
    }, [invoice]);

    // Product map for quick lookup
    const productMap = useMemo(() => {
        const map = new Map<string, Product>();
        products.forEach(p => {
            if (p.internalCode) map.set(p.internalCode.toLowerCase(), p);
            if (p.supplierCode) map.set(p.supplierCode.toLowerCase(), p);
            if (p.description) map.set(p.description.toLowerCase(), p);
        });
        return map;
    }, [products]);

    // Calculate detailed line items with specs (carton, weight, CBM)
    const detailedItems = useMemo(() => {
        if (!invoice || !invoice.items) return [];

        return invoice.items.map((item, idx) => {
            const codeKey = (item.internalCode || item.productName || '').toLowerCase();
            const matchedProduct = productMap.get(codeKey);

            const itemsPerCarton = matchedProduct?.itemsPerCarton || 1;
            const grossWeightPerCarton = matchedProduct?.grossWeight || 0;
            const netWeightPerCarton = matchedProduct?.netWeight || 0;
            const cbmPerCarton = matchedProduct?.cartonCBM || 0;

            const totalCartons = Math.ceil((item.quantity || 0) / itemsPerCarton);
            const totalGrossWeight = totalCartons * grossWeightPerCarton;
            const totalNetWeight = totalCartons * netWeightPerCarton;
            const totalCbm = totalCartons * cbmPerCarton;

            return {
                rowNo: idx + 1,
                internalCode: item.internalCode || matchedProduct?.internalCode || 'N/A',
                productName: item.productName || matchedProduct?.description || 'N/A',
                productNameFa: matchedProduct?.productNameFa || '',
                hsCode: matchedProduct?.hsCode || '-',
                quantity: item.quantity || 0,
                unitPrice: item.unitPrice || 0,
                totalPrice: item.totalPrice || ((item.quantity || 0) * (item.unitPrice || 0)),
                itemsPerCarton,
                totalCartons,
                totalGrossWeight,
                totalNetWeight,
                totalCbm
            };
        });
    }, [invoice, productMap]);

    // Totals
    const totals = useMemo(() => {
        const totalQty = detailedItems.reduce((s, i) => s + i.quantity, 0);
        const totalCartons = detailedItems.reduce((s, i) => s + i.totalCartons, 0);
        const totalGrossWeight = detailedItems.reduce((s, i) => s + i.totalGrossWeight, 0);
        const totalNetWeight = detailedItems.reduce((s, i) => s + i.totalNetWeight, 0);
        const totalCbm = detailedItems.reduce((s, i) => s + i.totalCbm, 0);
        const grandTotal = detailedItems.reduce((s, i) => s + i.totalPrice, 0);

        return {
            totalQty,
            totalCartons,
            totalGrossWeight,
            totalNetWeight,
            totalCbm,
            grandTotal
        };
    }, [detailedItems]);

    // Generate Printable HTML
    const htmlContent = useMemo(() => {
        if (!invoice) return '<div>No Document Data</div>';

        const titleText = docType === 'invoice' 
            ? (invoiceType === 'sales' ? 'COMMERCIAL SALES INVOICE / فاکتور رسمی فروش' : 'COMMERCIAL PURCHASE INVOICE / فاکتور رسمی خرید')
            : 'OFFICIAL PACKING LIST / لیست بسته‌بندی محموله';

        const partyLabel = invoiceType === 'sales' ? 'BUYER / خریدار:' : 'SUPPLIER / تامین‌کننده:';

        if (docType === 'invoice') {
            return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>${titleText} - ${invoice.invoiceNumber}</title>
    <style>
        body { font-family: 'Tahoma', 'Segoe UI', sans-serif; margin: 0; padding: 25px; color: #1e293b; background: #fff; font-size: 12px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #334155; padding-bottom: 15px; margin-bottom: 20px; }
        .logo-title h1 { margin: 0; font-size: 18px; color: #0f172a; font-weight: bold; }
        .logo-title p { margin: 3px 0 0 0; font-size: 11px; color: #64748b; }
        .doc-meta { text-align: left; direction: ltr; }
        .doc-meta h2 { margin: 0; font-size: 16px; color: #2563eb; font-weight: bold; }
        .doc-meta p { margin: 3px 0; font-size: 11px; color: #334155; font-family: monospace; }
        .parties { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
        .party-box { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #f8fafc; }
        .party-box h3 { margin: 0 0 8px 0; font-size: 12px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .party-box p { margin: 3px 0; font-size: 11px; color: #475569; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        th { background: #1e293b; color: #fff; padding: 8px; text-align: center; font-weight: bold; border: 1px solid #334155; }
        td { padding: 8px; border: 1px solid #cbd5e1; text-align: center; }
        tr:nth-child(even) { background: #f8fafc; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .totals-row { font-weight: bold; background: #e2e8f0 !important; }
        .footer-sig { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; }
        .sig-box { width: 40%; border-top: 1px dashed #64748b; padding-top: 8px; font-size: 11px; color: #475569; }
        @media print {
            body { padding: 0; font-size: 11px; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-title">
            <h1>${sellerInfo.name}</h1>
            <p>${sellerInfo.address} | Tel: ${sellerInfo.phone}</p>
            <p>TRN: ${sellerInfo.taxNumber}</p>
        </div>
        <div class="doc-meta">
            <h2>${titleText}</h2>
            <p><strong>INVOICE NO:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>DATE:</strong> ${invoice.date}</p>
            <p><strong>CURRENCY:</strong> ${invoice.currency}</p>
        </div>
    </div>

    <div class="parties">
        <div class="party-box">
            <h3>SELLER / صادرکننده:</h3>
            <p><strong>${sellerInfo.name}</strong></p>
            <p>${sellerInfo.address}</p>
            <p>تلفن: ${sellerInfo.phone}</p>
        </div>
        <div class="party-box">
            <h3>${partyLabel}</h3>
            <p><strong>${recipientName}</strong></p>
            ${recipientPhone ? `<p>تلفن: ${recipientPhone}</p>` : ''}
            ${billTo ? `<p>${billTo.replace(/\n/g, '<br>')}</p>` : ''}
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 40px;">#</th>
                <th style="width: 100px;">کد کالا</th>
                <th>نام کالا / Description</th>
                <th style="width: 70px;">کد HS</th>
                <th style="width: 60px;">تعداد</th>
                <th style="width: 90px;">قیمت واحد (${invoice.currency})</th>
                <th style="width: 110px;">مبلغ کل (${invoice.currency})</th>
            </tr>
        </thead>
        <tbody>
            ${detailedItems.map(item => `
                <tr>
                    <td>${item.rowNo}</td>
                    <td style="font-family: monospace; font-weight: bold;">${item.internalCode}</td>
                    <td class="text-right">
                        <strong>${item.productName}</strong>
                        ${item.productNameFa ? `<div style="font-size:10px; color:#64748b;">${item.productNameFa}</div>` : ''}
                    </td>
                    <td style="font-family: monospace;">${item.hsCode}</td>
                    <td style="font-family: monospace; font-weight: bold;">${item.quantity.toLocaleString()}</td>
                    <td style="font-family: monospace;">${item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td style="font-family: monospace; font-weight: bold;">${item.totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
            `).join('')}
            <tr class="totals-row">
                <td colspan="4" class="text-right">جمع کل (Grand Total):</td>
                <td style="font-family: monospace;">${totals.totalQty.toLocaleString()}</td>
                <td>-</td>
                <td style="font-family: monospace; color: #2563eb; font-size: 13px;">${totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${invoice.currency}</td>
            </tr>
        </tbody>
    </table>

    <div style="background: #f1f5f9; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; margin-top: 15px;">
        <strong style="color: #334155;">توضیحات و شرایط پرداخت:</strong>
        <p style="margin: 4px 0 0 0; color: #475569; font-size: 11px;">
            ${invoice.notes || 'کالای موضوع این فاکتور بر اساس مشخصات فنی و تاییدیه خریدار تحویل داده می‌شود.'}
        </p>
    </div>

    <div class="footer-sig">
        <div class="sig-box">
            امضاء و مهر فروشنده / Authorized Signature
        </div>
        <div class="sig-box">
            امضاء و مهر خریدار / Buyer Acceptance
        </div>
    </div>
</body>
</html>
            `;
        } else {
            // PACKING LIST HTML
            return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>${titleText} - ${invoice.invoiceNumber}</title>
    <style>
        body { font-family: 'Tahoma', 'Segoe UI', sans-serif; margin: 0; padding: 25px; color: #1e293b; background: #fff; font-size: 12px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; }
        .logo-title h1 { margin: 0; font-size: 18px; color: #0f172a; font-weight: bold; }
        .logo-title p { margin: 3px 0 0 0; font-size: 11px; color: #64748b; }
        .doc-meta { text-align: left; direction: ltr; }
        .doc-meta h2 { margin: 0; font-size: 16px; color: #059669; font-weight: bold; }
        .doc-meta p { margin: 3px 0; font-size: 11px; color: #334155; font-family: monospace; }
        .parties { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
        .party-box { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #f8fafc; }
        .party-box h3 { margin: 0 0 8px 0; font-size: 12px; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .party-box p { margin: 3px 0; font-size: 11px; color: #475569; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        th { background: #0f172a; color: #fff; padding: 8px; text-align: center; font-weight: bold; border: 1px solid #334155; }
        td { padding: 8px; border: 1px solid #cbd5e1; text-align: center; }
        tr:nth-child(even) { background: #f8fafc; }
        .text-right { text-align: right; }
        .totals-row { font-weight: bold; background: #d1fae5 !important; color: #065f46; }
        .footer-sig { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; }
        .sig-box { width: 40%; border-top: 1px dashed #64748b; padding-top: 8px; font-size: 11px; color: #475569; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo-title">
            <h1>${sellerInfo.name}</h1>
            <p>${sellerInfo.address} | Tel: ${sellerInfo.phone}</p>
        </div>
        <div class="doc-meta">
            <h2>${titleText}</h2>
            <p><strong>INVOICE REF:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>DATE:</strong> ${invoice.date}</p>
        </div>
    </div>

    <div class="parties">
        <div class="party-box">
            <h3>CONSIGNOR / فرستنده:</h3>
            <p><strong>${sellerInfo.name}</strong></p>
            <p>${sellerInfo.address}</p>
        </div>
        <div class="party-box">
            <h3>CONSIGNEE / گیرنده:</h3>
            <p><strong>${recipientName}</strong></p>
            ${recipientPhone ? `<p>تلفن: ${recipientPhone}</p>` : ''}
            ${billTo ? `<p>${billTo.replace(/\n/g, '<br>')}</p>` : ''}
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 35px;">#</th>
                <th style="width: 100px;">کد کالا</th>
                <th>نام کالا / Description</th>
                <th style="width: 70px;">تعداد کل</th>
                <th style="width: 60px;">در کارتن</th>
                <th style="width: 70px;">تعداد کارتن</th>
                <th style="width: 80px;">وزن خالص (kg)</th>
                <th style="width: 80px;">وزن ناخالص (kg)</th>
                <th style="width: 80px;">حجم (CBM)</th>
            </tr>
        </thead>
        <tbody>
            ${detailedItems.map(item => `
                <tr>
                    <td>${item.rowNo}</td>
                    <td style="font-family: monospace; font-weight: bold;">${item.internalCode}</td>
                    <td class="text-right">
                        <strong>${item.productName}</strong>
                        ${item.productNameFa ? `<div style="font-size:10px; color:#64748b;">${item.productNameFa}</div>` : ''}
                    </td>
                    <td style="font-family: monospace; font-weight: bold;">${item.quantity.toLocaleString()}</td>
                    <td style="font-family: monospace;">${item.itemsPerCarton}</td>
                    <td style="font-family: monospace; font-weight: bold; color: #0284c7;">${item.totalCartons.toLocaleString()}</td>
                    <td style="font-family: monospace;">${item.totalNetWeight.toFixed(2)}</td>
                    <td style="font-family: monospace; font-weight: bold;">${item.totalGrossWeight.toFixed(2)}</td>
                    <td style="font-family: monospace;">${item.totalCbm.toFixed(3)}</td>
                </tr>
            `).join('')}
            <tr class="totals-row">
                <td colspan="3" class="text-right">جمع کل لجستیک (Total Logistics Summary):</td>
                <td style="font-family: monospace;">${totals.totalQty.toLocaleString()}</td>
                <td>-</td>
                <td style="font-family: monospace; font-size: 12px;">${totals.totalCartons.toLocaleString()} Ctn</td>
                <td style="font-family: monospace;">${totals.totalNetWeight.toFixed(2)} kg</td>
                <td style="font-family: monospace; font-size: 12px;">${totals.totalGrossWeight.toFixed(2)} kg</td>
                <td style="font-family: monospace; font-size: 12px;">${totals.totalCbm.toFixed(3)} m³</td>
            </tr>
        </tbody>
    </table>

    <div class="footer-sig">
        <div class="sig-box">
            مدیر انبار و لجستیک / Warehouse & Logistics Manager
        </div>
        <div class="sig-box">
            تحویل‌گیرنده محموله / Consignee Receipt
        </div>
    </div>
</body>
</html>
            `;
        }
    }, [invoice, docType, invoiceType, sellerInfo, recipientName, recipientPhone, billTo, detailedItems, totals]);

    // Handle Print
    const handlePrint = () => {
        const printWindow = window.open('', '_blank', 'width=900,height=800');
        if (printWindow) {
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
            }, 300);
        }
    };

    // Handle Export to Excel
    const handleExportExcel = async () => {
        if (!invoice) return;
        try {
            setIsExportingExcel(true);
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet(docType === 'invoice' ? 'Invoice' : 'PackingList');

            worksheet.views = [{ rightToLeft: true } as any];

            // Title Header
            worksheet.addRow([sellerInfo.name]);
            worksheet.addRow([docType === 'invoice' ? `COMMERCIAL INVOICE #${invoice.invoiceNumber}` : `PACKING LIST #${invoice.invoiceNumber}`]);
            worksheet.addRow([`DATE: ${invoice.date} | PARTY: ${recipientName}`]);
            worksheet.addRow([]); // Blank line

            if (docType === 'invoice') {
                worksheet.addRow(['#', 'Code', 'Description', 'HS Code', 'Quantity', `Unit Price (${invoice.currency})`, `Total Price (${invoice.currency})`]);
                detailedItems.forEach(item => {
                    worksheet.addRow([
                        item.rowNo,
                        item.internalCode,
                        item.productName,
                        item.hsCode,
                        item.quantity,
                        item.unitPrice,
                        item.totalPrice
                    ]);
                });
                worksheet.addRow(['', '', 'TOTAL', '', totals.totalQty, '', totals.grandTotal]);
            } else {
                worksheet.addRow(['#', 'Code', 'Description', 'Quantity', 'Pcs/Ctn', 'Total Cartons', 'Net Weight (kg)', 'Gross Weight (kg)', 'Volume (CBM)']);
                detailedItems.forEach(item => {
                    worksheet.addRow([
                        item.rowNo,
                        item.internalCode,
                        item.productName,
                        item.quantity,
                        item.itemsPerCarton,
                        item.totalCartons,
                        item.totalNetWeight,
                        item.totalGrossWeight,
                        item.totalCbm
                    ]);
                });
                worksheet.addRow(['', '', 'TOTAL', totals.totalQty, '', totals.totalCartons, totals.totalNetWeight, totals.totalGrossWeight, totals.totalCbm]);
            }

            // Style headers
            const headerRow = worksheet.getRow(5);
            headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: docType === 'invoice' ? '1E293B' : '0F172A' } };

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${docType === 'invoice' ? 'Invoice' : 'PackingList'}_${invoice.invoiceNumber}_${invoice.date}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting excel:', error);
            alert('خطا در خروجی اکسل');
        } finally {
            setIsExportingExcel(false);
        }
    };

    if (!isOpen || !invoice) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6" dir="rtl">
            <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
                {/* Modal Header */}
                <div className="p-4 bg-slate-800 border-b border-slate-700 flex flex-wrap justify-between items-center gap-3">
                    <div className="flex items-center gap-3">
                        <span className={`p-2 rounded-xl text-lg ${docType === 'invoice' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                            {docType === 'invoice' ? '📄' : '📦'}
                        </span>
                        <div>
                            <h3 className="text-base font-bold text-white">
                                {docType === 'invoice' ? 'فاکتور تجاری رسمی (Invoice)' : 'پکینگ لیست محموله (Packing List)'} #{invoice.invoiceNumber}
                            </h3>
                            <p className="text-xs text-slate-400">
                                {invoiceType === 'sales' ? 'مشتری:' : 'تامین‌کننده:'} <strong className="text-slate-200">{recipientName}</strong> | تاریخ: {invoice.date}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportExcel}
                            disabled={isExportingExcel}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition shadow flex items-center gap-1.5"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h55.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            {isExportingExcel ? 'در حال خروجی...' : 'خروجی Excel'}
                        </button>
                        <button
                            onClick={handlePrint}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl transition shadow flex items-center gap-1.5"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                            چاپ سند (Print)
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-xl hover:bg-slate-700 transition"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Additional Party Notes Bar */}
                <div className="p-3 bg-slate-800/50 border-b border-slate-700/50 flex items-center gap-3 text-xs">
                    <label className="text-slate-400 whitespace-nowrap">توضیحات تکمیلی تحویل / آدرس خریدار:</label>
                    <input
                        type="text"
                        value={billTo}
                        onChange={(e) => setBillTo(e.target.value)}
                        placeholder="آدرس، شماره تماس دوم یا یادداشت تحویل..."
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                </div>

                {/* Main Preview iFrame */}
                <div className="flex-1 bg-slate-950 p-2 overflow-hidden">
                    <iframe
                        srcDoc={htmlContent}
                        title="Document Preview"
                        className="w-full h-full rounded-xl border border-slate-800 bg-white"
                    />
                </div>
            </div>
        </div>
    );
};

export default AccountingDocModal;
