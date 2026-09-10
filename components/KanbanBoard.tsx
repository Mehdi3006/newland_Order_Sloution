import React, { useState, useRef } from 'react';
// FIX: Module '"file:///components/KanbanColumn"' has no default export.
import KanbanColumn from './KanbanColumn';
import { Order, Status, ChecklistTemplate, Task, StickyNote } from '../types';
import { useTranslation } from 'react-i18next';
import { persianArabicToEnglish } from '../utils/formatters';

interface KanbanBoardProps {
    orders: Order[];
    statuses: Status[];
    templates: ChecklistTemplate[];
    stickyNotes: StickyNote[];
    onOrderStatusChange: (orderId: string, newStatusName: string) => void;
    onCardClick: (order: Order) => void;
    onAddStatus: (name: string) => void;
    onUpdateStatusName: (id: string, newName: string) => void;
    onUpdateStatusesOrder: (reorderedStatuses: Status[]) => void;
    onDeleteStatus: (id: string) => void;
    onArchiveOrder: (orderId: string) => void;
    updateOrder: (orderId: string, updates: Partial<Order>) => void;
    onNewTemplateClick: () => void;
    onNewOrderInStatus: (statusName: string) => void;
    onSetReminder: (item: Order | Task, type: 'order' | 'task') => void;
    onAddStickyNote: (statusName: string) => void;
    onUpdateStickyNote: (noteId: string, updates: Partial<StickyNote>) => void;
    onDeleteStickyNote: (noteId: string) => void;
    onMoveStickyNote: (noteId: string, targetStatusName: string, targetIndex: number) => void;
    onOpenNoteDetail: (note: StickyNote) => void;
}

const AddColumnForm: React.FC<{ onAdd: (name: string) => void; onCancel: () => void; }> = ({ onAdd, onCancel }) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onAdd(name.trim());
        }
    };

    return (
        <div className="flex-shrink-0 w-80 p-2 bg-gray-100 rounded-lg">
            <form onSubmit={handleSubmit}>
                <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(persianArabicToEnglish(e.target.value))}
                    placeholder={t('kanban.newColumnPrompt')}
                    className="w-full border border-slate-400 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 placeholder:text-slate-500"
                />
                <div className="mt-2 flex items-center gap-x-2">
                    <button type="submit" className="bg-indigo-600 text-white px-3 py-1 rounded-md hover:bg-indigo-700 text-sm font-semibold">
                        {t('kanban.addColumn')}
                    </button>
                    <button type="button" onClick={onCancel} className="bg-transparent text-slate-600 px-3 py-1 rounded-md hover:bg-slate-300 text-sm">
                        {t('common.cancel')}
                    </button>
                </div>
            </form>
        </div>
    );
};

const KanbanBoard: React.FC<KanbanBoardProps> = ({ 
    orders, 
    statuses, 
    templates,
    stickyNotes,
    onOrderStatusChange, 
    onCardClick,
    onAddStatus,
    onUpdateStatusName,
    onUpdateStatusesOrder,
    onDeleteStatus,
    onArchiveOrder,
    updateOrder,
    onNewTemplateClick,
    onNewOrderInStatus,
    onSetReminder,
    onAddStickyNote,
    onUpdateStickyNote,
    onDeleteStickyNote,
    onMoveStickyNote,
    onOpenNoteDetail,
}) => {
    const { t } = useTranslation();
    const [draggedStatusId, setDraggedStatusId] = useState<string | null>(null);
    const [isAddingColumn, setIsAddingColumn] = useState(false);

    const handleAddColumn = (name: string) => {
        onAddStatus(name);
        setIsAddingColumn(false);
    };

    const handleColumnDragStart = (e: React.DragEvent<HTMLDivElement>, statusId: string) => {
        setDraggedStatusId(statusId);
        e.dataTransfer.effectAllowed = 'move';
        // setData is required for Firefox to initiate the drag operation
        e.dataTransfer.setData('text/plain', statusId);
    };
    
    const handleColumnDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleColumnDrop = (e: React.DragEvent<HTMLDivElement>, targetStatus: Status) => {
        if (!draggedStatusId || draggedStatusId === targetStatus.id) return;

        const draggedIndex = statuses.findIndex(s => s.id === draggedStatusId);
        const targetIndex = statuses.findIndex(s => s.id === targetStatus.id);
        
        if (draggedIndex === -1 || targetIndex === -1) return;

        const newStatuses = [...statuses];
        const [draggedItem] = newStatuses.splice(draggedIndex, 1);
        newStatuses.splice(targetIndex, 0, draggedItem);

        onUpdateStatusesOrder(newStatuses);
    };

    const handleColumnDragEnd = () => {
        setDraggedStatusId(null);
    };

    return (
        <div className="flex-1 overflow-x-auto h-full bg-gray-50">
            <div className="flex space-x-4 rtl:space-x-reverse h-full p-4" style={{minWidth: `${(statuses.length + 1) * 21}rem`}}>
                {statuses.map(status => {
                    const ordersInColumn = orders.filter(order => order.status === status.name);
                    const notesInColumn = stickyNotes.filter(note => note.statusName === status.name);
                    return (
                        <KanbanColumn
                            key={status.id}
                            status={status}
                            orders={ordersInColumn}
                            notes={notesInColumn}
                            templates={templates}
                            onOrderDrop={onOrderStatusChange}
                            onMoveStickyNote={onMoveStickyNote}
                            onCardClick={onCardClick}
                            onUpdateStatusName={onUpdateStatusName}
                            onDeleteStatus={onDeleteStatus}
                            onArchiveOrder={onArchiveOrder}
                            onColumnDragStart={(e) => handleColumnDragStart(e, status.id)}
                            onColumnDragOver={handleColumnDragOver}
                            onColumnDrop={(e) => handleColumnDrop(e, status)}
                            onColumnDragEnd={handleColumnDragEnd}
                            isBeingDragged={draggedStatusId === status.id}
                            updateOrder={updateOrder}
                            onNewTemplateClick={onNewTemplateClick}
                            onNewOrderInStatus={onNewOrderInStatus}
                            onSetReminder={onSetReminder}
                            onAddStickyNote={onAddStickyNote}
                            onUpdateStickyNote={onUpdateStickyNote}
                            onDeleteStickyNote={onDeleteStickyNote}
                            onOpenNoteDetail={onOpenNoteDetail}
                        />
                    );
                })}
                {isAddingColumn ? (
                    <AddColumnForm onAdd={handleAddColumn} onCancel={() => setIsAddingColumn(false)} />
                ) : (
                    <div className="flex-shrink-0 w-80">
                         <button 
                            onClick={() => setIsAddingColumn(true)}
                            className="w-full h-12 bg-gray-200/80 text-slate-600 font-semibold rounded-lg hover:bg-gray-300 hover:text-slate-800 transition-colors flex items-center justify-center"
                        >
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 me-2" viewBox="0 0 20 20" fill="currentColor">
                               <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                            {t('kanban.addColumn')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default KanbanBoard;
