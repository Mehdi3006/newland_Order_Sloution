











import Dexie, { type Table } from 'dexie';
import { Order, Status, ChecklistTemplate, Setting, Project, ProjectStatus, Task, OrderItem, ChecklistTask, Product, CostingSettings, PresetCost, DisplaySettings, ProductIranCustomsCosts, PriceHistory, CustomsBook, CustomsBookCell, CustomsBookRowHeight, CustomsBookMerge, AISettings, MainGroup, Category, SubCategory, Brand, GeneralLedgerAccount, SubsidiaryLedgerAccount, DetailedLedgerAccount, StickyNote, CompanyInfo, ProductImage, ProductAttachment, CalendarTask, CalendarStickyNote, DailyImage, DailyAttachment, CalendarList, Supplier, FinancialTransaction, PurchaseTargetSettings, SalesInvoice, ExpenseRecord, JournalVoucher, PurchaseInvoice } from './types';
import { calculateFinalProducts } from './utils/costCalculator';

const defaultStatuses: Status[] = [
    { id: 'status-01', name: 'Draft', order: 0, isSystem: false },
    { id: 'status-02', name: 'Sample Received (Sampling/Test)', order: 1, isSystem: false },
    { id: 'status-03', name: 'PI Issued', order: 2, isSystem: false },
    { id: 'status-04', name: 'Deposit Paid', order: 3, isSystem: false },
    { id: 'status-05', name: 'Production (Order Process)', order: 4, isSystem: false },
    { id: 'status-06', name: 'Packaging Approved', order: 5, isSystem: false },
    { id: 'status-07', name: 'PSI (Inspection)', order: 6, isSystem: false },
    { id: 'status-08', name: 'Booking', order: 7, isSystem: false },
    { id: 'status-09', name: 'On Board', order: 8, isSystem: false },
    { id: 'status-10', name: 'In Transit', order: 9, isSystem: false },
    { id: 'status-11', name: 'Arrival', order: 10, isSystem: false },
    { id: 'status-12', name: 'Customs', order: 11, isSystem: false },
    { id: 'status-13', name: 'Delivered', order: 12, isSystem: false },
    { id: 'status-14', name: 'Invoiced', order: 13, isSystem: false },
    { id: 'status-15', name: 'Final (System)', order: 14, isSystem: true },
];

const defaultChecklistTemplates: ChecklistTemplate[] = [
    {
        id: 'template-smx-v1.0',
        name: 'Stand Mixer Checklist v1.0',
        description: 'A comprehensive checklist for complex kitchen appliances like stand mixers.',
        productNameMatch: 'mixer',
        tasks: [
            { section_id: 1, section_en: "Item Setup & Spec Freeze", section_fa: "راه اندازی آیتم و فریز مشخصات", task_id: "01-01", task_en: "Confirm model, SKU/variant list", task_fa: "تأیید مدل و فهرست SKU / ویرایشها", task_weight: 1 },
            { section_id: 1, section_en: "Item Setup & Spec Freeze", section_fa: "راه اندازی آیتم و فریز مشخصات", task_id: "01-02", task_en: "Finalize electrical specs (voltage/frequency, plug type, cord length, overheat protection)", task_fa: "نهایی سازی مشخصات برقی ولتاژ / فرکانس نوع دوشاخه طول کابل حفاظت حرارتی", task_weight: 1 },
            { section_id: 1, section_en: "Item Setup & Spec Freeze", section_fa: "راه اندازی آیتم و فریز مشخصات", task_id: "01-03", task_en: "Finalize accessories (whisk, dough hook, beater, splash guard, bowl material)", task_fa: "نهایی سازی اقلام همراه همزن قلاب خمیر پره محافظ پاشش جنس (کاسه", task_weight: 1 },
            { section_id: 2, section_en: "Samples & Engineering Validation", section_fa: "نمونه ها و اعتبarsنجی مهندسی", task_id: "02-01", task_en: "Request ES sample & track changes", task_fa: "درخواست نمونه مهندسی (ES) و ثبت تغییرات", task_weight: 1 },
            { section_id: 2, section_en: "Samples & Engineering Validation", section_fa: "نمونه ها و اعتبarsنجی مهندسی", task_id: "02-02", task_en: "Functional tests: load, noise, wobble, speed range, overheating", task_fa: "تست های عملکرد بار نویز لقی لرزش، بازه سرعت گرم شدن", task_weight: 1 },
            { section_id: 3, section_en: "Packaging & Labeling", section_fa: "بسته بندی و برچسب گذاری", task_id: "03-01", task_en: "Approve color-box dieline & 3D mockup", task_fa: "تأیید دای لاین جعبه رنگی و موکاپ سه بعدی", task_weight: 1 },
            { section_id: 3, section_en: "Packaging & Labeling", section_fa: "بسته بندی و برچسب گذاری", task_id: "03-02", task_en: "Barcodes & regulatory marks finalized", task_fa: "نهایی سازی بارکدها و علائم مقرراتی", task_weight: 1 },
            { section_id: 4, section_en: "Compliance & Certifications", section_fa: "انطباق و گواهی ها", task_id: "04-01", task_en: "Safety & EMC certification plan/quotes (CE/CB/UKCA/GCC as needed)", task_fa: "برنامه کوتیشن گواهی ایمنی و CE/CB/UKCA/GCC EMC در صورت نیاز", task_weight: 1 },
            { section_id: 4, section_en: "Compliance & Certifications", section_fa: "انطباق و گواهی ها", task_id: "04-02", task_en: "Collect & store all certificates/reports", task_fa: "دریافت و بایگانی همه گواهی ها گزارش ها", task_weight: 1 },
            { section_id: 5, section_en: "Pre-Production Control", section_fa: "کنترل پیش تولید", task_id: "05-01", task_en: "Schedule pilot run (PP) and sign-off", task_fa: "زمان بندی پایلوت ران (PP) و تأیید", task_weight: 1 },
            { section_id: 6, section_en: "Mass Production QC", section_fa: "کنترل کیفیت تولید انبوه", task_id: "06-01", task_en: "Incoming QC on critical components (motor/gearbox/PCB/bowl)", task_fa: "(کاسه / PCB / موتور گیربکس ورودی روی قطعات بحرانی QC", task_weight: 1 },
            { section_id: 7, section_en: "PSI Checklist (Item Focus)", section_fa: "چک لیست PSI محوریت آیتم", task_id: "07-01", task_en: "AQL sampling & tests completed", task_fa: "نمونه برداری AQL و آزمون ها تکمیل", task_weight: 1 },
            { section_id: 8, section_en: "Post-Delivery & Support (Item)", section_fa: "پس از تحویل و پشتیبانی (آیتم)", task_id: "08-01", task_en: "Spare parts list & MOQ confirmed", task_fa: "تأیید لیست قطعات يدكي و MOQ", task_weight: 1 },
        ]
    },
    {
        id: 'template-electronics-v1.0',
        name: 'General Electronics',
        description: 'A standard checklist for consumer electronics like TVs, speakers, etc.',
        productNameMatch: 'electronics',
        tasks: [
            { section_id: 1, section_en: 'Specifications', section_fa: 'مشخصات فنی', task_id: 'GE-01', task_en: 'Finalize chipset and screen specs', task_fa: 'نهایی‌سازی چیپست و صفحه نمایش', task_weight: 2 },
            { section_id: 1, section_en: 'Specifications', section_fa: 'مشخصات فنی', task_id: 'GE-02', task_en: 'Confirm power adapter and plug type', task_fa: 'تایید آداپتور و نوع دوشاخه', task_weight: 1 },
            { section_id: 2, section_en: 'Certifications', section_fa: 'گواهی‌نامه‌ها', task_id: 'GE-03', task_en: 'Obtain CE/FCC reports', task_fa: 'دریافت گزارشات CE/FCC', task_weight: 3 },
            { section_id: 3, section_en: 'Production', section_fa: 'تولید', task_id: 'GE-04', task_en: 'First-article inspection (FAI)', task_fa: 'بازرسی نمونه اولیه تولید', task_weight: 2 },
            { section_id: 3, section_en: 'Production', section_fa: 'تولید', task_id: 'GE-05', task_en: 'Aging test completed', task_fa: 'تست عمر محصول انجام شد', task_weight: 2 },
        ],
    },
    {
        id: 'template-softgoods-v1.0',
        name: 'Soft Goods / Textiles',
        description: 'A checklist for products made from fabric, like apparel or home textiles.',
        productNameMatch: 'textile',
        tasks: [
            { section_id: 1, section_en: 'Materials', section_fa: 'مواد اولیه', task_id: 'SG-01', task_en: 'Fabric composition test report', task_fa: 'گزارش تست ترکیب پارچه', task_weight: 2 },
            { section_id: 1, section_en: 'Materials', section_fa: 'مواد اولیه', task_id: 'SG-02', task_en: 'Color fastness test passed', task_fa: 'تست ثبات رنگ پاس شد', task_weight: 1 },
            { section_id: 2, section_en: 'Pre-Production', section_fa: 'پیش از تولید', task_id: 'SG-03', task_en: 'Pre-production sample (PPS) approved', task_fa: 'نمونه پیش از تولید تایید شد', task_weight: 3 },
            { section_id: 3, section_en: 'Inspection', section_fa: 'بازرسی', task_id: 'SG-04', task_en: 'Workmanship and stitching check', task_fa: 'بررسی کیفیت دوخت و کار', task_weight: 2 },
        ],
    },
    {
        id: 'template-packaging-v1.0',
        name: 'Packaging Only',
        description: 'A simple checklist focusing only on packaging and labeling requirements.',
        productNameMatch: 'packaging',
        tasks: [
            { section_id: 1, section_en: 'Artwork', section_fa: 'طراحی', task_id: 'PK-01', task_en: 'Color box dieline and artwork approved', task_fa: 'دای‌لاین و طراحی جعبه رنگی تایید شد', task_weight: 2 },
            { section_id: 1, section_en: 'Artwork', section_fa: 'طراحی', task_id: 'PK-02', task_en: 'Manual / Leaflet content finalized', task_fa: 'محتوای دفترچه راهنما نهایی شد', task_weight: 1 },
            { section_id: 2, section_en: 'Physical Sample', section_fa: 'نمونه فیزیکی', task_id: 'PK-03', task_en: 'Printed sample matches Pantone colors', task_fa: 'نمونه چاپی با رنگ پنتون مطابقت دارد', task_weight: 2 },
            { section_id: 2, section_en: 'Physical Sample', section_fa: 'نمونه فیزیکی', task_id: 'PK-04', task_en: 'ISTA drop test passed', task_fa: 'تست سقوط ISTA پاس شد', task_weight: 3 },
        ],
    }
];

