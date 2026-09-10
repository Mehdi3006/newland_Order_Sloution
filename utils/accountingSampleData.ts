import { db } from '../db';
import {
    Product,
    Supplier,
    PurchaseInvoice,
    SalesInvoice,
    JournalVoucher,
    ExpenseRecord,
    FinancialTransaction,
    DetailedLedgerAccount
} from '../types';

/**
 * 1. Sample Catalog Products
 */
export const sampleProducts: Product[] = [
    {
        id: 'prod-mx850',
        internalCode: 'NL-MX850',
        supplierCode: 'SZ-MX1800',
        description: 'Stand Mixer 8.5L 1800W Pro Metal Gearbox',
        productNameFa: 'همزن کاسه‌دار حرفه‌ای ۸.۵ لیتری ۱۸۰۰ وات نیولند',
        itemsPerCarton: 4,
        netWeight: 6.2,
        grossWeight: 6.8,
        cartonCBM: 0.082,
        hsCode: '85094000',
        purchasePriceUSD: 13.14,
        purchasePriceInSourceCurrency: 48.5,
        sourceCurrency: 'AED',
        shipStageCostsUSD: 0.85,
        dubaiStageCostsAED: 3.2,
        iranStageCostsTOMAN: 45000,
        iranCustomsCosts: {
            finalDuty_TOMAN: 120000,
            importVat_TOMAN: 240000,
            brokerFee_TOMAN: 15000,
            shipFreight_TOMAN: 35000,
            inlandFreight_TOMAN: 20000,
            standardFee_TOMAN: 8000,
            loadingUnloadingFee_TOMAN: 10000
        },
        landedCostUSD: 15.5,
        landedCostAED: 57.2,
        landedCostTOMAN: 1544400,
        sellingPrices: {
            aed: { tier1: 68.0, tier2: 72.0, tier3: 85.0 },
            toman: { tier1: 1850000, tier2: 1950000, tier3: 2250000 }
        },
        order: 1,
        sourceOrderId: 'ord-sample-01',
        createdAt: '2026-06-01T08:00:00Z',
        finalizedAt: '2026-06-02T10:00:00Z',
        deletedAt: null,
        settingsSnapshot: {} as any
    },
    {
        id: 'prod-af620',
        internalCode: 'NL-AF620',
        supplierCode: 'SZ-AF620-DIG',
        description: 'Digital Air Fryer 6.2L Touch Dual Heat',
        productNameFa: 'سرخ‌کن بدون روغن لمسی ۶.۲ لیتر نیولند',
        itemsPerCarton: 2,
        netWeight: 4.8,
        grossWeight: 5.5,
        cartonCBM: 0.065,
        hsCode: '85167900',
        purchasePriceUSD: 10.3,
        purchasePriceInSourceCurrency: 38.0,
        sourceCurrency: 'AED',
        shipStageCostsUSD: 0.7,
        dubaiStageCostsAED: 2.8,
        iranStageCostsTOMAN: 38000,
        iranCustomsCosts: {
            finalDuty_TOMAN: 95000,
            importVat_TOMAN: 190000,
            brokerFee_TOMAN: 12000,
            shipFreight_TOMAN: 28000,
            inlandFreight_TOMAN: 18000,
            standardFee_TOMAN: 6500,
            loadingUnloadingFee_TOMAN: 8500
        },
        landedCostUSD: 12.2,
        landedCostAED: 45.0,
        landedCostTOMAN: 1215000,
        sellingPrices: {
            aed: { tier1: 54.0, tier2: 58.0, tier3: 68.0 },
            toman: { tier1: 1450000, tier2: 1550000, tier3: 1800000 }
        },
        order: 2,
        sourceOrderId: 'ord-sample-01',
        createdAt: '2026-06-01T08:30:00Z',
        finalizedAt: '2026-06-02T10:00:00Z',
        deletedAt: null,
        settingsSnapshot: {} as any
    },
    {
        id: 'prod-es330',
        internalCode: 'NL-ES330',
        supplierCode: 'FOS-ES20BAR',
        description: 'Espresso Machine 20 Bar Stainless ThermoBlock',
        productNameFa: 'اسپرسوساز تمام استیل ۲۰ بار ترموبلاک نیولند',
        itemsPerCarton: 2,
        netWeight: 5.4,
        grossWeight: 6.2,
        cartonCBM: 0.075,
        hsCode: '85167100',
        purchasePriceUSD: 14.1,
        purchasePriceInSourceCurrency: 52.0,
        sourceCurrency: 'AED',
        shipStageCostsUSD: 0.95,
        dubaiStageCostsAED: 3.5,
        iranStageCostsTOMAN: 50000,
        iranCustomsCosts: {
            finalDuty_TOMAN: 140000,
            importVat_TOMAN: 280000,
            brokerFee_TOMAN: 16000,
            shipFreight_TOMAN: 40000,
            inlandFreight_TOMAN: 22000,
            standardFee_TOMAN: 9000,
            loadingUnloadingFee_TOMAN: 11000
        },
        landedCostUSD: 16.8,
        landedCostAED: 62.0,
        landedCostTOMAN: 1674000,
        sellingPrices: {
            aed: { tier1: 78.0, tier2: 85.0, tier3: 98.0 },
            toman: { tier1: 2100000, tier2: 2300000, tier3: 2650000 }
        },
        order: 3,
        sourceOrderId: 'ord-sample-02',
        createdAt: '2026-06-05T09:00:00Z',
        finalizedAt: '2026-06-06T11:00:00Z',
        deletedAt: null,
        settingsSnapshot: {} as any
    },
    {
        id: 'prod-bl410',
        internalCode: 'NL-BL410',
        supplierCode: 'ANZ-BL2200',
        description: 'Heavy Duty Blender 2200W Commercial Grade 2L',
        productNameFa: 'مخلوط‌کن صنعتی پرقدرت ۲۲۰۰ وات نیولند',
        itemsPerCarton: 6,
        netWeight: 4.1,
        grossWeight: 4.8,
        cartonCBM: 0.095,
        hsCode: '85094000',
        purchasePriceUSD: 7.18,
        purchasePriceInSourceCurrency: 26.5,
        sourceCurrency: 'AED',
        shipStageCostsUSD: 0.6,
        dubaiStageCostsAED: 2.2,
        iranStageCostsTOMAN: 30000,
        iranCustomsCosts: {
            finalDuty_TOMAN: 70000,
            importVat_TOMAN: 140000,
            brokerFee_TOMAN: 10000,
            shipFreight_TOMAN: 22000,
            inlandFreight_TOMAN: 15000,
            standardFee_TOMAN: 5000,
            loadingUnloadingFee_TOMAN: 7000
        },
        landedCostUSD: 8.6,
        landedCostAED: 31.8,
        landedCostTOMAN: 858600,
        sellingPrices: {
            aed: { tier1: 38.0, tier2: 42.0, tier3: 49.0 },
            toman: { tier1: 1050000, tier2: 1150000, tier3: 1350000 }
        },
        order: 4,
        sourceOrderId: 'ord-sample-02',
        createdAt: '2026-06-10T11:00:00Z',
        finalizedAt: '2026-06-11T12:00:00Z',
        deletedAt: null,
        settingsSnapshot: {} as any
    },
    {
        id: 'prod-to240',
        internalCode: 'NL-TO240',
        supplierCode: 'ANZ-TO4S',
        description: 'Smart 4-Slice Toaster Wide Slot LED Display',
        productNameFa: 'توستر نان ۴ اسلایس هوشمند نیولند',
        itemsPerCarton: 4,
        netWeight: 2.7,
        grossWeight: 3.2,
        cartonCBM: 0.052,
        hsCode: '85167200',
        purchasePriceUSD: 4.88,
        purchasePriceInSourceCurrency: 18.0,
        sourceCurrency: 'AED',
        shipStageCostsUSD: 0.45,
        dubaiStageCostsAED: 1.8,
        iranStageCostsTOMAN: 22000,
        iranCustomsCosts: {
            finalDuty_TOMAN: 48000,
            importVat_TOMAN: 96000,
            brokerFee_TOMAN: 8000,
            shipFreight_TOMAN: 16000,
            inlandFreight_TOMAN: 12000,
            standardFee_TOMAN: 4000,
            loadingUnloadingFee_TOMAN: 5500
        },
        landedCostUSD: 5.9,
        landedCostAED: 21.8,
        landedCostTOMAN: 588600,
        sellingPrices: {
            aed: { tier1: 26.0, tier2: 29.5, tier3: 35.0 },
            toman: { tier1: 720000, tier2: 800000, tier3: 950000 }
        },
        order: 5,
        sourceOrderId: 'ord-sample-03',
        createdAt: '2026-06-15T14:00:00Z',
        finalizedAt: '2026-06-16T15:00:00Z',
        deletedAt: null,
        settingsSnapshot: {} as any
    }
];

