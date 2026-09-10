export const ordersViews = {
  orders: {
    title: "Orders",
    listView: "List View",
    kanbanView: "Kanban View",
    calendarView: "Calendar View"
  }
};

export const ordersModals = {
  orderModal: {
    title: "Order Details",
    tabs: {
      details: "Details",
      payments: "Payments",
      attachments: "Attachments",
      shipStage: "Ship-Stage",
      dubaiStage: "Dubai-Stage",
      iranStage: "Iran-Stage",
      customsCalc: "Customs Calculation",
      costBreakdown: "Full Cost Breakdown",
      costSummary: "Cost Summary"
    },
    finalizedBadge: "Finalized",
    deleteDisabledTooltip: "Cannot delete archived, finalized, or final status orders.",
    customsReviewTitle: "Review Customs?",
    customsReviewBody: "You haven't applied the calculated customs costs. You can go to the Customs Calculation tab to apply them, or proceed without them.",
    customsReviewConfirm: "Proceed Anyway",
    goToCustomsTab: "Go to Customs Tab",
    finalizeWithoutCustomsTitle: "Finalize Without Customs?",
    finalizeWithoutCustomsBody: "This action may result in inaccurate product pricing. Are you sure you want to continue?",
    finalizeConfirmTitle: "Finalize Order?",
    finalizeConfirmBody: "This will calculate and save final product costs. The order will be locked from major edits. This action is reversible but requires a code.",
    unlockTitle: "Unlock Order?",
    unlockBody: "Unlocking allows editing a finalized order. Any changes will require re-finalization to update product costs.",
    unlockConfirm: "Unlock for Editing",
    printOptions: {
      title: "Print Options",
      includeChecklist: "Include item checklists in the report?",
      withChecklist: "With Checklists",
      withoutChecklist: "Without Checklists"
    },
    printMenu: {
      orderDetails: "Order Details",
      packingList: "Packing List",
      invoice: "Generate Invoice"
    },
    printFooter: {
      environmentalMessage: "Please consider the environment before printing this document.",
      page: "Page",
      notes: "Notes"
    },
    table: {
      productName: "Product Name",
      quantity: "Qty",
      itemsPerCarton: "Qty/Ctn",
      totalCartons: "Total Ctns",
      totalCbm: "Total CBM",
      unitPrice: "Unit Price",
      totalPrice: "Total Price",
      cartonCbm: "CBM/Ctn",
      netWeightKg: "N.W. (kg)",
      totalNetWeightKg: "Total N.W. (kg)",
      grossWeightKg: "G.W. (kg)",
      totalGrossWeightKg: "Total G.W. (kg)",
      hsCode: "HS Code",
      itemCode: "Item Code"
    },
    attachments: {
      orderAttachments: "Order Attachments",
      itemAttachments: "Item Attachments",
      noAttachments: "No files attached yet."
    },
    finalizeRequiredForInvoice: "Order must be finalized to generate an invoice.",
    finalizeRequiredForPL: "Order must be finalized to generate a packing list.",
    finalizeOptions: {
        title: "Finalize Options",
        body: "Choose how you want to finalize this order.",
        standard: "Update Products & Finalize (Standard)",
        onlyFinalize: "Finalize Only (Do not update products)"
    }
  },
  orderFormModal: {
    editOrder: "Edit Order",
    dateValidationError: "Loading date cannot be earlier than order date.",
    attributesModalTitle: "Attributes for {{productName}}",
    analyzing: "Analyzing...",
    importSuccess: "Import successful!",
    importError: "Import failed. Please check the file or try again.",
    attributeKey: "Attribute Name",
    attributeValue: "Attribute Value",
    addAttribute: "Add Attribute",
    bulkAddPrompt: "Paste bulk attributes here (e.g., from a spec sheet)...",
    parseWithAI: "Parse with AI",
    addItem: "Add another item",
    table: {
      supplierCode: "Supplier Code",
      itemCode: "Internal Code",
      productNameFa: "Product Name (FA)",
      customsValue: "Customs Value ($)",
      customsBasis: "Customs Basis",
      customsValueBasis: "Customs Basis",
      price: "Price",
      totalPrice: "Total Price"
    },
    customsBasisOptions: {
      unit: "Per Unit",
      kg: "Per KG"
    },
    editAttributes: "Attributes",
    analyzingPO: 'Analyzing Purchase Order...',
    analyzeWithAI: "Analyze with AI",
    aiAnalysisReportTitle: "AI Analysis Report"
  },
  kanban: {
    addColumn: "Add Column",
    newColumnPrompt: "Enter column name...",
    addStickyNote: "Add Sticky Note",
    addOrder: "Add Order",
    dropCardHere: "Drop orders here",
    systemColumnTooltip: "System columns cannot be edited",
    editNameTooltip: "Double click to edit name"
  },
  packingList: {
    title: "Packing List",
    productName: "Product Name / Description",
    totalGwKg: "Total G.W. (kg)"
  },
  timeline: {
    addNextMonth: "Add Next Month",
    addPreviousMonth: "Add Previous Month"
  },
  listView: {
    deleteMonthButtonTooltip: "Delete all orders in this month",
    removeEmptyMonthTooltip: "Remove this empty month block",
    totalValueMonth: "Total Value",
    totalPaidMonth: "Total Paid",
    totalBalanceDueMonth: "Total Balance Due",
    containerInfo: "Container Info",
    empty: "No orders scheduled for this month.",
    lcl: "LCL (~{{percentage}}% of 20' GP)",
    fills40hq: "~{{fill}}% of 40' HQ ({{remaining}}% remaining)",
    containerCount: "{{count}}x {{container}}",
    lastContainerFill: "{{count}}x {{container}} (~{{percentage}}% full)",
    orderCountBadge: "{{count}} Orders",
    globalSummaryTitle: "Global Active Summary",
    totalOrders: "Total Orders"
  }
};