const defaultPresetCosts: PresetCost[] = [
    { id: 'pc-1', name_en: 'Inspection Fee', name_fa: 'هزینه بازرسی', defaultAmount: 150 },
    { id: 'pc-2', name_en: 'China Inland Trucking', name_fa: 'حمل داخلی چین', defaultAmount: 200 },
    { id: 'pc-3', name_en: 'Certificate of Origin', name_fa: 'گواهی مبدأ', defaultAmount: 50 },
    { id: 'pc-4', name_en: 'Telex Release Fee', name_fa: 'هزینه تلکس ریلیز', defaultAmount: 80 },
    { id: 'pc-5', name_en: 'Dubai Customs Clearance', name_fa: 'ترخیص گمرک دبی', defaultAmount: 500 },
    { id: 'pc-6', name_en: 'Dubai Local Transport', name_fa: 'حمل داخلی دبی', defaultAmount: 250 },
    { id: 'pc-7', name_en: 'Port Fees', name_fa: 'هزینه‌های بندری', defaultAmount: 300 },
];

const defaultCostingSettings: CostingSettings = {
    fx: {
        usd_aed: 3.69,
        aed_toman: 27000,
        aed_cny: 1.95
    },
    iranCustoms: {
        servicesTariffRate: 1,
        importDutyRate: 5,
        postCustomsVatRate: 10,
        importVatRate: 10,
        customsUsdRate: 68196,
        vatUsdRate: 71300,
        brokerFeePerCarton: 30000,
        woodenShipFreightRate: 7500000,
        woodenShipFreightVolume: 11,
        woodenShipFreightVatRate: 10,
        inlandFreightRate: 1936000,
        inlandFreightVolume: 11,
        inlandFreightVatRate: 10,
        servicesVatRate: 10,
        standardFeeRate: 0.3,
        standardFeeVatRate: 10,
        unloadingFeePerTon: 490000,
        loadingFeePerTon: 490000,
        unloadingFeeVatRate: 10,
        loadingFeeVatRate: 10,
    },
    pricingTiers: {
        calculationMethod: 'value',
        aed: { tier1: 20, tier2: 30, tier3: 40 },
        toman: { tier1: 20, tier2: 40, tier3: 50 },
        metadata: {
            tier1: { name: 'Wholesale', isActive: true },
            tier2: { name: 'Distribution', isActive: true },
            tier3: { name: 'Retail', isActive: true }
        }
    },
    vat: {
        aed: { enabled: false, value: 5 },
        toman: { enabled: false, value: 9 }
    },
    defaultAllocation: {
        perOrder: 'value'
    },
    rounding: {
        aed: 0.001,
        toman: 10000,
        tomanDisplayDivisor: 1000,
    }
};

const defaultPurchaseTargetSettings: PurchaseTargetSettings = {
    annualUnitTarget: 100000,
    annualValueTargetUSD: 5000000
};

const defaultDisplaySettings: DisplaySettings = {
    kanbanCard: {
        showInternalCode: true,
        showOrderId: true,
        showProgress: true,
        showLoadingDate: true,
        showItemsButton: true,
        showArchiveButton: true,
        showFilesButton: true,
    },
    productCard: {
        showAedPricing: true,
        showTomanPricing: true,
        showLandedCost: true,
        showPhysicalSpecs: true,
        showCostBreakdown: true,
    },
    listViewHeader: {
        showTotalValue: true,
        showTotalDownPayment: true,
        showTotalBalanceDue: true,
        showVolume: true,
        showTotalCartons: true,
        showTotalGrossWeight: true,
        showContainerInfo: true,
    },
    dashboardTable: {
        showOrderId: true,
        showSupplier: true,
        showInternalCode: true,
        showDescription: true,
        showCartons: true,
        showQtyPerCarton: true,
        showTotalQty: true,
        showOrderDate: true,
        showLoadingDate: true,
        showStatus: true,
    },
};

const defaultAISettings: AISettings = {
    projectGenerationModel: 'gemini-3.5-flash',
    poAnalysisModel: 'gemini-3.5-flash',
    attributeParsingModel: 'gemini-3.5-flash',
    checklistGenerationModel: 'gemini-3.5-flash',
    apiKey: '',
};

const defaultCompanyInfo: CompanyInfo = {
    en: `NEWLAND HOUSEHOLD TRADING CO. L.L.C
P.O.BOX:3356
Email: sinamehr.co@gmail.com
Tel: 052-7703021`,
    fa: `شرکت بازرگانی لوازم خانگی نیولند (ذ.م.م)
صندوق پستی: ۳۳۵۶
ایمیل: sinamehr.co@gmail.com
تلفن: ۰۵۲-۷۷۰۳۰۲۱`
};

const defaultSettings: Setting[] = [
    {
        key: 'companyInfo',
        value: defaultCompanyInfo
    },
    {
        key: 'companyLogo',
        value: '' // empty string for no logo initially
    },
    {
        key: 'folderStructure',
        value: [
            'PI', 'Raw_Images', 'Manual', 'Color_Box', 'Mockup_3D', 'Rate_Labels',
            'Tags', 'Barcodes', 'QC', 'Logistics', 'Invoices'
        ]
    },
    {
        key: 'perShipmentCostingSettings',
        value: defaultCostingSettings
    },
    {
        key: 'purchaseTargetSettings',
        value: defaultPurchaseTargetSettings
    },
    {
        key: 'displaySettings',
        value: defaultDisplaySettings
    },
    // New notification settings
    {
        key: 'loadingDateNotifications',
        value: { enabled: true, daysInAdvance: 7 }
    },
    {
        key: 'creditPaymentNotifications',
        value: { enabled: true, daysInAdvance: 7 }
    },
    {
        key: 'aiSettings',
        value: defaultAISettings
    }
];

