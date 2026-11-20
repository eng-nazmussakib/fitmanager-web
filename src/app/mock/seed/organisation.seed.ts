import { TENANT } from '@config/tenant';
import type { DayGroup, HoursBlock } from '@config/tenant.model';
import type { Branch, BranchRef, HoursBlock as WireHours } from '@core/models/branch.model';
import type { OrgSettings, SiteGroup } from '@core/models/settings.model';

import type { Promo } from '../domain/pricing';
import { addDaysIso } from './clock';

/** Weekday numbers (0 = Sunday) of each day group the brand config uses. */
const WEEKDAYS: Record<DayGroup, number[]> = {
    satThu: [6, 0, 1, 2, 3, 4],
    friday: [5],
    sunThu: [0, 1, 2, 3, 4],
    monFri: [1, 2, 3, 4, 5],
    saturday: [6],
    sunday: [0],
    daily: [0, 1, 2, 3, 4, 5, 6]
};

/**
 * A branch's hours come from the brand config (`config/tenant.ts`), the same place the public site reads them, so
 * the check-in rules never disagree with what a visitor reads. The first block is the opening hours.
 */
function hoursBlocks(branchName: string): HoursBlock[] {
    const items = TENANT.landing?.branches.items ?? [];
    return (items.find(b => b.name === branchName) ?? items.at(0))?.hours ?? [];
}

/** Opening hours as the rules engine reads them: weekday numbers (0 = Sunday). */
export function openingHours(branchName: string): { days: number[]; open: string; close: string }[] {
    return (hoursBlocks(branchName)[0]?.sessions ?? []).flatMap(s => s.ranges.map(([open, close]) => ({ days: WEEKDAYS[s.days], open, close })));
}

/** One block as the `Branch` wire model shows it: weekday numbers, like the API. */
function wireHours(block: HoursBlock | undefined): WireHours[] {
    return (block?.sessions ?? []).flatMap(s => s.ranges.map(([open, close]) => ({ days: WEEKDAYS[s.days], open, close })));
}

function branchHours(branchName: string): Pick<Branch, 'hours' | 'ladies_hours'> {
    const blocks = hoursBlocks(branchName);
    return { hours: wireHours(blocks[0]), ladies_hours: wireHours(blocks.find(b => /ladies/i.test(b.title))) };
}

/** The HQ row (D-023) and the three branches. */
export function seedBranches(): Branch[] {
    const common = {
        email: 'hello@example.com'
    };
    return [
        {
            oid: 'br-hq',
            code: 'HQ',
            slug: 'hq',
            name: 'Head office',
            kind: 'HQ',
            address: 'Road 11, Gulshan 2, Dhaka 1212',
            area: 'Gulshan',
            phone: '+8809610000000',
            capacity: 0,
            opened_on: '2019-01-01',
            facilities: [],
            dues_limit: 0,
            map_url: '',
            ...common,
            hours: [],
            ladies_hours: []
        },
        {
            oid: 'br-gul',
            code: 'GUL',
            slug: 'gulshan',
            name: 'Gulshan',
            kind: 'BRANCH',
            ...branchHours('Gulshan'),
            address: 'Road 11, Gulshan 2, Dhaka 1212',
            area: 'Gulshan',
            phone: '+8801711000101',
            capacity: 120,
            opened_on: '2019-03-01',
            facilities: ['Strength floor', 'Cardio zone', 'Spin studio', 'Group studio', 'Sauna', 'Lockers and showers', 'Parking'],
            dues_limit: 1000,
            map_url: 'https://maps.google.com/?q=Gulshan+2+Dhaka',
            ...common
        },
        {
            oid: 'br-dha',
            code: 'DHA',
            slug: 'dhanmondi',
            name: 'Dhanmondi',
            kind: 'BRANCH',
            ...branchHours('Dhanmondi'),
            address: 'Road 27, Dhanmondi, Dhaka 1209',
            area: 'Dhanmondi',
            phone: '+8801711000202',
            capacity: 90,
            opened_on: '2021-06-15',
            facilities: ['Strength floor', 'Cardio zone', 'Group studio', 'Lockers and showers'],
            dues_limit: 1000,
            map_url: 'https://maps.google.com/?q=Dhanmondi+27+Dhaka',
            ...common
        },
        {
            oid: 'br-utt',
            code: 'UTT',
            slug: 'uttara',
            name: 'Uttara',
            kind: 'BRANCH',
            ...branchHours('Uttara'),
            address: 'Sector 7, Uttara, Dhaka 1230',
            area: 'Uttara',
            phone: '+8801711000303',
            capacity: 80,
            opened_on: '2023-02-01',
            facilities: ['Strength floor', 'Cardio zone', 'Spin studio', 'Lockers and showers', 'Parking'],
            dues_limit: 1500,
            map_url: 'https://maps.google.com/?q=Uttara+Sector+7+Dhaka',
            ...common
        }
    ];
}

export function toRef(b: Branch): BranchRef {
    return { oid: b.oid, code: b.code, slug: b.slug, name: b.name, kind: b.kind };
}

/** Promo codes valid around the seed day (the landing page's "no admission fee this month" offer among them). */
export function seedPromos(today: string): (Promo & { active: boolean })[] {
    const monthStart = `${today.slice(0, 8)}01`;
    return [
        { code: 'NOADMISSION', label: 'No admission fee this month', waive_admission: true, from: monthStart, to: addDaysIso(monthStart, 40), active: true },
        { code: 'STUDENT10', label: '10% student discount', percent: 10, from: addDaysIso(today, -200), to: addDaysIso(today, 200), active: true },
        { code: 'REFER500', label: 'Referral: ৳500 off', amount: 500, from: addDaysIso(today, -200), to: addDaysIso(today, 200), active: true }
    ];
}

/**
 * The VAT setting the demo starts with (Q-009: 15 % is Bangladesh's standard rate, to confirm with the client).
 * HQ changes it at `/hq/settings`; sales read `db().settings`, never this constant.
 */
export function seedSettings(): OrgSettings {
    return {
        vat_rate: 0.15,
        vat_bin: '000123456-0101',
        vat_inclusive: false,
        freeze_min_days: 7,
        freeze_max_days: 60,
        freeze_max_count: 2,
        booking_open_days: 7,
        booking_max_active: 4,
        booking_cancel_hours: 2,
        noshow_limit: 3,
        noshow_window_days: 30,
        noshow_block_days: 7,
        updated_at: null,
        updated_by: null
    };
}

/** The site groups and their switches: the same rows as migration 003_site_groups.sql (D-040). */
export function seedSiteGroups(): SiteGroup[] {
    const row = (key: string, name: string, required: boolean, sortOrder: number, section: boolean | null, pagePath: string | null = null): SiteGroup => ({
        key,
        name,
        required,
        sort_order: sortOrder,
        section,
        page: pagePath ? true : null,
        page_path: pagePath,
        updated_at: null,
        updated_by_name: null
    });
    return [
        row('hero', 'Home', true, 10, true),
        row('services', 'Programs', true, 30, true),
        row('plans', 'Membership', true, 40, true, '/plans'),
        row('facilities', 'Facilities', true, 50, true),
        row('reviews', 'Reviews', false, 60, true),
        row('trainers', 'Trainers', false, 70, true, '/trainers'),
        row('blog', 'Blog', false, 80, true, '/blog'),
        row('branches', 'Branches', false, 90, true, '/branches'),
        row('gallery', 'Gallery', false, 100, true, '/gallery'),
        row('faq', 'FAQ', false, 110, false)
    ];
}
