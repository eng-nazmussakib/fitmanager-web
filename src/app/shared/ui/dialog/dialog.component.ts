import { isPlatformBrowser } from '@angular/common';
import {
    booleanAttribute,
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    effect,
    ElementRef,
    inject,
    input,
    model,
    PLATFORM_ID,
    viewChild
} from '@angular/core';

import { ButtonComponent } from '../button/button.component';
import { IconComponent } from '../icon/icon.component';
import type { DialogSize } from './dialog.service';

let nextId = 0;

/**
 * A modal dialog or drawer written in the template, opened with a signal:
 *
 *   <fm-dialog title="Session" size="drawer" [(open)]="drawerOpen">…<div fmDialogFooter>…</div></fm-dialog>
 *
 * Same native `<dialog>` as DialogService (focus trap, Esc, top layer). Closing by any means sets `open` to false,
 * and focus goes back to where it was. The content is only rendered while open.
 */
@Component({
    selector: 'fm-dialog',
    imports: [ButtonComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -- the click is the backdrop; Esc closes natively -->
        <dialog
            #dialog
            [attr.aria-labelledby]="titleId"
            [class]="'fm-dialog' + (size() === 'md' ? '' : ' fm-dialog-' + size())"
            (cancel)="onCancel($event)"
            (click)="onBackdrop($event)"
            (close)="open.set(false)"
        >
            @if (open()) {
                <header class="fm-dialog-header">
                    <div class="min-w-0">
                        <h2 class="fm-dialog-title" [id]="titleId">{{ title() }}</h2>
                        @if (description()) {
                            <p class="mt-1 text-sm text-fg-muted">{{ description() }}</p>
                        }
                    </div>
                    <button class="-mt-1 -mr-2" aria-label="Close" fmButton iconOnly size="sm" variant="ghost" (click)="open.set(false)">
                        <fm-icon name="x" />
                    </button>
                </header>
                <div class="fm-dialog-body"><ng-content /></div>
                <footer class="fm-dialog-footer empty:hidden"><ng-content select="[fmDialogFooter]" /></footer>
            }
        </dialog>
    `
})
export class DialogComponent {
    private readonly _dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
    private readonly _document = inject(DOCUMENT);
    private readonly _browser = isPlatformBrowser(inject(PLATFORM_ID));
    private _returnFocus: HTMLElement | null = null;

    readonly open = model(false);
    readonly title = input.required<string>();
    readonly description = input<string>();
    readonly size = input<DialogSize>('md');
    readonly dismissible = input(true, { transform: booleanAttribute });

    protected readonly titleId = `fm-dlg-${nextId++}`;

    constructor() {
        effect(() => {
            const open = this.open();
            const el = this._dialog().nativeElement;
            if (!this._browser) return;
            if (open && !el.open) {
                this._returnFocus = this._document.activeElement as HTMLElement | null;
                el.showModal();
            } else if (!open && el.open) {
                el.close();
            }
            if (!open && this._returnFocus?.isConnected) {
                this._returnFocus.focus();
                this._returnFocus = null;
            }
        });
    }

    protected onCancel(event: Event): void {
        if (!this.dismissible()) event.preventDefault();
    }

    protected onBackdrop(event: MouseEvent): void {
        const el = this._dialog().nativeElement;
        if (!this.dismissible() || event.target !== el) return;
        const r = el.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.open.set(false);
    }
}
