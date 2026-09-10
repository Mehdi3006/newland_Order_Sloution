
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { KanbanCard } from './KanbanCard';
import { Order, Status, ChecklistTemplate, Task, StickyNote } from '../types';
import { useTranslation } from 'react-i18next';
import { useModals } from '../contexts/ModalContext';
import { persianArabicToEnglish } from '../utils/formatters';
import RichTextEditor from './RichTextEditor';

interface KanbanColumnProps {
    status: Status;
    orders: Order[];
    notes: StickyNote[];
    templates: ChecklistTemplate[];
    onOrderDrop: (orderId: string, statusName: string) => void;
    onMoveStickyNote: (noteId: string, targetStatusName: string, targetIndex: number) => void;
    onCardClick: (order: Order) => void;
    onUpdateStatusName: (id: string, newName: string) => void;
    onDeleteStatus: (id: string) => void;
    onArchiveOrder: (orderId: string) => void;
    onColumnDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
    onColumnDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onColumnDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    onColumnDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
    isBeingDragged: boolean;
    updateOrder: (orderId: string, updates: Partial<Order>) => void;
    onNewTemplateClick: () => void;
    onNewOrderInStatus: (statusName: string) => void;
    onSetReminder: (item: Order | Task, type: 'order' | 'task') => void;
    onAddStickyNote: (statusName: string) => void;
    onUpdateStickyNote: (noteId: string, updates: Partial<StickyNote>) => void;
    onDeleteStickyNote: (noteId: string) => void;
    onOpenNoteDetail: (note: StickyNote) => void;
}

type SortKey = 'date' | 'supplier' | 'value';

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

