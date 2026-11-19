/**
 * `GET|PATCH /v1/hq/settings`: organisation-wide settings, owned by HQ (D-037).
 *
 * VAT is a setting, not a constant: the rate can change by law or by the client's tax status, and a gym that is
 * not VAT-registered charges none (rate 0). A sale uses the rate in force when it is made, and the invoice keeps
 * that rate, so a later change never rewrites old invoices.
 */
export interface OrgSettings {
    /** VAT on memberships and admission fees, as a fraction: 0.15 = 15 %. 0 = no VAT charged. */
    vat_rate: number;
    /** The business identification number printed on invoices (NBR "BIN"), when VAT-registered. */
    vat_bin: string | null;
    /** true: prices already include VAT ("of which VAT"); false: VAT is added on top (D-057). */
    vat_inclusive: boolean;
    /** The freeze rule (D-063, D-067): how short and how long one freeze may be, and how many one plan may have. */
    freeze_min_days: number;
    freeze_max_days: number;
    freeze_max_count: number;
    updated_at: string | null;
    updated_by: string | null;
}

export type OrgSettingsUpdate = Partial<
    Pick<OrgSettings, 'vat_rate' | 'vat_bin' | 'vat_inclusive' | 'freeze_min_days' | 'freeze_max_days' | 'freeze_max_count'>
>;

/** `GET /v1/rules`: the rules every staff member works by (read-only; HQ changes them in the settings). */
export type OrgRules = Pick<OrgSettings, 'vat_rate' | 'vat_bin' | 'vat_inclusive' | 'freeze_min_days' | 'freeze_max_days' | 'freeze_max_count'>;

/** Longest freeze HQ may allow (the API's limit). */
export const MAX_FREEZE_DAYS = 365;

/** Highest VAT rate the settings accept (a typo guard, well above Bangladesh's 15 % standard rate). */
export const MAX_VAT_RATE = 0.5;

/** 0.15 → "15", 0.075 → "7.5" (no floating-point tails like 15.000000000000002). */
export function vatPercent(rate: number): string {
    return String(Math.round(rate * 10000) / 100);
}

/**
 * `GET /v1/public/site-groups`, `GET /v1/hq/site-groups`: one topic of the public site (D-040). A group can have a
 * landing SECTION and a PAGE of its own (`page_path`), switched separately: blog `{ section: false, page: true }`
 * keeps /blog but drops it from the home page. `null` = the group has no such part. Required groups (home,
 * programs, membership, facilities) keep every part on; the flag is set by database migrations only.
 */
export interface SiteGroup {
    key: string;
    name: string;
    required: boolean;
    sort_order: number;
    section: boolean | null;
    page: boolean | null;
    page_path: string | null;
    updated_at?: string | null;
    updated_by_name?: string | null;
}

/** `PATCH /v1/hq/site-groups/:key`: either switch, or both. */
export type SiteGroupUpdate = Partial<Pick<SiteGroup, 'section' | 'page'>>;
