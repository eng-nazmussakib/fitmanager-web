import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideAward, lucideCalendarDays, lucideChevronRight, lucideMapPin } from '@ng-icons/lucide';
import { switchMap } from 'rxjs';

import { SeoService } from '@core/seo/seo.service';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';

import { PublicContentService } from '../public-content.service';
import { PublicSiteService } from '../public-site.service';

/**
 * `/trainers/:slug`: one trainer's public page: photo, branch, specialties, certificates, bio and their
 * classes in the next 7 days at every branch. From the API in the browser (trainers change at the branches, so
 * these pages are not prerendered); JSON-LD `Person`.
 */
@Component({
    selector: 'app-trainer-page',
    imports: [RouterLink, NgIcon, AppDatePipe],
    viewProviders: [provideIcons({ lucideAward, lucideCalendarDays, lucideChevronRight, lucideMapPin })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
        <div class="wrap pt-6 lg:pt-12">
            <nav class="flex items-center gap-1.5 text-sm text-white/60" aria-label="Breadcrumb">
                <a class="hover:text-white" routerLink="/">Home</a>
                <ng-icon aria-hidden="true" name="lucideChevronRight" />
                <a class="hover:text-white" routerLink="/trainers">Trainers</a>
                <ng-icon aria-hidden="true" name="lucideChevronRight" />
                <span aria-current="page">{{ trainer()?.name ?? '…' }}</span>
            </nav>
            @if (trainer(); as t) {
                <div class="mt-6 grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
                    <div class="self-start overflow-hidden rounded-lg bg-white/5">
                        @if (t.photo_url) {
                            <img class="aspect-[280/284] w-full object-cover" height="284" width="280" [alt]="t.name" [src]="t.photo_url" />
                        } @else {
                            <span class="flex aspect-[280/284] items-center justify-center text-6xl font-semibold text-white/40" aria-hidden="true">{{ initials(t.name) }}</span>
                        }
                    </div>
                    <div>
                        <h1 class="text-[2rem] leading-tight font-extrabold lg:text-title">{{ t.name }}</h1>
                        <p class="mt-2 flex flex-wrap items-center gap-3 text-white/75">
                            {{ t.headline }}
                            @if (t.branch_slug) {
                                <a class="flex items-center gap-1 hover:text-white" [routerLink]="['/branches', t.branch_slug]">
                                    <ng-icon class="text-primary-400" aria-hidden="true" name="lucideMapPin" />{{ t.branch_name }}
                                </a>
                            }
                        </p>
                        @if (t.specialties.length) {
                            <ul class="mt-4 flex flex-wrap gap-1.5" aria-label="Specialties">
                                @for (s of t.specialties; track s) {
                                    <li class="tag">{{ s }}</li>
                                }
                            </ul>
                        }
                        @if (t.bio) {
                            <p class="mt-5 max-w-2xl leading-relaxed text-white/80">{{ t.bio }}</p>
                        }
                        @if (t.certifications?.length) {
                            <ul class="mt-5 flex flex-col gap-1.5 text-sm text-white/75" aria-label="Certificates">
                                @for (c of t.certifications; track c.name) {
                                    <li class="flex items-center gap-2">
                                        <ng-icon class="text-primary-400" aria-hidden="true" name="lucideAward" />{{ c.name }}{{ c.issuer ? ', ' + c.issuer : '' }}{{ c.year ? ' (' + c.year + ')' : '' }}
                                    </li>
                                }
                            </ul>
                        }
                        <h2 class="mt-8 flex items-center gap-2 text-h1 font-semibold"><ng-icon class="text-primary-400" aria-hidden="true" name="lucideCalendarDays" />Classes this week</h2>
                        <ul class="mt-3 flex flex-col divide-y divide-white/10">
                            @for (c of t.classes; track c.starts_at) {
                                <li class="flex flex-wrap items-center gap-3 py-2.5">
                                    <span class="w-40 shrink-0 text-sm text-white/60 tabular-nums">{{ c.starts_at | appDate: 'EEE d MMM, h:mm a' }}</span>
                                    <span class="flex-1 font-medium">{{ c.title }}{{ c.ladies_only ? ' (ladies only)' : '' }}</span>
                                    <a class="text-sm text-white/60 hover:text-white" [routerLink]="['/branches', c.branch_slug]">{{ c.branch_name }}</a>
                                </li>
                            } @empty {
                                <li class="py-3 text-white/60">No group classes this week. Ask about personal training at the front desk.</li>
                            }
                        </ul>
                    </div>
                </div>
            } @else if (missing()) {
                <p class="mt-10 text-white/70">This trainer has no public page. <a class="text-primary-400" routerLink="/trainers">See every trainer</a>.</p>
            } @else {
                <div class="mt-10 h-64 animate-pulse rounded-lg bg-white/5"></div>
            }
        </div>
    `
})
export class TrainerPageComponent {
    private readonly _content = inject(PublicContentService);
    private readonly _site = inject(PublicSiteService);
    private readonly _seo = inject(SeoService);
    private readonly _title = inject(Title);
    readonly slug = input.required<string>();
    private readonly _trainer = toSignal(toObservable(this.slug).pipe(switchMap(s => this._content.trainer(s))));
    protected readonly trainer = computed(() => this._trainer() ?? null);
    protected readonly missing = computed(() => this._trainer() === null);

    constructor() {
        effect(() => {
            const t = this.trainer();
            if (!t) return;
            const title = `${t.name}, trainer at ${this._site.brand} ${t.branch_name ?? ''}`.trim();
            this._title.setTitle(title);
            this._seo.update({
                path: `/trainers/${t.slug ?? this.slug()}`,
                title,
                description: t.bio ?? `${t.name}: ${t.specialties.join(', ')}. Classes and personal training at ${this._site.brand}.`,
                jsonLd: {
                    '@context': 'https://schema.org',
                    '@type': 'Person',
                    name: t.name,
                    jobTitle: t.headline ?? 'Trainer',
                    knowsAbout: t.specialties,
                    hasCredential: (t.certifications ?? []).map(c => ({ '@type': 'EducationalOccupationalCredential', name: c.name })),
                    worksFor: { '@type': 'ExerciseGym', name: `${this._site.brand} ${t.branch_name ?? ''}`.trim() }
                }
            });
        });
    }

    protected initials(name: string): string {
        return name
            .split(/\s+/)
            .map(w => w[0] ?? '')
            .join('')
            .slice(0, 2);
    }
}
