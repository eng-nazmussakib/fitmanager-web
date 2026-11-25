import type { ComplaintCategory, GiverRole, IncidentCategory, SanctionLevel } from '@core/models/governance.model';

import type { ComplaintRow, FileRow, IncidentRow, MemberRow, MockDb, SanctionRow } from '../types';
import { addDaysIso } from './clock';
import { POLICY_CLAUSE_SEED, POLICY_SEED, POLICY_VERSION_SEED } from './policies.data';

/**
 * Governance in demo mode: the policies (the demo seed 007's, plus gym rules v2) and one record for
 * every governance case, on the mock's own members, the same cases as fitmanager-infra/db/seeds/showcase/105:
 *
 * - Policies: everyone signed the policies in force on paper when they joined, and gym rules v2 since, but for one
 *   member whose grace period is over (check-in blocked, overridable) and a new member who has signed nothing (due).
 * - Members: three cases up the ladder ending in a suspension in force, with evidence and an open appeal (the
 *   scripted Tanvir Hasan, MEM-GUL-000005) · the portal member (MEM-GUL-000001) with a verbal warning to appeal · a
 *   Gulshan ban by the manager (plan cancelled, appeal rejected) · an HQ ban at every branch, lifted · a warning
 *   overturned on appeal · a suspension that has ended · a Dhanmondi visitor banned at Gulshan only · an incident by
 *   a trainer waiting for a manager · a closed case · a suspension at Dhanmondi and Uttara.
 * - Staff: Sam Cole (trainer.gulshan) a verbal warning he can appeal · Tom Blake a written warning · Shakib Hasan
 *   suspended · Sohel Rana (Dhanmondi desk) banned by HQ · Riyad Kabir (manager.dhanmondi): a case HQ handles.
 * - Complaints in each status, overdue, escalated by the manager and by the member, naming a trainer and naming the
 *   branch manager (HQ only); NPS answers across the scale and a dismissal; ratings of this week's classes and PT.
 */

const at = (date: string, hhmm: string): string => `${date}T${hhmm}:00+06:00`;

/** HQ's policies and their versions; gym rules v2 ("accept again") was published 20 days ago. */
export function seedPolicies(db: MockDb, today: string): void {
    db.policies = POLICY_SEED.map((p, i) => ({ oid: `pol-${i + 1}`, ...p, active: true, updated_at: at('2026-01-01', '10:00') }));
    const slugOid = (slug: string): string => db.policies.find(p => p.slug === slug)!.oid;
    db.policyVersions = POLICY_VERSION_SEED.map(v => ({
        oid: `polv-${v.slug}-${v.version}`,
        policy_oid: slugOid(v.slug),
        version: v.version,
        mode: v.mode,
        change_note: v.change_note,
        published_on: v.published_on,
        published_by_name: 'HQ',
        clauses: POLICY_CLAUSE_SEED.filter(c => c.slug === v.slug && c.version === v.version).map(c => ({
            oid: `cl-${v.slug}-${v.version}-${c.number}`,
            number: c.number,
            heading: c.heading,
            body: c.body
        }))
    }));
    const v1 = db.policyVersions.find(v => v.oid === 'polv-gym-rules-1')!;
    db.policyVersions.push({
        oid: 'polv-gym-rules-2',
        policy_oid: v1.policy_oid,
        version: 2,
        mode: 'accept_again',
        change_note: 'Clause 7 now covers filming on the floor, and a new clause 8 asks for headphones instead of speakers.',
        published_on: addDaysIso(today, -20),
        published_by_name: 'Shirin Akhter',
        clauses: [
            ...v1.clauses.filter(c => c.number !== '7').map(c => ({ ...c, oid: c.oid.replace('-1-', '-2-') })),
            {
                oid: 'cl-gym-rules-2-7',
                number: '7',
                heading: 'Photos and filming',
                body: 'Do not photograph or film other members or staff without their permission, and never in the changing rooms.'
            },
            { oid: 'cl-gym-rules-2-8', number: '8', heading: 'Music', body: 'Use headphones. Speakers and music played aloud are not allowed on the floor.' }
        ]
    });
    db.acceptances = [];
    db.incidents = [];
    db.sanctions = [];
    db.complaints = [];
    db.nps = [];
    db.ratings = [];
}

