import type { DayExercise, Equipment, ExerciseCategory, Measure, Muscle, RoutineDay } from '@core/models/training.model';

import type { ExerciseRow, FileRow, MemberRow, MockDb, RoutineRow, WorkoutRow } from '../types';
import { addDaysIso, at } from './clock';

/**
 * Phase 4 in demo mode: the HQ exercise library and templates (the database's seeds/demo/006_training.sql) and the
 * showcase cases (seeds/showcase/104_training_cases.sql), with the same photos and videos as static assets
 * (public/assets/images/training). Runs after `seedSchedulingCases`, which gives Sam Cole (tr-gul-1) his clients.
 */
const IMG = 'assets/images/training';

type Lib = [name: string, category: ExerciseCategory, measure: Measure, muscles: Muscle[], equipment: Equipment, instructions: string];
const LIBRARY: Lib[] = [
    [
        'Barbell back squat',
        'strength',
        'weight_reps',
        ['quads', 'glutes', 'hamstrings', 'core'],
        'barbell',
        'Bar on the upper back, feet shoulder-width. Sit down and back until the thighs are level, knees over the toes, then drive up through the whole foot.'
    ],
    [
        'Front squat',
        'strength',
        'weight_reps',
        ['quads', 'glutes', 'core'],
        'barbell',
        'Bar on the front of the shoulders, elbows high. Squat straight down, chest up, and stand.'
    ],
    [
        'Goblet squat',
        'strength',
        'weight_reps',
        ['quads', 'glutes'],
        'kettlebell',
        'Hold a kettlebell at the chest. Squat between the knees, keep the chest tall, stand.'
    ],
    [
        'Leg press',
        'strength',
        'weight_reps',
        ['quads', 'glutes'],
        'machine',
        'Feet hip-width on the plate. Lower until the knees are at 90 degrees, press without locking the knees.'
    ],
    [
        'Walking lunge',
        'strength',
        'weight_reps',
        ['quads', 'glutes'],
        'dumbbell',
        'A dumbbell in each hand. Step forward, lower the back knee near the floor, step through to the next lunge.'
    ],
    [
        'Romanian deadlift',
        'strength',
        'weight_reps',
        ['hamstrings', 'glutes', 'back'],
        'barbell',
        'Soft knees, push the hips back with a flat back until the hamstrings stretch, then stand tall.'
    ],
    [
        'Deadlift',
        'strength',
        'weight_reps',
        ['back', 'glutes', 'hamstrings', 'forearms'],
        'barbell',
        'Bar over mid-foot. Grip just outside the legs, brace, push the floor away and stand; lower with control.'
    ],
    [
        'Hip thrust',
        'strength',
        'weight_reps',
        ['glutes', 'hamstrings'],
        'barbell',
        'Upper back on a bench, bar on the hips. Drive the hips up until the body is flat, squeeze, lower.'
    ],
    ['Leg curl', 'strength', 'weight_reps', ['hamstrings'], 'machine', 'Pad above the heels. Curl the heels towards the seat, pause, lower slowly.'],
    ['Leg extension', 'strength', 'weight_reps', ['quads'], 'machine', 'Pad on the shins. Straighten the knees, pause at the top, lower slowly.'],
    [
        'Standing calf raise',
        'strength',
        'weight_reps',
        ['calves'],
        'machine',
        'Balls of the feet on the step. Rise as high as you can, pause, lower the heels below the step.'
    ],
    [
        'Bench press',
        'strength',
        'weight_reps',
        ['chest', 'triceps', 'shoulders'],
        'barbell',
        'Eyes under the bar, shoulder blades pinched. Lower to the mid-chest, press up and slightly back.'
    ],
    [
        'Incline dumbbell press',
        'strength',
        'weight_reps',
        ['chest', 'shoulders', 'triceps'],
        'dumbbell',
        'Bench at 30 degrees. Lower the dumbbells to the upper chest, press them up and together.'
    ],
    [
        'Push-up',
        'strength',
        'reps',
        ['chest', 'triceps', 'core'],
        'bodyweight',
        'Hands under the shoulders, body in a line. Lower the chest to the floor, press up.'
    ],
    [
        'Cable fly',
        'strength',
        'weight_reps',
        ['chest'],
        'cable',
        'Handles at shoulder height, a small bend in the elbows. Bring the hands together in front, return slowly.'
    ],
    ['Dips', 'strength', 'reps', ['triceps', 'chest'], 'bodyweight', 'On parallel bars, lower until the upper arms are level, press back up.'],
    [
        'Overhead press',
        'strength',
        'weight_reps',
        ['shoulders', 'triceps'],
        'barbell',
        'Bar on the front of the shoulders. Brace and press overhead, head through at the top.'
    ],
    [
        'Lateral raise',
        'strength',
        'weight_reps',
        ['shoulders'],
        'dumbbell',
        'Dumbbells at the sides. Raise them out to shoulder height, elbows soft, lower slowly.'
    ],
    [
        'Face pull',
        'strength',
        'weight_reps',
        ['shoulders', 'back'],
        'cable',
        'Rope at face height. Pull towards the eyes, elbows high, squeeze the shoulder blades.'
    ],
    ['Pull-up', 'strength', 'reps', ['back', 'biceps'], 'bodyweight', 'Hands shoulder-width, palms away. Pull the chest to the bar, lower all the way.'],
    [
        'Lat pulldown',
        'strength',
        'weight_reps',
        ['back', 'biceps'],
        'cable',
        'Thighs under the pad. Pull the bar to the upper chest, elbows down, return with control.'
    ],
    ['Barbell row', 'strength', 'weight_reps', ['back', 'biceps'], 'barbell', 'Hinge to 45 degrees, flat back. Row the bar to the lower ribs, lower it.'],
    [
        'Seated cable row',
        'strength',
        'weight_reps',
        ['back', 'biceps'],
        'cable',
        'Sit tall, pull the handle to the stomach, squeeze the shoulder blades, return.'
    ],
    [
        'One-arm dumbbell row',
        'strength',
        'weight_reps',
        ['back', 'biceps'],
        'dumbbell',
        'A knee and a hand on the bench. Row the dumbbell to the hip, lower it.'
    ],
    ['Barbell curl', 'strength', 'weight_reps', ['biceps', 'forearms'], 'barbell', 'Elbows at the sides. Curl the bar to the shoulders, lower slowly.'],
    ['Hammer curl', 'strength', 'weight_reps', ['biceps', 'forearms'], 'dumbbell', 'Palms facing in. Curl both dumbbells, lower slowly.'],
    ['Triceps pushdown', 'strength', 'weight_reps', ['triceps'], 'cable', 'Elbows at the sides. Push the bar down until the arms are straight, return.'],
    ['Skull crusher', 'strength', 'weight_reps', ['triceps'], 'barbell', 'Lying on a bench, lower the bar to the forehead by bending the elbows, extend.'],
    ['Plank', 'core', 'time', ['core'], 'bodyweight', 'Forearms under the shoulders, body in a line from head to heels. Hold, breathing slowly.'],
    ['Side plank', 'core', 'time', ['core'], 'bodyweight', 'On one forearm, hips up in a line. Hold, then change sides.'],
    ['Hanging knee raise', 'core', 'reps', ['core'], 'bodyweight', 'Hang from the bar. Bring the knees to the chest without swinging, lower slowly.'],
    ['Cable crunch', 'core', 'weight_reps', ['core'], 'cable', 'Kneel holding the rope by the head. Curl the ribs towards the hips, return.'],
    ['Russian twist', 'core', 'reps', ['core'], 'bodyweight', 'Sit with the feet up, lean back. Turn the shoulders side to side; each side counts as one.'],
    [
        'Kettlebell swing',
        'plyometric',
        'weight_reps',
        ['glutes', 'hamstrings', 'core'],
        'kettlebell',
        'Hinge and hike the bell back, snap the hips forward to float it to chest height.'
    ],
    ['Box jump', 'plyometric', 'reps', ['quads', 'glutes', 'calves'], 'other', 'Swing the arms, jump onto the box, land softly with both feet, step down.'],
    ['Burpee', 'plyometric', 'reps', ['full_body'], 'bodyweight', 'Squat, kick the feet back to a push-up, return, jump with the hands overhead.'],
    [
        'Treadmill run',
        'cardio',
        'distance_time',
        ['cardio', 'quads', 'calves'],
        'cardio_machine',
        'Warm up walking, then run at a pace you can talk at, unless the plan says otherwise.'
    ],
    [
        'Rowing machine',
        'cardio',
        'distance_time',
        ['cardio', 'back', 'quads'],
        'cardio_machine',
        'Legs, then body, then arms; back the other way. Keep the strokes long.'
    ],
    [
        'Stationary bike',
        'cardio',
        'distance_time',
        ['cardio', 'quads'],
        'cardio_machine',
        'Seat at hip height, a steady cadence. Raise the resistance for intervals.'
    ],
    ['Jump rope', 'cardio', 'time', ['cardio', 'calves'], 'other', 'Small jumps on the balls of the feet, the wrists turning the rope.'],
    [
        'Hip flexor stretch',
        'mobility',
        'time',
        ['quads', 'glutes'],
        'bodyweight',
        'Half kneel, tuck the hips under and shift forward until the front of the back hip stretches. Each side.'
    ],
    ['Band pull-apart', 'mobility', 'reps', ['shoulders', 'back'], 'band', 'Hold a band at shoulder height, pull it apart to the chest, return slowly.']
];

