
import { common } from './common';
import { dashboardViews, dashboardRoot } from './dashboard';
import { ordersViews, ordersModals } from './orders';
import { calendar, calendarViews } from './calendar';
import { productsViews } from './products';
import { projectsViews } from './projects';
import { settings } from './settings';
import { accounting } from './accounting';
import { suppliersViews } from './suppliers';
import { payments } from './payments';
import { customsBook } from './customsBook';
import { recycleBin } from './recycleBin';
import { reminders } from './reminders';
import { invoice } from './invoice';
import { procurement } from './procurement';

export const faTranslation = {
  ...common,
  ...calendar,
  ...reminders,
  ...ordersModals,
  ...payments,
  ...invoice,
  ...customsBook,
  ...recycleBin,
  ...dashboardRoot,
  ...settings,
  ...accounting,
  ...procurement,
  views: {
    dashboard: dashboardViews.dashboard,
    orders: ordersViews.orders,
    calendar: calendarViews.calendar,
    products: productsViews.products,
    projects: projectsViews.projects,
    suppliers: suppliersViews.suppliers,
    recycleBin: recycleBin.recycleBin,
    customsBook: customsBook.customsBook,
  }
};

export default faTranslation;
