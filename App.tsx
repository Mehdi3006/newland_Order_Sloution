import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import OrdersView from './components/ListView';
// FIX: Changed import for Settings to be a default import as it is exported as default.
import Settings from './components/Settings';
// FIX: Changed the import for OrderModal to a named import to match its export, resolving the "no default export" error.
import { OrderModal } from './components/OrderModal';
// FIX: Changed import for OrderFormModal to be a named import as it is not a default export.
import { OrderFormModal } from './components/OrderFormModal';
// FIX: Corrected casing for ConfirmationModal import to resolve file casing conflict.
import ConfirmationModal from './components/ConfirmationModal';
import ToastContainer, { Toast } from './components/Toast';
import TemplateFormModal from './components/TemplateFormModal';
import ProjectsHub from './components/ProjectsHub';
// FIX: Changed to a default import since ProjectWorkspace is exported as default.
import ProjectWorkspace from './components/ProjectWorkspace';
// FIX: Changed the import for ProductsView to a named import to resolve the "no default export" error.
import { ProductsView } from './components/ProductsView';
import HelpModal from './components/HelpModal';
import ReminderModal from './components/ReminderModal';
import ReminderAlertModal from './components/ReminderAlertModal';
import NotificationHandler from './components/NotificationHandler';
import RecycleBinView from './components/RecycleBinView';
import DataRetentionHandler from './components/DataRetentionHandler';
import LoadingOverlay from './components/LoadingOverlay';
import CustomsBookView from './components/CustomsBookView';
import AIProjectGeneratorModal from './components/AIProjectGeneratorModal';
import InstantCostCalculatorModal from './components/InstantCostCalculatorModal';
import BrochureWizardModal from './components/BrochureWizardModal';
import InvoiceModal from './components/InvoiceModal';
import PackingListModal from './components/PackingListModal';
import DailyViewModal from './components/DailyViewModal';
import StickyNoteDetailModal from './components/StickyNoteDetailModal';
import TaskDetailModal from './components/TaskDetailModal';
import CalendarView from './components/CalendarView'; 
import AccountingView from './components/AccountingView';
import { AccountingTab } from './components/accounting/AccountingHeader';
import { useOrders } from './hooks/useOrders';
import { useStatuses } from './hooks/useStatuses';
import { useChecklistTemplates } from './hooks/useChecklistTemplates';
// FIX: Cannot find name 'useProjects'.
import { useProjects } from './hooks/useProjects';
// FIX: Corrected type imports to align with the new, properly structured types.ts file. This resolves numerous "not exported" and "not declared" errors across the application.
import { Order, ChecklistTemplate, CurrencyRates, CostingSettings, Task, NewOrderData, AIProjectStructure, Project, ProjectStatus, ProjectTaskChecklistItem, AISettings, MainGroup, Category, SubCategory, Brand, Product, StickyNote, CompanyInfo, CalendarTask, DailyImage, DailyAttachment, CalendarStickyNote, Currency, Payment } from './types';
import { useTranslation } from 'react-i18next';
import { analyzePurchaseOrder, generateProjectFromPrompt, categorizeProductWithAI, getHSCodeForProduct } from './utils/ai';
import { generateOrderPoTemplate, parseOrderFromTemplate, generatePackingListExcel } from './utils/formatters';
import { useSettings as useDbSettings } from './hooks/useSettings';
import { db } from './db';
import { ModalContext } from './contexts/ModalContext';
import type { ConfirmationState } from './contexts/ModalContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTasks } from './hooks/useTasks';
import AutoBackupHandler from './components/AutoBackupHandler';
import { DatabaseError } from './components/DatabaseError';
import ExcelJS from 'exceljs';
import { useCalendarItems } from './hooks/useCalendarItems';
import { useDailyMedia } from './hooks/useDailyMedia';

type View = 'dashboard' | 'ordersView' | 'products' | 'settings' | 'projectsHub' | 'projectWorkspace' | 'recycleBin' | 'customsBook' | 'calendar' | 'accounting';
type DocumentType = 'invoice' | 'packing-list';

// Helper function to convert base64 to an ArrayBuffer for ExcelJS
const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

