
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import jalaali from 'jalaali-js';

interface ClockProps {
    time: Date;
}

const Clock: React.FC<ClockProps> = ({ time }) => {
    const { i18n, t } = useTranslation();

    const formattedDateTime = useMemo(() => {
        const formatTime = (d: Date) => {
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        };

        if (i18n.language === 'fa') {
            const jd = jalaali.toJalaali(time.getFullYear(), time.getMonth() + 1, time.getDate());
            const dayOfWeek = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).format(time);
            const monthName = t(`months.jalali.${jd.jm}`);
            const day = new Intl.DateTimeFormat('fa-IR', { day: 'numeric' }).format(time);
            
            return `${dayOfWeek} ${day} ${monthName} ${formatTime(time)}`;
        } else {
            // Replicates "Thu Sep 11 01:28" format
            const dayOfWeek = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(time);
            const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(time);
            const day = time.getDate();
            return `${dayOfWeek} ${month} ${day} ${formatTime(time)}`;
        }
    }, [time, i18n.language, t]);

    return (
        <div className="text-sm font-semibold text-slate-700 font-mono" dir="ltr">
            {formattedDateTime}
        </div>
    );
};

export default Clock;