/**
 * 2. Sample Suppliers (تامین‌کنندگان)
 */
export const sampleSuppliers: Supplier[] = [
    {
        id: 'sup-01',
        code: '310101',
        name: 'کارخانه لوازم خانگی پارس',
        name_fa: 'کارخانه لوازم خانگی پارس',
        contactPerson: 'مهندس رضایی',
        phone: '+98-21-88997700',
        city: 'تهران / شهرک صنعتی شمس‌آباد',
        country: 'Iran',
        paymentTerms: '30% پیش‌پرداخت، 70% تسویه قبل از بارگیری',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
    },
    {
        id: 'sup-02',
        code: '310102',
        name: 'صنایع الکترونیک آنزو',
        name_fa: 'صنایع الکترونیک آنزو',
        contactPerson: 'آقای کمالی',
        phone: '+98-76-33445566',
        city: 'قشم / منطقه آزاد',
        country: 'Iran',
        paymentTerms: 'نقد پس از تحویل در انبار دبی',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
    },
    {
        id: 'sup-03',
        code: '310103',
        name: 'Shenzhen Newland Electric Co.',
        name_fa: 'شنژن نیولند الکتریک چین',
        contactPerson: 'Mr. David Chen',
        phone: '+86-755-88332211',
        city: 'Shenzhen, Guangdong',
        country: 'China',
        paymentTerms: 'LC at sight / 30% TT deposit, 70% on BL copy',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
    },
    {
        id: 'sup-04',
        code: '310104',
        name: 'Foshan Tech Appliances Ltd',
        name_fa: 'شرکت تولیدی فوشان تک چین',
        contactPerson: 'Ms. Alice Wong',
        phone: '+86-757-22334455',
        city: 'Foshan, Guangdong',
        country: 'China',
        paymentTerms: 'اعتباری ۳۰ روزه پس از بارگیری کانتینر',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
    }
];

/**
 * 3. Sample Detailed Ledger Accounts (حساب‌های تفصیلی اشخاص و بانک‌ها)
 */
export const sampleDetailedAccounts: DetailedLedgerAccount[] = [
    // Banks & Cash
    {
        id: 'dl-060100',
        code: '060100',
        name: 'NBO BANK DUBAI',
        name_fa: 'بانک ملی عمان - حساب ارزی دبی (درهم)',
        subsidiaryLedgerAccountId: '0601',
        partyType: 'bank',
        nature: 'debit'
    },
    {
        id: 'dl-060200',
        code: '060200',
        name: 'YOUSEF JAFARI FX ACC',
        name_fa: 'حساب ارزی یوسف جعفری دبی',
        subsidiaryLedgerAccountId: '0602',
        partyType: 'bank',
        nature: 'debit'
    },
    {
        id: 'dl-064000',
        code: '064000',
        name: 'Bank Melli Iran Rial',
        name_fa: 'بانک ملی ایران - حساب ریالی تجاری',
        subsidiaryLedgerAccountId: '0640',
        partyType: 'bank',
        nature: 'debit'
    },
    {
        id: 'dl-110100',
        code: '110100',
        name: 'Cash on Hand AED',
        name_fa: 'صندوق نقدی شرکت دبی (درهم)',
        subsidiaryLedgerAccountId: '1101',
        partyType: 'cash',
        nature: 'debit'
    },

    // Customers (Trade Debtors)
    {
        id: 'dl-210101',
        code: '210101',
        name: 'Refah Chain Stores',
        name_fa: 'فروشگاه زنجیره ای رفاه',
        subsidiaryLedgerAccountId: '2101',
        partyType: 'customer',
        partyId: 'cust-refah',
        phone: '+98-21-88776655',
        address: 'تهران، بلوار کشاورز، شرکت فروشگاه‌های رفاه',
        creditLimit: 500000,
        nature: 'debit'
    },
    {
        id: 'dl-210102',
        code: '210102',
        name: 'Alborz Distribution Co.',
        name_fa: 'شرکت پخش البرز',
        subsidiaryLedgerAccountId: '2101',
        partyType: 'customer',
        partyId: 'cust-alborz',
        phone: '+98-26-34556677',
        address: 'کرج، شهرک صنعتی سیمین‌دشت',
        creditLimit: 350000,
        nature: 'debit'
    },
    {
        id: 'dl-201000',
        code: '201000',
        name: 'Qeshm Kuwaiti Store - HQ',
        name_fa: 'فروشگاه کویتی قشم دفتر مرکزی',
        subsidiaryLedgerAccountId: '2010',
        partyType: 'customer',
        partyId: 'cust-qeshm',
        phone: '+98-76-35221100',
        address: 'قشم، مجتمع تجاری ستاره، پلاک ۱۱۰',
        creditLimit: 200000,
        nature: 'debit'
    },
    {
        id: 'dl-210103',
        code: '210103',
        name: 'Hyperstar Dubai Trading',
        name_fa: 'هایپرمی / هایپراستار دبی',
        subsidiaryLedgerAccountId: '2101',
        partyType: 'customer',
        partyId: 'cust-hyperstar',
        phone: '+971-4-2889900',
        address: 'Deira, Dubai, UAE',
        creditLimit: 400000,
        nature: 'debit'
    },
    {
        id: 'dl-210104',
        code: '210104',
        name: 'Omid Home Appliances',
        name_fa: 'فروشگاه لوازم خانگی امید',
        subsidiaryLedgerAccountId: '2101',
        partyType: 'customer',
        partyId: 'cust-omid',
        phone: '+98-21-33112233',
        address: 'تهران، خیابان سه‌راه امین‌حضور',
        creditLimit: 100000,
        nature: 'debit'
    },

    // Suppliers (Trade Creditors)
    {
        id: 'dl-310101',
        code: '310101',
        name: 'Pars Home Appliances Factory',
        name_fa: 'کارخانه لوازم خانگی پارس',
        subsidiaryLedgerAccountId: '3101',
        partyType: 'supplier',
        partyId: 'sup-01',
        phone: '+98-21-88997700',
        nature: 'credit'
    },
    {
        id: 'dl-310102',
        code: '310102',
        name: 'Anzo Electronic Industries',
        name_fa: 'صنایع الکترونیک آنزو',
        subsidiaryLedgerAccountId: '3101',
        partyType: 'supplier',
        partyId: 'sup-02',
        phone: '+98-76-33445566',
        nature: 'credit'
    },
    {
        id: 'dl-310103',
        code: '310103',
        name: 'Shenzhen Newland Electric Co.',
        name_fa: 'شنژن نیولند الکتریک چین',
        subsidiaryLedgerAccountId: '3101',
        partyType: 'supplier',
        partyId: 'sup-03',
        phone: '+86-755-88332211',
        nature: 'credit'
    },
    {
        id: 'dl-310104',
        code: '310104',
        name: 'Foshan Tech Appliances Ltd',
        name_fa: 'شرکت تولیدی فوشان تک چین',
        subsidiaryLedgerAccountId: '3101',
        partyType: 'supplier',
        partyId: 'sup-04',
        phone: '+86-757-22334455',
        nature: 'credit'
    }
];

