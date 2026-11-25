import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideFileText } from '@ng-icons/lucide';

import type { PageConfig } from '@config/tenant.model';
import { SeoService } from '@core/seo/seo.service';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';

import { PublicContentService } from '../public-content.service';
import { PublicSiteService } from '../public-site.service';
import { PageIntroComponent } from '../shared/page-intro.component';

const DOC_STYLES = `
    .policy-doc {
        max-width: 48rem;
        margin-inline: auto;
        padding: 1.5rem;
        border-radius: 0.75rem;
        background: var(--color-ink-800);
        box-shadow: var(--shadow-e4);
        line-height: 1.7;
        color: rgb(255 255 255 / 85%);
    }
    .policy-doc h2 {
        font-size: 1.125rem;
        font-weight: 600;
        color: #fff;
    }
    .policy-doc section + section {
        margin-top: 1.5rem;
        padding-top: 1.5rem;
        border-top: 1px solid rgb(255 255 255 / 8%);
    }
    @media (width >= 64rem) {
        .policy-doc {
            padding: 2.5rem 3rem;
        }
    }
`;

/**
 * `/policies`: HQ's public policies, from the API in the browser (they change with each new version, so these
 * pages are not prerendered).
 */
@Component({
    selector: 'app-policies-index',
    imports: [RouterLink, NgIcon, AppDatePipe, PageIntroComponent],
    viewProviders: [provideIcons({ lucideFileText })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    styles: DOC_STYLES,
    template: `
        <app-page-intro crumb="Policies" [page]="intro" />
        <div class="wrap mt-10 lg:mt-14">
            @if (list.value(); as rows) {
                <ul class="mx-auto grid max-w-3xl gap-4">
                    @for (p of rows; track p.slug) {
                        <li>
                            <a class="trainer-card lift flex items-start gap-4 p-5 text-white no-underline" [routerLink]="['/policies', p.slug]">
                                <ng-icon class="mt-1 shrink-0 text-xl text-primary-400" aria-hidden="true" name="lucideFileText" />
                                <span>
                                    <span class="block text-h1 font-semibold">{{ p.title }}</span>
                                    <span class="mt-1 block text-sm text-white/70">{{ p.summary }}</span>
                                    <span class="mt-1 block text-xs text-white/50">Version {{ p.version }} · {{ p.published_on | appDate: 'd MMMM yyyy' }}</span>
                                </span>
                            </a>
                        </li>
                    } @empty {
                        <li class="text-center text-white/60">The policies are not available right now. Ask at any front desk.</li>
                    }
                </ul>
            }
        </div>
    `
})
export class PoliciesIndexComponent {
    private readonly _content = inject(PublicContentService);
    private readonly _site = inject(PublicSiteService);
    protected readonly intro: PageConfig = {
        title: 'Our',
        accent: 'Policies',
        lead: 'The rules and terms every member agrees to. Members accept each new version in the member portal or at the desk.',
        seo: { title: 'Policies', description: 'Gym rules, membership terms, refund and privacy policies.' }
    };
    protected readonly list = rxResource({ stream: () => this._content.policies() });

    constructor() {
        inject(SeoService).update({ path: '/policies', title: `Policies | ${this._site.brand}`, description: this.intro.seo.description });
    }
}

/** `/policies/:slug`: one policy's current numbered clauses and its version history. */
@Component({
    selector: 'app-policy-page',
    imports: [RouterLink, NgIcon, AppDatePipe],
    viewProviders: [provideIcons({ lucideChevronRight })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    styles: DOC_STYLES,
    template: `
        <div class="wrap pt-6 text-center lg:pt-12">
            <nav class="flex items-center justify-center gap-1.5 text-sm text-white/60" aria-label="Breadcrumb">
                <a class="hover:text-white" routerLink="/">Home</a>
                <ng-icon aria-hidden="true" name="lucideChevronRight" />
                <a class="hover:text-white" routerLink="/policies">Policies</a>
                <ng-icon aria-hidden="true" name="lucideChevronRight" />
                <span aria-current="page">{{ policy.value()?.title ?? '…' }}</span>
            </nav>
            <h1 class="mt-4 text-[2rem] leading-tight font-extrabold lg:text-title">{{ policy.value()?.title ?? '' }}</h1>
            @if (policy.value()?.summary) {
                <p class="section-lead">{{ policy.value()?.summary }}</p>
            }
        </div>
        <div class="wrap mt-10 lg:mt-14">
            @if (policy.value(); as p) {
                <article class="policy-doc">
                    <p class="mb-6 text-sm text-white/55">Version {{ p.version }} · Last updated {{ p.published_on | appDate: 'd MMMM yyyy' }}</p>
                    @for (c of p.clauses; track c.number) {
                        <section>
                            <h2>{{ c.number }}. {{ c.heading }}</h2>
                            <p class="mt-2">{{ c.body }}</p>
                        </section>
                    }
                </article>
                @if (p.history.length > 1) {
                    <section class="mx-auto mt-8 max-w-3xl text-sm text-white/70">
                        <h2 class="mb-2 font-semibold text-white">Earlier versions</h2>
                        <ul class="space-y-1">
                            @for (h of p.history; track h.version) {
                                <li>
                                    Version {{ h.version }}, {{ h.published_on | appDate: 'd MMM yyyy' }}:
                                    {{ h.change_note ?? (h.version === 1 ? 'first version' : 'updated') }}{{ h.mode === 'wording_only' ? ' (wording only)' : '' }}
                                </li>
                            }
                        </ul>
                    </section>
                }
            } @else if (policy.isLoading()) {
                <p class="text-center text-white/60">Loading…</p>
            } @else {
                <p class="text-center text-white/60">This policy is not available right now. <a class="underline" routerLink="/policies">All policies</a></p>
            }
        </div>
    `
})
export class PolicyPageComponent {
    private readonly _content = inject(PublicContentService);
    private readonly _site = inject(PublicSiteService);
    private readonly _seo = inject(SeoService);
    readonly slug = input.required<string>();
    protected readonly policy = rxResource({ params: () => this.slug(), stream: ({ params }) => this._content.policy(params) });
    private readonly _title = computed(() => this.policy.value()?.title ?? 'Policy');

    constructor() {
        effect(() => {
            const p = this.policy.value();
            this._seo.update({ path: `/policies/${this.slug()}`, title: `${this._title()} | ${this._site.brand}`, description: p?.summary ?? 'A policy of the gym.' });
        });
    }
}
