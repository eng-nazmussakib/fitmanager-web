/**
 * Training (phase 4; D-084 to D-089): the exercise library, routines, workouts, personal records and body
 * measurements. The API's wire format (fitmanager-api src/features/training); the mock answers the same.
 */

export type ExerciseCategory = 'strength' | 'cardio' | 'mobility' | 'core' | 'plyometric';
/** How a set is recorded. */
export type Measure = 'weight_reps' | 'reps' | 'time' | 'distance_time';
export type Muscle =
    'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'core' | 'glutes' | 'quads' | 'hamstrings' | 'calves' | 'full_body' | 'cardio';
export type Equipment = 'barbell' | 'dumbbell' | 'kettlebell' | 'machine' | 'cable' | 'bodyweight' | 'band' | 'cardio_machine' | 'other';
export type Goal = 'strength' | 'muscle' | 'fat_loss' | 'endurance' | 'general';
export type Level = 'beginner' | 'intermediate' | 'advanced';

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
    strength: 'Strength',
    cardio: 'Cardio',
    mobility: 'Mobility',
    core: 'Core',
    plyometric: 'Power'
};
export const MEASURE_LABEL: Record<Measure, string> = {
    weight_reps: 'Weight × reps',
    reps: 'Reps',
    time: 'Time',
    distance_time: 'Distance and time'
};
export const MUSCLE_LABEL: Record<Muscle, string> = {
    chest: 'Chest',
    back: 'Back',
    shoulders: 'Shoulders',
    biceps: 'Biceps',
    triceps: 'Triceps',
    forearms: 'Forearms',
    core: 'Core',
    glutes: 'Glutes',
    quads: 'Quads',
    hamstrings: 'Hamstrings',
    calves: 'Calves',
    full_body: 'Full body',
    cardio: 'Heart and lungs'
};
export const EQUIPMENT_LABEL: Record<Equipment, string> = {
    barbell: 'Barbell',
    dumbbell: 'Dumbbells',
    kettlebell: 'Kettlebell',
    machine: 'Machine',
    cable: 'Cable',
    bodyweight: 'Bodyweight',
    band: 'Band',
    cardio_machine: 'Cardio machine',
    other: 'Other'
};
export const GOAL_LABEL: Record<Goal, string> = {
    strength: 'Strength',
    muscle: 'Muscle',
    fat_loss: 'Fat loss',
    endurance: 'Endurance',
    general: 'General fitness'
};
export const LEVEL_LABEL: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

export interface MediaLink {
    file_oid: string;
    url: string;
}

/** `GET /v1/exercises`: HQ's library (`scope: 'hq'`) and the branch's own. */
export interface Exercise {
    oid: string;
    branch_oid: string;
    scope: 'hq' | 'branch';
    name: string;
    category: ExerciseCategory;
    measure: Measure;
    /** The first is the main muscle. */
    muscles: Muscle[];
    equipment: Equipment;
    instructions: string | null;
    photos: MediaLink[];
    video: MediaLink | null;
    active: boolean;
    /** This branch (or HQ, at HQ) owns it. */
    editable: boolean;
}

export interface ExerciseInput {
    name?: string;
    category?: ExerciseCategory;
    measure?: Measure;
    muscles?: Muscle[];
    equipment?: Equipment;
    instructions?: string | null;
    photo_file_oids?: string[];
    video_file_oid?: string | null;
    active?: boolean;
}

/** One exercise of a routine day, with its targets (names copied when saved, D-087). */
export interface DayExercise {
    exercise_oid: string;
    name: string;
    measure: Measure;
    sets: number;
    reps: number | null;
    weight_kg: number | null;
    seconds: number | null;
    distance_m: number | null;
    rest_seconds: number;
    notes: string | null;
}

export interface RoutineDay {
    name: string;
    exercises: DayExercise[];
}

/** A template (`hq` or `branch`) or a member's copy (`member`). */
export interface Routine {
    oid: string;
    scope: 'hq' | 'branch' | 'member';
    name: string;
    goal: Goal;
    level: Level;
    description: string | null;
    days: RoutineDay[];
    exercise_count: number;
    trainer_oid: string | null;
    trainer_name: string | null;
    active: boolean;
    editable: boolean;
    member_oid: string | null;
    source_oid: string | null;
    source_name: string | null;
    assigned_by: 'trainer' | 'staff' | 'member' | null;
    started_on: string | null;
    ended_on: string | null;
    /** A running copy: the day to do next (after the last one logged), and when that was. */
    next_day: number | null;
    last_workout_on: string | null;
}

export type DayExerciseInput = Pick<DayExercise, 'exercise_oid' | 'sets' | 'reps' | 'weight_kg' | 'seconds' | 'distance_m' | 'rest_seconds' | 'notes'>;

export interface RoutineInput {
    name?: string;
    goal?: Goal;
    level?: Level;
    description?: string | null;
    days?: { name: string; exercises: DayExerciseInput[] }[];
    active?: boolean;
}

/** `GET /v1/members/:oid/routine`, `GET /v1/me/routine`. */
export interface MemberRoutine {
    current: Routine | null;
    history: Routine[];
}

export interface WorkoutSet {
    set_no?: number;
    weight_kg: number | null;
    reps: number | null;
    seconds: number | null;
    distance_m: number | null;
}

export interface Workout {
    oid: string;
    member_oid: string;
    routine_oid: string | null;
    day_index: number | null;
    day_name: string | null;
    performed_on: string;
    minutes: number | null;
    notes: string | null;
    source: 'member' | 'trainer' | 'desk';
    logged_by_name: string | null;
    set_count: number;
    volume_kg: number;
    /** Within 7 days of its date (D-088). */
    editable: boolean;
    exercises: { exercise_oid: string; name: string; measure: Measure; sets: WorkoutSet[] }[];
}