const clauseLabel = (db: MockDb, oid: string | null): string | null => {
    if (!oid) return null;
    for (const v of db.policyVersions) {
        const c = v.clauses.find(x => x.oid === oid);
        if (c) return `${db.policies.find(p => p.oid === v.policy_oid)?.title} v${v.version} §${c.number}: ${c.heading}`;
    }
    return null;
};
/** Clause `n` of the current gym rules (v2). */
const gym = (n: string): string => `cl-gym-rules-2-${n}`;

interface IncidentOpts {
    branch: string;
    member?: MemberRow;
    staff?: { username: string; name: string; role: string };
    on: string;
    time: string;
    category: IncidentCategory;
    summary: string;
    description: string;
    clause?: string | null;
    by: { name: string; username: string; role: GiverRole };
    notes?: string;
    witnesses?: string;
    evidence?: string[];
    hqOnly?: boolean;
    closed?: boolean;
}

function incident(db: MockDb, o: IncidentOpts): IncidentRow {
    const row: IncidentRow = {
        oid: `inc-${db.incidents.length + 1}`,
        branch_oid: o.branch,
        subject_kind: o.member ? 'member' : 'staff',
        member_oid: o.member?.oid ?? null,
        member_branch_oid: o.member?.branch_oid ?? null,
        staff_username: o.staff?.username ?? null,
        subject_name: o.member?.name ?? o.staff?.name ?? '',
        subject_code: o.member?.code ?? o.staff?.username ?? '',
        subject_role: o.staff?.role ?? null,
        occurred_at: at(o.on, o.time),
        category: o.category,
        summary: o.summary,
        description: o.description,
        clause_oid: o.clause ?? null,
        clause_label: clauseLabel(db, o.clause ?? null),
        witnesses: o.witnesses ?? null,
        internal_notes: o.notes ?? null,
        evidence_file_oids: o.evidence ?? [],
        hq_only: o.hqOnly ?? false,
        reported_by: o.by.username,
        reported_by_name: o.by.name,
        reported_role: o.by.role,
        closed_at: o.closed ? at(o.on, '23:00') : null,
        created_at: at(o.on, o.time)
    };
    db.incidents.push(row);
    return row;
}

function step(
    db: MockDb,
    i: IncidentRow,
    level: SanctionLevel,
    reason: string,
    suggested: SanctionLevel,
    on: string,
    by: { name: string; username: string; role: GiverRole },
    more: Partial<Pick<SanctionRow, 'ends_on' | 'scope' | 'choice_reason' | 'membership_cancelled'>> = {}
): SanctionRow {
    const row: SanctionRow = {
        oid: `san-${db.sanctions.length + 1}`,
        branch_oid: i.branch_oid,
        incident_oid: i.oid,
        member_oid: i.member_oid,
        member_branch_oid: i.member_branch_oid,
        staff_username: i.staff_username,
        level,
        starts_on: on,
        ends_on: more.ends_on ?? null,
        scope: more.scope ?? (level === 'ban' ? 'branch' : null),
        reason,
        suggested_level: suggested,
        choice_reason: more.choice_reason ?? null,
        given_by: by.username,
        given_by_name: by.name,
        given_role: by.role,
        given_on: on,
        membership_cancelled: more.membership_cancelled ?? false,
        lifted: null,
        overturned_at: null,
        appeal: null
    };
    db.sanctions.push(row);
    return row;
}

function appeal(s: SanctionRow, body: string, on: string, by: string, decided?: { status: 'upheld' | 'rejected'; note: string; on: string; by: string }): void {
    s.appeal = {
        oid: `apl-${s.oid}`,
        body,
        status: decided?.status ?? 'open',
        filed_at: at(on, '09:15'),
        filed_by_name: by,
        decided_by_name: decided?.by ?? null,
        decision_note: decided?.note ?? null,
        decided_at: decided ? at(decided.on, '12:00') : null
    };
    if (decided?.status === 'upheld') s.overturned_at = at(decided.on, '12:00');
}

/** A ban covering the home branch cancels the membership, as the API does. */
function cancelMembership(db: MockDb, m: MemberRow, on: string, reason: string): boolean {
    let any = false;
    for (const s of db.subscriptions.filter(x => x.member_oid === m.oid && x.kind !== 'pt' && !x.cancelled_at && x.end_date >= on)) {
        Object.assign(s, {
            end_date: s.start_date > on ? addDaysIso(s.start_date, -1) : addDaysIso(on, -1),
            cancelled_at: at(on, '18:30'),
            cancel_reason: reason,
            status: 'Cancelled'
        });
        any = true;
    }
    return any;
}

