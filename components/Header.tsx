import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CurrencyRates, CostingSettings } from '../types';
import CurrencyEditor from './CurrencyEditor';
import jalaali from 'jalaali-js';

const Clock: React.FC<{ time: Date }> = ({ time }) => {
    const { t, i18n } = useTranslation();

    const date = useMemo(() => {
        if (i18n.language === 'fa') {
            const jd = jalaali.toJalaali(time);
            const dayOfWeek = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).format(time).replace('،', '');
            const day = new Intl.DateTimeFormat('fa-IR', { day: 'numeric' }).format(time);
            const month = t(`months.jalali.${jd.jm}`);
            return `${dayOfWeek} ${day} ${month}`;
        } else {
            const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
            return new Intl.DateTimeFormat('en-US', options).format(time);
        }
    }, [time, i18n.language, t]);

    const formattedTime = useMemo(() => {
        return time.toLocaleTimeString(i18n.language === 'fa' ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    }, [time, i18n.language]);

    return (
        <div className="text-center">
            <div className="text-sm font-semibold text-slate-700">{date}</div>
            <div className="text-2xl font-bold text-slate-800 tracking-wider">{formattedTime}</div>
        </div>
    );
};

interface HeaderProps {
    rates: CurrencyRates;
    costingSettings: CostingSettings | null;
    setAedToTomanRate: (newRate: number) => void;
    setUsdAedRate: (newRate: number) => void;
    setAedCnyRate: (newRate: number) => void;
    onHelpClick: () => void;
    onCalculatorClick: () => void;
    isSidebarOpen: boolean;
    sidebarPosition: 'left' | 'right';
}

const LanguageSwitcher: React.FC = () => {
    const { i18n } = useTranslation();
    const currentLang = i18n.language;

    const changeLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
        document.documentElement.lang = lang;
        document.documentElement.dir = i18n.dir(lang);
    };

    return (
        <div className="flex items-center bg-slate-200 rounded-full p-1 text-sm font-medium">
            <button onClick={() => changeLanguage('en')} className={`px-3 py-1 rounded-full ${currentLang.startsWith('en') ? 'bg-white text-indigo-600' : 'text-slate-600'}`}>EN</button>
            <button onClick={() => changeLanguage('fa')} className={`px-3 py-1 rounded-full ${currentLang === 'fa' ? 'bg-white text-indigo-600' : 'text-slate-600'}`}>FA</button>
        </div>
    );
};


