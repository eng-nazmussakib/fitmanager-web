import type { Branch } from '@core/models/branch.model';
import type { Invoice, PaymentRecord } from '@core/models/payment.model';
import type { Subscription } from '@core/models/subscription.model';

import { invoiceDue, invoiceStatus, quote } from '../domain/pricing';
import type { ClosingRow, FileRow, MemberRow, MockDb } from '../types';
import { addDaysIso, at } from './clock';
import { seededSuspended } from './governance.seed';
import { toRef } from './organisation.seed';

/**
 * The membership and sales cases the generated members do not have, the same as the database's showcase seed
 * (fitmanager-infra db/seeds/showcase/101_every_case.sql), so every screen and state can be seen in the demo:
 * refunds in full and in part, an upgrade with its credit line, a plan ended early, a member transferred in, an
 * anonymised member (whose messages show as "skipped"), a web join request, a document, and yesterday's cash
 * closings. Runs after the members and check-ins are seeded. Deterministic: it picks members by code.
 */

const DESK = 'Lamia Haque';
const MANAGER_NAME = 'Ashraf Siddique';
/** The showcase seed's one-page sample PDF (db/seeds/showcase/files), small enough to inline. */
const SAMPLE_PDF =
    'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMzIgPj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiA3MiA3NjAgVGQgKFNhbXBsZSBkb2N1bWVudDogYSBkZW1vIE5JRCBjb3B5KSBUaiAwIC0yOCBUZCAvRjEgMTIgVGYgKEZpdE1hbmFnZXIgc2hvd2Nhc2UgZGF0YS4gTm90IGEgcmVhbCBwZXJzb24uKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDQyNCAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ5NAolJUVPRgo=';

