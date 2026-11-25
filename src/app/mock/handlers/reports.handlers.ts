import { HttpParams, type HttpResponse } from '@angular/common/http';

import type { MemberListItem } from '@core/models/member.model';
import { EXPORT_LIMIT, type ExportPage, type ReportColumn, type ReportKey, REPORTS } from '@core/models/report.model';

import { recordAudit } from '../audit';
import { type Ctx, fail, ok, qStr, type Route } from '../http';
import { mockReport, mockTrainerReport } from '../reports';
import { addDaysIso, dateOf } from '../seed/clock';
import { db } from '../store';
import { stockLevels } from './business.handlers';
import { list as memberList } from './members.handlers';
import { auditMatches } from './staff.handlers';

/**
 * Reports and exports in demo mode, with the API's rules: reports for `read Report` (branch
 * managers and HQ), a trainer's own numbers, exports for `export Report` a page at a time, the first page counted
 * (over 50 000 refused) and audited.
 */

const KEYS = new Set<string>(REPORTS.map(r => r.key));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const daysApart = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

function range(from: string, to: string, today: string): { from: string; to: string } {
    const end = to || today;
    const start = from || addDaysIso(end, -29);
    if (!DAY.test(start) || !DAY.test(end) || start > end) fail(400, 'Choose a valid date range.');
    if (daysApart(start, end) > 365) fail(400, 'Choose a range of at most 366 days.');
    return { from: start, to: end };
}

const reportKey = (ctx: Ctx): ReportKey => (KEYS.has(ctx.params[0] ?? '') ? (ctx.params[0] as ReportKey) : fail(400, 'Unknown report'));
const compare = (ctx: Ctx): boolean => ['1', 'true'].includes(qStr(ctx, 'compare'));

function branchReport(ctx: Ctx): HttpResponse<unknown> {
    return ok(mockReport(reportKey(ctx), [ctx.branch!.oid], range(qStr(ctx, 'from'), qStr(ctx, 'to'), ctx.now.date), compare(ctx)));
}

function hqReport(ctx: Ctx): HttpResponse<unknown> {
    const reach = (ctx.user?.assignments ?? []).map(a => a.branch.oid);
    const one = qStr(ctx, 'branch_oid');
    if (one && !reach.includes(one)) fail(403, 'You do not have access to this branch');
    return ok(mockReport(reportKey(ctx), one ? [one] : reach, range(qStr(ctx, 'from'), qStr(ctx, 'to'), ctx.now.date), compare(ctx)));
}

function trainerNumbers(ctx: Ctx): HttpResponse<unknown> {
    const trainer = db().trainers.find(t => t.oid === ctx.params[0]) ?? fail(404, 'Trainer not found');
    const own = !!ctx.account && trainer.user_oid === ctx.user?.user_id;
    if (!own && !ctx.ability.can('read', 'Report')) fail(403, 'You can see only your own numbers');
    return ok(mockTrainerReport(ctx.branch!.oid, trainer.oid, range(qStr(ctx, 'from'), qStr(ctx, 'to'), ctx.now.date)));
}

/* ---------- exports ---------- */

const formatOf = (ctx: Ctx): 'xlsx' | 'pdf' => {
    const f = ctx.body['format'];
    return f === 'xlsx' || f === 'pdf' ? f : fail(400, 'Excel (xlsx) or PDF');
};
const filtersOf = (ctx: Ctx): Record<string, string> => {
    const raw = ctx.body['filters'];
    const out: Record<string, string> = {};
    if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'string' && v) out[k] = v;
    return out;
};
const withQuery = (ctx: Ctx, query: Record<string, string>): Ctx => ({ ...ctx, query: new HttpParams({ fromObject: query }) });

function tooMany(total: number): void {
    if (total > EXPORT_LIMIT)
        fail(400, `This export has ${total.toLocaleString('en-IN')} rows; the most is ${EXPORT_LIMIT.toLocaleString('en-IN')}. Narrow the filters.`);
}

const MEMBER_COLUMNS: ReportColumn[] = [
    { key: 'code', label: 'Member', unit: 'text' },
    { key: 'name', label: 'Name', unit: 'text' },
    { key: 'phone', label: 'Phone', unit: 'text' },
    { key: 'gender', label: 'Gender', unit: 'text' },
    { key: 'status', label: 'Status', unit: 'text' },
    { key: 'plan_name', label: 'Plan', unit: 'text' },
    { key: 'valid_until', label: 'Valid until', unit: 'date' },
    { key: 'dues', label: 'Dues', unit: 'money' },
    { key: 'last_visit', label: 'Last visit', unit: 'date' },
    { key: 'joined_on', label: 'Joined', unit: 'date' }
];