const Header: React.FC<HeaderProps> = ({ 
    rates, costingSettings, setAedToTomanRate, setUsdAedRate, setAedCnyRate, onHelpClick, onCalculatorClick,
    isSidebarOpen, sidebarPosition,
}) => {
    const { t } = useTranslation();
    const [currentTime, setCurrentTime] = useState(new Date());

    // World Clock State
    const [worldClockTimezone, setWorldClockTimezone] = useState('Asia/Shanghai');
    const [isTimezonePickerOpen, setIsTimezonePickerOpen] = useState(false);
    const timezonePickerRef = useRef<HTMLDivElement>(null);

    const timezones = [
        { value: 'Asia/Shanghai', label: 'Beijing (China)' },
        { value: 'Asia/Dubai', label: 'Dubai (UAE)' },
        { value: 'Europe/Istanbul', label: 'Istanbul (Turkey)' },
        { value: 'Asia/Tehran', label: 'Tehran (Iran)' },
        { value: 'Europe/London', label: 'London (UK)' },
        { value: 'America/New_York', label: 'New York (USA)' },
        { value: 'Europe/Paris', label: 'Paris (France)' },
        { value: 'Asia/Tokyo', label: 'Tokyo (Japan)' },
    ];

    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);

    // World Clock Effects for persistence and outside click
    useEffect(() => {
        const savedTimezone = localStorage.getItem('worldClockTimezone');
        if (savedTimezone && timezones.some(tz => tz.value === savedTimezone)) {
            setWorldClockTimezone(savedTimezone);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('worldClockTimezone', worldClockTimezone);
    }, [worldClockTimezone]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (timezonePickerRef.current && !timezonePickerRef.current.contains(event.target as Node)) {
                setIsTimezonePickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const worldTime = useMemo(() => {
        try {
            return currentTime.toLocaleTimeString('en-US', {
                timeZone: worldClockTimezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            });
        } catch (e) {
            console.error("Invalid timezone for world clock:", worldClockTimezone);
            return '--:--';
        }
    }, [currentTime, worldClockTimezone]);

    const timezoneLabel = useMemo(() => {
        const selected = timezones.find(tz => tz.value === worldClockTimezone);
        return selected ? selected.label.split('(')[0].trim() : worldClockTimezone.split('/')[1].replace('_', ' ');
    }, [worldClockTimezone, timezones]);

    let headerPositionClasses = 'fixed top-0 z-30 ';
    if (sidebarPosition === 'left') {
        headerPositionClasses += isSidebarOpen ? 'left-64 right-0' : 'left-20 right-0';
    } else { // sidebar on right
        headerPositionClasses += isSidebarOpen ? 'right-64 left-0' : 'right-20 left-0';
    }
    
    const tomanDivisorLabel = useMemo(() => {
        if (!costingSettings) return null;
        const divisor = costingSettings.rounding.tomanDisplayDivisor;
        if (divisor === 1) return null;

        let label = '';
        if (divisor === 1000) label = '1000';
        else if (divisor === 10000) label = '10k';
        else if (divisor === 1000000) label = '1M';
        else label = `${divisor}`;
        
        return `IR Tx${label}`;
    }, [costingSettings]);


    return (
        <header className={`bg-white shadow-sm border-b border-slate-200 transition-all duration-300 ${headerPositionClasses}`}>
            <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-x-4">
                        <Clock time={currentTime} />
                        <div className="h-10 w-px bg-slate-300"></div>
                        <div className="flex items-center gap-x-2">
                            <div className="text-center">
                                <div className="text-sm font-semibold text-slate-700 font-mono" dir="ltr">{worldTime}</div>
                                <div className="text-xs text-slate-500">{timezoneLabel}</div>
                            </div>
                            <div className="relative">
                                <button onClick={() => setIsTimezonePickerOpen(p => !p)} className="p-1.5 rounded-full text-slate-500 hover:bg-slate-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                    </svg>
                                </button>
                                {isTimezonePickerOpen && (
                                    <div ref={timezonePickerRef} className="absolute top-full end-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-200 p-2 z-30">
                                        <label htmlFor="timezone-select" className="block text-sm font-medium text-slate-700 mb-1">Select Timezone</label>
                                        <select
                                            id="timezone-select"
                                            value={worldClockTimezone}
                                            onChange={e => {
                                                setWorldClockTimezone(e.target.value);
                                                setIsTimezonePickerOpen(false);
                                            }}
                                            className="w-full bg-white text-gray-900 border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-indigo-500"
                                        >
                                            {timezones.map(tz => (
                                                <option key={tz.value} value={tz.value}>{tz.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-x-2 sm:gap-x-4">
                        {tomanDivisorLabel && (
                            <div 
                                className="text-red-600 font-bold text-sm font-mono px-2"
                                title={`All Toman values are displayed divided by ${costingSettings?.rounding.tomanDisplayDivisor.toLocaleString()}`}
                            >
                                {tomanDivisorLabel}
                            </div>
                        )}
                        <CurrencyEditor 
                            rates={rates}
                            costingSettings={costingSettings}
                            setAedToTomanRate={setAedToTomanRate}
                            setUsdAedRate={setUsdAedRate}
                            setAedCnyRate={setAedCnyRate}
                        />
                        <LanguageSwitcher />
                        <button onClick={onCalculatorClick} className="p-2 rounded-full text-slate-500 hover:bg-slate-200" title={t('header.costCalculator')}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 2a1 1 0 00-1 1v2a1 1 0 001 1h6a1 1 0 001-1V5a1 1 0 00-1-1H7zM6 12a1 1 0 011-1h2a1 1 0 110 2H7a1 1 0 01-1-1zm5 1a1 1 0 100-2 1 1 0 000 2zM6 15a1 1 0 011-1h2a1 1 0 110 2H7a1 1 0 01-1-1zm5 1a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                        </button>
                         <button onClick={onHelpClick} className="p-2 rounded-full text-slate-500 hover:bg-slate-200" title={t('header.help')}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;