/**
 * Time for the mock, always in Asia/Dhaka (UTC+6 all year, no daylight saving). Timestamps are written with the
 * `+06:00` offset, so they compare as strings and the appDate pipe shows them unchanged.
 */
const DHAKA_OFFSET_MIN = 6 * 60;

export interface DhakaNow {
    date: string;
    time: string;
    /** 0 = Sunday … 6 = Saturday. */
    weekday: number;
    minutes: number;
    iso: string;
}

export function dhakaNow(at: Date = new Date()): DhakaNow {
    const local = new Date(at.getTime() + DHAKA_OFFSET_MIN * 60_000);
    const date = local.toISOString().slice(0, 10);
    const time = local.toISOString().slice(11, 16);
    return {
        date,
        time,
        weekday: local.getUTCDay(),
        minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
        iso: `${date}T${local.toISOString().slice(11, 19)}+06:00`
    };
}

/** `2026-11-15` + n days. */
export function addDaysIso(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** A Dhaka timestamp for a date and minute of the day. */
export function at(date: string, minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+06:00`;
}

export function dateOf(iso: string): string {
    return iso.slice(0, 10);
}

export function timeOf(iso: string): string {
    return iso.slice(11, 16);
}

/** The Saturday that starts the week of `date` (weeks run Saturday to Friday in Bangladesh). */
export function weekStart(date: string): string {
    return addDaysIso(date, -((weekdayOf(date) + 1) % 7));
}
