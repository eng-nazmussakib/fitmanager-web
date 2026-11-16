import {
    booleanAttribute,
    ChangeDetectionStrategy,
    Component,
    computed,
    contentChild,
    Directive,
    effect,
    inject,
    InjectionToken,
    input,
    signal
} from '@angular/core';
import { NgControl } from '@angular/forms';

import { ErrorMessagePipe } from '@shared/pipes/error-message.pipe';

let nextId = 0;

/** What a control inside `<fm-field>` reads to wire up its id, description and invalid state. */
export interface FieldContext {
    readonly controlId: string;
    /** `aria-describedby` for the control: the error when shown, else the hint. */
    describedBy(): string | null;
    invalid(): boolean;
}

export const FM_FIELD = new InjectionToken<FieldContext>('FM_FIELD');

const errorText = new ErrorMessagePipe();

/**
 * Label, control, hint and error, wired for accessibility (`for`/`id`, `aria-describedby`, `aria-invalid`).
 *
 *   <fm-field label="Phone" hint="01XXXXXXXXX" required>
 *     <input fmInput formControlName="phone" inputmode="tel" />
 *   </fm-field>
 *
 * The error appears once the control is touched or dirty, with the text from the `errorMessage` pipe (one message
 * per validator, in one place); `error` overrides it. `[fmPrefix]` / `[fmSuffix]` content sits inside the input box.
 */
@Component({
    selector: 'fm-field',
    providers: [{ provide: FM_FIELD, useExisting: FieldComponent }],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'fm-field' },
    template: `
        @if (label()) {
            <label class="fm-label" [attr.for]="controlId">
                {{ label() }}
                @if (required()) {
                    <span class="fm-required" aria-hidden="true">*</span>
                }
            </label>
        }
        <div class="fm-control">
            <ng-content select="[fmPrefix]" />
            <ng-content />
            <ng-content select="[fmSuffix]" />
        </div>
        @if (message()) {
            <p class="fm-error" [id]="errorId">{{ message() }}</p>
        } @else if (hint()) {
            <p class="fm-hint" [id]="hintId">{{ hint() }}</p>
        }
    `
})
export class FieldComponent implements FieldContext {
    private readonly _ngControl = contentChild(NgControl, { descendants: true });
    /** NgControl state is not a signal: bump this on every control event, so `message` recomputes. */
    private readonly _tick = signal(0);

    readonly label = input<string>();
    readonly hint = input<string>();
    readonly error = input<string | null>();
    readonly required = input(false, { transform: booleanAttribute });

    readonly controlId = `fm-field-${nextId++}`;
    protected readonly hintId = `${this.controlId}-hint`;
    protected readonly errorId = `${this.controlId}-error`;

    protected readonly message = computed(() => {
        this._tick();
        const explicit = this.error();
        if (explicit) return explicit;
        const c = this._ngControl();
        if (!c?.invalid || !(c.touched || c.dirty)) return '';
        return errorText.transform(c.errors);
    });

    constructor() {
        effect(onCleanup => {
            const control = this._ngControl()?.control;
            if (!control) return;
            const sub = control.events.subscribe(() => this._tick.update(v => v + 1));
            onCleanup(() => sub.unsubscribe());
        });
    }

    describedBy(): string | null {
        return this.message() ? this.errorId : this.hint() ? this.hintId : null;
    }

    invalid(): boolean {
        return !!this.message();
    }
}

/** Content shown inside the left of the input box (an icon, `+880`). */
@Directive({ selector: '[fmPrefix]', host: { class: 'fm-prefix' } })
export class PrefixDirective {}

/** Content shown inside the right of the input box (a clear button, a unit). */
@Directive({ selector: '[fmSuffix]', host: { class: 'fm-suffix' } })
export class SuffixDirective {}

/**
 * `<input fmInput>` / `<textarea fmInput>`: the kit's text field. Inside `<fm-field>` it takes the field's id,
 * description and invalid state. `size="lg"` for the check-in search.
 */
@Directive({
    selector: 'input[fmInput], textarea[fmInput]',
    host: {
        '[class]': '"fm-input" + (size() === "lg" ? " fm-input-lg" : "")',
        '[id]': 'id() ?? field?.controlId ?? null',
        '[attr.aria-describedby]': 'field?.describedBy() ?? null',
        '[attr.aria-invalid]': 'field?.invalid() ? "true" : null'
    }
})
export class InputDirective {
    protected readonly field = inject(FM_FIELD, { optional: true });

    readonly id = input<string>();
    readonly size = input<'md' | 'lg'>('md');
}

/** `<input type="checkbox" fmCheck>` or `type="radio"`: native, restyled. Wrap it with its text in `<label class="fm-check-label">`. */
@Directive({
    selector: 'input[type=checkbox][fmCheck], input[type=radio][fmCheck]',
    host: { class: 'fm-check', '[indeterminate]': 'indeterminate()' }
})
export class CheckDirective {
    readonly indeterminate = input(false, { transform: booleanAttribute });
}