// --- Default Chart of Accounts Data ---
const glAccounts: GeneralLedgerAccount[] = [
    { id: '01', code: '01', name: 'Capital', name_fa: 'سرمایه' },
    { id: '02', code: '02', name: 'Base Capital', name_fa: 'سرمایه پایه' },
    { id: '03', code: '03', name: 'Fixed Assets', name_fa: 'دارایی های ثابت' },
    { id: '04', code: '04', name: 'Loans Received', name_fa: 'تسهیلات دریافتی (وام ها)' },
    { id: '05', code: '05', name: 'Letters of Credit & In-Transit Goods', name_fa: 'اعتبارات اسنادی و کالای بین راهی' },
    { id: '06', code: '06', name: 'Banks', name_fa: 'بانکها' },
    { id: '07', code: '07', name: 'Regional Banks', name_fa: 'بانکهای مناطق' },
    { id: '08', code: '08', name: 'Accounts Receivable', name_fa: 'اسناد دریافتنی' },
    { id: '09', code: '09', name: 'Accounts Payable', name_fa: 'اسناد پرداختنی' },
    { id: '10', code: '10', name: 'Miscellaneous Income', name_fa: 'درآمد متفرقه' },
    { id: '11', code: '11', name: 'Cash', name_fa: 'صندوق' },
    { id: '12', code: '12', name: 'Temporary Debtors', name_fa: 'بدهکاران موقت' },
    { id: '13', code: '13', name: 'Temporary Creditors', name_fa: 'بستانکاران موقت' },
    { id: '14', code: '14', name: 'Family Debtors & Petty Cash', name_fa: 'بدهکاران فامیل و تنخواه گردان' },
    { id: '15', code: '15', name: 'Family Creditors', name_fa: 'بستانکاران فامیل' },
    { id: '16', code: '16', name: 'FX Debtors', name_fa: 'بدهکاران گردش حسابهای ارزی' },
    { id: '17', code: '17', name: 'FX Creditors', name_fa: 'بستانکاران گردش حسابهای ارزی' },
    { id: '18', code: '18', name: 'Employee Debtors', name_fa: 'بدهکاران کارکنان' },
    { id: '19', code: '19', name: 'Employee Creditors', name_fa: 'بستانکاران کارکنان' },
    { id: '20', code: '20', name: 'Regional Debtors', name_fa: 'بدهکاران مناطق' },
    { id: '21', code: '21', name: 'Trade Debtors - Customers 1', name_fa: 'بدهکاران تجاری مشتریان ۱' },
    { id: '22', code: '22', name: 'Trade Debtors - Customers 2', name_fa: 'بدهکاران تجاری مشتریان ۲' },
    { id: '23', code: '23', name: 'Trade Debtors - Customers 3', name_fa: 'بدهکاران تجاری مشتریان ۳' },
    { id: '24', code: '24', name: 'Trade Debtors - Customers 4', name_fa: 'بدهکاران تجاری مشتریان ۴' },
    { id: '25', code: '25', name: 'Trade Debtors - Customers 5', name_fa: 'بدهکاران تجاری مشتریان ۵' },
    { id: '26', code: '26', name: 'Trade Debtors - Customers 6', name_fa: 'بدهکاران تجاری مشتریان ۶' },
    { id: '27', code: '27', name: 'Trade Debtors - Customers 7', name_fa: 'بدهکاران تجاری مشتریان ۷' },
    { id: '28', code: '28', name: 'Trade Debtors - Customers 8', name_fa: 'بدهکاران تجاری مشتریان ۸' },
    { id: '29', code: '29', name: 'Trade Debtors - Customers 9', name_fa: 'بدهکاران تجاری مشتریان ۹' },
    { id: '30', code: '30', name: 'Regional Creditors', name_fa: 'بستانکاران مناطق' },
    { id: '31', code: '31', name: 'Trade Creditors - Suppliers 1', name_fa: 'بستانکاران تجاری تامین کنندگان ۱' },
    { id: '32', code: '32', name: 'Trade Creditors - Suppliers 2', name_fa: 'بستانکاران تجاری تامین کنندگان ۲' },
    { id: '33', code: '33', name: 'Trade Creditors - Suppliers 3', name_fa: 'بستانکاران تجاری تامین کنندگان ۳' },
    { id: '34', code: '34', name: 'Trade Creditors - Suppliers 4', name_fa: 'بستانکاران تجاری تامین کنندگان ۴' },
    { id: '35', code: '35', name: 'Trade Creditors - Suppliers 5', name_fa: 'بستانکاران تجاری تامین کنندگان ۵' },
    { id: '36', code: '36', name: 'Trade Creditors - Suppliers 6', name_fa: 'بستانکاران تجاری تامین کنندگان ۶' },
    { id: '37', code: '37', name: 'Trade Creditors - Suppliers 7', name_fa: 'بستانکاران تجاری تامین کنندگان ۷' },
    { id: '38', code: '38', name: 'Trade Creditors - Suppliers 8', name_fa: 'بستانکاران تجاری تامین کنندگان ۸' },
    { id: '39', code: '39', name: 'Trade Creditors - Suppliers 9', name_fa: 'بستانکاران تجاری تامین کنندگان ۹' },
    { id: '40', code: '40', name: 'Performance', name_fa: 'عملکرد' },
    { id: '41', code: '41', name: 'Opening Inventory', name_fa: 'موجودی اولیه کالا' },
    { id: '42', code: '42', name: 'Goods Purchase', name_fa: 'خرید کالا' },
    { id: '43', code: '43', name: 'Goods Sale', name_fa: 'فروش کالا' },
    { id: '44', code: '44', name: 'Defective Goods', name_fa: 'کالای ناقص شده' },
    { id: '45', code: '45', name: 'Donated & Scrapped Goods', name_fa: 'کالای اهدایی و ضایع شده' },
    { id: '46', code: '46', name: 'Goods Receipt Discrepancy', name_fa: 'مغایرت دریافت کالا' },
    { id: '47', code: '47', name: 'Interest & Late Fee Expense', name_fa: 'هزینه بهره پرداختی و دیر کرد' },
    { id: '48', code: '48', name: 'Consulting & Inspection Expense', name_fa: 'هزینه مشاوره بازرسی / کمیسیون' },
    { id: '49', code: '49', name: 'Doubtful Accounts', name_fa: 'مطالبات مشکوک الوصول' },
    { id: '50', code: '50', name: 'Physical Discrepancies', name_fa: 'مغایرت های فیزیکی' },
    { id: '51', code: '51', name: 'Salaries & Benefits Expense', name_fa: 'هزینه حقوق و مزایا' },
    { id: '52', code: '52', name: 'Transportation & Parking Expense', name_fa: 'هزینه ایاب و ذهاب و پارکینگ' },
    { id: '53', code: '53', name: 'Utilities Expense', name_fa: 'هزینه ارتباطات و انرژی' },
    { id: '54', code: '54', name: 'Rent Expense', name_fa: 'هزینه اجاره محل و انبارها' },
    { id: '55', code: '55', name: 'Repair & Maintenance Expense', name_fa: 'هزینه تعمیرات ابنیه و ادوات و خودرو' },
    { id: '56', code: '56', name: 'Stationery & Supplies Expense', name_fa: 'هزینه چاپ و نوشت افزار و ملزومات' },
    { id: '57', code: '57', name: 'Hospitality Expense', name_fa: 'هزینه آبدارخانه و تشریفات و پذیرایی' },
    { id: '58', code: '58', name: 'Taxes, Duties & Insurance Expense', name_fa: 'هزینه مالیات و عوارض و بیمه های مدنی' },
    { id: '59', code: '59', name: 'Miscellaneous Expense', name_fa: 'هزینه متفرقه' },
    { id: '60', code: '60', name: 'Future Years Expense', name_fa: 'هزینه سنوات آتی' },
    { id: '61', code: '61', name: 'Raw Material & Packaging Purchase', name_fa: 'هزینه خرید مواد اولیه و بسته بندی' },
    { id: '62', code: '62', name: 'Cost of Goods Purchased', name_fa: 'هزینه خرید کالا' },
    { id: '63', code: '63', name: 'Cost of Goods Sold', name_fa: 'هزینه های فروش کالا' },
    { id: '64', code: '64', name: 'Contractor Expense', name_fa: 'هزینه پیمانکاران' },
    { id: '65', code: '65', name: 'Direct Labor & Overhead', name_fa: 'هزینه دستمزد مستقیم و سربار تولید' },
    { id: '66', code: '66', name: 'Total Expense', name_fa: 'هزینه کل' },
    { id: '67', code: '67', name: 'Total Expense (Duplicate)', name_fa: 'هزینه کل' },
    { id: '68', code: '68', name: 'Expense from Income', name_fa: 'هزینه از محل درآمدها' },
    { id: '69', code: '69', name: 'Statutory Reserves & Deductions', name_fa: 'بستانکاران ذخایر و کسورات قانونی' },
    { id: '70', code: '70', name: 'Statutory Reserves & Deductions (Duplicate)', name_fa: 'بستانکاران ذخایر و کسورات قانونی' },
    { id: '71', code: '71', name: 'Profit & Loss', name_fa: 'سود و زیان' },
    { id: '72', code: '72', name: 'Investments & Partnerships', name_fa: 'سرمایه گذاری و مشارکت ها' },
    { id: '77', code: '77', name: 'Partner Debtors', name_fa: 'بدهکاران شركاء' },
    { id: '78', code: '78', name: 'Partner Creditors', name_fa: 'بستانکاران شركاء' },
    { id: '80', code: '80', name: 'Closing Account', name_fa: 'اختتامیه' },
    { id: '88', code: '88', name: 'Disciplinary Accounts', name_fa: 'انتظامی و طرف انتظامی' },
    { id: '89', code: '89', name: 'Disciplinary Documents', name_fa: 'انتظامی برگه ها' },
    { id: '96', code: '96', name: 'FX Account Debtors', name_fa: 'بدهکاران حسابهای ارزی' },
    { id: '97', code: '97', name: 'FX Account Creditors', name_fa: 'بستانکاران حسابهای ارزی' },
    { id: '99', code: '99', name: 'Account Plan Cash', name_fa: 'صندوق طرح حسابها' },
];
const slAccounts: SubsidiaryLedgerAccount[] = [
    { id: '0101', code: '0101', name: 'Initial Capital & Partners', name_fa: 'سرمایه اولیه و شرکاء', generalLedgerAccountId: '01' },
    { id: '0102', code: '0102', name: 'Initial Capital - Lenders', name_fa: 'سرمایه اولیه وام دهندگان', generalLedgerAccountId: '01' },
    { id: '0103', code: '0103', name: 'Initial Capital - Creditors', name_fa: 'سرمایه اولیه بستانکاران', generalLedgerAccountId: '01' },
    { id: '0109', code: '0109', name: 'Initial Capital - FX Creditors', name_fa: 'سرمایه اولیه بستانکاران (گردش ارزی)', generalLedgerAccountId: '01' },
    { id: '0201', code: '0201', name: 'Base Capital (Goods)', name_fa: 'سرمایه پایه (کالا)', generalLedgerAccountId: '02' },
    { id: '0202', code: '0202', name: 'Base Capital (Funds)', name_fa: 'سرمایه پایه (وجوه)', generalLedgerAccountId: '02' },
    { id: '0203', code: '0203', name: 'Base Capital (Assets)', name_fa: 'سرمایه پایه (اموال)', generalLedgerAccountId: '02' },
    { id: '0209', code: '0209', name: 'Base Capital - FX Funds', name_fa: 'سرمایه پایه گردش وجوه ارزی', generalLedgerAccountId: '02' },
    { id: '0301', code: '0301', name: 'Fixed Assets - Furniture & Fixtures', name_fa: 'داراییهای ثابت اثاث و منصوبات', generalLedgerAccountId: '03' },
    { id: '0302', code: '0302', name: 'Intangible Assets', name_fa: 'دارایی های ثابت نامشهود', generalLedgerAccountId: '03' },
    { id: '0303', code: '0303', name: 'Assets Under Construction', name_fa: 'دارایی در جریان تکمیل', generalLedgerAccountId: '03' },
    { id: '0304', code: '0304', name: 'Fixed Assets - Vehicles', name_fa: 'دارایی های ثابت، وسائط نقليه', generalLedgerAccountId: '03' },
    { id: '0305', code: '0305', name: 'Fixed Assets - Land', name_fa: 'دارایی های ثابت زمین', generalLedgerAccountId: '03' },
    { id: '0306', code: '0306', name: 'Fixed Assets - Buildings', name_fa: 'دارایی های ثابت ساختمان', generalLedgerAccountId: '03' },
    { id: '0307', code: '0307', name: 'Fixed Assets - Installations', name_fa: 'دارایی های ثابت، تأسیسات', generalLedgerAccountId: '03' },
    { id: '0308', code: '0308', name: 'Fixed Assets - Machinery', name_fa: 'دارایی های ثابت ماشین آلات', generalLedgerAccountId: '03' },
    { id: '0309', code: '0309', name: 'Other Fixed Assets', name_fa: 'سایر دارایی های ثابت', generalLedgerAccountId: '03' },
    { id: '0380', code: '0380', name: 'Accumulated Depreciation', name_fa: 'استهلاک انباشته', generalLedgerAccountId: '03' },
    { id: '0401', code: '0401', name: 'Mudarabah Loans', name_fa: 'تسهیلات دریافتی مضاربه', generalLedgerAccountId: '04' },
    { id: '0402', code: '0402', name: 'Loans Received', name_fa: 'تسهیلات دریافتی وام', generalLedgerAccountId: '04' },
    { id: '0403', code: '0403', name: 'Credit Facilities', name_fa: 'تسهیلات دریافتی اعتبار', generalLedgerAccountId: '04' },
    { id: '0404', code: '0404', name: 'Contract Facilities', name_fa: 'تسهیلات دریافتی پیمان', generalLedgerAccountId: '04' },
    { id: '0501', code: '0501', name: 'Letters of Credit & In-Transit Goods', name_fa: 'اعتبارات اسنادی و کالای در راه', generalLedgerAccountId: '05' },
    { id: '0502', code: '0502', name: 'Letters of Credit (Contract)', name_fa: 'اعتبارات اسنادی (پیمان)', generalLedgerAccountId: '05' },
    { id: '0601', code: '0601', name: 'NBO BANK DUBAI', name_fa: 'NBO BANK DUBAI', generalLedgerAccountId: '06' },
    { id: '0602', code: '0602', name: 'YOUSEF JAFARI', name_fa: 'YOUSEF JAFARI', generalLedgerAccountId: '06' },
    { id: '0603', code: '0603', name: 'MOHAMMAD JAFARI', name_fa: 'MOHAMMAD JAFARI', generalLedgerAccountId: '06' },
    { id: '0621', code: '0621', name: 'Dubai Open Acc. Moh. Jafari', name_fa: 'Dubai Open Acc. Moh. Jafari', generalLedgerAccountId: '06' },
    { id: '0640', code: '0640', name: 'Bank Melli Qarz Al-Hasaneh', name_fa: 'بانک ملی قرض الحسنه', generalLedgerAccountId: '06' },
    { id: '0801', code: '0801', name: 'Notes Receivable', name_fa: 'اسناد دریافتنی', generalLedgerAccountId: '08' },
    { id: '0802', code: '0802', name: 'Notes Receivable - Out of Town Checks', name_fa: 'اسناد دریافتنی چکهای شهرستان', generalLedgerAccountId: '08' },
    { id: '0803', code: '0803', name: 'Protested Notes', name_fa: 'اسناد واخواست شده', generalLedgerAccountId: '08' },
    { id: '0804', code: '0804', name: 'Notes Receivable - In Collection', name_fa: 'اسناد دریافتنی در جریان وصول', generalLedgerAccountId: '08' },
    { id: '0805', code: '0805', name: 'Discounted Notes', name_fa: 'اسناد تنزیل شده', generalLedgerAccountId: '08' },
    { id: '0806', code: '0806', name: 'Notes Endorsed', name_fa: 'اسناد واگذار شده به غیر', generalLedgerAccountId: '08' },
    { id: '0901', code: '0901', name: 'Notes Payable', name_fa: 'اسناد پرداختنی', generalLedgerAccountId: '09' },
    { id: '0902', code: '0902', name: 'Notes Payable (Commitments)', name_fa: 'اسناد پرداختنی (تعهدات)', generalLedgerAccountId: '09' },
    { id: '1001', code: '1001', name: 'Other Income - Tax Surplus', name_fa: 'سایر درآمدها مازاد مالیات', generalLedgerAccountId: '10' },
    { id: '1002', code: '1002', name: 'Income from Sale of Misc. Goods', name_fa: 'درآمد حاصل از فروش کالای متفرقه', generalLedgerAccountId: '10' },
    { id: '1003', code: '1003', name: 'Income from Sale of Scrap', name_fa: 'درآمد حاصل از فروش ضایعات', generalLedgerAccountId: '10' },
    { id: '1004', code: '1004', name: 'Service Income', name_fa: 'درآمد حاصل از خدمات', generalLedgerAccountId: '10' },
    { id: '1005', code: '1005', name: 'Purchase Invoice Variance', name_fa: 'تفاوت فاکتور خرید کالا', generalLedgerAccountId: '10' },
    { id: '1006', code: '1006', name: 'Currency Conversion Difference', name_fa: 'تفاوت تبدیل ارز', generalLedgerAccountId: '10' },
    { id: '1007', code: '1007', name: 'Production Income', name_fa: 'درآمد تولید کالا', generalLedgerAccountId: '10' },
    { id: '1008', code: '1008', name: 'Income from Asset Sale', name_fa: 'درآمد حاصل از فروش دارایی', generalLedgerAccountId: '10' },
    { id: '1101', code: '1101', name: 'Cash on Hand', name_fa: 'صندوق', generalLedgerAccountId: '11' },
    { id: '1102', code: '1102', name: 'Temporary Cash - M. Jafari Trust', name_fa: 'صندوق موقت امانت نزد محمد جعفری', generalLedgerAccountId: '11' },
    { id: '1210', code: '1210', name: 'Temporary Personal Debtors', name_fa: 'بدهکاران موقت اشخاص', generalLedgerAccountId: '12' },
    { id: '1220', code: '1220', name: 'Customs, Insurance & Clearance Deposits', name_fa: 'سپرده گمرکی و بیمه و ترخیص کالا', generalLedgerAccountId: '12' },
    { id: '1225', code: '1225', name: 'Rent Deposits', name_fa: 'سپرده اجاره', generalLedgerAccountId: '12' },
    { id: '1226', code: '1226', name: 'Bank Deposits', name_fa: 'سپرده های بانکی', generalLedgerAccountId: '12' },
    { id: '1227', code: '1227', name: 'Bank Credit Support Deposits', name_fa: 'سپرده پشتیبان اعتباری بانکی', generalLedgerAccountId: '12' },
    { id: '1228', code: '1228', name: 'Other Deposits', name_fa: 'سایر سپرده ها', generalLedgerAccountId: '12' },
    { id: '1230', code: '1230', name: 'Securities', name_fa: 'اسناد و اوراق بهادار', generalLedgerAccountId: '12' },
    { id: '1240', code: '1240', name: 'Prepayments', name_fa: 'پیش پرداخت ها', generalLedgerAccountId: '12' },
    { id: '1243', code: '1243', name: 'Prepaid Taxes', name_fa: 'پیش پرداخت مالیات', generalLedgerAccountId: '12' },
    { id: '1244', code: '1244', name: 'Prepaid Insurance', name_fa: 'پیش پرداخت بیمه', generalLedgerAccountId: '12' },
    { id: '1245', code: '1245', name: 'Prepaid Goods & Services', name_fa: 'پیش پرداخت خرید کالا و خدمات', generalLedgerAccountId: '12' },
    { id: '1260', code: '1260', name: 'Cost of Goods Sold', name_fa: 'بهای تمام شده کالاهای به فروش رسیده', generalLedgerAccountId: '12' },
    { id: '1280', code: '1280', name: 'Prepaid Taxes (Purchase)', name_fa: 'پیش پرداخت مالیات (خرید)', generalLedgerAccountId: '12' },
    { id: '1310', code: '1310', name: 'Temporary Personal Creditors', name_fa: 'بستانکاران موقت اشخاص', generalLedgerAccountId: '13' },
    { id: '1360', code: '1360', name: 'Received from Employer (Contract)', name_fa: 'دریافت از کارفرما (پیمان)', generalLedgerAccountId: '13' },
    { id: '1380', code: '1380', name: 'Pre-received Consumer Tax', name_fa: 'پیش دریافت مالیات مصرف کننده', generalLedgerAccountId: '13' },
    { id: '1401', code: '1401', name: 'Family Debtors & Petty Cash', name_fa: 'بدهکاران فامیل و تنخواه گردان', generalLedgerAccountId: '14' },
    { id: '1403', code: '1403', name: 'Other Loans Paid', name_fa: 'تسهیلات پرداختی سایر', generalLedgerAccountId: '14' },
    { id: '140A', code: '140A', name: 'Temporary Family Debtors', name_fa: 'بدهکاران موقت فامیل', generalLedgerAccountId: '14' },
    { id: '140B', code: '140B', name: 'Petty Cash', name_fa: 'تنخواه گردان', generalLedgerAccountId: '14' },
    { id: '1501', code: '1501', name: 'Temporary Family Creditors', name_fa: 'بستانکاران موقت فامیل', generalLedgerAccountId: '15' },
    { id: '1601', code: '1601', name: 'Misc. FX Debtors (Rial)', name_fa: 'بدهکاران ارزی متفرقه (ریالی)', generalLedgerAccountId: '16' },
    { id: '1602', code: '1602', name: 'Misc. FX Debtors (FX)', name_fa: 'بدهکاران ارزی متفرقه (ارزی)', generalLedgerAccountId: '16' },
    { id: '1701', code: '1701', name: 'Misc. FX Creditors (AED)', name_fa: 'بستانکاران ارزی متفرقه (درهمی)', generalLedgerAccountId: '17' },
    { id: '1702', code: '1702', name: 'Misc. FX Creditors (Rial)', name_fa: 'بستانکاران ارزی متفرقه (ریالی)', generalLedgerAccountId: '17' },
    { id: '1801', code: '1801', name: 'Employees', name_fa: 'کارکنان', generalLedgerAccountId: '18' },
    { id: '1901', code: '1901', name: 'Employee Creditors', name_fa: 'بستانکاران کارکنان', generalLedgerAccountId: '19' },
    { id: '1902', code: '1902', name: 'Salaries Payable', name_fa: 'حقوق پرداختنی', generalLedgerAccountId: '19' },
    { id: '2005', code: '2005', name: 'Regional Debtors', name_fa: 'بدهکاران مناطق', generalLedgerAccountId: '20' },
    { id: '2010', code: '2010', name: 'Qeshm Kuwaiti Store - HQ', name_fa: 'فروشگاه کویتی قشم دفتر مرکزی', generalLedgerAccountId: '20' },
    { id: '2101', code: '2101', name: 'Tehran Customers', name_fa: 'مشتریان تهران', generalLedgerAccountId: '21' },
    { id: '2201', code: '2201', name: 'Bandar Abbas Trade Debtors', name_fa: 'بدهکاران تجاری بندر عباس', generalLedgerAccountId: '22' },
    { id: '3101', code: '3101', name: 'Domestic Suppliers', name_fa: 'تامین کنندگان داخلی', generalLedgerAccountId: '31' },
    { id: '4001', code: '4001', name: 'Performance', name_fa: 'عملکرد', generalLedgerAccountId: '40' },
    { id: '4401', code: '4401', name: 'Remaining Goods Group (1) Warehouse', name_fa: 'کالای باقی مانده گروه (۱) انبار', generalLedgerAccountId: '44' },
    { id: '4402', code: '4402', name: 'Remaining Goods Group (2) Warehouse', name_fa: 'کالای باقی مانده گروه (۲) انبار', generalLedgerAccountId: '44' },
    { id: '4901', code: '4901', name: 'Doubtful Accounts Expense', name_fa: 'هزینه مطالبات مشکوک الوصول', generalLedgerAccountId: '49' },
    { id: '5101', code: '5101', name: 'Salaries & Wages', name_fa: 'حقوق و دستمزد', generalLedgerAccountId: '51' },
    { id: '5301', code: '5301', name: 'Water, Electricity & Gas Expense', name_fa: 'هزینه آب و برق و گاز', generalLedgerAccountId: '53' },
    { id: '5902', code: '5902', name: 'Loss from Asset Disposal', name_fa: 'زبان حاصل از فروش اسقاط دارایی', generalLedgerAccountId: '59' },
    { id: '6001', code: '6001', name: 'Depreciation Expense', name_fa: 'هزینه استهلاک', generalLedgerAccountId: '60' },
    { id: '7002', code: '7002', name: 'Insurance Payable', name_fa: 'بیمه های پرداختنی', generalLedgerAccountId: '70' },
    { id: '7003', code: '7003', name: 'Other Statutory Deductions', name_fa: 'سایر کسورات قانونی', generalLedgerAccountId: '70' },
    { id: '7101', code: '7101', name: 'Retained Earnings', name_fa: 'سود و زیان انباشته', generalLedgerAccountId: '71' },
    { id: '7102', code: '7102', name: 'Profit & Loss', name_fa: 'سود و زیان', generalLedgerAccountId: '71' },
    { id: '8001', code: '8001', name: 'Closing Account', name_fa: 'حساب اختتامیه', generalLedgerAccountId: '80' },
    { id: '8801', code: '8801', name: 'Third Party Collateral (Our Custody)', name_fa: 'انتظامی و وثایق اسناد دیگران نزد ما', generalLedgerAccountId: '88' },
    { id: '8802', code: '8802', name: 'Our Collateral (Third Party Custody)', name_fa: 'انتظامی و وثایق اسناد ما نزد دیگران', generalLedgerAccountId: '88' },
];
const tlAccounts: DetailedLedgerAccount[] = [
    { id: '010100', code: '010100', name: 'Initial Capital & Partners', name_fa: 'سرمایه اولیه و شرکاء', subsidiaryLedgerAccountId: '0101' },
    { id: '010200', code: '010200', name: 'Initial Capital - Lenders', name_fa: 'سرمایه اولیه وام دهندگان', subsidiaryLedgerAccountId: '0102' },
    { id: '010300', code: '010300', name: 'Initial Capital - Creditors', name_fa: 'سرمایه اولیه بستانکاران', subsidiaryLedgerAccountId: '0103' },
    { id: '010900', code: '010900', name: 'Initial Capital - FX Creditors', name_fa: 'سرمایه اولیه بستانکاران (گردش ارزی)', subsidiaryLedgerAccountId: '0109' },
    { id: '020100', code: '020100', name: 'Base Capital (Goods)', name_fa: 'سرمایه پایه (کالا)', subsidiaryLedgerAccountId: '0201' },
    { id: '020200', code: '020200', name: 'Base Capital (Funds)', name_fa: 'سرمایه پایه (وجوه)', subsidiaryLedgerAccountId: '0202' },
    { id: '020300', code: '020300', name: 'Base Capital (Assets)', name_fa: 'سرمایه پایه (اموال)', subsidiaryLedgerAccountId: '0203' },
    { id: '020900', code: '020900', name: 'Base Capital - FX Funds', name_fa: 'سرمایه پایه (گردش وجوه ارزی)', subsidiaryLedgerAccountId: '0209' },
    { id: '030100', code: '030100', name: 'Fixed Assets - Furniture & Fixtures', name_fa: 'دارایی های ثابت اثاث و منصوبات', subsidiaryLedgerAccountId: '0301' },
    { id: '030200', code: '030200', name: 'Intangible Assets', name_fa: 'دارایی های ثابت نامشهود', subsidiaryLedgerAccountId: '0302' },
    { id: '030300', code: '030300', name: 'Assets Under Construction', name_fa: 'دارایی در جریان تکمیل', subsidiaryLedgerAccountId: '0303' },
    { id: '030400', code: '030400', name: 'Fixed Assets - Vehicles', name_fa: 'دارایی های ثابت، وسائط نقليه', subsidiaryLedgerAccountId: '0304' },
    { id: '030500', code: '030500', name: 'Fixed Assets - Land', name_fa: 'دارایی های ثابت زمین', subsidiaryLedgerAccountId: '0305' },
    { id: '030600', code: '030600', name: 'Fixed Assets - Buildings', name_fa: 'دارایی های ثابت ساختمان', subsidiaryLedgerAccountId: '0306' },
    { id: '030700', code: '030700', name: 'Fixed Assets - Installations', name_fa: 'دارایی های ثابت، تأسیسات', subsidiaryLedgerAccountId: '0307' },
    { id: '030800', code: '030800', name: 'Fixed Assets - Machinery', name_fa: 'دارایی های ثابت ماشین آلات', subsidiaryLedgerAccountId: '0308' },
    { id: '030900', code: '030900', name: 'Other Fixed Assets', name_fa: 'سایر دارایی های ثابت', subsidiaryLedgerAccountId: '0309' },
    { id: '040100', code: '040100', name: 'Mudarabah Loans', name_fa: 'تسهیلات دریافتی مضاربه', subsidiaryLedgerAccountId: '0401' },
    { id: '040200', code: '040200', name: 'Loans Received', name_fa: 'تسهیلات دریافتی وام', subsidiaryLedgerAccountId: '0402' },
    { id: '040300', code: '040300', name: 'Credit Facilities', name_fa: 'تسهیلات دریافتی اعتبار', subsidiaryLedgerAccountId: '0403' },
    { id: '040400', code: '040400', name: 'Contract Facilities', name_fa: 'تسهیلات دریافتی پیمان', subsidiaryLedgerAccountId: '0404' },
    { id: '050100', code: '050100', name: 'Letters of Credit & In-Transit Goods', name_fa: 'اعتبارات اسنادی و کالای در راه', subsidiaryLedgerAccountId: '0501' },
    { id: '050200', code: '050200', name: 'Letters of Credit (Contract)', name_fa: 'اعتبارات اسنادی (پیمان)', subsidiaryLedgerAccountId: '0502' },
    { id: '060100', code: '060100', name: 'NBO BANK DUBAI', name_fa: 'NBO BANK DUBAI', subsidiaryLedgerAccountId: '0601' },
    { id: '060200', code: '060200', name: 'YOUSEF JAFARI', name_fa: 'YOUSEF JAFARI', subsidiaryLedgerAccountId: '0602' },
    { id: '060300', code: '060300', name: 'MOHAMMAD JAFARI', name_fa: 'MOHAMMAD JAFARI', subsidiaryLedgerAccountId: '0603' },
    { id: '062100', code: '062100', name: 'Dubai Open Acc. Moh. Jafari', name_fa: 'Dubai Open Acc. Moh. Jafari', subsidiaryLedgerAccountId: '0621' },
    { id: '064000', code: '064000', name: 'Bank Melli Qarz Al-Hasaneh', name_fa: 'بانک ملی قرض الحسنه', subsidiaryLedgerAccountId: '0640' },
    { id: '080100', code: '080100', name: 'Notes Receivable', name_fa: 'اسناد دریافتنی', subsidiaryLedgerAccountId: '0801' },
    { id: '080200', code: '080200', name: 'Notes Receivable - Out of Town Checks', name_fa: 'اسناد دریافتنی چکهای شهرستان', subsidiaryLedgerAccountId: '0802' },
    { id: '080300', code: '080300', name: 'Protested Notes', name_fa: 'اسناد واخواست شده', subsidiaryLedgerAccountId: '0803' },
    { id: '080400', code: '080400', name: 'Notes Receivable - In Collection', name_fa: 'اسناد دریافتنی در جریان وصول', subsidiaryLedgerAccountId: '0804' },
    { id: '080500', code: '080500', name: 'Discounted Notes', name_fa: 'اسناد تنزیل شده', subsidiaryLedgerAccountId: '0805' },
    { id: '080600', code: '080600', name: 'Notes Endorsed', name_fa: 'اسناد واگذار شده به غیر', subsidiaryLedgerAccountId: '0806' },
    { id: '090100', code: '090100', name: 'Notes Payable', name_fa: 'اسناد پرداختنی', subsidiaryLedgerAccountId: '0901' },
    { id: '090200', code: '090200', name: 'Notes Payable (Commitments)', name_fa: 'اسناد پرداختنی (تعهدات)', subsidiaryLedgerAccountId: '0902' },
    { id: '100100', code: '100100', name: 'Other Income - Tax Surplus', name_fa: 'سایر درآمدها مازاد مالیات', subsidiaryLedgerAccountId: '1001' },
    { id: '100200', code: '100200', name: 'Income from Sale of Misc. Goods', name_fa: 'درآمد حاصل از فروش کالای متفرقه', subsidiaryLedgerAccountId: '1002' },
    { id: '100300', code: '100300', name: 'Income from Sale of Scrap', name_fa: 'درآمد حاصل از فروش ضایعات', subsidiaryLedgerAccountId: '1003' },
    { id: '100400', code: '100400', name: 'Service Income', name_fa: 'درآمد حاصل از خدمات', subsidiaryLedgerAccountId: '1004' },
    { id: '100500', code: '100500', name: 'Purchase Invoice Variance', name_fa: 'تفاوت فاکتور خرید کالا', subsidiaryLedgerAccountId: '1005' },
    { id: '100600', code: '100600', name: 'Currency Conversion Difference', name_fa: 'تفاوت تبدیل ارز', subsidiaryLedgerAccountId: '1006' },
    { id: '100700', code: '100700', name: 'Production Income', name_fa: 'درآمد تولید کالا', subsidiaryLedgerAccountId: '1007' },
    { id: '100800', code: '100800', name: 'Income from Asset Sale', name_fa: 'درآمد حاصل از فروش دارایی', subsidiaryLedgerAccountId: '1008' },
    { id: '110100', code: '110100', name: 'Cash on Hand', name_fa: 'صندوق', subsidiaryLedgerAccountId: '1101' },
    { id: '110200', code: '110200', name: 'Temporary Cash - M. Jafari Trust', name_fa: 'صندوق موقت امانت نزد محمد جعفری', subsidiaryLedgerAccountId: '1102' },
    { id: '121000', code: '121000', name: 'Temporary Personal Debtors', name_fa: 'بدهکاران موقت اشخاص', subsidiaryLedgerAccountId: '1210' },
    { id: '122000', code: '122000', name: 'Customs, Insurance & Clearance Deposits', name_fa: 'سپرده گمرکی و بیمه و ترخیص کالا', subsidiaryLedgerAccountId: '1220' },
    { id: '122500', code: '122500', name: 'Rent Deposits', name_fa: 'سپرده اجاره', subsidiaryLedgerAccountId: '1225' },
    { id: '122600', code: '122600', name: 'Bank Deposits', name_fa: 'سپرده های بانکی', subsidiaryLedgerAccountId: '1226' },
    { id: '122700', code: '122700', name: 'Bank Credit Support Deposits', name_fa: 'سپرده پشتیبان اعتباری بانکی', subsidiaryLedgerAccountId: '1227' },
    { id: '122800', code: '122800', name: 'Other Deposits', name_fa: 'سایر سپرده ها', subsidiaryLedgerAccountId: '1228' },
    { id: '123000', code: '123000', name: 'Securities', name_fa: 'اسناد و اوراق بهادار', subsidiaryLedgerAccountId: '1230' },
    { id: '124000', code: '124000', name: 'Prepayments', name_fa: 'پیش پرداخت ها', subsidiaryLedgerAccountId: '1240' },
    { id: '124300', code: '124300', name: 'Prepaid Taxes', name_fa: 'پیش پرداخت مالیات', subsidiaryLedgerAccountId: '1243' },
    { id: '124400', code: '124400', name: 'Prepaid Insurance', name_fa: 'پیش پرداخت بیمه', subsidiaryLedgerAccountId: '1244' },
    { id: '124500', code: '124500', name: 'Prepaid Goods & Services', name_fa: 'پیش پرداخت خرید کالا و خدمات', subsidiaryLedgerAccountId: '1245' },
    { id: '126000', code: '126000', name: 'Cost of Goods Sold', name_fa: 'بهای تمام شده کالاهای به فروش رسیده', subsidiaryLedgerAccountId: '1260' },
    { id: '128000', code: '128000', name: 'Prepaid Taxes (Purchase)', name_fa: 'پیش پرداخت مالیات (خرید)', subsidiaryLedgerAccountId: '1280' },
    { id: '131000', code: '131000', name: 'Temporary Personal Creditors', name_fa: 'بستانکاران موقت اشخاص', subsidiaryLedgerAccountId: '1310' },
    { id: '136000', code: '136000', name: 'Received from Employer (Contract)', name_fa: 'دریافت از کارفرما (پیمان)', subsidiaryLedgerAccountId: '1360' },
    { id: '138000', code: '138000', name: 'Pre-received Consumer Tax', name_fa: 'پیش دریافت مالیات مصرف کننده', subsidiaryLedgerAccountId: '1380' },
    { id: '140100', code: '140100', name: 'Family Debtors & Petty Cash', name_fa: 'بدهکاران فامیل و تنخواه گردان', subsidiaryLedgerAccountId: '1401' },
    { id: '140300', code: '140300', name: 'Other Loans Paid', name_fa: 'تسهیلات پرداختی سایر', subsidiaryLedgerAccountId: '1403' },
    { id: '140A00', code: '140A00', name: 'Temporary Family Debtors', name_fa: 'بدهکاران موقت فامیل', subsidiaryLedgerAccountId: '140A' },
    { id: '140B00', code: '140B00', name: 'Petty Cash', name_fa: 'تنخواه گردان', subsidiaryLedgerAccountId: '140B' },
    { id: '150100', code: '150100', name: 'Temporary Family Creditors', name_fa: 'بستانکاران موقت فامیل', subsidiaryLedgerAccountId: '1501' },
    { id: '160100', code: '160100', name: 'Misc. FX Debtors (Rial)', name_fa: 'بدهکاران ارزی متفرقه (ریالی)', subsidiaryLedgerAccountId: '1601' },
    { id: '160200', code: '160200', name: 'Misc. FX Debtors (FX)', name_fa: 'بدهکاران ارزی متفرقه (ارزی)', subsidiaryLedgerAccountId: '1602' },
    { id: '170100', code: '170100', name: 'Misc. FX Creditors (AED)', name_fa: 'بستانکاران ارزی متفرقه (درهمی)', subsidiaryLedgerAccountId: '1701' },
    { id: '170200', code: '170200', name: 'Misc. FX Creditors (Rial)', name_fa: 'بستانکاران ارزی متفرقه (ریالی)', subsidiaryLedgerAccountId: '1702' },
    { id: '180101', code: '180101', name: 'Ali Khoshbakhti', name_fa: 'علی خوشبختی', subsidiaryLedgerAccountId: '1801' },
    { id: '180102', code: '180102', name: 'Zahra Mohammadi', name_fa: 'زهرا محمدی', subsidiaryLedgerAccountId: '1801' },
    { id: '190100', code: '190100', name: 'Employee Creditors', name_fa: 'بستانکاران کارکنان', subsidiaryLedgerAccountId: '1901' },
    { id: '190200', code: '190200', name: 'Salaries Payable', name_fa: 'حقوق پرداختنی', subsidiaryLedgerAccountId: '1902' },
    { id: '200500', code: '200500', name: 'Regional Debtors', name_fa: 'بدهکاران مناطق', subsidiaryLedgerAccountId: '2005' },
    { id: '201000', code: '201000', name: 'Qeshm Kuwaiti Store - HQ', name_fa: 'فروشگاه کویتی قشم دفتر مرکزی', subsidiaryLedgerAccountId: '2010' },
    { id: '210101', code: '210101', name: 'Refah Chain Stores', name_fa: 'فروشگاه زنجیره ای رفاه', subsidiaryLedgerAccountId: '2101' },
    { id: '210102', code: '210102', name: 'Alborz Distribution Co.', name_fa: 'شرکت پخش البرز', subsidiaryLedgerAccountId: '2101' },
    { id: '220100', code: '220100', name: 'Bandar Abbas Trade Debtors', name_fa: 'بدهکاران تجاری بندر عباس', subsidiaryLedgerAccountId: '2201' },
    { id: '310101', code: '310101', name: 'Pars Home Appliances Factory', name_fa: 'کارخانه لوازم خانگی پارس', subsidiaryLedgerAccountId: '3101' },
    { id: '310102', code: '310102', name: 'Anzo Electronic Industries', name_fa: 'صنایع الکترونیک آنزو', subsidiaryLedgerAccountId: '3101' },
    { id: '400100', code: '400100', name: 'Performance', name_fa: 'عملکرد', subsidiaryLedgerAccountId: '4001' },
    { id: '440100', code: '440100', name: 'Remaining Goods Group (1) Warehouse', name_fa: 'کالای باقی مانده گروه (۱) انبار', subsidiaryLedgerAccountId: '4401' },
    { id: '440200', code: '440200', name: 'Remaining Goods Group (2) Warehouse', name_fa: 'کالای باقی مانده گروه (۲) انبار', subsidiaryLedgerAccountId: '4402' },
    { id: '490100', code: '490100', name: 'Doubtful Accounts Expense', name_fa: 'هزینه مطالبات مشکوک الوصول', subsidiaryLedgerAccountId: '4901' },
    { id: '510100', code: '510100', name: 'Salaries & Wages', name_fa: 'حقوق و دستمزد', subsidiaryLedgerAccountId: '5101' },
    { id: '530100', code: '530100', name: 'Water, Electricity & Gas Expense', name_fa: 'هزینه آب و برق و گاز', subsidiaryLedgerAccountId: '5301' },
    { id: '590200', code: '590200', name: 'Loss from Asset Disposal', name_fa: 'زبان حاصل از فروش اسقاط دارایی', subsidiaryLedgerAccountId: '5902' },
    { id: '600100', code: '600100', name: 'Depreciation Expense', name_fa: 'هزینه استهلاک', subsidiaryLedgerAccountId: '6001' },
    { id: '700201', code: '700201', name: 'Social Security Insurance Payable', name_fa: 'بیمه تامین اجتماعی پرداختنی', subsidiaryLedgerAccountId: '7002' },
    { id: '700301', code: '700301', name: 'Payroll Tax Payable', name_fa: 'مالیات حقوق پرداختنی', subsidiaryLedgerAccountId: '7003' },
    { id: '710100', code: '710100', name: 'Retained Earnings', name_fa: 'سود و زیان انباشته', subsidiaryLedgerAccountId: '7101' },
    { id: '710200', code: '710200', name: 'Profit & Loss', name_fa: 'سود و زیان', subsidiaryLedgerAccountId: '7102' },
    { id: '800100', code: '800100', name: 'Closing Account', name_fa: 'حساب اختتامیه', subsidiaryLedgerAccountId: '8001' },
    { id: '880100', code: '880100', name: 'Third Party Collateral (Our Custody)', name_fa: 'انتظامی و وثایق اسناد دیگران نزد ما', subsidiaryLedgerAccountId: '8801' },
    { id: '880200', code: '880200', name: 'Our Collateral (Third Party Custody)', name_fa: 'انتظامی و وثایق اسناد ما نزد دیگران', subsidiaryLedgerAccountId: '8802' },
];

