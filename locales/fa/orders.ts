export const ordersViews = {
  orders: {
    title: "مدیریت سفارشات",
    listView: "نمای لیستی",
    kanbanView: "نمای کانبان",
    calendarView: "نمای تقویم"
  }
};

export const ordersModals = {
  orderModal: {
    title: "جزئیات سفارش",
    tabs: {
      details: "جزئیات",
      payments: "پرداخت‌ها",
      attachments: "پیوست‌ها",
      shipStage: "مرحله حمل",
      dubaiStage: "مرحله دبی",
      iranStage: "مرحله ایران",
      customsCalc: "محاسبات گمرکی",
      costBreakdown: "ریز هزینه‌ها",
      costSummary: "خلاصه هزینه‌ها"
    },
    finalizedBadge: "نهایی شده",
    deleteDisabledTooltip: "امکان حذف سفارشات بایگانی شده، نهایی شده یا با وضعیت پایانی وجود ندارد.",
    customsReviewTitle: "بررسی گمرک؟",
    customsReviewBody: "شما هزینه‌های گمرکی محاسبه شده را اعمال نهایی نکرده‌اید. می‌توانید به تب محاسبات گمرکی بروید و آنها را اعمال کنید یا بدون آن ادامه دهید.",
    customsReviewConfirm: "ادامه دادن",
    goToCustomsTab: "رفتن به تب گمرک",
    finalizeWithoutCustomsTitle: "نهایی‌سازی بدون گمرک؟",
    finalizeWithoutCustomsBody: "این کار ممکن است منجر به قیمت‌گذاری نادرست محصولات شود. آیا مطمئن هستید؟",
    finalizeConfirmTitle: "نهایی‌سازی سفارش؟",
    finalizeConfirmBody: "این کار هزینه‌های نهایی محصولات را محاسبه و ذخیره می‌کند. سفارش قفل شده و قابل ویرایش نخواهد بود (مگر با کد بازگشایی).",
    unlockTitle: "باز کردن قفل سفارش؟",
    unlockBody: "باز کردن قفل اجازه ویرایش سفارش نهایی شده را می‌دهد. هر تغییری نیازمند نهایی‌سازی مجدد برای به‌روزرسانی هزینه‌ها خواهد بود.",
    unlockConfirm: "باز کردن برای ویرایش",
    printOptions: {
      title: "گزینه‌های چاپ",
      includeChecklist: "شامل چک‌لیست اقلام در گزارش؟",
      withChecklist: "با چک‌لیست",
      withoutChecklist: "بدون چک‌لیست"
    },
    printMenu: {
      orderDetails: "جزئیات سفارش",
      packingList: "پکینگ لیست",
      invoice: "تولید فاکتور"
    },
    printFooter: {
      environmentalMessage: "لطفاً قبل از چاپ این سند به حفظ محیط زیست فکر کنید.",
      page: "صفحه",
      notes: "یادداشت‌ها"
    },
    table: {
      productName: "نام محصول",
      quantity: "تعداد",
      itemsPerCarton: "تعداد/کارتن",
      totalCartons: "کل کارتن‌ها",
      totalCbm: "حجم کل",
      unitPrice: "قیمت واحد",
      totalPrice: "قیمت کل",
      cartonCbm: "CBM/کارتن",
      netWeightKg: "وزن خالص (kg)",
      totalNetWeightKg: "وزن خالص کل (kg)",
      grossWeightKg: "وزن ناخالص (kg)",
      totalGrossWeightKg: "وزن ناخالص کل (kg)",
      hsCode: "کد HS",
      itemCode: "کد کالا"
    },
    attachments: {
      orderAttachments: "پیوست‌های سفارش",
      itemAttachments: "پیوست‌های اقلام",
      noAttachments: "هنوز فایلی پیوست نشده است."
    },
    finalizeRequiredForInvoice: "برای تولید فاکتور، سفارش باید نهایی شده باشد.",
    finalizeRequiredForPL: "برای تولید پکینگ لیست، سفارش باید نهایی شده باشد.",
    finalizeOptions: {
        title: "گزینه‌های نهایی‌سازی",
        body: "نحوه نهایی‌سازی این سفارش را انتخاب کنید.",
        standard: "به‌روزرسانی محصولات و نهایی‌سازی (استاندارد)",
        onlyFinalize: "فقط نهایی‌سازی (بدون به‌روزرسانی محصولات)"
    }
  },
  orderFormModal: {
    editOrder: "ویرایش سفارش",
    dateValidationError: "تاریخ بارگیری نمی‌تواند قبل از تاریخ سفارش باشد.",
    attributesModalTitle: "ویژگی‌های {{productName}}",
    analyzing: "در حال تحلیل...",
    importSuccess: "ورود موفقیت‌آمیز بود!",
    importError: "ورود ناموفق بود. لطفاً فایل را بررسی کنید.",
    attributeKey: "نام ویژگی",
    attributeValue: "مقدار ویژگی",
    addAttribute: "افزودن ویژگی",
    bulkAddPrompt: "ویژگی‌ها را به صورت متنی اینجا وارد کنید (مثلاً کپی از فایل مشخصات)...",
    parseWithAI: "تجزیه با هوش مصنوعی",
    addItem: "افزودن آیتم دیگر",
    table: {
      supplierCode: "کد فروشنده",
      itemCode: "کد داخلی",
      productNameFa: "نام محصول (FA)",
      customsValue: "ارزش گمرکی ($)",
      customsBasis: "مبنای گمرکی",
      customsValueBasis: "مبنای گمرکی",
      price: "قیمت",
      totalPrice: "قیمت کل"
    },
    customsBasisOptions: {
      unit: "هر واحد",
      kg: "هر کیلوگرم"
    },
    editAttributes: "ویژگی‌ها",
    analyzingPO: 'در حال تحلیل سفارش خرید...',
    analyzeWithAI: "تحلیل با هوش مصنوعی",
    aiAnalysisReportTitle: "گزارش تحلیل هوش مصنوعی"
  },
  kanban: {
    addColumn: "افزودن ستون",
    newColumnPrompt: "نام ستون را وارد کنید...",
    addStickyNote: "افزودن یادداشت",
    addOrder: "افزودن سفارش",
    dropCardHere: "سفارشات را اینجا رها کنید",
    systemColumnTooltip: "ستون‌های سیستمی قابل ویرایش نیستند",
    editNameTooltip: "برای ویرایش نام دو بار کلیک کنید"
  },
  packingList: {
    title: "لیست بسته‌بندی",
    productName: "نام / شرح محصول",
    totalGwKg: "وزن ناخالص کل (kg)"
  },
  timeline: {
    addNextMonth: "افزودن ماه آینده",
    addPreviousMonth: "افزودن ماه گذشته"
  },
  listView: {
    deleteMonthButtonTooltip: "حذف تمام سفارشات این ماه",
    removeEmptyMonthTooltip: "حذف این بلوک ماه خالی",
    totalValueMonth: "ارزش کل",
    totalPaidMonth: "کل پرداختی",
    totalBalanceDueMonth: "بدهی کل",
    containerInfo: "اطلاعات کانتینر",
    empty: "هیچ سفارشی برای این ماه برنامه‌ریزی نشده است.",
    lcl: "خرده‌بار LCL (~{{percentage}}٪ از کانتینر ۲۰ فوت)",
    fills40hq: "حدود {{fill}}٪ از کانتینر ۴۰ فوت HQ ({{remaining}}٪ باقی‌مانده)",
    containerCount: "{{count}} عدد {{container}}",
    lastContainerFill: "{{count}} عدد {{container}} (حدود {{percentage}}٪ پر)",
    orderCountBadge: "{{count}} سفارش",
    globalSummaryTitle: "خلاصه کل تأمین‌کنندگان",
    totalOrders: "سفارشات ثبت شده"
  }
};