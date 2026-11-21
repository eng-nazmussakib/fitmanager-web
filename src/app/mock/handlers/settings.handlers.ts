import type { HttpResponse } from '@angular/common/http';

import { MAX_FREEZE_DAYS, MAX_VAT_RATE, type OrgRules, type OrgSettingsUpdate, type SiteGroupUpdate, vatPercent } from '@core/models/settings.model';

import { type Ctx, fail, ok, type Route } from '../http';
import { commit, db } from '../store';

function read(): HttpResponse<unknown> {
    return ok(db().settings);
}

/** `GET /v1/rules`: what every staff member works by (the API's settings route, read-only). */
function rules(): HttpResponse<unknown> {
    const body: OrgRules & { updated_at?: unknown; updated_by?: unknown } = { ...db().settings };
    delete body.updated_at;
    delete body.updated_by;
    return ok(body);
}

/**
 * `PATCH /v1/hq/settings`: change the VAT rate or BIN. Only the fields sent change. The new rate applies to quotes
 * and sales from now on; invoices already issued keep the rate they were issued with.
 */
function update(ctx: Ctx): HttpResponse<unknown> {
    const patch: OrgSettingsUpdate = {};
    if ('vat_rate' in ctx.body) {
        const rate = ctx.body['vat_rate'];
        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > MAX_VAT_RATE) {
            fail(400, `VAT must be between 0 % and ${vatPercent(MAX_VAT_RATE)} %.`);
        }
        // Basis points: 7.5 % is fine, 7.123 % is a typo.
        patch.vat_rate = Math.round(rate * 10000) / 10000;
    }
    if ('vat_bin' in ctx.body) {
        const bin = ctx.body['vat_bin'];
        if (bin !== null && typeof bin !== 'string') fail(400, 'Enter the BIN as text.');
        const value = typeof bin === 'string' ? bin.trim() : '';
        if (value && !/^[0-9-]{9,20}$/.test(value)) fail(400, 'A BIN is 9 to 20 digits (dashes allowed).');
        patch.vat_bin = value || null;
    }
    if ('vat_inclusive' in ctx.body) {
        if (typeof ctx.body['vat_inclusive'] !== 'boolean') fail(400, 'Choose whether prices include VAT.');
        patch.vat_inclusive = ctx.body['vat_inclusive'];
    }
    type WholeKey =
        | 'freeze_min_days'
        | 'freeze_max_days'
        | 'freeze_max_count'
        | 'booking_open_days'
        | 'booking_max_active'
        | 'booking_cancel_hours'
        | 'noshow_limit'
        | 'noshow_window_days'
        | 'noshow_block_days'
        | 'policy_grace_days'
        | 'complaint_response_hours';
    const whole = (key: WholeKey, min: number, max: number, message: string): void => {
        if (!(key in ctx.body)) return;
        const n = ctx.body[key];
        if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) fail(400, message);
        patch[key] = n;
    };
    whole('freeze_min_days', 1, MAX_FREEZE_DAYS, `A freeze lasts 1 to ${MAX_FREEZE_DAYS} days.`);
    whole('freeze_max_days', 1, MAX_FREEZE_DAYS, `A freeze lasts 1 to ${MAX_FREEZE_DAYS} days.`);
    whole('freeze_max_count', 0, 12, 'Allow 0 to 12 freezes per plan.');
    // Class booking (D-081), the API's ranges.
    whole('booking_open_days', 1, 60, 'Classes open 1 to 60 days ahead.');
    whole('booking_max_active', 1, 50, 'Allow 1 to 50 upcoming bookings.');
    whole('booking_cancel_hours', 0, 72, 'The free cancel window is 0 to 72 hours.');
    whole('noshow_limit', 1, 20, 'Pause booking after 1 to 20 missed classes.');
    whole('noshow_window_days', 1, 365, 'Count missed classes over 1 to 365 days.');
    whole('noshow_block_days', 1, 90, 'Pause booking for 1 to 90 days.');
    // Governance (D-091, D-095).
    whole('policy_grace_days', 0, 90, 'The policy grace period is 0 to 90 days.');
    whole('complaint_response_hours', 1, 336, 'Complaints are answered within 1 to 336 hours.');
    const min = patch.freeze_min_days ?? db().settings.freeze_min_days;
    const max = patch.freeze_max_days ?? db().settings.freeze_max_days;
    if (min > max) fail(400, `The shortest freeze (${min} days) is longer than the longest (${max} days)`);
    if (!Object.keys(patch).length) fail(400, 'Nothing to change.');
    commit({ t: 'settings.update', patch, at: ctx.now.iso, by: ctx.user?.name ?? 'HQ' });
    return ok(db().settings, 'Settings saved');
}