export function seedEveryCase(db: MockDb, today: string): void {
    const gul = db.branches.find(b => b.code === 'GUL');
    const dha = db.branches.find(b => b.code === 'DHA');
    if (!gul || !dha) return;
    const used = new Set<string>();
    const subsOf = (oid: string): Subscription[] => db.subscriptions.filter(s => s.member_oid === oid);
    const invoiceOf = (s: Subscription): Invoice | undefined => db.invoices.find(i => i.oid === s.invoice_oid);
    // A generated member (not one of the scripted first twenty) whose plan runs today, fully paid, at `branch`.
    const pick = (branch: Branch, test: (s: Subscription, i: Invoice) => boolean = () => true): { m: MemberRow; sub: Subscription; inv: Invoice } | null => {
        for (const m of db.members) {
            if (m.branch_oid !== branch.oid || m.pending || seededSuspended(db, m) || used.has(m.oid) || Number(m.code.slice(-6)) <= 20) continue;
            const subs = subsOf(m.oid);
            const cur = subs.find(s => s.start_date <= today && today <= s.end_date && !s.cancelled_at && !s.freezes.length);
            const inv = cur ? invoiceOf(cur) : undefined;
            if (!cur || inv?.due !== 0 || subs.some(s => s.start_date > today) || !test(cur, inv)) continue;
            used.add(m.oid);
            return { m, sub: cur, inv };
        }
        return null;
    };
    const refund = (inv: Invoice, sub: Subscription, amount: number, method: PaymentRecord['method'], reason: string, day: string, by: string): void => {
        inv.payments.push({
            oid: `ref-${inv.oid}`,
            invoice_oid: inv.oid,
            kind: 'refund',
            amount,
            method,
            reference: method === 'cash' ? null : `RF-${inv.number.slice(-5)}`,
            received_at: at(day, 15 * 60),
            received_by: by,
            reason,
            approved_by: by
        });
        const paidIn = inv.paid;
        inv.paid = paidIn - amount;
        inv.refunded = amount;
        inv.due = invoiceDue(inv.total, paidIn, amount);
        inv.status = invoiceStatus(inv.total, paidIn, amount);
        sub.paid = inv.paid;
        sub.due = inv.due;
    };

    // Refunded in full at the desk on the day of a recent sale (the desk's policy: within 3 days), the same way it
    // was paid: the plan is taken back.
    const full = pick(gul, (_s, i) => i.payments.length === 1 && i.issued_at.slice(0, 10) >= addDaysIso(today, -3) && i.issued_at.slice(0, 10) < today);
    if (full) {
        const day = full.inv.issued_at.slice(0, 10);
        refund(full.inv, full.sub, full.inv.paid, full.inv.payments[0]?.method ?? 'cash', 'Changed mind', day, DESK);
        full.sub.end_date = full.sub.start_date > addDaysIso(day, -1) ? addDaysIso(full.sub.start_date, -1) : addDaysIso(day, -1);
        full.sub.cancelled_at = at(day, 15 * 60);
        full.sub.cancel_reason = 'Refunded: Changed mind';
    }

    // Refunded in part by the manager (goodwill, to bKash): the plan carries on, nothing is owed.
    const part = pick(gul, (_s, i) => i.total > 3000 && i.payments.length === 1);
    if (part) refund(part.inv, part.sub, 1000, 'bkash', 'Injury: doctor’s note; partial goodwill refund', addDaysIso(today, -3), MANAGER_NAME);

    // Ended early by the manager two days ago (no money moved).
    const ended = pick(gul, s => s.start_date <= addDaysIso(today, -4));
    if (ended) {
        ended.sub.end_date = addDaysIso(today, -3);
        ended.sub.cancelled_at = at(addDaysIso(today, -2), 12 * 60);
        ended.sub.cancel_reason = 'Moving abroad';
    }

    // Upgraded five days ago to Duo · 3 Months, with a credit for the unused days of the old plan.
    const plan = db.plans.find(p => p.code === 'GUL-DUO-3M');
    const up = plan && pick(gul, (s, i) => s.start_date <= addDaysIso(today, -6) && s.end_date > today && (i.lines[0]?.amount ?? 0) < plan.price);
    if (plan && up) {
        const day = addDaysIso(today, -5);
        const totalDays = (Date.parse(up.sub.end_date) - Date.parse(up.sub.start_date)) / 86_400_000 + 1;
        const unused = (Date.parse(up.sub.end_date) - Date.parse(day)) / 86_400_000 + 1;
        const credit = Math.round((up.inv.paid * unused) / totalDays);
        const q = quote({
            plan_name: plan.name,
            price: plan.price,
            months: plan.months,
            admission_fee: 0,
            charge_admission: false,
            discount: { kind: 'amount', value: credit },
            start_date: day,
            today: day,
            vat_rate: db.settings.vat_rate,
            vat_inclusive: db.settings.vat_inclusive,
            promos: []
        });
        const key = 'invoice:GUL';
        const n = (db.counters[key] = (db.counters[key] ?? 0) + 1);
        const invOid = `inv-upgrade-${up.m.oid}`;
        const lines = [...q.lines, { label: `Credit: ${unused} unused days of ${up.sub.plan_name}`, amount: -q.discount }];
        const inv: Invoice = {
            oid: invOid,
            number: `INV-GUL-${day.slice(0, 4)}-${String(n).padStart(5, '0')}`,
            branch: toRef(gul),
            member_oid: up.m.oid,
            member_name: up.m.name,
            member_code: up.m.code,
            member_phone: up.m.phone,
            issued_at: at(day, 18 * 60 + 30),
            lines,
            subtotal: q.subtotal,
            discount: q.discount,
            vat_rate: q.vat_rate,
            vat_inclusive: q.vat_inclusive,
            vat_bin: db.settings.vat_bin,
            vat: q.vat,
            total: q.total,
            paid: q.total,
            due: 0,
            status: 'Paid',
            payments: [
                {
                    oid: `pay-${invOid}-1`,
                    invoice_oid: invOid,
                    amount: q.total,
                    method: 'card',
                    reference: 'POS-48150',
                    received_at: at(day, 18 * 60 + 31),
                    received_by: DESK
                }
            ]
        };
        db.invoices.push(inv);
        const next: Subscription = {
            oid: `sub-upgrade-${up.m.oid}`,
            member_oid: up.m.oid,
            plan_oid: plan.oid,
            plan_name: plan.name,
            start_date: day,
            end_date: q.end_date,
            status: 'Active',
            total: q.total,
            paid: q.total,
            due: 0,
            invoice_oid: invOid,
            freezes: [],
            created_at: inv.issued_at,
            freezable: plan.freezable
        };
        db.subscriptions.push(next);
        up.sub.end_date = addDaysIso(today, -6);
        up.sub.cancelled_at = inv.issued_at;
        up.sub.cancel_reason = `Upgraded to ${plan.name}`;
        up.sub.upgraded_to = next.oid;
    }

    // Transferred in from Dhanmondi four days ago: the plan carries on, its invoice stays with Dhanmondi.
    const moved = pick(dha);
    if (moved) {
        moved.m.branch_oid = gul.oid;
        db.notes.push({
            oid: `note-transfer-${moved.m.oid}`,
            member_oid: moved.m.oid,
            at: at(addDaysIso(today, -4), 11 * 60),
            title: 'Moved from Dhanmondi to Gulshan',
            detail: 'Moved house to Gulshan',
            by: 'Riyad Kabir'
        });
    }

    // Anonymised yesterday ("delete my data"): the history stays under the code; messages now show as skipped.
    const gone = db.members.find(
        m =>
            m.branch_oid === gul.oid &&
            !m.pending &&
            !seededSuspended(db, m) &&
            !used.has(m.oid) &&
            Number(m.code.slice(-6)) > 20 &&
            subsOf(m.oid).length > 0 &&
            subsOf(m.oid).every(s => s.end_date < addDaysIso(today, -30)) &&
            subsOf(m.oid).every(s => invoiceOf(s)?.due === 0)
    );
    if (gone) {
        used.add(gone.oid);
        Object.assign(gone, {
            name: 'Anonymised member',
            phone: null,
            email: null,
            date_of_birth: null,
            address: null,
            emergency_contact: null,
            health_flags: [],
            health_declared: false,
            photo_url: null,
            notes: null,
            anonymised: true,
            portal: false
        } satisfies Partial<MemberRow>);
        for (const i of db.invoices.filter(x => x.member_oid === gone.oid)) {
            i.member_name = 'Anonymised member';
            i.member_phone = null;
        }
    }

    // A join request from the public site last night: pending, and the form does not ask for gender.
    const seq = (db.counters['member:GUL'] = (db.counters['member:GUL'] ?? 0) + 1);
    db.members.push({
        oid: `mem-gul-${seq}`,
        code: `MEM-GUL-${String(seq).padStart(6, '0')}`,
        branch_oid: gul.oid,
        name: 'Mitu Chowdhury',
        phone: '+8801700000108',
        gender: null,
        email: 'mitu.c@example.com',
        date_of_birth: null,
        address: null,
        emergency_contact: null,
        health_flags: [],
        health_declared: false,
        photo_url: null,
        joined_on: addDaysIso(today, -1),
        pending: true,
        trainer_oid: null,
        notes: 'Web join request: Single · Monthly',
        regularity: 0,
        habit_minutes: 0
    });

    // A document on the scripted active member (the photo is the generated avatar).
    const files: FileRow[] = (db.files ??= []);
    files.push({
        oid: 'file-doc-1',
        branch_oid: gul.oid,
        member_oid: 'mem-gul-1',
        kind: 'member_document',
        name: 'NID copy.pdf',
        content_type: 'application/pdf',
        size_bytes: 677,
        status: 'ready',
        url: SAMPLE_PDF,
        created_at: at(addDaysIso(today, -10), 10 * 60 + 25),
        created_by_name: DESK
    });

    // Yesterday's cash closings at Gulshan: each staff member's cash (payments less refunds), as the API computes
    // it; the desk counted ৳50 short and said why. Today stays open, so the form can be tried.
    const yesterday = addDaysIso(today, -1);
    const cash = new Map<string, number>();
    for (const i of db.invoices.filter(x => x.branch.oid === gul.oid))
        for (const p of i.payments.filter(x => x.method === 'cash' && x.received_at.startsWith(yesterday)))
            cash.set(p.received_by, (cash.get(p.received_by) ?? 0) + (p.kind === 'refund' ? -p.amount : p.amount));
    const closings: ClosingRow[] = (db.closings ??= []);
    // The ৳50 short goes to whoever took the most cash, so it is always a real count.
    const most = [...cash.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    for (const [name, expected] of cash) {
        const account = db.accounts.find(a => a.user.name === name);
        const short = name === most && expected >= 50 ? 50 : 0;
        closings.push({
            branch_oid: gul.oid,
            day: yesterday,
            staff_oid: account?.user.user_id ?? `staff-${name}`,
            staff_name: name,
            expected_cash: expected,
            counted_cash: expected - short,
            note: short ? 'Short by ৳50: change given to a member, to be returned tomorrow' : null,
            at: at(yesterday, 22 * 60 + 30)
        });
    }
}
