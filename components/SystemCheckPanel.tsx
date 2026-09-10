import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../db';
// FIX: Imported `calculateFinalProducts` to be used in the business logic verification step.
import { calculateFinalProducts, recalculateProductPrices } from '../utils/costCalculator';
// FIX: Imported `OrderItem` to explicitly type test data and resolve type inference issues.
import { Order, Product, CostingSettings, ChecklistTemplate, Status, Project, Task, MainGroup, Category, SubCategory, Brand, GeneralLedgerAccount, SubsidiaryLedgerAccount, DetailedLedgerAccount, StickyNote, Attachment, NewOrderData, OrderItem } from '../types';
import { GoogleGenAI } from '@google/genai';

const SystemCheckPanel: React.FC = () => {
    const { t } = useTranslation();
    const [isChecking, setIsChecking] = useState(false);
    const [report, setReport] = useState('');
    const [isCheckingFonts, setIsCheckingFonts] = useState(false);
    const [fontReport, setFontReport] = useState('');

    const runCheck = useCallback(async () => {
        setIsChecking(true);
        setReport('Starting system check...');
        
        let reportLines: string[] = [];
        let issuesFound = 0;

        const updateReport = (newLines: string) => {
            reportLines.push(newLines);
            setReport(reportLines.join('\n'));
        };
        
        const testId = `test-${Date.now()}`;

        try {
            reportLines.push(`Report generated on: ${new Date().toLocaleString()}`);
            reportLines.push('====================================');

            // --- Fetch all data upfront for efficiency ---
            const allOrders = await db.orders.toArray();
            const allProducts = await db.products.toArray();
            const allStatuses = await db.statuses.toArray();
            const allProjects = await db.projects.toArray();
            const allTasks = await db.tasks.toArray();
            const costingSettings = (await db.settings.get('perShipmentCostingSettings'))?.value as CostingSettings;
            const aiSettings = (await db.settings.get('aiSettings'))?.value;

            // --- 1. Settings Check ---
            updateReport('\n--- 1. Checking System Settings ---');
            if (!costingSettings?.fx) {
                updateReport('❌ CRITICAL: Costing settings are missing or corrupted.');
                issuesFound++;
            } else {
                updateReport('✅ Costing Settings: OK.');
            }
             if (!aiSettings?.apiKey) {
                updateReport('⚠️ WARNING: AI API Key is not configured. AI features will not work.');
                issuesFound++;
            } else {
                updateReport('✅ AI Settings: OK.');
            }

            // --- 2. Data Integrity Checks ---
            updateReport('\n--- 2. Checking Data Integrity ---');
            let dataIssues = 0;
            // Simplified data integrity checks from previous version
            const statusNames = new Set(allStatuses.map(s => s.name));
            allOrders.forEach(order => {
                if (!statusNames.has(order.status)) {
                    updateReport(`- ⚠️ Order ${order.id}: Uses a non-existent status "${order.status}".`);
                    dataIssues++;
                }
            });
             if (dataIssues === 0) updateReport('✅ Data Integrity: OK.');
             issuesFound += dataIssues;
            
            // --- 3. Functional Tests (CRUD Operations) ---
            updateReport('\n--- 3. Verifying Core Functionality (CRUD) ---');
            // 3.1 Order CRUD
            try {
                const newOrderData: NewOrderData = {
                    supplier: `Test Supplier ${testId}`,
                    orderDate: '2025-01-01',
                    approxLoadingDate: '2025-02-01',
                    currency: 'USD',
                    // Note: The original error on this line is fixed by updating the `NewOrderData` type in `types.ts`.
                    items: [{ productName: 'Test Item', quantity: 10, price: 5, itemsPerCarton: 10, cartonCBM: 0.1 }],
                    payments: [],
                };
                const firstStatus = allStatuses.find(s => !s.isSystem);
                if (!firstStatus) throw new Error("No non-system status found to create a test order.");

                const newOrderId = `${testId}-order`;
                // FIX: The `newOrderData` object contains an `items` array where `id` is optional, which is incompatible with the `Order` type.
                // This explicitly creates a valid `OrderItem[]` by mapping over the items and adding a unique ID to each, resolving the type error.
                await db.orders.add({
                    ...newOrderData,
                    id: newOrderId,
                    status: firstStatus.name,
                    volumeCBM: 0.1,
                    isArchived: false,
                    isFinalized: false,
                    deletedAt: null,
                    items: newOrderData.items.map((item, index) => ({
                        ...item,
                        id: `${newOrderId}-item-${index}`,
                    }))
                });
                const createdOrder = await db.orders.get(newOrderId);
                if (!createdOrder) throw new Error("Order creation failed.");
                
                await db.orders.update(newOrderId, { supplier: 'Updated Test Supplier' });
                const updatedOrder = await db.orders.get(newOrderId);
                if (updatedOrder?.supplier !== 'Updated Test Supplier') throw new Error("Order update failed.");
                
                await db.orders.delete(newOrderId);
                const deletedOrder = await db.orders.get(newOrderId);
                if (deletedOrder) throw new Error("Order permanent deletion failed.");
                
                updateReport('✅ Orders CRUD: OK.');
            } catch(e) {
                updateReport(`❌ ERROR in Order CRUD test: ${(e as Error).message}`);
                issuesFound++;
            }

            // 3.2 Product CRUD (simplified)
            try {
                const newProductId = `${testId}-product`;
                // FIX: Added explicit Product type to fix type inference issue for `sourceCurrency`.
                const productData: Product = {
                  id: newProductId, internalCode: newProductId, description: 'Test Product', purchasePriceUSD: 10,
                  itemsPerCarton: 1, cartonCBM: 0.1, sourceOrderId: 'test', finalizedAt: new Date().toISOString(),
                  settingsSnapshot: costingSettings, deletedAt: null, landedCostAED: 0, landedCostTOMAN: 0, landedCostUSD: 0,
                  iranCustomsCosts: { finalDuty_TOMAN:0, importVat_TOMAN:0, brokerFee_TOMAN:0, shipFreight_TOMAN:0, inlandFreight_TOMAN:0, standardFee_TOMAN:0, loadingUnloadingFee_TOMAN:0 },
                  sellingPrices: { aed: {tier1:0,tier2:0,tier3:0}, toman: {tier1:0,tier2:0,tier3:0}},
                  order: 0, createdAt: new Date().toISOString(), purchasePriceInSourceCurrency: 10, sourceCurrency: 'USD', shipStageCostsUSD: 0, dubaiStageCostsAED: 0, iranStageCostsTOMAN: 0
                };
                await db.products.add(productData);
                const createdProduct = await db.products.get(newProductId);
                if (!createdProduct) throw new Error("Product creation failed.");
                await db.products.delete(newProductId);
                if (await db.products.get(newProductId)) throw new Error("Product deletion failed.");
                updateReport('✅ Products CRUD: OK.');
            } catch(e) {
                updateReport(`❌ ERROR in Product CRUD test: ${(e as Error).message}`);
                issuesFound++;
            }

            // --- 4. Business Logic Verification ---
            updateReport('\n--- 4. Verifying Business Logic ---');
            try {
                // FIX: The object literal for the test order was being inferred with an incorrect type for the `items` array.
                // By defining `orderItems` separately with an explicit `OrderItem[]` type, we resolve the ambiguity and ensure `orderToFinalize` matches the `Order` type.
                const orderItems: OrderItem[] = [{ id: 'item-1', productName: 'Test Finalize Item', internalCode: 'TF-01', quantity: 100, price: 20, itemsPerCarton: 10, cartonCBM: 0.2, grossWeight: 5, customsValue: 15, customsValueBasis: 'unit' }];
                const orderToFinalize: Order = {
                    id: `${testId}-finalize`, supplier: 'Finalize Test', orderDate: '2025-01-01', approxLoadingDate: '2025-02-01', status: 'Test', currency: 'USD',
                    items: orderItems,
                    payments: [], shipCosts: [{ id: 'sc1', name: 'Freight', amount: 100, currency: 'USD', basis: 'cbm', category: 'freight' }],
                    dubaiCosts: [], iranCosts: [], volumeCBM: 2, isArchived: false, isFinalized: false, deletedAt: null,
                };
                await db.orders.add(orderToFinalize);
                // FIX: Used the correct function `calculateFinalProducts` which returns an array and reflects the test's intent.
                const finalProducts = calculateFinalProducts(orderToFinalize, costingSettings);
                // In a real test, you'd call a `finalizeOrder` function. Here we simulate by checking the core calculation.
                // FIX: Corrected the check to validate the result of the calculation against the input order.
                if (finalProducts.length !== orderToFinalize.items.length) throw new Error("Product calculation returned an incorrect number of products for the given order.");
                updateReport('✅ Order Finalization Logic: OK.');
                await db.orders.delete(orderToFinalize.id);
            } catch(e) {
                updateReport(`❌ ERROR in Finalization Logic test: ${(e as Error).message}`);
                issuesFound++;
            }

            // --- 5. External API Health Check ---
            updateReport('\n--- 5. Checking External API Connectivity ---');
            if (aiSettings?.apiKey) {
                try {
                    const ai = new GoogleGenAI({ apiKey: aiSettings.apiKey });
                    await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: 'test' });
                    updateReport('✅ Gemini API Connection: OK.');
                } catch (e) {
                    updateReport(`❌ ERROR connecting to Gemini API: ${(e as Error).message}`);
                    issuesFound++;
                }
            } else {
                updateReport('ℹ️ Gemini API: Skipped (no API key).');
            }

            // --- Final Summary ---
            const summary = `\n--- Summary ---\nSystem check completed. Found ${issuesFound} potential issue(s).`;
            reportLines.unshift(summary);

        } catch (error) {
            updateReport(`\n--- A FATAL ERROR OCCURRED ---\n${(error as Error).message}`);
            issuesFound++;
        } finally {
            // Cleanup any test data that might have been left over
            db.orders.where('id').startsWith('test-').delete();
            db.products.where('id').startsWith('test-').delete();
            setReport(reportLines.join('\n'));
            setIsChecking(false);
        }
    }, [t]);

    const runFontCheck = useCallback(async () => {
        setIsCheckingFonts(true);
        setFontReport('');
        let fontReportLines: string[] = [];
        
        const updateFontReport = (line: string) => {
            fontReportLines.push(line);
            setFontReport(fontReportLines.join('\n'));
        };

        updateFontReport('--- Font Verification & Caching ---');

        try {
            // 1. Check if font is already active in the document
            if (document.fonts && await document.fonts.check('16px Vazirmatn')) {
                 updateFontReport('✅ Vazirmatn font is already loaded and active in the application.');
                 setIsCheckingFonts(false);
                 return;
            }
            updateFontReport('ℹ️ Vazirmatn font not detected as active. Checking cache...');
            
            // 2. Check if fonts are in IndexedDB
            const cachedCount = await db.fontCache.count();
            if (cachedCount > 0) {
                 updateFontReport(`✅ ${cachedCount} font files found in the local cache.`);
                 updateFontReport('ℹ️ Please reload the application to apply the cached fonts.');
                 setIsCheckingFonts(false);
                 return;
            }
            updateFontReport('ℹ️ Font cache is empty. Attempting to download fonts...');

            // 3. Download and cache fonts
            const fontBaseUrl = 'https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.0.3/fonts/webfonts/';
            const fontsToCache = [
                { name: 'Vazirmatn-Light.woff2', weight: 300 },
                { name: 'Vazirmatn-Regular.woff2', weight: 400 },
                { name: 'Vazirmatn-Medium.woff2', weight: 500 },
                { name: 'Vazirmatn-SemiBold.woff2', weight: 600 },
                { name: 'Vazirmatn-Bold.woff2', weight: 700 },
                { name: 'Vazirmatn-ExtraBold.woff2', weight: 800 },
                { name: 'Vazirmatn-Black.woff2', weight: 900 },
            ];

            const downloadPromises = fontsToCache.map(async (font) => {
                const url = `${fontBaseUrl}${font.name}`;
                updateFontReport(`- Downloading ${font.name}...`);
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to download ${font.name}: ${response.statusText}`);
                }
                const data = await response.arrayBuffer();
                await db.fontCache.put({ url, data, fontWeight: font.weight });
                updateFontReport(`- Cached ${font.name} successfully.`);
            });

            await Promise.all(downloadPromises);

            updateFontReport('\n✅ All fonts have been successfully downloaded and cached.');
            updateFontReport('ℹ️ Please reload the application to apply the new fonts.');

        } catch (error) {
            updateFontReport(`\n❌ ERROR: An error occurred during the font check process.`);
            updateFontReport((error as Error).message);
        } finally {
            setIsCheckingFonts(false);
        }
    }, []);

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                <h3 className="font-semibold text-slate-800 mb-2">{t('settings.systemCheck.title')}</h3>
                <p className="text-sm text-slate-600 mb-4">{t('settings.systemCheck.description')}</p>
                <button
                    onClick={runCheck}
                    disabled={isChecking}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-semibold flex items-center disabled:bg-indigo-300"
                >
                    {isChecking && <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                    {isChecking ? t('settings.systemCheck.running') : t('settings.systemCheck.runButton')}
                </button>
                {report && (
                    <div className="mt-4">
                        <h4 className="font-semibold text-slate-800 mb-2">{t('settings.systemCheck.reportTitle')}</h4>
                        <textarea
                            readOnly
                            value={report}
                            className="w-full h-96 bg-slate-900 text-slate-100 font-mono text-xs p-3 rounded-md border border-slate-700 focus:ring-0 focus:outline-none"
                        />
                    </div>
                )}
            </div>
            
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                <h3 className="font-semibold text-slate-800 mb-2">{t('settings.systemCheck.fontCheckTitle')}</h3>
                <p className="text-sm text-slate-600 mb-4">
                    {t('settings.systemCheck.fontCheckDescription')}
                </p>
                <button
                    onClick={runFontCheck}
                    disabled={isCheckingFonts}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-semibold flex items-center disabled:bg-indigo-300"
                >
                     {isCheckingFonts && <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                    {isCheckingFonts ? t('settings.systemCheck.checkingFonts') : t('settings.systemCheck.verifyAndDownload')}
                </button>
                {fontReport && (
                    <div className="mt-4">
                        <h4 className="font-semibold text-slate-800 mb-2">Font Check Report</h4>
                        <textarea
                            readOnly
                            value={fontReport}
                            className="w-full h-48 bg-slate-900 text-slate-100 font-mono text-xs p-3 rounded-md border border-slate-700 focus:ring-0 focus:outline-none"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default SystemCheckPanel;