/** The photos and videos of the showcase (the files of seeds/showcase/files). */
const MEDIA: Record<string, { photos: string[]; video?: string }> = {
    'Barbell back squat': { photos: ['squat-1', 'squat-2', 'squat-3'], video: 'squat' },
    'Push-up': { photos: ['pushup-1', 'pushup-2'] },
    Plank: { photos: ['plank-1'], video: 'plank' },
    'Kettlebell swing': { photos: ['swing-1', 'swing-2'], video: 'swing' },
    Deadlift: { photos: ['deadlift-1', 'deadlift-2'] },
    'Bench press': { photos: ['bench-1', 'bench-2'] },
    'Lat pulldown': { photos: ['pulldown-1', 'pulldown-2'] },
    'Treadmill run': { photos: ['run-1'], video: 'run' },
    'Sled push': { photos: ['sled-1', 'sled-2'] },
    'Battle ropes': { photos: ['ropes-1'], video: 'ropes' }
};

type Target = Partial<Pick<DayExercise, 'reps' | 'weight_kg' | 'seconds' | 'distance_m' | 'rest_seconds' | 'notes'>>;

export function seedTraining(db: MockDb, today: string): void {
    const hq = db.branches.find(b => b.kind === 'HQ')!;
    const branch = (code: string): string => db.branches.find(b => b.code === code)!.oid;
    const gul = branch('GUL');
    const created = at(addDaysIso(today, -60), 660);
    const file = (oid: string, branchOid: string, kind: FileRow['kind'], name: string, member: string | null = null): string => {
        const video = name.endsWith('.webm');
        (db.files ??= []).push({
            oid,
            branch_oid: branchOid,
            member_oid: member,
            kind,
            name,
            content_type: video ? 'video/webm' : 'image/webp',
            size_bytes: video ? 300_000 : 24_000,
            status: 'ready',
            url: `${IMG}/${name}`,
            created_at: created,
            created_by_name: null
        });
        return oid;
    };
    const exercise = (oid: string, branchOid: string, row: Lib, active = true): ExerciseRow => {
        const [name, category, measure, muscles, equipment, instructions] = row;
        const media = MEDIA[name];
        return {
            oid,
            branch_oid: branchOid,
            name,
            category,
            measure,
            muscles,
            equipment,
            instructions,
            photo_file_oids: media?.photos.map(p => file(`fl-${p}`, branchOid, 'exercise_photo', `${p}.webp`)) ?? [],
            video_file_oid: media?.video ? file(`fl-${media.video}-video`, branchOid, 'exercise_video', `${media.video}.webm`) : null,
            active
        };
    };
    db.exercises = LIBRARY.map((row, i) => exercise(`ex-${i + 1}`, hq.oid, row));
    db.exercises.push(
        exercise('ex-gul-1', gul, [
            'Sled push',
            'strength',
            'distance_time',
            ['quads', 'glutes', 'calves'],
            'other',
            'Hands high on the posts, body at 45 degrees. Drive with short, fast steps; keep the hips low.'
        ]),
        exercise('ex-gul-2', gul, [
            'Battle ropes',
            'cardio',
            'time',
            ['shoulders', 'core', 'cardio'],
            'other',
            'Half squat, a rope end in each hand. Make fast waves all the way to the anchor; breathe.'
        ]),
        exercise(
            'ex-gul-3',
            gul,
            ['Cable woodchop', 'core', 'weight_reps', ['core'], 'cable', 'Pull the handle from high to low across the body, turning through the chest.'],
            false
        ),
        exercise('ex-utt-1', branch('UTT'), [
            'Tyre flip',
            'strength',
            'reps',
            ['full_body'],
            'other',
            'Chest on the tyre, drive it up with the legs, push it over.'
        ])
    );

    const byName = (name: string, branchOid = hq.oid): ExerciseRow =>
        db.exercises.find(e => e.name === name && e.branch_oid === branchOid) ?? db.exercises.find(e => e.name === name && e.branch_oid === hq.oid)!;
    const ex = (name: string, sets: number, t: Target = {}, branchOid = hq.oid): DayExercise => {
        const e = byName(name, branchOid);
        return {
            exercise_oid: e.oid,
            name: e.name,
            measure: e.measure,
            sets,
            reps: t.reps ?? null,
            weight_kg: t.weight_kg ?? null,
            seconds: t.seconds ?? null,
            distance_m: t.distance_m ?? null,
            rest_seconds: t.rest_seconds ?? 90,
            notes: t.notes ?? null
        };
    };
    const dayOf = (name: string, ...exercises: DayExercise[]): RoutineDay => ({ name, exercises });
    const template = (
        oid: string,
        branchOid: string,
        name: string,
        goal: RoutineRow['goal'],
        level: RoutineRow['level'],
        description: string,
        days: RoutineDay[],
        extra: Partial<RoutineRow> = {}
    ): RoutineRow => ({
        oid,
        branch_oid: branchOid,
        member_oid: null,
        source_oid: null,
        name,
        goal,
        level,
        description,
        days,
        trainer_oid: null,
        trainer_name: null,
        assigned_by: null,
        started_on: null,
        ended_on: null,
        active: true,
        created_at: created,
        ...extra
    });
    db.routines = [
        template(
            'rt-1',
            hq.oid,
            'Beginner full body',
            'general',
            'beginner',
            'Three days a week, a day of rest between. Learn the main lifts with light weights.',
            [
                dayOf(
                    'Day A',
                    ex('Goblet squat', 3, { reps: 10, weight_kg: 12 }),
                    ex('Push-up', 3, { reps: 10 }),
                    ex('Seated cable row', 3, { reps: 12, weight_kg: 30 }),
                    ex('Plank', 3, { seconds: 30, rest_seconds: 60 })
                ),
                dayOf(
                    'Day B',
                    ex('Romanian deadlift', 3, { reps: 10, weight_kg: 30 }),
                    ex('Incline dumbbell press', 3, { reps: 10, weight_kg: 10 }),
                    ex('Lat pulldown', 3, { reps: 12, weight_kg: 30 }),
                    ex('Side plank', 2, { seconds: 20, rest_seconds: 60 })
                ),
                dayOf(
                    'Day C',
                    ex('Leg press', 3, { reps: 12, weight_kg: 60 }),
                    ex('Overhead press', 3, { reps: 10, weight_kg: 20 }),
                    ex('One-arm dumbbell row', 3, { reps: 10, weight_kg: 14 }),
                    ex('Stationary bike', 1, { seconds: 600, distance_m: 4000, rest_seconds: 0 })
                )
            ]
        ),
        template(
            'rt-2',
            hq.oid,
            'Push, pull, legs',
            'muscle',
            'intermediate',
            'Three days, or six for two rounds a week. Add weight when every set reaches the top of the range.',
            [
                dayOf(
                    'Push',
                    ex('Bench press', 4, { reps: 8, weight_kg: 60, rest_seconds: 120 }),
                    ex('Incline dumbbell press', 3, { reps: 10, weight_kg: 20 }),
                    ex('Overhead press', 3, { reps: 8, weight_kg: 35 }),
                    ex('Lateral raise', 3, { reps: 15, weight_kg: 8, rest_seconds: 60 }),
                    ex('Triceps pushdown', 3, { reps: 12, weight_kg: 25, rest_seconds: 60 })
                ),
                dayOf(
                    'Pull',
                    ex('Deadlift', 3, { reps: 5, weight_kg: 100, rest_seconds: 180 }),
                    ex('Pull-up', 3, { reps: 8 }),
                    ex('Barbell row', 3, { reps: 8, weight_kg: 60 }),
                    ex('Face pull', 3, { reps: 15, weight_kg: 20, rest_seconds: 60 }),
                    ex('Hammer curl', 3, { reps: 12, weight_kg: 12, rest_seconds: 60 })
                ),
                dayOf(
                    'Legs',
                    ex('Barbell back squat', 4, { reps: 8, weight_kg: 80, rest_seconds: 150 }),
                    ex('Romanian deadlift', 3, { reps: 10, weight_kg: 60 }),
                    ex('Walking lunge', 3, { reps: 12, weight_kg: 14 }),
                    ex('Leg curl', 3, { reps: 12, weight_kg: 35, rest_seconds: 60 }),
                    ex('Standing calf raise', 4, { reps: 15, weight_kg: 40, rest_seconds: 60 })
                )
            ]
        ),
        template('rt-3', hq.oid, 'Upper and lower strength', 'strength', 'advanced', 'Four days: heavy compound lifts, low reps, long rests.', [
            dayOf(
                'Upper 1',
                ex('Bench press', 5, { reps: 5, weight_kg: 80, rest_seconds: 180 }),
                ex('Barbell row', 5, { reps: 5, weight_kg: 70, rest_seconds: 150 }),
                ex('Dips', 3, { reps: 10 })
            ),
            dayOf(
                'Lower 1',
                ex('Barbell back squat', 5, { reps: 5, weight_kg: 110, rest_seconds: 180 }),
                ex('Romanian deadlift', 3, { reps: 8, weight_kg: 80 }),
                ex('Hanging knee raise', 3, { reps: 12 })
            ),
            dayOf(
                'Upper 2',
                ex('Overhead press', 5, { reps: 5, weight_kg: 50, rest_seconds: 180 }),
                ex('Pull-up', 4, { reps: 6 }),
                ex('Skull crusher', 3, { reps: 10, weight_kg: 30 })
            ),
            dayOf(
                'Lower 2',
                ex('Deadlift', 5, { reps: 3, weight_kg: 140, rest_seconds: 240 }),
                ex('Front squat', 3, { reps: 6, weight_kg: 70, rest_seconds: 150 }),
                ex('Hip thrust', 3, { reps: 10, weight_kg: 90 })
            )
        ]),
        template(
            'rt-4',
            hq.oid,
            'Fat loss circuit',
            'fat_loss',
            'beginner',
            'Two circuits: go from one exercise to the next with little rest, then rest 2 minutes and repeat.',
            [
                dayOf(
                    'Circuit 1',
                    ex('Kettlebell swing', 3, { reps: 15, weight_kg: 12, rest_seconds: 30 }),
                    ex('Push-up', 3, { reps: 12, rest_seconds: 30 }),
                    ex('Goblet squat', 3, { reps: 15, weight_kg: 10, rest_seconds: 30 }),
                    ex('Jump rope', 3, { seconds: 60, rest_seconds: 120 })
                ),
                dayOf(
                    'Circuit 2',
                    ex('Burpee', 3, { reps: 10, rest_seconds: 30 }),
                    ex('Walking lunge', 3, { reps: 12, weight_kg: 6, rest_seconds: 30 }),
                    ex('Russian twist', 3, { reps: 20, rest_seconds: 30 }),
                    ex('Rowing machine', 1, { seconds: 600, distance_m: 2000, rest_seconds: 0 })
                )
            ]
        ),
        template('rt-5', hq.oid, '5 km runner', 'endurance', 'intermediate', 'Two runs and a strength day a week, building to a 5 km run.', [
            dayOf(
                'Easy run',
                ex('Treadmill run', 1, { seconds: 1800, distance_m: 4500, rest_seconds: 0 }),
                ex('Hip flexor stretch', 2, { seconds: 45, rest_seconds: 15 })
            ),
            dayOf(
                'Strength',
                ex('Goblet squat', 3, { reps: 12, weight_kg: 16 }),
                ex('Romanian deadlift', 3, { reps: 10, weight_kg: 40 }),
                ex('Standing calf raise', 3, { reps: 15, weight_kg: 30 }),
                ex('Plank', 3, { seconds: 45, rest_seconds: 45 })
            ),
            dayOf(
                'Intervals',
                ex('Treadmill run', 6, { seconds: 120, distance_m: 500, rest_seconds: 90, notes: 'Fast, then walk the rest' }),
                ex('Box jump', 3, { reps: 8 })
            )
        ]),
        template(
            'rt-gul-1',
            gul,
            "Sam's strength base",
            'strength',
            'intermediate',
            'Three days of the big lifts, then the sled to finish.',
            [
                dayOf(
                    'Squat day',
                    ex('Barbell back squat', 5, { reps: 5, weight_kg: 70, rest_seconds: 180 }),
                    ex('Leg curl', 3, { reps: 12, weight_kg: 30 }),
                    ex('Sled push', 4, { seconds: 30, distance_m: 20, rest_seconds: 120 }, gul)
                ),
                dayOf(
                    'Press day',
                    ex('Bench press', 5, { reps: 5, weight_kg: 55, rest_seconds: 180 }),
                    ex('Seated cable row', 3, { reps: 10, weight_kg: 45 }),
                    ex('Battle ropes', 4, { seconds: 30, rest_seconds: 60 }, gul)
                ),
                dayOf(
                    'Pull day',
                    ex('Deadlift', 3, { reps: 5, weight_kg: 90, rest_seconds: 240 }),
                    ex('Lat pulldown', 3, { reps: 10, weight_kg: 45 }),
                    ex('Plank', 3, { seconds: 45, rest_seconds: 45 })
                )
            ],
            { trainer_oid: 'tr-gul-1', trainer_name: 'Sam Cole' }
        ),
        template(
            'rt-gul-2',
            gul,
            'Summer shred 2025',
            'fat_loss',
            'beginner',
            "Last summer's challenge; kept for the record.",
            [dayOf('Circuit', ex('Burpee', 3, { reps: 10 }), ex('Kettlebell swing', 3, { reps: 15, weight_kg: 12 }), ex('Jump rope', 3, { seconds: 60 }))],
            { active: false }
        )
    ];
    db.workouts = [];
    db.measurements = [];
    seedTrainingCases(db, today);
}

