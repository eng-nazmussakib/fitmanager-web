import type { Branch } from '@core/models/branch.model';
import type { Member, MemberListItem, MemberStatus } from '@core/models/member.model';
import type { Invoice } from '@core/models/payment.model';
import type { Subscription } from '@core/models/subscription.model';

import { daysBetween } from './domain/access-rules';
import { toRef } from './seed/organisation.seed';
import { db, dbVersion } from './store';
import type { CheckInRow, MemberRow, MockDb } from './types';

/**
 * Derived data, the way the API's queries will compute it: a member's status, plan, days left and dues come from
 * their subscriptions, invoices and check-ins, so a sale or a check-in shows up on every screen at once.
 */
interface Indexes {
    /** Memberships only: a PT package gives credits, not a status (D-079). */
    subs: Map<string, Subscription[]>;
    /** Every subscription, PT packages too (the member's plan list). */
    allSubs: Map<string, Subscription[]>;
    invoices: Map<string, Invoice[]>;
    lastVisit: Map<string, string>;
    openCheckIn: Map<string, CheckInRow>;
    members: Map<string, MemberRow>;
    byCode: Map<string, MemberRow>;
}

let cached: { version: number; idx: Indexes } | null = null;

export function idx(): Indexes {
    const v = dbVersion();
    if (cached?.version === v) return cached.idx;
    const d = db();
    const subs = new Map<string, Subscription[]>();
    const allSubs = new Map<string, Subscription[]>();
    for (const s of d.subscriptions) {
        (allSubs.get(s.member_oid) ?? allSubs.set(s.member_oid, []).get(s.member_oid)!).push(s);
        if (s.kind !== 'pt') (subs.get(s.member_oid) ?? subs.set(s.member_oid, []).get(s.member_oid)!).push(s);
    }
    for (const list of [...subs.values(), ...allSubs.values()]) list.sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
    const invoices = new Map<string, Invoice[]>();
    for (const i of d.invoices) (invoices.get(i.member_oid) ?? invoices.set(i.member_oid, []).get(i.member_oid)!).push(i);
    const lastVisit = new Map<string, string>();
    const openCheckIn = new Map<string, CheckInRow>();
    for (const c of d.checkIns) {
        if (!lastVisit.has(c.member_oid) || lastVisit.get(c.member_oid)! < c.in_at) lastVisit.set(c.member_oid, c.in_at);
        if (!c.out_at) openCheckIn.set(c.member_oid, c);
    }
    const members = new Map(d.members.map(m => [m.oid, m]));
    const byCode = new Map(d.members.map(m => [m.code.toUpperCase(), m]));
    cached = { version: v, idx: { subs, allSubs, invoices, lastVisit, openCheckIn, members, byCode } };
    return cached.idx;
}

export interface MemberState {
    status: MemberStatus;
    current: Subscription | null;
    /** Current, else upcoming, else the last one. */
    relevant: Subscription | null;
    valid_until: string | null;
    days_left: number | null;
    dues: number;
    last_visit: string | null;
    frozen_until: string | null;
}

export function memberState(m: MemberRow, today: string): MemberState {
    const i = idx();
    const subs = i.subs.get(m.oid) ?? [];
    const current = subs.find(s => s.start_date <= today && today <= s.end_date) ?? null;
    const upcoming = subs.find(s => s.start_date > today) ?? null;
    const relevant = current ?? upcoming ?? subs.at(-1) ?? null;
    const freeze = current?.freezes.find(f => f.from <= today && today <= f.to) ?? null;
    const dues = (i.invoices.get(m.oid) ?? []).reduce((sum, inv) => sum + inv.due, 0);
    let status: MemberStatus;
    // A suspension outranks everything, a join request included (the API's order).
    if (m.suspended) status = 'Suspended';
    else if (m.pending) status = 'Pending';
    else if (current) status = freeze ? 'Frozen' : 'Active';
    else if (upcoming) status = 'Active';
    else status = 'Expired';
    const validUntil = (current ?? upcoming ?? relevant)?.end_date ?? null;
    return {
        status,
        current,
        relevant,
        valid_until: validUntil,
        days_left: validUntil ? daysBetween(today, validUntil) : null,
        dues,
        last_visit: i.lastVisit.get(m.oid) ?? null,
        frozen_until: freeze?.to ?? null
    };
}

export function listItem(m: MemberRow, today: string): MemberListItem {
    const s = memberState(m, today);
    return {
        oid: m.oid,
        code: m.code,
        name: m.name,
        phone: m.phone,
        gender: m.gender,
        photo_url: m.photo_url,
        status: s.status,
        plan_name: s.relevant?.plan_name ?? null,
        valid_until: s.valid_until,
        days_left: s.days_left,
        dues: s.dues,
        last_visit: s.last_visit,
        joined_on: m.joined_on
    };
}

export function memberDetail(m: MemberRow, today: string, d: MockDb = db()): Member {
    const s = memberState(m, today);
    const branch = d.branches.find(b => b.oid === m.branch_oid)!;
    return {
        ...listItem(m, today),
        branch: toRef(branch),
        email: m.email,
        date_of_birth: m.date_of_birth,
        address: m.address,
        emergency_contact: m.emergency_contact,
        health_flags: m.health_flags,
        health_declared: m.health_declared,
        trainer_oid: m.trainer_oid,
        trainer_name: d.trainers.find(t => t.oid === m.trainer_oid)?.name ?? null,
        current_subscription_oid: s.current?.oid ?? null,
        notes: m.suspended ? `Suspended: ${m.suspended.reason}` : m.notes
    };
}

export function branchById(oid: string): Branch | undefined {
    return db().branches.find(b => b.oid === oid);
}