const defaultCategoryTree = [
    {
        mainGroup: { en: "Electric Home Appliances", fa: "لوازم برقی خانگی" },
        categories: [
            { category: { en: "Coffee & Hot Beverages", fa: "قهوه و نوشیدنی‌های گرم" }, subCategories: [ { en: "Espresso Machines", fa: "اسپرسوساز" }, { en: "Nespresso", fa: "نسپرسو" }, { en: "Coffee Makers", fa: "قهوه‌ساز" }, { en: "Electric Kettles / Tea Makers", fa: "کتری برقی / چای‌ساز" } ] },
            { category: { en: "Cooking Appliances", fa: "لوازم پخت و پز" }, subCategories: [ { en: "Grills & Sandwich Makers", fa: "گریل و ساندویچ‌ساز" }, { en: "Toasters & Oven Toasters", fa: "توستر و آون توستر" }, { en: "Microwaves", fa: "مایکروویو" }, { en: "Deep Fryers / Air Fryers", fa: "سرخ‌کن / هواپز" }, { en: "Rice Cookers & Slow Cookers", fa: "پلوپز و آرام‌پز" } ] },
            { category: { en: "Food Preparation", fa: "آماده‌سازی غذا" }, subCategories: [ { en: "Mixers", fa: "همزن" }, { en: "Blenders", fa: "مخلوط‌کن" }, { en: "Hand Blenders", fa: "گوشت‌کوب برقی" }, { en: "Food Processors", fa: "غذاساز" }, { en: "Choppers", fa: "خردکن" }, { en: "Juicers", fa: "آبمیوه‌گیری" } ] },
            { category: { en: "Garment Care", fa: "مراقبت از لباس" }, subCategories: [ { en: "Steam Irons", fa: "اتو بخار" }, { en: "Garment Steamers", fa: "بخارگر لباس" }, { en: "Steam Cleaners", fa: "بخارشوی" } ] },
            { category: { en: "Home Cleaning", fa: "نظافت خانه" }, subCategories: [ { en: "Vacuum Cleaners", fa: "جاروبرقی" }, { en: "Other Cleaning Devices", fa: "سایر لوازم نظافتی" } ] },
            { category: { en: "Personal Care", fa: "مراقبت شخصی" }, subCategories: [ { en: "Hair Dryers", fa: "سشوار" }, { en: "Hair Straighteners", fa: "اتومو" }, { en: "Hair Clippers", fa: "ماشین اصلاح سر" }, { en: "Trimmers", fa: "تریمر" } ] },
            { category: { en: "Major Appliances", fa: "لوازم بزرگ" }, subCategories: [ { en: "Refrigerators", fa: "یخچال" }, { en: "Freezers", fa: "فریزر" }, { en: "Washing Machines", fa: "ماشین لباسشویی" }, { en: "Dishwashers", fa: "ماشین ظرفشویی" } ] }
        ]
    },
    {
        mainGroup: { en: "Non-Electric Home Appliances", fa: "لوازم غیربرقی خانه" },
        categories: [
            { category: { en: "Kitchenware & Utensils", fa: "ظروف و ابزار آشپزخانه" }, subCategories: [ { en: "Pots, Pans, Frying Pans", fa: "قابلمه، تابه، ماهیتابه" }, { en: "Glass & Stainless Steel Containers", fa: "ظروف شیشه‌ای و استیل" }, { en: "Cups & Mugs", fa: "فنجان و ماگ" }, { en: "Jars & Storage Containers", fa: "بانکه و ظروف نگهداری" }, { en: "Flasks & Thermoses", fa: "فلاسک و ترموس" }, { en: "Knives, Graters, Peelers, Cutting Boards", fa: "چاقو، رنده، پوست‌کن، تخته برش" } ] }
        ]
    }
];

