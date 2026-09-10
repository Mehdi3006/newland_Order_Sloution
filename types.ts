
// --- Base & Utility Types ---

export type Currency = 'USD' | 'CNY' | 'AED' | 'TOMAN';

export interface CurrencyRates {
    aed: number; // USD to AED
    toman: number; // USD to TOMAN
    cny: number; // CNY to USD
}

export interface CompanyInfo {
    en: string;
    fa: string;
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    taxNumber?: string;
}

export interface Setting {
    key: string;
    value: any;
}

export interface PurchaseTargetSettings {
    annualUnitTarget: number;
    annualValueTargetUSD: number;
}

export interface Attachment {
    id: string;
    name: string;
    type: string; // MIME type
    size: number; // in bytes
    data: ArrayBuffer; // file content
    createdAt: string; // ISO string
}

// FIX: Added ProductAttachment type for data normalization.
export interface ProductAttachment extends Attachment {
    productId?: string;
}


// --- Supplier & Financial Types ---

export interface Supplier {
    id: string;
    code: string; // Accounting/Detailed Ledger Code
    detailedAccountCode?: string;
    name: string;
    name_fa?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    country?: string;
    city?: string;
    address?: string;
    paymentTerms?: string; // e.g., "30% Deposit, 70% BL"
    bankAccountInfo?: string;
    rating?: number; // 1-5 stars
    tags?: string[];
    createdAt: string;
    updatedAt: string;
}

export interface FinancialTransaction {
    id: string;
    date: string;
    type: 'payment' | 'receipt';
    amount: number;
    currency: Currency;
    description: string;
    referenceId?: string; // Order ID or Project ID
    supplierId?: string;
    accountId: string; // Links to Chart of Accounts (Detailed Ledger)
    createdAt: string;
}

export interface SalesInvoiceItem {
    id: string;
    productId?: string;
    internalCode?: string;
    partNumber?: string;
    productName: string;
    unitType?: 'carton' | 'piece' | 'mixed';
    itemsPerCarton?: number;
    cartonCount?: number;
    looseUnits?: number;
    quantity: number; // total units
    pricingBasis?: 'per_unit' | 'per_carton';
    cartonPrice?: number;
    unitPrice: number;
    totalPrice: number;
    cbm?: number;
    grossWeight?: number;
    isBlockedFromSale?: boolean;
}

export interface SalesInvoice {
    id: string;
    invoiceNumber: string;
    customerId?: string;
    customerName: string;
    customerAccountId?: string;
    customerAccountCode?: string;
    customerPhone?: string;
    date: string;
    dueDate?: string;
    items: SalesInvoiceItem[];
    subtotal: number;
    discount: number;
    tax: number;
    totalAmount: number;
    paidAmount?: number;
    currency: Currency;
    currencyRate?: number;
    fxRateToToman?: number; // Daily exchange rate to Toman (advisory & costing)
    isLocked?: boolean; // Locked invoice flag to prevent accidental modification
    status: 'paid' | 'unpaid' | 'partial' | 'draft' | 'voided';
    orderId?: string;
    voucherId?: string;
    notes?: string;
    createdAt: string;
}

export interface ExpenseRecord {
    id: string;
    expenseNumber: string;
    category: 'freight' | 'customs' | 'warehousing' | 'office' | 'salaries' | 'marketing' | 'utilities' | 'other';
    title: string;
    description?: string;
    amount: number;
    currency: Currency;
    date: string;
    payee?: string;
    orderId?: string;
    paymentMethod: 'cash' | 'bank' | 'cheque' | 'credit';
    notes?: string;
    createdAt: string;
}


// --- Order & Product Types ---

export interface OrderItemAttribute {
    id:string;
    key: string;
    value: string;
}

export interface ChecklistTask {
    section_id: number;
    section_en: string;
    section_fa: string;
    task_id: string;
    task_en: string;
    task_fa: string;
    task_weight: number;
    is_done: boolean;
}

