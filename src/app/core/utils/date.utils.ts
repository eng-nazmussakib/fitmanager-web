import { TZDate } from '@date-fns/tz';
import { format, isValid, parseISO } from 'date-fns';

import { APP } from '@core/constants/app.constants';

/**
 * Dates use date-fns + @date-fns/tz, which replace moment / moment-timezone.
 * moment is in maintenance mode, mutable and not tree-shakeable (~300 kB with timezones).
 * date-fns is pure functions, so only the functions you import end up in the bundle.
 * OMS had already started moving to it.
 */
export type DateInput = Date | string | number | null | undefined;

export function toDate(value: DateInput): Date | null {
    if (value === null || value === undefined || value === '') return null;
    const d = typeof value === 'string' ? parseISO(value) : new Date(value);
    return isValid(d) ? d : null;
}

/** Formats in Asia/Dhaka regardless of the browser's time zone. */
export function formatDate(value: DateInput, pattern = 'dd MMM yyyy', timeZone: string = APP.TIME_ZONE): string {
    const d = toDate(value);
    if (!d) return '';
    return format(new TZDate(d, timeZone), pattern);
}

/** Wire format the backends expect for date-only fields. */
export function toApiDate(value: DateInput): string | null {
    const d = toDate(value);
    return d ? format(new TZDate(d, APP.TIME_ZONE), 'yyyy-MM-dd') : null;
}
