import React from 'react';
import ExcelJS from 'exceljs';
import { SalesInvoice, PurchaseInvoice } from '../../types';

interface DocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'invoice' | 'packing_list';
    invoiceType: 'sales' | 'purchase';
    doc: SalesInvoice | PurchaseInvoice | null;
}

export const DocumentModal: React.FC<DocumentModalProps> = ({
    isOpen,
    onClose,
    type,
    invoiceType,
    doc
}) => {
    if (!isOpen || !doc) return null;

    const isSales = invoiceType === 'sales';
    const partyLabelFa = isSales ? 'خریدار / مشتری:' : 'فروشنده / تامین‌کننده:';
    const partyLabelEn = isSales ? 'Customer / Buyer:' : 'Supplier / Vendor:';
    const partyName = isSales ? (doc as SalesInvoice).customerName : (doc as PurchaseInvoice).supplierName;
    const docTitleFa = type === 'invoice' 
        ? (isSales ? 'فاکتور رسمی فروش کالا (Commercial Sales Invoice)' : 'فاکتور رسمی خرید کالا (Commercial Purchase Invoice)')
        : 'برگ بارنامه و پکینگ لیست گمرکی (Commercial Packing List)';
    const docTitleEn = type === 'invoice' ? 'COMMERCIAL INVOICE' : 'PACKING LIST';

    // Total metrics
    const totalQty = doc.items?.reduce((s, it) => s + (Number(it.quantity) || 0), 0) || 0;
    const totalCartons = doc.items?.reduce((s, it) => s + (it.unitType === 'piece' ? 0 : (Number(it.cartonCount) || 0)), 0) || 0;
    const totalCbm = doc.items?.reduce((s, it) => s + (Number(it.cbm) || 0), 0) || 0;
    const totalGrossWeight = doc.items?.reduce((s, it) => s + (Number(it.grossWeight) || 0), 0) || 0;

    // Excel Export Handler
    const handleExportExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Newland Trading Group';
        workbook.created = new Date();

        const sheetName = type === 'invoice' ? `Invoice_${doc.invoiceNumber}` : `PackingList_${doc.invoiceNumber}`;
        const sheet = workbook.addWorksheet(sheetName, {
            views: [{ rightToLeft: true, state: 'normal' }]
        });

        // 1. Header Banner
        sheet.mergeCells('A1:G1');
        const headerCell = sheet.getCell('A1');
        headerCell.value = 'شرکت بازرگانی بین‌المللی نیولند - NEWLAND TRADING GROUP';
        headerCell.font = { name: 'Tahoma', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 36;

        // 2. Sub-Header (Doc Title)
        sheet.mergeCells('A2:G2');
        const subCell = sheet.getCell('A2');
        subCell.value = `${docTitleFa} | ${docTitleEn}`;
        subCell.font = { name: 'Tahoma', size: 11, bold: true, color: { argb: 'FF1E293B' } };
        subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        subCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(2).height = 26;

        // 3. Metadata block
        sheet.addRow(['شماره سند:', doc.invoiceNumber, '', 'تاریخ ثبت:', doc.date, '', 'واحد ارز:', doc.currency]);
        sheet.addRow([partyLabelFa, partyName, '', 'نوع فاکتور:', isSales ? 'فروش' : 'خرید', '', 'وضعیت تسویه:', doc.status || 'نهایی']);
        
        sheet.getRow(3).font = { name: 'Tahoma', size: 9, bold: true };
        sheet.getRow(4).font = { name: 'Tahoma', size: 9, bold: true };

        sheet.addRow([]); // Empty row

        // 4. Items Table
        if (type === 'invoice') {
            const tableHeaders = ['ردیف', 'کد کالا', 'شرح و نام کالا', 'تعداد', 'مدل / کارتن', 'واحد ارز', 'قیمت واحد', 'مبلغ کل'];
            const headerRow = sheet.addRow(tableHeaders);
            headerRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
            headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
            headerRow.height = 25;

            doc.items?.forEach((it, idx) => {
                const totalItemPrice = it.totalPrice || (it.quantity * it.unitPrice);
                const cartonDisplay = it.unitType === 'piece' ? 'خرد' : `${it.cartonCount || 1} کارتن`;
                const r = sheet.addRow([
                    idx + 1,
                    it.internalCode || it.partNumber || '-',
                    it.productName,
                    it.quantity,
                    cartonDisplay,
                    doc.currency,
                    it.unitPrice,
                    totalItemPrice
                ]);
                r.alignment = { horizontal: 'center', vertical: 'middle' };
                r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
            });

            // Total row
            const totRow = sheet.addRow(['جمع کل', '', '', totalQty, `${totalCartons} کارتن`, '', '', doc.totalAmount]);
            totRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FF1E293B' } };
            totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            totRow.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
            const tableHeaders = ['ردیف', 'کد کالا', 'شرح کالا', 'تعداد', 'مدل / کارتن', 'حجم متر مکعب (CBM)', 'وزن ناخالص (KG)'];
            const headerRow = sheet.addRow(tableHeaders);
            headerRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
            headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
            headerRow.height = 25;

            doc.items?.forEach((it, idx) => {
                const cartonDisplay = it.unitType === 'piece' ? 'خرد' : `${it.cartonCount || 1} کارتن`;
                const r = sheet.addRow([
                    idx + 1,
                    it.internalCode || it.partNumber || '-',
                    it.productName,
                    it.quantity,
                    cartonDisplay,
                    it.cbm || 0,
                    it.grossWeight || 0
                ]);
                r.alignment = { horizontal: 'center', vertical: 'middle' };
                r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
            });

            // Total row
            const totRow = sheet.addRow(['جمع کل', '', '', totalQty, `${totalCartons} کارتن`, totalCbm.toFixed(2), totalGrossWeight.toLocaleString()]);
            totRow.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FF1E293B' } };
            totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            totRow.alignment = { horizontal: 'center', vertical: 'middle' };
        }

        // Set column widths
        sheet.columns = [
            { width: 8 },
            { width: 18 },
            { width: 38 },
            { width: 14 },
            { width: 14 },
            { width: 14 },
            { width: 18 },
            { width: 22 }
        ];

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewLand_${type === 'invoice' ? 'Invoice' : 'PackingList'}_${doc.invoiceNumber}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full p-4 sm:p-6 space-y-5 print-container my-auto">
                {/* Non-printable Control Toolbar */}
                <div className="flex flex-wrap justify-between items-center pb-4 border-b border-slate-200 print:hidden gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-base sm:text-lg font-bold text-slate-800">
                            {type === 'invoice' ? '📄 فاکتور تجاری رسمی (Commercial Invoice)' : '📦 برگ بارنامه و پکینگ لیست (Packing List)'}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            isSales ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                            {isSales ? 'فروش' : 'خرید'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportExcel}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                        >
                            📊 دانلود اکسل
                        </button>
                        <button
                            onClick={() => window.print()}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                        >
                            🖨️ چاپ A4
                        </button>
                        <button 
                            onClick={onClose} 
                            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Printable Document Sheet (A4 Standard Format) */}
                <div className="border border-slate-300 rounded-2xl p-5 sm:p-8 bg-white text-slate-800 space-y-6">
                    {/* Header */}
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                                NEWLAND TRADING GROUP
                            </h1>
                            <p className="text-xs text-slate-600 font-semibold mt-0.5">
                                شرکت بازرگانی بین‌المللی نیولند | دبی - گوانگجو - تهران
                            </p>
                            <div className="mt-3 text-xs text-slate-700 space-y-1">
                                <p>
                                    <span className="font-bold text-slate-900">{partyLabelFa} </span>
                                    <span className="font-semibold text-indigo-900">{partyName}</span>
                                </p>
                                <p className="text-[11px] text-slate-500 font-sans">
                                    <span className="font-medium">{partyLabelEn} </span>
                                    {partyName}
                                </p>
                            </div>
                        </div>
                        <div className="text-left font-mono text-xs space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200 min-w-[180px]">
                            <p className="font-black text-sm text-indigo-700">
                                {docTitleEn}
                            </p>
                            <p><span className="text-slate-500 font-sans">Doc No:</span> <span className="font-bold">{doc.invoiceNumber}</span></p>
                            <p><span className="text-slate-500 font-sans">Date:</span> {doc.date}</p>
                            <p><span className="text-slate-500 font-sans">Currency:</span> <span className="font-bold text-emerald-700">{doc.currency}</span></p>
                            <p><span className="text-slate-500 font-sans">Status:</span> <span className="font-semibold">{doc.status || 'Posted'}</span></p>
                        </div>
                    </div>

                    {/* Table of Line Items */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs border border-slate-300">
                            <thead>
                                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-800">
                                    <th className="p-2.5 border-l border-slate-300 text-center w-10">#</th>
                                    <th className="p-2.5 border-l border-slate-300 w-28">کد کالا</th>
                                    <th className="p-2.5 border-l border-slate-300">شرح و نام کالا (Description)</th>
                                    <th className="p-2.5 border-l border-slate-300 text-center w-16">تعداد</th>
                                    <th className="p-2.5 border-l border-slate-300 text-center w-16">کارتن</th>
                                    {type === 'invoice' ? (
                                        <>
                                            <th className="p-2.5 border-l border-slate-300 text-center w-28">قیمت واحد ({doc.currency})</th>
                                            <th className="p-2.5 text-center w-32">مبلغ کل ({doc.currency})</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="p-2.5 border-l border-slate-300 text-center w-20">حجم (CBM)</th>
                                            <th className="p-2.5 text-center w-24">وزن (KG)</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {doc.items?.map((it, idx) => (
                                    <tr key={it.id || idx} className="hover:bg-slate-50/60">
                                        <td className="p-2.5 border-l border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                                        <td className="p-2.5 border-l border-slate-200 font-mono text-slate-600 text-[11px]">
                                            {it.internalCode || it.partNumber || '-'}
                                        </td>
                                        <td className="p-2.5 border-l border-slate-200 font-semibold text-slate-800">{it.productName}</td>
                                        <td className="p-2.5 border-l border-slate-200 text-center font-mono font-bold text-slate-800">
                                            {it.quantity.toLocaleString()}
                                            {it.itemsPerCarton && it.itemsPerCarton > 1 && (
                                                <span className="block text-[10px] text-slate-400 font-sans font-normal">
                                                    ({it.itemsPerCarton} تایی)
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-2.5 border-l border-slate-200 text-center font-mono font-bold text-indigo-700">
                                            {it.unitType === 'piece' ? (
                                                <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-[11px] font-semibold">خرد ({it.quantity} عدد)</span>
                                            ) : it.unitType === 'mixed' && (it.looseUnits || 0) > 0 ? (
                                                <div>
                                                    <span>{it.cartonCount || 0} کارتن</span>
                                                    <span className="block text-[10px] text-purple-600 font-sans font-normal">+ {it.looseUnits} عدد</span>
                                                </div>
                                            ) : (
                                                <span>{it.cartonCount || 1} کارتن</span>
                                            )}
                                        </td>
                                        {type === 'invoice' ? (
                                            <>
                                                <td className="p-2.5 border-l border-slate-200 text-center font-mono text-slate-700">
                                                    {it.unitPrice.toLocaleString()}
                                                </td>
                                                <td className="p-2.5 text-center font-mono font-bold text-indigo-700">
                                                    {(it.totalPrice || (it.quantity * it.unitPrice)).toLocaleString()}
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="p-2.5 border-l border-slate-200 text-center font-mono">{it.cbm || '-'}</td>
                                                <td className="p-2.5 text-center font-mono">{it.grossWeight || '-'}</td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                                    <td colSpan={3} className="p-2.5 border-l border-slate-300">مجموع کل اقلام:</td>
                                    <td className="p-2.5 border-l border-slate-300 text-center font-mono font-black text-slate-900">
                                        {totalQty.toLocaleString()}
                                    </td>
                                    <td className="p-2.5 border-l border-slate-300 text-center font-mono font-black text-indigo-900">
                                        {totalCartons.toLocaleString()}
                                    </td>
                                    {type === 'invoice' ? (
                                        <>
                                            <td className="p-2.5 border-l border-slate-300 text-center">-</td>
                                            <td className="p-2.5 text-center font-mono text-indigo-900 font-black text-sm">
                                                {doc.totalAmount.toLocaleString()} {doc.currency}
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="p-2.5 border-l border-slate-300 text-center font-mono">{totalCbm.toFixed(2)}</td>
                                            <td className="p-2.5 text-center font-mono">{totalGrossWeight.toLocaleString()}</td>
                                        </>
                                    )}
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Notes & Commercial Terms */}
                    {doc.notes && (
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                            <span className="font-bold text-slate-900">توضیحات و شرایط: </span>
                            <span>{doc.notes}</span>
                        </div>
                    )}

                    {/* Official Signatures and Stamping Quadrant */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 text-xs print-signature-block">
                        <div className="border border-slate-300 rounded-xl p-3 text-center space-y-6 bg-slate-50/50">
                            <span className="font-bold text-slate-700 block">تنظیم‌کننده</span>
                            <div className="h-10 border-b border-dashed border-slate-300" />
                            <span className="text-[10px] text-slate-400">امضا و تاریخ</span>
                        </div>
                        <div className="border border-slate-300 rounded-xl p-3 text-center space-y-6 bg-slate-50/50">
                            <span className="font-bold text-slate-700 block">حسابداری و مالی</span>
                            <div className="h-10 border-b border-dashed border-slate-300" />
                            <span className="text-[10px] text-slate-400">امضا و مهر مالی</span>
                        </div>
                        <div className="border border-slate-300 rounded-xl p-3 text-center space-y-6 bg-slate-50/50">
                            <span className="font-bold text-slate-700 block">مدیریت بازرگانی</span>
                            <div className="h-10 border-b border-dashed border-slate-300" />
                            <span className="text-[10px] text-slate-400">مهر و امضا</span>
                        </div>
                        <div className="border border-slate-300 rounded-xl p-3 text-center space-y-6 bg-slate-50/50">
                            <span className="font-bold text-slate-700 block">تحویل‌گیرنده / مشتری</span>
                            <div className="h-10 border-b border-dashed border-slate-300" />
                            <span className="text-[10px] text-slate-400">نام، امضا و تاریخ</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
