export const dashboardViews = {
  dashboard: {
    title: "Dashboard",
    biSubtitle: "Business Intelligence Dashboard",
    exportReport: "Export BI Report",
    strategicInsights: "Strategic Insights",
    currentStatus: "Current Status",
    supplierSpend: "Supplier Spend Distribution",
    kpi: {
      activeOrders: "Active Orders",
      activeThisMonth: "Active this Month",
      totalInProgress: "Total In Progress",
      archived: "Archived",
      totalValueActive: "Total Value (Active)",
      balanceDueMonth: "Total Balance Due in {{month}}",
      finalizedValueThisYear: "Finalized Value This Year",
      avgLeadTime: "Avg Lead Time",
      fxExposure: "FX Exposure (USD)",
      supplierConcentration: "Supplier Concentration",
      days: "Days",
      finalizedOrdersByMonth: "Finalized Value by Month",
      monthlyBalanceDue: "Monthly Balance Due",
      logisticCapacity: "Logistic Capacity",
      logisticCapacityDesc: "Analysis of total volume of active items in the loading and clearance pipeline based on non-finalized orders.",
      cbmActive: "CBM (Active)",
      workflowIntensity: "Workflow Intensity (Orders + Projects)"
    },
    weeklyCalendar: "Weekly Calendar",
    notificationsAndReminders: "Notifications & Reminders",
    allActiveItems: "All Active Line Items",
    events: {
      loading: "Load: {{orderId}}",
      payment: "Pay: {{orderId}}",
      task: "Due: {{title}}"
    },
    table: {
      orderId: "Order ID",
      supplier: "Supplier",
      supplierCode: "Supplier Code",
      internalCode: "Internal Code",
      description: "Description",
      cartons: "Cartons",
      qtyPerCarton: "Qty/Ctn",
      totalQty: "Total Qty",
      orderDate: "Order Date",
      loadingDate: "Loading Date",
      status: "Status"
    }
  }
};

export const dashboardRoot = {
  dashboard: {
    loading: "Loading dashboard...",
    noReminders: "No pending reminders."
  }
};
