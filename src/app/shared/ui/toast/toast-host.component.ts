import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, PLATFORM_ID, viewChild } from '@angular/core';

import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icons';
import { ToastService, ToastTone } from './toast.service';

const ICONS: Record<ToastTone, IconName> = { info: 'info', success: 'circle-check', warning: 'triangle-alert', danger: 'circle-alert' };

/**
 * Renders the ToastService queue. One `popover="manual"` region in the top layer, so toasts show above modal
 * dialogs too; it is re-shown on each new toast to move it to the top of the layer stack. The list is a live
 * region: polite for info and success, assertive (`role="alert"`) for errors.
 */
@Component({
    selector: 'fm-toast-host',
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section #region class="fm-toast-region" aria-label="Notifications" popover="manual">
            <ol>
                @for (toast of toasts.toasts(); track toast.id) {
                    <li
                        [attr.role]="toast.tone === 'danger' ? 'alert' : 'status'"
                        [class]="'fm-toast fm-toast-' + toast.tone"
                        (focusin)="toasts.pause(toast.id)"
                        (focusout)="toasts.resume(toast.id)"
                        (mouseenter)="toasts.pause(toast.id)"
                        (mouseleave)="toasts.resume(toast.id)"
                    >
                        <fm-icon [name]="icons[toast.tone]" />
                        <div class="min-w-0 flex-1">
                            @if (toast.title) {
                                <p class="font-semibold">{{ toast.title }}</p>
                            }
                            <p class="text-fg-muted">{{ toast.message }}</p>
                        </div>
                        <button
                            class="fm-btn fm-btn-ghost fm-btn-sm fm-btn-icon -my-1"
                            type="button"
                            aria-label="Dismiss notification"
                            (click)="toasts.dismiss(toast.id)"
                        >
                            <fm-icon name="x" size="1rem" />
                        </button>
                    </li>
                }
            </ol>
        </section>
    `
})
export class ToastHostComponent {
    private readonly _region = viewChild.required<ElementRef<HTMLElement>>('region');
    private readonly _browser = isPlatformBrowser(inject(PLATFORM_ID));

    protected readonly toasts = inject(ToastService);
    protected readonly icons = ICONS;

    constructor() {
        effect(() => {
            const count = this.toasts.toasts().length;
            const el = this._region().nativeElement as HTMLElement & { showPopover?: () => void; hidePopover?: () => void };
            if (!this._browser || !el.showPopover) return;
            // Re-show to come above any dialog opened since; hide when empty so it never blocks clicks.
            if (el.matches(':popover-open')) el.hidePopover?.();
            if (count) el.showPopover();
        });
    }
}