/**
 * 4. Sample Purchase Invoices (فاکتورهای خرید در سناریوهای متنوع)
 */
export const samplePurchaseInvoices: PurchaseInvoice[] = [
    // Scenario 1: خرید عمده کانتینری ارزی از چین با اقلام کارتنی کامل و تسویه کامل نقدی (Paid)
    {
        id: 'pinv-2026-001',
        invoiceNumber: 'PUR-2026-001',
        supplierId: 'sup-03',
        supplierName: 'Shenzhen Newland Electric Co.',
        supplierAccountId: 'dl-310103',
        supplierAccountCode: '310103',
        date: '2026-07-15',
        dueDate: '2026-07-20',
        currency: 'AED',
        currencyRate: 1,
        fxRateToToman: 27000,
        subtotal: 22020,
        additionalCosts: 1480, // Freight & Inspection
        totalAmount: 23500,
        paidAmount: 23500,
        status: 'paid',
        isLocked: true,
        voucherId: 'jv-1001',
        notes: 'خرید کانتینر ۴۰ فوت های‌کیوب سفارش شماره PO-2026-88. تسویه کامل از طریق حواله بانک NBO دبی.',
        createdAt: '2026-07-15T09:00:00Z',
        items: [
            {
                id: 'pitem-101',
                productId: 'prod-mx850',
                internalCode: 'NL-MX850',
                productName: 'همزن کاسه‌دار حرفه‌ای ۸.۵ لیتری ۱۸۰۰ وات نیولند',
                unitType: 'carton',
                itemsPerCarton: 4,
                cartonCount: 50,
                looseUnits: 0,
                quantity: 200,
                pricingBasis: 'per_unit',
                cartonPrice: 194.0,
                unitPrice: 48.5,
                totalPrice: 9700,
                cbm: 4.1,
                grossWeight: 340,
                notes: '۵۰ کارتن ۴ عددی استاندارد با کارتن رنگی ۵ لایه'
            },
            {
                id: 'pitem-102',
                productId: 'prod-af620',
                internalCode: 'NL-AF620',
                productName: 'سرخ‌کن بدون روغن لمسی ۶.۲ لیتر نیولند',
                unitType: 'carton',
                itemsPerCarton: 2,
                cartonCount: 80,
                looseUnits: 0,
                quantity: 160,
                pricingBasis: 'per_unit',
                cartonPrice: 76.0,
                unitPrice: 38.0,
                totalPrice: 6080,
                cbm: 5.2,
                grossWeight: 440,
                notes: '۸۰ کارتن ۲ عددی مدل دیجیتال'
            },
            {
                id: 'pitem-103',
                productId: 'prod-es330',
                internalCode: 'NL-ES330',
                productName: 'اسپرسوساز تمام استیل ۲۰ بار ترموبلاک نیولند',
                unitType: 'carton',
                itemsPerCarton: 2,
                cartonCount: 60,
                looseUnits: 0,
                quantity: 120,
                pricingBasis: 'per_unit',
                cartonPrice: 104.0,
                unitPrice: 52.0,
                totalPrice: 6240,
                cbm: 4.5,
                grossWeight: 372,
                notes: '۶۰ کارتن ۲ عددی همراه تمپر و فیلتر دوبل'
            }
        ]
    },

    // Scenario 2: خرید ترکیبی (کارتنی + قطعات خرد/نمونه) با تسویه جزئی (Partial Paid)
    {
        id: 'pinv-2026-002',
        invoiceNumber: 'PUR-2026-002',
        supplierId: 'sup-02',
        supplierName: 'صنایع الکترونیک آنزو',
        supplierAccountId: 'dl-310102',
        supplierAccountCode: '310102',
        date: '2026-08-01',
        dueDate: '2026-08-20',
        currency: 'AED',
        currencyRate: 1,
        fxRateToToman: 27000,
        subtotal: 7756,
        additionalCosts: 450, // Dubai Inland transport
        totalAmount: 8206,
        paidAmount: 5000,
        status: 'partial',
        isLocked: false,
        voucherId: 'jv-1002',
        notes: 'خرید پارت دوم مخلوط‌کن و توستر. ۵۰۰۰ درهم بیعانه پرداخت شد، مانده ۳۲۰۶ درهم تا ۲۰ آگوست.',
        createdAt: '2026-08-01T10:30:00Z',
        items: [
            {
                id: 'pitem-201',
                productId: 'prod-bl410',
                internalCode: 'NL-BL410',
                productName: 'مخلوط‌کن صنعتی پرقدرت ۲۲۰۰ وات نیولند',
                unitType: 'carton',
                itemsPerCarton: 6,
                cartonCount: 30,
                looseUnits: 0,
                quantity: 180,
                pricingBasis: 'per_unit',
                cartonPrice: 159.0,
                unitPrice: 26.5,
                totalPrice: 4770,
                cbm: 2.85,
                grossWeight: 144,
                notes: '۳۰ کارتن کامل'
            },
            {
                id: 'pitem-202',
                productId: 'prod-bl410',
                internalCode: 'NL-BL410',
                productName: 'مخلوط‌کن صنعتی پرقدرت ۲۲۰۰ وات نیولند (نمونه شوروم)',
                unitType: 'piece',
                itemsPerCarton: 6,
                cartonCount: 0,
                looseUnits: 4,
                quantity: 4,
                pricingBasis: 'per_unit',
                cartonPrice: 159.0,
                unitPrice: 26.5,
                totalPrice: 106,
                cbm: 0.06,
                grossWeight: 3.2,
                notes: '۴ عدد نمونه آزمایشگاهی و بازرسی'
            },
            {
                id: 'pitem-203',
                productId: 'prod-to240',
                internalCode: 'NL-TO240',
                productName: 'توستر نان ۴ اسلایس هوشمند نیولند',
                unitType: 'carton',
                itemsPerCarton: 4,
                cartonCount: 40,
                looseUnits: 0,
                quantity: 160,
                pricingBasis: 'per_unit',
                cartonPrice: 72.0,
                unitPrice: 18.0,
                totalPrice: 2880,
                cbm: 2.08,
                grossWeight: 128,
                notes: '۴۰ کارتن ۴ عددی'
            }
        ]
    },

    // Scenario 3: خرید اعتباری مدت‌دار ۳۰ روزه با سررسید آتی (Unpaid)
    {
        id: 'pinv-2026-003',
        invoiceNumber: 'PUR-2026-003',
        supplierId: 'sup-04',
        supplierName: 'Foshan Tech Appliances Ltd',
        supplierAccountId: 'dl-310104',
        supplierAccountCode: '310104',
        date: '2026-08-10',
        dueDate: '2026-09-10',
        currency: 'AED',
        currencyRate: 1,
        fxRateToToman: 27000,
        subtotal: 7870,
        additionalCosts: 0,
        totalAmount: 7870,
        paidAmount: 0,
        status: 'unpaid',
        isLocked: false,
        voucherId: 'jv-1003',
        notes: 'خرید اعتباری ۱ ماهه اسپرسوساز و سرخ‌کن پارت پاییزه. سررسید ۱۰ سپتامبر ۲۰۲۶.',
        createdAt: '2026-08-10T14:00:00Z',
        items: [
            {
                id: 'pitem-301',
                productId: 'prod-es330',
                internalCode: 'NL-ES330',
                productName: 'اسپرسوساز تمام استیل ۲۰ بار ترموبلاک نیولند',
                unitType: 'carton',
                itemsPerCarton: 2,
                cartonCount: 40,
                looseUnits: 0,
                quantity: 80,
                pricingBasis: 'per_unit',
                cartonPrice: 103.0,
                unitPrice: 51.5,
                totalPrice: 4120,
                cbm: 3.0,
                grossWeight: 248,
                notes: '۴۰ کارتن ۲ عددی'
            },
            {
                id: 'pitem-302',
                productId: 'prod-af620',
                internalCode: 'NL-AF620',
                productName: 'سرخ‌کن بدون روغن لمسی ۶.۲ لیتر نیولند',
                unitType: 'carton',
                itemsPerCarton: 2,
                cartonCount: 50,
                looseUnits: 0,
                quantity: 100,
                pricingBasis: 'per_unit',
                cartonPrice: 75.0,
                unitPrice: 37.5,
                totalPrice: 3750,
                cbm: 3.25,
                grossWeight: 275,
                notes: '۵۰ کارتن ۲ عددی'
            }
        ]
    }
];

