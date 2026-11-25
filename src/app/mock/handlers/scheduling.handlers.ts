import type { HttpResponse } from '@angular/common/http';

import type { Booking, BookingStatus, ClassSession, ClassSessionDetail, ClassType, Trainer } from '@core/models/class.model';
import type { Invoice } from '@core/models/payment.model';
import type { ClassRule, Locker, MemberPt, PtPackage, PtSession } from '@core/models/scheduling.model';

import { recordAudit } from '../audit';
import { endOf, firstClosedDay, freeSlots, type OpeningHours, overlaps, WEEKDAY_NAMES, withinHours } from '../domain/hours';
import { endDate, quote } from '../domain/pricing';
import { type Ctx, fail, num, ok, qInt, qStr, type Route, str } from '../http';
import { idx, memberState } from '../queries';
import { materialise } from '../seed/classes.seed';
import { addDaysIso, at, dateOf, timeOf, weekdayOf, weekStart } from '../seed/clock';
import { toRef } from '../seed/organisation.seed';
import type { MockAccount } from '../seed/staff.seed';
import { commit, db, newOid } from '../store';
import type { BlockRow, LockerRow, MemberRow, MessageRow, MockDb, PtRow, RentalRow, RoomRow, RuleRow } from '../types';
import { branchMember } from './members.handlers';

/**
 * Scheduling in demo mode: the API's scheduling routes, on the mock's tables, with the same rules
 * (fitmanager-api src/features/scheduling). Sessions are made from the weekly rules when the timetable is read and
 * kept by `put` (a reload makes them again with the same oids); bookings left Booked become no-shows when read.
 */
