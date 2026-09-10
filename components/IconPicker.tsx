
import React from 'react';

interface IconPickerProps {
    selectedIcon: string;
    onSelect: (icon: string) => void;
}

const icons = [
    '📝', '📅', '💡', '🛒', '✈️', '🏠', '💼', '🎓', '💰', '❤️',
    '⭐', '🚩', '🔥', '✅', '📦', '🛠️', '🎉', '🔔', '📌', '📎'
];

const IconPicker: React.FC<IconPickerProps> = ({ selectedIcon, onSelect }) => {
    return (
        <div className="grid grid-cols-5 gap-2 p-2 bg-slate-50 rounded-md border border-slate-200">
            {icons.map((icon) => (
                <button
                    key={icon}
                    type="button"
                    onClick={() => onSelect(icon)}
                    className={`w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-slate-200 transition-colors ${
                        selectedIcon === icon ? 'bg-indigo-100 ring-2 ring-indigo-500' : ''
                    }`}
                >
                    {icon}
                </button>
            ))}
        </div>
    );
};

export default IconPicker;