/**
 * 5. Sample Sales Invoices (فاکتورهای فروش در سناریوهای مختلف)
 */
export const sampleSalesInvoices: SalesInvoice[] = [
    // Scenario 1: فروش عمده رسمی کارتنی به فروشگاه زنجیره‌ای رفاه با تخفیف تجاری و تسویه کامل (Paid)
    {
        id: 'sinv-2026-101',
        invoiceNumber: 'INV-2026-101',
        customerId: 'cust-refah',
        customerName: 'فروشگاه زنجیره ای رفاه',
        customerAccountId: 'dl-210101',
        customerAccountCode: '210101',
        customerPhone: '+98-21-88776655',
        date: '2026-07-22',
        dueDate: '2026-07-25',
        currency: 'AED',
        currencyRate: 1,
        fxRateToToman: 27000,
        subtotal: 12300,
        discount: 300,
        tax: 0,
        totalAmount: 12000,
        paidAmount: 12000,
        status: 'paid',
        isLocked: true,
        voucherId: 'jv-2001',
        notes: 'فروش عمده پارت تابستانه به فروشگاه رفاه تهران. تخفیف نقدی اعمال و کل مبلغ به حساب بانک NBO واریز شد.',
        createdAt: '2026-07-22T11:00:00Z',
        items: [
            {
                id: 'sitem-101',
                productId: 'prod-mx850',
                internalCode: 'NL-MX850',
                productName: 'همزن کاسه‌دار حرفه‌ای ۸.۵ لیتری ۱۸۰۰ وات نیولند',
                unitType: 'carton',
                itemsPerCarton: 4,
                cartonCount: 25,
                looseUnits: 0,
                quantity: 100,
                pricingBasis: 'per_unit',
                cartonPrice: 288.0,
                unitPrice: 72.0,
                totalPrice: 7200,
                cbm: 2.05,
                grossWeight: 170
            },
            {
                id: 'sitem-102',
                productId: 'prod-es330',
                internalCode: 'NL-ES330',
                productName: 'اسپرسوساز تمام استیل ۲۰ بار ترموبلاک نیولند',
                unitType: 'carton',
                itemsPerCarton: 2,
                cartonCount: 30,
                looseUnits: 0,
                quantity: 60,
                pricingBasis: 'per_unit',
                cartonPrice: 170.0,
                unitPrice: 85.0,
                totalPrice: 5100,
                cbm: 2.25,
                grossWeight: 186
            }
        ]
    },

    // Scenario 2: فروش ترکیبی کارتن + چند عدد خرد به شرکت پخش البرز با وضعیت اعتباری پرداخت نشده (Unpaid)
    {
        id: 'sinv-2026-102',
        invoiceNumber: 'INV-2026-102',
        customerId: 'cust-alborz',
        customerName: 'شرکت پخش البرز',
        customerAccountId: 'dl-210102',
        customerAccountCode: '210102',
        customerPhone: '+98-26-34556677',
        date: '2026-08-05',
        dueDate: '2026-08-25',
        currency: 'AED',
        currencyRate: 1,
        fxRateToToman: 27000,
        subtotal: 8272,
        discount: 122,
        tax: 0,
        totalAmount: 8150,
        paidAmount: 0,
        status: 'unpaid',
        isLocked: false,
        voucherId: 'jv-2002',
        notes: 'فروش اعتباری ۲۰ روزه به پخش البرز. شامل ۳۵ کارتن سرخ‌کن، ۱۵ کارتن مخلوط‌کن و ۶ عدد نمونه.',
        createdAt: '2026-08-05T14:30:00Z',
        items: [
            {
                id: 'sitem-201',
                productId: 'prod-af620',
                internalCode: 'NL-AF620',
                productName: 'سرخ‌کن بدون روغن لمسی ۶.۲ لیتر نیولند',
                unitType: 'carton',
                itemsPerCarton: 2,
                cartonCount: 35,
                looseUnits: 0,
                quantity: 70,
                pricingBasis: 'per_unit',
                cartonPrice: 116.0,
                unitPrice: 58.0,
                totalPrice: 4060,
                cbm: 2.27,
                grossWeight: 192.5
            },
            {
                id: 'sitem-202',
                productId: 'prod-bl410',
                internalCode: 'NL-BL410',
                productName: 'مخلوط‌کن صنعتی پرقدرت ۲۲۰۰ وات نیولند',
                unitType: 'carton',
                itemsPerCarton: 6,
                cartonCount: 15,
                looseUnits: 0,
                quantity: 90,
                pricingBasis: 'per_unit',
                cartonPrice: 252.0,
                unitPrice: 42.0,
                totalPrice: 3780,
                cbm: 1.42,
                grossWeight: 72
            },
            {
                id: 'sitem-203',
                productId: 'prod-mx850',
                internalCode: 'NL-MX850',
                productName: 'همزن کاسه‌دار حرفه‌ای ۸.۵ لیتری نیولند (تک واحدی)',
                unitType: 'piece',
                itemsPerCarton: 4,
                cartonCount: 0,
                looseUnits: 6,
                quantity: 6,
                pricingBasis: 'per_unit',
                cartonPrice: 288.0,
                unitPrice: 72.0,
                totalPrice: 432,
                cbm: 0.12,
                grossWeight: 10.2
            }
        ]
    },

    // Scenario 3: فروش به فروشگاه کویتی قشم با تسویه جزئی (Partial Paid)
    {
        id: 'sinv-2026-103',
        invoiceNumber: 'INV-2026-103',
        customerId: 'cust-qeshm',
        customerName: 'فروشگاه کویتی قشم دفتر مرکزی',
        customerAccountId: 'dl-201000',
        customerAccountCode: '201000',
        customerPhone: '+98-76-35221100',
        date: '2026-08-12',
        dueDate: '2026-08-30',
        currency: 'AED',
        currencyRate: 1,
        fxRateToToman: 27000,
        subtotal: 7820,
        discount: 0,
        tax: 0,
        totalAmount: 7820,
        paidAmount: 4000,
        status: 'partial',
        isLocked: false,
        voucherId: 'jv-2003',
        notes: 'فروش اقلام جور به فروشگاه کویتی قشم. ۴۰۰۰ درهم نقد پرداخت شد و مانده ۳۸۲۰ درهم تا پایان ماه تسویه می‌شود.',
        createdAt: '2026-08-12T16:00:00Z',
        items: [
            {
                id: 'sitem-301',
                productId: 'prod-to240',
                internalCode: 'NL-TO240',
                productName: 'توستر نان ۴ اسلایس هوشمند نیولند',
                unitType: 'carton',
                itemsPerCarton: 4,
                cartonCount: 25,
                looseUnits: 0,
                quantity: 100,
                pricingBasis: 'per_unit',
                cartonPrice: 118.0,
                unitPrice: 29.5,
                totalPrice: 2950,
                cbm: 1.3,
                grossWeight: 80
            },
            {
                id: 'sitem-302',
                productId: 'prod-es330',
                internalCode: 'NL-ES330',
                productName: 'اسپرسوساز تمام استیل ۲۰ بار ترموبلاک نیولند',
                unitType: 'carton',
                itemsPerCarton: 2,
                cartonCount: 15,
                looseUnits: 0,
                quantity: 30,
                pricingBasis: 'per_unit',
                cartonPrice: 170.0,
                unitPrice: 85.0,
                totalPrice: 2550,
                cbm: 1.12,
                grossWeight: 93
            },
            {
                id: 'sitem-303',
                productId: 'prod-af620',
                internalCode: 'NL-AF620',
                productName: 'سرخ‌کن بدون روغن لمسی ۶.۲ لیتر نیولند',
                unitType: 'carton',
                itemsPerCarton: 2,
                cartonCount: 20,
                looseUnits: 0,
                quantity: 40,
                pricingBasis: 'per_unit',
                cartonPrice: 116.0,
                unitPrice: 58.0,
                totalPrice: 2320,
                cbm: 1.3,
                grossWeight: 110
            }
        ]
    },

    // Scenario 4: فروش نقدی خرد فروشگاهی با تسویه آنی از طریق صندوق نقدی (Paid)
    {
        id: 'sinv-2026-104',
        invoiceNumber: 'INV-2026-104',
        customerId: 'cust-omid',
        customerName: 'فروشگاه لوازم خانگی امید',
        customerAccountId: 'dl-210104',
        customerAccountCode: '210104',
        customerPhone: '+98-21-33112233',
        date: '2026-08-18',
        dueDate: '2026-08-18',
        currency: 'AED',
        currencyRate: 1,
        fxRateToToman: 27000,
        subtotal: 600,
        discount: 0,
        tax: 0,
        totalAmount: 600,
        paidAmount: 600,
        status: 'paid',
        isLocked: true,
        voucherId: 'jv-2004',
        notes: 'فروش نقدی فروشگاهی و تک‌فروشی نمونه‌ها. وجه نقد دریافت و به صندوق دبی (110100) واریز گردید.',
        createdAt: '2026-08-18T10:00:00Z',
        items: [
            {
                id: 'sitem-401',
                productId: 'prod-mx850',
                internalCode: 'NL-MX850',
                productName: 'همزن کاسه‌دار حرفه‌ای ۸.۵ لیتری نیولند',
                unitType: 'piece',
                itemsPerCarton: 4,
                cartonCount: 0,
                looseUnits: 4,
                quantity: 4,
                pricingBasis: 'per_unit',
                cartonPrice: 300.0,
                unitPrice: 75.0,
                totalPrice: 300,
                cbm: 0.08,
                grossWeight: 6.8
            },
            {
                id: 'sitem-402',
                productId: 'prod-af620',
                internalCode: 'NL-AF620',
                productName: 'سرخ‌کن بدون روغن لمسی ۶.۲ لیتر نیولند',
                unitType: 'piece',
                itemsPerCarton: 2,
                cartonCount: 0,
                looseUnits: 5,
                quantity: 5,
                pricingBasis: 'per_unit',
                cartonPrice: 120.0,
                unitPrice: 60.0,
                totalPrice: 300,
                cbm: 0.16,
                grossWeight: 13.7
            }
        ]
    }
];

