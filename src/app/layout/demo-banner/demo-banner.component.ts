import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, inject, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { API } from '@core/constants/api-endpoints';
import { ApiService } from '@core/http/api.service';
import { ConfirmService } from '@shared/ui/dialog/confirm.service';
import { IconComponent } from '@shared/ui/icon/icon.component';

/**
 * Shown on every page of the demo build (`environment.demo`): says the data is demo data, and offers Switch role,
 * Reset data (back to the seed) and Fast mode (almost no artificial latency, for live presentations).
 * English only (D-015), so there is no language switch.
 */
@Component({
    selector: 'app-demo-banner',
    imports: [RouterLink, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'do-not-print block' },
    template: `
        <div
            class="relative z-[var(--z-toast)] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-secondary-500 px-3 py-1.5 text-xs font-medium text-white"
            aria-label="Demo mode"
            role="region"
        >
            <span class="flex items-center gap-1.5">
                <fm-icon name="sparkles" size="0.875rem" />
                Demo mode: sample data, and changes stay in this browser.
            </span>
            <a class="flex items-center gap-1 underline-offset-2 hover:underline" routerLink="/demo">
                <fm-icon name="users" size="0.875rem" />
                Switch role
            </a>
            <button class="flex items-center gap-1 underline-offset-2 hover:underline" type="button" (click)="reset()">
                <fm-icon name="refresh-cw" size="0.875rem" />
                Reset data
            </button>
            <button class="flex items-center gap-1 underline-offset-2 hover:underline" type="button" [attr.aria-pressed]="fast()" (click)="toggleFast()">
                <fm-icon name="zap" size="0.875rem" />
                Fast mode {{ fast() ? 'on' : 'off' }}
            </button>
        </div>
    `
})
export class DemoBannerComponent {
    private readonly _api = inject(ApiService);
    private readonly _confirm = inject(ConfirmService);
    private readonly _document = inject(DOCUMENT);

    protected readonly fast = signal(false);

    constructor() {
        if (isPlatformBrowser(inject(PLATFORM_ID)))
            this._api.get<{ fast: boolean }>(API.DEMO.SETTINGS, undefined, { notify: 'none' }).subscribe(s => this.fast.set(s.fast));
    }

    protected toggleFast(): void {
        this._api.put<{ fast: boolean }>(API.DEMO.SETTINGS, { fast: !this.fast() }, { notify: 'none' }).subscribe(s => this.fast.set(s.fast));
    }

    protected reset(): void {
        this._confirm
            .ask('Every sale, check-in and booking made in this demo is removed and the sample data comes back.', {
                title: 'Reset demo data?',
                okText: 'Reset'
            })
            .subscribe(() => {
                this._api.post(API.DEMO.RESET, {}, { notify: 'none' }).subscribe(() => this._document.defaultView?.location.reload());
            });
    }
}
