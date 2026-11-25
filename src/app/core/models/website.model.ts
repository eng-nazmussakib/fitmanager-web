/** The public website's content (phase 7c, D-109): the wire contract of `/v1/public/*` and `/v1/website/*`. */

export interface SiteImage {
    src: string;
    alt: string;
}

export interface BlogCategory {
    oid: string;
    name: string;
    slug: string;
}

export type PostStatus = 'draft' | 'scheduled' | 'published';

export interface BlogPost {
    oid: string;
    slug: string;
    title: string;
    excerpt: string;
    /** Markdown; only on one post (`/v1/public/posts/:slug`) and in HQ's list. */
    body?: string;
    category: BlogCategory | null;
    cover: SiteImage | null;
    cover_file_oid: string | null;
    author_name: string;
    /** Null: a draft. In the future: scheduled. */
    published_at: string | null;
    status: PostStatus;
    updated_at: string;
}

export interface PostPayload {
    title: string;
    slug: string;
    excerpt: string;
    body: string;
    category_oid: string | null;
    cover_file_oid?: string | null;
    cover_url?: string | null;
    cover_alt?: string;
    published_at: string | null;
}

export interface Offer {
    oid: string;
    slug: string;
    title: string;
    summary: string;
    /** Markdown. */
    body: string;
    conditions: string[];
    promo_code: string | null;
    starts_on: string;
    ends_on: string | null;
    sort_order: number;
    published: boolean;
}

export type OfferPayload = Omit<Offer, 'oid'>;

export interface GalleryPhoto {
    oid: string;
    branch: { oid: string; slug: string; name: string };
    src: string;
    thumb: string;
    alt: string;
    width: number;
    height: number;
    sort_order: number;
    file_oid: string | null;
}