/**
 * 6. Sample Double-Entry Journal Vouchers (اسناد حسابداری دوبل کاملاً متوازن و تراز)
 */
export const sampleJournalVouchers: JournalVoucher[] = [
    // JV 1: سند افتتاحیه و تراز اول دوره شرکت (Opening Balances)
    {
        id: 'jv-0001',
        voucherNumber: 1000,
        date: '2026-01-01',
        description: 'سند افتتاحیه تراز دارایی‌ها، بانک‌ها، موجودی اول دوره و سرمایه شرکاء',
        sourceType: 'manual',
        status: 'posted',
        totalDebit: 300000,
        totalCredit: 300000,
        createdAt: '2026-01-01T08:00:00Z',
        items: [
            {
                id: 'jvi-01',
                accountId: 'dl-060100',
                accountCode: '060100',
                accountName: 'NBO BANK DUBAI (موجودی اول دوره بانک)',
                debit: 200000,
                credit: 0,
                currency: 'AED',
                foreignAmount: 200000,
                description: 'موجودی ریالی/ارزی اول دوره نزد بانک ملی عمان دبی'
            },
            {
                id: 'jvi-02',
                accountId: 'dl-110100',
                accountCode: '110100',
                accountName: 'صندوق نقدی شرکت دبی',
                debit: 30000,
                credit: 0,
                currency: 'AED',
                foreignAmount: 30000,
                description: 'موجودی نقد اول دوره صندوق دبی'
            },
            {
                id: 'jvi-03',
                accountId: '0301',
                accountCode: '030100',
                accountName: 'دارایی‌های ثابت - اثاثه و تجهیزات اداری و انبار',
                debit: 70000,
                credit: 0,
                currency: 'AED',
                foreignAmount: 70000,
                description: 'ارزش دفتری دارایی‌های ثابت، رک‌ها و لیفتراک انبار'
            },
            {
                id: 'jvi-04',
                accountId: '0101',
                accountCode: '010100',
                accountName: 'سرمایه اولیه و شرکاء (Capital)',
                debit: 0,
                credit: 300000,
                currency: 'AED',
                foreignAmount: 300000,
                description: 'سرمایه ثبت شده موسسین و شرکاء بازرگانی نیولند'
            }
        ]
    },

    // JV 2: سند حسابداری خرید فاکتور PUR-2026-001 از شنژن الکتریک
    {
        id: 'jv-1001',
        voucherNumber: 1001,
        date: '2026-07-15',
        description: 'فاکتور خرید کالا شماره PUR-2026-001 از Shenzhen Newland Electric Co.',
        sourceType: 'purchase_invoice',
        sourceId: 'pinv-2026-001',
        referenceNumber: 'PUR-2026-001',
        status: 'posted',
        totalDebit: 23500,
        totalCredit: 23500,
        createdAt: '2026-07-15T09:00:00Z',
        items: [
            {
                id: 'jvi-101',
                accountId: '1004',
                accountCode: '1004',
                accountName: 'موجودی کالا (انبار خرید)',
                debit: 23500,
                credit: 0,
                currency: 'AED',
                foreignAmount: 23500,
                description: 'خرید کالا فاکتور شماره PUR-2026-001 (۳ قلم عمده)'
            },
            {
                id: 'jvi-102',
                accountId: 'dl-310103',
                accountCode: '310103',
                accountName: 'تامین‌کننده: Shenzhen Newland Electric Co.',
                debit: 0,
                credit: 23500,
                currency: 'AED',
                foreignAmount: 23500,
                partyType: 'supplier',
                partyId: 'sup-03',
                partyName: 'Shenzhen Newland Electric Co.',
                description: 'بستانکاری خرید کالا فاکتور شماره PUR-2026-001'
            }
        ]
    },

    // JV 3: سند تسویه و پرداخت فاکتور PUR-2026-001 از طریق بانک NBO دبی
    {
        id: 'jv-1001-pay',
        voucherNumber: 1002,
        date: '2026-07-16',
        description: 'پرداخت وجه حواله بابت تسویه فاکتور خرید PUR-2026-001 به شنژن الکتریک',
        sourceType: 'payment',
        sourceId: 'pinv-2026-001',
        referenceNumber: 'PUR-2026-001',
        status: 'posted',
        totalDebit: 23500,
        totalCredit: 23500,
        createdAt: '2026-07-16T10:00:00Z',
        items: [
            {
                id: 'jvi-103',
                accountId: 'dl-310103',
                accountCode: '310103',
                accountName: 'تامین‌کننده: Shenzhen Newland Electric Co.',
                debit: 23500,
                credit: 0,
                currency: 'AED',
                foreignAmount: 23500,
                partyType: 'supplier',
                partyId: 'sup-03',
                partyName: 'Shenzhen Newland Electric Co.',
                description: 'تسویه بدهی فاکتور خرید PUR-2026-001'
            },
            {
                id: 'jvi-104',
                accountId: 'dl-060100',
                accountCode: '060100',
                accountName: 'NBO BANK DUBAI',
                debit: 0,
                credit: 23500,
                currency: 'AED',
                foreignAmount: 23500,
                description: 'پرداخت حواله بانکی به حساب کارخانه در چین'
            }
        ]
    },

    // JV 4: سند فاکتور فروش INV-2026-101 به فروشگاه رفاه
    {
        id: 'jv-2001',
        voucherNumber: 1003,
        date: '2026-07-22',
        description: 'فاکتور فروش کالا شماره INV-2026-101 به فروشگاه زنجیره ای رفاه',
        sourceType: 'sales_invoice',
        sourceId: 'sinv-2026-101',
        referenceNumber: 'INV-2026-101',
        status: 'posted',
        totalDebit: 12000,
        totalCredit: 12000,
        createdAt: '2026-07-22T11:00:00Z',
        items: [
            {
                id: 'jvi-201',
                accountId: 'dl-210101',
                accountCode: '210101',
                accountName: 'مشتری: فروشگاه زنجیره ای رفاه',
                debit: 12000,
                credit: 0,
                currency: 'AED',
                foreignAmount: 12000,
                partyType: 'customer',
                partyId: 'cust-refah',
                partyName: 'فروشگاه زنجیره ای رفاه',
                description: 'بدهکاری فروش کالا فاکتور شماره INV-2026-101'
            },
            {
                id: 'jvi-202',
                accountId: '4001',
                accountCode: '4001',
                accountName: 'درآمد حاصل از فروش کالا',
                debit: 0,
                credit: 12000,
                currency: 'AED',
                foreignAmount: 12000,
                description: 'فروش کالا فاکتور شماره INV-2026-101 به فروشگاه زنجیره ای رفاه'
            }
        ]
    },

    // JV 5: سند وصول وجه فاکتور رفاه به بانک NBO دبی
    {
        id: 'jv-2001-rec',
        voucherNumber: 1004,
        date: '2026-07-23',
        description: 'دریافت وجه بابت تسویه فاکتور فروش INV-2026-101 از فروشگاه رفاه',
        sourceType: 'receipt',
        sourceId: 'sinv-2026-101',
        referenceNumber: 'INV-2026-101',
        status: 'posted',
        totalDebit: 12000,
        totalCredit: 12000,
        createdAt: '2026-07-23T12:00:00Z',
        items: [
            {
                id: 'jvi-203',
                accountId: 'dl-060100',
                accountCode: '060100',
                accountName: 'NBO BANK DUBAI',
                debit: 12000,
                credit: 0,
                currency: 'AED',
                foreignAmount: 12000,
                description: 'وصول وجه نقد به حساب NBO دبی بابت فاکتور فروش INV-2026-101'
            },
            {
                id: 'jvi-204',
                accountId: 'dl-210101',
                accountCode: '210101',
                accountName: 'مشتری: فروشگاه زنجیره ای رفاه',
                debit: 0,
                credit: 12000,
                currency: 'AED',
                foreignAmount: 12000,
                partyType: 'customer',
                partyId: 'cust-refah',
                partyName: 'فروشگاه زنجیره ای رفاه',
                description: 'تسویه بدهی فاکتور فروش INV-2026-101'
            }
        ]
    },

    // JV 6: سند خرید فاکتور PUR-2026-002 از صنایع آنزو
    {
        id: 'jv-1002',
        voucherNumber: 1005,
        date: '2026-08-01',
        description: 'فاکتور خرید کالا شماره PUR-2026-002 از صنایع الکترونیک آنزو',
        sourceType: 'purchase_invoice',
        sourceId: 'pinv-2026-002',
        referenceNumber: 'PUR-2026-002',
        status: 'posted',
        totalDebit: 8206,
        totalCredit: 8206,
        createdAt: '2026-08-01T10:30:00Z',
        items: [
            {
                id: 'jvi-105',
                accountId: '1004',
                accountCode: '1004',
                accountName: 'موجودی کالا (انبار خرید)',
                debit: 8206,
                credit: 0,
                currency: 'AED',
                foreignAmount: 8206,
                description: 'خرید کالا فاکتور شماره PUR-2026-002'
            },
            {
                id: 'jvi-106',
                accountId: 'dl-310102',
                accountCode: '310102',
                accountName: 'تامین‌کننده: صنایع الکترونیک آنزو',
                debit: 0,
                credit: 8206,
                currency: 'AED',
                foreignAmount: 8206,
                partyType: 'supplier',
                partyId: 'sup-02',
                partyName: 'صنایع الکترونیک آنزو',
                description: 'بستانکاری فاکتور خرید PUR-2026-002'
            }
        ]
    },

    // JV 7: سند پرداخت علی‌الحساب ۵۰۰۰ درهمی به آنزو
    {
        id: 'jv-1002-pay',
        voucherNumber: 1006,
        date: '2026-08-02',
        description: 'پرداخت علی‌الحساب به صنایع الکترونیک آنزو بابت فاکتور PUR-2026-002',
        sourceType: 'payment',
        sourceId: 'pinv-2026-002',
        referenceNumber: 'PUR-2026-002',
        status: 'posted',
        totalDebit: 5000,
        totalCredit: 5000,
        createdAt: '2026-08-02T11:00:00Z',
        items: [
            {
                id: 'jvi-107',
                accountId: 'dl-310102',
                accountCode: '310102',
                accountName: 'تامین‌کننده: صنایع الکترونیک آنزو',
                debit: 5000,
                credit: 0,
                currency: 'AED',
                foreignAmount: 5000,
                partyType: 'supplier',
                partyId: 'sup-02',
                partyName: 'صنایع الکترونیک آنزو',
                description: 'پرداخت علی‌الحساب ۵۰۰۰ درهم'
            },
            {
                id: 'jvi-108',
                accountId: 'dl-060100',
                accountCode: '060100',
                accountName: 'NBO BANK DUBAI',
                debit: 0,
                credit: 5000,
                currency: 'AED',
                foreignAmount: 5000,
                description: 'پرداخت از حساب بانکی دبی'
            }
        ]
    },

    // JV 8: سند فروش INV-2026-102 به شرکت پخش البرز (اعتباری)
    {
        id: 'jv-2002',
        voucherNumber: 1007,
        date: '2026-08-05',
        description: 'فاکتور فروش کالا شماره INV-2026-102 به شرکت پخش البرز',
        sourceType: 'sales_invoice',
        sourceId: 'sinv-2026-102',
        referenceNumber: 'INV-2026-102',
        status: 'posted',
        totalDebit: 8150,
        totalCredit: 8150,
        createdAt: '2026-08-05T14:30:00Z',
        items: [
            {
                id: 'jvi-205',
                accountId: 'dl-210102',
                accountCode: '210102',
                accountName: 'مشتری: شرکت پخش البرز',
                debit: 8150,
                credit: 0,
                currency: 'AED',
                foreignAmount: 8150,
                partyType: 'customer',
                partyId: 'cust-alborz',
                partyName: 'شرکت پخش البرز',
                description: 'بدهکاری فاکتور فروش INV-2026-102'
            },
            {
                id: 'jvi-206',
                accountId: '4001',
                accountCode: '4001',
                accountName: 'درآمد حاصل از فروش کالا',
                debit: 0,
                credit: 8150,
                currency: 'AED',
                foreignAmount: 8150,
                description: 'فروش کالا فاکتور شماره INV-2026-102'
            }
        ]
    },

    // JV 9: سند خرید اعتباری PUR-2026-003 از فوشان تک
    {
        id: 'jv-1003',
        voucherNumber: 1008,
        date: '2026-08-10',
        description: 'فاکتور خرید کالا شماره PUR-2026-003 از Foshan Tech Appliances Ltd',
        sourceType: 'purchase_invoice',
        sourceId: 'pinv-2026-003',
        referenceNumber: 'PUR-2026-003',
        status: 'posted',
        totalDebit: 7870,
        totalCredit: 7870,
        createdAt: '2026-08-10T14:00:00Z',
        items: [
            {
                id: 'jvi-109',
                accountId: '1004',
                accountCode: '1004',
                accountName: 'موجودی کالا (انبار خرید)',
                debit: 7870,
                credit: 0,
                currency: 'AED',
                foreignAmount: 7870,
                description: 'خرید اعتباری فاکتور PUR-2026-003'
            },
            {
                id: 'jvi-110',
                accountId: 'dl-310104',
                accountCode: '310104',
                accountName: 'تامین‌کننده: Foshan Tech Appliances Ltd',
                debit: 0,
                credit: 7870,
                currency: 'AED',
                foreignAmount: 7870,
                partyType: 'supplier',
                partyId: 'sup-04',
                partyName: 'Foshan Tech Appliances Ltd',
                description: 'بستانکاری خرید اعتباری PUR-2026-003'
            }
        ]
    },

    // JV 10: سند فروش INV-2026-103 به فروشگاه کویتی قشم
    {
        id: 'jv-2003',
        voucherNumber: 1009,
        date: '2026-08-12',
        description: 'فاکتور فروش کالا شماره INV-2026-103 به فروشگاه کویتی قشم دفتر مرکزی',
        sourceType: 'sales_invoice',
        sourceId: 'sinv-2026-103',
        referenceNumber: 'INV-2026-103',
        status: 'posted',
        totalDebit: 7820,
        totalCredit: 7820,
        createdAt: '2026-08-12T16:00:00Z',
        items: [
            {
                id: 'jvi-207',
                accountId: 'dl-201000',
                accountCode: '201000',
                accountName: 'مشتری: فروشگاه کویتی قشم دفتر مرکزی',
                debit: 7820,
                credit: 0,
                currency: 'AED',
                foreignAmount: 7820,
                partyType: 'customer',
                partyId: 'cust-qeshm',
                partyName: 'فروشگاه کویتی قشم دفتر مرکزی',
                description: 'بدهکاری فاکتور فروش INV-2026-103'
            },
            {
                id: 'jvi-208',
                accountId: '4001',
                accountCode: '4001',
                accountName: 'درآمد حاصل از فروش کالا',
                debit: 0,
                credit: 7820,
                currency: 'AED',
                foreignAmount: 7820,
                description: 'فروش کالا فاکتور شماره INV-2026-103'
            }
        ]
    },

    // JV 11: سند وصول ۴۰۰۰ درهم علی‌الحساب از فروشگاه قشم
    {
        id: 'jv-2003-rec',
        voucherNumber: 1010,
        date: '2026-08-13',
        description: 'وصول وجه علی‌الحساب بابت فاکتور فروش INV-2026-103 از فروشگاه کویتی قشم',
        sourceType: 'receipt',
        sourceId: 'sinv-2026-103',
        referenceNumber: 'INV-2026-103',
        status: 'posted',
        totalDebit: 4000,
        totalCredit: 4000,
        createdAt: '2026-08-13T10:00:00Z',
        items: [
            {
                id: 'jvi-209',
                accountId: 'dl-060100',
                accountCode: '060100',
                accountName: 'NBO BANK DUBAI',
                debit: 4000,
                credit: 0,
                currency: 'AED',
                foreignAmount: 4000,
                description: 'واریز علی‌الحساب ۴۰۰۰ درهم به حساب NBO دبی'
            },
            {
                id: 'jvi-210',
                accountId: 'dl-201000',
                accountCode: '201000',
                accountName: 'مشتری: فروشگاه کویتی قشم دفتر مرکزی',
                debit: 0,
                credit: 4000,
                currency: 'AED',
                foreignAmount: 4000,
                partyType: 'customer',
                partyId: 'cust-qeshm',
                partyName: 'فروشگاه کویتی قشم دفتر مرکزی',
                description: 'تسویه علی‌الحساب فاکتور فروش INV-2026-103'
            }
        ]
    },

    // JV 12: سند فروش نقدی INV-2026-104 به فروشگاه امید
    {
        id: 'jv-2004',
        voucherNumber: 1011,
        date: '2026-08-18',
        description: 'فاکتور فروش نقدی کالا شماره INV-2026-104 به فروشگاه لوازم خانگی امید',
        sourceType: 'sales_invoice',
        sourceId: 'sinv-2026-104',
        referenceNumber: 'INV-2026-104',
        status: 'posted',
        totalDebit: 600,
        totalCredit: 600,
        createdAt: '2026-08-18T10:00:00Z',
        items: [
            {
                id: 'jvi-211',
                accountId: 'dl-210104',
                accountCode: '210104',
                accountName: 'مشتری: فروشگاه لوازم خانگی امید',
                debit: 600,
                credit: 0,
                currency: 'AED',
                foreignAmount: 600,
                partyType: 'customer',
                partyId: 'cust-omid',
                partyName: 'فروشگاه لوازم خانگی امید',
                description: 'بدهکاری فروش نقدی فاکتور INV-2026-104'
            },
            {
                id: 'jvi-212',
                accountId: '4001',
                accountCode: '4001',
                accountName: 'درآمد حاصل از فروش کالا',
                debit: 0,
                credit: 600,
                currency: 'AED',
                foreignAmount: 600,
                description: 'فروش نقدی فاکتور INV-2026-104'
            }
        ]
    },

    // JV 13: سند دریافت وجه نقدی فروشگاه امید به صندوق نقدی شرکت
    {
        id: 'jv-2004-rec',
        voucherNumber: 1012,
        date: '2026-08-18',
        description: 'دریافت نقدی وجه فاکتور INV-2026-104 به صندوق شرکت دبی',
        sourceType: 'receipt',
        sourceId: 'sinv-2026-104',
        referenceNumber: 'INV-2026-104',
        status: 'posted',
        totalDebit: 600,
        totalCredit: 600,
        createdAt: '2026-08-18T10:15:00Z',
        items: [
            {
                id: 'jvi-213',
                accountId: 'dl-110100',
                accountCode: '110100',
                accountName: 'صندوق نقدی شرکت دبی (درهم)',
                debit: 600,
                credit: 0,
                currency: 'AED',
                foreignAmount: 600,
                description: 'دریافت نقدی در صندوق دبی'
            },
            {
                id: 'jvi-214',
                accountId: 'dl-210104',
                accountCode: '210104',
                accountName: 'مشتری: فروشگاه لوازم خانگی امید',
                debit: 0,
                credit: 600,
                currency: 'AED',
                foreignAmount: 600,
                partyType: 'customer',
                partyId: 'cust-omid',
                partyName: 'فروشگاه لوازم خانگی امید',
                description: 'تسویه نقدی آنی فاکتور INV-2026-104'
            }
        ]
    },

    // JV 14: سند هزینه اجاره انبار و شوروم دبی
    {
        id: 'jv-3001',
        voucherNumber: 1013,
        date: '2026-08-15',
        description: 'هزینه اجاره انبار مرکزی دبی و شوروم ماه آگوست ۲۰۲۶',
        sourceType: 'manual',
        status: 'posted',
        totalDebit: 3500,
        totalCredit: 3500,
        createdAt: '2026-08-15T12:00:00Z',
        items: [
            {
                id: 'jvi-301',
                accountId: '5401',
                accountCode: '5401',
                accountName: 'هزینه اجاره محل و انبارها',
                debit: 3500,
                credit: 0,
                currency: 'AED',
                foreignAmount: 3500,
                description: 'اجاره انبار منطقه القوز دبی'
            },
            {
                id: 'jvi-302',
                accountId: 'dl-060100',
                accountCode: '060100',
                accountName: 'NBO BANK DUBAI',
                debit: 0,
                credit: 3500,
                currency: 'AED',
                foreignAmount: 3500,
                description: 'پرداخت چک اجاره از حساب بانک NBO دبی'
            }
        ]
    },

    // JV 15: سند حقوق و دستمزد پرسنل دفتر و ترابری
    {
        id: 'jv-3002',
        voucherNumber: 1014,
        date: '2026-08-16',
        description: 'هزینه حقوق و مزایای پرسنل اداری و انبار دبی',
        sourceType: 'manual',
        status: 'posted',
        totalDebit: 4800,
        totalCredit: 4800,
        createdAt: '2026-08-16T14:00:00Z',
        items: [
            {
                id: 'jvi-303',
                accountId: '5101',
                accountCode: '5101',
                accountName: 'هزینه حقوق و دستمزد',
                debit: 4800,
                credit: 0,
                currency: 'AED',
                foreignAmount: 4800,
                description: 'حقوق ماهانه ۳ نفر پرسنل مقیم دبی'
            },
            {
                id: 'jvi-304',
                accountId: 'dl-060100',
                accountCode: '060100',
                accountName: 'NBO BANK DUBAI',
                debit: 0,
                credit: 4800,
                currency: 'AED',
                foreignAmount: 4800,
                description: 'واریز مستقیم حقوق به حساب پرسنل'
            }
        ]
    }
];

