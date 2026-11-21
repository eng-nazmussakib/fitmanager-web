import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';

export interface TextPromptData {
    title: string;
    description?: string;
    label: string;
    okText: string;
    /** Shorter text is refused before sending (the API's minimum). */
    minLength: number;
    danger?: boolean;
    /** Two answers instead of one (an appeal: uphold or reject). */
    choices?: { value: string; label: string; danger?: boolean }[];
}

export interface TextPromptResult {
    text: string;
    choice: string | null;
}

/** One line of text for an action that needs a reason: lifting a ban, deciding an appeal, escalating, appealing. */
@Component({
    selector: 'app-text-prompt-dialog',
    imports: [FormsModule, ButtonComponent, DialogShellComponent, DialogFooterDirective, FieldComponent, InputDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell [description]="data.description ?? ''" [title]="data.title">
            <fm-field required [hint]="'At least ' + data.minLength + ' characters.'" [label]="data.label">
                <textarea fmInput maxlength="2000" rows="3" [(ngModel)]="text"></textarea>
            </fm-field>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                @if (data.choices) {
                    @for (c of data.choices; track c.value) {
                        <button fmButton [disabled]="text.trim().length < data.minLength" [variant]="c.danger ? 'danger' : 'primary'" (click)="done(c.value)">
                            {{ c.label }}
                        </button>
                    }
                } @else {
                    <button fmButton [disabled]="text.trim().length < data.minLength" [variant]="data.danger ? 'danger' : 'primary'" (click)="done(null)">
                        {{ data.okText }}
                    </button>
                }
            </ng-container>
        </fm-dialog-shell>
    `
})
export class TextPromptDialogComponent {
    protected readonly data = inject<TextPromptData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<TextPromptResult>>(DialogRef);
    protected text = '';
    protected readonly busy = signal(false);

    protected done(choice: string | null): void {
        this.ref.close({ text: this.text.trim(), choice });
    }
}