/** `GET /v1/public/site-groups`: every group with its section and page switches, in display order (D-040). */
function publicGroups(): HttpResponse<unknown> {
    return ok(
        db().siteGroups.map(g => ({
            key: g.key,
            name: g.name,
            required: g.required,
            sort_order: g.sort_order,
            section: g.section,
            page: g.page,
            page_path: g.page_path
        }))
    );
}

/** `PATCH /v1/hq/site-groups/:key` `{ section?, page? }`: the same checks as the API. */
function updateGroup(ctx: Ctx): HttpResponse<unknown> {
    const g = db().siteGroups.find(x => x.key === ctx.params[0]);
    if (!g) fail(404, 'Unknown group');
    const { section, page } = ctx.body as { section?: unknown; page?: unknown };
    if (section === undefined && page === undefined) fail(400, 'Send section, page or both');
    if ((section !== undefined && typeof section !== 'boolean') || (page !== undefined && typeof page !== 'boolean')) fail(400, 'Switches are true or false');
    if (section !== undefined && g.section === null) fail(400, `${g.name} has no section on the home page`);
    if (page !== undefined && g.page === null) fail(400, `${g.name} has no page of its own`);
    if (g.required && (section === false || page === false)) fail(409, `${g.name} is required and cannot be switched off`);
    const patch: SiteGroupUpdate = {};
    if (typeof section === 'boolean') patch.section = section;
    if (typeof page === 'boolean') patch.page = page;
    const before = { ...g };
    commit({ t: 'group.update', key: g.key, patch, at: ctx.now.iso, by: ctx.user?.name ?? 'HQ' });
    // Audited like the API (site.routes.ts): one entry at HQ with the row before and after.
    const hq = ctx.branch!;
    commit({
        t: 'audit.add',
        row: {
            oid: `aud-${db().audit.length + 1}-${Date.now()}`,
            branch_oid: hq.oid,
            branch_code: hq.code,
            branch_name: hq.name,
            actor_oid: ctx.user?.user_id ?? null,
            actor_name: ctx.user?.name ?? null,
            action: 'update',
            entity: 'site_group',
            entity_key: g.key,
            before,
            after: { ...g },
            request_id: null,
            created_at: ctx.now.iso
        }
    });
    const part = (name: string, on: boolean | null): string | null => (on === null ? null : `${name} ${on ? 'shown' : 'hidden'}`);
    return ok(g, `${g.name}: ${[part('section', g.section), part('page', g.page)].filter(Boolean).join(', ')}`);
}

export const SETTINGS_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/public\/site-groups$/, scope: 'public', handler: publicGroups },
    { method: 'GET', path: /^\/v1\/hq\/site-groups$/, scope: 'hq', can: ['read', 'Settings'], handler: () => ok(db().siteGroups) },
    { method: 'PATCH', path: /^\/v1\/hq\/site-groups\/([\w-]+)$/, scope: 'hq', can: ['update', 'Settings'], handler: updateGroup },
    { method: 'GET', path: /^\/v1\/rules$/, scope: 'user', handler: rules },
    { method: 'GET', path: /^\/v1\/hq\/settings$/, scope: 'hq', can: ['read', 'Settings'], handler: read },
    { method: 'PATCH', path: /^\/v1\/hq\/settings$/, scope: 'hq', can: ['update', 'Settings'], handler: update }
];
