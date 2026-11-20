import type { HttpResponse } from '@angular/common/http';

import type {
    DayExercise,
    Exercise,
    Measure,
    Measurement,
    MemberRoutine,
    Routine,
    RoutineDay,
    TrainingProgress,
    Workout,
    WorkoutSet
} from '@core/models/training.model';
import { environment } from '@env/environment';

import { recordAudit } from '../audit';
import { bmi, checkSet, personalRecords, progressSeries, volumeKg } from '../domain/records';
import { type Ctx, fail, num, ok, qInt, qStr, type Route, str } from '../http';
import { idx } from '../queries';
import { addDaysIso, weekStart } from '../seed/clock';
import { commit, db, newOid } from '../store';
import type { ExerciseRow, FileRow, MeasurementRow, MemberRow, RoutineRow, WorkoutRow } from '../types';
import { branchMember } from './members.handlers';
import { takeUpload } from './phase2.handlers';

/**
 * Phase 4 in demo mode (D-084 to D-089): the API's training routes (fitmanager-api src/features/training) on the
 * mock's tables, with the same rules and messages: the HQ library plus each branch's own, routine templates and
 * members' snapshot copies with the next day after the last one logged, workouts editable for 7 days, records
 * computed when read, measurements with private photos.
 */
const EDIT_DAYS = 7;
const MEMBER_DELETE_DAYS = 7;
const WEEKS = 12;
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const hqOid = (): string => db().branches.find(b => b.kind === 'HQ')!.oid;
const fileUrl = (oid: string | null): string | null => (oid ? (db().files?.find(f => f.oid === oid && f.status === 'ready')?.url ?? null) : null);

/* ---------- shared ---------- */

function visible(e: { branch_oid: string }, branchOid: string): boolean {
    return e.branch_oid === branchOid || e.branch_oid === hqOid();
}

function exerciseWire(e: ExerciseRow, branchOid: string): Exercise {
    return {
        oid: e.oid,
        branch_oid: e.branch_oid,
        scope: e.branch_oid === hqOid() ? 'hq' : 'branch',
        name: e.name,
        category: e.category,
        measure: e.measure,
        muscles: e.muscles,
        equipment: e.equipment,
        instructions: e.instructions,
        photos: e.photo_file_oids.map(oid => ({ file_oid: oid, url: fileUrl(oid) ?? '' })),
        video: e.video_file_oid ? { file_oid: e.video_file_oid, url: fileUrl(e.video_file_oid) ?? '' } : null,
        active: e.active,
        editable: e.branch_oid === branchOid
    };
}

function nextDay(r: RoutineRow): { day: number; last_on: string | null } {
    const last = db()
        .workouts.filter(w => w.routine_oid === r.oid && w.day_index !== null)
        .sort((a, b) => b.performed_on.localeCompare(a.performed_on) || b.created_at.localeCompare(a.created_at))[0];
    if (last?.day_index === undefined || last.day_index === null) return { day: 0, last_on: null };
    return { day: (last.day_index + 1) % r.days.length, last_on: last.performed_on };
}

function routineWire(r: RoutineRow, branchOid: string, withNext = false): Routine {
    const next = withNext && r.member_oid && !r.ended_on ? nextDay(r) : null;
    return {
        oid: r.oid,
        scope: r.member_oid ? 'member' : r.branch_oid === hqOid() ? 'hq' : 'branch',
        name: r.name,
        goal: r.goal,
        level: r.level,
        description: r.description,
        days: r.days,
        exercise_count: r.days.reduce((n, d) => n + d.exercises.length, 0),
        trainer_oid: r.trainer_oid,
        trainer_name: r.trainer_name,
        active: r.active,
        editable: r.branch_oid === branchOid,
        member_oid: r.member_oid,
        source_oid: r.source_oid,
        source_name: r.source_oid ? (db().routines.find(x => x.oid === r.source_oid && visible(x, branchOid))?.name ?? null) : null,
        assigned_by: r.assigned_by,
        started_on: r.started_on,
        ended_on: r.ended_on,
        next_day: next?.day ?? null,
        last_workout_on: next?.last_on ?? null
    };
}

function memberRoutine(m: MemberRow): MemberRoutine {
    const rows = db()
        .routines.filter(r => r.member_oid === m.oid && r.branch_oid === m.branch_oid)
        .sort((a, b) => (b.started_on ?? '').localeCompare(a.started_on ?? ''));
    const running = rows.find(r => !r.ended_on);
    return { current: running ? routineWire(running, m.branch_oid, true) : null, history: rows.filter(r => r.ended_on).map(r => routineWire(r, m.branch_oid)) };
}

function selfOnly(ctx: Ctx): boolean {
    return ctx.user?.assignments.find(a => a.branch.oid === ctx.branch?.oid)?.role === 'TRAINER';
}

/** A member at this branch whose training the caller may change: a trainer only their own clients (D-086). */
function trainingMember(ctx: Ctx, memberOid: string, staff: boolean): MemberRow {
    const m = branchMember(ctx, memberOid);
    if (m.anonymised) fail(409, 'This member was anonymised');
    if (staff && selfOnly(ctx) && (!m.trainer_oid || m.trainer_oid !== ctx.account?.trainer_oid)) {
        fail(403, "Only the member's own trainer, the desk or a manager can do this");
    }
    return m;
}

const staffSource = (ctx: Ctx): WorkoutRow['source'] => (ctx.account?.trainer_oid ? 'trainer' : 'desk');
const callerTrainer = (ctx: Ctx): { oid: string; name: string } | null => {
    const t = ctx.account?.trainer_oid ? db().trainers.find(x => x.oid === ctx.account?.trainer_oid) : undefined;
    return t ? { oid: t.oid, name: t.name } : null;
};

