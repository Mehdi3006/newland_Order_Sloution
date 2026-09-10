import React from 'react';
import { useTranslation } from 'react-i18next';

interface SidebarTogglerProps {
    isSidebarOpen: boolean;
    sidebarPosition: 'left' | 'right';
    toggleSidebar: () => void;
    toggleSidebarPosition: () => void;
}

const TogglerButton: React.FC<{ onClick: () => void; title: string; children: React.ReactNode }> = ({ onClick, title, children }) => (
  <button onClick={onClick} title={title} className="p-2 rounded-md text-slate-500 hover:bg-slate-200 hover:text-indigo-600 transition-colors">
    {children}
  </button>
);

const SidebarToggler: React.FC<SidebarTogglerProps> = ({ isSidebarOpen, sidebarPosition, toggleSidebar, toggleSidebarPosition }) => {
    const { t } = useTranslation();

    const positionClasses = sidebarPosition === 'left'
        ? isSidebarOpen ? 'left-64' : 'left-0'
        : isSidebarOpen ? 'right-64' : 'right-0';
    
    // This makes the component sit on the edge. If sidebar is on the right, we move the component left by its own width.
    const transformClass = sidebarPosition === 'right' ? '-translate-x-full' : '';
    const roundedClass = sidebarPosition === 'left' ? 'rounded-e-lg' : 'rounded-s-lg';
    const borderClass = sidebarPosition === 'left' ? 'border-r' : 'border-l';

    const ChevronLeftIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
    );

    const ChevronRightIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
    );

    const ToggleIcon = () => {
        if (sidebarPosition === 'left') {
            return isSidebarOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />;
        } else { // position === 'right'
            return isSidebarOpen ? <ChevronRightIcon /> : <ChevronLeftIcon />;
        }
    };

    return (
        <div className={`fixed top-16 ${positionClasses} z-40 transition-all duration-300 ease-in-out transform ${transformClass}`}>
            <div className={`flex flex-col gap-1 p-1 bg-white/80 backdrop-blur-sm shadow-lg border-y ${borderClass} border-slate-200 ${roundedClass}`}>
                <TogglerButton onClick={toggleSidebar} title={t('header.toggleSidebar')}>
                    <ToggleIcon />
                </TogglerButton>
                <TogglerButton onClick={toggleSidebarPosition} title={t('header.toggleSidebarPosition')}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h18m-7.5-12L21 9m0 0l-7.5 7.5M21 9H3" />
                    </svg>
                </TogglerButton>
            </div>
        </div>
    );
};

export default SidebarToggler;