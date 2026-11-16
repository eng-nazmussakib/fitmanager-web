import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideCircleCheck } from '@ng-icons/lucide';

import { TenantService } from '@core/tenant/tenant.service';
import { LogoComponent } from '@shared/components/logo/logo.component';

/**
 * Frame of the sign-in and sign-up pages: on wide screens a brand panel on the left (photo, heading, selling points,
 * from the config's `auth`), and the form on the right with a way back to the public site. Always dark, like the site.
 */
@Component({
    selector: 'app-auth-shell',
    imports: [RouterLink, NgIcon, LogoComponent],
    viewProviders: [provideIcons({ lucideArrowLeft, lucideCircleCheck })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    styles: `
        .auth-panel {
            background:
                radial-gradient(40rem 30rem at 85% 75%, color-mix(in srgb, var(--color-primary-500) 35%, transparent), transparent 70%),
                radial-gradient(30rem 25rem at 0% 0%, color-mix(in srgb, var(--color-secondary-500) 22%, transparent), transparent 70%), var(--color-ink-950);
        }
        .auth-panel-inner {
            position: sticky;
            top: 0;
            height: 100dvh;
            min-height: 36rem;
        }
        .auth-photo {
            position: relative;
            width: min(100%, 22rem, 42dvh);
            margin-inline: auto;
            aspect-ratio: 610 / 670;
            -webkit-mask: radial-gradient(closest-side, #000 82%, transparent);
            mask: radial-gradient(closest-side, #000 82%, transparent);
        }
        .auth-photo img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
    `,
    template: `
        <div class="auth brand-backdrop min-h-dvh text-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <aside class="auth-panel hidden lg:block" aria-label="About {{ brandName }}">
                <div class="auth-panel-inner flex flex-col px-12 py-10 xl:px-16">
                    <app-logo [tagline]="true" />
                    @if (panel; as p) {
                        <div class="flex flex-1 flex-col justify-center gap-8 py-8">
                            <div>
                                <p class="text-4xl leading-tight font-extrabold xl:text-5xl">
                                    {{ p.title }}
                                    @if (p.accent) {
                                        <span class="block text-primary-500">{{ p.accent }}</span>
                                    }
                                </p>
                                <p class="mt-4 max-w-md leading-relaxed text-white/75">{{ p.text }}</p>
                                @if (p.points?.length) {
                                    <ul class="mt-6 space-y-2.5 text-sm text-white/85">
                                        @for (point of p.points; track point) {
                                            <li class="flex items-center gap-2.5">
                                                <ng-icon class="shrink-0 text-primary-400" name="lucideCircleCheck" aria-hidden="true" size="1.15rem" />
                                                {{ point }}
                                            </li>
                                        }
                                    </ul>
                                }
                            </div>
                            @if (p.image; as img) {
                                <div class="auth-photo">
                                    <img fetchpriority="high" height="670" width="610" [alt]="img.alt" [src]="img.src" />
                                    @if (img.tint) {
                                        <span class="photo-tint" [style.--tint-mask]="'url(' + img.tint + ')'"></span>
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>
            </aside>

            <main class="flex min-h-dvh flex-col px-4 py-6 sm:px-8 lg:px-12">
                <div class="flex items-center justify-between gap-4">
                    <app-logo class="lg:invisible" size="sm" />
                    @if (hasSite) {
                        <a class="flex items-center gap-1.5 text-sm text-white/70 transition hover:text-white" routerLink="/">
                            <ng-icon name="lucideArrowLeft" aria-hidden="true" />
                            Back to site
                        </a>
                    }
                </div>

                <div class="m-auto w-full max-w-md animate-fade-in-up py-10" [class.max-w-xl]="wide()">
                    <h1 class="text-[1.75rem] leading-tight font-bold lg:text-[2rem]">{{ heading() }}</h1>
                    @if (lead()) {
                        <p class="mt-2 text-white/65">{{ lead() }}</p>
                    }
                    <div class="mt-8">
                        <ng-content />
                    </div>
                </div>

                <p class="text-center text-xs text-white/45">
                    © {{ year }} {{ brandName }}
                    @if (poweredBy) {
                        · Powered by
                        <span class="font-medium text-white/70">{{ poweredBy.name }}</span>
                    }
                </p>
            </main>
        </div>
    `
})
export class AuthShellComponent {
    private readonly _tenant = inject(TenantService);

    /** The page's h1. */
    readonly heading = input.required<string>();
    readonly lead = input<string>();
    /** A wider form column (sign-up). */
    readonly wide = input(false);

    protected readonly brandName = this._tenant.name;
    protected readonly panel = this._tenant.config.auth;
    protected readonly poweredBy = this._tenant.config.poweredBy;
    protected readonly hasSite = !!this._tenant.config.landing;
    protected readonly year = new Date().getFullYear();
}
