/**
 * Shape of the build-time brand config. The VALUES live in one file: `src/app/config/tenant.ts`.
 *
 * FitManager ships one brand (D-001). A second brand would swap that file with `fileReplacements`.
 *
 * Text in the landing content may contain `{brand}`; it is replaced with `brand.name`.
 */
export interface TenantConfig {
    id: string;
    /** The gym's brand: what visitors and members see. */
    brand: BrandConfig;
    /** The software behind the site, credited in the public footer as "Powered by …". Omit to hide the credit. */
    poweredBy?: { name: string; url?: string };
    /** Colour themes. The first one, or `defaultTheme`, is used until a visitor picks another. */
    themes: ThemeConfig[];
    defaultTheme?: string;
    /** Product switches a tenant may turn off. Optional fields default to ON, so older tenant files keep working. */
    features: { darkMode?: boolean; themeSwitcher?: boolean };
    /** The sign-in and sign-up pages' side panel. */
    auth?: AuthConfig;
    /** The public landing page at `/`. Without it, `/` goes straight to sign-in (and there is no sign-up page). */
    landing?: LandingConfig;
}

export interface BrandConfig {
    name: string;
    tagline?: string;
    /** Logo image under `public/`. Without it the logo is the wordmark: an accent block, then the name in two colours. */
    logo?: string;
    /** How the wordmark splits the name: `['Fit', 'Manager']`. Default: before its second capital letter. */
    wordmark?: [plain: string, accent: string];
    /** Letters in the logo block and the browser icon. Default: the first letter of each word ("ITF"). */
    initials?: string;
    /** What the logo block and the browser icon show: the initials (default) or a dumbbell. */
    mark?: 'initials' | 'dumbbell';
}

/** Ten shades, 50 → 900. */
export type Shades = [string, string, string, string, string, string, string, string, string, string];

export interface ThemeConfig {
    id: string;
    label: string;
    /** Main accent (buttons, highlights) and second accent, as their 500 shade. Keep white text readable on both. */
    primary: string;
    secondary: string;
    /** Exact 50…900 shades. Without them the shades are mixed from `primary` / `secondary`. */
    primaryShades?: Shades;
    secondaryShades?: Shades;
    /** Button hover and pressed shades. Without them they are mixed toward black. */
    primaryStates?: { hover: string; pressed: string };
    secondaryStates?: { hover: string; pressed: string };
    /** Dark surfaces, darkest first: page edge and footer, page, card, raised card / border. */
    surfaces?: [string, string, string, string];
    /**
     * Recolour the warm glow baked into the design's photos with this theme's accents (through the `*.tint.webp`
     * masks). Leave it off for the design's own red and orange.
     */
    tintPhotos?: boolean;
}

// ───────────── Landing page ─────────────