function exportMembers(ctx: Ctx): HttpResponse<unknown> {
    const format = formatOf(ctx);
    const filters = filtersOf(ctx);
    const page = Math.max(1, Number(ctx.body['page']) || 1);
    const data = (memberList(withQuery(ctx, { ...filters, page: String(page), size: '100' })).body as { data: { rows: MemberListItem[]; count: number } }).data;
    if (page === 1) {
        tooMany(data.count);
        recordAudit(ctx, 'export', 'export', 'members', null, { format, filters, rows: data.count });
    }
    const keys = MEMBER_COLUMNS.map(c => c.key);
    return ok<ExportPage>({
        columns: MEMBER_COLUMNS,
        rows: data.rows.map(r => Object.fromEntries(keys.map(k => [k, (r as unknown as Record<string, string | number | null>)[k] ?? null]))),
        next: page * 100 < Math.min(data.count, EXPORT_LIMIT) ? String(page + 1) : null,
        total: page === 1 ? data.count : null
    });
}

const PAYMENT_COLUMNS: ReportColumn[] = [
    { key: 'received_at', label: 'When', unit: 'date' },
    { key: 'invoice_number', label: 'Invoice', unit: 'text' },
    { key: 'member_code', label: 'Member', unit: 'text' },
    { key: 'member_name', label: 'Name', unit: 'text' },
    { key: 'kind', label: 'Kind', unit: 'text' },
    { key: 'method', label: 'Method', unit: 'text' },
    { key: 'reference', label: 'Reference', unit: 'text' },
    { key: 'amount', label: 'Amount', unit: 'money' },
    { key: 'received_by', label: 'By', unit: 'text' },
    { key: 'reason', label: 'Refund reason', unit: 'text' }
];

function exportPayments(ctx: Ctx): HttpResponse<unknown> {
    const format = formatOf(ctx);
    const f = filtersOf(ctx);
    const r = range(f['from'] ?? '', f['to'] ?? '', ctx.now.date);
    const rows = db()
        .invoices.filter(i => i.branch.oid === ctx.branch!.oid)
        .flatMap(i =>
            i.payments
                .filter(p => dateOf(p.received_at) >= r.from && dateOf(p.received_at) <= r.to)
                .map(p => ({
                    oid: p.oid,
                    received_at: p.received_at,
                    invoice_number: i.number,
                    member_code: i.member_code,
                    member_name: i.member_name,
                    kind: p.kind ?? 'payment',
                    method: p.method,
                    reference: p.reference,
                    amount: p.amount,
                    received_by: p.received_by,
                    reason: p.reason ?? null
                }))
        )
        .sort((a, z) => a.received_at.localeCompare(z.received_at) || a.oid.localeCompare(z.oid));
    const after = typeof ctx.body['after'] === 'string' ? Number(ctx.body['after']) : 0;
    if (Number.isNaN(after)) fail(400, 'Invalid page cursor');
    if (!after) {
        tooMany(rows.length);
        recordAudit(ctx, 'export', 'export', 'payments', null, { format, filters: r, rows: rows.length });
    }
    const page = rows.slice(after, after + 1000);
    return ok<ExportPage>({
        columns: PAYMENT_COLUMNS,
        rows: page.map(({ oid: _oid, ...rest }) => rest),
        next: after + 1000 < rows.length ? String(after + 1000) : null,
        total: after ? null : rows.length
    });
}

function exportStock(ctx: Ctx): HttpResponse<unknown> {
    const format = formatOf(ctx);
    const filters = filtersOf(ctx);
    const costs = ctx.ability.can('update', 'Stock');
    const data = (stockLevels(withQuery(ctx, filters)).body as { data: { rows: Record<string, string | number | null>[] } }).data;
    const columns: ReportColumn[] = [
        { key: 'code', label: 'Code', unit: 'text' },
        { key: 'name', label: 'Product', unit: 'text' },
        { key: 'category', label: 'Category', unit: 'text' },
        { key: 'on_hand', label: 'On hand', unit: 'count' },
        { key: 'reorder_level', label: 'Reorder at', unit: 'count' },
        { key: 'on_order', label: 'On order', unit: 'count' },
        { key: 'in_transit', label: 'In transit', unit: 'count' },
        { key: 'price', label: 'Price', unit: 'money' },
        ...(costs
            ? ([
                  { key: 'avg_cost', label: 'Average cost', unit: 'money' },
                  { key: 'value', label: 'Value', unit: 'money' }
              ] satisfies ReportColumn[])
            : [])
    ];
    recordAudit(ctx, 'export', 'export', 'stock', null, { format, filters, rows: data.rows.length });
    return ok<ExportPage>({
        columns,
        rows: data.rows.map(r => Object.fromEntries(columns.map(c => [c.key, r[c.key] ?? null]))),
        next: null,
        total: data.rows.length
    });
}