export class AppDB extends Dexie {
    orders!: Table<Order, string>; 
    statuses!: Table<Status, string>;
    checklistTemplates!: Table<ChecklistTemplate, string>;
    settings!: Table<Setting, string>;
    products!: Table<Product, string>;
    presetCosts!: Table<PresetCost, string>;
    priceHistory!: Table<PriceHistory, number>;
    // New tables for projects
    projects!: Table<Project, string>;
    projectStatuses!: Table<ProjectStatus, string>;
    tasks!: Table<Task, string>;
    customsBooks!: Table<CustomsBook, string>;
    customsBookCells!: Table<CustomsBookCell, [string, number, number]>;
    customsBookRowHeights!: Table<CustomsBookRowHeight, [string, number]>;
    customsBookMerges!: Table<CustomsBookMerge, [string, number, number]>;
    // New tables for product categories
    mainGroups!: Table<MainGroup, string>;
    categories!: Table<Category, string>;
    subCategories!: Table<SubCategory, string>;
    brands!: Table<Brand, string>;
    // New tables for Chart of Accounts
    generalLedgerAccounts!: Table<GeneralLedgerAccount, string>;
    subsidiaryLedgerAccounts!: Table<SubsidiaryLedgerAccount, string>;
    detailedLedgerAccounts!: Table<DetailedLedgerAccount, string>;
    stickyNotes!: Table<StickyNote, string>;
    // FIX: Add new tables for product media to normalize the data structure.
    productImages!: Table<ProductImage, string>;
    productAttachments!: Table<ProductAttachment, string>;
    calendarTasks!: Table<CalendarTask, number>;
    calendarStickyNotes!: Table<CalendarStickyNote, string>;
    dailyImages!: Table<DailyImage, number>;
    dailyAttachments!: Table<DailyAttachment, number>;
    fontCache!: Table<{ url: string; data: ArrayBuffer; fontWeight: number; }, string>;
    calendarLists!: Table<CalendarList, string>;
    suppliers!: Table<Supplier, string>;
    transactions!: Table<FinancialTransaction, string>;
    salesInvoices!: Table<SalesInvoice, string>;
    expenses!: Table<ExpenseRecord, string>;
    journalVouchers!: Table<JournalVoucher, string>;
    purchaseInvoices!: Table<PurchaseInvoice, string>;


