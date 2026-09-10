export const dashboardViews = {
  dashboard: {
    title: "داشبورد",
    biSubtitle: "داشبورد هوش تجاری",
    exportReport: "خروجی گزارش هوش تجاری",
    strategicInsights: "تحلیل‌های استراتژیک",
    currentStatus: "وضعیت جاری",
    supplierSpend: "توزیع هزینه‌ها بر اساس تأمین‌کننده",
    kpi: {
      activeOrders: "سفارشات فعال",
      activeThisMonth: "فعال در این ماه",
      totalInProgress: "کل در جریان",
      archived: "بایگانی شده",
      totalValueActive: "ارزش کل (فعال)",
      balanceDueMonth: "بدهی کل در {{month}}",
      finalizedValueThisYear: "ارزش نهایی شده امسال",
      avgLeadTime: "میانگین زمان تحویل",
      fxExposure: "در معرض ریسک ارز (دلار)",
      supplierConcentration: "تمرکز تأمین‌کننده",
      days: "روز",
      finalizedOrdersByMonth: "ارزش نهایی شده بر اساس ماه",
      monthlyBalanceDue: "بدهی ماهانه",
      logisticCapacity: "ظرفیت لجستیک",
      logisticCapacityDesc: "تحلیل مجموع حجم کالاهای فعال در جریان بارگیری و ترخیص بر اساس سفارشات نهایی نشده.",
      cbmActive: "CBM (فعال)",
      workflowIntensity: "شدت جریان کار (سفارش + پروژه)"
    },
    weeklyCalendar: "تقویم هفتگی",
    notificationsAndReminders: "اعلان‌ها و یادآوری‌ها",
    allActiveItems: "تمام اقلام فعال",
    events: {
      loading: "بارگیری: {{orderId}}",
      payment: "پرداخت: {{orderId}}",
      task: "سررسید: {{title}}"
    },
    table: {
      orderId: "شناسه سفارش",
      supplier: "تأمین‌کننده",
      supplierCode: "کد فروشنده",
      internalCode: "کد داخلی",
      description: "شرح کالا",
      cartons: "کارتن",
      qtyPerCarton: "تعداد/کارتن",
      totalQty: "تعداد کل",
      orderDate: "تاریخ سفارش",
      loadingDate: "تاریخ بارگیری",
      status: "وضعیت"
    }
  }
};

export const dashboardRoot = {
  dashboard: {
    loading: "در حال بارگذاری داشبورد...",
    noReminders: "هیچ یادآوری در انتظار نیست."
  }
};