const MANAGER = {
    GUL: { name: 'Ashraf Siddique', username: 'manager.gulshan' },
    DHA: { name: 'Riyad Kabir', username: 'manager.dhanmondi' },
    UTT: { name: 'Zahid Alam', username: 'manager.uttara' }
};
const DESK = {
    GUL: { name: 'Lamia Haque', username: 'desk.gulshan' },
    DHA: { name: 'Mim Sarker', username: 'desk.dhanmondi' },
    UTT: { name: 'Tanjila Biswas', username: 'desk.uttara' }
};
const HQ = { name: 'Shirin Akhter', username: 'admin.hq', role: 'hq' as const };

/**
 * A suspension in force on `m`, with its incident (called by the members seed for its suspended members, so the seeds
 * after it, which skip suspended members, see it).
 */
export function seedSuspension(
    db: MockDb,
    m: MemberRow,
    branchCode: 'GUL' | 'DHA' | 'UTT',
    since: string,
    days: number,
    reason: string,
    summary: string
): void {
    const by = { ...MANAGER[branchCode], role: 'manager' as const };
    const i = incident(db, {
        branch: m.branch_oid,
        member: m,
        on: since,
        time: '19:40',
        category: 'conduct',
        summary,
        description: reason,
        clause: gym('3'),
        by: { ...DESK[branchCode], role: 'desk' }
    });
    step(db, i, 'suspension', reason, 'verbal', since, by, { ends_on: addDaysIso(since, days - 1), choice_reason: 'Serious first case.' });
}

/** Whether the members seed suspended `m` (the seeds after it skip such members). */
export function seededSuspended(db: MockDb, m: MemberRow): boolean {
    return (db.sanctions ?? []).some(s => s.member_oid === m.oid && s.level === 'suspension');
}

