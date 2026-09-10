
import jalaali from 'jalaali-js';

export interface Holiday {
    date: string; // YYYY-MM-DD
    name: string;
    country: 'CN' | 'IR';
}

const chinaFixedHolidays: Record<string, string> = {
    '01-01': 'New Year\'s Day',
    '05-01': 'Labor Day',
    '10-01': 'National Day',
    '10-02': 'National Day',
    '10-03': 'National Day',
};

const iranFixedHolidays: Record<string, string> = {
    '01-01': 'Nowruz',
    '01-02': 'Nowruz',
    '01-03': 'Nowruz',
    '01-04': 'Nowruz',
    '01-12': 'Islamic Republic Day',
    '01-13': 'Sizdah Be-dar',
    '11-22': 'Revolution Day',
};

export const getHolidaysForDate = (dateStr: string): Holiday[] => {
    const holidays: Holiday[] = [];
    const date = new Date(dateStr + 'T00:00:00Z');
    const mmdd = `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    
    // China
    if (chinaFixedHolidays[mmdd]) {
        holidays.push({ date: dateStr, name: chinaFixedHolidays[mmdd], country: 'CN' });
    }

    // Iran
    const { jy, jm, jd } = jalaali.toJalaali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    const jmmdd = `${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
    if (iranFixedHolidays[jmmdd]) {
        holidays.push({ date: dateStr, name: iranFixedHolidays[jmmdd], country: 'IR' });
    }

    return holidays;
};