/** The portal's member, with the context at their home branch (for the audit rows). */
function home(ctx: Ctx): { m: MemberRow; c: Ctx } {
    const oid = ctx.user?.member?.oid;
    const m = oid ? idx().members.get(oid) : undefined;
    if (!m) fail(404, 'Member not found');
    return { m, c: { ...ctx, branch: db().branches.find(b => b.oid === m.branch_oid) ?? null } };
}

/* ---------- the library (D-084, D-085) ---------- */

function listExercises(c: Ctx, branchOid: string): Exercise[] {
    const q = qStr(c, 'q').toLowerCase();
    const cat = qStr(c, 'category');
    const muscle = qStr(c, 'muscle');
    const gear = qStr(c, 'equipment');
    const all = qStr(c, 'all') === '1';
    return db()
        .exercises.filter(e => visible(e, branchOid) && (all || e.active))
        .filter(
            e =>
                (!q || e.name.toLowerCase().includes(q)) &&
                (!cat || e.category === cat) &&
                (!muscle || e.muscles.includes(muscle as never)) &&
                (!gear || e.equipment === gear)
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(e => exerciseWire(e, branchOid));
}

function claim(ctx: Ctx, oid: string, kind: FileRow['kind'], memberOid: string | null = null): void {
    const f = db().files?.find(x => x.oid === oid && x.branch_oid === ctx.branch?.oid);
    if (f?.status !== 'ready' || f.kind !== kind || (f.member_oid !== null && f.member_oid !== memberOid)) fail(400, 'Upload the file first');
    if (memberOid && f.member_oid === null) commit({ t: 'file.patch', oid, patch: { member_oid: memberOid } });
}

function exerciseInput(ctx: Ctx, before?: ExerciseRow): Omit<ExerciseRow, 'oid' | 'branch_oid'> {
    const b = ctx.body;
    const name = 'name' in b ? str(b['name']) : (before?.name ?? '');
    if (name.length < 2) fail(400, 'At least 2 characters');
    const muscles = 'muscles' in b ? (b['muscles'] as ExerciseRow['muscles']) : (before?.muscles ?? []);
    if (!muscles.length) fail(400, 'Pick at least one muscle');
    const photos = 'photo_file_oids' in b ? (b['photo_file_oids'] as string[]) : (before?.photo_file_oids ?? []);
    if (photos.length > 3) fail(400, 'At most 3 photos');
    const video = 'video_file_oid' in b ? ((b['video_file_oid'] as string | null) ?? null) : (before?.video_file_oid ?? null);
    for (const p of photos.filter(x => !before?.photo_file_oids.includes(x))) claim(ctx, p, 'exercise_photo');
    if (video && video !== before?.video_file_oid) claim(ctx, video, 'exercise_video');
    if (db().exercises.some(e => e.branch_oid === ctx.branch!.oid && e.oid !== before?.oid && e.name.toLowerCase() === name.toLowerCase())) {
        fail(409, 'An exercise with this name exists');
    }
    return {
        name,
        category: (b['category'] as ExerciseRow['category'] | undefined) ?? before?.category ?? 'strength',
        measure: (b['measure'] as Measure | undefined) ?? before?.measure ?? 'weight_reps',
        muscles,
        equipment: (b['equipment'] as ExerciseRow['equipment'] | undefined) ?? before?.equipment ?? 'other',
        instructions: 'instructions' in b ? str(b['instructions']) || null : (before?.instructions ?? null),
        photo_file_oids: photos,
        video_file_oid: video,
        active: typeof b['active'] === 'boolean' ? b['active'] : (before?.active ?? true)
    };
}

function exercises(ctx: Ctx): HttpResponse<unknown> {
    return ok(listExercises(ctx, ctx.branch!.oid));
}

function exercise(ctx: Ctx): HttpResponse<unknown> {
    const e = db().exercises.find(x => x.oid === ctx.params[0] && visible(x, ctx.branch!.oid));
    if (!e) fail(404, 'Exercise not found');
    return ok(exerciseWire(e, ctx.branch!.oid));
}

function createExercise(ctx: Ctx): HttpResponse<unknown> {
    const row: ExerciseRow = { oid: newOid('ex'), branch_oid: ctx.branch!.oid, ...exerciseInput(ctx) };
    commit({ t: 'put', table: 'exercises', row });
    recordAudit(ctx, 'create', 'exercise', row.oid, null, row);
    return ok(exerciseWire(row, ctx.branch!.oid), 'Exercise added');
}

function updateExercise(ctx: Ctx): HttpResponse<unknown> {
    const before = db().exercises.find(x => x.oid === ctx.params[0] && visible(x, ctx.branch!.oid));
    if (!before) fail(404, 'Exercise not found');
    if (before.branch_oid !== ctx.branch!.oid) fail(403, 'This exercise is in the HQ library: only HQ can change it');
    const snapshot = structuredClone(before);
    const row: ExerciseRow = { ...before, ...exerciseInput(ctx, before) };
    for (const gone of [
        ...before.photo_file_oids.filter(f => !row.photo_file_oids.includes(f)),
        ...(before.video_file_oid && before.video_file_oid !== row.video_file_oid ? [before.video_file_oid] : [])
    ]) {
        commit({ t: 'file.patch', oid: gone, patch: { status: 'deleted' } });
    }
    commit({ t: 'put', table: 'exercises', row });
    recordAudit(ctx, 'update', 'exercise', row.oid, snapshot, row);
    return ok(exerciseWire(row, ctx.branch!.oid), 'Exercise saved');
}

/* ---------- routines (D-087) ---------- */

function resolveDays(ctx: Ctx, input: unknown, keep: string[] = []): RoutineDay[] {
    const days = (Array.isArray(input) ? input : []) as { name: string; exercises: Partial<DayExercise>[] }[];
    if (!days.length) fail(400, 'Add a day');
    if (days.length > 7) fail(400, 'At most 7 days');
    return days.map(d => {
        if (!str(d.name)) fail(400, 'Name the day');
        if (!d.exercises.length) fail(400, 'Add an exercise');
        return {
            name: str(d.name),
            exercises: d.exercises.map(x => {
                const e = db().exercises.find(y => y.oid === x.exercise_oid && visible(y, ctx.branch!.oid));
                if (!e || (!e.active && !keep.includes(e.oid))) fail(400, 'Choose an exercise from the library');
                const problem =
                    (e.measure === 'weight_reps' || e.measure === 'reps') && !x.reps
                        ? 'enter the reps'
                        : e.measure === 'time' && !x.seconds
                          ? 'enter the time'
                          : e.measure === 'distance_time' && !x.seconds && !x.distance_m
                            ? 'enter a distance or a time'
                            : null;
                if (problem) fail(400, `${e.name}: ${problem}`);
                return {
                    exercise_oid: e.oid,
                    name: e.name,
                    measure: e.measure,
                    sets: num(x.sets) || 1,
                    reps: e.measure === 'weight_reps' || e.measure === 'reps' ? (x.reps ?? null) : null,
                    weight_kg: e.measure === 'weight_reps' ? (x.weight_kg ?? null) : null,
                    seconds: e.measure === 'time' || e.measure === 'distance_time' ? (x.seconds ?? null) : null,
                    distance_m: e.measure === 'distance_time' ? (x.distance_m ?? null) : null,
                    rest_seconds: x.rest_seconds ?? 90,
                    notes: x.notes ?? null
                };
            })
        };
    });
}

function routineFields(ctx: Ctx, before?: RoutineRow): Pick<RoutineRow, 'name' | 'goal' | 'level' | 'description' | 'days'> {
    const b = ctx.body;
    const name = 'name' in b ? str(b['name']) : (before?.name ?? '');
    if (name.length < 2) fail(400, 'At least 2 characters');
    return {
        name,
        goal: (b['goal'] as RoutineRow['goal'] | undefined) ?? before?.goal ?? 'general',
        level: (b['level'] as RoutineRow['level'] | undefined) ?? before?.level ?? 'beginner',
        description: 'description' in b ? str(b['description']) || null : (before?.description ?? null),
        days:
            'days' in b
                ? resolveDays(
                      ctx,
                      b['days'],
                      before?.days.flatMap(d => d.exercises.map(x => x.exercise_oid))
                  )
                : (before?.days ?? [])
    };
}

function templates(ctx: Ctx): HttpResponse<unknown> {
    const all = qStr(ctx, 'all') === '1';
    const hq = hqOid();
    return ok(
        db()
            .routines.filter(r => r.member_oid === null && visible(r, ctx.branch!.oid) && (all || r.active))
            .sort((a, b) => Number(b.branch_oid === hq) - Number(a.branch_oid === hq) || a.name.localeCompare(b.name))
            .map(r => routineWire(r, ctx.branch!.oid))
    );
}

function routine(ctx: Ctx): HttpResponse<unknown> {
    const r = db().routines.find(x => x.oid === ctx.params[0] && (x.branch_oid === ctx.branch!.oid || (x.member_oid === null && x.branch_oid === hqOid())));
    if (!r) fail(404, 'Routine not found');
    return ok(routineWire(r, ctx.branch!.oid, true));
}

function createTemplate(ctx: Ctx): HttpResponse<unknown> {
    const t = callerTrainer(ctx);
    const row: RoutineRow = {
        oid: newOid('rt'),
        branch_oid: ctx.branch!.oid,
        member_oid: null,
        source_oid: null,
        ...routineFields(ctx),
        trainer_oid: t?.oid ?? null,
        trainer_name: t?.name ?? null,
        assigned_by: null,
        started_on: null,
        ended_on: null,
        active: true,
        created_at: ctx.now.iso
    };
    commit({ t: 'put', table: 'routines', row });
    recordAudit(ctx, 'create', 'routine', row.oid, null, row);
    return ok(routineWire(row, ctx.branch!.oid), 'Routine saved');
}

function updateRoutine(ctx: Ctx): HttpResponse<unknown> {
    const before = db().routines.find(x => x.oid === ctx.params[0] && visible(x, ctx.branch!.oid));
    if (!before) fail(404, 'Routine not found');
    if (before.branch_oid !== ctx.branch!.oid) fail(403, 'This routine is an HQ template: only HQ can change it');
    if (before.ended_on) fail(409, 'This routine has ended: assign a new one instead');
    if (before.member_oid) trainingMember(ctx, before.member_oid, true);
    else if (selfOnly(ctx) && (!before.trainer_oid || before.trainer_oid !== ctx.account?.trainer_oid)) {
        fail(403, 'Only the trainer who built this template, or a manager, can change it');
    }
    const row: RoutineRow = { ...before, ...routineFields(ctx, before), active: typeof ctx.body['active'] === 'boolean' ? ctx.body['active'] : before.active };
    commit({ t: 'put', table: 'routines', row });
    recordAudit(ctx, 'update', 'routine', row.oid, before, row);
    return ok(routineWire(row, ctx.branch!.oid, true), 'Routine saved');
}

function endRunning(ctx: Ctx, m: MemberRow): RoutineRow | undefined {
    const running = db().routines.find(r => r.member_oid === m.oid && !r.ended_on);
    if (running) {
        commit({
            t: 'patch',
            table: 'routines',
            oid: running.oid,
            patch: { ended_on: ctx.now.date < (running.started_on ?? '') ? running.started_on : ctx.now.date }
        });
        recordAudit(ctx, 'end', 'routine', running.oid, { ended_on: null }, { ended_on: ctx.now.date });
    }
    return running;
}

function start(
    ctx: Ctx,
    m: MemberRow,
    from: RoutineRow | null,
    fields: Pick<RoutineRow, 'name' | 'goal' | 'level' | 'description' | 'days'>,
    by: RoutineRow['assigned_by'],
    trainer: { oid: string; name: string } | null
): void {
    endRunning(ctx, m);
    const row: RoutineRow = {
        oid: newOid('rt'),
        branch_oid: m.branch_oid,
        member_oid: m.oid,
        source_oid: from?.oid ?? null,
        ...fields,
        days: structuredClone(fields.days),
        trainer_oid: trainer?.oid ?? null,
        trainer_name: trainer?.name ?? null,
        assigned_by: by,
        started_on: ctx.now.date,
        ended_on: null,
        active: true,
        created_at: ctx.now.iso
    };
    commit({ t: 'put', table: 'routines', row });
    recordAudit(ctx, 'assign', 'routine', row.oid, null, { member: m.code, name: row.name });
}

function templateFor(ctx: Ctx, oid: string, hqOnly = false): RoutineRow {
    const t = db().routines.find(r => r.oid === oid && r.member_oid === null && r.active && visible(r, ctx.branch!.oid));
    if (!t || (hqOnly && t.branch_oid !== hqOid())) fail(404, 'Routine not found');
    return t;
}

function getMemberRoutine(ctx: Ctx): HttpResponse<unknown> {
    return ok(memberRoutine(branchMember(ctx, ctx.params[0] ?? '')));
}

function assign(ctx: Ctx): HttpResponse<unknown> {
    const m = trainingMember(ctx, ctx.params[0] ?? '', true);
    const mine = callerTrainer(ctx);
    const theirs = m.trainer_oid ? db().trainers.find(t => t.oid === m.trainer_oid) : undefined;
    const trainer = mine ?? (theirs ? { oid: theirs.oid, name: theirs.name } : null);
    const tplOid = str(ctx.body['template_oid']);
    if (tplOid) {
        const t = templateFor(ctx, tplOid);
        start(ctx, m, t, t, mine ? 'trainer' : 'staff', trainer);
    } else {
        const built = { ...ctx, body: (ctx.body['routine'] ?? {}) as Record<string, unknown> };
        start(ctx, m, null, routineFields(built), mine ? 'trainer' : 'staff', trainer);
    }
    return ok(memberRoutine(m), 'Routine assigned');
}

function end(ctx: Ctx, m: MemberRow): HttpResponse<unknown> {
    if (!endRunning(ctx, m)) fail(409, 'No routine is running');
    return ok(memberRoutine(m), 'Routine ended');
}

/* ---------- workouts (D-088) ---------- */

function workoutWire(w: WorkoutRow, today: string): Workout {
    const sets = w.exercises.flatMap(x => x.sets);
    return {
        oid: w.oid,
        member_oid: w.member_oid,
        routine_oid: w.routine_oid,
        day_index: w.day_index,
        day_name: w.day_name,
        performed_on: w.performed_on,
        minutes: w.minutes,
        notes: w.notes,
        source: w.source,
        logged_by_name: w.logged_by_name,
        set_count: sets.length,
        volume_kg: volumeKg(sets),
        editable: daysBetween(w.performed_on, today) <= EDIT_DAYS,
        exercises: w.exercises.map(x => ({ ...x, sets: x.sets.map((s, i) => ({ set_no: i + 1, ...s })) }))
    };
}

function checkDate(date: string, today: string): void {
    if (!date) fail(400, 'A date as YYYY-MM-DD');
    if (date > today) fail(400, 'A workout cannot be in the future');
    if (daysBetween(date, today) > EDIT_DAYS) fail(400, `Log a workout within ${EDIT_DAYS} days`);
}

function sets(ctx: Ctx, input: unknown): WorkoutRow['exercises'] {
    const list = (Array.isArray(input) ? input : []) as { exercise_oid: string; sets: WorkoutSet[] }[];
    if (!list.length) fail(400, 'Log at least one exercise');
    return list.map(x => {
        const e = db().exercises.find(y => y.oid === x.exercise_oid && visible(y, ctx.branch!.oid));
        if (!e) fail(400, 'Choose an exercise from the library');
        if (!x.sets.length) fail(400, 'Log at least one set');
        x.sets.forEach((s, i) => {
            const problem = checkSet(e.measure, s);
            if (problem) fail(400, `${e.name}, set ${i + 1}: ${problem.toLowerCase()}`);
        });
        return {
            exercise_oid: e.oid,
            name: e.name,
            measure: e.measure,
            sets: x.sets.map(s => ({ weight_kg: s.weight_kg ?? null, reps: s.reps ?? null, seconds: s.seconds ?? null, distance_m: s.distance_m ?? null }))
        };
    });
}

function day(m: MemberRow, index: unknown): Pick<WorkoutRow, 'routine_oid' | 'day_index' | 'day_name'> {
    if (index === null || index === undefined) return { routine_oid: null, day_index: null, day_name: null };
    const running = db().routines.find(r => r.member_oid === m.oid && !r.ended_on);
    const d = running?.days[num(index)];
    if (!running || !d) fail(400, 'That day is not in the running routine');
    return { routine_oid: running.oid, day_index: num(index), day_name: d.name };
}

function listWorkouts(ctx: Ctx, m: MemberRow): HttpResponse<unknown> {
    return ok(
        db()
            .workouts.filter(w => w.member_oid === m.oid && w.branch_oid === m.branch_oid)
            .sort((a, b) => b.performed_on.localeCompare(a.performed_on) || b.created_at.localeCompare(a.created_at))
            .slice(0, qInt(ctx, 'limit', 30))
            .map(w => workoutWire(w, ctx.now.date))
    );
}

function log(ctx: Ctx, m: MemberRow, source: WorkoutRow['source']): HttpResponse<unknown> {
    const b = ctx.body;
    checkDate(str(b['performed_on']), ctx.now.date);
    const row: WorkoutRow = {
        oid: newOid('wo'),
        branch_oid: m.branch_oid,
        member_oid: m.oid,
        ...day(m, b['day_index']),
        performed_on: str(b['performed_on']),
        minutes: (b['minutes'] as number | null | undefined) ?? null,
        notes: str(b['notes']) || null,
        source,
        logged_by_name: ctx.user?.name ?? null,
        created_at: ctx.now.iso,
        exercises: sets(ctx, b['exercises'])
    };
    commit({ t: 'put', table: 'workouts', row });
    recordAudit(ctx, 'create', 'workout', row.oid, null, { member: m.code, ...row });
    return ok(workoutWire(row, ctx.now.date), 'Workout logged');
}

function editable(ctx: Ctx, oid: string, memberOid: string | null): WorkoutRow {
    const w = db().workouts.find(x => x.oid === oid && x.branch_oid === ctx.branch!.oid);
    if (!w || (memberOid && w.member_oid !== memberOid)) fail(404, 'Workout not found');
    trainingMember(ctx, w.member_oid, !memberOid);
    if (daysBetween(w.performed_on, ctx.now.date) > EDIT_DAYS) fail(409, `A workout can be changed for ${EDIT_DAYS} days after its date`);
    return w;
}

function update(ctx: Ctx, memberOid: string | null): HttpResponse<unknown> {
    const before = editable(ctx, ctx.params[0] ?? '', memberOid);
    const b = ctx.body;
    if ('performed_on' in b) checkDate(str(b['performed_on']), ctx.now.date);
    const m = idx().members.get(before.member_oid)!;
    const row: WorkoutRow = {
        ...before,
        ...('day_index' in b ? day(m, b['day_index']) : {}),
        performed_on: 'performed_on' in b ? str(b['performed_on']) : before.performed_on,
        minutes: 'minutes' in b ? ((b['minutes'] as number | null) ?? null) : before.minutes,
        notes: 'notes' in b ? str(b['notes']) || null : before.notes,
        exercises: 'exercises' in b ? sets(ctx, b['exercises']) : before.exercises
    };
    commit({ t: 'put', table: 'workouts', row });
    recordAudit(ctx, 'update', 'workout', row.oid, before, row);
    return ok(workoutWire(row, ctx.now.date), 'Workout saved');
}

function remove(ctx: Ctx, memberOid: string | null): HttpResponse<unknown> {
    const w = editable(ctx, ctx.params[0] ?? '', memberOid);
    commit({ t: 'drop', table: 'workouts', oid: w.oid });
    recordAudit(ctx, 'delete', 'workout', w.oid, w, null);
    return ok(null, 'Workout deleted');
}

function progress(ctx: Ctx, m: MemberRow): HttpResponse<unknown> {
    const rows = db().workouts.filter(w => w.member_oid === m.oid && w.branch_oid === m.branch_oid);
    const all = rows.flatMap(w =>
        w.exercises.flatMap(x =>
            x.sets.map(s => ({
                exercise_oid: x.exercise_oid,
                exercise_name: x.name,
                measure: x.measure,
                performed_on: w.performed_on,
                weight_kg: s.weight_kg,
                reps: s.reps,
                seconds: s.seconds,
                distance_m: s.distance_m
            }))
        )
    );
    const first = addDaysIso(weekStart(ctx.now.date), -7 * (WEEKS - 1));
    const monthStart = `${ctx.now.date.slice(0, 8)}01`;
    const result: TrainingProgress = {
        records: personalRecords(all),
        series: progressSeries(all),
        weekly: Array.from({ length: WEEKS }, (_, i) => {
            const week = addDaysIso(first, 7 * i);
            const end = addDaysIso(week, 6);
            return { week, workouts: rows.filter(w => w.performed_on >= week && w.performed_on <= end).length };
        }),
        totals: {
            workouts: rows.length,
            this_month: rows.filter(w => w.performed_on >= monthStart).length,
            first_on: rows.map(w => w.performed_on).sort()[0] ?? null,
            volume_kg: volumeKg(all)
        }
    };
    return ok(result);
}

/* ---------- measurements (D-089) ---------- */

const VIEWS = ['front', 'side', 'back'] as const;
const NUMBERS = ['weight_kg', 'body_fat_pct', 'waist_cm', 'chest_cm', 'hips_cm', 'arm_cm', 'thigh_cm'] as const;

function measurementList(ctx: Ctx, m: MemberRow, staff: boolean): { height_cm: number | null; rows: Measurement[] } {
    // A trainer sees the photos of their own clients only.
    const photos = !staff || !selfOnly(ctx) || (!!m.trainer_oid && m.trainer_oid === ctx.account?.trainer_oid);
    const height = m.height_cm ?? null;
    const rows = db()
        .measurements.filter(r => r.member_oid === m.oid && r.branch_oid === m.branch_oid)
        .sort((a, b) => b.measured_on.localeCompare(a.measured_on) || b.created_at.localeCompare(a.created_at))
        .map((r): Measurement => {
            const ids = { front: r.photo_front_oid, side: r.photo_side_oid, back: r.photo_back_oid };
            const count = VIEWS.filter(v => ids[v]).length;
            return {
                oid: r.oid,
                measured_on: r.measured_on,
                weight_kg: r.weight_kg,
                body_fat_pct: r.body_fat_pct,
                waist_cm: r.waist_cm,
                chest_cm: r.chest_cm,
                hips_cm: r.hips_cm,
                arm_cm: r.arm_cm,
                thigh_cm: r.thigh_cm,
                bmi: bmi(r.weight_kg, height),
                photos: { front: photos ? fileUrl(ids.front) : null, side: photos ? fileUrl(ids.side) : null, back: photos ? fileUrl(ids.back) : null },
                photo_count: count,
                photos_hidden: !photos && count > 0,
                notes: r.notes,
                source: r.source,
                recorded_by_name: r.recorded_by_name,
                created_at: r.created_at,
                deletable: staff || (r.source === 'member' && daysBetween(r.measured_on, ctx.now.date) <= MEMBER_DELETE_DAYS)
            };
        });
    return { height_cm: height, rows };
}

function record(ctx: Ctx, m: MemberRow, source: MeasurementRow['source'], staff: boolean): HttpResponse<unknown> {
    const b = ctx.body;
    const date = str(b['measured_on']);
    if (!date) fail(400, 'A date as YYYY-MM-DD');
    if (date > ctx.now.date) fail(400, 'A measurement cannot be in the future');
    if (daysBetween(date, ctx.now.date) > 30) fail(400, 'Record a measurement within 30 days');
    const value = (k: string): number | null => (typeof b[k] === 'number' ? b[k] : null);
    const photo = (k: string): string | null => str(b[k]) || null;
    const photos = [photo('photo_front_oid'), photo('photo_side_oid'), photo('photo_back_oid')].filter((x): x is string => !!x);
    if (!NUMBERS.some(k => value(k) !== null) && !photos.length) fail(400, 'Enter at least one measurement or photo');
    if (new Set(photos).size !== photos.length) fail(400, 'Use a different photo for each view');
    for (const p of photos) claim(ctx, p, 'measurement_photo', m.oid);
    if (value('height_cm') !== null) commit({ t: 'member.update', oid: m.oid, patch: { height_cm: value('height_cm') } });
    const row: MeasurementRow = {
        oid: newOid('ms'),
        branch_oid: m.branch_oid,
        member_oid: m.oid,
        measured_on: date,
        weight_kg: value('weight_kg'),
        body_fat_pct: value('body_fat_pct'),
        waist_cm: value('waist_cm'),
        chest_cm: value('chest_cm'),
        hips_cm: value('hips_cm'),
        arm_cm: value('arm_cm'),
        thigh_cm: value('thigh_cm'),
        photo_front_oid: photo('photo_front_oid'),
        photo_side_oid: photo('photo_side_oid'),
        photo_back_oid: photo('photo_back_oid'),
        notes: str(b['notes']) || null,
        source,
        recorded_by_name: ctx.user?.name ?? null,
        created_at: ctx.now.iso
    };
    commit({ t: 'put', table: 'measurements', row });
    // Which fields, not the values (as the API: body data stays out of the audit log).
    recordAudit(ctx, 'create', 'measurement', row.oid, null, {
        member: m.code,
        measured_on: date,
        source,
        recorded: NUMBERS.filter(k => row[k] !== null),
        photos: photos.length
    });
    return ok(measurementList(ctx, m, staff), 'Measurement saved');
}

function dropMeasurement(ctx: Ctx, memberOid: string | null): HttpResponse<unknown> {
    const r = db().measurements.find(x => x.oid === ctx.params[0] && x.branch_oid === ctx.branch!.oid);
    if (!r || (memberOid && r.member_oid !== memberOid)) fail(404, 'Measurement not found');
    trainingMember(ctx, r.member_oid, !memberOid);
    if (memberOid && (r.source !== 'member' || daysBetween(r.measured_on, ctx.now.date) > MEMBER_DELETE_DAYS)) {
        fail(409, `You can delete your own entries for ${MEMBER_DELETE_DAYS} days. Ask the desk for older ones.`);
    }
    commit({ t: 'drop', table: 'measurements', oid: r.oid });
    for (const f of [r.photo_front_oid, r.photo_side_oid, r.photo_back_oid]) if (f) commit({ t: 'file.patch', oid: f, patch: { status: 'deleted' } });
    recordAudit(ctx, 'delete', 'measurement', r.oid, { measured_on: r.measured_on, source: r.source }, null);
    return ok(null, 'Measurement deleted');
}

/* ---------- the portal's own photo uploads ---------- */

function portalStartFile(ctx: Ctx): HttpResponse<unknown> {
    const { m, c } = home(ctx);
    if (str(ctx.body['kind']) !== 'measurement_photo') fail(400, 'Only progress photos');
    const type = str(ctx.body['content_type']).toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) fail(415, 'A progress photo is a JPEG, PNG or WebP of at most 300 KB');
    if (num(ctx.body['size']) > 300 * 1024) fail(413, 'A progress photo is a JPEG, PNG or WebP of at most 300 KB');
    const oid = newOid('file');
    commit({
        t: 'file.add',
        row: {
            oid,
            branch_oid: m.branch_oid,
            member_oid: m.oid,
            kind: 'measurement_photo',
            name: str(ctx.body['name']),
            content_type: type,
            size_bytes: num(ctx.body['size']),
            status: 'pending',
            url: null,
            created_at: c.now.iso,
            created_by_name: m.name
        }
    });
    return ok(
        {
            file: { oid, status: 'pending', branch_oid: m.branch_oid, member_oid: m.oid },
            upload: {
                url: `${environment.apiBaseUrl}/v1/files/${oid}/content?token=mock`,
                method: 'PUT',
                headers: { 'Content-Type': type },
                expires_at: c.now.iso
            }
        },
        'Upload the file to the URL given'
    );
}