    constructor() {
        super('OrderTrackerDB');
        
        // FIX: Cast `this` to `any` to allow calling `version` which is a method of Dexie but TS might complain if types are not perfectly aligned.
        (this as any).version(49).stores({
            orders: 'id, internalCode, supplier, orderDate, approxLoadingDate, status, isArchived, isFinalized, [creditPaymentDueDate], deletedAt, manualOrder',
            statuses: 'id, name, order, isSystem',
            checklistTemplates: 'id, name',
            settings: 'key',
            products: 'id, internalCode, sourceOrderId, deletedAt, order, createdAt, finalizedAt',
            presetCosts: 'id, name_en, name_fa',
            projects: 'id, name, createdAt, deletedAt',
            projectStatuses: 'id, projectId, order',
            tasks: 'id, projectId, statusId, order, [dueDate], [weight], deletedAt',
            priceHistory: '++id, productId, timestamp',
            customsBooks: 'id, name',
            customsBookCells: '[bookId+row+col], bookId, row, col',
            customsBookRowHeights: '[bookId+row], bookId',
            customsBookMerges: '[bookId+row+col], bookId',
            mainGroups: 'id, name',
            categories: 'id, name, mainGroupId',
            subCategories: 'id, name, categoryId',
            brands: 'id, name, subCategoryId',
            generalLedgerAccounts: 'id, code',
            subsidiaryLedgerAccounts: 'id, code, generalLedgerAccountId',
            detailedLedgerAccounts: 'id, code, subsidiaryLedgerAccountId',
            stickyNotes: 'id, statusName, order',
            productImages: 'id, productId',
            productAttachments: 'id, productId',
            calendarTasks: '++id, date, order, categoryId',
            calendarStickyNotes: 'id, date, order',
            dailyImages: '++id, date',
            dailyAttachments: '++id, date',
            fontCache: '&url, data, fontWeight',
            calendarLists: 'id, name, order',
            suppliers: 'id, code, name',
            transactions: 'id, date, type, supplierId, accountId',
            salesInvoices: 'id, invoiceNumber, customerName, date, status, orderId',
            expenses: 'id, expenseNumber, category, date, orderId',
            journalVouchers: 'id, voucherNumber, date, status, sourceType, sourceId',
            purchaseInvoices: 'id, invoiceNumber, supplierName, date, status, orderId',
        });
        
        // Register hooks
        // FIX: Cast `this` to `any` to access `on` method.
        (this as any).on('populate', () => seedDatabase(this as AppDB));
    }
}

