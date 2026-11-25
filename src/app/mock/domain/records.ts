/**
 * A copy of the API's personal records and progress (fitmanager-api src/features/training/records.ts), so the
 * demo computes the same numbers. Keep the two in step.
 */
import type { Measure } from '@core/models/training.model';

export interface LoggedSet {
    exercise_oid: string;
    exercise_name: string;
    measure: Measure;
    performed_on: string;
    weight_kg: number | null;
    reps: number | null;
    seconds: number | null;
    distance_m: number | null;
}

/** Estimated one-rep max (Epley): w × (1 + r/30); a single is the weight itself. Above 12 reps it is not trusted. */
export function epley(weightKg: number, reps: number): number | null {
    if (reps < 1 || reps > 12 || weightKg <= 0) return null;
    return round(reps === 1 ? weightKg : weightKg * (1 + reps / 30), 1);
}

export function round(n: number, places = 1): number {
    const f = 10 ** places;
    return Math.round(n * f) / f;
}

export interface ExerciseRecord {
    exercise_oid: string;
    name: string;
    measure: Measure;
    /** weight_reps: the heaviest set, and the reps done with it. */
    heaviest_kg: number | null;
    heaviest_reps: number | null;
    best_e1rm_kg: number | null;
    /** reps and weight_reps: most reps in one set. */
    most_reps: number | null;
    /** time and distance_time. */
    longest_seconds: number | null;
    /** distance_time. */
    longest_distance_m: number | null;
    /** The day of the main record (e1RM, reps, time or distance). */
    best_on: string;
    /** Days the exercise was done on. */
    days: number;
    last_on: string;
}

/** The main number of one set, per measure: e1RM, reps, seconds or metres. */
export function setValue(s: Pick<LoggedSet, 'measure' | 'weight_kg' | 'reps' | 'seconds' | 'distance_m'>): number | null {
    switch (s.measure) {
        case 'weight_reps':
            return s.weight_kg !== null && s.reps !== null ? epley(s.weight_kg, s.reps) : null;
        case 'reps':
            return s.reps;
        case 'time':
            return s.seconds;
        case 'distance_time':
            return s.distance_m;
    }
}

const max = (a: number | null, b: number | null): number | null => (b === null ? a : a === null || b > a ? b : a);

/** One record row per exercise done, the most recently done first. */
export function personalRecords(sets: readonly LoggedSet[]): ExerciseRecord[] {
    const by = new Map<string, LoggedSet[]>();
    for (const s of sets) by.set(s.exercise_oid, [...(by.get(s.exercise_oid) ?? []), s]);
    const out: ExerciseRecord[] = [];
    for (const [oid, list] of by) {
        const first = list[0];
        if (!first) continue;
        const r: ExerciseRecord = {
            exercise_oid: oid,
            name: first.exercise_name,
            measure: first.measure,
            heaviest_kg: null,
            heaviest_reps: null,
            best_e1rm_kg: null,
            most_reps: null,
            longest_seconds: null,
            longest_distance_m: null,
            best_on: first.performed_on,
            days: new Set(list.map(s => s.performed_on)).size,
            last_on: list.reduce((d, s) => (s.performed_on > d ? s.performed_on : d), first.performed_on)
        };
        let best: number | null = null;
        // Oldest first, so the day of a record is the first day it was reached.
        for (const s of [...list].sort((a, b) => a.performed_on.localeCompare(b.performed_on))) {
            if (
                s.weight_kg !== null &&
                (r.heaviest_kg === null || s.weight_kg > r.heaviest_kg || (s.weight_kg === r.heaviest_kg && (s.reps ?? 0) > (r.heaviest_reps ?? 0)))
            ) {
                r.heaviest_kg = s.weight_kg;
                r.heaviest_reps = s.reps;
            }
            if (s.measure === 'weight_reps' && s.weight_kg !== null && s.reps !== null) r.best_e1rm_kg = max(r.best_e1rm_kg, epley(s.weight_kg, s.reps));
            if (s.reps !== null) r.most_reps = max(r.most_reps, s.reps);
            r.longest_seconds = max(r.longest_seconds, s.seconds);
            r.longest_distance_m = max(r.longest_distance_m, s.distance_m);
            const value = setValue(s);
            if (value !== null && (best === null || value > best)) {
                best = value;
                r.best_on = s.performed_on;
            }
        }
        out.push(r);
    }
    return out.sort((a, b) => b.last_on.localeCompare(a.last_on) || a.name.localeCompare(b.name));
}

export interface Series {
    exercise_oid: string;
    name: string;
    measure: Measure;
    /** The best set's main number on each day it was done, oldest first. */
    points: { date: string; value: number }[];
}

/** A line per exercise for the progress charts: the exercises done on at least 2 days, the most done first. */
export function progressSeries(sets: readonly LoggedSet[], limit = 8): Series[] {
    const by = new Map<string, { name: string; measure: Measure; days: Map<string, number> }>();
    for (const s of sets) {
        const value = setValue(s);
        if (value === null) continue;
        const entry = by.get(s.exercise_oid) ?? { name: s.exercise_name, measure: s.measure, days: new Map<string, number>() };
        entry.days.set(s.performed_on, Math.max(entry.days.get(s.performed_on) ?? value, value));
        by.set(s.exercise_oid, entry);
    }
    return [...by.entries()]
        .filter(([, e]) => e.days.size >= 2)
        .sort((a, b) => b[1].days.size - a[1].days.size || a[1].name.localeCompare(b[1].name))
        .slice(0, limit)
        .map(([oid, e]) => ({
            exercise_oid: oid,
            name: e.name,
            measure: e.measure,
            points: [...e.days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }))
        }));
}

/** Total kilograms lifted (weight × reps) in a list of sets. */
export function volumeKg(sets: readonly Pick<LoggedSet, 'weight_kg' | 'reps'>[]): number {
    return round(
        sets.reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0),
        0
    );
}

/** BMI from kilograms and centimetres, one decimal. */
export function bmi(weightKg: number | null, heightCm: number | null): number | null {
    if (weightKg === null || heightCm === null || heightCm <= 0) return null;
    return round(weightKg / (heightCm / 100) ** 2, 1);
}

/** The fields a set of this measure needs, or the first problem. */
export function checkSet(
    measure: Measure,
    s: { weight_kg?: number | null; reps?: number | null; seconds?: number | null; distance_m?: number | null }
): string | null {
    const has = (x: number | null | undefined): boolean => x !== null && x !== undefined;
    const need: Record<Measure, ('weight_kg' | 'reps' | 'seconds' | 'distance_m')[]> = {
        weight_reps: ['weight_kg', 'reps'],
        reps: ['reps'],
        time: ['seconds'],
        distance_time: ['distance_m', 'seconds']
    };
    const labels = { weight_kg: 'the weight', reps: 'the reps', seconds: 'the time', distance_m: 'the distance' };
    for (const f of need[measure]) if (!has(s[f])) return `Enter ${labels[f]}`;
    for (const f of ['weight_kg', 'reps', 'seconds', 'distance_m'] as const)
        if (!need[measure].includes(f) && has(s[f])) return `This exercise has no ${labels[f].slice(4)}`;
    return null;
}