/**
 * 7. Sample Expenses (هزینه‌ها)
 */
export const sampleExpenses: ExpenseRecord[] = [
    {
        id: 'exp-01',
        expenseNumber: 'EXP-2026-01',
        category: 'warehousing',
        title: 'اجاره انبار مرکزی منطقه القوز دبی',
        amount: 3500,
        currency: 'AED',
        date: '2026-08-15',
        payee: 'Al Qouz Warehouse Leasing Co.',
        paymentMethod: 'bank',
        notes: 'اجاره ماه آگوست ۲۰۲۶ انبار ۱۲۰۰ متری',
        createdAt: '2026-08-15T12:00:00Z'
    },
    {
        id: 'exp-02',
        expenseNumber: 'EXP-2026-02',
        category: 'salaries',
        title: 'حقوق و دستمزد پرسنل دفتر دبی',
        amount: 4800,
        currency: 'AED',
        date: '2026-08-16',
        payee: 'کارکنان دفتر دبی',
        paymentMethod: 'bank',
        notes: 'حقوق ماهانه پرسنل اداری و لجستیک',
        createdAt: '2026-08-16T14:00:00Z'
    },
    {
        id: 'exp-03',
        expenseNumber: 'EXP-2026-03',
        category: 'freight',
        title: 'حمل داخلی کانتینرها از بندر جبل علی به انبار',
        amount: 850,
        currency: 'AED',
        date: '2026-07-18',
        payee: 'Dubai Fast Transport LLC',
        paymentMethod: 'cash',
        notes: 'کرایه تریلی و جابجایی کانتینر ۴۰ فوت',
        createdAt: '2026-07-18T16:00:00Z'
    }
];