/** Landing page sections the templates can render. The database's `site_group` keys match these (D-040). */
export const SECTION_IDS = ['hero', 'stats', 'services', 'plans', 'facilities', 'reviews', 'trainers', 'blog', 'branches', 'gallery', 'faq'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** A photo. `tint` is the optional glow mask written by fitmanager-resources/scripts/extract_landing_assets.py. */
export interface Img {
    src: string;
    alt: string;
    tint?: string;
}

/** Section heading: `title` then `accent` in the theme colour, and an optional lead paragraph. */
export interface Heading {
    title: string;
    accent: string;
    lead?: string;
}

/**
 * A link: `route` for a page (`/trainers`), or `fragment` for a section of the landing page (a section id, or
 * `top`, `about`, `contact`). A link to a hidden section is dropped from menus, or falls back to the page top.
 */
export interface PageLink {
    label: string;
    fragment?: string;
    route?: string;
}

/** A page of its own (`/trainers`, `/blog`, `/gallery`): its heading, and its search-engine title and description. */
export interface PageConfig extends Heading {
    seo: { title: string; description: string };
}

export interface LandingConfig {
    /**
     * The fallback list of sections, in order, for when the database's switches (D-040) are not available: a
     * prerender without an API. Normally HQ switches sections on and off at /hq/settings.
     */
    sections: SectionId[];
    seo: { title: string; description: string };
    /** Currency for plan prices, e.g. `৳` and `BDT`. */
    currency: { symbol: string; code: string };
    /**
     * The header menu: one item per shown section that has a label here, in `sections` order. Up to `max` items
     * (default 5) all show; with more, the first `max - 1` show and the rest go into the `more` dropdown.
     */
    nav: { labels: Partial<Record<SectionId, string>>; more: string; max?: number };
    /** The header's Sign Up button. */
    signUp: PageLink;

    hero: {
        /** Three lines: plain, display-face accent, plain. */
        lines: [string, string, string];
        text: string;
        primaryCta: PageLink;
        secondaryCta: PageLink;
        image: Img;
        /**
         * Badges over the photo: a figure (`'1,200+'`; its number counts up on load) and a label, with an optional icon.
         * Position and width in % of the photo box.
         */
        badges: { value: string; label: string; icon?: BadgeIcon; left: number; top: number; width: number }[];
    };
    /** Offer pop-up on the landing page, a moment after it opens. Dismissed, it stays away for `snoozeDays`. */
    promo?: PromoConfig;
    stats: { value: string; label: string; text: string; tone: 'primary' | 'secondary' }[];
    services: Heading & { items: { title: string; lead: string; text: string; image: Img; link: PageLink }[] };
    /**
     * Membership plans: any tiers (Pro / Custom / Beginner, 1 / 2 / 3 persons, Day / Evening…), each with a price per
     * billing period; or no tiers, just one `membership` priced per period. See `layout` for how they show.
     */
    plans: Heading & {
        /** Billing periods, in switch order; the first is selected at first. */
        periods: PlanPeriod[];
        cta: PageLink;
        /** Small label above each plan's name, e.g. `Package`. A plan's own `kicker` wins. */
        kicker?: string;
        /**
         * `plans`: a card per plan, and a switch for the period. `periods`: a card per period, and a switch for the plan
         * (when there are several). `auto` (default): `plans` when there are plan tiers (`items`), else `periods`.
         */
        layout?: 'auto' | 'plans' | 'periods';
        /** In the `periods` layout, the period to highlight. Default: the one with the biggest saving. */
        featuredPeriod?: string;
        /** Plan tiers. `prices` holds a price per period id; a plan without a price for a period shows it as not available. */
        items?: PlanTier[];
        /** No tiers: the one membership, priced per period. Used when `items` is empty or left out. */
        membership?: Omit<PlanTier, 'id' | 'featured' | 'kicker' | 'name'> & { name?: string };
    };
    facilities: Heading & { items: { name: string; text: string; icon: FacilityIcon }[] };
    reviews: Heading & { items: { name: string; role: string; quote: string; image: Img }[] };
    trainers: Heading & {
        viewAll?: PageLink;
        page: PageConfig;
        items: { name: string; role: string; image: Img; link: PageLink; branch?: string; specialties?: string[]; bio?: string }[];
    };
    /** Blog posts. The blog page filters them by `category`. */
    blog: Heading & {
        viewAll?: PageLink;
        page: PageConfig;
        items: { title: string; category: string; date?: string; excerpt?: string; image: Img; link: PageLink }[];
    };
    /**
     * Photo gallery. The landing page shows the first `preview` photos; the gallery page shows all and filters
     * them by `category` (the branch, for now). `categories` sets the filter order; default: order of appearance.
     */
    gallery: Heading & {
        viewAll?: PageLink;
        page: PageConfig;
        preview?: number;
        categories?: string[];
        items: { src: string; thumb: string; alt: string; category: string; width: number; height: number }[];
    };
    branches: {
        /** Heading for several branches, and for a single one (then only its timetable shows). */
        many: Heading;
        single: Heading;
        items: { name: string; address: string; locality: string; country: string; hours: HoursBlock[] }[];
    };
    faq: Heading & { items: { question: string; answer: string }[] };
    /** Extra public pages (offers, policies, rules, careers…), each at `/<slug>`. Link them from the footer. */
    pages: InfoPage[];
    footer: {
        about: string;
        aboutLink?: PageLink;
        columns: { title: string; links: PageLink[] }[];
        contact: { title: string; phone: string; email: string };
        social: { name: string; href: string; icon: SocialIcon }[];
    };
}

/**
 * A simple public page at `/<slug>`: its heading, then blocks. `document` (default) reads like a policy, one block
 * per titled part; `cards` shows each block as a card (offers).
 */
export interface InfoPage extends PageConfig {
    slug: string;
    /** Breadcrumb label. Default: the title. */
    crumb?: string;
    layout?: 'document' | 'cards';
    /** "Last updated" date (`YYYY-MM-DD`). */
    updated?: string;
    blocks: { heading?: string; text?: string[]; list?: string[]; note?: string }[];
}

/** A plan tier: `{ id: 'duo', name: '2 Persons', prices: { monthly: 8000, … } }`. */
export interface PlanTier {
    id: string;
    name: string;
    kicker?: string;
    description?: string;
    features?: string[];
    prices: Record<string, number>;
    featured?: boolean;
}

/** A billing period: `{ id: 'quarterly', label: '3 Months', months: 3 }`. */
export interface PlanPeriod {
    id: string;
    label: string;
    months: number;
}

/** The sign-in and sign-up pages: the side panel's photo and words. Without it, the panel shows the brand on a gradient. */
export interface AuthConfig {
    image?: Img;
    title: string;
    accent?: string;
    text: string;
    points?: string[];
}

export type BadgeIcon = 'trophy' | 'flame' | 'smile' | 'users' | 'dumbbell' | 'star';

export interface PromoConfig {
    /** Change it for a new offer: a visitor who dismissed the old one sees the new one. */
    id: string;
    badge?: string;
    title: string;
    accent?: string;
    text: string;
    /** Validity, e.g. `Until 31 Dec 2026`. */
    note?: string;
    image?: Img;
    cta: PageLink;
    secondary?: PageLink;
    /** Seconds after the landing page opens. Default 2.5 (after the hero figures have counted up). */
    delaySeconds?: number;
    /** Days it stays hidden after the visitor closes it. Default 3. */
    snoozeDays?: number;
}

export type FacilityIcon = 'dumbbell' | 'heartPulse' | 'users' | 'venus' | 'showerHead' | 'parking' | 'bike' | 'waves' | 'flame' | 'clock';
export type SocialIcon = 'facebook' | 'instagram' | 'x' | 'youtube';

/** Day groups a timetable line can use. */
export type DayGroup = 'satThu' | 'friday' | 'sunThu' | 'monFri' | 'saturday' | 'sunday' | 'daily';

/** A titled timetable block: opening hours, ladies hour, … The first block is the branch's opening hours. */
export interface HoursBlock {
    title: string;
    /** One line per day group, each with one or more `[opens, closes]` ranges in 24-hour `HH:mm`. */
    sessions: { days: DayGroup; ranges: [opens: string, closes: string][] }[];
}