export interface OrderItem {
    id: string;
    internalCode?: string;
    supplierCode?: string;
    partNumber?: string;
    productName: string;
    productNameFa?: string;
    quantity: number;
    itemsPerCarton: number;
    price: number;
    cartonCBM: number;
    hsCode?: string;
    netWeight?: number;
    grossWeight?: number;
    attributes?: OrderItemAttribute[];
    checklist?: ChecklistTask[];
    templateIds?: string[];
    attachments?: Attachment[];
    // For customs calculation
    customsValue?: number;
    customsValueBasis?: 'unit' | 'kg';
    // For product categorization
    mainGroupId?: string;
    categoryId?: string;
    subCategoryId?: string;
    brandId?: string;
    
    // --- Order Picker Fields ---
    // These fields track if this item was split/picked from another order
    source_po_id?: string;
    source_po_item_id?: string;
}

export interface Payment {
    id: string;
    type: 'down_payment' | 'balance' | 'other';
    amount: number;
    currency: Currency;
    amountUSD: number;
    date: string;
    description?: string;
}

export interface Reminder {
    date: string; // ISO String
    message: string;
    acknowledged: boolean;
}

export type CostBasis = 
    | 'value' 
    | 'qty' 
    | 'carton' 
    | 'cbm' 
    | 'equal' 
    | 'grossWeight'
    | 'percent_purchase_usd'
    | 'percent_landed_aed'
    | 'percent_landed_toman';

export interface Cost {
    id: string;
    name: string;
    amount: number;
    currency: Currency;
    basis: CostBasis;
    category?: 'freight' | 'customs' | 'misc' | 'system_customs';
    itemId?: string; // If cost applies to a single item
}

export interface Order {
    id: string;
    internalCode?: string;
    supplier: string; // Legacy string, moving towards supplierId
    supplierId?: string; // Link to Supplier entity
    orderDate: string; // YYYY-MM-DD
    approxLoadingDate: string; // YYYY-MM-DD
    // FIX: Added optional originPort and destinationPort to the Order interface to match its usage in various components.
    originPort?: string;
    destinationPort?: string;
    status: string;
    currency: Currency;
    items: OrderItem[];
    payments: Payment[];
    shipCosts?: Cost[];
    dubaiCosts?: Cost[];
    iranCosts?: Cost[];
    attachments?: Attachment[];
    volumeCBM: number;
    totalGrossWeight?: number;
    totalNetWeight?: number;
    archivedAt?: string; // ISO String
    isArchived: boolean;
    isFinalized: boolean;
    finalizedAt?: string; // ISO String
    purchaseType?: 'cash' | 'credit';
    creditPaymentDueDate?: string; // YYYY-MM-DD
    deletedAt: string | null; // ISO String for soft delete
    reminder?: Reminder;
    orderType?: 'payment_only';
    manualOrder?: number; // For manual sorting in lists
    totalAmount?: number;
}

export interface ProductImage {
    id: string;
    // FIX: Added optional productId for data normalization.
    productId?: string;
    data: string; // base64 data URL
    name: string;
}

export interface BrochureData {
    orderedImageIds: string[];
    selectedImageIds: string[];
    selectedAttributeIds: string[];
    marketingCopyEn: string;
    marketingCopyFa: string;
    translatedAttributes: Record<string, { key_fa: string; value_fa: string }>;
}

export interface Product {
    id: string;
    internalCode: string;
    supplierCode?: string;
    oldSystemCode?: string;
    description: string;
    productNameFa?: string;
    name?: string;
    name_en?: string;
    name_fa?: string;
    partNumber?: string;
    category?: string;
    subCategory?: string;
    brand?: string;
    itemsPerCarton: number;
    netWeight?: number;
    grossWeight?: number;
    cartonCBM: number;
    hsCode?: string;
    attributes?: OrderItemAttribute[];
    images?: ProductImage[];
    attachments?: Attachment[];
    brochureData?: BrochureData;

    // For product categorization
    mainGroupId?: string;
    categoryId?: string;
    subCategoryId?: string;
    brandId?: string;

    // Costing Info
    customsValue?: number;
    customsValueBasis?: 'unit' | 'kg';
    purchasePriceUSD: number;
    purchasePriceInSourceCurrency: number;
    sourceCurrency: Currency;
    shipStageCostsUSD: number;
    dubaiStageCostsAED: number;
    iranStageCostsTOMAN: number;
    iranCustomsCosts: ProductIranCustomsCosts;
    landedCostUSD: number;
    landedCostAED: number;
    landedCostTOMAN: number;
    
