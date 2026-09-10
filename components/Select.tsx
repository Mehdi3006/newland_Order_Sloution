import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    children: React.ReactNode;
    className?: string;
    wrapperClassName?: string;
}

const Select: React.FC<SelectProps> = ({ children, className, wrapperClassName = '', ...props }) => {
    const mergeClasses = (...classes: (string | undefined)[]) => {
        return classes.filter(Boolean).join(' ');
    };

    const hasColorClasses = className && (className.includes('bg-') || className.includes('text-'));

    const baseClasses = "w-full appearance-none border border-slate-300 rounded-md py-2 pl-3 pr-10 text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500";
    const defaultVisuals = !hasColorClasses ? "bg-white text-gray-900" : "";
    const defaultDisabled = "disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed";


    return (
        <div className={`relative w-full ${wrapperClassName}`}>
            <select
                {...props}
                className={mergeClasses(baseClasses, defaultVisuals, defaultDisabled, className)}
            >
                {children}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
            </div>
        </div>
    );
};

export default Select;