function portalCompleteFile(ctx: Ctx): HttpResponse<unknown> {
    const { m, c } = home(ctx);
    const row = db().files?.find(f => f.oid === ctx.params[0] && f.branch_oid === m.branch_oid);
    if (!row) fail(404, 'File not found');
    if (row.kind !== 'measurement_photo' || row.member_oid !== m.oid) fail(403, 'You do not have permission to do this');
    const blob = takeUpload(row.oid);
    if (!blob && !row.url) fail(409, 'The file has not arrived yet. Upload it, then try again.');
    if (blob) {
        commit({ t: 'file.patch', oid: row.oid, patch: { url: URL.createObjectURL(blob), status: 'ready' } });
        recordAudit(c, 'create', 'file', row.oid, null, { kind: row.kind, name: row.name });
    }
    return ok({ ...row }, 'File saved');
}

/* ---------- routes ---------- */

const staffMember = (ctx: Ctx): MemberRow => branchMember(ctx, ctx.params[0] ?? '');

export const TRAINING_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/exercises$/, scope: 'staff', can: ['read', 'Exercise'], handler: exercises },
    { method: 'GET', path: /^\/v1\/exercises\/([\w-]+)$/, scope: 'staff', can: ['read', 'Exercise'], handler: exercise },
    { method: 'POST', path: /^\/v1\/exercises$/, scope: 'staff', can: ['create', 'Exercise'], handler: createExercise },
    { method: 'PATCH', path: /^\/v1\/exercises\/([\w-]+)$/, scope: 'staff', can: ['update', 'Exercise'], handler: updateExercise },
    { method: 'GET', path: /^\/v1\/routines$/, scope: 'staff', can: ['read', 'Routine'], handler: templates },
    { method: 'GET', path: /^\/v1\/routines\/([\w-]+)$/, scope: 'staff', can: ['read', 'Routine'], handler: routine },
    { method: 'POST', path: /^\/v1\/routines$/, scope: 'staff', can: ['create', 'Routine'], handler: createTemplate },
    { method: 'PATCH', path: /^\/v1\/routines\/([\w-]+)$/, scope: 'staff', can: ['update', 'Routine'], handler: updateRoutine },

    { method: 'GET', path: /^\/v1\/members\/([\w-]+)\/routine$/, scope: 'branch', can: ['read', 'Routine'], handler: getMemberRoutine },
    { method: 'POST', path: /^\/v1\/members\/([\w-]+)\/routine$/, scope: 'branch', can: ['create', 'Routine'], handler: assign },
    {
        method: 'POST',
        path: /^\/v1\/members\/([\w-]+)\/routine\/end$/,
        scope: 'branch',
        can: ['update', 'Routine'],
        handler: ctx => end(ctx, trainingMember(ctx, ctx.params[0] ?? '', true))
    },
    {
        method: 'GET',
        path: /^\/v1\/members\/([\w-]+)\/workouts$/,
        scope: 'branch',
        can: ['read', 'Workout'],
        handler: ctx => listWorkouts(ctx, staffMember(ctx))
    },
    {
        method: 'POST',
        path: /^\/v1\/members\/([\w-]+)\/workouts$/,
        scope: 'branch',
        can: ['create', 'Workout'],
        handler: ctx => log(ctx, trainingMember(ctx, ctx.params[0] ?? '', true), staffSource(ctx))
    },
    { method: 'PATCH', path: /^\/v1\/workouts\/([\w-]+)$/, scope: 'branch', can: ['update', 'Workout'], handler: ctx => update(ctx, null) },
    { method: 'DELETE', path: /^\/v1\/workouts\/([\w-]+)$/, scope: 'branch', can: ['update', 'Workout'], handler: ctx => remove(ctx, null) },
    { method: 'GET', path: /^\/v1\/members\/([\w-]+)\/progress$/, scope: 'branch', can: ['read', 'Workout'], handler: ctx => progress(ctx, staffMember(ctx)) },
    {
        method: 'GET',
        path: /^\/v1\/members\/([\w-]+)\/measurements$/,
        scope: 'branch',
        can: ['read', 'Measurement'],
        handler: ctx => ok(measurementList(ctx, staffMember(ctx), true))
    },
    {
        method: 'POST',
        path: /^\/v1\/members\/([\w-]+)\/measurements$/,
        scope: 'branch',
        can: ['create', 'Measurement'],
        handler: ctx => record(ctx, trainingMember(ctx, ctx.params[0] ?? '', true), staffSource(ctx), true)
    },
    { method: 'DELETE', path: /^\/v1\/measurements\/([\w-]+)$/, scope: 'branch', can: ['update', 'Measurement'], handler: ctx => dropMeasurement(ctx, null) },

    { method: 'GET', path: /^\/v1\/me\/exercises$/, scope: 'member', can: ['read', 'Portal'], handler: ctx => ok(listExercises(ctx, home(ctx).m.branch_oid)) },
    { method: 'GET', path: /^\/v1\/me\/routine$/, scope: 'member', can: ['read', 'Portal'], handler: ctx => ok(memberRoutine(home(ctx).m)) },
    {
        method: 'GET',
        path: /^\/v1\/me\/routine\/templates$/,
        scope: 'member',
        can: ['read', 'Portal'],
        handler: ctx => {
            const { c } = home(ctx);
            return ok(
                db()
                    .routines.filter(r => r.member_oid === null && r.active && r.branch_oid === hqOid())
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(r => routineWire(r, c.branch!.oid))
            );
        }
    },
    {
        method: 'POST',
        path: /^\/v1\/me\/routine$/,
        scope: 'member',
        can: ['create', 'Portal'],
        handler: ctx => {
            const { m, c } = home(ctx);
            const running = db().routines.find(r => r.member_oid === m.oid && !r.ended_on);
            if (running && running.assigned_by !== 'member')
                fail(409, `Your trainer set your routine (${running.name}). Ask them to change it, or end it first.`);
            const t = templateFor(c, str(ctx.body['template_oid']), true);
            start(c, m, t, t, 'member', null);
            return ok(memberRoutine(m), 'Routine started');
        }
    },
    {
        method: 'POST',
        path: /^\/v1\/me\/routine\/end$/,
        scope: 'member',
        can: ['update', 'Portal'],
        handler: ctx => {
            const { m, c } = home(ctx);
            return end(c, m);
        }
    },
    { method: 'GET', path: /^\/v1\/me\/workouts$/, scope: 'member', can: ['read', 'Portal'], handler: ctx => listWorkouts(ctx, home(ctx).m) },
    {
        method: 'POST',
        path: /^\/v1\/me\/workouts$/,
        scope: 'member',
        can: ['create', 'Portal'],
        handler: ctx => {
            const { m, c } = home(ctx);
            return log(c, m, 'member');
        }
    },
    {
        method: 'PATCH',
        path: /^\/v1\/me\/workouts\/([\w-]+)$/,
        scope: 'member',
        can: ['update', 'Portal'],
        handler: ctx => {
            const { m, c } = home(ctx);
            return update(c, m.oid);
        }
    },
    {
        method: 'DELETE',
        path: /^\/v1\/me\/workouts\/([\w-]+)$/,
        scope: 'member',
        can: ['delete', 'Portal'],
        handler: ctx => {
            const { m, c } = home(ctx);
            return remove(c, m.oid);
        }
    },
    { method: 'GET', path: /^\/v1\/me\/progress$/, scope: 'member', can: ['read', 'Portal'], handler: ctx => progress(ctx, home(ctx).m) },
    {
        method: 'GET',
        path: /^\/v1\/me\/measurements$/,
        scope: 'member',
        can: ['read', 'Portal'],
        handler: ctx => {
            const { m, c } = home(ctx);
            return ok(measurementList(c, m, false));
        }
    },
    {
        method: 'POST',
        path: /^\/v1\/me\/measurements$/,
        scope: 'member',
        can: ['create', 'Portal'],
        handler: ctx => {
            const { m, c } = home(ctx);
            return record(c, m, 'member', false);
        }
    },
    {
        method: 'DELETE',
        path: /^\/v1\/me\/measurements\/([\w-]+)$/,
        scope: 'member',
        can: ['delete', 'Portal'],
        handler: ctx => {
            const { m, c } = home(ctx);
            return dropMeasurement(c, m.oid);
        }
    },
    { method: 'POST', path: /^\/v1\/me\/files$/, scope: 'member', can: ['create', 'Portal'], handler: portalStartFile },
    { method: 'POST', path: /^\/v1\/me\/files\/([\w-]+)\/complete$/, scope: 'member', can: ['create', 'Portal'], handler: portalCompleteFile }
];

