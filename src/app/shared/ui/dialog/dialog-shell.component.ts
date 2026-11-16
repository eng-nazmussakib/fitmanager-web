import { afterNextRender, booleanAttribute, ChangeDetectionStrategy, Component, Directive, ElementRef, inject, input } from '@angular/core';

import { ButtonComponent } from '../button/button.component';
import { IconComponent } from '../icon/icon.component';
import { DialogRef } from './dialog-ref';

let nextId = 0;

/**
 * The inside of a dialog opened with DialogService: title (the dialog's accessible name), close button, body,
 * and a footer for `[fmDialogFooter]` content.
 *
 *   <fm-dialog-shell title="Freeze membership">
 *     …form…
 *     <ng-container fmDialogFooter><button fmButton (click)="ref.close()">Cancel</button>…</ng-container>
 *   </fm-dialog-shell>
 */
@Component({
    selector: 'fm-dialog-shell',
    imports: [ButtonComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'flex min-h-0 flex-1 flex-col' },
    template: `
        <header class="fm-dialog-header">
            <div class="min-w-0">
                <h2 class="fm-dialog-title" [id]="titleId">{{ title() }}</h2>
                @if (description()) {
                    <p class="mt-1 text-sm text-fg-muted">{{ description() }}</p>
                }
            </div>
            @if (closable()) {
                <button class="-mt-1 -mr-2" aria-label="Close" fmButton iconOnly size="sm" variant="ghost" (click)="ref?.close()">
                    <fm-icon name="x" />
                </button>
            }
        </header>
        <div class="fm-dialog-body"><ng-content /></div>
        <footer class="fm-dialog-footer empty:hidden"><ng-content select="[fmDialogFooter]" /></footer>
    `
})
export class DialogShellComponent {
    protected readonly ref = inject(DialogRef, { optional: true });
    protected readonly titleId = `fm-dialog-title-${nextId++}`;

    readonly title = input.required<string>();
    readonly description = input<string>();
    readonly closable = input(true, { transform: booleanAttribute });

    constructor() {
        // The title names the <dialog> (its accessible name), unless the opener gave an aria-label.
        const el = inject<ElementRef<HTMLElement>>(ElementRef);
        afterNextRender(() => {
            const dialog = el.nativeElement.closest('dialog');
            if (dialog && !dialog.hasAttribute('aria-label')) dialog.setAttribute('aria-labelledby', this.titleId);
        });
    }
}

/** Marks content for the dialog footer (`<ng-container fmDialogFooter>`). */
@Directive({ selector: '[fmDialogFooter]' })
export class DialogFooterDirective {}
