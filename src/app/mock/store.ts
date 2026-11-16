import type { Booking, BookingStatus } from '@core/models/class.model';
import type { Invoice, PaymentRecord } from '@core/models/payment.model';
import type { OrgSettingsUpdate, SiteGroupUpdate } from '@core/models/settings.model';
import type { Freeze, Subscription } from '@core/models/subscription.model';

import { dhakaNow } from './seed/clock';
import { seed } from './seed/seed';
import type { CheckInRow, EnquiryRow, MemberRow, MockDb, NoteRow } from './types';

/**
 * In-memory state for the mock API.
 *
 * Seeded deterministically for the day of the first visit, then every change (a sale, a check-in…) is a
 * Mutation: applied to the state AND appended to a log in localStorage. A reload re-seeds and replays the log, so
 * a demo survives a refresh while storage stays tiny (the seed alone is ~10,000 check-ins). "Reset demo data"
 * drops the log. On the server (prerendering) there is no storage: the seed only.
 */
export type Mutation =
    | { t: 'member.create'; row: MemberRow; seq: number }
    | { t: 'member.update'; oid: string; patch: Partial<MemberRow> }
    | { t: 'subscription.create'; sub: Subscription; invoice: Invoice; invoiceSeq: number }
    | { t: 'payment.create'; invoice_oid: string; payment: PaymentRecord }
    | { t: 'subscription.freeze'; oid: string; freeze: Freeze; end_date: string }
    | { t: 'checkin.create'; row: CheckInRow }
    | { t: 'checkin.out'; oid: string; at: string }
    | { t: 'booking.create'; booking: Booking }
    | { t: 'booking.status'; oid: string; status: BookingStatus }
    | { t: 'workout.log'; member_oid: string; date: string }
    | { t: 'enquiry.create'; row: EnquiryRow }
    | { t: 'note.create'; row: NoteRow }
    | { t: 'settings.update'; patch: OrgSettingsUpdate; at: string; by: string }
    | { t: 'group.update'; key: string; patch: SiteGroupUpdate; at: string; by: string };

interface Snapshot {
    v: 1;
    seedDay: string;
    seedMinutes: number;
    log: Mutation[];
}

const KEY = 'fm.mock.v1';
const FAST_KEY = 'fm.mock.fast';

let state: MockDb | null = null;
let snapshot: Snapshot | null = null;
/** Bumped on every change: derived indexes (queries.ts) are rebuilt only when it moves. */
let version = 0;

