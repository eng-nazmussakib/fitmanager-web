/**
 * Pure time rules for scheduling: opening hours, overlaps and free PT slots. No database, no clock: the
 * services pass times in. Times of day are `HH:mm` strings in Dhaka (they sort as text); weekdays are 0 = Sunday
 * … 6 = Saturday, as in the branch profile. Ported to the web mock unchanged (mock/domain/hours.ts).
 */
export interface OpeningHours {
    days: number[];
    open: string;
    close: string;
}

/** `07:30` → 450. */
export const minutesOf = (hhmm: string): number => {
    const [h = 0, m = 0] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

/** 450 → `07:30`. */
export const hhmm = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** `start` + `minutes` on the same day, or null when it runs past midnight. */
export function endOf(start: string, minutes: number): string | null {
    const end = minutesOf(start) + minutes;
    return end > 24 * 60 ? null : hhmm(end);
}

/** True when [start, end) on `weekday` lies inside one opening window of the branch. */
export function withinHours(hours: readonly OpeningHours[], weekday: number, start: string, end: string): boolean {
    return hours.some(h => h.days.includes(weekday) && h.open <= start && end <= h.close);
}

/** The first weekday of `weekdays` on which [start, end) falls outside the hours, or null when all fit. */
export function firstClosedDay(hours: readonly OpeningHours[], weekdays: readonly number[], start: string, end: string): number | null {
    return weekdays.find(d => !withinHours(hours, d, start, end)) ?? null;
}

/** Half-open intervals [a1, a2) and [b1, b2) overlap. Works for `HH:mm` strings and for ISO instants alike. */
export const overlaps = (a1: string, a2: string, b1: string, b2: string): boolean => a1 < b2 && b1 < a2;

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface Window {
    start: string;
    end: string;
}

/**
 * Free PT slots on one day: `length`-minute slots on the half hour, inside the trainer's availability AND the
 * branch's hours, that clash with nothing in `busy` (their classes and PT sessions that day), and start after
 * `notBefore` (now, on today's date). Sorted, no duplicates.
 */
export function freeSlots(input: {
    availability: readonly Window[];
    hours: readonly OpeningHours[];
    weekday: number;
    busy: readonly Window[];
    length: number;
    notBefore?: string | null;
}): string[] {
    const out = new Set<string>();
    for (const a of input.availability) {
        for (let t = Math.ceil(minutesOf(a.start) / 30) * 30; t + input.length <= minutesOf(a.end); t += 30) {
            const start = hhmm(t);
            const end = hhmm(t + input.length);
            if (input.notBefore && start <= input.notBefore) continue;
            if (!withinHours(input.hours, input.weekday, start, end)) continue;
            if (input.busy.some(b => overlaps(start, end, b.start, b.end))) continue;
            out.add(start);
        }
    }
    return [...out].sort();
}

/** True when a slot of `length` minutes at `start` is one of the trainer's free slots (the booking check). */
export function isFreeSlot(input: Parameters<typeof freeSlots>[0] & { start: string }): boolean {
    return freeSlots({ ...input, notBefore: null }).includes(input.start) && (!input.notBefore || input.start > input.notBefore);
}