    // Pricing Info
    sellingPrices: {
        aed: { tier1: number; tier2: number; tier3: number };
        toman: { tier1: number; tier2: number; tier3: number };
    };
    pricingTiersOverrides?: {
        purchasePriceUSD?: number;
        aed?: { tier1?: number; tier2?: number; tier3?: number };
        toman?: { tier1?: number; tier2?: number; tier3?: number };
    };
    
    // Metadata
    order: number; // For manual sorting
    createdAt: string; // ISO string
    sourceOrderId: string;
    finalizedAt: string; // ISO string
    settingsSnapshot: CostingSettings;
    deletedAt: string | null; // ISO String for soft delete
}

export interface PriceHistory {
    id?: number;
    productId: string;
    timestamp: string; // ISO String
    oldPrices: Product['sellingPrices'];
    oldLandedCostAED: number;
    oldLandedCostTOMAN: number;
}

// --- Status & Template Types ---

export interface Status {
    id: string;
    name: string;
    order: number;
    isSystem: boolean;
}

export interface StickyNote {
    id: string;
    statusName: string; // Links note to a Kanban column
    content: string;
    color: string; // e.g., '#FFF9C4' for light yellow
    order: number;
    createdAt: string;
}

export interface ChecklistTaskTemplate {
    section_id: number;
    section_en: string;
    section_fa: string;
    task_id: string;
    task_en: string;
    task_fa: string;
    task_weight: number;
}

export interface ChecklistTemplate {
    id: string;
    name: string;
    description?: string;
    productNameMatch?: string;
    tasks: ChecklistTaskTemplate[];
}

export interface PresetCost {
    id: string;
    name_en: string;
    name_fa: string;
    defaultAmount: number;
}

// --- Project & Task Types ---

export interface Project {
    id: string;
    name: string;
    description?: string;
    createdAt: string; // ISO String
    startDate?: string; // YYYY-MM-DD
    endDate?: string; // YYYY-MM-DD
    deletedAt: string | null; // ISO String for soft delete
}

export interface ProjectStatus {
    id: string;
    projectId: string;
    name: string;
    order: number;
}

export interface ProjectTaskChecklistItem {
    id: string;
    text: string;
    isDone: boolean;
    isAdhoc: boolean; // True if manually added by user
}

export interface TaskAttachment {
    id: string;
    name: string;
    type: 'file' | 'link';
    url: string; // URL or path to file
}

export interface Task {
    id: string;
    projectId: string;
    statusId: string;
    order: number;
    title: string;
    description?: string;
    createdAt: string; // ISO String
    dueDate?: string; // YYYY-MM-DD
    weight?: number; // Story points, hours, etc.
    checklist?: ProjectTaskChecklistItem[];
    attachments?: TaskAttachment[];
    templateIds?: string[];
    deletedAt: string | null; // ISO String for soft delete
    reminder?: Reminder;
}

// --- Calendar Types ---
export interface CalendarList {
    id: string;
    name: string;
    color: string;
    icon: string;
    order: number;
    isPinned?: boolean;
}

export type TaskPriority = 'low' | 'medium' | 'high';

export interface CalendarTask {
    id: number; // Auto-incrementing primary key
    date: string; // YYYY-MM-DD
    title: string;
    isDone: boolean;
    order: number;
    reminder?: Reminder;
    categoryId?: string; // Links to CalendarList.id
    isFlagged?: boolean;
    recurrence?: 'daily' | 'weekly' | 'monthly' | 'yearly';
    priority?: TaskPriority;
}

export interface CalendarStickyNote {
    id: string;
    date: string; // YYYY-MM-DD
    content: string;
    color: string;
    order: number;
}

export interface DailyImage {
    id: number;
    date: string; // YYYY-MM-DD
    name: string;
    data: string; // base64
}

export interface DailyAttachment {
    id: number;
    date: string; // YYYY-MM-DD
    name: string;
    type: string;
    size: number;
    data: ArrayBuffer;
}


