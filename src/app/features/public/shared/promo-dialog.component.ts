import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideClock, lucideGift, lucideX } from '@ng-icons/lucide';

import { STORAGE_KEYS } from '@core/constants/app.constants';
import { StorageService } from '@core/services/storage.service';

import { PublicSiteService } from '../public-site.service';

const DAY_MS = 86_400_000;

/**
 * The offer pop-up on the landing page (`landing.promo` in the brand config). Opens a moment after the page does,
 * in the browser only. Closing it (button, Escape, a click outside) hides that offer for `snoozeDays`; a new offer
 * (another `id`) shows again. Its buttons close it too. A native modal <dialog>: focus stays inside while it is open.
 */
@Component({
    selector: 'app-promo-dialog',
    imports: [RouterLink, NgIcon],
    viewProviders: [provideIcons({ lucideClock, lucideGift, lucideX })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: `
        .promo {
            width: min(46rem, 100vw - 2rem);
            max-width: none;
            max-height: calc(100dvh - 2rem);
            margin: auto;
            padding: 0;
            overflow: auto;
            border: 1px solid color-mix(in srgb, var(--color-primary-500) 45%, transparent);
            border-radius: 1rem;
            background: var(--color-ink-900);
            box-shadow: var(--shadow-e6);
            color: #fff;
        }
        .promo::backdrop {
            background: rgb(0 0 0 / 70%);
            backdrop-filter: blur(3px);
        }
        .promo-art {
            position: relative;
            min-height: 11rem;
            background: var(--color-ink-800);
        }
        .promo-art img {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .promo-art::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(180deg, transparent 50%, var(--color-ink-900));
        }
        .promo-close {
            position: absolute;
            top: 0.75rem;
            right: 0.75rem;
            z-index: 2;
            display: flex;
            width: 2.25rem;
            height: 2.25rem;
            align-items: center;
            justify-content: center;
            border-radius: 9999px;
            background: rgb(0 0 0 / 55%);
            color: #fff;
            cursor: pointer;
        }
        .promo-close:hover {
            background: var(--color-primary-500);
        }
        @media (width >= 40rem) {
            .promo-body {
                display: grid;
                grid-template-columns: 0.9fr 1.1fr;
            }
            .promo-art::after {
                background: linear-gradient(90deg, transparent 55%, var(--color-ink-900));
            }
        }
        @media (prefers-reduced-motion: no-preference) {
            .promo[open] {
                animation: promo-in 0.35s cubic-bezier(0.2, 0.7, 0.2, 1);
            }
        }
        @keyframes promo-in {
            from {
                opacity: 0;
                transform: translateY(1rem) scale(0.97);
            }
        }
    `,
    template: `
        @if (promo; as p) {
            <dialog #dialog class="promo" aria-labelledby="promo-title" tabindex="-1" (click)="onBackdrop($event)" (close)="snooze()" (keydown.escape)="close()">
                <div class="promo-body">
                    <div class="promo-art">
                        @if (p.image; as img) {
                            <img alt="" [src]="img.src" />
                            @if (img.tint) {
                                <span class="photo-tint" [style.--tint-mask]="'url(' + img.tint + ')'"></span>
                            }
                        }
                    </div>
                    <div class="relative p-6 sm:p-8">
                        @if (p.badge) {
                            <p class="tag w-fit gap-1.5">
                                <ng-icon aria-hidden="true" name="lucideGift" />
                                {{ p.badge }}
                            </p>
                        }
                        <h2 id="promo-title" class="mt-4 text-3xl leading-tight font-extrabold sm:text-4xl">
                            {{ p.title }}
                            @if (p.accent) {
                                <span class="text-primary-500">{{ p.accent }}</span>
                            }
                        </h2>
                        <p class="mt-3 text-sm leading-relaxed text-white/80">{{ p.text }}</p>
                        @if (p.note) {
                            <p class="mt-3 flex items-center gap-1.5 text-xs text-white/55">
                                <ng-icon aria-hidden="true" name="lucideClock" />
                                {{ p.note }}
                            </p>
                        }
                        <div class="mt-6 flex flex-col gap-3 sm:flex-row">
                            <a class="btn btn-lg btn-fill-primary sm:flex-1" [fragment]="site.target(p.cta).fragment" [routerLink]="site.target(p.cta).route" (click)="close()">
                                {{ p.cta.label }}
                            </a>
                            @if (p.secondary; as s) {
                                <a class="btn btn-lg btn-outline-secondary sm:flex-1" [fragment]="site.target(s).fragment" [routerLink]="site.target(s).route" (click)="close()">
                                    {{ s.label }}
                                </a>
                            }
                        </div>
                    </div>
                </div>
                <button class="promo-close" type="button" aria-label="Close offer" (click)="close()">
                    <ng-icon aria-hidden="true" name="lucideX" size="1.15rem" />
                </button>
            </dialog>
        }
    `
})
export class PromoDialogComponent {
    private readonly _storage = inject(StorageService);
    private readonly _dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

    protected readonly site = inject(PublicSiteService);
    protected readonly promo = this.site.c.promo;

    constructor() {
        const destroyRef = inject(DestroyRef);
        afterNextRender(() => {
            const p = this.promo;
            if (!p || this._snoozed(p.id)) return;
            const timer = setTimeout(() => {
                const dialog = this._dialog()?.nativeElement;
                if (!dialog || dialog.open) return;
                dialog.showModal();
                // Focus the dialog itself, not its first button (no focus ring on "Claim Offer" before any key press).
                dialog.focus();
            }, (p.delaySeconds ?? 2.5) * 1000);
            destroyRef.onDestroy(() => clearTimeout(timer));
        });
    }

    protected close(): void {
        this._dialog()?.nativeElement.close();
    }

    /** Any close (button, Escape, backdrop, a link): hide this offer for a few days. */
    protected snooze(): void {
        if (!this.promo) return;
        this._storage.set(STORAGE_KEYS.PROMO, { id: this.promo.id, until: Date.now() + (this.promo.snoozeDays ?? 3) * DAY_MS });
    }

    protected onBackdrop(event: MouseEvent): void {
        if (event.target === this._dialog()?.nativeElement) this.close();
    }

    private _snoozed(id: string): boolean {
        const saved = this._storage.get<{ id: string; until: number }>(STORAGE_KEYS.PROMO);
        return !!saved && saved.id === id && saved.until > Date.now();
    }
}