export interface WorkoutInput {
    performed_on?: string;
    minutes?: number | null;
    notes?: string | null;
    day_index?: number | null;
    exercises?: { exercise_oid: string; sets: WorkoutSet[] }[];
}

export interface ExerciseRecord {
    exercise_oid: string;
    name: string;
    measure: Measure;
    heaviest_kg: number | null;
    heaviest_reps: number | null;
    best_e1rm_kg: number | null;
    most_reps: number | null;
    longest_seconds: number | null;
    longest_distance_m: number | null;
    best_on: string;
    days: number;
    last_on: string;
}

export interface ProgressSeries {
    exercise_oid: string;
    name: string;
    measure: Measure;
    points: { date: string; value: number }[];
}

/** `GET /v1/members/:oid/progress`, `GET /v1/me/progress` (D-088): computed when read. */
export interface TrainingProgress {
    records: ExerciseRecord[];
    series: ProgressSeries[];
    weekly: { week: string; workouts: number }[];
    totals: { workouts: number; this_month: number; first_on: string | null; volume_kg: number };
}

export type PhotoView = 'front' | 'side' | 'back';

/** One entry (D-089). Photos are `null` for a caller who may not see them (`photos_hidden`). */
export interface Measurement {
    oid: string;
    measured_on: string;
    weight_kg: number | null;
    body_fat_pct: number | null;
    waist_cm: number | null;
    chest_cm: number | null;
    hips_cm: number | null;
    arm_cm: number | null;
    thigh_cm: number | null;
    bmi: number | null;
    photos: Record<PhotoView, string | null>;
    photo_count: number;
    photos_hidden: boolean;
    notes: string | null;
    source: 'member' | 'trainer' | 'desk';
    recorded_by_name: string | null;
    created_at: string;
    deletable: boolean;
}

export interface MeasurementList {
    height_cm: number | null;
    /** Newest first. */
    rows: Measurement[];
}

export interface MeasurementInput {
    measured_on: string;
    height_cm?: number | null;
    weight_kg?: number | null;
    body_fat_pct?: number | null;
    waist_cm?: number | null;
    chest_cm?: number | null;
    hips_cm?: number | null;
    arm_cm?: number | null;
    thigh_cm?: number | null;
    photo_front_oid?: string | null;
    photo_side_oid?: string | null;
    photo_back_oid?: string | null;
    notes?: string | null;
}

/** The numbers a measurement can hold, with labels and units, in display order. */
export const MEASUREMENT_FIELDS = [
    { key: 'weight_kg', label: 'Weight', unit: 'kg' },
    { key: 'body_fat_pct', label: 'Body fat', unit: '%' },
    { key: 'waist_cm', label: 'Waist', unit: 'cm' },
    { key: 'chest_cm', label: 'Chest', unit: 'cm' },
    { key: 'hips_cm', label: 'Hips', unit: 'cm' },
    { key: 'arm_cm', label: 'Arm', unit: 'cm' },
    { key: 'thigh_cm', label: 'Thigh', unit: 'cm' }
] as const;
export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number]['key'];

/** `90 s` → `1:30`. */
export function clockTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** A set as text: `60 kg × 8`, `12 reps`, `1:30`, `3.0 km in 15:00`. */
export function setText(measure: Measure, s: Pick<WorkoutSet, 'weight_kg' | 'reps' | 'seconds' | 'distance_m'>): string {
    switch (measure) {
        case 'weight_reps':
            return `${s.weight_kg ?? 0} kg × ${s.reps ?? 0}`;
        case 'reps':
            return `${s.reps ?? 0} reps`;
        case 'time':
            return clockTime(s.seconds ?? 0);
        case 'distance_time':
            return `${distanceText(s.distance_m)}${s.seconds ? ` in ${clockTime(s.seconds)}` : ''}`;
    }
}

export function distanceText(m: number | null): string {
    if (m === null) return '';
    return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `${m} m`;
}

/** A routine target as text: `4 × 8 at 60 kg`, `3 × 0:45`. */
export function targetText(x: Pick<DayExercise, 'measure' | 'sets' | 'reps' | 'weight_kg' | 'seconds' | 'distance_m'>): string {
    switch (x.measure) {
        case 'weight_reps':
            return `${x.sets} × ${x.reps ?? '?'}${x.weight_kg ? ` at ${x.weight_kg} kg` : ''}`;
        case 'reps':
            return `${x.sets} × ${x.reps ?? '?'}`;
        case 'time':
            return `${x.sets} × ${clockTime(x.seconds ?? 0)}`;
        case 'distance_time':
            return `${x.sets} × ${[distanceText(x.distance_m), x.seconds ? clockTime(x.seconds) : ''].filter(Boolean).join(' in ')}`;
    }
}

/** The main number of a record, as text. */
export function recordText(r: ExerciseRecord): string {
    switch (r.measure) {
        case 'weight_reps':
            return r.heaviest_kg !== null ? `${r.heaviest_kg} kg × ${r.heaviest_reps ?? 0}` : '';
        case 'reps':
            return `${r.most_reps ?? 0} reps`;
        case 'time':
            return clockTime(r.longest_seconds ?? 0);
        case 'distance_time':
            return distanceText(r.longest_distance_m);
    }
}

/** The unit of a series' values (e1RM kg, reps, seconds, metres). */
export const SERIES_UNIT: Record<Measure, string> = { weight_reps: 'est. 1-rep max, kg', reps: 'reps', time: 'seconds', distance_time: 'metres' };
