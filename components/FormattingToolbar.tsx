import React, { useMemo, useRef, useState, useEffect } from 'react';
import { CellStyle } from '../types';

type StyleChange = {
    bold?: 'toggle';
    italic?: 'toggle';
    underline?: 'toggle';
    align?: 'left' | 'center' | 'right';
    valign?: 'top' | 'middle' | 'bottom';
    bgColor?: string;
    textColor?: string;
    borders?: string;
    fontSize?: number;
    merge?: 'toggle';
};

interface FormattingToolbarProps {
  currentStyle: Partial<CellStyle>;
  onStyleChange: (change: StyleChange) => void;
}

const ToolbarButton: React.FC<{
    onClick: () => void;
    isActive?: boolean;
    title: string;
    children: React.ReactNode;
}> = ({ onClick, isActive, title, children }) => (
    <button
        type="button"
        onMouseDown={e => e.preventDefault()} // Prevent grid from losing focus
        onClick={onClick}
        className={`p-2 rounded hover:bg-slate-300 ${isActive ? 'bg-slate-300 text-indigo-700' : 'text-slate-600'}`}
        title={title}
        aria-pressed={isActive}
    >
        {children}
    </button>
);

const ColorPicker: React.FC<{
    value?: string;
    onChange: (color: string) => void;
    title: string;
    children: React.ReactNode;
}> = ({ value, onChange, title, children }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const displayColor = value || '#000000'; // Default to black for the picker if no value

    return (
        <div className="relative p-2 rounded hover:bg-slate-300" title={title}>
            <input
                ref={inputRef}
                type="color"
                value={displayColor}
                onChange={e => onChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            {children}
            <div
                className="absolute bottom-1 left-2 right-2 h-1 rounded-sm"
                style={{ backgroundColor: value || 'transparent' }}
            />
        </div>
    );
};


const FormattingToolbar: React.FC<FormattingToolbarProps> = ({ currentStyle, onStyleChange }) => {
    const [isBorderMenuOpen, setIsBorderMenuOpen] = useState(false);
    const borderMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isBorderMenuOpen && borderMenuRef.current && !borderMenuRef.current.contains(event.target as Node)) {
                setIsBorderMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isBorderMenuOpen]);

    const borderOptions = [
        { key: 'all', label: 'All Borders' },
        { key: 'outside', label: 'Outside Borders' },
        { key: 'bottom', label: 'Bottom Border' },
        { key: 'top', label: 'Top Border' },
        { key: 'left', label: 'Left Border' },
        { key: 'right', label: 'Right Border' },
        { key: 'none', label: 'No Border' },
    ];
    
    return (
        <div className="flex items-center gap-x-1 p-1 bg-slate-200 border-b border-slate-300 -mx-1" style={{ height: 44 }}>
            <ToolbarButton onClick={() => onStyleChange({ bold: 'toggle' })} isActive={currentStyle.bold} title="Bold (Ctrl+B)">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4.25-4H7v14h7.04c2.1 0 3.71-1.7 3.71-3.78 0-1.52-.86-2.82-2.15-3.43zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => onStyleChange({ italic: 'toggle' })} isActive={currentStyle.italic} title="Italic (Ctrl+I)">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => onStyleChange({ underline: 'toggle' })} isActive={currentStyle.underline} title="Underline (Ctrl+U)">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>
            </ToolbarButton>
            
            <div className="h-6 w-px bg-slate-300 mx-1"></div>
            
            <div className="relative" title="Font Size">
                <div className="flex items-center gap-x-1 p-2 rounded hover:bg-slate-300 text-slate-700 font-semibold text-sm cursor-pointer">
                    <span>{currentStyle.fontSize || 'Size'}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </div>
                <select
                    value={currentStyle.fontSize || ''}
                    onChange={(e) => { if (e.target.value) onStyleChange({ fontSize: parseInt(e.target.value, 10) }) }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                >
                    <option value="" disabled>Size</option>
                    {[8, 9, 10, 11, 12, 14, 16, 18, 24, 36].map(size => (
                        <option key={size} value={size}>{size}</option>
                    ))}
                </select>
            </div>

            <div className="h-6 w-px bg-slate-300 mx-1"></div>

            <ColorPicker value={currentStyle.bgColor} onChange={(c) => onStyleChange({ bgColor: c })} title="Background Color">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 1.5a8.25 8.25 0 100 16.5 8.25 8.25 0 000-16.5zm-3 7.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z"/></svg>
            </ColorPicker>
             <ColorPicker value={currentStyle.textColor} onChange={(c) => onStyleChange({ textColor: c })} title="Text Color">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>
            </ColorPicker>

            <div className="h-6 w-px bg-slate-300 mx-1"></div>
            
            <div ref={borderMenuRef} className="relative">
                <button
                    type="button"
                    onClick={() => setIsBorderMenuOpen(p => !p)}
                    className={`p-2 rounded hover:bg-slate-300 text-slate-600`}
                    title="Borders"
                >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3v18h18V3H3zm8 16H5v-6h6v6zm0-8H5V5h6v6zm8 8h-6v-6h6v6zm0-8h-6V5h6v6z"/></svg>
                </button>
                {isBorderMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 w-40 bg-white rounded-md shadow-lg border border-slate-200 z-50">
                        <ul className="p-1 text-sm text-slate-800">
                            {borderOptions.map(({ key, label }) => (
                                <li key={key}>
                                    <button
                                        onClick={() => { onStyleChange({ borders: key }); setIsBorderMenuOpen(false); }}
                                        className="w-full text-left px-3 py-2 hover:bg-slate-100 rounded"
                                    >
                                        {label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
            
            <ToolbarButton onClick={() => onStyleChange({ merge: 'toggle' })} title="Merge cells">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22 2v2H2V2h20zM2 22h20v-2H2v2zm5-6h10v-4H7v4zm-2-6V6h14v4H5z"/></svg>
            </ToolbarButton>

            <div className="h-6 w-px bg-slate-300 mx-1"></div>

            <ToolbarButton onClick={() => onStyleChange({ align: 'left' })} isActive={currentStyle.align === 'left'} title="Align Left">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => onStyleChange({ align: 'center' })} isActive={currentStyle.align === 'center'} title="Align Center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => onStyleChange({ align: 'right' })} isActive={currentStyle.align === 'right'} title="Align Right">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>
            </ToolbarButton>
            
            <div className="h-6 w-px bg-slate-300 mx-1"></div>
            
            <ToolbarButton onClick={() => onStyleChange({ valign: 'top' })} isActive={currentStyle.valign === 'top'} title="Align Top">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 11h3v10h2V11h3l-4-4-4 4zM4 3v2h16V3H4z"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => onStyleChange({ valign: 'middle' })} isActive={currentStyle.valign === 'middle' || !currentStyle.valign} title="Align Middle">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 15h3v4h2v-4h3l-4-4-4 4zM16 9h-3V5h-2v4H8l4 4 4-4z"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => onStyleChange({ valign: 'bottom' })} isActive={currentStyle.valign === 'bottom'} title="Align Bottom">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 13h3V3h2v10h3l-4 4-4-4zm-4 6v-2h16v2H4z"/></svg>
            </ToolbarButton>
        </div>
    );
};

export default FormattingToolbar;