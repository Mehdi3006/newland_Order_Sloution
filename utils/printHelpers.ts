import { Order, CurrencyRates, CompanyInfo, OrderItem, ChecklistTask } from '../types';
import { TFunction } from 'i18next';
import { formatDisplayDate } from './dateUtils';
import { i18n } from '../i18n';

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

export const generateEnhancedPrintableOrderHtml = (
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
    
    // Calculate Totals
    const totalGrossWeight = order.items.reduce((sum, item) => {
         const cartons = item.itemsPerCarton > 0 ? Math.ceil(item.quantity / item.itemsPerCarton) : 0;
         return sum + (cartons * (item.grossWeight || 0));
    }, 0);
    const totalVolume = order.volumeCBM; // Assuming this is kept up to date by useOrders hook

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
                    <th class="text-center">${t('labels.totalGrossWeightKg')}</th>
                    <th class="text-center">${t('labels.volumeCbm')}</th>
                    <th class="text-right">${t('orderModal.table.unitPrice')}</th>
                    <th class="text-right">${t('orderModal.table.totalPrice')}</th>
                </tr>
            </thead>
            <tbody>
                ${order.items.map(item => {
                    const totalCartons = Math.ceil(item.quantity / (item.itemsPerCarton || 1));
                    const lineGrossWeight = (item.grossWeight || 0) * totalCartons;
                    const lineVolume = (item.cartonCBM || 0) * totalCartons;
                    
                    const productNameDisplay = item.internalCode 
                        ? `${item.productName} <strong>${item.internalCode}</strong>` 
                        : item.productName;

                    return `
                    <tr>
                        <td>
                            ${productNameDisplay}
                            ${checklistHtml(item)}
                        </td>
                        <td class="text-center font-mono">${totalCartons.toLocaleString()}</td>
                        <td class="text-center font-mono">${item.itemsPerCarton.toLocaleString()}</td>
                        <td class="text-center font-mono">${item.quantity.toLocaleString()}</td>
                        <td class="text-center font-mono">${lineGrossWeight.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                        <td class="text-center font-mono">${lineVolume.toLocaleString(undefined, {maximumFractionDigits: 3})}</td>
                        <td class="text-right font-mono">${item.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${order.currency}</td>
                        <td class="text-right font-mono">${(item.quantity * item.price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${order.currency}</td>
                    </tr>
                `}).join('')}
                <tr>
                    <td colspan="7" class="text-right"><strong>${t('labels.totalValue')}</strong></td>
                    <td class="text-right font-mono"><strong>${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${order.currency}</strong></td>
                </tr>
                <tr>
                    <td colspan="7" class="text-right"><strong>${t('labels.totalGrossWeightKg')}</strong></td>
                    <td class="text-right font-mono">${totalGrossWeight.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} kg</td>
                </tr>
                <tr>
                    <td colspan="7" class="text-right"><strong>${t('labels.volumeCbm')}</strong></td>
                    <td class="text-right font-mono">${totalVolume.toLocaleString(undefined, {minimumFractionDigits: 3, maximumFractionDigits: 3})} m³</td>
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