export function seedGovernanceCases(db: MockDb, today: string): void {
    const d = (n: number): string => addDaysIso(today, -n);
    const gul = db.branches.find(b => b.code === 'GUL')!.oid;
    const dha = db.branches.find(b => b.code === 'DHA')!.oid;
    const utt = db.branches.find(b => b.code === 'UTT')!.oid;
    const mgr = { ...MANAGER.GUL, role: 'manager' as const };
    const desk = { ...DESK.GUL, role: 'desk' as const };
    const byCode = (code: string): MemberRow => db.members.find(m => m.code === code)!;
    const used = new Set<string>(['MEM-GUL-000001', 'MEM-GUL-000005', 'MEM-GUL-000007']);
    const sanctioned = new Set(db.sanctions.map(s => s.member_oid));
    const statusOk = (m: MemberRow): boolean =>
        !m.pending &&
        !m.anonymised &&
        db.subscriptions.some(s => s.member_oid === m.oid && s.kind !== 'pt' && !s.cancelled_at && s.start_date <= today && today <= s.end_date);
    /**
     * The next member of a branch not used by another case: active, not a scripted one, joined more than 40 days ago.
     * From the end of the list: the earlier seeds' cases take theirs from the start.
     */
    const pool = [...db.members].reverse();
    const pick = (branch: string, recent = false): MemberRow => {
        const m = pool.find(
            x =>
                x.branch_oid === branch &&
                !used.has(x.code) &&
                !sanctioned.has(x.oid) &&
                Number(x.code.slice(-6)) > 20 &&
                statusOk(x) &&
                (recent ? x.joined_on >= d(13) : x.joined_on <= d(40))
        );
        if (!m) throw new Error(`governance seed: no member to pick at ${branch}`);
        used.add(m.code);
        return m;
    };

    // ---------- policies: who has accepted what ----------
    const overdue = pick(gul);
    const fresh = db.members.find(x => x.branch_oid === dha && !x.pending && !x.anonymised && x.joined_on >= d(13)) ?? pick(dha, true);
    used.add(fresh.code);
    for (const m of db.members) {
        if (m.pending || m.anonymised || m.oid === fresh.oid) continue;
        for (const p of db.policies) {
            const versions = db.policyVersions
                .filter(v => v.policy_oid === p.oid && (v.published_on < m.joined_on || v.version === 1))
                .sort((a, b) => b.version - a.version);
            const v = versions[0];
            db.acceptances.push({
                oid: `acc-${db.acceptances.length + 1}`,
                branch_oid: m.branch_oid,
                member_oid: m.oid,
                policy_oid: p.oid,
                version_oid: v.oid,
                version: v.version,
                method: 'paper',
                recorded_by_name: DESK[db.branches.find(b => b.oid === m.branch_oid)!.code as 'GUL'].name,
                accepted_at: at(m.joined_on, '10:30')
            });
        }
        const accepted2 = db.acceptances.some(a => a.member_oid === m.oid && a.version_oid === 'polv-gym-rules-2');
        if (!accepted2 && m.oid !== overdue.oid) {
            const portal = m.code === 'MEM-GUL-000001';
            db.acceptances.push({
                oid: `acc-${db.acceptances.length + 1}`,
                branch_oid: m.branch_oid,
                member_oid: m.oid,
                policy_oid: 'pol-1',
                version_oid: 'polv-gym-rules-2',
                version: 2,
                method: portal ? 'portal' : 'paper',
                recorded_by_name: portal ? null : DESK[db.branches.find(b => b.oid === m.branch_oid)!.code as 'GUL'].name,
                accepted_at: at(m.joined_on > d(18) ? m.joined_on : d(18), '11:00')
            });
        }
    }

    // ---------- evidence and the complaint photo (credited photos, MEDIA-CREDITS.md; a statement made for the demo) ----------
    const file = (oid: string, kind: FileRow['kind'], name: string, type: string, url: string, member: string | null): void => {
        (db.files ??= []).push({
            oid,
            branch_oid: gul,
            member_oid: member,
            kind,
            name,
            content_type: type,
            size_bytes: 20_000,
            status: 'ready',
            url,
            created_at: at(d(2), '20:30'),
            created_by_name: 'Lamia Haque'
        });
    };
    file('file-ev-1', 'incident_evidence', 'statement-lamia-haque.pdf', 'application/pdf', 'assets/governance/statement.pdf', null);
    file('file-ev-2', 'incident_evidence', 'bench-area.webp', 'image/webp', 'assets/images/training/bench-1.webp', null);

    // ---------- members ----------
    // Tanvir Hasan (scripted, MEM-GUL-000005): verbal → written → the members seed's suspension, with evidence and an open appeal.
    const tanvir = byCode('MEM-GUL-000005');
    const first = incident(db, {
        branch: gul,
        member: tanvir,
        on: d(20),
        time: '19:10',
        category: 'equipment',
        summary: 'Left plates on the floor',
        description: 'Left four 20 kg plates by the squat rack after his set, in the walkway.',
        clause: gym('2'),
        by: desk,
        closed: true
    });
    step(db, first, 'verbal', 'Put weights back on the rack after use (gym rules §2).', 'verbal', d(20), desk);
    const second = incident(db, {
        branch: gul,
        member: tanvir,
        on: d(9),
        time: '20:05',
        category: 'conduct',
        summary: 'Argued with the desk over a towel',
        description: 'Raised his voice at the desk when asked to bring his own towel.',
        clause: gym('3'),
        by: desk,
        closed: true
    });
    step(db, second, 'written', 'Treat staff with respect (gym rules §3). A further case may lead to a suspension.', 'written', d(8), mgr);
    const susp = db.sanctions.find(s => s.member_oid === tanvir.oid && s.level === 'suspension')!;
    const third = db.incidents.find(i => i.oid === susp.incident_oid)!;
    Object.assign(third, {
        evidence_file_oids: ['file-ev-1', 'file-ev-2'],
        witnesses: 'Sam Cole (trainer on duty); the other member, Arif',
        internal_notes: 'Third case in 3 weeks. Spoke to him by phone the next morning; he was calm and apologised.'
    });
    // The third strike: a suspension is the suggested step.
    Object.assign(susp, {
        suggested_level: 'suspension',
        choice_reason: null,
        given_on: third.occurred_at.slice(0, 10),
        starts_on: third.occurred_at.slice(0, 10)
    });
    appeal(susp, 'Two weeks is too long. The other member started it and I have already apologised to him.', d(1), tanvir.name);

    // The portal member (MEM-GUL-000001): a verbal warning they can still appeal.
    const rahim = byCode('MEM-GUL-000001');
    step(
        db,
        incident(db, {
            branch: gul,
            member: rahim,
            on: d(2),
            time: '07:20',
            category: 'conduct',
            summary: 'Music on a speaker',
            description: 'Played music from his phone’s speaker on the stretching mats.',
            clause: gym('8'),
            by: desk
        }),
        'verbal',
        'Please use headphones on the floor (gym rules §8).',
        'verbal',
        d(2),
        desk
    );

    // A Gulshan ban by the manager: the plan is cancelled; HQ rejected the appeal.
    const banned = pick(gul);
    const b1 = step(
        db,
        incident(db, {
            branch: gul,
            member: banned,
            on: d(5),
            time: '21:00',
            category: 'harassment',
            summary: 'Threatened a trainer',
            description: 'Threatened Tom Blake after being asked to share a machine, and followed him to the staff room.',
            clause: gym('3'),
            by: mgr,
            notes: 'Police not called; Tom did not want to. Camera footage kept.'
        }),
        'ban',
        'Threatening a member of staff (gym rules §3).',
        'verbal',
        d(5),
        mgr,
        { choice_reason: 'Threats to staff: straight to a ban.' }
    );
    b1.membership_cancelled = cancelMembership(db, banned, d(5), 'Banned: Threatening a member of staff (gym rules §3).');
    appeal(b1, 'I did not threaten anyone. I only said I would complain about him.', d(4), banned.name, {
        status: 'rejected',
        note: 'The footage shows him following the trainer to the staff room. The ban stands.',
        on: d(3),
        by: HQ.name
    });

    // An HQ ban at every branch, lifted by HQ (the plan stays cancelled).
    const everywhere = pick(gul);
    const b2 = step(
        db,
        incident(db, {
            branch: gul,
            member: everywhere,
            on: d(6),
            time: '18:00',
            category: 'conduct',
            summary: 'Filmed other members in the changing room',
            description: 'Seen filming in the changing room. The video was deleted in front of the manager.',
            clause: gym('7'),
            by: mgr
        }),
        'ban',
        'Filming other members in the changing room (gym rules §7).',
        'verbal',
        d(6),
        HQ,
        { scope: 'all', choice_reason: 'Privacy of other members: a ban at every branch.' }
    );
    b2.membership_cancelled = cancelMembership(db, everywhere, d(6), 'Banned: Filming other members in the changing room (gym rules §7).');
    b2.lifted = { at: at(d(1), '15:00'), by: HQ.name, reason: 'Was filming their own form; the other members confirmed it. Apologised in writing.' };

    // A written warning overturned on appeal.
    const wrong = pick(gul);
    appeal(
        step(
            db,
            incident(db, {
                branch: gul,
                member: wrong,
                on: d(10),
                time: '08:30',
                category: 'access',
                summary: 'Came in on another member’s card',
                description: 'The desk thought they used a sibling’s card.',
                clause: gym('6'),
                by: desk
            }),
            'written',
            'Use your own member card (gym rules §6).',
            'verbal',
            d(10),
            mgr,
            { choice_reason: 'Card misuse is serious.' }
        ),
        'It was my own card. My sibling and I look alike; please check the photo on my record.',
        d(9),
        wrong.name,
        { status: 'upheld', note: 'The card and the photo are theirs. Sorry for the mistake.', on: d(8), by: HQ.name }
    );

    // A suspension that has ended.
    step(
        db,
        incident(db, {
            branch: gul,
            member: pick(gul),
            on: d(13),
            time: '18:45',
            category: 'safety',
            summary: 'Dropped a loaded barbell from overhead',
            description: 'Dropped a loaded barbell from overhead next to another member, twice, after a warning.',
            clause: gym('4'),
            by: mgr,
            closed: true
        }),
        'suspension',
        'Unsafe lifting after a warning (gym rules §4). Suspended for a week.',
        'verbal',
        d(12),
        mgr,
        { ends_on: d(6), choice_reason: 'Danger to another member.' }
    );

    // A Dhanmondi member banned at Gulshan only, as a visitor.
    step(
        db,
        incident(db, {
            branch: gul,
            member: pick(dha),
            on: d(1),
            time: '17:30',
            category: 'access',
            summary: 'Let a friend in on their card',
            description: 'Passed their card back over the barrier for a friend who is not a member.',
            clause: gym('6'),
            by: mgr
        }),
        'ban',
        'Letting a non-member in on your card (gym rules §6). Banned from Gulshan.',
        'verbal',
        d(1),
        mgr,
        { choice_reason: 'Caught twice at the barrier on the same evening.' }
    );

    // Recorded by a trainer, waiting for a manager's step.
    incident(db, {
        branch: gul,
        member: pick(gul),
        on: d(1),
        time: '18:20',
        category: 'safety',
        summary: 'Dropped dumbbells repeatedly',
        description: 'Dropped 30 kg dumbbells on the floor after every set, close to other members.',
        clause: gym('4'),
        by: { name: 'Sam Cole', username: 'trainer.gulshan', role: 'trainer' }
    });

    // A closed case with a verbal warning.
    step(
        db,
        incident(db, {
            branch: gul,
            member: pick(gul),
            on: d(28),
            time: '11:00',
            category: 'hygiene',
            summary: 'Outdoor shoes on the floor',
            description: 'Trained in outdoor shoes after the monsoon rain.',
            clause: 'cl-gym-rules-2-1',
            by: desk,
            closed: true
        }),
        'verbal',
        'Wear clean indoor shoes on the floor (gym rules §1).',
        'verbal',
        d(28),
        desk
    );

    // ---------- staff ----------
    const trainer = (username: string, name: string): { username: string; name: string; role: string } => ({ username, name, role: 'TRAINER' });
    step(
        db,
        incident(db, {
            branch: gul,
            staff: trainer('trainer.gulshan', 'Sam Cole'),
            on: d(3),
            time: '18:10',
            category: 'conduct',
            summary: 'Phone calls during a class',
            description: 'Took two phone calls during the 6 pm HIIT class.',
            by: mgr
        }),
        'verbal',
        'Keep your phone away during classes.',
        'verbal',
        d(3),
        mgr
    );
    step(
        db,
        incident(db, {
            branch: gul,
            staff: trainer('tom.blake', 'Tom Blake'),
            on: d(15),
            time: '07:05',
            category: 'attendance',
            summary: 'Late for three morning classes',
            description: 'Arrived 10 to 20 minutes late for three 7 am classes in two weeks.',
            by: mgr
        }),
        'written',
        'Late for three classes. Be on the floor 10 minutes before your classes.',
        'verbal',
        d(15),
        mgr,
        { choice_reason: 'Three times in two weeks.' }
    );
    step(
        db,
        incident(db, {
            branch: gul,
            staff: trainer('shakib.hasan', 'Shakib Hasan'),
            on: d(1),
            time: '19:30',
            category: 'conduct',
            summary: 'Shouted at a member',
            description: 'Shouted at a member who asked to use the cable machine he was resting on.',
            witnesses: 'Lamia Haque (desk)',
            by: mgr
        }),
        'suspension',
        'Shouting at a member. Suspended for five days.',
        'verbal',
        d(1),
        mgr,
        { ends_on: addDaysIso(today, 4), choice_reason: 'Staff are held to a higher standard with members.' }
    );
    step(
        db,
        incident(db, {
            branch: dha,
            staff: { username: 'sohel.rana', name: 'Sohel Rana', role: 'FRONT_DESK' },
            on: d(7),
            time: '21:00',
            category: 'payment',
            summary: 'Took cash without a receipt',
            description: 'Took ৳3,000 in cash for a monthly plan and gave no receipt; the cash count was short by the same amount.',
            notes: 'The member kept the handwritten note he was given.',
            by: { ...MANAGER.DHA, role: 'manager' }
        }),
        'ban',
        'Taking cash without a receipt.',
        'verbal',
        d(7),
        HQ,
        { scope: 'all', choice_reason: 'Cash handling: dismissal.' }
    );
    step(
        db,
        incident(db, {
            branch: dha,
            staff: { username: 'manager.dhanmondi', name: 'Riyad Kabir', role: 'BRANCH_MANAGER' },
            on: d(3),
            time: '06:40',
            category: 'attendance',
            summary: 'Opened the branch 40 minutes late',
            description: 'The branch opened at 6:40 instead of 6:00; members waited outside.',
            by: { ...DESK.DHA, role: 'desk' },
            hqOnly: true
        }),
        'verbal',
        'Open the branch on time.',
        'verbal',
        d(2),
        HQ
    );

    // ---------- complaints ----------
    const counter: Record<string, number> = {};
    const complaint = (
        branch: string,
        m: MemberRow | null,
        category: ComplaintCategory,
        subject: string,
        body: string,
        created: string,
        via: 'portal' | 'desk',
        more: Partial<ComplaintRow> = {}
    ): ComplaintRow => {
        const code = db.branches.find(b => b.oid === branch)!.code;
        counter[code] = (counter[code] ?? 0) + 1;
        const row: ComplaintRow = {
            oid: `cmp-${db.complaints.length + 1}`,
            branch_oid: branch,
            code: `CMP-${code}-${String(counter[code]).padStart(5, '0')}`,
            member_oid: m?.oid ?? null,
            member_code: m?.code ?? null,
            member_name: m?.name ?? 'A visitor',
            category,
            subject,
            body,
            photo_file_oid: null,
            named_staff: null,
            named_staff_name: null,
            hq_only: false,
            filed_via: via,
            status: 'open',
            first_response_at: null,
            resolution: null,
            resolved_at: null,
            escalated: null,
            member_accepted_at: null,
            created_at: created,
            updates: [],
            ...more
        };
        db.complaints.push(row);
        db.counters[`complaint:${code}`] = counter[code];
        return row;
    };
    const reply = (
        c: ComplaintRow,
        author: 'staff' | 'member',
        name: string,
        body: string,
        when: string,
        status: ComplaintRow['status'] | null = null
    ): void => {
        c.updates.push({ oid: `${c.oid}-u${c.updates.length + 1}`, author, author_name: name, body, status, at: when });
        if (author === 'staff') {
            c.first_response_at ??= when;
            c.status = status ?? (c.status === 'open' ? 'in_progress' : c.status);
            if (status === 'resolved') Object.assign(c, { resolution: body, resolved_at: when });
        }
    };
    const others = (): MemberRow => pick(gul);
    complaint(
        gul,
        others(),
        'facilities',
        'Cold showers in the men’s changing room',
        'The showers in the men’s changing room have been cold every evening this week.',
        at(d(3), '21:10'),
        'portal'
    );
    file('file-cmp-1', 'complaint_photo', 'treadmill-3.webp', 'image/webp', 'assets/images/training/run-1.webp', null);
    complaint(
        gul,
        byCode('MEM-GUL-000003'),
        'equipment',
        'Treadmill 3 belt slipping',
        'The belt on treadmill 3 slips when you run faster than 10 km/h.',
        at(today, '08:00'),
        'desk',
        {
            photo_file_oid: 'file-cmp-1'
        }
    );
    let c = complaint(
        gul,
        others(),
        'cleanliness',
        'Changing room floor is wet and dirty',
        'The floor of the men’s changing room is wet and dirty in the mornings.',
        at(d(1), '07:30'),
        'desk'
    );
    reply(c, 'staff', 'Lamia Haque', 'Thanks. The cleaner is now booked for 6:30 am, before we open.', at(d(1), '12:00'));
    c = complaint(
        gul,
        rahim,
        'billing',
        'Receipt shows the admission fee twice',
        'My receipt for this month lists the admission fee twice.',
        at(d(4), '19:00'),
        'portal'
    );
    reply(
        c,
        'staff',
        'Ashraf Siddique',
        'The fee was charged once; the receipt printed the line twice. A corrected receipt is in your Payments.',
        at(d(2), '11:00'),
        'resolved'
    );
    const yogi = others();
    c = complaint(
        gul,
        yogi,
        'classes',
        'Yoga started 15 minutes late',
        'The Saturday yoga class started 15 minutes late and finished on time.',
        at(d(12), '10:00'),
        'portal'
    );
    reply(c, 'staff', 'Ashraf Siddique', 'Sorry: the room was not ready. The next class will run the full hour.', at(d(10), '09:00'), 'resolved');
    c.updates.push({ oid: `${c.oid}-u2`, author: 'member', author_name: yogi.name, body: 'Accepted the resolution', status: 'closed', at: at(d(9), '20:00') });
    Object.assign(c, { status: 'closed', member_accepted_at: at(d(9), '20:00') });
    c = complaint(
        gul,
        others(),
        'other',
        'Lost a water bottle',
        'I left a blue water bottle by the squat rack on Tuesday evening.',
        at(d(15), '21:00'),
        'desk'
    );
    reply(c, 'staff', 'Lamia Haque', 'Found and kept at the desk: ask for it next visit.', at(d(12), '10:00'), 'resolved');
    c = complaint(
        gul,
        others(),
        'staff',
        'Trainer was rude when I asked for help',
        'Tom Blake told me to watch a video instead of showing me how to use the leg press.',
        at(d(5), '09:00'),
        'portal',
        {
            named_staff: 'tom.blake',
            named_staff_name: 'Tom Blake'
        }
    );
    reply(c, 'staff', 'Ashraf Siddique', 'Sorry to hear this. I am speaking to Tom today.', at(d(5), '13:00'));
    c.escalated = { at: at(d(4), '10:00'), by: 'manager', reason: 'The second complaint about him this month.' };
    reply(c, 'staff', 'Ashraf Siddique', 'Escalated to HQ: The second complaint about him this month.', at(d(4), '10:00'));
    reply(c, 'staff', 'Shirin Akhter', 'HQ here: we have arranged a session for you with another trainer this week, free of charge.', at(d(3), '15:00'));
    const locker = others();
    c = complaint(gul, locker, 'equipment', 'Locker 12 does not lock', 'The lock on locker 12 does not close.', at(d(1), '12:10'), 'desk');
    reply(c, 'staff', 'Lamia Haque', 'Moved you to locker 14 for today.', at(d(1), '12:30'), 'resolved');
    c.updates.push({
        oid: `${c.oid}-u2`,
        author: 'member',
        author_name: locker.name,
        body: 'Escalated to HQ: I paid for locker 12 for the month and want it fixed, not a swap.',
        status: 'in_progress',
        at: at(today, '09:00')
    });
    Object.assign(c, {
        status: 'in_progress',
        escalated: { at: at(today, '09:00'), by: 'member', reason: 'I paid for locker 12 for the month and want it fixed, not a swap.' }
    });
    c = complaint(
        gul,
        others(),
        'staff',
        'The manager ignored my complaint',
        'I raised the cold showers with the manager in person and nothing happened.',
        at(d(2), '20:00'),
        'portal',
        {
            named_staff: 'manager.gulshan',
            named_staff_name: 'Ashraf Siddique',
            hq_only: true
        }
    );
    reply(c, 'staff', 'Shirin Akhter', 'HQ here: thank you. We are looking into the showers and the follow-up.', at(d(1), '11:00'));
    complaint(
        dha,
        pick(dha),
        'facilities',
        'Air conditioning not working',
        'The AC on the cardio floor has not worked for two days.',
        at(d(1), '18:00'),
        'desk'
    );
    c = complaint(utt, pick(utt), 'other', 'Not enough parking in the evening', 'There is nowhere to park after 6 pm.', at(d(2), '19:00'), 'desk');
    reply(c, 'staff', 'Tanjila Biswas', 'The building lets members use level B2 after 6 pm now; show your card to the guard.', at(d(1), '10:00'), 'resolved');

    // ---------- NPS: answers across the scale, a dismissal; the portal member has none, so the card shows ----------
    const scores: [number | null, string | null, number][] = [
        [4, 'Too crowded in the evenings.', 40],
        [3, 'The cardio machines are often broken.', 25],
        [9, null, 20],
        [8, 'Good trainers, small changing rooms.', 15],
        [10, 'Love the morning classes.', 12],
        [7, null, 9],
        [6, 'Showers are cold.', 5],
        [null, null, 4],
        [9, 'Clean and friendly.', 8]
    ];
    scores.forEach(([score, comment, ago], i) => {
        const m = i === 8 ? pick(dha) : others();
        db.nps.push({ oid: `nps-${i + 1}`, branch_oid: m.branch_oid, member_oid: m.oid, score, comment, created_at: at(d(ago), '20:00') });
    });

    // ---------- ratings: about two in three of this week's attended classes, and the PT sessions, but the portal member's ----------
    const from = at(d(7), '00:00');
    const nowIso = at(today, '00:00');
    const sessions = new Map(db.sessions.map(s => [s.oid, s]));
    let n = 0;
    for (const b of db.bookings) {
        const s = sessions.get(b.session_oid);
        if (!s || b.status !== 'Attended' || s.starts_at < from || s.starts_at >= nowIso || b.member_oid === rahim.oid || n++ % 3 === 2) continue;
        const score = 3 + (n % 3);
        db.ratings.push({
            oid: `rat-${db.ratings.length + 1}`,
            branch_oid: s.branch_oid,
            member_oid: b.member_oid,
            member_name: b.member_name,
            kind: 'class',
            booking_oid: b.oid,
            pt_session_oid: null,
            trainer_oid: s.trainer_oid,
            trainer_name: s.trainer_name,
            label: s.title,
            session_at: s.starts_at,
            score: n % 7 === 0 ? 2 : score,
            comment: n % 7 === 0 ? 'Too many people for the room.' : n % 5 === 0 ? 'Great energy, loud music.' : null,
            created_at: s.ends_at
        });
    }
    for (const p of db.ptSessions.filter(x => x.status === 'Completed' && x.starts_at >= from && x.starts_at < nowIso && x.member_oid !== rahim.oid)) {
        db.ratings.push({
            oid: `rat-${db.ratings.length + 1}`,
            branch_oid: p.branch_oid,
            member_oid: p.member_oid,
            member_name: p.member_name,
            kind: 'pt',
            booking_oid: null,
            pt_session_oid: p.oid,
            trainer_oid: p.trainer_oid,
            trainer_name: p.trainer_name,
            label: 'PT session',
            session_at: p.starts_at,
            score: 5,
            comment: 'Pushed me hard, in a good way.',
            created_at: p.ends_at
        });
    }
}