/**
 * Injects or updates all sample accounting records into the Dexie database.
 */
export async function seedAccountingSampleData(options?: { overwrite?: boolean }): Promise<{
    productsAdded: number;
    suppliersAdded: number;
    detailedAccountsAdded: number;
    purchaseInvoicesAdded: number;
    salesInvoicesAdded: number;
    journalVouchersAdded: number;
    expensesAdded: number;
}> {
    return await (db as any).transaction('rw', [
        db.products,
        db.suppliers,
        db.detailedLedgerAccounts,
        db.purchaseInvoices,
        db.salesInvoices,
        db.journalVouchers,
        db.expenses
    ], async () => {
        // 1. Bulk Put Products
        await db.products.bulkPut(sampleProducts);

        // 2. Bulk Put Suppliers
        await db.suppliers.bulkPut(sampleSuppliers);

        // 3. Bulk Put Detailed Ledger Accounts
        await db.detailedLedgerAccounts.bulkPut(sampleDetailedAccounts);

        // 4. Bulk Put Purchase Invoices
        await db.purchaseInvoices.bulkPut(samplePurchaseInvoices);

        // 5. Bulk Put Sales Invoices
        await db.salesInvoices.bulkPut(sampleSalesInvoices);

        // 6. Bulk Put Journal Vouchers
        await db.journalVouchers.bulkPut(sampleJournalVouchers);

        // 7. Bulk Put Expenses
        await db.expenses.bulkPut(sampleExpenses);

        return {
            productsAdded: sampleProducts.length,
            suppliersAdded: sampleSuppliers.length,
            detailedAccountsAdded: sampleDetailedAccounts.length,
            purchaseInvoicesAdded: samplePurchaseInvoices.length,
            salesInvoicesAdded: sampleSalesInvoices.length,
            journalVouchersAdded: sampleJournalVouchers.length,
            expensesAdded: sampleExpenses.length
        };
    });
}
