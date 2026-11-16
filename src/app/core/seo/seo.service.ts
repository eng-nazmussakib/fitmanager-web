import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Meta } from '@angular/platform-browser';

import { environment } from '@env/environment';

export interface SeoTags {
    /** Path of the page, '' for the home page, '/plans' for /plans. */
    path: string;
    title: string;
    description: string;
    /** schema.org object rendered as JSON-LD. */
    jsonLd?: Record<string, unknown>;
}

/**
 * Head tags for public, indexable pages: description, canonical URL, Open Graph and JSON-LD.
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
        this._meta.updateTag({ property: 'og:type', content: 'website' });
        this._meta.updateTag({ property: 'og:title', content: tags.title });
        this._meta.updateTag({ property: 'og:description', content: tags.description });
        this._meta.updateTag({ property: 'og:url', content: url });
        this._meta.updateTag({ property: 'og:locale', content: 'en_US' });

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