/** A member's training rows, for a transfer (they move) and "delete my data" (they go, with the photos). */
export const memberTraining = {
    move(memberOid: string, toBranchOid: string, today: string): void {
        for (const r of db().routines.filter(x => x.member_oid === memberOid)) {
            commit({ t: 'patch', table: 'routines', oid: r.oid, patch: { branch_oid: toBranchOid, ended_on: r.ended_on ?? today } });
        }
        for (const w of db().workouts.filter(x => x.member_oid === memberOid))
            commit({ t: 'patch', table: 'workouts', oid: w.oid, patch: { branch_oid: toBranchOid } });
        for (const x of db().measurements.filter(y => y.member_oid === memberOid))
            commit({ t: 'patch', table: 'measurements', oid: x.oid, patch: { branch_oid: toBranchOid } });
    },
    remove(memberOid: string): void {
        for (const x of db().measurements.filter(y => y.member_oid === memberOid)) commit({ t: 'drop', table: 'measurements', oid: x.oid });
        for (const w of db().workouts.filter(x => x.member_oid === memberOid)) commit({ t: 'drop', table: 'workouts', oid: w.oid });
        for (const r of db().routines.filter(x => x.member_oid === memberOid)) commit({ t: 'drop', table: 'routines', oid: r.oid });
        for (const f of db().files?.filter(x => x.member_oid === memberOid && x.kind === 'measurement_photo') ?? []) {
            commit({ t: 'file.patch', oid: f.oid, patch: { status: 'deleted' } });
        }
        commit({ t: 'member.update', oid: memberOid, patch: { height_cm: null } });
    }
};
