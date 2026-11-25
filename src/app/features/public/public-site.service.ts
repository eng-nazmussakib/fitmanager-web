import { computed, inject, Injectable, signal } from '@angular/core';

import { TENANT } from '@config/tenant';
import { type DayGroup, type HoursBlock, type LandingConfig, type PageLink, type PlanPeriod, type PlanTier, SECTION_IDS, type SectionId, type SocialIcon } from '@config/tenant.model';
import type { SiteGroup } from '@core/models/settings.model';
import { TenantService } from '@core/tenant/tenant.service';

export type Branch = LandingConfig['branches']['items'][number];
export type Plan = PlanTier;

/** A plan's price for a period, with what it comes to per month and the saving against paying monthly. */
export interface PlanQuote {
    price: number;
    perMonth: number;
    /** Whole percent saved against the monthly price × months; 0 when there is no saving or no monthly price. */
    savePercent: number;
    /** `/month`, `/year`, `/3 months`. */
    per: string;
}

/** The price of a plan for a period, or null if the plan is not sold for that period. */
export function planQuote(plan: Plan, period: PlanPeriod, periods: PlanPeriod[]): PlanQuote | null {
    const price = plan.prices[period.id];
    if (price === undefined) return null;
    const monthlyId = periods.find(p => p.months === 1)?.id;
    const monthly = monthlyId ? plan.prices[monthlyId] : undefined;
    const full = monthly === undefined ? 0 : monthly * period.months;
    const savePercent = full > price ? Math.round((1 - price / full) * 100) : 0;
    const per = period.months === 1 ? '/month' : period.months === 12 ? '/year' : `/${period.months} months`;
    return { price, perMonth: Math.round(price / period.months), savePercent, per };
}

/** Where a link goes: a router path, plus a section fragment on the landing page. */
export interface LinkTarget {
    route: string;
    fragment?: string;
}

const DAY_GROUPS: Record<DayGroup, { label: string; schema: string[] }> = {
    satThu: { label: 'Sat–Thu', schema: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'] },
    friday: { label: 'Friday', schema: ['Friday'] },
    sunThu: { label: 'Sun–Thu', schema: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'] },
    monFri: { label: 'Mon–Fri', schema: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] },
    saturday: { label: 'Saturday', schema: ['Saturday'] },
    sunday: { label: 'Sunday', schema: ['Sunday'] },
    daily: { label: 'Every day', schema: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }
};

/** Outline brand icons (24×24, 1.6 stroke). Lucide has no brand icons. */
const SOCIAL_ICONS: Record<SocialIcon, string> = {
    facebook: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4ZM16 8h-1.5A2.5 2.5 0 0 0 12 10.5V21M9 13h6',
    instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4ZM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM17.3 6.7h.01',
    x: 'M4 4h4.5L20 20h-4.5ZM20 4l-6.6 7.2M4 20l6.6-7.2',
    youtube: 'M3 8.5A3.5 3.5 0 0 1 6.5 5h11A3.5 3.5 0 0 1 21 8.5v7a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 3 15.5ZM10 9.2v5.6l4.8-2.8Z'
};

/** Extra words the header search understands per section, on top of the section's headings and item names. */
const SEARCH_WORDS: Partial<Record<SectionId | 'contact', string>> = {
    services: 'program programs service services weight loss lose fat muscle strength home gym workout',
    plans: 'plan plans membership price prices pricing package monthly annual cost fee',
    facilities: 'facility facilities equipment weights cardio studio class classes locker lockers shower showers parking',
    reviews: 'review reviews testimonial testimonials customer customers story stories',
    trainers: 'trainer trainers coach coaches coaching personal',
    blog: 'blog post posts article articles tips nutrition diet',
    branches: 'join sign signup register branch branches location locations hours hour timing timings time open opening ladies combined',
    gallery: 'gallery photo photos picture pictures images inside tour',
    faq: 'faq question questions help support',
    contact: 'contact phone email'
};

/**
 * Groups whose home page section is more than one template section: the home group is the hero and the
 * key numbers under it (the latter only when the brand config has them).
 */
const GROUP_SECTIONS: Record<string, string[]> = { hero: ['hero', 'stats'] };

/** The public pages that belong to a site group, for before the database's list arrives. */
const PAGE_PATHS: Record<string, string> = { plans: '/plans', trainers: '/trainers', blog: '/blog', branches: '/branches', gallery: '/gallery' };

/** Fragments that always exist on the landing page, whatever sections are enabled. */
const FIXED_FRAGMENTS = new Set(['top', 'about', 'contact']);

function landingConfig(): LandingConfig {
    if (!TENANT.landing) throw new Error('The brand config (src/app/config/tenant.ts) has no landing page.');
    return TENANT.landing;
}

/** Deep copy with every `{brand}` in a string replaced by the brand name. */
export function fillBrand<T>(value: T, brand: string): T {
    if (typeof value === 'string') return value.replaceAll('{brand}', brand) as T;
    if (Array.isArray(value)) return value.map(v => fillBrand<unknown>(v, brand)) as T;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillBrand<unknown>(v, brand)])) as T;
    return value;
}