const AUDIT_COLUMNS: ReportColumn[] = [
    { key: 'created_at', label: 'When', unit: 'date' },
    { key: 'branch_name', label: 'Branch', unit: 'text' },
    { key: 'actor_name', label: 'Who', unit: 'text' },
    { key: 'action', label: 'Action', unit: 'text' },
    { key: 'entity', label: 'What', unit: 'text' },
    { key: 'entity_key', label: 'Which', unit: 'text' },
    { key: 'after', label: 'Details', unit: 'text' }
];

function exportAudit(ctx: Ctx): HttpResponse<unknown> {
    const format = formatOf(ctx);
    const filters = filtersOf(ctx);
    const rows = auditMatches(withQuery(ctx, filters), ctx.branch!.kind === 'HQ' ? 'hq' : 'branch');
    const after = typeof ctx.body['after'] === 'string' ? Number(ctx.body['after']) : 0;
    if (!after) tooMany(rows.length);
    const page = rows.slice(after, after + 1000);
    if (!after) recordAudit(ctx, 'export', 'export', 'audit', null, { format, filters, rows: rows.length });
    return ok<ExportPage>({
        columns: AUDIT_COLUMNS,
        rows: page.map(r => ({
            created_at: r.created_at,
            branch_name: r.branch_name,
            actor_name: r.actor_name,
            action: r.action,
            entity: r.entity,
            entity_key: r.entity_key,
            after: r.after === null ? null : JSON.stringify(r.after)
        })),
        next: after + 1000 < rows.length ? String(after + 1000) : null,
        total: after ? null : rows.length
    });
}

function exportReport(ctx: Ctx): HttpResponse<unknown> {
    const format = formatOf(ctx);
    const report = typeof ctx.body['report'] === 'string' ? ctx.body['report'] : '';
    const table = typeof ctx.body['table'] === 'string' ? ctx.body['table'] : '';
    const rows = Number(ctx.body['rows']);
    if (!KEYS.has(report)) fail(400, 'Unknown report');
    if (!/^[a-z_]{1,40}$/.test(table)) fail(400, 'A table key');
    if (!Number.isInteger(rows) || rows < 0 || rows > EXPORT_LIMIT) fail(400, 'At most 50 000 rows');
    const branch = typeof ctx.body['branch_oid'] === 'string' ? ctx.body['branch_oid'] : undefined;
    recordAudit(ctx, 'export', 'export', `report:${report}/${table}`, null, {
        format,
        from: ctx.body['from'],
        to: ctx.body['to'],
        rows,
        ...(branch ? { branch_oid: branch } : {})
    });
    return ok(null, 'Export recorded');
}

export const REPORT_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/reports\/([a-z_]+)$/, scope: 'branch', can: ['read', 'Report'], handler: branchReport },
    { method: 'GET', path: /^\/v1\/hq\/reports\/([a-z_]+)$/, scope: 'hq', can: ['read', 'Report'], handler: hqReport },
    { method: 'GET', path: /^\/v1\/trainers\/([\w-]+)\/numbers$/, scope: 'branch', can: ['read', 'Trainer'], handler: trainerNumbers },
    {
        method: 'POST',
        path: /^\/v1\/exports\/members$/,
        scope: 'branch',
        can: ['export', 'Report'],
        handler: ctx => (ctx.ability.can('read', 'Member') ? exportMembers(ctx) : fail(403, 'No access'))
    },
    {
        method: 'POST',
        path: /^\/v1\/exports\/payments$/,
        scope: 'branch',
        can: ['export', 'Report'],
        handler: ctx => (ctx.ability.can('read', 'Payment') ? exportPayments(ctx) : fail(403, 'No access'))
    },
    {
        method: 'POST',
        path: /^\/v1\/exports\/stock$/,
        scope: 'branch',
        can: ['export', 'Report'],
        handler: ctx => (ctx.ability.can('read', 'Stock') ? exportStock(ctx) : fail(403, 'No access'))
    },
    {
        method: 'POST',
        path: /^\/v1\/exports\/audit$/,
        scope: 'staff',
        can: ['export', 'Report'],
        handler: ctx => (ctx.ability.can('read', 'AuditLog') ? exportAudit(ctx) : fail(403, 'No access'))
    },
    { method: 'POST', path: /^\/v1\/exports\/report$/, scope: 'staff', can: ['export', 'Report'], handler: exportReport }
];
