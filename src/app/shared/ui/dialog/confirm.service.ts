import { ChangeDetectionStrategy, Component, inject, Injectable } from '@angular/core';
import { filter, map, Observable } from 'rxjs';

import { ButtonComponent } from '../button/button.component';
import { DialogService } from './dialog.service';
import { DIALOG_DATA, DialogRef } from './dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from './dialog-shell.component';

export interface ConfirmData {
    message: string;
    title?: string;
    /** Red confirm button, for destructive actions. */
    danger?: boolean;
    okText?: string;
    cancelText?: string;
}

@Component({
    selector: 'fm-confirm-dialog',
    imports: [DialogShellComponent, DialogFooterDirective, ButtonComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell [closable]="false" [title]="data.title ?? (data.danger ? 'Are you sure?' : 'Please confirm')">
            <p class="text-sm leading-relaxed text-fg-muted">{{ data.message }}</p>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close(false)">{{ data.cancelText ?? 'Cancel' }}</button>
                <!-- eslint-disable-next-line @angular-eslint/template/no-autofocus -->
                <button autofocus fmButton [variant]="data.danger ? 'danger' : 'primary'" (click)="ref.close(true)">
                    {{ data.okText ?? (data.danger ? 'Delete' : 'Yes') }}
                </button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class ConfirmDialogComponent {
    protected readonly data = inject<ConfirmData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}

/**
 * `this._confirm.ask(`Delete ${item.name}? This cannot be undone.`, { danger: true }).pipe(switchMap(() => …))`
 *
 * Emits only on "Yes", so it composes with switchMap. Same API as the ng-zorro version it replaces.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
    private readonly _dialog = inject(DialogService);

    ask(message: string, opts: Omit<ConfirmData, 'message'> = {}): Observable<true> {
        return this._dialog
            .open<ConfirmDialogComponent, ConfirmData, boolean>(ConfirmDialogComponent, { data: { message, ...opts }, size: 'sm', dismissible: true })
            .afterClosed.pipe(
                filter((result): result is true => result === true),
                map(() => true as const)
            );
    }
}
