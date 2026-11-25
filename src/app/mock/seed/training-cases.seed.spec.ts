import { personalRecords } from '../domain/records';
import { seed } from './seed';

/** The training cases in the demo data, the same list as the database's showcase seed 104. */
describe('every training case in the demo data', () => {
    const today = '2026-11-19';
    const db = seed(today, 12 * 60);
    const hq = db.branches.find(b => b.kind === 'HQ')!.oid;
    const gul = db.branches.find(b => b.code === 'GUL')!.oid;

    it('the library: HQ’s 42 with photos and videos, Gulshan’s own (one not in use), Uttara’s own', () => {
        expect(db.exercises.filter(e => e.branch_oid === hq)).toHaveLength(42);
        expect(db.exercises.filter(e => e.photo_file_oids.length).length).toBe(10);
        expect(db.exercises.filter(e => e.video_file_oid).length).toBe(5);
        const own = db.exercises.filter(e => e.branch_oid === gul);
        expect(own.map(e => [e.name, e.active])).toEqual([
            ['Sled push', true],
            ['Battle ropes', true],
            ['Cable woodchop', false]
        ]);
        expect(db.exercises.some(e => e.name === 'Tyre flip' && e.branch_oid !== gul && e.branch_oid !== hq)).toBe(true);
        for (const e of db.exercises)
            for (const f of [...e.photo_file_oids, ...(e.video_file_oid ? [e.video_file_oid] : [])]) {
                expect(db.files?.find(x => x.oid === f)?.url).toMatch(/^assets\/images\/training\//);
            }
    });

    it('templates: five from HQ, a trainer’s and an inactive one at Gulshan', () => {
        const templates = db.routines.filter(r => r.member_oid === null);
        expect(templates.filter(r => r.branch_oid === hq)).toHaveLength(5);
        expect(templates.find(r => r.branch_oid === gul && r.trainer_name === 'Sam Cole')?.active).toBe(true);
        expect(templates.some(r => r.branch_oid === gul && !r.active)).toBe(true);
    });

    it('routines set by a trainer, by the branch, by the member, built for one member; one ended', () => {
        const copies = db.routines.filter(r => r.member_oid !== null);
        expect(new Set(copies.map(r => r.assigned_by))).toEqual(new Set(['trainer', 'staff', 'member']));
        expect(copies.some(r => r.source_oid === null)).toBe(true);
        expect(copies.some(r => r.ended_on)).toBe(true);
        // One running routine per member.
        const running = copies.filter(r => !r.ended_on).map(r => r.member_oid);
        expect(new Set(running).size).toBe(running.length);
        const demo = copies.find(r => r.member_oid === 'mem-gul-1' && !r.ended_on);
        expect(demo).toMatchObject({ name: 'Push, pull, legs', assigned_by: 'trainer', trainer_name: 'Sam Cole' });
    });

    it('workouts by each source, free and on a routine day, editable and closed; records from them', () => {
        expect(new Set(db.workouts.map(w => w.source))).toEqual(new Set(['member', 'trainer', 'desk']));
        expect(db.workouts.some(w => w.routine_oid === null)).toBe(true);
        expect(db.workouts.some(w => w.performed_on >= '2026-11-12')).toBe(true);
        expect(db.workouts.some(w => w.performed_on < '2026-11-12')).toBe(true);
        const mine = db.workouts.filter(w => w.member_oid === 'mem-gul-1');
        expect(mine).toHaveLength(30);
        const sets = mine.flatMap(w =>
            w.exercises.flatMap(x =>
                x.sets.map(s => ({ ...s, exercise_oid: x.exercise_oid, exercise_name: x.name, measure: x.measure, performed_on: w.performed_on }))
            )
        );
        const squat = personalRecords(sets).find(r => r.name === 'Barbell back squat');
        expect(squat?.best_e1rm_kg).toBeGreaterThan(70);
    });

    it('measurements by each source, with 3, 1 and no photos; a photo of another trainer’s client', () => {
        expect(new Set(db.measurements.map(m => m.source))).toEqual(new Set(['member', 'trainer', 'desk']));
        const photos = (m: (typeof db.measurements)[number]): number => [m.photo_front_oid, m.photo_side_oid, m.photo_back_oid].filter(Boolean).length;
        expect(new Set(db.measurements.map(photos))).toEqual(new Set([0, 1, 3]));
        const other = db.measurements.find(m => photos(m) && db.members.find(x => x.oid === m.member_oid)?.trainer_oid === 'tr-gul-3');
        expect(other).toBeDefined();
        for (const m of db.measurements.filter(photos)) {
            for (const f of [m.photo_front_oid, m.photo_side_oid, m.photo_back_oid].filter(Boolean)) {
                expect(db.files?.find(x => x.oid === f)).toMatchObject({ kind: 'measurement_photo', member_oid: m.member_oid });
            }
        }
        expect(db.members.find(m => m.oid === 'mem-gul-1')?.height_cm).toBe(176);
    });

    it('Dhanmondi and Uttara have a member each with training', () => {
        for (const code of ['DHA', 'UTT']) {
            const b = db.branches.find(x => x.code === code)!.oid;
            expect(db.routines.some(r => r.branch_oid === b && r.member_oid)).toBe(true);
            expect(db.workouts.some(w => w.branch_oid === b)).toBe(true);
            expect(db.measurements.some(m => m.branch_oid === b)).toBe(true);
        }
    });
});
