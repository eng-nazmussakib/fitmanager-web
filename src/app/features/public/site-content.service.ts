import { inject, Injectable, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import type { TenantConfig } from '@config/tenant.model';
import type { BlogPost, GalleryPhoto, Offer } from '@core/models/website.model';

import { PublicContentService } from './public-content.service';
import { PublicSiteService, slug } from './public-site.service';

type Landing = NonNullable<TenantConfig['landing']>;
export type BlogItem = Landing['blog']['items'][number] & { slug: string; published_at: string | null };
export type GalleryItem = Landing['gallery']['items'][number];

const shortDay = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Dhaka' });

/** A post from the API in the brand config's item shape (the landing section and the blog page render either). */
export function postItem(p: BlogPost): BlogItem {
    return {
        slug: p.slug,
        title: p.title,
        category: p.category?.name ?? 'News',
        date: p.published_at ? shortDay(p.published_at) : undefined,
        published_at: p.published_at,
        excerpt: p.excerpt,
        image: p.cover ?? { src: 'assets/images/landing/blog-exercises.webp', alt: '' },
        link: { label: 'Read more', route: `/blog/${p.slug}` }
    };
}

export function photoItem(g: GalleryPhoto): GalleryItem {
    return { src: g.src, thumb: g.thumb, alt: g.alt, category: g.branch.name, width: g.width, height: g.height };
}

/**
 * The website's content for the public pages: the database's posts, photos and offers, read while
 * prerendering and again in the browser, starting from the brand config's (the fallback when there is no API).
 */
@Injectable({ providedIn: 'root' })
export class SiteContentService {
    private readonly _content = inject(PublicContentService);
    private readonly _c = inject(PublicSiteService).c;

    /** The config's posts, linked to the same slugs the database uses (the seed's slugs are the titles'). */
    private readonly _configPosts: BlogItem[] = this._c.blog.items.map(p => ({
        ...p,
        slug: slug(p.title),
        published_at: null,
        link: { label: p.link.label, route: `/blog/${slug(p.title)}` }
    }));

    readonly posts: Signal<BlogItem[]> = toSignal(this._content.posts().pipe(map(rows => (rows ? rows.map(postItem) : this._configPosts))), {
        initialValue: this._configPosts
    });

    readonly photos: Signal<GalleryItem[]> = toSignal(this._content.gallery().pipe(map(rows => (rows ? rows.map(photoItem) : this._c.gallery.items))), {
        initialValue: this._c.gallery.items
    });

    /** Null until loaded, or with no API: the offers page then shows the config's text. */
    readonly offers: Signal<Offer[] | null> = toSignal(this._content.offers(), { initialValue: null });
}