const FILL_DAYS = 28;
const ARRIVAL_MINUTES = 30;
const rules = (): MockDb['settings'] => db().settings;
const hoursOf = (branchOid: string): OpeningHours[] => db().branches.find(b => b.oid === branchOid)?.hours ?? [];
const plusMinutes = (iso: string, minutes: number): string => {
    const t = Date.parse(iso) + minutes * 60_000;
    const local = new Date(t + 6 * 3_600_000).toISOString();
    return `${local.slice(0, 19)}+06:00`;
};
const hoursBefore = (iso: string, nowIso: string): number => (Date.parse(iso) - Date.parse(nowIso)) / 3_600_000;
const short = (date: string): string =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const clock12 = (hhmm: string): string => {
    const [h = 0, m = 0] = hhmm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/* ---------- shared ---------- */

function trainersAt(branchOid: string): Trainer[] {
    const assigned = new Set(
        db()
            .accounts.filter(a => a.user.assignments.some(x => x.branch.oid === branchOid && x.role === 'TRAINER'))
            .map(a => a.username)
    );
    const clients = (t: Trainer): number => db().members.filter(m => m.trainer_oid === t.oid && !m.anonymised).length;
    return db()
        .trainers.filter(t => t.branch_oid === branchOid || (t.username && assigned.has(t.username)))
        .map(t => ({ ...t, clients: clients(t) }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function trainerAt(ctx: Ctx, oid: string): Trainer {
    const t = trainersAt(ctx.branch!.oid).find(x => x.oid === oid);
    if (!t) fail(404, 'Trainer not found');
    return t;
}

/** A trainer at this branch (role TRAINER) is narrowed to their own profile, classes and PT. */
function selfOnly(ctx: Ctx): string | null {
    const role = ctx.user?.assignments.find(a => a.branch.oid === ctx.branch?.oid)?.role;
    return role === 'TRAINER' ? (ctx.account?.trainer_oid ?? '-') : null;
}

function onLeave(trainerOid: string, date: string): boolean {
    return db().leave.some(l => l.trainer_oid === trainerOid && !l.removed && l.from_date <= date && date <= l.to_date);
}

function roomBlocked(roomOid: string | null, from: string, to: string): BlockRow | undefined {
    return roomOid ? db().blocks.find(b => b.room_oid === roomOid && !b.removed && overlaps(from, to, b.starts_at, b.ends_at)) : undefined;
}

function withBlocked(s: ClassSession): ClassSession {
    return { ...s, blocked: !!roomBlocked(s.room_oid ?? null, s.starts_at, s.ends_at) };
}

/** No-shows and lapsed waitlist places when the class is over or started; PT left Booked is done. */
function settle(ctx: Ctx, branchOid: string): void {
    const d = db();
    const ended = new Set(d.sessions.filter(s => s.branch_oid === branchOid && s.ends_at <= ctx.now.iso).map(s => s.oid));
    const started = new Set(d.sessions.filter(s => s.branch_oid === branchOid && s.starts_at <= ctx.now.iso).map(s => s.oid));
    for (const b of d.bookings) {
        if (b.status === 'Booked' && ended.has(b.session_oid)) commit({ t: 'patch', table: 'bookings', oid: b.oid, patch: { status: 'NoShow' } });
        else if (b.status === 'Waitlist' && started.has(b.session_oid)) commit({ t: 'patch', table: 'bookings', oid: b.oid, patch: { status: 'Cancelled' } });
    }
    for (const p of d.ptSessions)
        if (p.branch_oid === branchOid && p.status === 'Booked' && p.ends_at <= ctx.now.iso)
            commit({ t: 'patch', table: 'ptSessions', oid: p.oid, patch: { status: 'Completed' } });
}

function fill(ctx: Ctx, branchOid: string, from: string, to: string): void {
    const last = addDaysIso(ctx.now.date, FILL_DAYS);
    if (from <= last) materialise(db(), branchOid, from, to < last ? to : last);
}

function sessionAt(ctx: Ctx, oid: string): ClassSession {
    const s = db().sessions.find(x => x.oid === oid && x.branch_oid === ctx.branch!.oid);
    if (!s) fail(404, 'Class not found');
    return s;
}

function notify(member: MemberRow, kind: MessageRow['kind'], subject: string, body: string, at: string): void {
    commit({
        t: 'put',
        table: 'messages',
        row: { oid: newOid('msg'), member_oid: member.oid, kind, subject, body: `Dear ${member.name}, ${body}`, created_at: at }
    });
}

/* ---------- timetable ---------- */

function schedule(ctx: Ctx): HttpResponse<unknown> {
    const b = ctx.branch!.oid;
    const from = weekStart(qStr(ctx, 'week') || ctx.now.date);
    const to = addDaysIso(from, 6);
    settle(ctx, b);
    fill(ctx, b, from, to);
    const trainer = qStr(ctx, 'trainer');
    const sessions = db()
        .sessions.filter(s => s.branch_oid === b && dateOf(s.starts_at) >= from && dateOf(s.starts_at) <= to && (!trainer || s.trainer_oid === trainer))
        .sort((a, c) => (a.starts_at < c.starts_at ? -1 : 1))
        .map(withBlocked);
    return ok({
        from,
        to,
        sessions,
        types: db().classTypes,
        trainers: trainersAt(b).filter(t => t.active !== false),
        rooms: db().rooms.filter(r => r.branch_oid === b),
        my_trainer_oid: ctx.account?.trainer_oid ?? null
    });
}

function detailOf(s: ClassSession): ClassSessionDetail {
    const list = db().bookings.filter(b => b.session_oid === s.oid && b.status !== 'Cancelled');
    return {
        ...withBlocked(s),
        roster: list.filter(b => b.status !== 'Waitlist'),
        waitlisted: list.filter(b => b.status === 'Waitlist').sort((a, b) => (a.booked_at < b.booked_at ? -1 : 1))
    };
}

function sessionDetail(ctx: Ctx): HttpResponse<unknown> {
    settle(ctx, ctx.branch!.oid);
    return ok(detailOf(sessionAt(ctx, ctx.params[0])));
}

function blockedUntil(memberOid: string, nowIso: string): string | null {
    const r = rules();
    const since = plusMinutes(nowIso, -r.noshow_window_days * 1440);
    const strikes = db()
        .bookings.filter(b => b.member_oid === memberOid && (b.status === 'NoShow' || b.late_cancel))
        .map(b => db().sessions.find(s => s.oid === b.session_oid)?.starts_at ?? '')
        .filter(t => t >= since)
        .sort()
        .reverse();
    if (strikes.length < r.noshow_limit) return null;
    const until = plusMinutes(strikes[0], r.noshow_block_days * 1440);
    return until > nowIso ? until : null;
}

/** The booking rules, in the API's order. */
export function bookOn(ctx: Ctx, sessionOid: string, memberOid: string, source: 'portal' | 'desk'): Booking {
    const s = db().sessions.find(x => x.oid === sessionOid);
    if (!s) fail(404, 'Class not found');
    const m = idx().members.get(memberOid);
    if (m?.branch_oid !== s.branch_oid || m.anonymised) fail(404, 'Member not found');
    if (s.cancelled) fail(409, `This class was cancelled: ${s.cancel_reason ?? ''}`.trim());
    if (s.starts_at <= ctx.now.iso) fail(409, 'This class has already started.');
    if (roomBlocked(s.room_oid ?? null, s.starts_at, s.ends_at)) fail(409, `${s.room} is closed for maintenance at that time.`);
    const r = rules();
    if (dateOf(s.starts_at) > addDaysIso(ctx.now.date, r.booking_open_days)) fail(409, `Classes open for booking ${r.booking_open_days} days ahead.`);
    const state = memberState(m, ctx.now.date);
    if (state.status !== 'Active') fail(409, `${m.name} has no running membership (${state.status.toLowerCase()}).`);
    if (s.ladies_only && m.gender !== 'Female') fail(409, 'This is a ladies-only class.');
    const dupe = db().bookings.find(b => b.session_oid === s.oid && b.member_oid === m.oid && b.status !== 'Cancelled');
    if (dupe) fail(409, `${m.name} is already ${dupe.status === 'Waitlist' ? 'on the waitlist' : 'booked'} for this class.`);
    const until = blockedUntil(m.oid, ctx.now.iso);
    if (until) fail(409, `${m.name} missed ${r.noshow_limit} classes in ${r.noshow_window_days} days, so booking is paused until ${short(dateOf(until))}.`);
    const active = db().bookings.filter(
        b =>
            b.member_oid === m.oid &&
            (b.status === 'Booked' || b.status === 'Waitlist') &&
            (db().sessions.find(x => x.oid === b.session_oid)?.starts_at ?? '') > ctx.now.iso
    ).length;
    if (active >= r.booking_max_active) fail(409, `A member can hold at most ${r.booking_max_active} upcoming bookings.`);
    const booking: Booking = {
        oid: newOid('bk'),
        session_oid: s.oid,
        member_oid: m.oid,
        member_name: m.name,
        member_code: m.code,
        status: s.booked < s.capacity ? 'Booked' : 'Waitlist',
        late_cancel: false,
        source,
        booked_at: ctx.now.iso
    };
    commit({ t: 'put', table: 'sessions', row: s });
    commit({ t: 'put', table: 'bookings', row: booking });
    recordAudit(ctx, 'book', 'booking', `${m.code}/${s.title} ${dateOf(s.starts_at)}`, null, booking);
    return booking;
}

function promote(ctx: Ctx, s: ClassSession): void {
    if (s.cancelled || s.starts_at <= ctx.now.iso) return;
    let free = s.capacity - s.booked;
    for (const b of detailOf(s).waitlisted) {
        if (free-- <= 0) break;
        commit({ t: 'patch', table: 'bookings', oid: b.oid, patch: { status: 'Booked' } });
        const m = idx().members.get(b.member_oid);
        if (m) notify(m, 'waitlist_promoted', `You are in: ${s.title}`, `a place came free and you are now booked for ${s.title}.`, ctx.now.iso);
    }
}

function cancelBooking(ctx: Ctx, b: Booking): string {
    if (b.status !== 'Booked' && b.status !== 'Waitlist') fail(409, 'Only an upcoming booking can be cancelled.');
    const s = sessionAt(ctx, b.session_oid);
    if (s.starts_at <= ctx.now.iso) fail(409, 'The class has started: mark attendance instead.');
    const r = rules();
    const late = b.status === 'Booked' && hoursBefore(s.starts_at, ctx.now.iso) < r.booking_cancel_hours;
    commit({ t: 'patch', table: 'bookings', oid: b.oid, patch: { status: 'Cancelled', late_cancel: late } });
    recordAudit(ctx, late ? 'late_cancel' : 'cancel', 'booking', `${b.member_code}/${s.title}`, b, { status: 'Cancelled', late_cancel: late });
    if (b.status === 'Booked') promote(ctx, s);
    return late
        ? `Cancelled less than ${r.booking_cancel_hours} hours before the class: it counts as a missed class.`
        : b.status === 'Waitlist'
          ? 'Taken off the waitlist'
          : 'Booking cancelled';
}

function deskBook(ctx: Ctx): HttpResponse<unknown> {
    const s = sessionAt(ctx, ctx.params[0]);
    const booking = bookOn(ctx, s.oid, str(ctx.body['member_oid']), 'desk');
    return ok(booking, booking.status === 'Waitlist' ? `${booking.member_name} added to the waitlist` : `${booking.member_name} booked`);
}

function setBooking(ctx: Ctx): HttpResponse<unknown> {
    const b = db().bookings.find(x => x.oid === ctx.params[0] && x.oid);
    if (!b) fail(404, 'Booking not found');
    const s = sessionAt(ctx, b.session_oid);
    const mine = selfOnly(ctx);
    if (mine && s.trainer_oid !== mine) fail(403, 'Trainers mark only their own classes');
    const status = str(ctx.body['status']) as BookingStatus;
    if (!['Booked', 'Attended', 'NoShow', 'Cancelled'].includes(status)) fail(400, 'Unknown booking status');
    if (status === 'Cancelled') return ok(null, cancelBooking(ctx, b));
    if (status === 'Booked') {
        if (b.status !== 'Waitlist') fail(409, 'Only someone on the waitlist can be moved in.');
        if (s.booked >= s.capacity) fail(409, 'The class is full. Cancel a booking first, or raise the capacity.');
    } else {
        if (b.status === 'Waitlist') fail(409, 'Move the member in from the waitlist first.');
        if (dateOf(s.starts_at) > ctx.now.date) fail(409, 'Attendance is marked on the day of the class.');
    }
    commit({ t: 'patch', table: 'bookings', oid: b.oid, patch: { status } });
    recordAudit(ctx, status === 'Booked' ? 'promote' : `mark_${status.toLowerCase()}`, 'booking', b.member_code, b, { status });
    return ok(
        { ...b, status },
        status === 'Booked' ? `${b.member_name} moved from the waitlist` : `Marked ${status === 'NoShow' ? 'no-show' : status.toLowerCase()}`
    );
}

/** For check-in: a booked class from 30 minutes before its start until its end is marked Attended. */
export function markArrival(memberOid: string, branchOid: string, nowIso: string): string[] {
    const titles: string[] = [];
    for (const b of db().bookings) {
        if (b.member_oid !== memberOid || b.status !== 'Booked') continue;
        const s = db().sessions.find(x => x.oid === b.session_oid);
        if (s?.branch_oid !== branchOid || s.cancelled) continue;
        if (plusMinutes(s.starts_at, -ARRIVAL_MINUTES) <= nowIso && nowIso < s.ends_at) {
            commit({ t: 'patch', table: 'bookings', oid: b.oid, patch: { status: 'Attended' } });
            titles.push(s.title);
        }
    }
    return titles;
}

/* ---------- rules, one-off classes, changes ---------- */

function ruleWire(r: RuleRow): ClassRule {
    const type = db().classTypes.find(t => t.oid === r.class_type_oid);
    return {
        ...r,
        type_name: type?.name ?? 'Class',
        color: type?.color ?? 'blue',
        trainer_name: db().trainers.find(t => t.oid === r.trainer_oid)?.name ?? 'Trainer',
        room_name: db().rooms.find(x => x.oid === r.room_oid)?.name ?? 'Room',
        end_time: endOf(r.start_time, r.minutes)
    };
}

function checkTrainerRoom(ctx: Ctx, trainerOid: string, roomOid: string, capacity: number, ladies: boolean): { trainer: Trainer; room: RoomRow } {
    const trainer = trainersAt(ctx.branch!.oid).find(t => t.oid === trainerOid && t.active !== false);
    if (!trainer) fail(400, 'The trainer does not work at this branch');
    if (ladies && trainer.gender !== 'Female') fail(400, 'A ladies-only class has a female trainer');
    const room = db().rooms.find(r => r.oid === roomOid && r.branch_oid === ctx.branch!.oid && r.active);
    if (!room) fail(400, 'Choose an open room at this branch');
    if (capacity > room.capacity) fail(400, `${room.name} holds ${room.capacity}`);
    return { trainer, room };
}

function checkRule(ctx: Ctx, r: RuleRow, except: string | null): void {
    checkTrainerRoom(ctx, r.trainer_oid, r.room_oid, r.capacity, r.ladies_only);
    const end = endOf(r.start_time, r.minutes);
    if (!end) fail(400, 'The class must end by midnight');
    const closed = firstClosedDay(hoursOf(ctx.branch!.oid), r.weekdays, r.start_time, end);
    if (closed !== null) fail(400, `${ctx.branch!.name} is not open for the whole class on ${WEEKDAY_NAMES[closed]}`);
    const clash = db().rules.find(
        o =>
            o.branch_oid === ctx.branch!.oid &&
            o.active &&
            o.oid !== except &&
            (o.trainer_oid === r.trainer_oid || o.room_oid === r.room_oid) &&
            o.weekdays.some(x => r.weekdays.includes(x)) &&
            overlaps(r.start_time, end, o.start_time, endOf(o.start_time, o.minutes) ?? '24:00')
    );
    if (clash) {
        const w = ruleWire(clash);
        const day = WEEKDAY_NAMES[clash.weekdays.find(x => r.weekdays.includes(x)) ?? 0];
        fail(409, `${clash.room_oid === r.room_oid ? w.room_name : w.trainer_name} already has ${w.type_name} on ${day} at ${clock12(clash.start_time)}.`);
    }
}

function listRules(ctx: Ctx): HttpResponse<unknown> {
    return ok(
        db()
            .rules.filter(r => r.branch_oid === ctx.branch!.oid)
            .sort((a, b) => Number(b.active) - Number(a.active) || a.start_time.localeCompare(b.start_time))
            .map(ruleWire)
    );
}

function createRule(ctx: Ctx): HttpResponse<unknown> {
    const type = db().classTypes.find(t => t.oid === str(ctx.body['class_type_oid']) && t.active !== false);
    if (!type) fail(400, 'Choose an active class type');
    const weekdays = [...new Set((ctx.body['weekdays'] as number[] | undefined) ?? [])].sort();
    if (!weekdays.length) fail(400, 'Pick at least one day');
    const rule: RuleRow = {
        oid: newOid('rl'),
        branch_oid: ctx.branch!.oid,
        class_type_oid: type.oid,
        trainer_oid: str(ctx.body['trainer_oid']),
        room_oid: str(ctx.body['room_oid']),
        weekdays,
        start_time: str(ctx.body['start_time']),
        minutes: num(ctx.body['minutes']) || type.minutes,
        capacity: num(ctx.body['capacity']),
        ladies_only: ctx.body['ladies_only'] === true,
        valid_from: str(ctx.body['valid_from']) || ctx.now.date,
        valid_to: str(ctx.body['valid_to']) || null,
        active: true
    };
    if (!/^\d\d:\d\d$/.test(rule.start_time)) fail(400, 'A time as HH:mm');
    if (rule.capacity < 1) fail(400, 'At least 1 place');
    checkRule(ctx, rule, null);
    commit({ t: 'put', table: 'rules', row: rule });
    recordAudit(ctx, 'create', 'class_schedule', rule.oid, null, ruleWire(rule));
    return ok(ruleWire(rule), 'Weekly class added');
}

function updateRule(ctx: Ctx): HttpResponse<unknown> {
    const before = db().rules.find(r => r.oid === ctx.params[0] && r.branch_oid === ctx.branch!.oid);
    if (!before) fail(404, 'Class rule not found');
    const b = ctx.body;
    const next: RuleRow = {
        ...before,
        ...(b['trainer_oid'] ? { trainer_oid: str(b['trainer_oid']) } : {}),
        ...(b['room_oid'] ? { room_oid: str(b['room_oid']) } : {}),
        ...(Array.isArray(b['weekdays']) ? { weekdays: [...new Set(b['weekdays'] as number[])].sort() } : {}),
        ...(b['start_time'] ? { start_time: str(b['start_time']) } : {}),
        ...(b['minutes'] ? { minutes: num(b['minutes']) } : {}),
        ...(b['capacity'] ? { capacity: num(b['capacity']) } : {}),
        ...('ladies_only' in b ? { ladies_only: b['ladies_only'] === true } : {}),
        ...('valid_to' in b ? { valid_to: str(b['valid_to']) || null } : {}),
        ...('active' in b ? { active: b['active'] !== false } : {})
    };
    if (next.active) checkRule(ctx, next, next.oid);
    commit({ t: 'put', table: 'rules', row: next });
    let changed = 0;
    let cancelled = 0;
    for (const s of db().sessions.filter(x => x.schedule_oid === next.oid && !x.detached && !x.cancelled && x.starts_at > ctx.now.iso)) {
        const date = dateOf(s.starts_at);
        const runs = next.active && next.weekdays.includes(weekdayOf(date)) && (!next.valid_to || date <= next.valid_to);
        if (s.booked + s.waitlist === 0) commit({ t: 'drop', table: 'sessions', oid: s.oid });
        else if (runs) {
            const start = Number(next.start_time.slice(0, 2)) * 60 + Number(next.start_time.slice(3));
            commit({
                t: 'put',
                table: 'sessions',
                row: {
                    ...s,
                    trainer_oid: next.trainer_oid,
                    trainer_name: db().trainers.find(t => t.oid === next.trainer_oid)?.name ?? s.trainer_name,
                    room_oid: next.room_oid,
                    room: db().rooms.find(r => r.oid === next.room_oid)?.name ?? s.room,
                    capacity: next.capacity,
                    ladies_only: next.ladies_only,
                    starts_at: at(date, start),
                    ends_at: at(date, start + next.minutes),
                    detached: true
                }
            });
            changed++;
        } else {
            cancelIn(ctx, s, 'The timetable changed');
            cancelled++;
        }
    }
    recordAudit(ctx, 'update', 'class_schedule', next.oid, ruleWire(before), ruleWire(next));
    return ok(
        { ...ruleWire(next), sessions_changed: changed, sessions_cancelled: cancelled },
        cancelled ? `Saved. ${cancelled} booked classes were cancelled and their members told.` : 'Weekly class saved'
    );
}

function checkDated(
    ctx: Ctx,
    date: string,
    startTime: string,
    minutes: number,
    trainerOid: string,
    roomOid: string,
    except: string | null
): { from: string; to: string } {
    const end = endOf(startTime, minutes);
    if (!end) fail(400, 'The class must end by midnight');
    if (!withinHours(hoursOf(ctx.branch!.oid), weekdayOf(date), startTime, end)) fail(400, `${ctx.branch!.name} is not open for the whole class`);
    const from = `${date}T${startTime}:00+06:00`;
    const to = plusMinutes(from, minutes);
    if (onLeave(trainerOid, date)) fail(409, 'The trainer is off that day.');
    const block = roomBlocked(roomOid, from, to);
    if (block) fail(409, `The room is closed for maintenance then (${block.reason}).`);
    const clash =
        db().sessions.find(
            s =>
                s.branch_oid === ctx.branch!.oid &&
                !s.cancelled &&
                s.oid !== except &&
                (s.trainer_oid === trainerOid || s.room_oid === roomOid) &&
                overlaps(from, to, s.starts_at, s.ends_at)
        ) ??
        db().ptSessions.find(
            p =>
                p.status === 'Booked' &&
                p.oid !== except &&
                (p.trainer_oid === trainerOid || p.room_oid === roomOid) &&
                overlaps(from, to, p.starts_at, p.ends_at)
        );
    if (clash) fail(409, `${clash.trainer_oid === trainerOid ? 'The trainer' : 'The room'} is taken then.`);
    return { from, to };
}

function addClass(ctx: Ctx): HttpResponse<unknown> {
    const type = db().classTypes.find(t => t.oid === str(ctx.body['class_type_oid']) && t.active !== false);
    if (!type) fail(400, 'Choose an active class type');
    const date = str(ctx.body['date']);
    if (date < ctx.now.date) fail(400, 'A class is added for today or later');
    const minutes = num(ctx.body['minutes']) || type.minutes;
    const capacity = num(ctx.body['capacity']);
    const ladies = ctx.body['ladies_only'] === true;
    const { trainer, room } = checkTrainerRoom(ctx, str(ctx.body['trainer_oid']), str(ctx.body['room_oid']), capacity, ladies);
    const { from, to } = checkDated(ctx, date, str(ctx.body['start_time']), minutes, trainer.oid, room.oid, null);
    if (from <= ctx.now.iso) fail(400, 'That time has passed');
    fill(ctx, ctx.branch!.oid, date, date);
    const s: ClassSession = {
        oid: newOid('cs'),
        branch_oid: ctx.branch!.oid,
        schedule_oid: null,
        type_oid: type.oid,
        type_name: type.name,
        color: type.color,
        title: type.name,
        trainer_oid: trainer.oid,
        trainer_name: trainer.name,
        room_oid: room.oid,
        room: room.name,
        starts_at: from,
        ends_at: to,
        capacity,
        booked: 0,
        waitlist: 0,
        ladies_only: ladies,
        detached: true,
        cancelled: false,
        cancel_reason: null
    };
    commit({ t: 'put', table: 'sessions', row: s });
    recordAudit(ctx, 'create', 'class_session', `${s.title} ${date}`, null, s);
    return ok(s, 'Class added');
}

function updateSession(ctx: Ctx): HttpResponse<unknown> {
    const s = sessionAt(ctx, ctx.params[0]);
    if (s.cancelled) fail(409, 'This class was cancelled.');
    if (s.starts_at <= ctx.now.iso) fail(409, 'This class has already started.');
    const b = ctx.body;
    const trainerOid = str(b['trainer_oid']) || s.trainer_oid;
    const roomOid = str(b['room_oid']) || (s.room_oid ?? '');
    const startTime = str(b['start_time']) || timeOf(s.starts_at);
    const minutes = num(b['minutes']) || Math.round((Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60_000);
    const capacity = num(b['capacity']) || s.capacity;
    const { trainer, room } = checkTrainerRoom(ctx, trainerOid, roomOid, capacity, s.ladies_only);
    if (capacity < s.booked) fail(409, `${s.booked} members are booked: cancel some bookings first, or keep at least ${s.booked} places.`);
    const { from, to } = checkDated(ctx, dateOf(s.starts_at), startTime, minutes, trainerOid, roomOid, s.oid);
    const next = {
        ...s,
        trainer_oid: trainer.oid,
        trainer_name: trainer.name,
        room_oid: room.oid,
        room: room.name,
        starts_at: from,
        ends_at: to,
        capacity,
        detached: true
    };
    commit({ t: 'put', table: 'sessions', row: next });
    promote(ctx, next);
    recordAudit(ctx, 'update', 'class_session', `${s.title} ${dateOf(s.starts_at)}`, s, next);
    return ok(detailOf(next), 'Class changed');
}

function cancelIn(ctx: Ctx, s: ClassSession, reason: string): number {
    commit({ t: 'put', table: 'sessions', row: { ...s, cancelled: true, cancel_reason: reason } });
    const affected = db().bookings.filter(b => b.session_oid === s.oid && (b.status === 'Booked' || b.status === 'Waitlist'));
    for (const b of affected) {
        commit({ t: 'patch', table: 'bookings', oid: b.oid, patch: { status: 'Cancelled' } });
        const m = idx().members.get(b.member_oid);
        if (m)
            notify(
                m,
                'class_cancelled',
                `Cancelled: ${s.title} on ${short(dateOf(s.starts_at))}`,
                `${s.title} is cancelled (${reason}). Your booking is cancelled too.`,
                ctx.now.iso
            );
    }
    recordAudit(ctx, 'cancel', 'class_session', `${s.title} ${dateOf(s.starts_at)}`, s, { cancel_reason: reason, bookings_cancelled: affected.length });
    return affected.length;
}

function cancelSession(ctx: Ctx): HttpResponse<unknown> {
    const s = sessionAt(ctx, ctx.params[0]);
    if (s.cancelled) fail(409, 'This class is already cancelled.');
    if (s.ends_at <= ctx.now.iso) fail(409, 'This class is over.');
    const reason = str(ctx.body['reason']);
    if (reason.length < 3) fail(400, 'Give a reason (at least 3 characters)');
    const n = cancelIn(ctx, s, reason);
    return ok({ cancelled: true, bookings_cancelled: n }, n ? `Class cancelled; ${n} members were told` : 'Class cancelled');
}

/* ---------- trainers ---------- */

function listTrainers(ctx: Ctx): HttpResponse<unknown> {
    return ok(trainersAt(ctx.branch!.oid));
}

function trainerDetail(ctx: Ctx): HttpResponse<unknown> {
    const t = trainerAt(ctx, ctx.params[0]);
    const b = ctx.branch!.oid;
    const until = plusMinutes(ctx.now.iso, 14 * 1440);
    fill(ctx, b, ctx.now.date, addDaysIso(ctx.now.date, 14));
    const upcoming = [
        ...db()
            .sessions.filter(s => s.trainer_oid === t.oid && s.branch_oid === b && !s.cancelled && s.starts_at >= ctx.now.iso && s.starts_at < until)
            .map(s => ({ kind: 'class' as const, oid: s.oid, title: s.title, starts_at: s.starts_at, ends_at: s.ends_at, room_name: s.room })),
        ...db()
            .ptSessions.filter(p => p.trainer_oid === t.oid && p.branch_oid === b && p.status === 'Booked' && p.starts_at >= ctx.now.iso && p.starts_at < until)
            .map(p => ({
                kind: 'pt' as const,
                oid: p.oid,
                title: `PT with ${p.member_name}`,
                starts_at: p.starts_at,
                ends_at: p.ends_at,
                room_name: p.room_name
            }))
    ]
        .sort((x, y) => (x.starts_at < y.starts_at ? -1 : 1))
        .slice(0, 40);
    return ok({
        ...t,
        availability: db()
            .availability.filter(a => a.trainer_oid === t.oid && a.branch_oid === b)
            .sort((x, y) => x.weekday - y.weekday || x.start_time.localeCompare(y.start_time))
            .map(a => ({ weekday: a.weekday, start_time: a.start_time, end_time: a.end_time })),
        leave: db().leave.filter(l => l.trainer_oid === t.oid && !l.removed && l.to_date >= ctx.now.date),
        client_list: db()
            .members.filter(m => m.trainer_oid === t.oid && m.branch_oid === b && !m.anonymised)
            .map(m => ({ oid: m.oid, code: m.code, name: m.name, photo_url: m.photo_url })),
        upcoming
    });
}

function candidateAccounts(ctx: Ctx): MockAccount[] {
    const have = new Set(db().trainers.map(t => t.username));
    return db().accounts.filter(
        a => a.user.kind === 'staff' && !have.has(a.username) && a.user.assignments.some(x => x.branch.oid === ctx.branch!.oid && x.role === 'TRAINER')
    );
}

function candidates(ctx: Ctx): HttpResponse<unknown> {
    return ok(candidateAccounts(ctx).map(a => ({ user_oid: a.user.user_id, username: a.username, name: a.user.name })));
}

function trainerFields(ctx: Ctx): Partial<Trainer> {
    const b = ctx.body;
    const out: Partial<Trainer> = {};
    if (b['slug'] !== undefined) {
        const slug = str(b['slug']).trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) fail(400, 'Lower case letters, digits and dashes');
        out.slug = slug;
    }
    if (b['gender'] !== undefined) out.gender = b['gender'] === 'Female' ? 'Female' : 'Male';
    if (b['phone'] !== undefined) out.phone = str(b['phone']);
    for (const key of ['headline', 'bio'] as const) if (b[key] !== undefined) out[key] = str(b[key]).trim() || null;
    if (Array.isArray(b['specialties'])) out.specialties = (b['specialties'] as unknown[]).map(str).filter(Boolean).slice(0, 12);
    if (Array.isArray(b['certifications'])) out.certifications = b['certifications'] as Trainer['certifications'];
    if (b['public'] !== undefined) out.public = b['public'] === true;
    if (b['active'] !== undefined) out.active = b['active'] === true;
    if (b['photo_file_oid'] !== undefined) {
        const file = (db().files ?? []).find(f => f.oid === b['photo_file_oid']);
        out.photo_file_oid = file?.oid ?? null;
        out.photo_url = file?.url ?? null;
    }
    return out;
}

function createTrainer(ctx: Ctx): HttpResponse<unknown> {
    const account = candidateAccounts(ctx).find(a => a.user.user_id === str(ctx.body['user_oid']));
    if (!account) fail(409, 'Give the staff member the Trainer role at this branch first; each trainer has one profile.');
    const fields = trainerFields(ctx);
    if (db().trainers.some(t => t.slug === fields.slug)) fail(409, 'Another trainer has this web address');
    const t: Trainer = {
        oid: newOid('tr'),
        branch_oid: ctx.branch!.oid,
        branch_name: ctx.branch!.name,
        name: account.user.name,
        phone: '',
        specialties: [],
        photo_url: null,
        gender: 'Male',
        user_oid: account.user.user_id,
        username: account.username,
        certifications: [],
        public: true,
        active: true,
        can_sign_in: true,
        clients: 0,
        ...fields
    };
    commit({ t: 'put', table: 'trainers', row: t });
    commit({ t: 'account.put', account: { ...account, trainer_oid: t.oid } });
    recordAudit(ctx, 'create', 'trainer', t.slug ?? t.oid, null, t);
    return ok(t, 'Trainer profile created');
}

function updateTrainer(ctx: Ctx): HttpResponse<unknown> {
    const t = trainerAt(ctx, ctx.params[0]);
    const mine = selfOnly(ctx);
    if (mine && t.oid !== mine) fail(403, 'Trainers change only their own profile');
    if (t.branch_oid !== ctx.branch!.oid) fail(409, `Change ${t.name}'s profile at their home branch, ${t.branch_name}.`);
    const fields = trainerFields(ctx);
    if (mine && (fields.slug !== undefined || fields.active !== undefined)) fail(403, 'A manager changes the web address and whether the profile is active');
    if (fields.slug && db().trainers.some(x => x.slug === fields.slug && x.oid !== t.oid)) fail(409, 'Another trainer has this web address');
    const next = { ...t, ...fields };
    commit({ t: 'put', table: 'trainers', row: next });
    recordAudit(ctx, 'update', 'trainer', next.slug ?? next.oid, t, next);
    return ok(next, 'Profile saved');
}

function setAvailability(ctx: Ctx): HttpResponse<unknown> {
    const t = trainerAt(ctx, ctx.params[0]);
    const mine = selfOnly(ctx);
    if (mine && t.oid !== mine) fail(403, 'Trainers change only their own profile');
    const slots = ((ctx.body['slots'] as { weekday: number; start_time: string; end_time: string }[] | undefined) ?? []).map(s => ({ ...s }));
    slots.forEach((a, i) => {
        if (a.end_time <= a.start_time) fail(400, 'Ends after it starts');
        if (slots.some((b, j) => j !== i && a.weekday === b.weekday && overlaps(a.start_time, a.end_time, b.start_time, b.end_time)))
            fail(400, `Two slots overlap on ${WEEKDAY_NAMES[a.weekday]}`);
    });
    for (const a of db().availability.filter(x => x.trainer_oid === t.oid && x.branch_oid === ctx.branch!.oid))
        commit({ t: 'drop', table: 'availability', oid: a.oid });
    for (const s of slots) commit({ t: 'put', table: 'availability', row: { oid: newOid('av'), branch_oid: ctx.branch!.oid, trainer_oid: t.oid, ...s } });
    recordAudit(ctx, 'set_availability', 'trainer', t.slug ?? t.oid, null, slots);
    return ok(slots, 'Availability saved');
}

function addLeave(ctx: Ctx): HttpResponse<unknown> {
    const t = trainerAt(ctx, ctx.params[0]);
    const mine = selfOnly(ctx);
    if (mine && t.oid !== mine) fail(403, 'Trainers change only their own profile');
    const row = {
        oid: newOid('lv'),
        trainer_oid: t.oid,
        from_date: str(ctx.body['from_date']),
        to_date: str(ctx.body['to_date']),
        reason: str(ctx.body['reason']) || null
    };
    if (!row.from_date || row.to_date < row.from_date) fail(400, 'Ends on or after the first day');
    commit({ t: 'put', table: 'leave', row });
    const clash = db().ptSessions.filter(
        p => p.trainer_oid === t.oid && p.status === 'Booked' && dateOf(p.starts_at) >= row.from_date && dateOf(p.starts_at) <= row.to_date
    ).length;
    recordAudit(ctx, 'add_leave', 'trainer', t.slug ?? t.oid, null, row);
    return ok({ ...row, pt_sessions_to_move: clash }, clash ? `Day off saved. ${clash} PT sessions fall on it: move or cancel them.` : 'Day off saved');
}

function removeLeave(ctx: Ctx): HttpResponse<unknown> {
    const t = trainerAt(ctx, ctx.params[0]);
    const l = db().leave.find(x => x.oid === ctx.params[1] && x.trainer_oid === t.oid && !x.removed);
    if (!l) fail(404, 'Day off not found');
    commit({ t: 'patch', table: 'leave', oid: l.oid, patch: { removed: true } });
    recordAudit(ctx, 'remove_leave', 'trainer', t.slug ?? t.oid, l, null);
    return ok(null, 'Day off removed');
}

function assignTrainer(ctx: Ctx): HttpResponse<unknown> {
    const m = branchMember(ctx, ctx.params[0]);
    const oid = ctx.body['trainer_oid'] ? str(ctx.body['trainer_oid']) : null;
    const t = oid ? trainerAt(ctx, oid) : null;
    commit({ t: 'member.update', oid: m.oid, patch: { trainer_oid: oid } });
    recordAudit(ctx, 'assign_trainer', 'member', m.code, { trainer_oid: m.trainer_oid }, { trainer_oid: oid });
    return ok({ trainer_oid: oid, trainer_name: t?.name ?? null }, t ? `Trainer: ${t.name}` : 'Trainer removed');
}

/* ---------- class types, rooms ---------- */

function saveClassType(ctx: Ctx): HttpResponse<unknown> {
    const oid = ctx.params[0] ?? null;
    const before = oid ? db().classTypes.find(t => t.oid === oid) : undefined;
    if (oid && !before) fail(404, 'Class type not found');
    const b = ctx.body;
    const name = b['name'] !== undefined ? str(b['name']).trim() : (before?.name ?? '');
    if (name.length < 2) fail(400, 'Name the class');
    if (db().classTypes.some(t => t.name.toLowerCase() === name.toLowerCase() && t.oid !== oid)) fail(409, 'A class type has this name');
    const next: ClassType = {
        oid: oid ?? newOid('ct'),
        name,
        description: b['description'] !== undefined ? str(b['description']) || null : (before?.description ?? null),
        color: (str(b['color']) || (before?.color ?? 'blue')) as ClassType['color'],
        minutes: num(b['minutes']) || (before?.minutes ?? 60),
        sort_order: b['sort_order'] !== undefined ? num(b['sort_order']) : (before?.sort_order ?? 0),
        active: b['active'] !== undefined ? b['active'] === true : (before?.active ?? true)
    };
    commit({ t: 'put', table: 'classTypes', row: next });
    recordAudit(ctx, oid ? 'update' : 'create', 'class_type', name, before ?? null, next);
    return ok(next, oid ? 'Class type saved' : 'Class type added');
}

function saveRoom(ctx: Ctx): HttpResponse<unknown> {
    const oid = ctx.params[0] ?? null;
    const before = oid ? db().rooms.find(r => r.oid === oid && r.branch_oid === ctx.branch!.oid) : undefined;
    if (oid && !before) fail(404, 'Room not found');
    const name = ctx.body['name'] !== undefined ? str(ctx.body['name']).trim() : (before?.name ?? '');
    if (name.length < 2) fail(400, 'Name the room');
    if (db().rooms.some(r => r.branch_oid === ctx.branch!.oid && r.name.toLowerCase() === name.toLowerCase() && r.oid !== oid))
        fail(409, 'A room has this name');
    if (ctx.body['active'] === false && db().rules.some(r => r.room_oid === oid && r.active)) {
        fail(409, `${db().rules.filter(r => r.room_oid === oid && r.active).length} weekly classes use this room: move them first.`);
    }
    const next = {
        oid: oid ?? newOid('rm'),
        branch_oid: ctx.branch!.oid,
        name,
        capacity: num(ctx.body['capacity']) || (before?.capacity ?? 1),
        active: ctx.body['active'] !== undefined ? ctx.body['active'] !== false : (before?.active ?? true)
    };
    commit({ t: 'put', table: 'rooms', row: next });
    recordAudit(ctx, oid ? 'update' : 'create', 'room', name, before ?? null, next);
    return ok(next, oid ? 'Room saved' : 'Room added');
}

/* ---------- PT ---------- */

function packagesOf(memberOid: string, today: string): PtPackage[] {
    return (idx().allSubs.get(memberOid) ?? [])
        .filter(s => s.kind === 'pt' && !s.cancelled_at && s.end_date >= today)
        .map(s => {
            const used = db().ptSessions.filter(p => p.subscription_oid === s.oid && p.charged).length;
            return {
                oid: s.oid,
                plan_name: s.plan_name,
                start_date: s.start_date,
                end_date: s.end_date,
                sessions: s.sessions ?? 0,
                used,
                left: (s.sessions ?? 0) - used
            };
        })
        .sort((a, b) => (a.end_date < b.end_date ? -1 : 1));
}

function slotsFor(ctx: Ctx, branchOid: string, trainerOid: string, date: string, minutes: number): string[] {
    if (date < ctx.now.date || onLeave(trainerOid, date)) return [];
    if (!trainersAt(branchOid).some(t => t.oid === trainerOid)) return [];
    fill(ctx, branchOid, date, date);
    const weekday = weekdayOf(date);
    const busy = [
        ...db().sessions.filter(s => s.branch_oid === branchOid && s.trainer_oid === trainerOid && !s.cancelled && dateOf(s.starts_at) === date),
        ...db().ptSessions.filter(p => p.branch_oid === branchOid && p.trainer_oid === trainerOid && p.status === 'Booked' && dateOf(p.starts_at) === date)
    ].map(x => ({ start: timeOf(x.starts_at), end: timeOf(x.ends_at) }));
    return freeSlots({
        availability: db()
            .availability.filter(a => a.trainer_oid === trainerOid && a.branch_oid === branchOid && a.weekday === weekday)
            .map(a => ({ start: a.start_time, end: a.end_time })),
        hours: hoursOf(branchOid),
        weekday,
        busy,
        length: minutes,
        notBefore: date === ctx.now.date ? ctx.now.time : null
    });
}

function ptWire(p: PtRow): PtSession {
    const sub = db().subscriptions.find(s => s.oid === p.subscription_oid);
    return { ...p, plan_name: sub?.plan_name ?? 'PT', date: dateOf(p.starts_at), start_time: timeOf(p.starts_at) };
}

function bookPtFor(
    ctx: Ctx,
    branchOid: string,
    memberOid: string,
    trainerOid: string,
    date: string,
    start: string,
    minutes: number,
    source: 'portal' | 'desk'
): PtRow {
    const m = idx().members.get(memberOid);
    if (m?.branch_oid !== branchOid) fail(404, 'Member not found');
    if (memberState(m, ctx.now.date).status !== 'Active') fail(409, `${m.name} has no running membership.`);
    const t = trainersAt(branchOid).find(x => x.oid === trainerOid);
    if (!t) fail(404, 'Trainer not found');
    if (!slotsFor(ctx, branchOid, t.oid, date, minutes).includes(start))
        fail(409, `${t.name} is not free at ${clock12(start)} on ${short(date)}. Pick one of the free times.`);
    const pack = packagesOf(m.oid, ctx.now.date).find(p => p.left > 0 && p.start_date <= date && date <= p.end_date);
    if (!pack) fail(409, `${m.name} has no PT sessions left for that day. Sell a PT package first.`);
    const from = `${date}T${start}:00+06:00`;
    const row: PtRow = {
        oid: newOid('pt'),
        branch_oid: branchOid,
        trainer_oid: t.oid,
        trainer_name: t.name,
        member_oid: m.oid,
        member_code: m.code,
        member_name: m.name,
        subscription_oid: pack.oid,
        room_oid: null,
        room_name: null,
        starts_at: from,
        ends_at: plusMinutes(from, minutes),
        status: 'Booked',
        charged: true,
        cancelled_by: null,
        cancel_reason: null,
        notes: null,
        source
    };
    commit({ t: 'put', table: 'ptSessions', row });
    recordAudit(ctx, 'book', 'pt_session', `${m.code}/${date} ${start}`, null, row);
    notify(m, 'pt_booked', `PT with ${t.name} on ${short(date)}`, `your PT session with ${t.name} is on ${short(date)} at ${clock12(start)}.`, ctx.now.iso);
    return row;
}

function ptWeek(ctx: Ctx): HttpResponse<unknown> {
    const b = ctx.branch!.oid;
    settle(ctx, b);
    const from = weekStart(qStr(ctx, 'week') || ctx.now.date);
    const to = addDaysIso(from, 6);
    const trainer = qStr(ctx, 'trainer');
    return ok({
        from,
        to,
        sessions: db()
            .ptSessions.filter(p => p.branch_oid === b && dateOf(p.starts_at) >= from && dateOf(p.starts_at) <= to && (!trainer || p.trainer_oid === trainer))
            .sort((x, y) => (x.starts_at < y.starts_at ? -1 : 1))
            .map(ptWire),
        trainers: trainersAt(b).filter(t => t.active !== false)
    });
}

function ptSlots(ctx: Ctx): HttpResponse<unknown> {
    const trainer = qStr(ctx, 'trainer_oid');
    const date = qStr(ctx, 'date');
    const minutes = qInt(ctx, 'minutes', 60);
    return ok({ trainer_oid: trainer, date, minutes, slots: slotsFor(ctx, ctx.branch!.oid, trainer, date, minutes) });
}

function bookPt(ctx: Ctx): HttpResponse<unknown> {
    const mine = selfOnly(ctx);
    const trainer = str(ctx.body['trainer_oid']);
    if (mine && trainer !== mine) fail(403, 'Trainers book only their own sessions');
    const row = bookPtFor(
        ctx,
        ctx.branch!.oid,
        str(ctx.body['member_oid']),
        trainer,
        str(ctx.body['date']),
        str(ctx.body['start_time']),
        num(ctx.body['minutes']) || 60,
        'desk'
    );
    return ok(ptWire(row), 'PT session booked');
}

function ptAt(ctx: Ctx, branchOid: string): PtRow {
    const p = db().ptSessions.find(x => x.oid === ctx.params[0] && x.branch_oid === branchOid);
    if (!p) fail(404, 'PT session not found');
    const mine = ctx.branch ? selfOnly(ctx) : null;
    if (mine && p.trainer_oid !== mine) fail(403, 'Trainers change only their own sessions');
    return p;
}

function cancelPtRow(ctx: Ctx, p: PtRow, by: 'member' | 'trainer' | 'staff', reason: string): string {
    if (p.status !== 'Booked') fail(409, 'Only a booked session can be cancelled.');
    if (p.starts_at <= ctx.now.iso) fail(409, 'The session has started: mark it done or a no-show.');
    const hours = rules().booking_cancel_hours;
    const late = by === 'member' && hoursBefore(p.starts_at, ctx.now.iso) < hours;
    commit({ t: 'patch', table: 'ptSessions', oid: p.oid, patch: { status: 'Cancelled', cancelled_by: by, cancel_reason: reason, charged: late } });
    const member = idx().members.get(p.member_oid);
    if (member && by !== 'member')
        notify(
            member,
            'pt_cancelled',
            `PT on ${short(dateOf(p.starts_at))} cancelled`,
            `your PT session with ${p.trainer_name} is cancelled (${reason}). The session is back on your package.`,
            ctx.now.iso
        );
    recordAudit(ctx, 'cancel', 'pt_session', `${p.member_code}/${dateOf(p.starts_at)}`, p, { cancelled_by: by, charged: late });
    return late ? `Cancelled less than ${hours} hours before: the session is used.` : 'PT session cancelled; the session is back on the package';
}

function cancelPt(ctx: Ctx): HttpResponse<unknown> {
    const p = ptAt(ctx, ctx.branch!.oid);
    const by = str(ctx.body['by']) as 'member' | 'trainer' | 'staff';
    if (!['member', 'trainer', 'staff'].includes(by)) fail(400, 'Who cancelled');
    return ok(null, cancelPtRow(ctx, p, by, str(ctx.body['reason']) || 'Cancelled'));
}

function finishPt(status: 'Completed' | 'NoShow') {
    return (ctx: Ctx): HttpResponse<unknown> => {
        const p = ptAt(ctx, ctx.branch!.oid);
        if (p.status === 'Cancelled') fail(409, 'This session was cancelled.');
        if (p.starts_at > ctx.now.iso) fail(409, 'Mark a session once it has started.');
        const notes = ctx.body['notes'] ? str(ctx.body['notes']) : p.notes;
        commit({ t: 'patch', table: 'ptSessions', oid: p.oid, patch: { status, charged: true, notes } });
        recordAudit(ctx, status === 'Completed' ? 'complete' : 'mark_noshow', 'pt_session', `${p.member_code}/${dateOf(p.starts_at)}`, p, { status });
        return ok(ptWire({ ...p, status, charged: true, notes }), status === 'Completed' ? 'Session done' : 'Marked no-show: the session is used');
    };
}

function memberPtOf(ctx: Ctx, m: MemberRow): MemberPt {
    settle(ctx, m.branch_oid);
    const rows = db()
        .ptSessions.filter(p => p.member_oid === m.oid)
        .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1));
    const trainer = m.trainer_oid ? (db().trainers.find(t => t.oid === m.trainer_oid) ?? null) : null;
    return {
        trainer,
        packages: packagesOf(m.oid, ctx.now.date),
        upcoming: rows
            .filter(r => r.status === 'Booked')
            .reverse()
            .map(ptWire),
        past: rows
            .filter(r => r.status !== 'Booked')
            .slice(0, 20)
            .map(ptWire),
        cancel_hours: rules().booking_cancel_hours
    };
}

function memberPt(ctx: Ctx): HttpResponse<unknown> {
    return ok(memberPtOf(ctx, branchMember(ctx, ctx.params[0])));
}

/* ---------- facilities ---------- */

function runningRental(lockerOid: string, today: string): RentalRow | undefined {
    return db().rentals.find(r => r.locker_oid === lockerOid && r.start_date <= today && today <= r.end_date && (!r.ended_on || r.ended_on > today));
}

function lockerWire(l: LockerRow, ctx: Ctx): Locker {
    const rental = runningRental(l.oid, ctx.now.date);
    const block = db().blocks.find(b => b.locker_oid === l.oid && !b.removed && b.starts_at <= ctx.now.iso && ctx.now.iso < b.ends_at);
    return {
        ...l,
        status: !l.active ? 'Inactive' : block ? 'Blocked' : rental ? 'Rented' : 'Free',
        rental: rental ? { ...rental, ends_soon: rental.end_date <= addDaysIso(ctx.now.date, 7) } : null,
        blocked: block ? { reason: block.reason, until: block.ends_at } : null
    };
}

function listLockers(ctx: Ctx): HttpResponse<unknown> {
    const lockers = db()
        .lockers.filter(l => l.branch_oid === ctx.branch!.oid)
        .sort((a, b) => a.number.localeCompare(b.number))
        .map(l => lockerWire(l, ctx));
    const count = (s: string): number => lockers.filter(l => l.status === s).length;
    return ok({ lockers, totals: { free: count('Free'), rented: count('Rented'), blocked: count('Blocked'), inactive: count('Inactive') } });
}

function saveLocker(ctx: Ctx): HttpResponse<unknown> {
    const oid = ctx.params[0] ?? null;
    const before = oid ? db().lockers.find(l => l.oid === oid && l.branch_oid === ctx.branch!.oid) : undefined;
    if (oid && !before) fail(404, 'Locker not found');
    const number = before?.number ?? str(ctx.body['number']).trim().toUpperCase();
    if (!/^[A-Z0-9-]{1,10}$/.test(number)) fail(400, 'Letters, digits and dashes, at most 10');
    if (!oid && db().lockers.some(l => l.branch_oid === ctx.branch!.oid && l.number === number)) fail(409, 'A locker has this number');
    if (ctx.body['active'] === false && oid && runningRental(oid, ctx.now.date)) fail(409, 'This locker is rented: end the rental first.');
    const next: LockerRow = {
        oid: oid ?? newOid('lk'),
        branch_oid: ctx.branch!.oid,
        number,
        size: (str(ctx.body['size']) || (before?.size ?? 'S')) as LockerRow['size'],
        monthly_fee: ctx.body['monthly_fee'] !== undefined ? Math.round(num(ctx.body['monthly_fee'])) : (before?.monthly_fee ?? 0),
        active: ctx.body['active'] !== undefined ? ctx.body['active'] !== false : (before?.active ?? true)
    };
    commit({ t: 'put', table: 'lockers', row: next });
    recordAudit(ctx, oid ? 'update' : 'create', 'locker', number, before ?? null, next);
    return ok(lockerWire(next, ctx), oid ? 'Locker saved' : 'Locker added');
}

function rent(ctx: Ctx): HttpResponse<unknown> {
    const l = db().lockers.find(x => x.oid === ctx.params[0] && x.branch_oid === ctx.branch!.oid);
    if (!l) fail(404, 'Locker not found');
    const now = lockerWire(l, ctx);
    if (!l.active) fail(409, 'This locker is not in use.');
    if (now.blocked) fail(409, `Locker ${l.number} is out of use: ${now.blocked.reason}.`);
    if (now.rental) fail(409, `Locker ${l.number} is rented to ${now.rental.member_name} until ${short(now.rental.end_date)}.`);
    const m = branchMember(ctx, str(ctx.body['member_oid']));
    const status = memberState(m, ctx.now.date).status;
    if (status === 'Pending' || status === 'Suspended') fail(409, `${m.name} cannot rent a locker (${status.toLowerCase()}).`);
    const other = db().lockers.find(x => runningRental(x.oid, ctx.now.date)?.member_oid === m.oid);
    if (other) fail(409, `This member already rents locker ${other.number}.`);
    const months = Math.max(1, Math.min(12, Math.round(num(ctx.body['months']) || 1)));
    const start = str(ctx.body['start_date']) || ctx.now.date;
    const end = endDate(start, months);
    const amount = Math.round(l.monthly_fee * months);
    const s = db().settings;
    const q = quote({
        plan_name: 'Locker',
        price: amount,
        months,
        admission_fee: 0,
        charge_admission: false,
        discount: { kind: 'none', value: 0 },
        start_date: start,
        today: ctx.now.date,
        vat_rate: s.vat_rate,
        vat_inclusive: s.vat_inclusive,
        promos: []
    });
    const pay = (ctx.body['payment'] as { method?: string; amount?: number; reference?: string } | undefined) ?? {};
    const paid = Math.max(0, Math.min(q.total, Math.round(num(pay.amount))));
    const branch = db().branches.find(b => b.oid === ctx.branch!.oid)!;
    const seq = (db().counters[`invoice:${branch.code}`] ?? 0) + 1;
    const invoiceOid = newOid('inv');
    const label = `Locker ${l.number} (${l.size}) · ${months} month${months === 1 ? '' : 's'}, ${short(start)} to ${short(end)}`;
    const invoice: Invoice = {
        oid: invoiceOid,
        number: `INV-${branch.code}-${ctx.now.date.slice(0, 4)}-${String(seq).padStart(5, '0')}`,
        kind: 'locker',
        branch: toRef(branch),
        member_oid: m.oid,
        member_name: m.name,
        member_code: m.code,
        member_phone: m.phone,
        issued_at: ctx.now.iso,
        lines: [{ label, amount }],
        subtotal: q.subtotal,
        discount: 0,
        vat_rate: q.vat_rate,
        vat_inclusive: q.vat_inclusive,
        vat_bin: s.vat_bin,
        vat: q.vat,
        total: q.total,
        paid,
        due: q.total - paid,
        status: paid >= q.total ? 'Paid' : paid > 0 ? 'Partial' : 'Due',
        payments: paid
            ? [
                  {
                      oid: newOid('pay'),
                      invoice_oid: invoiceOid,
                      amount: paid,
                      method: (pay.method ?? 'cash') as 'cash',
                      reference: pay.reference ?? null,
                      received_at: ctx.now.iso,
                      received_by: ctx.user!.name
                  }
              ]
            : []
    };
    commit({ t: 'invoice.create', invoice, invoiceSeq: seq });
    const rental: RentalRow = {
        oid: newOid('rn'),
        branch_oid: ctx.branch!.oid,
        locker_oid: l.oid,
        member_oid: m.oid,
        member_code: m.code,
        member_name: m.name,
        start_date: start,
        end_date: end,
        months,
        invoice_oid: invoiceOid,
        ended_on: null
    };
    commit({ t: 'put', table: 'rentals', row: rental });
    recordAudit(ctx, 'rent', 'locker', l.number, null, rental);
    return ok({ locker: lockerWire(l, ctx), invoice }, `Locker rented: ${invoice.number}`);
}

function endRental(ctx: Ctx): HttpResponse<unknown> {
    const r = db().rentals.find(x => x.oid === ctx.params[0] && x.branch_oid === ctx.branch!.oid);
    if (!r) fail(404, 'Rental not found');
    if (r.ended_on || r.end_date < ctx.now.date) fail(409, 'This rental has already ended.');
    const ended = r.start_date > ctx.now.date ? r.start_date : ctx.now.date;
    commit({ t: 'patch', table: 'rentals', oid: r.oid, patch: { ended_on: ended } });
    recordAudit(ctx, 'end_rental', 'locker', r.locker_oid, r, { ended_on: ended });
    const l = db().lockers.find(x => x.oid === r.locker_oid)!;
    return ok(lockerWire(l, ctx), 'Rental ended: take the key back');
}

function listBlocks(ctx: Ctx): HttpResponse<unknown> {
    const b = ctx.branch!.oid;
    const blocks = db()
        .blocks.filter(x => x.branch_oid === b && !x.removed && x.ends_at > ctx.now.iso)
        .sort((x, y) => (x.starts_at < y.starts_at ? -1 : 1))
        .map(x => ({
            ...x,
            room_name: db().rooms.find(r => r.oid === x.room_oid)?.name ?? null,
            locker_number: db().lockers.find(l => l.oid === x.locker_oid)?.number ?? null,
            current: x.starts_at <= ctx.now.iso && ctx.now.iso < x.ends_at
        }));
    const affected = db()
        .sessions.filter(s => s.branch_oid === b && !s.cancelled && s.ends_at > ctx.now.iso && roomBlocked(s.room_oid ?? null, s.starts_at, s.ends_at))
        .map(s => ({ oid: s.oid, title: s.title, starts_at: s.starts_at, room_name: s.room, booked: s.booked + s.waitlist }));
    return ok({ blocks, affected_classes: affected });
}

/** Dhaka wall time with its offset, from what the browser sent (any ISO instant). */
function toDhaka(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) fail(400, 'A date and time');
    return `${new Date(t + 6 * 3_600_000).toISOString().slice(0, 19)}+06:00`;
}

function createBlock(ctx: Ctx): HttpResponse<unknown> {
    const roomOid = str(ctx.body['room_oid']) || null;
    const lockerOid = str(ctx.body['locker_oid']) || null;
    if (!roomOid === !lockerOid) fail(400, 'Block a room or a locker');
    if (!ctx.ability.can('manage', roomOid ? 'Room' : 'Locker')) fail(403, 'You do not have permission to do this');
    const row: BlockRow = {
        oid: newOid('mb'),
        branch_oid: ctx.branch!.oid,
        room_oid: roomOid,
        locker_oid: lockerOid,
        starts_at: toDhaka(str(ctx.body['starts_at'])),
        ends_at: toDhaka(str(ctx.body['ends_at'])),
        reason: str(ctx.body['reason']),
        created_by_name: ctx.user?.name ?? null
    };
    if (row.ends_at <= row.starts_at) fail(400, 'Ends after it starts');
    if (row.ends_at <= ctx.now.iso) fail(400, 'The block must end in the future');
    if (row.reason.length < 3) fail(400, 'Give a reason (at least 3 characters)');
    commit({ t: 'put', table: 'blocks', row });
    recordAudit(ctx, 'create', 'maintenance_block', row.oid, null, row);
    const n = roomOid
        ? db().sessions.filter(s => s.room_oid === roomOid && !s.cancelled && overlaps(row.starts_at, row.ends_at, s.starts_at, s.ends_at)).length
        : 0;
    return ok({ oid: row.oid, classes_affected: n }, n ? `Blocked. ${n} classes fall in it: move or cancel them.` : 'Blocked');
}

function removeBlock(ctx: Ctx): HttpResponse<unknown> {
    const b = db().blocks.find(x => x.oid === ctx.params[0] && x.branch_oid === ctx.branch!.oid && !x.removed);
    if (!b) fail(404, 'Block not found');
    if (!ctx.ability.can('manage', b.room_oid ? 'Room' : 'Locker')) fail(403, 'You do not have permission to do this');
    commit({ t: 'patch', table: 'blocks', oid: b.oid, patch: { removed: true } });
    recordAudit(ctx, 'remove', 'maintenance_block', b.oid, b, null);
    return ok(null, 'Block lifted');
}

/* ---------- the member portal ---------- */

function me(ctx: Ctx): MemberRow {
    const m = ctx.user?.member?.oid ? idx().members.get(ctx.user.member.oid) : undefined;
    if (!m) fail(404, 'Member not found');
    return m;
}

function portalBookings(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    const r = rules();
    const last = addDaysIso(ctx.now.date, r.booking_open_days);
    settle(ctx, m.branch_oid);
    fill(ctx, m.branch_oid, ctx.now.date, last);
    const d = db();
    const upcoming = d.bookings
        .filter(b => b.member_oid === m.oid && (b.status === 'Booked' || b.status === 'Waitlist'))
        .map(b => ({ ...b, session: d.sessions.find(s => s.oid === b.session_oid)! }))
        .filter(b => b.session && b.session.starts_at > ctx.now.iso)
        .sort((a, b) => (a.session.starts_at < b.session.starts_at ? -1 : 1));
    const available = d.sessions
        .filter(
            s =>
                s.branch_oid === m.branch_oid &&
                s.starts_at > ctx.now.iso &&
                dateOf(s.starts_at) <= last &&
                !s.cancelled &&
                (!s.ladies_only || m.gender === 'Female')
        )
        .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
        .map(withBlocked);
    return ok({
        upcoming,
        available,
        rules: {
            open_days: r.booking_open_days,
            max_active: r.booking_max_active,
            cancel_hours: r.booking_cancel_hours,
            blocked_until: blockedUntil(m.oid, ctx.now.iso)
        }
    });
}

function portalBook(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    const booking = bookOn(ctx, str(ctx.body['session_oid']), m.oid, 'portal');
    return ok(booking, booking.status === 'Waitlist' ? 'The class is full: you are on the waitlist' : 'Class booked');
}

function portalCancel(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    const b = db().bookings.find(x => x.oid === ctx.params[0] && x.member_oid === m.oid);
    if (!b) fail(404, 'Booking not found');
    const s = db().sessions.find(x => x.oid === b.session_oid)!;
    return ok(null, cancelBooking({ ...ctx, branch: db().branches.find(x => x.oid === s.branch_oid) ?? null }, b));
}

function portalPt(ctx: Ctx): HttpResponse<unknown> {
    return ok(memberPtOf(ctx, me(ctx)));
}

function portalSlots(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    if (!m.trainer_oid) fail(409, 'You have no trainer yet: ask the front desk to assign one.');
    const date = qStr(ctx, 'date');
    return ok({ trainer_oid: m.trainer_oid, date, minutes: 60, slots: slotsFor(ctx, m.branch_oid, m.trainer_oid, date, 60) });
}

function portalBookPt(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    if (!m.trainer_oid) fail(409, 'You have no trainer yet: ask the front desk to assign one.');
    const row = bookPtFor(ctx, m.branch_oid, m.oid, m.trainer_oid, str(ctx.body['date']), str(ctx.body['start_time']), 60, 'portal');
    return ok(ptWire(row), 'PT session booked');
}

function portalCancelPt(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    const p = db().ptSessions.find(x => x.oid === ctx.params[0] && x.member_oid === m.oid);
    if (!p) fail(404, 'PT session not found');
    return ok(null, cancelPtRow(ctx, p, 'member', str(ctx.body['reason']) || 'Cancelled in the member portal'));
}

/* ---------- public ---------- */

function publicTrainer(t: Trainer): Trainer {
    return {
        oid: t.oid,
        branch_oid: t.branch_oid,
        branch_name: t.branch_name,
        name: t.name,
        slug: t.slug,
        gender: t.gender,
        headline: t.headline,
        bio: t.bio,
        specialties: t.specialties,
        certifications: t.certifications,
        photo_url: t.photo_url,
        phone: ''
    };
}

function publicTrainers(ctx: Ctx): HttpResponse<unknown> {
    const slug = qStr(ctx, 'branch');
    const branch = slug ? db().branches.find(b => b.kind === 'BRANCH' && b.slug === slug) : null;
    if (slug && !branch) fail(404, 'Branch not found');
    return ok(
        db()
            .trainers.filter(t => t.public !== false && t.active !== false && (!branch || t.branch_oid === branch.oid))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(publicTrainer)
    );
}

function publicTrainerPage(ctx: Ctx): HttpResponse<unknown> {
    const t = db().trainers.find(x => x.slug === ctx.params[0] && x.public !== false && x.active !== false);
    if (!t) fail(404, 'Trainer not found');
    const week = addDaysIso(ctx.now.date, 7);
    for (const b of db().branches.filter(x => x.kind === 'BRANCH')) materialise(db(), b.oid, ctx.now.date, week);
    const classes = db()
        .sessions.filter(s => s.trainer_oid === t.oid && !s.cancelled && s.starts_at >= ctx.now.iso && dateOf(s.starts_at) <= week)
        .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
        .map(s => {
            const b = db().branches.find(x => x.oid === s.branch_oid)!;
            return { title: s.title, starts_at: s.starts_at, ends_at: s.ends_at, branch_name: b.name, branch_slug: b.slug, ladies_only: s.ladies_only };
        });
    return ok({ ...publicTrainer(t), branch_slug: db().branches.find(b => b.oid === t.branch_oid)?.slug ?? null, classes });
}

function publicClasses(ctx: Ctx): HttpResponse<unknown> {
    const b = db().branches.find(x => x.kind === 'BRANCH' && x.slug === qStr(ctx, 'branch'));
    if (!b) fail(404, 'Branch not found');
    const from = weekStart(qStr(ctx, 'week') || ctx.now.date);
    const to = addDaysIso(from, 6);
    fill(ctx, b.oid, from, to);
    const sessions = db()
        .sessions.filter(s => s.branch_oid === b.oid && !s.cancelled && dateOf(s.starts_at) >= from && dateOf(s.starts_at) <= to)
        .sort((x, y) => (x.starts_at < y.starts_at ? -1 : 1))
        .map(s => ({ ...withBlocked(s), booked: 0, waitlist: 0, full: s.booked >= s.capacity }));
    return ok({ from, to, sessions });
}

const ID = '([\\w.-]+)';
const re = (path: string): RegExp => new RegExp(`^${path.replaceAll(':id', ID)}$`);

export const SCHEDULING_ROUTES: Route[] = [
    { method: 'GET', path: re('/v1/public/classes'), scope: 'public', handler: publicClasses },
    { method: 'GET', path: re('/v1/public/trainers'), scope: 'public', handler: publicTrainers },
    { method: 'GET', path: re('/v1/public/trainers/:id'), scope: 'public', handler: publicTrainerPage },

    { method: 'GET', path: re('/v1/trainers'), scope: 'branch', can: ['read', 'Trainer'], handler: listTrainers },
    { method: 'GET', path: re('/v1/trainers/candidates'), scope: 'branch', can: ['create', 'Trainer'], handler: candidates },
    { method: 'POST', path: re('/v1/trainers'), scope: 'branch', can: ['create', 'Trainer'], handler: createTrainer },
    { method: 'GET', path: re('/v1/trainers/:id'), scope: 'branch', can: ['read', 'Trainer'], handler: trainerDetail },
    { method: 'PATCH', path: re('/v1/trainers/:id'), scope: 'branch', can: ['update', 'Trainer'], handler: updateTrainer },
    { method: 'PUT', path: re('/v1/trainers/:id/availability'), scope: 'branch', can: ['update', 'Trainer'], handler: setAvailability },
    { method: 'POST', path: re('/v1/trainers/:id/leave'), scope: 'branch', can: ['update', 'Trainer'], handler: addLeave },
    { method: 'DELETE', path: re('/v1/trainers/:id/leave/:id'), scope: 'branch', can: ['update', 'Trainer'], handler: removeLeave },
    { method: 'PUT', path: re('/v1/members/:id/trainer'), scope: 'branch', can: ['update', 'Member'], handler: assignTrainer },

    { method: 'GET', path: re('/v1/class-types'), scope: 'user', handler: () => ok(db().classTypes) },
    { method: 'GET', path: re('/v1/hq/class-types'), scope: 'hq', can: ['manage', 'ClassType'], handler: () => ok(db().classTypes) },
    { method: 'POST', path: re('/v1/hq/class-types'), scope: 'hq', can: ['manage', 'ClassType'], handler: saveClassType },
    { method: 'PATCH', path: re('/v1/hq/class-types/:id'), scope: 'hq', can: ['manage', 'ClassType'], handler: saveClassType },
    {
        method: 'GET',
        path: re('/v1/rooms'),
        scope: 'branch',
        can: ['read', 'Room'],
        handler: ctx => ok(db().rooms.filter(r => r.branch_oid === ctx.branch!.oid))
    },
    { method: 'POST', path: re('/v1/rooms'), scope: 'branch', can: ['manage', 'Room'], handler: saveRoom },
    { method: 'PATCH', path: re('/v1/rooms/:id'), scope: 'branch', can: ['manage', 'Room'], handler: saveRoom },

    { method: 'GET', path: re('/v1/classes/schedule'), scope: 'branch', can: ['read', 'Class'], handler: schedule },
    { method: 'GET', path: re('/v1/classes/rules'), scope: 'branch', can: ['read', 'Class'], handler: listRules },
    { method: 'POST', path: re('/v1/classes/rules'), scope: 'branch', can: ['manage', 'Class'], handler: createRule },
    { method: 'PATCH', path: re('/v1/classes/rules/:id'), scope: 'branch', can: ['manage', 'Class'], handler: updateRule },
    { method: 'POST', path: re('/v1/classes/sessions'), scope: 'branch', can: ['manage', 'Class'], handler: addClass },
    { method: 'GET', path: re('/v1/classes/sessions/:id'), scope: 'branch', can: ['read', 'Class'], handler: sessionDetail },
    { method: 'PATCH', path: re('/v1/classes/sessions/:id'), scope: 'branch', can: ['manage', 'Class'], handler: updateSession },
    { method: 'POST', path: re('/v1/classes/sessions/:id/cancel'), scope: 'branch', can: ['manage', 'Class'], handler: cancelSession },
    { method: 'POST', path: re('/v1/classes/sessions/:id/bookings'), scope: 'branch', can: ['create', 'Booking'], handler: deskBook },
    { method: 'PATCH', path: re('/v1/classes/bookings/:id'), scope: 'branch', can: ['update', 'Booking'], handler: setBooking },

    { method: 'GET', path: re('/v1/pt/sessions'), scope: 'branch', can: ['read', 'PtSession'], handler: ptWeek },
    { method: 'GET', path: re('/v1/pt/slots'), scope: 'branch', can: ['read', 'PtSession'], handler: ptSlots },
    { method: 'POST', path: re('/v1/pt/sessions'), scope: 'branch', can: ['create', 'PtSession'], handler: bookPt },
    { method: 'POST', path: re('/v1/pt/sessions/:id/cancel'), scope: 'branch', can: ['update', 'PtSession'], handler: cancelPt },
    { method: 'POST', path: re('/v1/pt/sessions/:id/complete'), scope: 'branch', can: ['update', 'PtSession'], handler: finishPt('Completed') },
    { method: 'POST', path: re('/v1/pt/sessions/:id/no-show'), scope: 'branch', can: ['update', 'PtSession'], handler: finishPt('NoShow') },
    { method: 'GET', path: re('/v1/members/:id/pt'), scope: 'branch', can: ['read', 'PtSession'], handler: memberPt },

    { method: 'GET', path: re('/v1/lockers'), scope: 'branch', can: ['read', 'Locker'], handler: listLockers },
    { method: 'POST', path: re('/v1/lockers'), scope: 'branch', can: ['manage', 'Locker'], handler: saveLocker },
    { method: 'POST', path: re('/v1/lockers/rentals/:id/end'), scope: 'branch', can: ['update', 'Locker'], handler: endRental },
    { method: 'PATCH', path: re('/v1/lockers/:id'), scope: 'branch', can: ['manage', 'Locker'], handler: saveLocker },
    { method: 'POST', path: re('/v1/lockers/:id/rentals'), scope: 'branch', can: ['create', 'Locker'], handler: rent },
    { method: 'GET', path: re('/v1/maintenance'), scope: 'branch', can: ['read', 'Room'], handler: listBlocks },
    { method: 'POST', path: re('/v1/maintenance'), scope: 'branch', handler: createBlock },
    { method: 'DELETE', path: re('/v1/maintenance/:id'), scope: 'branch', handler: removeBlock },

    { method: 'GET', path: re('/v1/me/bookings'), scope: 'member', can: ['read', 'Portal'], handler: portalBookings },
    { method: 'POST', path: re('/v1/me/bookings'), scope: 'member', can: ['create', 'Portal'], handler: portalBook },
    { method: 'DELETE', path: re('/v1/me/bookings/:id'), scope: 'member', can: ['delete', 'Portal'], handler: portalCancel },
    { method: 'GET', path: re('/v1/me/pt'), scope: 'member', can: ['read', 'Portal'], handler: portalPt },
    { method: 'GET', path: re('/v1/me/pt/slots'), scope: 'member', can: ['read', 'Portal'], handler: portalSlots },
    { method: 'POST', path: re('/v1/me/pt-sessions'), scope: 'member', can: ['create', 'Portal'], handler: portalBookPt },
    { method: 'POST', path: re('/v1/me/pt-sessions/:id/cancel'), scope: 'member', can: ['update', 'Portal'], handler: portalCancelPt }
];