// --- New Data & AI Types ---

// FIX: The `attachments` field was previously omitted, which was the root cause of data corruption on edit.
// It has been restored to ensure data integrity.
export type NewOrderData = Omit<Order, 'id' | 'status' | 'volumeCBM' | 'isArchived' | 'isFinalized' | 'finalizedAt' | 'deletedAt' | 'archivedAt' | 'items' | 'manualOrder'> & {
    items: (Omit<OrderItem, 'id'> & { id?: string })[];
};

export type NewProductData = Omit<Product, 'id' | 'sourceOrderId' | 'finalizedAt' | 'settingsSnapshot' | 'deletedAt' | 'iranCustomsCosts' | 'landedCostUSD' | 'landedCostAED' | 'landedCostTOMAN' | 'sellingPrices' | 'order' | 'createdAt' | 'brochureData'>;

export interface AIProjectStructure {
    name: string;
    description: string;
    columns: {
        name: string;
        tasks: {
            title: string;
            description?: string;
            checklist?: string[];
        }[];
    }[];
}

export interface AITaskList {
    tasks: string[];
}

export interface ImportSummary {
    newItems: Product[];
    updatedItems: Product[];
    renumberedItems: { item: Partial<Product>; oldOrder: number; newOrder: number }[];
    errors: { row: number; data: any; message: string }[];
}


// FIX: Added GeneratedSection, BrochureTranslationInput, and BrochureTranslationOutput types for AI utilities.
export interface GeneratedSection {
    section_en: string;
    section_fa: string;
    tasks: {
        task_en: string;
        task_fa: string;
        task_weight: number;
    }[];
}

export interface BrochureTranslationInput {
    marketingCopy: string;
    attributes: {
        id: string;
        key: string;
        value: string;
    }[];
}

export interface BrochureTranslationOutput {
    marketingCopy_fa: string;
    translatedAttributes: {
        id: string;
        key_fa: string;
        value_fa: string;
    }[];
}

export type CategorizationResult = {
    matchType: 'existing' | 'new';
    existingIds?: {
        mainGroupId?: string;
        categoryId?: string;
        subCategoryId?: string;
        brandId?: string;
    };
    newNames?: {
        mainGroup?: string;
        mainGroup_fa?: string;
        category?: string;
        category_fa?: string;
        subCategory?: string;
        subCategory_fa?: string;
        brand?: string;
    };
};


// --- Settings Types ---

export interface CostingSettings {
    fx: {
        usd_aed: number;
        aed_toman: number;
        aed_cny: number;
    };
    iranCustoms: {
        servicesTariffRate: number;
        importDutyRate: number;
        postCustomsVatRate: number;
        importVatRate: number;
        customsUsdRate: number;
        vatUsdRate: number;
        brokerFeePerCarton: number;
        servicesVatRate: number;
        standardFeeRate: number;
        standardFeeVatRate?: number; // Optional as it might be new
        woodenShipFreightRate: number;
        woodenShipFreightVolume: number;
        woodenShipFreightVatRate: number;
        inlandFreightRate: number;
        inlandFreightVolume: number;
        inlandFreightVatRate: number;
        unloadingFeePerTon: number;
        unloadingFeeVatRate: number;
        loadingFeePerTon: number;
        loadingFeeVatRate: number;
    };
    pricingTiers: {
        calculationMethod: 'margin' | 'value';
        aed: { tier1: number; tier2: number; tier3: number };
        toman: { tier1: number; tier2: number; tier3: number };
        metadata: {
            tier1: { name: string; isActive: boolean; };
            tier2: { name: string; isActive: boolean; };
            tier3: { name: string; isActive: boolean; };
        }
    };
    vat: {
        aed: { enabled: boolean; value: number };
        toman: { enabled: boolean; value: number };
    };
    defaultAllocation: {
        perOrder: 'value' | 'qty' | 'carton' | 'cbm' | 'equal';
    };
    rounding: {
        aed: number;
        toman: number;
        tomanDisplayDivisor: 1 | 1000 | 10000 | 1000000;
    };
}

