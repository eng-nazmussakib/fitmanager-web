import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Meta } from '@angular/platform-browser';

import { TENANT } from '@config/tenant';
import { environment } from '@env/environment';

/**
 * The share image every public page sends (og:image and the Twitter card): `public/og-image.png`, 1200×630, drawn from
 * the brand config by `npm run brand-images` (scripts/brand-images.mjs). Crawlers need its absolute URL, hence `siteUrl`.
 */
const SHARE_IMAGE = { path: '/og-image.png', width: 1200, height: 630, type: 'image/png' };

/** An absolute URL on the site for a path (`assets/…`, `/api/…`), as structured data wants; absolute ones kept. */
export function absolute(src: string): string {
    return /^https?:/.test(src) ? src : `${environment.siteUrl}/${src.replace(/^\//, '')}`;
}

/** A schema.org BreadcrumbList from [name, absolute URL] pairs, the last one being the page itself. */
export function breadcrumbs(items: [string, string][]): Record<string, unknown> {
    return {
        '@type': 'BreadcrumbList',
        itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item }))
    };
}

export interface SeoTags {
    /** Path of the page, '' for the home page, '/plans' for /plans. */
    path: string;
    title: string;
    description: string;
    /** schema.org object rendered as JSON-LD. */
    jsonLd?: Record<string, unknown>;
    /** `article` for a blog post (Open Graph); `website` otherwise. */
    type?: 'website' | 'article';
    /** A page's own share image (an absolute URL, or a path on the site), instead of the site's. */
    image?: { src: string; alt: string };
}

/**
 * Head tags for public, indexable pages: description, canonical URL, Open Graph, the Twitter card and JSON-LD.
 * The tab title itself comes from AppTitleStrategy (route `title`).
 * Writes through DOCUMENT and Meta only, so it also works during server-side rendering.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
    private readonly _document = inject(DOCUMENT);
    private readonly _meta = inject(Meta);

    update(tags: SeoTags): void {
        const origin = environment.siteUrl || this._document.location?.origin || '';
        const url = `${origin}${tags.path || '/'}`;

        this._meta.updateTag({ name: 'description', content: tags.description });
        this._meta.updateTag({ property: 'og:type', content: tags.type ?? 'website' });
        this._meta.updateTag({ property: 'og:title', content: tags.title });
        this._meta.updateTag({ property: 'og:description', content: tags.description });
        this._meta.updateTag({ property: 'og:url', content: url });
        this._meta.updateTag({ property: 'og:locale', content: 'en_US' });
        this._meta.updateTag({ property: 'og:site_name', content: TENANT.brand.name });
        const own = tags.image ? (/^https?:/.test(tags.image.src) ? tags.image.src : `${origin}/${tags.image.src.replace(/^\//, '')}`) : null;
        const image = own ?? `${origin}${SHARE_IMAGE.path}`;
        // Describes og-image.png, which names the product for now (scripts/brand-images.mjs, SHARE).
        const alt = tags.image?.alt.length ? tags.image.alt : 'FitManager: members, plans, payments and check-ins for every branch of your gym';
        this._meta.updateTag({ property: 'og:image', content: image });
        if (own) {
            // Its size and type are not known here: leave them out rather than describe the site's image.
            for (const p of ['og:image:width', 'og:image:height', 'og:image:type']) this._meta.removeTag(`property="${p}"`);
        } else {
            this._meta.updateTag({ property: 'og:image:width', content: String(SHARE_IMAGE.width) });
            this._meta.updateTag({ property: 'og:image:height', content: String(SHARE_IMAGE.height) });
            this._meta.updateTag({ property: 'og:image:type', content: SHARE_IMAGE.type });
        }
        this._meta.updateTag({ property: 'og:image:alt', content: alt });
        // X/Twitter falls back to the og: title, description and image; the card type has no og: equivalent.
        this._meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
        this._meta.updateTag({ name: 'twitter:image:alt', content: alt });

        this._canonical(url);
        this._jsonLd(tags.jsonLd);
    }

    private _canonical(href: string): void {
        let link = this._document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        if (!link) {
            link = this._document.createElement('link');
            link.rel = 'canonical';
            this._document.head.appendChild(link);
        }
        link.href = href;
    }

    private _jsonLd(data: Record<string, unknown> | undefined): void {
        const id = 'seo-json-ld';
        let script = this._document.getElementById(id);
        if (!data) {
            script?.remove();
            return;
        }
        if (!script) {
            script = this._document.createElement('script');
            script.id = id;
            script.setAttribute('type', 'application/ld+json');
            this._document.head.appendChild(script);
        }
        script.textContent = JSON.stringify(data);
    }
}