const StickyNoteCard: React.FC<{
    note: StickyNote;
    onUpdate: (id: string, updates: Partial<StickyNote>) => void;
    onDelete: (id: string) => void;
    onView: (note: StickyNote) => void;
    onNoteDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
    onNoteDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
    onNoteDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    onNoteDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onNoteDragLeave: () => void;
    isBeingDragged: boolean;
    isDragOver: boolean;
}> = ({ note, onUpdate, onDelete, onView, onNoteDragStart, onNoteDragEnd, onNoteDrop, onNoteDragOver, onNoteDragLeave, isBeingDragged, isDragOver }) => {
    const { t } = useTranslation();
    const { showConfirmation } = useModals();
    const [content, setContent] = useState(note.content);

    const handleBlur = () => {
        if (content !== note.content) {
            onUpdate(note.id, { content });
        }
    };

    const handleDeleteClick = () => {
        showConfirmation({
            title: t('confirmationModal.deleteStickyNoteTitle'),
            message: t('confirmationModal.deleteStickyNoteBody'),
            variant: 'destructive',
            onConfirm: () => onDelete(note.id),
        });
    };

    return (
        <div
            draggable
            onDragStart={onNoteDragStart}
            onDragEnd={onNoteDragEnd}
            onDrop={onNoteDrop}
            onDragOver={onNoteDragOver}
            onDragLeave={onNoteDragLeave}
            style={{ backgroundColor: note.color }}
            className={`p-2 rounded-md shadow-sm cursor-grab active:cursor-grabbing group relative transition-all duration-200 ${isBeingDragged ? 'opacity-50' : ''}`}
        >
            {isDragOver && <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-500 rounded-full -mt-1 z-10" />}
            
            <RichTextEditor
                value={content}
                onChange={setContent}
                onBlur={handleBlur}
                className="w-full text-sm text-gray-800"
                contentClassName="min-h-[2.5rem] max-h-40 cursor-text"
                simple={true}
            />

            <div className="absolute bottom-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button onClick={() => onView(note)} className="p-1.5 rounded-full text-slate-700 bg-white/60 hover:bg-white/90 shadow-sm" title="Zoom in">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 3a5 5 0 100 10 5 5 0 000-10zM2 8a8 8 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A8 8 0 012 8zm5 0a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                </button>
            </div>
            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button 
                    onClick={handleDeleteClick}
                    className="p-1.5 rounded-full text-slate-700 bg-white/60 hover:bg-white/90 shadow-sm"
                    title={t('buttons.delete') as string}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
            </div>
        </div>
    );
};


const KanbanColumn: React.FC<KanbanColumnProps> = ({ status, orders, notes, templates, onOrderDrop, onMoveStickyNote, onCardClick, onUpdateStatusName, onDeleteStatus, onArchiveOrder, onColumnDragStart, onColumnDragOver, onColumnDrop, onColumnDragEnd, isBeingDragged, updateOrder, onNewTemplateClick, onNewOrderInStatus, onSetReminder, onAddStickyNote, onUpdateStickyNote, onDeleteStickyNote, onOpenNoteDetail }) => {
    const [isCardOver, setIsCardOver] = useState(false);
    const [sortBy, setSortBy] = useState<SortKey>('date');
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(status.name);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const { showConfirmation, addToast } = useModals();
    const [newlyDroppedOrderId, setNewlyDroppedOrderId] = useState<string | null>(null);
    const prevOrders = usePrevious(orders);

    const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
    const [dragOverNoteId, setDragOverNoteId] = useState<string | null>(null);

    const sortedNotes = useMemo(() => [...notes].sort((a, b) => a.order - b.order), [notes]);
    
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    
    useEffect(() => {
        if (prevOrders && orders.length > prevOrders.length) {
            const prevOrderIds = new Set(prevOrders.map((o: Order) => o.id));
            const newOrder = orders.find((o: Order) => !prevOrderIds.has(o.id));
            
            if (newOrder) {
                setNewlyDroppedOrderId(newOrder.id);
                const timer = setTimeout(() => {
                    setNewlyDroppedOrderId(null);
                }, 500); // Animation duration is 400ms, 500ms is safe
                
                return () => clearTimeout(timer);
            }
        }
    }, [orders]);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsCardOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        setIsCardOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsCardOver(false);
        const orderId = e.dataTransfer.getData('orderId');
        if (orderId) {
            onOrderDrop(orderId, status.name);
        }
        const noteId = e.dataTransfer.getData('noteId');
        if (noteId) {
            onMoveStickyNote(noteId, status.name, sortedNotes.length);
        }
        setDraggedNoteId(null);
    };

    const handleNameDoubleClick = () => {
        if (status.isSystem) return;
        setEditedName(status.name);
        setIsEditing(true);
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEditedName(persianArabicToEnglish(e.target.value));
    };

    const handleNameBlur = () => {
        if (editedName.trim() && editedName.trim() !== status.name) {
            onUpdateStatusName(status.id, editedName);
        }
        setIsEditing(false);
    };

    const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleNameBlur();
        } else if (e.key === 'Escape') {
            setEditedName(status.name);
            setIsEditing(false);
        }
    };
    
    const handleDeleteColumn = () => {
        setIsMenuOpen(false);
        if (orders.length > 0 || status.isSystem) return;

        showConfirmation({
            title: t('confirmationModal.deleteColumnTitle'),
            message: t('confirmationModal.deleteColumnBody', { name: status.name }),
            confirmText: t('buttons.delete'),
            cancelText: t('common.cancel'),
            variant: 'destructive',
            onConfirm: () => {
                try {
                    onDeleteStatus(status.id);
                } catch (error) {
                    addToast(t('toasts.deleteError'), 'error');
                }
            }
        });
    };


    const sortedOrders = useMemo(() => {
        return [...orders].sort((a, b) => {
            if (sortBy === 'supplier') {
                return a.supplier.localeCompare(b.supplier);
            }
            if (sortBy === 'value') {
                const valueA = a.items.reduce((sum, i) => sum + i.quantity * i.price, 0);
                const valueB = b.items.reduce((sum, i) => sum + i.quantity * i.price, 0);
                return valueB - valueA;
            }
            return new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime();
        });
    }, [orders, sortBy]);

    const handleNoteDragStart = (noteId: string, e: React.DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData('noteId', noteId);
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
        e.currentTarget.style.opacity = '0.5';
        setDraggedNoteId(noteId);
    };
    
    const handleNoteDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        e.currentTarget.style.opacity = '1';
        setDraggedNoteId(null);
        setDragOverNoteId(null);
        setIsCardOver(false);
    };
    
    const handleNoteDropOnCard = (targetNoteId: string, e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const sourceNoteId = e.dataTransfer.getData('noteId');
        if (!sourceNoteId || sourceNoteId === targetNoteId) {
            setDraggedNoteId(null);
            setDragOverNoteId(null);
            return;
        }

        const targetIndex = sortedNotes.findIndex(n => n.id === targetNoteId);
        if (targetIndex === -1) return;
    
        onMoveStickyNote(sourceNoteId, status.name, targetIndex);
        setDraggedNoteId(null);
        setDragOverNoteId(null);
    };

    return (
        <div 
            draggable={!status.isSystem}
            onDragStart={status.isSystem ? undefined : onColumnDragStart}
            onDragOver={(e) => {
                onColumnDragOver(e);
                handleDragOver(e); // Also handle card drag over
            }}
            onDrop={(e) => {
                onColumnDrop(e);
                handleDrop(e); // Also handle card drop
            }}
            onDragEnd={status.isSystem ? undefined : onColumnDragEnd}
            onDragLeave={handleDragLeave}
            className={`flex-shrink-0 w-80 bg-gray-100 rounded-lg h-full flex flex-col transition-all duration-300 ${isBeingDragged ? 'opacity-50' : ''} ${isCardOver ? 'bg-indigo-100 ring-2 ring-indigo-400 scale-[1.02]' : ''}`}
        >
            <div className={`p-3 flex justify-between items-center ${status.isSystem ? '' : 'cursor-move'}`}>
                <div className="flex-1 min-w-0 flex items-center gap-x-2" onDoubleClick={handleNameDoubleClick} title={status.isSystem ? t('kanban.systemColumnTooltip') : t('kanban.editNameTooltip')}>
                     {status.isSystem && <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>}
                     {isEditing ? (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editedName}
                            onChange={handleNameChange}
                            onBlur={handleNameBlur}
                            onKeyDown={handleNameKeyDown}
                            className="font-bold text-lg text-slate-700 bg-white border border-indigo-400 rounded-md px-2 py-0.5 w-full"
                        />
                    ) : (
                        <h2 className="font-bold text-lg text-slate-800 truncate">{status.name}</h2>
                    )}
                </div>
                <div className="flex items-center gap-x-1">
                    <span className="bg-slate-300 text-slate-700 font-semibold text-sm px-3 py-1 rounded-full">{orders.length}</span>
                     <div className="relative" ref={menuRef}>
                        <button 
                            onClick={() => setIsMenuOpen(prev => !prev)}
                            className="text-slate-600 hover:text-slate-800 p-1.5 rounded-full hover:bg-slate-300 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            disabled={status.isSystem}
                            title={status.isSystem ? t('kanban.systemColumnTooltip') : t('common.actions')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                        </button>
                         {isMenuOpen && !status.isSystem && (
                            <div className="absolute top-full end-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-slate-200 z-30">
                                <ul className="py-1 text-sm text-slate-700">
                                    <li>
                                        <button
                                            onClick={() => { onAddStickyNote(status.name); setIsMenuOpen(false); }}
                                            className="w-full text-left rtl:text-right px-4 py-2 hover:bg-slate-100 flex items-center gap-x-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                                            {t('kanban.addStickyNote')}
                                        </button>
                                    </li>
                                    <li className="my-1 h-px bg-slate-200"></li>
                                    <li>
                                        <button
                                            onClick={() => { setIsEditing(true); setIsMenuOpen(false); }}
                                            className="w-full text-left rtl:text-right px-4 py-2 hover:bg-slate-100 flex items-center gap-x-2"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                            {t('views.projects.editName')}
                                        </button>
                                    </li>
                                    <li>
                                        <button
                                            onClick={handleDeleteColumn}
                                            disabled={orders.length > 0}
                                            className="w-full text-left rtl:text-right px-4 py-2 text-red-600 hover:bg-red-50 disabled:text-red-300 disabled:bg-transparent disabled:cursor-not-allowed flex items-center gap-x-2"
                                        >
                                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                            {t('buttons.delete')}
                                        </button>
                                    </li>
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </div>
             <div className="flex items-center justify-start mb-2 text-xs text-slate-600 px-3">
                <span className="font-semibold me-2">{t('common.sortBy.label')}:</span>
                <div className="flex items-center bg-slate-300/70 rounded-full p-0.5">
                    <button onClick={() => setSortBy('date')} className={`px-2 py-0.5 rounded-full ${sortBy === 'date' ? 'bg-white text-indigo-600' : 'hover:bg-white/50'}`}>{t('common.sortBy.date')}</button>
                    <button onClick={() => setSortBy('supplier')} className={`px-2 py-0.5 rounded-full ${sortBy === 'supplier' ? 'bg-white text-indigo-600' : 'hover:bg-white/50'}`}>{t('common.sortBy.supplier')}</button>
                    <button onClick={() => setSortBy('value')} className={`px-2 py-0.5 rounded-full ${sortBy === 'value' ? 'bg-white text-indigo-600' : 'hover:bg-white/50'}`}>{t('common.sortBy.value')}</button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 pt-0 space-y-3">
                {orders.length === 0 && notes.length === 0 && (
                    <div className="h-full flex items-center justify-center text-center text-slate-400 border-2 border-dashed border-slate-300 rounded-lg p-4">
                        {t('kanban.dropCardHere')}
                    </div>
                )}
                {sortedNotes.map(note => (
                    <StickyNoteCard 
                        key={note.id} 
                        note={note} 
                        onUpdate={onUpdateStickyNote}
                        onDelete={onDeleteStickyNote}
                        onView={onOpenNoteDetail}
                        onNoteDragStart={(e) => handleNoteDragStart(note.id, e)}
                        onNoteDragEnd={handleNoteDragEnd}
                        onNoteDrop={(e) => handleNoteDropOnCard(note.id, e)}
                        onNoteDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (draggedNoteId && draggedNoteId !== note.id) {
                                setDragOverNoteId(note.id);
                            }
                        }}
                        onNoteDragLeave={() => {
                            if (dragOverNoteId === note.id) {
                                setDragOverNoteId(null);
                            }
                        }}
                        isBeingDragged={draggedNoteId === note.id}
                        isDragOver={dragOverNoteId === note.id}
                    />
                ))}
                {sortedOrders.map(order => (
                    <div 
                        key={order.id}
                        className={`transition-transform duration-300 ${newlyDroppedOrderId === order.id ? 'animate-drop-in' : ''}`}
                    >
                        <KanbanCard
                            order={order}
                            onCardClick={onCardClick}
                            isFinalColumn={status.isSystem}
                            onArchiveOrder={onArchiveOrder}
                            updateOrder={updateOrder}
                            templates={templates}
                            onNewTemplateClick={onNewTemplateClick}
                            onSetReminder={(item, type) => onSetReminder(item as Order, type as 'order')}
                        />
                    </div>
                ))}
            </div>
             <div className="p-3 pt-1">
                <button onClick={() => onNewOrderInStatus(status.name)} className="w-full text-sm text-slate-500 hover:text-indigo-600 font-semibold p-2 rounded hover:bg-slate-300 transition-colors">
                    {t('kanban.addOrder')}
                </button>
            </div>
        </div>
    );
};
export default KanbanColumn;