export interface KanbanCardDisplaySettings {
    showInternalCode: boolean;
    showOrderId: boolean;
    showProgress: boolean;
    showLoadingDate: boolean;
    showItemsButton: boolean;
    showArchiveButton: boolean;
    showFilesButton: boolean;
}

export interface ProductCardDisplaySettings {
    showAedPricing: boolean;
    showTomanPricing: boolean;
    showLandedCost: boolean;
    showPhysicalSpecs: boolean;
    showCostBreakdown: boolean;
}

export interface ListViewHeaderDisplaySettings {
    showTotalValue: boolean;
    showTotalDownPayment: boolean;
    showTotalBalanceDue: boolean;
    showVolume: boolean;
    showTotalCartons: boolean;
    showTotalGrossWeight: boolean;
    showContainerInfo: boolean;
}

export interface DashboardTableDisplaySettings {
    showOrderId: boolean;
    showSupplier: boolean;
    showInternalCode: boolean;
    showDescription: boolean;
    showCartons: boolean;
    showQtyPerCarton: boolean;
    showTotalQty: boolean;
    showOrderDate: boolean;
    showLoadingDate: boolean;
    showStatus: boolean;
}

export interface DisplaySettings {
    kanbanCard: KanbanCardDisplaySettings;
    productCard: ProductCardDisplaySettings;
    listViewHeader: ListViewHeaderDisplaySettings;
    dashboardTable: DashboardTableDisplaySettings;
}

export interface ProductIranCustomsCosts {
    finalDuty_TOMAN: number;
    // FIX: Removed duplicate `importVat_TOMAN` property.
    importVat_TOMAN: number;
    brokerFee_TOMAN: number;
    shipFreight_TOMAN: number;
    inlandFreight_TOMAN: number;
    standardFee_TOMAN: number;
    loadingUnloadingFee_TOMAN: number;
}

export interface AISettings {
    apiKey: string;
    projectGenerationModel: string;
    poAnalysisModel: string;
    attributeParsingModel: string;
    checklistGenerationModel: string;
}

export interface AnalysisIssue {
    field: string;
    message: string;
}

// --- Product Category Types ---
export interface MainGroup {
    id: string;
    name: string;
    name_fa?: string;
}
export interface Category {
    id: string;
    name: string;
    name_fa?: string;
    mainGroupId: string;
}
export interface SubCategory {
    id: string;
    name: string;
    name_fa?: string;
    categoryId: string;
}
export interface Brand {
    id: string;
    name: string;
    subCategoryId: string;
}

// --- Customs Book Types ---
export interface CustomsBook {
    id: string;
    name: string;
}
export interface CellStyle {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    align?: 'left' | 'center' | 'right';
    valign?: 'top' | 'middle' | 'bottom';
    bgColor?: string;
    textColor?: string;
    borderTop?: string;
    borderBottom?: string;
    borderLeft?: string;
    borderRight?: string;
    fontSize?: number;
}
export interface CustomsBookCell {
    bookId: string;
    row: number;
    col: number;
    value: any;
    style?: CellStyle;
}
export interface CustomsBookRowHeight {
    bookId: string;
    row: number;
    height: number;
}
export interface CustomsBookMerge {
    bookId: string;
    row: number; // top
    col: number; // left
    rowspan: number;
    colspan: number;
}
// FIX: Added CellAddress, SelectionRange, and Selection types for use in the spreadsheet component.
export type CellAddress = { row: number; col: number };
export type SelectionRange = { start: CellAddress; end: CellAddress };
export type Selection = { active: CellAddress; range: SelectionRange };

// --- Chart of Accounts Types ---
export interface GeneralLedgerAccount {
    id: string;
    code: string;
    name: string;
    name_fa?: string;
    category?: string;
    nature?: 'debit' | 'credit';
}
export interface SubsidiaryLedgerAccount {
    id: string;
    code: string;
    name: string;
    name_fa?: string;
    generalLedgerAccountId: string;
    parentGeneralCode?: string;
    currency?: Currency;
    nature?: 'debit' | 'credit';
}
export interface DetailedLedgerAccount {
    id: string;
    code: string;
    name: string;
    name_fa?: string;
    subsidiaryLedgerAccountId: string;
    parentSubsidiaryCode?: string;
    currency?: Currency;
    partyType?: 'supplier' | 'customer' | 'bank' | 'cash' | 'product' | 'other';
    partyId?: string;
    phone?: string;
    address?: string;
    creditLimit?: number; // Optional credit limit for advisory warning
    nature?: 'debit' | 'credit';
    currentDebit?: number;
    currentCredit?: number;
}

