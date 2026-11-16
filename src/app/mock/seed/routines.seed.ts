import type { Exercise, RoutineDay } from '@core/models/portal.model';

import type { MockDb } from '../types';

/** A small exercise library (HQ master data), enough for the demo routines. */
const LIBRARY: Record<string, Exercise> = {
    squat: { name: 'Barbell back squat', sets: 4, reps: '6–8', rest_s: 120 },
    rdl: { name: 'Romanian deadlift', sets: 3, reps: '8–10', rest_s: 90 },
    lunge: { name: 'Walking lunge', sets: 3, reps: '10 each leg', rest_s: 60 },
    legpress: { name: 'Leg press', sets: 3, reps: '10–12', rest_s: 90 },
    calf: { name: 'Standing calf raise', sets: 3, reps: '15', rest_s: 45 },
    bench: { name: 'Bench press', sets: 4, reps: '6–8', rest_s: 120 },
    ohp: { name: 'Overhead press', sets: 3, reps: '8', rest_s: 90 },
    incline: { name: 'Incline dumbbell press', sets: 3, reps: '10', rest_s: 75 },
    dips: { name: 'Assisted dips', sets: 3, reps: '8–10', rest_s: 75 },
    triceps: { name: 'Cable triceps pushdown', sets: 3, reps: '12', rest_s: 45 },
    row: { name: 'Seated cable row', sets: 4, reps: '8–10', rest_s: 90 },
    pulldown: { name: 'Lat pulldown', sets: 3, reps: '10', rest_s: 75 },
    facepull: { name: 'Face pull', sets: 3, reps: '15', rest_s: 45 },
    curl: { name: 'Dumbbell curl', sets: 3, reps: '12', rest_s: 45 },
    plank: { name: 'Plank', sets: 3, reps: '45 s', rest_s: 30, note: 'Keep the lower back neutral.' },
    birddog: { name: 'Bird dog', sets: 3, reps: '10 each side', rest_s: 30, note: 'Good for the lower back.' }
};

const SPLIT: Omit<RoutineDay, 'trainer_name' | 'logged_today'>[] = [
    { title: 'Day A', focus: 'Legs and core', exercises: ['squat', 'rdl', 'lunge', 'calf', 'plank'].map(k => LIBRARY[k]) },
    { title: 'Day B', focus: 'Push', exercises: ['bench', 'ohp', 'incline', 'dips', 'triceps'].map(k => LIBRARY[k]) },
    { title: 'Day C', focus: 'Pull and back care', exercises: ['row', 'pulldown', 'facepull', 'curl', 'birddog'].map(k => LIBRARY[k]) }
];

/** A three-day split for members with a trainer; the day rotates with the date. */
export function seedRoutines(db: MockDb): void {
    for (const m of db.members) {
        if (!m.trainer_oid) continue;
        const trainer = db.trainers.find(t => t.oid === m.trainer_oid);
        db.routines[m.oid] = SPLIT.map(day => ({ ...day, trainer_name: trainer?.name ?? 'Your trainer', logged_today: false }));
    }
}
