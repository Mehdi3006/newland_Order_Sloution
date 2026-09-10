
import React, { useRef, useEffect, useState } from 'react';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    className?: string;
    placeholder?: string;
    toolbarClassName?: string;
    contentClassName?: string;
    simple?: boolean; // If true, hide toolbar until focused
    autoFocus?: boolean;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ 
    value, 
    onChange, 
    onBlur, 
    className = '', 
    placeholder,
    toolbarClassName = '',
    contentClassName = '',
    simple = false,
    autoFocus = false
}) => {
    const contentEditableRef = useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    // Initial load and sync if value changes externally significantly
    useEffect(() => {
        if (contentEditableRef.current && contentEditableRef.current.innerHTML !== value) {
             // Only update if not focused to avoid cursor jumping, or if empty
             if (document.activeElement !== contentEditableRef.current) {
                contentEditableRef.current.innerHTML = value || '';
             }
        }
    }, [value]);
    
    useEffect(() => {
        if (autoFocus && contentEditableRef.current) {
            contentEditableRef.current.focus();
        }
    }, [autoFocus]);

    const handleInput = () => {
        if (contentEditableRef.current) {
            onChange(contentEditableRef.current.innerHTML);
        }
    };

    const execCmd = (command: string, arg?: string) => {
        // Ensure focus is on the content editable before executing command
        if (contentEditableRef.current && document.activeElement !== contentEditableRef.current) {
            contentEditableRef.current.focus();
        }
        
        document.execCommand(command, false, arg);
        
        // Force update state after command execution
        if (contentEditableRef.current) {
            onChange(contentEditableRef.current.innerHTML);
        }
    };

    const preventDefault = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div className={`flex flex-col ${className}`}>
            {(!simple || isFocused) && (
                <div 
                    className={`flex items-center gap-1 p-1 border-b border-slate-200/50 mb-1 ${toolbarClassName}`} 
                    onMouseDown={preventDefault} // Prevent losing focus from content when clicking empty toolbar area
                >
                    <ToolbarButton onClick={() => execCmd('bold')} label="B" bold title="Bold (Ctrl+B)" />
                    <ToolbarButton onClick={() => execCmd('italic')} label="I" italic title="Italic (Ctrl+I)" />
                    <ToolbarButton onClick={() => execCmd('insertUnorderedList')} label="•" title="Bullet List" />
                    <ToolbarButton onClick={() => execCmd('insertOrderedList')} label="1." title="Numbered List" />
                </div>
            )}
            <div
                ref={contentEditableRef}
                className={`rich-text outline-none overflow-y-auto ${contentClassName} ${!value && !isFocused ? 'empty:before:content-[attr(data-placeholder)] empty:before:text-slate-500/70' : ''}`}
                contentEditable
                onInput={handleInput}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                    setIsFocused(false);
                    if (onBlur) onBlur();
                }}
                data-placeholder={placeholder}
                style={{ whiteSpace: 'pre-wrap', minHeight: '1.5em' }}
            />
        </div>
    );
};

const ToolbarButton: React.FC<{ onClick: () => void; label: string; bold?: boolean; italic?: boolean; title?: string }> = ({ onClick, label, bold, italic, title }) => (
    <button
        type="button"
        onMouseDown={(e) => { 
            e.preventDefault(); // Crucial: prevents the button from stealing focus
            e.stopPropagation(); 
        }}
        onClick={onClick}
        title={title}
        className={`w-6 h-6 flex items-center justify-center rounded hover:bg-black/10 text-slate-700 text-xs transition-colors ${bold ? 'font-bold' : ''} ${italic ? 'italic' : ''}`}
    >
        {label}
    </button>
);

export default RichTextEditor;
