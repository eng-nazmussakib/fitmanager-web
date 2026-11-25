import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideCircleCheck } from '@ng-icons/lucide';
import { finalize } from 'rxjs';

import { breadcrumbs, SeoService } from '@core/seo/seo.service';
import { revealErrors } from '@core/utils/form.utils';
import { environment } from '@env/environment';
import { ErrorMessagePipe } from '@shared/pipes/error-message.pipe';
import { AppValidators } from '@shared/validators/app.validators';

import { PublicContentService } from '../public-content.service';
import { PublicSiteService, slug } from '../public-site.service';

/**
 * `/join`: ask a branch to call back (H7). Posts to the public enquiries endpoint; the branch's front desk sees it.
 * The full online sign-up (an account and a join request, D-022) stays at /auth/sign-up. `?branch=&plan=` pre-fill it.
 */
@Component({
    selector: 'app-join-page',
    imports: [ReactiveFormsModule, RouterLink, NgIcon, ErrorMessagePipe],
    viewProviders: [provideIcons({ lucideChevronRight, lucideCircleCheck })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
        <div class="wrap max-w-2xl pt-6 lg:pt-12">
            <nav class="flex items-center gap-1.5 text-sm text-white/60" aria-label="Breadcrumb">
                <a class="hover:text-white" routerLink="/">Home</a>
                <ng-icon aria-hidden="true" name="lucideChevronRight" />
                <span aria-current="page">Join</span>
            </nav>
            <h1 class="mt-4 text-[2rem] leading-tight font-extrabold lg:text-title">Join <span class="text-primary-500">{{ brand }}</span></h1>
            <p class="mt-3 text-white/75">Leave your number and the branch will call you to book a visit and a first session with a trainer. Prefer to sign up yourself? <a class="underline hover:text-white" routerLink="/auth/sign-up">Create an account</a>.</p>

            @if (done(); as message) {
                <div class="mt-8 flex gap-3 rounded-lg bg-ink-800 p-5" role="status">
                    <ng-icon class="shrink-0 text-2xl text-primary-400" aria-hidden="true" name="lucideCircleCheck" />
                    <div>
                        <p class="font-semibold">Request received</p>
                        <p class="mt-1 text-white/75">{{ message }}</p>
                    </div>
                </div>
            } @else {
                <form class="mt-8 grid gap-5 rounded-lg bg-ink-800 p-5 sm:p-6" novalidate [formGroup]="form" (ngSubmit)="submit()">
                    <label class="grid gap-1.5 text-sm font-medium">
                        Branch
                        <select class="join-input" formControlName="branch">
                            @for (b of branches; track b.slug) {
                                <option [value]="b.slug">{{ b.name }}</option>
                            }
                        </select>
                    </label>
                    <label class="grid gap-1.5 text-sm font-medium">
                        Your name
                        <input class="join-input" autocomplete="name" formControlName="name" [attr.aria-invalid]="invalid('name')" />
                        @if (invalid('name')) {
                            <span class="text-xs text-primary-300">{{ form.controls.name.errors | errorMessage }}</span>
                        }
                    </label>
                    <label class="grid gap-1.5 text-sm font-medium">
                        Mobile number
                        <input class="join-input" autocomplete="tel" formControlName="phone" inputmode="tel" placeholder="01XXXXXXXXX" [attr.aria-invalid]="invalid('phone')" />
                        @if (invalid('phone')) {
                            <span class="text-xs text-primary-300">{{ form.controls.phone.errors | errorMessage }}</span>
                        }
                    </label>
                    <label class="grid gap-1.5 text-sm font-medium">
                        Message <span class="font-normal text-white/50">(optional)</span>
                        <textarea class="join-input min-h-24 py-2" formControlName="message"></textarea>
                    </label>
                    <button class="btn btn-lg btn-fill-primary" type="submit" [disabled]="sending()">{{ sending() ? 'Sending…' : 'Ask for a call' }}</button>
                </form>
            }
        </div>
    `,
    styles: `
        .join-input {
            height: 2.875rem;
            padding: 0 0.9rem;
            border: 1px solid rgb(255 255 255 / 14%);
            border-radius: 0.75rem;
            background: var(--color-ink-900);
            color: #fff;
            font-weight: 400;
        }
        .join-input:focus-visible {
            outline: 2px solid #fff;
            outline-offset: 2px;
        }
        .join-input[aria-invalid='true'] {
            border-color: var(--color-primary-400);
        }
    `
})
export class JoinPageComponent implements OnInit {
    private readonly _content = inject(PublicContentService);
    private readonly _site = inject(PublicSiteService);

    readonly branch = input<string>();
    readonly plan = input<string>();

    protected readonly brand = this._site.brand;
    protected readonly branches = this._site.c.branches.items.map(b => ({ name: b.name, slug: slug(b.name) }));
    protected readonly sending = signal(false);
    protected readonly done = signal<string | null>(null);
    protected readonly form = inject(NonNullableFormBuilder).group({
        branch: [this.branches[0]?.slug ?? ''],
        name: ['', [Validators.required, Validators.minLength(3)]],
        phone: ['', [Validators.required, AppValidators.bdMobile]],
        message: ['']
    });

    constructor() {
        inject(SeoService).update({
            path: '/join',
            title: `Join ${this.brand}`,
            description: `Ask a ${this.brand} branch to call you back about membership, a visit or a first session.`,
            jsonLd: {
                '@context': 'https://schema.org',
                ...breadcrumbs([
                    ['Home', `${environment.siteUrl}/`],
                    ['Join', `${environment.siteUrl}/join`]
                ])
            }
        });
    }

    /** `?branch=&plan=` from a branch or plans page (query params arrive as inputs). */
    ngOnInit(): void {
        const b = this.branch();
        if (b && this.branches.some(x => x.slug === b)) this.form.controls.branch.setValue(b);
        if (this.plan()) this.form.controls.message.setValue(`I am interested in the ${this.plan()} plan.`);
    }

    protected invalid(name: 'name' | 'phone'): boolean {
        const c = this.form.controls[name];
        return c.invalid && (c.touched || c.dirty);
    }

    protected submit(): void {
        if (this.form.invalid) {
            revealErrors(this.form);
            return;
        }
        this.sending.set(true);
        this._content
            .enquire(this.form.getRawValue())
            .pipe(finalize(() => this.sending.set(false)))
            .subscribe({ next: message => this.done.set(message), error: () => undefined });
    }
}
