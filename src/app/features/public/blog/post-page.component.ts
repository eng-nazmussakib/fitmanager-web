import { ChangeDetectionStrategy, Component, computed, effect, inject, input,ViewEncapsulation } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendar, lucideChevronRight, lucideUser } from '@ng-icons/lucide';
import { switchMap } from 'rxjs';

import { absolute, breadcrumbs, SeoService } from '@core/seo/seo.service';
import { markdownText, renderMarkdown } from '@core/utils/markdown';
import { environment } from '@env/environment';

import { PublicContentService } from '../public-content.service';
import { PublicSiteService } from '../public-site.service';
import { SiteContentService } from '../site-content.service';

/**
 * `/blog/:slug`: one post, prerendered from the database at build time and read again in the
 * browser. The body is Markdown, rendered by `renderMarkdown` (every HTML tag a writer types is escaped). Without an
 * API, the brand config's post shows its excerpt.
 */
@Component({
    selector: 'app-post-page',
    imports: [RouterLink, NgIcon],
    viewProviders: [provideIcons({ lucideCalendar, lucideChevronRight, lucideUser })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    // The Markdown is inserted with [innerHTML], which scoped styles do not reach: these rules are global, under a
    // class of their own.
    encapsulation: ViewEncapsulation.None,
    host: { class: 'block' },
    styles: `
        .post-body {
            font-size: 1.0625rem;
            line-height: 1.75;
            color: rgb(255 255 255 / 85%);
        }
        .post-body :is(h2, h3, h4) {
            margin-top: 2rem;
            font-weight: 700;
            color: #fff;
        }
        .post-body h2 {
            font-size: 1.5rem;
        }
        .post-body h3 {
            font-size: 1.25rem;
        }
        .post-body p,
        .post-body ul,
        .post-body ol,
        .post-body blockquote {
            margin-top: 1rem;
        }
        .post-body ul {
            padding-left: 1.25rem;
            list-style: disc;
        }
        .post-body ol {
            padding-left: 1.25rem;
            list-style: decimal;
        }
        .post-body li + li {
            margin-top: 0.375rem;
        }
        .post-body strong {
            color: #fff;
        }
        .post-body a {
            color: var(--color-primary-400);
            text-decoration: underline;
        }
        .post-body blockquote {
            border-left: 3px solid var(--color-primary-500);
            padding-left: 1rem;
            color: rgb(255 255 255 / 75%);
            font-style: italic;
        }
        .post-body code {
            border-radius: 0.25rem;
            background: rgb(255 255 255 / 10%);
            padding: 0.1rem 0.3rem;
            font-size: 0.9em;
        }
        .post-body hr {
            margin-top: 2rem;
            border-color: rgb(255 255 255 / 15%);
        }
    `,
    template: `
        @if (post(); as p) {
            <article class="wrap max-w-3xl pt-6 lg:pt-12">
                <nav class="flex flex-wrap items-center gap-1.5 text-sm text-white/60" aria-label="Breadcrumb">
                    <a class="hover:text-white" routerLink="/">Home</a>
                    <ng-icon aria-hidden="true" name="lucideChevronRight" />
                    <a class="hover:text-white" routerLink="/blog">Blog</a>
                    <ng-icon aria-hidden="true" name="lucideChevronRight" />
                    <span class="truncate" aria-current="page">{{ p.title }}</span>
                </nav>
                @if (p.category) {
                    <a class="tag mt-6 inline-block" routerLink="/blog" [queryParams]="{ category: p.category }">{{ p.category }}</a>
                }
                <h1 class="mt-3 text-[2rem] leading-tight font-extrabold lg:text-title">{{ p.title }}</h1>
                <p class="mt-3 flex flex-wrap items-center gap-4 text-sm text-white/65">
                    @if (p.date) {
                        <span class="flex items-center gap-1.5"><ng-icon aria-hidden="true" name="lucideCalendar" />{{ p.date }}</span>
                    }
                    @if (p.author) {
                        <span class="flex items-center gap-1.5"><ng-icon aria-hidden="true" name="lucideUser" />{{ p.author }}</span>
                    }
                </p>
                <img
                    class="mt-6 aspect-[16/9] w-full rounded-xl object-cover"
                    fetchpriority="high"
                    height="540"
                    width="960"
                    [alt]="p.image.alt"
                    [src]="p.image.src"
                />
                <div class="post-body mt-6" [innerHTML]="p.html"></div>
                <p class="mt-10"><a class="btn btn-outline-secondary" routerLink="/blog">All posts</a></p>
            </article>
        } @else if (missing()) {
            <div class="wrap py-24 text-center">
                <h1 class="text-h1 font-bold">Post not found</h1>
                <p class="mt-3 text-white/70">It may have moved. <a class="text-primary-400 underline" routerLink="/blog">See every post</a>.</p>
            </div>
        }
    `
})
export class PostPageComponent {
    private readonly _content = inject(PublicContentService);
    private readonly _site = inject(PublicSiteService);
    private readonly _seo = inject(SeoService);
    private readonly _title = inject(Title);
    private readonly _posts = inject(SiteContentService).posts;

    readonly slug = input.required<string>();

    /** The post from the API (null: not found or no API), undefined while loading. */
    private readonly _post = toSignal(toObservable(this.slug).pipe(switchMap(s => this._content.post(s))));

    protected readonly post = computed(() => {
        const p = this._post();
        if (p) {
            return {
                title: p.title,
                category: p.category?.name ?? null,
                date: p.published_at ? new Date(p.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' }) : null,
                published_at: p.published_at,
                author: p.author_name,
                excerpt: p.excerpt,
                image: p.cover ?? { src: 'assets/images/landing/blog-exercises.webp', alt: '' },
                html: renderMarkdown(p.body ?? ''),
                text: markdownText(p.body ?? '')
            };
        }
        // No API (or not loaded yet): the brand config's post of that slug, with its excerpt as the text.
        const c = this._posts().find(x => x.slug === this.slug());
        return c
            ? {
                  title: c.title,
                  category: c.category,
                  date: c.date ?? null,
                  published_at: c.published_at,
                  author: null,
                  excerpt: c.excerpt ?? '',
                  image: c.image,
                  html: renderMarkdown(c.excerpt ?? ''),
                  text: c.excerpt ?? ''
              }
            : null;
    });
    protected readonly missing = computed(() => this._post() === null && !this.post());

    constructor() {
        effect(() => {
            const p = this.post();
            if (!p) return;
            const url = `${environment.siteUrl}/blog/${this.slug()}`;
            this._title.setTitle(`${p.title} | ${this._site.brand}`);
            this._seo.update({
                path: `/blog/${this.slug()}`,
                title: `${p.title} | ${this._site.brand}`,
                description: p.excerpt,
                type: 'article',
                image: p.image,
                jsonLd: {
                    '@context': 'https://schema.org',
                    '@graph': [
                        {
                            '@type': 'BlogPosting',
                            headline: p.title,
                            description: p.excerpt,
                            url,
                            mainEntityOfPage: url,
                            image: absolute(p.image.src),
                            ...(p.category ? { articleSection: p.category } : {}),
                            ...(p.published_at ? { datePublished: p.published_at } : {}),
                            ...(p.author ? { author: { '@type': 'Person', name: p.author } } : {}),
                            publisher: { '@type': 'Organization', name: this._site.brand },
                            wordCount: p.text.split(' ').filter(Boolean).length
                        },
                        breadcrumbs([
                            ['Home', `${environment.siteUrl}/`],
                            ['Blog', `${environment.siteUrl}/blog`],
                            [p.title, url]
                        ])
                    ]
                }
            });
        });
    }
}
