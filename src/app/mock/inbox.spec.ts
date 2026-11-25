import { createAppAbility } from '@core/auth/ability';
import type { StaffMessageKind } from '@core/models/inbox.model';

import { memberMessages, newReads, staffInbox } from './inbox';
import { at } from './seed/clock';
import { seed } from './seed/seed';

const today = '2026-11-19';
const db = seed(today, 12 * 60);
const now = at(today, 12 * 60);
const branch = (code: string) => db.branches.find(b => b.code === code)!;
const inboxOf = (username: string, code: string) => {
    const account = db.accounts.find(a => a.username === username)!;
    const b = branch(code);
    const assignment = account.user.assignments.find(a => a.branch.oid === b.oid);
    return staffInbox(db, b, createAppAbility([...account.user.rules, ...(assignment?.rules ?? [])]), username, now);
};
const kinds = (box: ReturnType<typeof inboxOf>) => new Set(box.items.map(m => m.kind));

/** Notifications in demo mode: a message of every kind, read state, and who sees what. */
describe('the bell in demo mode', () => {
    it('members: every new kind is there for someone, with the API’s wording', () => {
        const all = db.members.flatMap(m => memberMessages(db, m, today, now));
        const by = new Set(all.map(n => n.kind));
        for (const k of ['receipt', 'shop_receipt', 'expiry_7d', 'complaint_reply', 'sanction', 'appeal_decided', 'policy_to_accept'] as const)
            expect(by).toContain(k);
        expect(all.find(n => n.kind === 'sanction')?.body).toMatch(/You can appeal under My record in the portal by \d+ \w+ \d{4}\.$/);
        expect(all.find(n => n.kind === 'shop_receipt')?.body).toMatch(/^Dear .+, thank you for shopping with us: .+\. Total ৳[\d,]+/);
    });

    it('the portal member: recent ones unread, older ones read, the 200-day-old one no longer listed', () => {
        const m = db.members.find(x => x.code === 'MEM-GUL-000001')!;
        const list = memberMessages(db, m, today, now);
        expect(list.some(n => n.read_at === null)).toBe(true);
        expect(list.some(n => n.read_at !== null)).toBe(true);
        expect(list.find(n => n.oid === 'msg-old-welcome')).toBeUndefined();
        // A member with no portal account has read nothing.
        const offline = db.members.find(x => x.code === 'MEM-GUL-000002')!;
        expect(memberMessages(db, offline, today, now).every(n => n.read_at === null)).toBe(true);
    });

    it('staff: each inbox has its own kinds, by permission; HQ gets orders to approve, escalations and appeals', () => {
        const gul = kinds(inboxOf('manager.gulshan', 'GUL'));
        for (const k of [
            'po_approved',
            'po_rejected',
            'transfer_requested',
            'transfer_sent',
            'ticket_urgent',
            'complaint_escalated',
            'appeal_filed'
        ] satisfies StaffMessageKind[])
            expect(gul).toContain(k);
        expect(gul).not.toContain('po_submitted');
        const hq = kinds(inboxOf('admin.hq', 'HQ'));
        for (const k of ['po_submitted', 'complaint_escalated', 'appeal_filed'] satisfies StaffMessageKind[]) expect(hq).toContain(k);
        expect(kinds(inboxOf('manager.dhanmondi', 'DHA'))).toContain('transfer_rejected');
        // The desk acts on none of these kinds.
        expect(inboxOf('desk.gulshan', 'GUL').items.filter(m => m.kind.startsWith('po_') || m.kind === 'appeal_filed')).toEqual([]);
        // Up to 3 days before the seed day is read; the bell counts the rest.
        const box = inboxOf('manager.gulshan', 'GUL');
        expect(box.unread).toBe(box.items.filter(m => !m.read_at).length);
    });

    it('marking read stores one mark per unread message, per reader', () => {
        const reader = { key: 'u:manager.gulshan', reads: true };
        expect(newReads(reader, ['a', 'b'], undefined, now).map(r => r.oid)).toEqual(['u:manager.gulshan|a', 'u:manager.gulshan|b']);
        expect(newReads(reader, ['a', 'b'], ['b', 'c'], now).map(r => r.oid)).toEqual(['u:manager.gulshan|b']);
    });
});