function storage(): Storage | null {
    try {
        return typeof window !== 'undefined' && typeof document !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
}

function load(): Snapshot | null {
    try {
        const raw = storage()?.getItem(KEY);
        const s = raw ? (JSON.parse(raw) as Snapshot) : null;
        return s?.v === 1 ? s : null;
    } catch {
        return null;
    }
}

function save(): void {
    try {
        if (snapshot) storage()?.setItem(KEY, JSON.stringify(snapshot));
    } catch {
        /* quota or blocked: the demo keeps working in memory */
    }
}

export function db(): MockDb {
    if (state) return state;
    const now = dhakaNow();
    const saved = load();
    // A saved demo from an earlier day with no changes: start fresh for today (dates stay current).
    snapshot = saved && (saved.log.length || saved.seedDay === now.date) ? saved : { v: 1, seedDay: now.date, seedMinutes: now.minutes, log: [] };
    state = seed(snapshot.seedDay, snapshot.seedMinutes);
    for (const m of snapshot.log) apply(state, m);
    version++;
    return state;
}

export function dbVersion(): number {
    db();
    return version;
}

/** Apply a change and remember it for the next reload. */
export function commit(m: Mutation): void {
    apply(db(), m);
    snapshot?.log.push(m);
    version++;
    save();
}

/** Back to the seed ("Reset demo data"). */
export function resetDemo(): void {
    state = null;
    snapshot = null;
    try {
        storage()?.removeItem(KEY);
    } catch {
        /* ignore */
    }
    db();
}

/** The demo's "fast mode": almost no artificial latency, for live presentations. */
export function fastMode(): boolean {
    try {
        return storage()?.getItem(FAST_KEY) === 'true';
    } catch {
        return false;
    }
}

export function setFastMode(on: boolean): void {
    try {
        storage()?.setItem(FAST_KEY, String(on));
    } catch {
        /* ignore */
    }
}

/** A new id: time-based, unique enough for one browser, and stored in the mutation so a replay is identical. */
export function newOid(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function apply(d: MockDb, m: Mutation): void {
    switch (m.t) {
        case 'member.create': {
            d.members.push(m.row);
            const key = `member:${m.row.code.split('-')[1]}`;
            d.counters[key] = Math.max(d.counters[key] ?? 0, m.seq);
            break;
        }
        case 'member.update': {
            const row = d.members.find(x => x.oid === m.oid);
            if (row) Object.assign(row, m.patch);
            break;
        }
        case 'subscription.create': {
            d.subscriptions.push(m.sub);
            d.invoices.push(m.invoice);
            const key = `invoice:${m.invoice.branch.code}`;
            d.counters[key] = Math.max(d.counters[key] ?? 0, m.invoiceSeq);
            const member = d.members.find(x => x.oid === m.sub.member_oid);
            if (member) member.pending = false;
            break;
        }
        case 'payment.create': {
            const inv = d.invoices.find(x => x.oid === m.invoice_oid);
            if (!inv) break;
            inv.payments.push(m.payment);
            inv.paid += m.payment.amount;
            inv.due = Math.max(0, inv.total - inv.paid);
            inv.status = inv.due === 0 ? 'Paid' : 'Partial';
            const sub = d.subscriptions.find(s => s.invoice_oid === inv.oid);
            if (sub) {
                sub.paid = inv.paid;
                sub.due = inv.due;
            }
            break;
        }
        case 'subscription.freeze': {
            const sub = d.subscriptions.find(s => s.oid === m.oid);
            if (sub) {
                sub.freezes.push(m.freeze);
                sub.end_date = m.end_date;
            }
            break;
        }
        case 'checkin.create':
            d.checkIns.push(m.row);
            break;
        case 'checkin.out': {
            const row = d.checkIns.find(c => c.oid === m.oid);
            if (row) row.out_at = m.at;
            break;
        }
        case 'booking.create': {
            d.bookings.push(m.booking);
            recount(d, m.booking.session_oid);
            break;
        }
        case 'booking.status': {
            const b = d.bookings.find(x => x.oid === m.oid);
            if (b) {
                b.status = m.status;
                recount(d, b.session_oid);
            }
            break;
        }
        case 'workout.log':
            (d.workoutLog[m.member_oid] ??= []).push(m.date);
            break;
        case 'settings.update':
            Object.assign(d.settings, m.patch, { updated_at: m.at, updated_by: m.by });
            break;
        case 'group.update': {
            const row = d.siteGroups.find(g => g.key === m.key);
            if (!row) break;
            // Only parts the group has; required groups stay on, as the database's check constraint guarantees.
            if (m.patch.section !== undefined && row.section !== null && (m.patch.section || !row.required)) row.section = m.patch.section;
            if (m.patch.page !== undefined && row.page !== null && (m.patch.page || !row.required)) row.page = m.patch.page;
            Object.assign(row, { updated_at: m.at, updated_by_name: m.by });
            break;
        }
        case 'enquiry.create':
            d.enquiries.push(m.row);
            break;
        case 'note.create':
            d.notes.push(m.row);
            break;
    }
}

function recount(d: MockDb, sessionOid: string): void {
    const s = d.sessions.find(x => x.oid === sessionOid);
    if (!s) return;
    const list = d.bookings.filter(b => b.session_oid === sessionOid);
    s.booked = list.filter(b => b.status === 'Booked' || b.status === 'Attended' || b.status === 'NoShow').length;
    s.waitlist = list.filter(b => b.status === 'Waitlist').length;
}
