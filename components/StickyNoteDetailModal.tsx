

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarStickyNote, StickyNote } from '../types';
import { useModals } from '../contexts/ModalContext';

interface StickyNoteDetailModalProps {
    isOpen: boolean;
    note: CalendarStickyNote | StickyNote | null;
    onClose: () => void;
}

const StickyNoteDetailModal: React.FC<StickyNoteDetailModalProps> = ({ isOpen, note, onClose }) => {
    const { t } = useTranslation();
    const { addToast } = useModals();
    const [zoomLevel, setZoomLevel] = useState(1); // 1 = 1rem = 16px

    if (!isOpen || !note) {
        return null;
    }

    const handleZoom = (direction: 'in' | 'out') => {
        const step = 0.1;
        if (direction === 'in') {
            setZoomLevel(prev => Math.min(prev + step, 2.5)); // Max 2.5rem
        } else {
            setZoomLevel(prev => Math.max(prev - step, 0.7)); // Min 0.7rem
        }
    };
    
    // Check if content looks like HTML (has tags) or just plain text
    // A simple heuristic: if it contains '<' and '>' it might be HTML.
    // RichTextEditor saves HTML, so we should trust it for new notes.
    // For legacy plain text notes, we can wrap them.
    const renderContent = () => {
        const isHtml = /<[a-z][\s\S]*>/i.test(note.content);
        
        if (isHtml) {
             return (
                <div 
                    className="rich-text whitespace-pre-wrap break-words"
                    dangerouslySetInnerHTML={{ __html: note.content }}
                />
             );
        }

        // Fallback for legacy plain text notes
        return note.content.split('\n').map((p, index) => (
             <p key={index} className="mb-2 whitespace-pre-wrap">{p || <br />}</p>
        ));
    };
    
    const handleCopy = () => {
        // Strip HTML tags for clipboard copy if needed, or copy as rich text
        // For simplicity, we'll try to extract text content
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = note.content;
        const textContent = tempDiv.textContent || tempDiv.innerText || "";
        
        navigator.clipboard.writeText(textContent).then(() => {
            addToast(t('toasts.clipboard.copied'), 'success');
        }).catch(err => {
            console.error('Failed to copy: ', err);
             addToast(t('toasts.clipboard.copyError'), 'error');
        });
    };


    return (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" 
                onClick={e => e.stopPropagation()}
            >
                <header className="p-4 border-b border-slate-200 flex-shrink-0 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">Note Details</h2>
                    <button onClick={onClose} className="p-2 rounded-full text-slate-500 hover:bg-slate-100">&times;</button>
                </header>
                <main 
                    className="flex-1 overflow-y-auto p-6" 
                    style={{ backgroundColor: note.color, fontSize: `${zoomLevel}rem` }}
                >
                    {renderContent()}
                </main>
                <footer className="p-3 bg-slate-50 rounded-b-xl flex-shrink-0 flex justify-between items-center">
                    <div className="flex items-center gap-x-2">
                        <button onClick={handleCopy} className="text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                            </svg>
                            Copy Text
                        </button>
                    </div>
                    <div className="flex items-center gap-x-4">
                        <button onClick={() => handleZoom('out')} className="p-2 rounded-full hover:bg-slate-200 text-slate-600" title="Zoom out">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                               <path fillRule="evenodd" d="M8 3a5 5 0 100 10 5 5 0 000-10zM2 8a8 8 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A8 8 0 012 8zm5 0a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <span className="font-mono text-sm text-slate-700 w-12 text-center select-none">
                            {Math.round(zoomLevel * 100)}%
                        </span>
                        <button onClick={() => handleZoom('in')} className="p-2 rounded-full hover:bg-slate-200 text-slate-600" title="Zoom in">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                               <path fillRule="evenodd" d="M8 3a5 5 0 100 10 5 5 0 000-10zM2 8a8 8 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A8 8 0 012 8zm3 4a1 1 0 112 0v-1h1a1 1 0 110-2H9V8a1 1 0 112 0v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1H8z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default StickyNoteDetailModal;