const App: React.FC = () => {
    const { t, i18n } = useTranslation();
    
    const { orders, updateOrderStatus, updateOrder, addOrder, updateOrderDetails, deleteOrder, deleteOrders, archiveOrder, finalizeOrder: baseFinalizeOrder, addCost, updateCost, removeCost, addAttachment, deleteAttachment, addPayment, updatePayment, deletePayment, duplicateOrder, reorderOrders, createOrderFromPicker } = useOrders();
    const { statuses, addStatus, updateStatusName, updateStatusesOrder, deleteStatus } = useStatuses();
    const { templates, addTemplate, updateTemplate, deleteTemplate } = useChecklistTemplates();
    const { settings: dbSettings, updateSetting } = useDbSettings();
    const { projects, addProject } = useProjects();
    const { tasks, updateTask, deleteTask } = useTasks();
    const { 
        calendarTasks, 
        addCalendarTask, 
        addCalendarTasks,
        updateCalendarTask, 
        deleteCalendarTask, 
        calendarStickyNotes, 
        addCalendarStickyNote, 
        updateCalendarStickyNote, 
        deleteCalendarStickyNote,
        moveCalendarItem,
        moveAllCalendarItemsForDate,
        reorderDailyTasks,
        reorderCalendarTasks, // Added
        reorderDailyStickyNotes,
        calendarLists,
        addCalendarList,
        updateCalendarList,
        deleteCalendarList,
        reorderCalendarLists
    } = useCalendarItems();
    const {
        dailyImages,
        addDailyImage,
        updateDailyImage,
        deleteDailyImage,
        dailyAttachments,
        addDailyAttachment,
        deleteDailyAttachment,
        moveAllDailyMediaForDate,
    } = useDailyMedia();
    
    // Sticky Notes state management
    const stickyNotes = useLiveQuery(() => db.stickyNotes.orderBy('order').toArray(), []);
    const projectStatuses = useLiveQuery(() => db.projectStatuses.toArray(), []);

    const addStickyNote = useCallback(async (statusName: string) => {
        const noteCountInStatus = await db.stickyNotes.where({ statusName }).count();
        const newNote: StickyNote = {
            id: crypto.randomUUID(),
            statusName,
            content: 'New Note',
            color: '#FFF9C4', // light yellow
            order: noteCountInStatus,
            createdAt: new Date().toISOString(),
        };
        await db.stickyNotes.add(newNote);
    }, []);

    const updateStickyNote = useCallback(async (noteId: string, updates: Partial<StickyNote>) => {
        await db.stickyNotes.update(noteId, updates);
    }, []);
    
    const moveStickyNote = useCallback(async (noteId: string, targetStatusName: string, targetIndex: number) => {
        const noteToMove = await db.stickyNotes.get(noteId);
        if (!noteToMove) return;

        const sourceStatusName = noteToMove.statusName;

        await (db as any).transaction('rw', db.stickyNotes, async () => {
            if (sourceStatusName === targetStatusName) {
                // Reordering within the same column
                const columnNotes = await db.stickyNotes.where({ statusName: sourceStatusName }).sortBy('order');
                const sourceIndex = columnNotes.findIndex(n => n.id === noteId);
                
                if (sourceIndex === -1) return;

                const [movedItem] = columnNotes.splice(sourceIndex, 1);
                // Ensure targetIndex is within bounds
                const newIndex = Math.max(0, Math.min(columnNotes.length, targetIndex));
                columnNotes.splice(newIndex, 0, movedItem);

                const updates = columnNotes.map((note, index) => ({
                    key: note.id,
                    changes: { order: index }
                }));
                if (updates.length > 0) {
                    await db.stickyNotes.bulkUpdate(updates);
                }

            } else {
                // Moving to a different column
                const sourceColumnNotes = await db.stickyNotes.where({ statusName: sourceStatusName }).sortBy('order');
                const sourceIndex = sourceColumnNotes.findIndex(n => n.id === noteId);
                
                if (sourceIndex > -1) {
                    sourceColumnNotes.splice(sourceIndex, 1);
                    const sourceUpdates = sourceColumnNotes.map((note, index) => ({
                        key: note.id,
                        changes: { order: index }
                    }));
                    if (sourceUpdates.length > 0) {
                        await db.stickyNotes.bulkUpdate(sourceUpdates);
                    }
                }
                
                const targetColumnNotes = await db.stickyNotes.where({ statusName: targetStatusName }).sortBy('order');
                noteToMove.statusName = targetStatusName;
                const newIndex = Math.max(0, Math.min(targetColumnNotes.length, targetIndex));
                targetColumnNotes.splice(newIndex, 0, noteToMove);

                const targetUpdates = targetColumnNotes.map((note, index) => ({
                    key: note.id,
                    changes: { order: index, statusName: targetStatusName } // ensure status is updated
                }));
                 if (targetUpdates.length > 0) {
                    await db.stickyNotes.bulkUpdate(targetUpdates);
                }
            }
        });
    }, []);

    const deleteStickyNote = useCallback(async (noteId: string) => {
        await db.stickyNotes.delete(noteId);
    }, []);


    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [accountingTab, setAccountingTab] = useState<AccountingTab>('dashboard');
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
    const [orderToEdit, setOrderToEdit] = useState<Order | null>(null);
    const [newOrderStatus, setNewOrderStatus] = useState<string | undefined>(undefined);
    
    // Sidebar Persistence
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        const saved = localStorage.getItem('sidebarOpen');
        return saved !== null ? saved === 'true' : true;
    });

    useEffect(() => {
        localStorage.setItem('sidebarOpen', String(isSidebarOpen));
    }, [isSidebarOpen]);

    const [sidebarPosition, setSidebarPosition] = useState<'left' | 'right'>('left');
    
    const [costingSettings, setCostingSettings] = useState<CostingSettings | null>(null);

     // Reminder states
    const [reminderModal, setReminderModal] = useState<{ isOpen: boolean; item: Order | Task | CalendarTask | null; type: 'order' | 'task' | 'calendarTask' | null }>({ isOpen: false, item: null, type: null });
    // FIX: Update reminderAlert state to handle CalendarTask type.
    const [reminderAlert, setReminderAlert] = useState<{ isOpen: boolean; item: Order | Task | CalendarTask | null; type: 'order' | 'task' | 'calendarTask' | null }>({ isOpen: false, item: null, type: null });
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    
    // AI Project Generation State
    const [isAIProjectModalOpen, setIsAIProjectModalOpen] = useState(false);
    const [isGeneratingAIProject, setIsGeneratingAIProject] = useState(false);
    const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
    
    // Brochure Wizard State
    const [isBrochureWizardOpen, setIsBrochureWizardOpen] = useState(false);
    const [productForBrochure, setProductForBrochure] = useState<Product | null>(null);
    
    // Document Generation State
    const [documentToGenerate, setDocumentToGenerate] = useState<{ order: Order; type: DocumentType; options?: any; } | null>(null);
    
    // Invoice & Packing List Modal State
    const [invoiceModalState, setInvoiceModalState] = useState<{ isOpen: boolean; order: Order | null }>({ isOpen: false, order: null });
    const [packingListModalState, setPackingListModalState] = useState<{ isOpen: boolean; order: Order | null }>({ isOpen: false, order: null });
    const [showRecoveryView, setShowRecoveryView] = useState(false);

    // --- State lifted for global control ---
    const [dailyViewDate, setDailyViewDate] = useState<string | null>(null);
    const [taskDetail, setTaskDetail] = useState<Task | null>(null);
    const [noteDetail, setNoteDetail] = useState<StickyNote | CalendarStickyNote | null>(null);
    // State to force re-mounting of the OrderFormModal to prevent state pollution
    const [orderFormKey, setOrderFormKey] = useState(Date.now());


    useEffect(() => {
        if ((window as any).electronAPI?.onShowRecoveryMode) {
            (window as any).electronAPI.onShowRecoveryMode(() => {
                setShowRecoveryView(true);
            });
        }
    }, []);


    const currencyRates: CurrencyRates = useMemo(() => {
        const usd_aed = costingSettings?.fx?.usd_aed || 0;
        const aed_toman = costingSettings?.fx?.aed_toman || 0;
        const aed_cny = costingSettings?.fx?.aed_cny || 0;
    
        const usd_to_cny = usd_aed * aed_cny;
        return {
            aed: usd_aed,
            toman: usd_aed * aed_toman,
            cny: usd_to_cny > 0 ? 1 / usd_to_cny : 0, // cny here is CNY_TO_USD
        };
    }, [costingSettings]);

    const aiSettings = useMemo(() => {
        const setting = dbSettings.find(s => s.key === 'aiSettings');
        return setting?.value as AISettings | undefined;
    }, [dbSettings]);

    const companyInfo = useMemo(() => {
        const setting = dbSettings.find(s => s.key === 'companyInfo');
        if (!setting) return { en: '', fa: '' };
        // Handle backward compatibility
        if (typeof setting.value === 'string') return { en: setting.value, fa: '' };
        return setting.value as CompanyInfo;
    }, [dbSettings]);

    const companyLogo = useMemo(() => {
        return dbSettings.find(s => s.key === 'companyLogo')?.value || '';
    }, [dbSettings]);

    useEffect(() => {
        const costingSetting = dbSettings.find(s => s.key === 'perShipmentCostingSettings');
        if (costingSetting) {
            setCostingSettings(costingSetting.value as CostingSettings);
        }
    }, [dbSettings]);
    
    // Sync selectedOrder with the main orders list to prevent stale data in the modal
    useEffect(() => {
        if (selectedOrder) {
            const updatedOrder = orders.find(o => o.id === selectedOrder.id);
            if (updatedOrder) {
                 // useLiveQuery gives referentially stable objects.
                 // This update only happens if the order data actually changed in the db.
                if (updatedOrder !== selectedOrder) {
                    setSelectedOrder(updatedOrder);
                }
            } else {
                // Order was deleted, so close the modal
                setSelectedOrder(null);
            }
        }
    }, [orders, selectedOrder]);

    // Sync taskDetail with the main tasks list to prevent stale data in the modal
    useEffect(() => {
        if (taskDetail) {
            const updatedTask = tasks.find(t => t.id === taskDetail.id);
            if (updatedTask && updatedTask !== taskDetail) {
                // The task object in the main list has been updated, so sync our state
                setTaskDetail(updatedTask);
            } else if (!updatedTask) {
                // The task was likely deleted, close the modal
                setTaskDetail(null);
            }
        }
    }, [tasks, taskDetail]);


    const handleAedToTomanRateChange = (newRate: number) => {
        if (!costingSettings) return;
        const newCostingSettings: CostingSettings = {
            ...costingSettings,
            fx: {
                usd_aed: costingSettings.fx?.usd_aed || 0,
                aed_cny: costingSettings.fx?.aed_cny || 0,
                aed_toman: newRate,
            },
        };
        setCostingSettings(newCostingSettings);
        updateSetting('perShipmentCostingSettings', newCostingSettings);
    };
    
    const handleUsdAedRateChange = (newRate: number) => {
        if (!costingSettings) return;
        const newCostingSettings: CostingSettings = {
            ...costingSettings,
            fx: {
                usd_aed: newRate,
                aed_cny: costingSettings.fx?.aed_cny || 0,
                aed_toman: costingSettings.fx?.aed_toman || 0,
            },
        };
        setCostingSettings(newCostingSettings);
        updateSetting('perShipmentCostingSettings', newCostingSettings);
    };
    
    const handleAedCnyRateChange = (newRate: number) => {
        if (!costingSettings) return;
        const newCostingSettings: CostingSettings = {
            ...costingSettings,
            fx: {
                usd_aed: costingSettings.fx?.usd_aed || 0,
                aed_cny: newRate,
                aed_toman: costingSettings.fx?.aed_toman || 0,
            },
        };
        setCostingSettings(newCostingSettings);
        updateSetting('perShipmentCostingSettings', newCostingSettings);
    };
    
    // State for modals
    const [confirmation, setConfirmation] = useState<ConfirmationState>({ isOpen: false, title: '', message: '', onConfirm: () => {}, onCancel: undefined });
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    
    // State for Template Form Modal (lifted state)
    const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
    const [templateToEdit, setTemplateToEdit] = useState<ChecklistTemplate | null>(null);

    // State for font size scaling
    // FIX: Enhanced state initializer to correctly parse and validate localStorage value.
    const [fontScaleStep, setFontScaleStep] = useState<number>(() => {
        const savedStep = localStorage.getItem('fontScaleStep');
        const parsed = parseInt(savedStep || '0', 10);
        return isFinite(parsed) ? parsed : 0;
    });

    // Calculate font size based on the scale step.
    const fontScale = useMemo(() => 1 + fontScaleStep * 0.05, [fontScaleStep]);

    // FIX: Using useLayoutEffect to apply font size changes before paint to prevent flicker on load.
    useLayoutEffect(() => {
        document.documentElement.style.fontSize = `${fontScale * 16}px`; // Assuming base is 16px
        localStorage.setItem('fontScaleStep', fontScaleStep.toString());
    }, [fontScale, fontScaleStep]);
    
    const addToast = useCallback((message: string, type: Toast['type']) => {
        setToasts(prev => [...prev, { id: crypto.randomUUID(), message, type }]);
    }, []);
    
    // --- Context for Modals ---
    const modalContextValue = useMemo(() => ({
        showConfirmation: (options: Omit<ConfirmationState, 'isOpen'>) => setConfirmation({ ...options, isOpen: true }),
        addToast
    }), [addToast]);

    // --- Confirmation Modal Handlers ---
    const onConfirmationConfirm = useCallback(() => {
        const action = confirmation.onConfirm;
        setConfirmation(prev => ({ ...prev, isOpen: false })); // Close immediately
        if (action) {
            action();
        }
    }, [confirmation.onConfirm]);

    const onConfirmationClose = useCallback(() => {
        const action = confirmation.onCancel;
        setConfirmation(prev => ({ ...prev, isOpen: false })); // Close immediately
        if (action) {
            action();
        }
    }, [confirmation.onCancel]);

    const startPoAnalysis = useCallback(async (fileData: { mimeType: string; data: string; }) => {
        if (!aiSettings?.apiKey) {
            addToast(t('toasts.ai.apiKeyNotConfigured'), 'error');
            return;
        }
    
        setIsAnalyzing(true);
        addToast(t('orderFormModal.analyzingPO'), 'info');
    
        try {
            let processedFileData = fileData;
    
            // Check if the file is an Excel file and process it into text
            if (fileData.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileData.mimeType === 'application/vnd.ms-excel') {
                const buffer = base64ToArrayBuffer(fileData.data);
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(buffer);
                
                let allTextContent = '';
                workbook.worksheets.forEach(sheet => {
                    if (sheet.state === 'visible') { // Only process visible sheets
                        allTextContent += `--- Sheet: ${sheet.name} ---\n`;
                        sheet.eachRow({ includeEmpty: false }, (row) => {
                            const cells: string[] = [];
                            row.eachCell({ includeEmpty: true }, (cell) => {
                                 if(cell.value && typeof cell.value === 'object' && 'richText' in cell.value) {
                                    cells.push((cell.value as ExcelJS.CellRichTextValue).richText.map(rt => rt.text).join(''));
                                } else {
                                    cells.push(cell.value ? cell.text : '');
                                }
                            });
                            allTextContent += cells.join('\t') + '\n';
                        });
                        allTextContent += '\n';
                    }
                });
                
                // Create a new fileData object for the AI to process as text
                processedFileData = {
                    mimeType: 'text/plain',
                    data: btoa(unescape(encodeURIComponent(allTextContent)))
                };
            }
    
            const model = aiSettings.poAnalysisModel || 'gemini-3.5-flash';
            const orderData = await analyzePurchaseOrder(processedFileData, model, aiSettings.apiKey);
            
            // Fetch HS codes for items that don't have one
            addToast(t('toasts.ai.fetchingHsCodes'), 'info');
            const hsCodePromises = orderData.items.map((item, index) => {
                if (!item.hsCode || item.hsCode.trim() === '') {
                    return getHSCodeForProduct(item.productName, item.attributes || [], aiSettings.apiKey, model)
                        .then(hsCode => ({ index, hsCode }));
                }
                return Promise.resolve(null);
            });
            const hsCodeResults = await Promise.all(hsCodePromises);
            hsCodeResults.forEach(result => {
                if (result) {
                    orderData.items[result.index].hsCode = result.hsCode;
                }
            });

            setOrderToEdit({
                ...orderData,
                id: '', // This will be treated as a new order
                status: '',
                volumeCBM: 0,
                isArchived: false,
                isFinalized: false,
                deletedAt: null,
                items: orderData.items.map((item, index) => ({
                    ...item,
                    id: `new-${index}`
                }))
            } as Order);
            
            setOrderFormKey(Date.now());
            setIsOrderFormOpen(true);
            addToast(t('orderFormModal.importSuccess'), 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : t('orderFormModal.importError');
            addToast(message, 'error');
        } finally {
            setIsAnalyzing(false);
        }
    }, [aiSettings, addToast, t]);

    const handleImportPo = useCallback(async () => {
        // Electron-specific path for native file dialog
        if ((window as any).electronAPI?.selectAndReadPoFile) {
            const fileData = await (window as any).electronAPI.selectAndReadPoFile();
            if (fileData) {
                await startPoAnalysis(fileData);
            }
        } else {
            // Web fallback using a dynamically created input element
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = "image/*,application/pdf,.xlsx,.xls,.doc,.docx";
            input.onchange = (event) => {
                const file = (event.target as HTMLInputElement).files?.[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        if (typeof reader.result === 'string') {
                            const base64Data = reader.result.split(',')[1];
                            startPoAnalysis({ mimeType: file.type, data: base64Data });
                        }
                    };
                    reader.onerror = (error) => {
                        addToast(`Error reading file: ${error}`, 'error');
                    };
                    reader.readAsDataURL(file);
                }
            };
            input.click();
        }
    }, [startPoAnalysis, addToast]);

    const handleDownloadPoTemplate = useCallback(async () => {
        await generateOrderPoTemplate(t);
    }, [t]);

    const handleImportFromTemplate = useCallback(async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ".xlsx";
        input.onchange = async (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) {
                setIsAnalyzing(true);
                addToast(t('toasts.processingTemplate'), 'info');
                try {
                    const buffer = await file.arrayBuffer();
                    const { data, errors } = await parseOrderFromTemplate(buffer, t);

                    if (errors.length > 0) {
                        modalContextValue.showConfirmation({
                            title: t('toasts.importValidationFailed'),
                            message: `${t('toasts.fixErrorsAndRetry')}:\n\n- ${errors.join('\n- ')}`,
                            confirmText: 'OK',
                            onConfirm: () => {},
                            variant: 'destructive',
                            cancelText: undefined,
                        });
                    } else if (data) {
                        setOrderToEdit({
                            ...data,
                            id: '', // New order
                            status: '',
                            volumeCBM: 0,
                            isArchived: false,
                            isFinalized: false,
                            deletedAt: null,
                            items: data.items.map((item, index) => ({
                                ...item,
                                id: `new-${index}`
                            }))
                        } as Order);
                        setOrderFormKey(Date.now());
                        setIsOrderFormOpen(true);
                        addToast(t('toasts.importSuccessReview'), 'success');
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Failed to process template.";
                    addToast(message, 'error');
                } finally {
                    setIsAnalyzing(false);
                }
            }
        };
        input.click();
    }, [addToast, t, modalContextValue]);

    // --- Modal and Form Handlers ---
    const handleNewOrder = (statusName?: string) => {
        setOrderToEdit(null);
        setNewOrderStatus(statusName);
        setOrderFormKey(Date.now()); // Force re-mount for a clean state
        setIsOrderFormOpen(true);
    };

    const handleEditOrder = (order: Order) => {
        setOrderToEdit(order);
        setNewOrderStatus(undefined);
        setOrderFormKey(Date.now()); // Force re-mount for a clean state
        setIsOrderFormOpen(true);
    };

    const handleOrderFormSubmit = async (data: NewOrderData, orderId?: string) => {
        try {
            if (orderId) {
                await updateOrderDetails(orderId, data);
                addToast(t('toasts.orderUpdated'), 'success');
            } else {
                await addOrder(data, newOrderStatus);
                addToast(t('toasts.newOrderCreated'), 'success');
            }
        } catch (error) {
            console.error("Failed to save order:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            addToast(`Error saving order: ${errorMessage}`, 'error');
        } finally {
            setIsOrderFormOpen(false);
            setOrderToEdit(null);
            setNewOrderStatus(undefined);
        }
    };

    const handleFinalizeOrder = useCallback(async (orderId: string, skipProductUpdate: boolean = false) => {
        await baseFinalizeOrder(orderId, addToast, skipProductUpdate);
    }, [baseFinalizeOrder, addToast]);
    
    const handleGenerateDocumentForOrder = useCallback(async (order: Order, type: DocumentType, options?: any) => {
        setDocumentToGenerate({ order, type, options });
        setCurrentView('customsBook');
    }, []);

    const onDocumentGenerated = useCallback(() => {
        setDocumentToGenerate(null);
    }, []);

    const handleOpenInvoiceModal = (order: Order) => {
        setSelectedOrder(null); // Close the order modal
        setInvoiceModalState({ isOpen: true, order });
    };

    const handleOpenPackingListModal = (order: Order) => {
        setSelectedOrder(null); // Close the order modal
        setPackingListModalState({ isOpen: true, order });
    };

    const handleGenerateInvoiceSheet = (order: Order, options: any) => {
        handleGenerateDocumentForOrder(order, 'invoice', options);
        setInvoiceModalState({ isOpen: false, order: null }); // Close modal after initiating generation
    };

    const handleGeneratePackingListSheet = (order: Order, products: Product[], billTo: string) => {
        handleGenerateDocumentForOrder(order, 'packing-list', { products, billTo });
        setPackingListModalState({ isOpen: false, order: null });
    };
    
    const handleExportPackingListExcel = async (order: Order, products: Product[], billTo: string) => {
        if (!costingSettings) return;
        await generatePackingListExcel(order, products, billTo);
    };

    // --- Navigation Handlers ---
    const handleSelectProject = (projectId: string) => {
        setCurrentProjectId(projectId);
        setCurrentView('projectWorkspace');
    };

    const handleOpenTaskDetail = (task: Task) => {
        setTaskDetail(task);
    };
    // FIX: Update `handleCalendarTaskClick` to accept a generic object with a `date` property.
    // This allows it to be used by both `CalendarTask` and `CalendarStickyNote` from the dashboard.
    const handleCalendarTaskClick = (item: { date: string }) => {
        // If we are already in Calendar View, this might behave differently, but usually opening the daily view is correct.
        // Since Calendar View is now standalone, we can redirect there or open the daily modal directly.
        // Given the requirement "without opening the daily view... manually sort", this suggests a drag/drop on the calendar grid itself.
        // But for clicking a task/note, opening the daily view (modal) is still the best UX for editing.
        setDailyViewDate(item.date);
    };

    const finalizedProductsForInvoice = useLiveQuery(async () => {
        if (!invoiceModalState.order) return [];

        const itemCodes = invoiceModalState.order.items
            .map(item => item.internalCode)
            .filter((code): code is string => !!code && code.trim() !== '');
        
        const itemsWithoutCodes = invoiceModalState.order.items
            .filter(item => !item.internalCode || item.internalCode.trim() === '');
        const itemNames = itemsWithoutCodes.map(item => item.productName);
        
        const productsByCode = itemCodes.length > 0 ? await db.products.where('internalCode').anyOf(itemCodes).toArray() : [];
        const productsByName = itemNames.length > 0 ? await db.products.where('description').anyOf(itemNames).toArray() : [];

        // Combine and remove duplicates
        const allProducts = new Map<string, Product>();
        [...productsByCode, ...productsByName].forEach(p => allProducts.set(p.id, p));
        
        return Array.from(allProducts.values());

    }, [invoiceModalState.order]);

    const finalizedProductsForPackingList = useLiveQuery(async () => {
        if (!packingListModalState.order) return [];

        const itemCodes = packingListModalState.order.items
            .map(item => item.internalCode)
            .filter((code): code is string => !!code && code.trim() !== '');
        
        const itemsWithoutCodes = packingListModalState.order.items
            .filter(item => !item.internalCode || item.internalCode.trim() === '');
        const itemNames = itemsWithoutCodes.map(item => item.productName);
        
        const productsByCode = itemCodes.length > 0 ? await db.products.where('internalCode').anyOf(itemCodes).toArray() : [];
        const productsByName = itemNames.length > 0 ? await db.products.where('description').anyOf(itemNames).toArray() : [];

        // Combine and remove duplicates
        const allProducts = new Map<string, Product>();
        [...productsByCode, ...productsByName].forEach(p => allProducts.set(p.id, p));
        
        return Array.from(allProducts.values());

    }, [packingListModalState.order]);

    const mainContentClasses = useMemo(() => {
        const classes = ['main-content', 'absolute', 'top-16', 'bottom-0', 'transition-all', 'duration-300', 'overflow-y-auto', 'p-4'];
        if (sidebarPosition === 'left') {
            classes.push(isSidebarOpen ? 'left-64' : 'left-20', 'right-0');
        } else { // sidebar on right
            classes.push(isSidebarOpen ? 'right-64' : 'right-20', 'left-0');
        }
        return classes.join(' ');
    }, [isSidebarOpen, sidebarPosition]);


    // FIX: Added the missing JSX return for the App component.
    return (
        <ModalContext.Provider value={modalContextValue}>
            <div className={`app-container font-sans text-base relative h-screen overflow-hidden ${sidebarPosition === 'left' ? 'sidebar-left' : 'sidebar-right'} ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
                <Header 
                    rates={currencyRates} 
                    costingSettings={costingSettings} 
                    setAedToTomanRate={handleAedToTomanRateChange} 
                    setUsdAedRate={handleUsdAedRateChange} 
                    setAedCnyRate={handleAedCnyRateChange}
                    onHelpClick={() => setIsHelpOpen(true)}
                    onCalculatorClick={() => setIsCalculatorOpen(true)}
                    isSidebarOpen={isSidebarOpen}
                    sidebarPosition={sidebarPosition}
                />
                <Sidebar 
                    currentView={currentView}
                    setView={setCurrentView}
                    activeAccountingTab={accountingTab}
                    setActiveAccountingTab={setAccountingTab}
                    isOpen={isSidebarOpen}
                    position={sidebarPosition}
                    toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                    toggleSidebarPosition={() => setSidebarPosition(p => p === 'left' ? 'right' : 'left')}
                />

                <main className={mainContentClasses}>
                    {currentView === 'dashboard' && <Dashboard 
                        orders={orders || []} 
                        statuses={statuses || []} 
                        costingSettings={costingSettings} 
                        onOrderClick={setSelectedOrder} 
                        onProjectTaskClick={handleOpenTaskDetail} 
                        onCalendarTaskClick={handleCalendarTaskClick}
                        calendarTasks={calendarTasks || []}
                        calendarStickyNotes={calendarStickyNotes || []}
                    />}
                    {currentView === 'ordersView' && (
                        <OrdersView 
                            orders={orders || []} 
                            statuses={statuses || []}
                            templates={templates || []}
                            currencyRates={currencyRates}
                            updateOrder={updateOrder}
                            updateTask={updateTask}
                            onImportPoClick={handleImportPo}
                            onDownloadPoTemplate={handleDownloadPoTemplate}
                            onImportFromTemplate={handleImportFromTemplate}
                            onOrderClick={setSelectedOrder}
                            onCardClick={setSelectedOrder}
                            deleteOrders={deleteOrders}
                            onOrderStatusChange={updateOrderStatus}
                            onAddStatus={addStatus}
                            onUpdateStatusName={updateStatusName}
                            onUpdateStatusesOrder={updateStatusesOrder}
                            onDeleteStatus={deleteStatus}
                            onArchiveOrder={archiveOrder}
                            onNewTemplateClick={() => {
                                setTemplateToEdit(null);
                                setIsTemplateFormOpen(true);
                            }}
                            onNewOrderInStatus={handleNewOrder}
                            // FIX: Add correct types for onSetReminder callback.
                            onSetReminder={(item, type) => setReminderModal({ isOpen: true, item: item as Order | Task | CalendarTask, type: type as 'order' | 'task' | 'calendarTask' })}
                            stickyNotes={stickyNotes || []}
                            onAddStickyNote={addStickyNote}
                            onUpdateStickyNote={updateStickyNote}
                            onDeleteStickyNote={deleteStickyNote}
                            onMoveStickyNote={moveStickyNote}
                            calendarTasks={calendarTasks}
                            addCalendarTask={addCalendarTask}
                            addCalendarTasks={addCalendarTasks}
                            updateCalendarTask={updateCalendarTask}
                            deleteCalendarTask={deleteCalendarTask}
                            calendarStickyNotes={calendarStickyNotes}
                            addCalendarStickyNote={addCalendarStickyNote}
                            updateCalendarStickyNote={updateCalendarStickyNote}
                            deleteCalendarStickyNote={deleteCalendarStickyNote}
                            moveCalendarItem={moveCalendarItem}
                            aiSettings={aiSettings}
                            onOpenDailyView={setDailyViewDate}
                            onOpenNoteDetail={setNoteDetail}
                            tasks={tasks || []}
                            onProjectTaskClick={handleOpenTaskDetail}
                            duplicateOrder={duplicateOrder}
                            reorderOrders={reorderOrders}
                            createOrderFromPicker={createOrderFromPicker}
                        />
                    )}
                    {currentView === 'calendar' && (
                        <CalendarView
                            orders={orders || []}
                            tasks={tasks || []}
                            updateOrder={updateOrder}
                            updateTask={updateTask}
                            calendarTasks={calendarTasks}
                            addCalendarTask={addCalendarTask}
                            addCalendarTasks={addCalendarTasks}
                            updateCalendarTask={updateCalendarTask} // Make sure this is passed if used in CalendarView
                            deleteCalendarTask={deleteCalendarTask}
                            calendarStickyNotes={calendarStickyNotes}
                            addCalendarStickyNote={addCalendarStickyNote}
                            updateCalendarStickyNote={updateCalendarStickyNote}
                            deleteCalendarStickyNote={deleteCalendarStickyNote}
                            moveCalendarItem={moveCalendarItem}
                            reorderDailyTasks={reorderDailyTasks}
                            reorderCalendarTasks={reorderCalendarTasks} // Passed new prop
                            reorderDailyStickyNotes={reorderDailyStickyNotes} // <--- Add this
                            onSetReminder={(item, type) => setReminderModal({ isOpen: true, item: item as Order | Task | CalendarTask, type: type as 'order' | 'task' | 'calendarTask' })}
                            aiSettings={aiSettings}
                            onOpenDailyView={setDailyViewDate}
                            onOrderClick={setSelectedOrder}
                            onProjectTaskClick={handleOpenTaskDetail}
                            // Pass the new props for custom list management
                            calendarLists={calendarLists}
                            addCalendarList={addCalendarList}
                            updateCalendarList={updateCalendarList}
                            deleteCalendarList={deleteCalendarList}
                            reorderCalendarLists={reorderCalendarLists}
                        />
                    )}
                    {currentView === 'products' && (
                        <ProductsView 
                            costingSettings={costingSettings} 
                            onOpenBrochureWizard={product => { setProductForBrochure(product); setIsBrochureWizardOpen(true); }}
                            aiSettings={aiSettings}
                        />
                    )}
                    {currentView === 'settings' && <Settings 
                        templates={templates || []}
                        onNewTemplate={() => { setTemplateToEdit(null); setIsTemplateFormOpen(true); }}
                        onEditTemplate={(template: ChecklistTemplate) => { setTemplateToEdit(template); setIsTemplateFormOpen(true); }}
                        onDeleteTemplate={deleteTemplate}
                        fontScaleStep={fontScaleStep}
                        setFontScaleStep={setFontScaleStep}
                        aiSettings={aiSettings}
                        onOpenRecovery={() => setShowRecoveryView(true)}
                    />}
                    {currentView === 'projectsHub' && <ProjectsHub onSelectProject={handleSelectProject} onGenerateAIProjectClick={() => setIsAIProjectModalOpen(true)} />}
                    {currentView === 'projectWorkspace' && currentProjectId && (
                        <ProjectWorkspace 
                            projectId={currentProjectId} 
                            onBack={() => { setCurrentProjectId(null); setCurrentView('projectsHub'); }} 
                            onSetReminder={(item: Order | Task, type: 'order' | 'task') => setReminderModal({ isOpen: true, item, type })} 
                            aiSettings={aiSettings} 
                            onTaskClick={handleOpenTaskDetail}
                        />
                    )}
                    {currentView === 'recycleBin' && <RecycleBinView />}
                    {currentView === 'customsBook' && <CustomsBookView documentToGenerate={documentToGenerate} onDocumentGenerated={onDocumentGenerated} companyInfo={companyInfo} companyLogo={companyLogo} />}
                    {currentView === 'accounting' && <AccountingView activeTab={accountingTab} setActiveTab={setAccountingTab} />}
                </main>
                
                {/* Modals & Overlays */}
                {selectedOrder && (
                    <OrderModal 
                        order={selectedOrder}
                        onClose={() => setSelectedOrder(null)}
                        onEdit={handleEditOrder}
                        onDelete={() => {
                            if (selectedOrder) {
                                deleteOrder(selectedOrder.id);
                                setSelectedOrder(null);
                            }
                        }}
                        isFinalStatus={statuses.find(s => s.name === selectedOrder.status)?.isSystem || false}
                        currencyRates={currencyRates}
                        updateOrder={updateOrder}
                        onFinalize={handleFinalizeOrder}
                        addCost={addCost}
                        updateCost={updateCost}
                        removeCost={removeCost}
                        addAttachment={addAttachment}
                        deleteAttachment={deleteAttachment}
                        addPayment={addPayment}
                        updatePayment={updatePayment}
                        deletePayment={deletePayment}
                        aiSettings={aiSettings}
                        onGenerateDocument={handleGenerateDocumentForOrder as any}
                        onOpenInvoiceModal={handleOpenInvoiceModal}
                        onOpenPackingListModal={handleOpenPackingListModal}
                    />
                )}
                {isOrderFormOpen && (
                    <OrderFormModal 
                        key={orderFormKey}
                        isOpen={isOrderFormOpen}
                        onClose={() => { setIsOrderFormOpen(false); setOrderToEdit(null); }}
                        onSubmit={handleOrderFormSubmit}
                        orderToEdit={orderToEdit}
                        aiSettings={aiSettings}
                        isFinalStatus={!!orderToEdit && !!statuses.find(s => s.name === orderToEdit.status)?.isSystem}
                    />
                )}
                 {dailyViewDate && (
                    <DailyViewModal
                        date={dailyViewDate}
                        onClose={() => setDailyViewDate(null)}
                        onDateChange={setDailyViewDate}
                        calendarTasks={calendarTasks}
                        addCalendarTask={addCalendarTask}
                        addCalendarTasks={addCalendarTasks}
                        updateCalendarTask={updateCalendarTask}
                        deleteCalendarTask={deleteCalendarTask}
                        moveAllCalendarItemsForDate={moveAllCalendarItemsForDate}
                        reorderDailyTasks={reorderDailyTasks}
                        calendarStickyNotes={calendarStickyNotes}
                        addCalendarStickyNote={addCalendarStickyNote}
                        updateCalendarStickyNote={updateCalendarStickyNote}
                        deleteCalendarStickyNote={deleteCalendarStickyNote}
                        reorderDailyStickyNotes={reorderDailyStickyNotes}
                        dailyImages={dailyImages}
                        addDailyImage={addDailyImage}
                        updateDailyImage={updateDailyImage}
                        deleteDailyImage={deleteDailyImage}
                        dailyAttachments={dailyAttachments}
                        addDailyAttachment={addDailyAttachment}
                        deleteDailyAttachment={deleteDailyAttachment}
                        moveAllDailyMediaForDate={moveAllDailyMediaForDate}
                        aiSettings={aiSettings}
                        onOpenNoteDetail={setNoteDetail}
                        onSetReminder={(item, type) => setReminderModal({ isOpen: true, item, type })}
                    />
                )}
                 {noteDetail && (
                    <StickyNoteDetailModal 
                        isOpen={!!noteDetail}
                        note={noteDetail}
                        onClose={() => setNoteDetail(null)}
                    />
                )}
                {taskDetail && (() => {
                    const doneStatusId = projectStatuses?.filter(s => s.projectId === taskDetail.projectId).sort((a,b) => a.order - b.order).pop()?.id || null;
                    return (
                        <TaskDetailModal
                            task={taskDetail}
                            project={projects.find(p => p.id === taskDetail.projectId)}
                            isOpen={!!taskDetail}
                            onClose={() => setTaskDetail(null)}
                            onUpdate={updateTask}
                            onDelete={deleteTask}
                            templates={templates || []}
                            doneStatusId={doneStatusId}
                            aiSettings={aiSettings}
                        />
                    );
                })()}
                <ConfirmationModal
                    isOpen={confirmation.isOpen}
                    onClose={onConfirmationClose}
                    onConfirm={onConfirmationConfirm}
                    title={confirmation.title}
                    message={confirmation.message}
                    confirmText={confirmation.confirmText}
                    cancelText={confirmation.cancelText}
                    variant={confirmation.variant}
                    requireCode={confirmation.requireCode}
                    confirmationCode={confirmation.confirmationCode}
                />
                <ToastContainer toasts={toasts} setToasts={setToasts} />
                {isTemplateFormOpen && (
                    <TemplateFormModal 
                        isOpen={isTemplateFormOpen}
                        onClose={() => setIsTemplateFormOpen(false)}
                        onSubmit={(data, id) => {
                            if (id) {
                                updateTemplate(id, data);
                            } else {
                                addTemplate(data);
                            }
                            setIsTemplateFormOpen(false);
                            setTemplateToEdit(null);
                        }}
                        templateToEdit={templateToEdit}
                        aiSettings={aiSettings}
                    />
                )}
                 <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
                 <ReminderModal 
                    isOpen={reminderModal.isOpen} 
                    onClose={() => setReminderModal({isOpen: false, item: null, type: null})} 
                    onSetReminder={(date, message) => {
                        if (date === null) { // Deletion case
                            if (reminderModal.item && reminderModal.type) {
                                const updates = { reminder: undefined };
                                if (reminderModal.type === 'order') updateOrder((reminderModal.item as Order).id, updates);
                                else if (reminderModal.type === 'task') updateTask((reminderModal.item as Task).id, updates);
                                else if (reminderModal.type === 'calendarTask') updateCalendarTask((reminderModal.item as CalendarTask).id, updates);
                            }
                        } else { // Update/Create case
                             if (reminderModal.item && reminderModal.type) {
                                const newReminder = { date, message: message || '', acknowledged: false };
                                if (reminderModal.type === 'order') {
                                    updateOrder((reminderModal.item as Order).id, { reminder: newReminder });
                                } else if (reminderModal.type === 'task') {
                                    updateTask((reminderModal.item as Task).id, { reminder: newReminder });
                                } else if (reminderModal.type === 'calendarTask') {
                                    updateCalendarTask((reminderModal.item as CalendarTask).id, { reminder: newReminder });
                                }
                            }
                        }
                        setReminderModal({isOpen: false, item: null, type: null});
                    }} 
                    item={reminderModal.item} 
                    type={reminderModal.type} 
                 />
                 
                 <ReminderAlertModal 
                    isOpen={reminderAlert.isOpen} 
                    onClose={() => setReminderAlert({ isOpen: false, item: null, type: null })} 
                    onAcknowledge={() => {
                        if (reminderAlert.item && reminderAlert.type && reminderAlert.item.reminder) {
                            const updatedReminder = { ...reminderAlert.item.reminder, acknowledged: true };
                            if(reminderAlert.type === 'order') {
                                updateOrder((reminderAlert.item as Order).id, { reminder: updatedReminder });
                            } else if (reminderAlert.type === 'task') {
                                updateTask((reminderAlert.item as Task).id, { reminder: updatedReminder });
                            } else if (reminderAlert.type === 'calendarTask') {
                                updateCalendarTask((reminderAlert.item as CalendarTask).id, { reminder: updatedReminder });
                           }
                        }
                        setReminderAlert({ isOpen: false, item: null, type: null });
                    }} 
                    onSnooze={(snoozeUntil: Date) => {
                        if (reminderAlert.item && reminderAlert.type && reminderAlert.item.reminder) {
                            const updatedReminder = { 
                                ...reminderAlert.item.reminder, 
                                date: snoozeUntil.toISOString(),
                                acknowledged: false // Ensure it's not acknowledged
                            };
                            if(reminderAlert.type === 'order') {
                                updateOrder((reminderAlert.item as Order).id, { reminder: updatedReminder });
                            } else if (reminderAlert.type === 'task') {
                                updateTask((reminderAlert.item as Task).id, { reminder: updatedReminder });
                            } else if (reminderAlert.type === 'calendarTask') {
                                updateCalendarTask((reminderAlert.item as CalendarTask).id, { reminder: updatedReminder });
                            }
                        }
                        setReminderAlert({ isOpen: false, item: null, type: null });
                    }}
                    item={reminderAlert.item} 
                    type={reminderAlert.type} 
                 />

                {isAIProjectModalOpen && (
                    <AIProjectGeneratorModal 
                        isOpen={isAIProjectModalOpen}
                        onClose={() => setIsAIProjectModalOpen(false)}
                        onSubmit={async (prompt) => {
                             if (!aiSettings?.apiKey) {
                                addToast(t('toasts.ai.apiKeyNotConfigured'), 'error');
                                return;
                            }
                            setIsAIProjectModalOpen(false);
                            setIsGeneratingAIProject(true);
                            try {
                                const model = aiSettings.projectGenerationModel || 'gemini-3.5-flash';
                                const projectStructure: AIProjectStructure = await generateProjectFromPrompt(prompt, model, aiSettings.apiKey);
                                const newProjectId = await addProject({ name: projectStructure.name, description: projectStructure.description });
                                // Create statuses (columns) and tasks
                                for (const [index, column] of projectStructure.columns.entries()) {
                                    const statusId = crypto.randomUUID();
                                    await (db as any).transaction('rw', db.projectStatuses, async () => {
                                      await db.projectStatuses.add({ id: statusId, projectId: newProjectId, name: column.name, order: index });
                                    });
                                    for (const [taskIndex, task] of column.tasks.entries()) {
                                        await (db as any).transaction('rw', db.tasks, async () => {
                                            await db.tasks.add({
                                                id: crypto.randomUUID(),
                                                projectId: newProjectId,
                                                statusId: statusId,
                                                order: taskIndex,
                                                title: task.title,
                                                description: task.description,
                                                checklist: task.checklist?.map(item => ({ id: crypto.randomUUID(), text: item, isDone: false, isAdhoc: true })),
                                                createdAt: new Date().toISOString(),
                                                deletedAt: null,
                                            });
                                        });
                                    }
                                }
                                addToast(t('toasts.projects.projectCreated'), 'success');
                                setCurrentProjectId(newProjectId);
                                setCurrentView('projectWorkspace');
                            } catch (error) {
                                addToast(error instanceof Error ? error.message : t('toasts.projects.generateError'), 'error');
                            } finally {
                                setIsGeneratingAIProject(false);
                            }
                        }}
                    />
                )}
                {isCalculatorOpen && <InstantCostCalculatorModal isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />}
                {isBrochureWizardOpen && <BrochureWizardModal isOpen={isBrochureWizardOpen} onClose={() => setIsBrochureWizardOpen(false)} product={productForBrochure} aiSettings={aiSettings} />}
                {invoiceModalState.isOpen && (
                    // FIX: Pass required 'onGenerate' prop to InvoiceModal.
                    <InvoiceModal
                        isOpen={invoiceModalState.isOpen}
                        onClose={() => setInvoiceModalState({ isOpen: false, order: null })}
                        onGenerate={(options) => handleGenerateInvoiceSheet(invoiceModalState.order!, options)}
                        order={invoiceModalState.order!}
                        products={finalizedProductsForInvoice || []}
                        companyInfo={companyInfo}
                        companyLogo={companyLogo}
                        costingSettings={costingSettings}
                    />
                )}
                {packingListModalState.isOpen && (
                    // FIX: Pass required 'onGenerateSheet' and 'onExportExcel' props to PackingListModal.
                    <PackingListModal
                        isOpen={packingListModalState.isOpen}
                        onClose={() => setPackingListModalState({ isOpen: false, order: null })}
                        onGenerateSheet={handleGeneratePackingListSheet}
                        onExportExcel={handleExportPackingListExcel}
                        order={packingListModalState.order!}
                        products={finalizedProductsForPackingList || []}
                        companyInfo={companyInfo}
                        companyLogo={companyLogo}
                    />
                )}


                <NotificationHandler addToast={addToast} onShowReminderAlert={(item, type) => setReminderAlert({ isOpen: true, item, type })} calendarTasks={calendarTasks}/>
                <DataRetentionHandler />
                <AutoBackupHandler />
                {(isAnalyzing || isGeneratingAIProject) && <LoadingOverlay message={isAnalyzing ? t('orderFormModal.analyzingPO') : t('toasts.projects.generating')} />}
            </div>
            {showRecoveryView && <DatabaseError onExit={() => setShowRecoveryView(false)} />}
        </ModalContext.Provider>
    );
};

export default App;