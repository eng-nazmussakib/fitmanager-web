import type { HttpResponse } from '@angular/common/http';

import { MAX_VAT_RATE, type OrgSettingsUpdate, type SiteGroupUpdate, vatPercent } from '@core/models/settings.model';

import { type Ctx, fail, ok, type Route } from '../http';
import { commit, db } from '../store';

function read(): HttpResponse<unknown> {
    return ok(db().settings);
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
    commit({ t: 'group.update', key: g.key, patch, at: ctx.now.iso, by: ctx.user?.name ?? 'HQ' });
    const part = (name: string, on: boolean | null): string | null => (on === null ? null : `${name} ${on ? 'shown' : 'hidden'}`);
    return ok(g, `${g.name}: ${[part('section', g.section), part('page', g.page)].filter(Boolean).join(', ')}`);
}

export const SETTINGS_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/public\/site-groups$/, scope: 'public', handler: publicGroups },
    { method: 'GET', path: /^\/v1\/hq\/site-groups$/, scope: 'hq', can: ['read', 'Settings'], handler: () => ok(db().siteGroups) },
    { method: 'PATCH', path: /^\/v1\/hq\/site-groups\/([\w-]+)$/, scope: 'hq', can: ['update', 'Settings'], handler: updateGroup },
    { method: 'GET', path: /^\/v1\/hq\/settings$/, scope: 'hq', can: ['read', 'Settings'], handler: read },
    { method: 'PATCH', path: /^\/v1\/hq\/settings$/, scope: 'hq', can: ['update', 'Settings'], handler: update }
];