// FIX: Added ScannedFile and ScannedMedia types for use with product media syncing.
export interface ScannedFile {
    name: string;
    data: string; // base64 string
    mimeType: string;
}

export interface ScannedMedia {
    productCode: string;
    images: ScannedFile[];
    manuals: ScannedFile[];
}

// --- Double-Entry Journal Voucher & Purchase Invoice Types ---
export interface JournalVoucherItem {
    id: string;
    accountId: string; // Links to DetailedLedgerAccount id or SubsidiaryLedgerAccount id
    accountCode: string;
    accountName: string;
    debit: number; // Base currency AED
    credit: number; // Base currency AED
    description: string;
    currency?: Currency;
    foreignAmount?: number;
    exchangeRate?: number;
    currencyRate?: number;
    partyType?: 'supplier' | 'customer' | 'bank' | 'cash' | 'product' | 'other';
    partyId?: string;
    partyName?: string;
}

export interface JournalVoucher {
    id: string;
    voucherNumber: number;
    date: string; // YYYY-MM-DD
    description: string;
    items: JournalVoucherItem[];
    totalDebit: number;
    totalCredit: number;
    status: 'draft' | 'posted' | 'voided';
    sourceType?: 'manual' | 'purchase_invoice' | 'sales_invoice' | 'payment' | 'receipt' | 'fx_revaluation' | 'order_finalized' | 'invoice_settlement';
    sourceId?: string;
    referenceNumber?: string;
    createdAt: string;
}

export interface PurchaseInvoiceItem {
    id: string;
    productId?: string;
    internalCode?: string;
    partNumber?: string;
    productName: string;
    unitType?: 'carton' | 'piece' | 'mixed';
    itemsPerCarton?: number;
    cartonCount?: number;
    looseUnits?: number;
    quantity: number; // total units
    pricingBasis?: 'per_unit' | 'per_carton';
    cartonPrice?: number;
    unitPrice: number;
    totalPrice: number;
    cbm?: number;
    grossWeight?: number;
    hasMissingInternalCode?: boolean; // Tag for items without internal code (temporary entry)
    notes?: string;
}

export interface PurchaseInvoice {
    id: string;
    invoiceNumber: string;
    supplierId?: string;
    supplierName: string;
    supplierAccountId?: string;
    supplierAccountCode?: string;
    date: string; // YYYY-MM-DD
    dueDate?: string;
    items: PurchaseInvoiceItem[];
    subtotal?: number;
    additionalCosts?: number; // Freight, customs, etc.
    totalAmount: number;
    paidAmount?: number;
    currency: Currency;
    currencyRate?: number;
    fxRateToToman?: number; // Daily exchange rate to Toman (advisory & costing)
    isLocked?: boolean; // Locked invoice flag to prevent accidental modification
    status: 'posted' | 'draft' | 'paid' | 'unpaid' | 'partial' | 'voided';
    hasIncompleteCodes?: boolean; // Indicates at least one item has missing internal code
    orderId?: string; // Optional reference if converted from Order
    voucherId?: string; // Reference to auto-generated JournalVoucher
    notes?: string;
    createdAt?: string;
}

export interface InvoiceSettlementRecord {
    id: string;
    invoiceId: string;
    invoiceType: 'purchase' | 'sales';
    invoiceNumber: string;
    counterpartyName: string;
    counterpartyAccountId: string;
    counterpartyAccountCode: string;
    paymentAccountId: string;
    paymentAccountCode: string;
    paymentAccountName: string;
    amount: number;
    currency: Currency;
    date: string;
    referenceNumber?: string;
    notes?: string;
    voucherId?: string;
    createdAt: string;
}

