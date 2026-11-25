import { memberPolicies, memberSanction, sanctionState, staffSuspendedUntil } from '../governance';
import { seed } from './seed';

/** The governance cases in the demo data, the same list as the database's showcase seed 105. */
describe('every governance case in the demo data', () => {
    const today = '2026-11-19';
    const db = seed(today, 12 * 60);
    const gul = db.branches.find(b => b.code === 'GUL')!.oid;
    const member = (code: string) => db.members.find(m => m.code === code)!;

    it('policies: five from HQ, gym rules v2 to accept again, one overdue and one due', () => {
        expect(db.policies.map(p => p.slug)).toEqual(['gym-rules', 'membership-terms', 'refund-policy', 'privacy-policy', 'liability-waiver']);
        expect(db.policyVersions.filter(v => v.mode === 'wording_only').map(v => v.oid)).toEqual(['polv-refund-policy-2']);
        const states = db.members
            .filter(m => !m.pending && !m.anonymised)
            .flatMap(m =>
                memberPolicies(m, today, db)
                    .filter(p => p.state !== 'accepted')
                    .map(p => p.state)
            );
        expect(states).toContain('overdue');
        expect(states).toContain('due');
        expect(memberPolicies(member('MEM-GUL-000001'), today, db).find(p => p.slug === 'gym-rules')).toMatchObject({ state: 'accepted', method: 'portal' });
    });

    it('member cases: the ladder, an open appeal, bans at one and every branch, lifted and overturned steps', () => {
        const tanvir = member('MEM-GUL-000005');
        expect(db.sanctions.filter(s => s.member_oid === tanvir.oid).map(s => s.level)).toEqual(['suspension', 'verbal', 'written']);
        expect(memberSanction(tanvir, today, db)?.level).toBe('suspension');
        expect(db.sanctions.find(s => s.member_oid === tanvir.oid && s.level === 'suspension')?.appeal?.status).toBe('open');
        const states = db.sanctions.map(s => `${s.level}:${sanctionState(s, today)}`);
        expect(states).toEqual(expect.arrayContaining(['ban:in_force', 'ban:lifted', 'written:overturned', 'suspension:ended', 'verbal:recorded']));
        expect(db.sanctions.some(s => s.level === 'ban' && s.scope === 'all')).toBe(true);
        expect(db.sanctions.some(s => s.level === 'ban' && s.membership_cancelled)).toBe(true);
        expect(db.sanctions.some(s => s.appeal?.status === 'rejected')).toBe(true);
        // A visitor banned at Gulshan only: not Banned at home.
        const visitorBan = db.sanctions.find(s => s.level === 'ban' && s.branch_oid === gul && s.member_branch_oid !== gul)!;
        expect(
            memberSanction(
                db.members.find(m => m.oid === visitorBan.member_oid)!,
                today,
                db
            )
        ).toBeNull();
        expect(db.incidents.some(i => i.reported_role === 'trainer' && !db.sanctions.some(s => s.incident_oid === i.oid))).toBe(true);
        expect(db.incidents.some(i => i.closed_at)).toBe(true);
    });

    it('staff cases: a warning to appeal, a suspension blocking sign-in, a ban, a case HQ handles', () => {
        expect(db.sanctions.find(s => s.staff_username === 'trainer.gulshan')).toMatchObject({ level: 'verbal', appeal: null });
        expect(staffSuspendedUntil('shakib.hasan', today, db)).toBe('2026-11-23');
        expect(staffSuspendedUntil('trainer.gulshan', today, db)).toBeNull();
        expect(db.sanctions.find(s => s.staff_username === 'sohel.rana')).toMatchObject({ level: 'ban', given_role: 'hq', scope: 'all' });
        expect(db.incidents.find(i => i.staff_username === 'manager.dhanmondi')?.hq_only).toBe(true);
    });

    it('complaints: each status, overdue, escalated by the manager and the member, HQ only, a photo', () => {
        const c = db.complaints;
        expect(new Set(c.map(x => x.status))).toEqual(new Set(['open', 'in_progress', 'resolved', 'closed']));
        expect(c.some(x => x.escalated?.by === 'manager')).toBe(true);
        expect(c.some(x => x.escalated?.by === 'member')).toBe(true);
        expect(c.some(x => x.hq_only)).toBe(true);
        expect(c.some(x => x.named_staff === 'tom.blake')).toBe(true);
        expect(c.some(x => x.photo_file_oid)).toBe(true);
        expect(c.find(x => x.member_oid === member('MEM-GUL-000001').oid)?.status).toBe('resolved');
        expect(new Set(c.map(x => x.branch_oid)).size).toBe(3);
    });

    it('NPS and ratings: across the scale with a dismissal; the portal member’s sessions left to rate', () => {
        const scores = db.nps.map(n => n.score);
        expect(scores).toContain(null);
        expect(scores.some(s => s !== null && s >= 9)).toBe(true);
        expect(scores.some(s => s !== null && s <= 6)).toBe(true);
        expect(db.nps.some(n => n.member_oid === member('MEM-GUL-000001').oid)).toBe(false);
        expect(db.ratings.length).toBeGreaterThan(5);
        expect(db.ratings.some(r => r.member_oid === member('MEM-GUL-000001').oid)).toBe(false);
    });
});
