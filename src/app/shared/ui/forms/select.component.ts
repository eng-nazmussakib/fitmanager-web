import { isPlatformBrowser } from '@angular/common';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    forwardRef,
    inject,
    input,
    OnDestroy,
    PLATFORM_ID,
    signal,
    viewChild
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { anchorPosition } from '../a11y/anchor-position';
import { RovingFocusDirective } from '../a11y/roving-focus.directive';
import { IconComponent } from '../icon/icon.component';
import { FM_FIELD } from './field.component';

const noop = (): void => undefined;

export interface SelectOption<T> {
    value: T;
    label: string;
    disabled?: boolean;
    /** Second line, smaller. */
    description?: string;
}

let nextId = 0;

type PopoverElement = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

/**
 * `<fm-select formControlName="plan" [options]="plans" placeholder="Choose a plan" />`: a single choice from a
 * list. Replaces nz-select.
 *
 * The trigger is a button (`aria-haspopup="listbox"`); the list is a `popover="auto"` listbox in the top layer
 * (light dismiss and Esc for free), positioned under the trigger. Keyboard: ↓/↑/Enter/Space open it on the
 * selected option; arrows, Home/End and typing a letter move; Enter or Space picks; Esc or Tab closes and focus
 * returns to the trigger. On a closed trigger, ↓/↑ do not change the value (no accidental changes while tabbing).
 */
@Component({
    selector: 'fm-select',
    imports: [IconComponent, RovingFocusDirective],
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectComponent), multi: true }],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block w-full' },
    template: `
        <button
            #trigger
            class="fm-input fm-select-trigger"
            type="button"
            aria-haspopup="listbox"
            [attr.aria-controls]="listId"
            [attr.aria-describedby]="field?.describedBy() ?? null"
            [attr.aria-expanded]="open()"
            [attr.aria-invalid]="field?.invalid() ? 'true' : null"
            [attr.aria-label]="ariaLabel() || null"
            [disabled]="disabled()"
            [id]="id() ?? field?.controlId ?? null"
            (blur)="onTouched()"
            (click)="toggle()"
            (keydown)="onTriggerKey($event)"
        >
            @if (selected(); as option) {
                <span>{{ option.label }}</span>
            } @else {
                <span class="fm-placeholder">{{ placeholder() }}</span>
            }
            <fm-icon class="text-fg-subtle" name="chevrons-up-down" size="1rem" />
        </button>
        <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -- keys are handled for the focusable options inside -->
        <div
            #list
            class="fm-popover"
            fmRovingFocus
            popover="auto"
            role="listbox"
            [attr.aria-label]="ariaLabel() || placeholder() || null"
            [id]="listId"
            (keydown)="onListKey($event)"
            (toggle)="onToggle($event)"
        >
            @for (option of options(); track $index) {
                <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -- Enter and Space are handled by the listbox (onListKey) -->
                <div
                    class="fm-option"
                    role="option"
                    tabindex="-1"
                    [attr.aria-disabled]="option.disabled ? 'true' : null"
                    [attr.aria-selected]="isSelected(option)"
                    (click)="pick(option)"
                >
                    <span class="min-w-0 flex-1">
                        <span class="block truncate">{{ option.label }}</span>
                        @if (option.description) {
                            <span class="block truncate text-xs text-fg-subtle">{{ option.description }}</span>
                        }
                    </span>
                    @if (isSelected(option)) {
                        <fm-icon name="check" size="1rem" />
                    }
                </div>
            } @empty {
                <p class="px-3 py-2 text-sm text-fg-subtle">No options</p>
            }
        </div>
    `
})
export class SelectComponent<T> implements ControlValueAccessor, OnDestroy {
    private readonly _trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
    private readonly _list = viewChild.required<ElementRef<PopoverElement>>('list');
    private readonly _roving = viewChild.required(RovingFocusDirective);
    private readonly _browser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly _value = signal<T | null>(null);
    private _unanchor: (() => void) | null = null;
    private _supported = false;
    private _onChange: (v: T | null) => void = noop;

    protected readonly field = inject(FM_FIELD, { optional: true });
    protected readonly open = signal(false);
    protected readonly disabled = signal(false);
    protected readonly listId = `fm-select-list-${nextId++}`;

    readonly options = input<SelectOption<T>[]>([]);
    readonly placeholder = input('Select…');
    readonly id = input<string>();
    readonly ariaLabel = input<string>();
    readonly compareWith = input<(a: T | null, b: T | null) => boolean>((a, b) => a === b);

    protected readonly selected = computed(() => this.options().find(o => this.compareWith()(o.value, this._value())) ?? null);

    protected onTouched: () => void = noop;

    constructor() {
        afterNextRender(() => (this._supported = typeof this._list().nativeElement.showPopover === 'function'));
    }

    writeValue(value: T | null): void {
        this._value.set(value ?? null);
    }

    registerOnChange(fn: (v: T | null) => void): void {
        this._onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(disabled: boolean): void {
        this.disabled.set(disabled);
    }

    ngOnDestroy(): void {
        this._unanchor?.();
    }

    protected isSelected(option: SelectOption<T>): boolean {
        return this.compareWith()(option.value, this._value());
    }

    protected toggle(): void {
        if (this.open()) this._close(true);
        else this._show();
    }

    protected pick(option: SelectOption<T>): void {
        if (option.disabled) return;
        this._value.set(option.value);
        this._onChange(option.value);
        this._close(true);
    }

    protected onTriggerKey(event: KeyboardEvent): void {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            this._show(event.key === 'ArrowUp' ? 'last' : 'selected');
        }
    }

    protected onListKey(event: KeyboardEvent): void {
        const option = (event.target as HTMLElement).closest<HTMLElement>('[role=option]');
        if ((event.key === 'Enter' || event.key === ' ') && option) {
            event.preventDefault();
            option.click();
        } else if (event.key === 'Tab') {
            this._close(false);
        }
    }

    /** Fired by the popover itself, including light dismiss and Esc. */
    protected onToggle(event: Event): void {
        const opened = (event as ToggleEvent).newState === 'open';
        this.open.set(opened);
        if (!opened) {
            this._unanchor?.();
            this._unanchor = null;
            if (this._list().nativeElement.contains(this._list().nativeElement.ownerDocument.activeElement)) this._trigger().nativeElement.focus();
        }
    }

    private _show(focus: 'selected' | 'last' = 'selected'): void {
        if (!this._browser || !this._supported || this.disabled()) return;
        const list = this._list().nativeElement;
        list.showPopover?.();
        this._unanchor = anchorPosition(this._trigger().nativeElement, list, { placement: 'bottom-start', matchWidth: true });
        if (focus === 'last') this._roving().focusLast();
        else this._roving().focusFirst();
    }

    private _close(refocus: boolean): void {
        const list = this._list().nativeElement;
        if (list.matches(':popover-open')) list.hidePopover?.();
        if (refocus) this._trigger().nativeElement.focus();
    }
}
