import { ChangeDetectionStrategy, Component, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { FM_FIELD } from './field.component';

const noop = (): void => undefined;

/**
 * `<fm-switch formControlName="smsReminders">Send SMS reminders</fm-switch>`: an on/off control
 * (`role="switch"`, WAI-ARIA switch pattern). Space and Enter toggle it; the text is its label.
 */
@Component({
    selector: 'fm-switch',
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SwitchComponent), multi: true }],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <!-- eslint-disable-next-line @angular-eslint/template/label-has-associated-control -- the label wraps the switch button, which is labelable -->
        <label class="fm-check-label">
            <!-- eslint-disable-next-line @angular-eslint/template/elements-content -- named by the wrapping label -->
            <button
                class="fm-switch"
                type="button"
                role="switch"
                [attr.aria-checked]="checked()"
                [attr.aria-describedby]="field?.describedBy() ?? null"
                [disabled]="disabled()"
                [id]="id() ?? field?.controlId ?? null"
                (blur)="onTouched()"
                (click)="toggle()"
            ></button>
            <span><ng-content /></span>
        </label>
    `
})
export class SwitchComponent implements ControlValueAccessor {
    protected readonly field = inject(FM_FIELD, { optional: true });
    protected readonly checked = signal(false);
    protected readonly disabled = signal(false);
    private _onChange: (v: boolean) => void = noop;

    readonly id = input<string>();

    protected onTouched: () => void = noop;

    writeValue(value: unknown): void {
        this.checked.set(!!value);
    }

    registerOnChange(fn: (v: boolean) => void): void {
        this._onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(disabled: boolean): void {
        this.disabled.set(disabled);
    }

    protected toggle(): void {
        this.checked.update(v => !v);
        this._onChange(this.checked());
    }
}