/** `'Sam Cole'` → `'sam-cole'`, for element ids and URL fragments. */
export function slug(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/** `'07:00'` → `'7 AM'`, `'15:30'` → `'3:30 PM'`. */
function clock(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const hour = h % 12 || 12;
    return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The timetable as display rows: `{ days: 'Sat–Thu', times: '7 AM – 12 PM & 3 PM – 11 PM' }`. */
export function timetable(hours: HoursBlock[]): { title: string; rows: { days: string; times: string }[] }[] {
    return hours.map(block => ({
        title: block.title,
        rows: block.sessions.map(s => ({
            days: DAY_GROUPS[s.days].label,
            times: s.ranges.map(([opens, closes]) => `${clock(opens)} – ${clock(closes)}`).join(' & ')
        }))
    }));
}

/** schema.org opening hours from a branch's first block (its opening hours). */
export function openingHoursSpec(hours: HoursBlock[]): Record<string, unknown>[] {
    return (hours[0]?.sessions ?? []).flatMap(s =>
        s.ranges.map(([opens, closes]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_GROUPS[s.days].schema, opens, closes }))
    );
}

export function postalAddress(branch: Branch): Record<string, string> {
    return { '@type': 'PostalAddress', streetAddress: branch.address, addressLocality: branch.locality, addressCountry: branch.country };
}

/** Categories in config order (`order`), then any others in order of appearance. */
export function categoriesOf(items: { category: string }[], order: string[] = []): string[] {
    return [...new Set([...order, ...items.map(i => i.category)])].filter(c => items.some(i => i.category === c));
}

/**
 * The public site's content, from the brand config (`src/app/config/tenant.ts`), worked out once:
 * `{brand}` filled in, menus and footer without links to hidden sections, branch timetables, header search.
 * Shared by the public layout (header, footer) and the public pages.
 */
@Injectable({ providedIn: 'root' })
export class PublicSiteService {
    private readonly _tenant = inject(TenantService);

    readonly brand = this._tenant.name;
    /** The landing content with `{brand}` filled in. */
    readonly c: LandingConfig = fillBrand(landingConfig(), this.brand);
    /**
     * The site groups' switches from the database (`GET /v1/public/site-groups`, applied by the public layout
     * and the page guards through `applyGroups`). Null until then, or with no API (a Cloudflare prerender without
     * one): the brand config's sections and every page.
     */
    private readonly _groups = signal<SiteGroup[] | null>(null);

    /** The landing sections shown, in order: the groups with their section on, else the brand config's list. */
    readonly sections = computed<SectionId[]>(() => {
        const groups = this._groups();
        if (!groups) return this.c.sections;
        const known = new Set<string>(SECTION_IDS);
        const shown = groups
            .filter(g => g.section === true || (g.required && g.section !== null))
            .flatMap(g => GROUP_SECTIONS[g.key] ?? [g.key])
            .filter((id): id is SectionId => known.has(id) && (id !== 'stats' || this.c.sections.includes('stats')));
        return shown.length ? shown : this.c.sections;
    });
    private readonly _enabled = computed(() => new Set<string>(this.sections()));
    /** Page path → group key: from the database when loaded, else the known public pages. */
    private readonly _pageGroups = computed(() => {
        const groups = this._groups();
        const pairs: [string, string][] = groups
            ? groups.flatMap((g): [string, string][] => (g.page_path ? [[g.page_path, g.key]] : []))
            : Object.entries(PAGE_PATHS).map(([key, path]): [string, string] => [path, key]);
        return pairs;
    });

    /**
     * Header menu: each group in order, as its landing section when that is on, else as its page when only the page
     * is on (blog `{ section: off, page: on }` → "Blog" links to /blog). Up to `max` items all show; with more, the
     * first `max - 1` show and the rest go into the "More" dropdown.
     */
    readonly navItems = computed<PageLink[]>(() => {
        const groups = this._groups();
        const order: string[] = groups ? groups.map(g => g.key) : this.sections();
        return order.flatMap((id): PageLink[] => {
            const label = this.c.nav.labels[id as SectionId];
            if (!label) return [];
            if (this._enabled().has(id)) return [{ label, fragment: id === 'hero' ? 'top' : id }];
            const g = groups?.find(x => x.key === id);
            return g?.page_path && this.pageEnabled(id) ? [{ label, route: g.page_path }] : [];
        });
    });
    readonly nav = computed<(PageLink & { children?: PageLink[] })[]>(() => this._groupNav(this.navItems(), this.c.nav.max ?? 5));
    readonly footerColumns = computed(() =>
        this.c.footer.columns.map(col => ({ ...col, links: col.links.filter(link => this.shows(link)) })).filter(col => col.links.length > 0)
    );
    readonly social = this.c.footer.social.map(s => ({ ...s, icon: SOCIAL_ICONS[s.icon] }));
    readonly branches = this.c.branches.items.map(b => ({ ...b, timetable: timetable(b.hours) }));
    readonly branchHeading = this.branches.length > 1 ? this.c.branches.many : this.c.branches.single;
    /** The plans to sell: the tiers, or without tiers the one membership (id `membership`). */
    readonly plans: Plan[] = this.c.plans.items?.length
        ? this.c.plans.items
        : this.c.plans.membership
          ? [{ ...this.c.plans.membership, id: 'membership', name: this.c.plans.membership.name ?? 'Membership' }]
          : [];
    /** Plans layout: a card per plan with a period switch (tiers), or a card per period (no tiers, or set so). */
    readonly planLayout: 'plans' | 'periods' =
        !this.c.plans.layout || this.c.plans.layout === 'auto' ? (this.c.plans.items?.length ? 'plans' : 'periods') : this.c.plans.layout;

    /** Scroll-spy and page highlight: which top-level menu item a section or page belongs to. */
    private readonly _navFor = computed(
        () =>
            new Map<string, string>(
                this.nav()
                    .flatMap(item => [[this._key(item), item.label] as const, ...(item.children ?? []).map(child => [this._key(child), item.label] as const)])
                    .filter(([key]) => key !== '')
            )
    );
    private readonly _searchIndex = computed(() => this._buildSearchIndex(this.sections()));

    /** The database's switches. Groups the templates do not know are ignored. */
    applyGroups(groups: SiteGroup[]): void {
        this._groups.set(groups);
    }

    /** Whether a group's own page is on. Unknown groups and groups without a switch count as on. */
    pageEnabled(group: string): boolean {
        const g = this._groups()?.find(x => x.key === group);
        return g?.page !== false || g.required;
    }

    /** The group a route belongs to (`/blog`, `/branches/gulshan` → `branches`), or null for other pages. */
    groupOfRoute(route: string): string | null {
        const path = route.split(/[?#]/)[0] ?? route;
        return this._pageGroups().find(([p]) => path === p || path.startsWith(`${p}/`))?.[1] ?? null;
    }

    /** Whether a section is shown on the landing page. */
    enabled(section: SectionId): boolean {
        return this._enabled().has(section);
    }

    /** Whether a link has a target: a page that is on, an enabled section, or a fragment that always exists. */
    shows(link: PageLink): boolean {
        if (link.route) {
            const group = this.groupOfRoute(link.route);
            return !group || this.pageEnabled(group);
        }
        return !link.fragment || FIXED_FRAGMENTS.has(link.fragment) || this._enabled().has(link.fragment);
    }

    /**
     * Where a link goes. A section link points at the landing page; a hidden section falls back to its top. A link to
     * a page that is off goes to its group's landing section instead, or the top of the landing page.
     */
    target(link: PageLink): LinkTarget {
        if (link.route) {
            const group = this.groupOfRoute(link.route);
            if (!group || this.pageEnabled(group)) return { route: link.route, fragment: link.fragment };
            return { route: '/', fragment: this._enabled().has(group) ? group : 'top' };
        }
        return { route: '/', fragment: this.shows(link) ? link.fragment : 'top' };
    }

    /** The menu item to underline for a landing section (`#plans`) or a page (`/blog`). */
    navItemFor(sectionOrRoute: string): string | null {
        return this._navFor().get(sectionOrRoute) ?? null;
    }

    /** The landing section a header search lands on, or null. */
    search(query: string): string | null {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) return null;
        return this._searchIndex().find(entry => words.some(w => entry.terms.some(t => t.startsWith(w))))?.fragment ?? null;
    }

    private _groupNav(items: PageLink[], max: number): (PageLink & { children?: PageLink[] })[] {
        if (items.length <= max) return items;
        const shown = Math.max(max - 1, 0);
        return [...items.slice(0, shown), { label: this.c.nav.more, children: items.slice(shown) }];
    }

    private _key(link: PageLink): string {
        return link.route ?? link.fragment ?? '';
    }

    /** Search terms per enabled section: its extra words, its heading, and its item names. */
    private _buildSearchIndex(shown: SectionId[]): { fragment: string; terms: string[] }[] {
        const c = this.c;
        const items: Partial<Record<SectionId, string[]>> = {
            services: c.services.items.map(i => i.title),
            plans: this.plans.map(i => i.name),
            facilities: c.facilities.items.map(i => i.name),
            trainers: c.trainers.items.map(i => i.name),
            blog: c.blog.items.map(i => i.title),
            branches: c.branches.items.map(i => i.name),
            gallery: categoriesOf(c.gallery.items, c.gallery.categories)
        };
        const headings: Partial<Record<SectionId, { title: string; accent: string }>> = {
            services: c.services,
            plans: c.plans,
            facilities: c.facilities,
            reviews: c.reviews,
            trainers: c.trainers,
            blog: c.blog,
            branches: this.branchHeading,
            gallery: c.gallery,
            faq: c.faq
        };
        const sections = shown.filter(id => id !== 'hero' && id !== 'stats');
        const entries: { fragment: string; text: string }[] = sections.map(id => ({
            fragment: id,
            text: [SEARCH_WORDS[id], headings[id]?.title, headings[id]?.accent, ...(items[id] ?? [])].join(' ')
        }));
        entries.push({ fragment: 'contact', text: SEARCH_WORDS.contact ?? '' });
        return entries.map(e => ({ fragment: e.fragment, terms: e.text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) }));
    }
}
