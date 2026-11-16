import { booleanAttribute, ChangeDetectionStrategy, Component, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { FM_FIELD } from './field.component';

const noop = (): void => undefined;

const lakh = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** "৳ 1,25,000.50" or "1,25,000" → 125000.5; anything without a digit → null. */
export function parseAmount(text: string): number | null {
    const cleaned = text.replace(/[^\d.-]/g, '');
    if (!/\d/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

/**
 * `<fm-number-input formControlName="amount" taka />`: a numeric field with a decimal keyboard on phones. While
 * focused it shows the plain number; on blur it is grouped the Bangladeshi way (1,25,000) with `৳` when `taka`.
 * The form value is a number or null. Amounts are display only: totals come from the API (no float maths in the UI).
 */
@Component({
    selector: 'fm-number-input',
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => NumberInputComponent), multi: true }],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'contents' },
    template: `
        <input
            class="fm-input"
            type="text"
            autocomplete="off"
            inputmode="decimal"
            [attr.aria-describedby]="field?.describedBy() ?? null"
            [attr.aria-invalid]="field?.invalid() ? 'true' : null"
            [attr.placeholder]="placeholder() || null"
            [class.text-right]="alignEnd()"
            [disabled]="disabled()"
            [id]="id() ?? field?.controlId ?? null"
            [value]="display()"
            (blur)="onBlur()"
            (focus)="focused.set(true)"
            (input)="onInput($event)"
        />
    `
})
export class NumberInputComponent implements ControlValueAccessor {
    protected readonly field = inject(FM_FIELD, { optional: true });
    protected readonly focused = signal(false);
    protected readonly disabled = signal(false);
    private readonly _value = signal<number | null>(null);
    private readonly _raw = signal('');
    private _onChange: (v: number | null) => void = noop;
    private _onTouched: () => void = noop;

    readonly id = input<string>();
    readonly placeholder = input('');
    readonly taka = input(false, { transform: booleanAttribute });
    readonly alignEnd = input(false, { transform: booleanAttribute });
    readonly min = input<number>();
    readonly max = input<number>();

    protected readonly display = computed(() => {
        if (this.focused()) return this._raw();
        const v = this._value();
        if (v === null) return '';
        return `${this.taka() ? '৳ ' : ''}${lakh.format(v)}`;
    });

    writeValue(value: unknown): void {
        const n = value === null || value === undefined || value === '' ? null : Number(value);
        this._value.set(n !== null && Number.isFinite(n) ? n : null);
        this._raw.set(this._value() === null ? '' : String(this._value()));
    }

    registerOnChange(fn: (v: number | null) => void): void {
        this._onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this._onTouched = fn;
    }

    setDisabledState(disabled: boolean): void {
        this.disabled.set(disabled);
    }

    protected onInput(event: Event): void {
        const text = (event.target as HTMLInputElement).value;
        this._raw.set(text);
        const n = parseAmount(text);
        this._value.set(n);
        this._onChange(n);
    }

    protected onBlur(): void {
        let n = this._value();
        if (n !== null) {
            const min = this.min();
            const max = this.max();
            if (min !== undefined && n < min) n = min;
            if (max !== undefined && n > max) n = max;
            if (n !== this._value()) {
                this._value.set(n);
                this._onChange(n);
            }
        }
        this._raw.set(n === null ? '' : String(n));
        this.focused.set(false);
        this._onTouched();
    }
}