/* ---------- the showcase cases (104_training_cases.sql) ---------- */

function seedTrainingCases(db: MockDb, today: string): void {
    const gul = db.branches.find(b => b.code === 'GUL')!.oid;
    const sam = db.trainers.find(t => t.oid === 'tr-gul-1');
    const running = (m: MemberRow): boolean =>
        !m.pending && !m.anonymised && db.subscriptions.some(s => s.member_oid === m.oid && s.kind !== 'pt' && s.start_date <= today && today <= s.end_date);
    const rahim = db.members.find(m => m.oid === 'mem-gul-1');
    const samClients = db.members.filter(m => m.trainer_oid === 'tr-gul-1' && m.oid !== 'mem-gul-1');
    const [knee, runner] = samClients;
    const tahminaClient = db.members.find(m => m.trainer_oid === 'tr-gul-3');
    if (!rahim || !sam || !knee || !runner) return;
    let seq = 0;
    const id = (prefix: string): string => `${prefix}-case-${++seq}`;
    const tpl = (name: string): RoutineRow => db.routines.find(r => r.member_oid === null && r.name === name)!;

    const assign = (
        m: MemberRow,
        from: RoutineRow | null,
        start: string,
        by: RoutineRow['assigned_by'],
        trainer: { oid: string; name: string } | null,
        ended: string | null = null,
        own?: Pick<RoutineRow, 'name' | 'days'>
    ): RoutineRow => {
        const row: RoutineRow = {
            oid: id('rt'),
            branch_oid: m.branch_oid,
            member_oid: m.oid,
            source_oid: from?.oid ?? null,
            name: own?.name ?? from!.name,
            goal: from?.goal ?? 'general',
            level: from?.level ?? 'beginner',
            description: from?.description ?? null,
            days: structuredClone(own?.days ?? from!.days),
            trainer_oid: trainer?.oid ?? null,
            trainer_name: trainer?.name ?? null,
            assigned_by: by,
            started_on: start,
            ended_on: ended,
            active: true,
            created_at: at(start, 600)
        };
        db.routines.push(row);
        return row;
    };
    /** A workout of a routine day: its targets as the sets, weights scaled by `factor` (to 2.5 kg). */
    const log = (
        r: RoutineRow,
        dayIndex: number,
        on: string,
        source: WorkoutRow['source'],
        by: string,
        factor = 1,
        minutes = 60,
        notes: string | null = null
    ): void => {
        const day = r.days[dayIndex];
        db.workouts.push({
            oid: id('wo'),
            branch_oid: r.branch_oid,
            member_oid: r.member_oid!,
            routine_oid: r.oid,
            day_index: dayIndex,
            day_name: day.name,
            performed_on: on,
            minutes,
            notes,
            source,
            logged_by_name: by,
            created_at: at(on, 1170),
            exercises: day.exercises.map(x => ({
                exercise_oid: x.exercise_oid,
                name: x.name,
                measure: x.measure,
                sets: Array.from({ length: x.sets }, () => ({
                    weight_kg: x.measure === 'weight_reps' ? Math.max(2.5, Math.round(((x.weight_kg ?? 10) * factor) / 2.5) * 2.5) : null,
                    reps: x.measure === 'weight_reps' || x.measure === 'reps' ? x.reps : null,
                    seconds: x.measure === 'time' || x.measure === 'distance_time' ? (x.seconds ?? 600) : null,
                    distance_m: x.measure === 'distance_time' ? Math.round((x.distance_m ?? 1000) * factor) : null
                }))
            }))
        });
    };
    const photo = (name: string, member: string): string => {
        const oid = `fl-${name}`;
        (db.files ??= []).push({
            oid,
            branch_oid: gul,
            member_oid: member,
            kind: 'measurement_photo',
            name: `${name}.webp`,
            content_type: 'image/webp',
            size_bytes: 16_000,
            status: 'ready',
            url: `assets/images/training/${name}.webp`,
            created_at: at(today, 500),
            created_by_name: null
        });
        return oid;
    };
    const measure = (
        m: MemberRow,
        on: string,
        source: WorkoutRow['source'],
        by: string,
        values: Partial<Record<'weight_kg' | 'body_fat_pct' | 'waist_cm' | 'chest_cm' | 'hips_cm' | 'arm_cm' | 'thigh_cm', number>>,
        photos: Partial<Record<'front' | 'side' | 'back', string>> = {},
        notes: string | null = null
    ): void => {
        db.measurements.push({
            oid: id('ms'),
            branch_oid: m.branch_oid,
            member_oid: m.oid,
            measured_on: on,
            weight_kg: values.weight_kg ?? null,
            body_fat_pct: values.body_fat_pct ?? null,
            waist_cm: values.waist_cm ?? null,
            chest_cm: values.chest_cm ?? null,
            hips_cm: values.hips_cm ?? null,
            arm_cm: values.arm_cm ?? null,
            thigh_cm: values.thigh_cm ?? null,
            photo_front_oid: photos.front ? photo(photos.front, m.oid) : null,
            photo_side_oid: photos.side ? photo(photos.side, m.oid) : null,
            photo_back_oid: photos.back ? photo(photos.back, m.oid) : null,
            notes,
            source,
            recorded_by_name: by,
            created_at: at(on, 510)
        });
    };
    const d = (n: number): string => addDaysIso(today, n);
    const samRef = { oid: sam.oid, name: sam.name };

    // The demo member (portal): a beginner block (ended), then Push, pull, legs from Sam; six weeks of progress.
    rahim.height_cm = 176;
    let r = assign(rahim, tpl('Beginner full body'), d(-84), 'staff', samRef, d(-43));
    for (let i = 0; i < 12; i++) log(r, i % 3, d(-84 + Math.floor((i * 40) / 11)), 'member', rahim.name, 0.6 + i * 0.03, 50);
    r = assign(rahim, tpl('Push, pull, legs'), d(-42), 'trainer', samRef);
    for (let i = 0; i < 18; i++) {
        log(
            r,
            i % 3,
            d(-41 + Math.floor((i * 40) / 17)),
            i % 4 === 0 ? 'trainer' : 'member',
            i % 4 === 0 ? sam.name : rahim.name,
            0.72 + i * 0.012,
            60,
            i === 17 ? 'New best on the squat' : i === 9 ? 'Tired after work' : null
        );
    }
    measure(
        rahim,
        d(-56),
        'trainer',
        sam.name,
        { weight_kg: 84.2, body_fat_pct: 24.5, waist_cm: 94, chest_cm: 104, hips_cm: 102, arm_cm: 35, thigh_cm: 60 },
        { front: 'body-a-front', side: 'body-a-side', back: 'body-a-back' },
        'Start of the block'
    );
    measure(
        rahim,
        d(-28),
        'trainer',
        sam.name,
        { weight_kg: 82.0, body_fat_pct: 22.9, waist_cm: 91, chest_cm: 104, hips_cm: 100, arm_cm: 35.5, thigh_cm: 60 },
        { front: 'body-b-front', side: 'body-b-side', back: 'body-b-back' }
    );
    measure(rahim, d(-14), 'desk', 'Front Desk', { weight_kg: 81.4 });
    measure(rahim, d(-1), 'member', rahim.name, { weight_kg: 80.6, waist_cm: 89 });

    // Sam's client with a routine built for them (no template).
    r = assign(knee, null, d(-10), 'trainer', samRef, null, {
        name: 'Knee-friendly strength',
        days: [
            {
                name: 'Day A',
                exercises: [
                    tpl('Upper and lower strength').days[3].exercises[2],
                    tpl('Beginner full body').days[2].exercises[0],
                    tpl('Beginner full body').days[0].exercises[3]
                ]
            },
            {
                name: 'Day B',
                exercises: [
                    tpl('Beginner full body').days[0].exercises[0],
                    tpl('Push, pull, legs').days[2].exercises[3],
                    tpl('Beginner full body').days[1].exercises[3]
                ]
            }
        ]
    });
    log(r, 0, d(-8), 'trainer', sam.name, 0.6, 45, 'No knee pain');
    log(r, 1, d(-4), 'trainer', sam.name, 1, 45);
    measure(knee, d(-10), 'trainer', sam.name, { weight_kg: 88.2, body_fat_pct: 24, waist_cm: 96, chest_cm: 108, hips_cm: 104, arm_cm: 36, thigh_cm: 62 });

    // A member who started an HQ template in the portal; a free session; their own photo.
    knee.height_cm = 178;
    runner.height_cm = 175;
    r = assign(runner, tpl('5 km runner'), d(-20), 'member', null);
    for (let i = 0; i < 7; i++) log(r, i % 3, d(-19 + i * 2 + Math.floor(i / 3)), 'member', runner.name, 0.8 + i * 0.04, 40);
    const rope = db.exercises.find(e => e.name === 'Jump rope')!;
    const push = db.exercises.find(e => e.name === 'Push-up')!;
    db.workouts.push({
        oid: id('wo'),
        branch_oid: runner.branch_oid,
        member_oid: runner.oid,
        routine_oid: null,
        day_index: null,
        day_name: null,
        performed_on: d(-2),
        minutes: 20,
        notes: 'Hotel gym while travelling',
        source: 'member',
        logged_by_name: runner.name,
        created_at: at(d(-2), 420),
        exercises: [
            {
                exercise_oid: rope.oid,
                name: rope.name,
                measure: 'time',
                sets: [
                    { weight_kg: null, reps: null, seconds: 120, distance_m: null },
                    { weight_kg: null, reps: null, seconds: 120, distance_m: null }
                ]
            },
            {
                exercise_oid: push.oid,
                name: push.name,
                measure: 'reps',
                sets: [
                    { weight_kg: null, reps: 20, seconds: null, distance_m: null },
                    { weight_kg: null, reps: 18, seconds: null, distance_m: null }
                ]
            }
        ]
    });
    measure(runner, d(-20), 'member', runner.name, { weight_kg: 83.5 });
    measure(runner, d(-3), 'member', runner.name, { weight_kg: 82.3 }, { front: 'body-d-front' });

    // Tahmina's client: the Gulshan template, set by the manager; a photo Sam is not shown.
    if (tahminaClient) {
        tahminaClient.height_cm = 158;
        r = assign(tahminaClient, tpl("Sam's strength base"), d(-15), 'staff', {
            oid: 'tr-gul-3',
            name: db.trainers.find(t => t.oid === 'tr-gul-3')?.name ?? 'Trainer'
        });
        log(r, 0, d(-13), 'desk', 'Branch Manager', 0.6, 55);
        measure(tahminaClient, d(-5), 'desk', 'Front Desk', { weight_kg: 61, body_fat_pct: 27.5, waist_cm: 74 }, { front: 'body-c-front' });
    }

    // Dhanmondi and Uttara: a member each.
    for (const [code, name] of [
        ['DHA', 'Fat loss circuit'],
        ['UTT', 'Beginner full body']
    ] as const) {
        const b = db.branches.find(x => x.code === code)!.oid;
        const m = db.members.find(x => x.branch_oid === b && running(x));
        if (!m) continue;
        r = assign(m, tpl(name), d(-12), 'staff', null);
        log(r, 0, d(-10), 'desk', 'Front Desk', 1, 40);
        log(r, 1, d(-6), 'desk', 'Front Desk', 1, 40);
        measure(m, d(-12), 'desk', 'Front Desk', { weight_kg: 79, waist_cm: 92 });
    }
}