export const db = new AppDB();

export class BackupDB extends Dexie {
    backups!: Table<{
        id?: number;
        timestamp: Date;
        data: string; // JSON string of all data
    }, number>;

    constructor() {
        super('OrderTrackerBackupDB');
        // FIX: Cast `this` to `any` to access `version` method.
        (this as any).version(1).stores({
            backups: '++id, timestamp',
        });
    }
}

export const backupDB = new BackupDB();

/**
 * Populates the database with initial default and sample data.
 * This function is safe to be called multiple times; it will not duplicate data.
 */
export const seedDatabase = async (db: AppDB) => {
    // FIX: Pass the tables as an array to db.transaction, not as spread arguments.
    // FIX: Cast `db` to `any` to access `transaction` method and `tables` property.
    await (db as any).transaction('rw', (db as any).tables, async () => {
        console.log("Populating/seeding database with configuration and sample data if needed...");

        // Use bulkPut for config data to avoid errors on re-population. This will always run.
        await db.statuses.bulkPut(defaultStatuses);
        await db.checklistTemplates.bulkPut(defaultChecklistTemplates);
        await db.settings.bulkPut(defaultSettings);
        await db.presetCosts.bulkPut(defaultPresetCosts);
        await db.customsBooks.put({ id: 'default', name: 'Default Book' });
        
        // --- Default Chart of Accounts ---
        await db.generalLedgerAccounts.bulkPut(glAccounts);
        await db.subsidiaryLedgerAccounts.bulkPut(slAccounts);
        await db.detailedLedgerAccounts.bulkPut(tlAccounts);
        
        // --- AUTO-SEED SUPPLIERS FROM ORDERS (First Run/Sync) ---
        const allOrders = await db.orders.toArray();
        const existingSuppliers = await db.suppliers.toArray();
        const supplierNames = new Set(existingSuppliers.map(s => s.name.toLowerCase()));
        
        // Find unique supplier names from orders that don't exist in suppliers table
        const newSupplierNames = new Set<string>();
        allOrders.forEach(order => {
            if (order.supplier && !supplierNames.has(order.supplier.toLowerCase())) {
                newSupplierNames.add(order.supplier);
            }
        });

        if (newSupplierNames.size > 0) {
            console.log(`Seeding ${newSupplierNames.size} new suppliers from existing orders...`);
            
            // Determine starting code index
            let maxCode = 0;
            existingSuppliers.forEach(s => {
                const match = s.code.match(/^SUP-(\d+)$/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (!isNaN(num) && num > maxCode) maxCode = num;
                }
            });

            const newSuppliers: Supplier[] = [];
            Array.from(newSupplierNames).forEach((name, index) => {
                const codeNum = maxCode + index + 1;
                const code = `SUP-${String(codeNum).padStart(2, '0')}`;
                newSuppliers.push({
                    id: crypto.randomUUID(),
                    code: code,
                    name: name,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            });

            await db.suppliers.bulkAdd(newSuppliers);
        }

        // --- GENERATE LARGE SAMPLE DATASET (only on first-ever run) ---
        const isFirstRun = localStorage.getItem('appHasBeenInitialized_v1') !== 'true';
        if (!isFirstRun) {
            console.log("Not the first run, skipping sample data generation.");
            return;
        }
        
        console.log("First run detected. Skipping large sample dataset generation as requested.");
        // Sample data generation code has been removed.
        
        // --- DEFAULT CATEGORIES ---
        console.log("Seeding default product categories...");

        const newlandBrandName = "Newland";
        const mainGroupsToAdd: MainGroup[] = [];
        const categoriesToAdd: Category[] = [];
        const subCategoriesToAdd: SubCategory[] = [];
        const brandsToAdd: Brand[] = [];

        for (const mainGroupNode of defaultCategoryTree) {
            const mainGroupId = crypto.randomUUID();
            mainGroupsToAdd.push({ id: mainGroupId, name: mainGroupNode.mainGroup.en, name_fa: mainGroupNode.mainGroup.fa });

            for (const categoryNode of mainGroupNode.categories) {
                const categoryId = crypto.randomUUID();
                categoriesToAdd.push({ id: categoryId, name: categoryNode.category.en, name_fa: categoryNode.category.fa, mainGroupId });

                for (const subCategory of categoryNode.subCategories) {
                    const subCategoryId = crypto.randomUUID();
                    subCategoriesToAdd.push({ id: subCategoryId, name: subCategory.en, name_fa: subCategory.fa, categoryId });
                    brandsToAdd.push({ id: crypto.randomUUID(), name: newlandBrandName, subCategoryId });
                }
            }
        }
        await db.mainGroups.bulkPut(mainGroupsToAdd);
        await db.categories.bulkPut(categoriesToAdd);
        await db.subCategories.bulkPut(subCategoriesToAdd);
        await db.brands.bulkPut(brandsToAdd);
        console.log("Default product categories seeded.");
        
        localStorage.setItem('appHasBeenInitialized_v1', 'true');
    });
}
