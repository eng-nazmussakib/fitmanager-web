import type { MockDb } from '../types';
import { addDaysIso, at } from './clock';

/**
 * Phase 7b (D-108), like seed 108: the messages themselves are derived from the data (mock/inbox.ts), so the seed
 * adds only what the earlier seeds lack:
 * - an appeal the BRANCH decides: the member with the desk's verbal warning (20 days ago) appealed it two days
 *   later, still open (the other appeals go to HQ);
 * - a message read long ago: the portal member's welcome, 200 days old, which is no longer listed.
 */
export function seedMessages(db: MockDb, today: string): void {
    const s = db.sanctions.find(x => x.member_oid && x.given_role === 'desk' && x.given_on === addDaysIso(today, -20) && !x.appeal);
    const m = s && db.members.find(x => x.oid === s.member_oid);
    if (s && m)
        s.appeal = {
            oid: `apl-${s.oid}`,
            body: 'I was only asking the desk about my locker. I did not mean to be rude.',
            status: 'open',
            filed_at: at(addDaysIso(s.given_on, 2), 9 * 60 + 15),
            filed_by_name: m.name,
            decided_by_name: null,
            decision_note: null,
            decided_at: null
        };

    const portal = db.members.find(x => x.code === 'MEM-GUL-000001');
    if (portal) {
        const created = at(addDaysIso(today, -200), 10 * 60);
        db.messages.push({
            oid: 'msg-old-welcome',
            member_oid: portal.oid,
            kind: 'welcome',
            subject: 'Welcome to the gym',
            body: `Dear ${portal.name}, welcome. This message is older than 180 days and was read, so it is no longer listed.`,
            created_at: created
        });
        db.reads.push({ oid: `m:${portal.oid}|msg-old-welcome`, read_at: at(addDaysIso(today, -199), 10 * 60) });
    }
}
