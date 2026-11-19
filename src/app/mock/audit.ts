import type { AuditEntry } from '@core/models/staff.model';

import type { Ctx } from './http';
import { commit, db } from './store';

/**
 * One audit row at the request's branch, like the API's `recordAudit` (same transaction there; same commit
 * order here). `before` and `after` are copies, so later changes to the rows do not rewrite history.
 */
export function recordAudit(ctx: Ctx, action: string, entity: string, entityKey: string, before: unknown, after: unknown): void {
    const b = ctx.branch;
    if (!b) return;
    const copy = (v: unknown): unknown => (v === null || v === undefined ? null : structuredClone(v));
    const row: AuditEntry = {
        oid: `aud-${db().audit.length + 1}-${Date.now()}`,
        branch_oid: b.oid,
        branch_code: b.code,
        branch_name: b.name,
        actor_oid: ctx.user?.user_id ?? null,
        actor_name: ctx.user?.name ?? null,
        action,
        entity,
        entity_key: entityKey,
        before: copy(before),
        after: copy(after),
        request_id: null,
        created_at: ctx.now.iso
    };
    commit({ t: 'audit.add', row });
}
