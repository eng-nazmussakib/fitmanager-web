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
import { addDays, addMonths, endOfMonth, endOfWeek, format, isValid, parse, startOfMonth, startOfWeek } from 'date-fns';

import { APP } from '@core/constants/app.constants';

import { anchorPosition } from '../a11y/anchor-position';
import { ButtonComponent } from '../button/button.component';
import { IconComponent } from '../icon/icon.component';
import { FM_FIELD } from './field.component';

const noop = (): void => undefined;

/** Wire format for date-only values. */
const ISO = 'yyyy-MM-dd';
/** What people type and read in Bangladesh. */
const DISPLAY = 'dd/MM/yyyy';
const WEEKDAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** Today in Asia/Dhaka as `yyyy-MM-dd`, whatever the browser's time zone. */
export function todayIso(timeZone: string = APP.TIME_ZONE): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** `yyyy-MM-dd` → a local Date at midnight (date-only values never touch a time zone). */
function fromIso(value: string | null | undefined): Date | null {
    if (!value) return null;
    const d = parse(value, ISO, new Date(2000, 0, 1));
    return isValid(d) ? d : null;
}

/** Accepts 05/03/2026, 5/3/2026, 05-03-2026 and 2026-03-05. */
export function parseDisplayDate(text: string): string | null {
    const t = text.trim();
    if (!t) return null;
    for (const pattern of [DISPLAY, 'd/M/yyyy', 'dd-MM-yyyy', 'd-M-yyyy', ISO]) {
        const d = parse(t, pattern, new Date(2000, 0, 1));
        if (isValid(d) && d.getFullYear() > 1900) return format(d, ISO);
    }
    return null;
}

type PopoverElement = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

/**
 * `<fm-date-picker formControlName="startDate" [min]="today" />`: a date-only field. The value is `yyyy-MM-dd`
 * (or null); people type or read `dd/MM/yyyy`. The calendar is a popover grid (WAI-ARIA date picker dialog
 * pattern): arrows move a day or a week, PageUp/PageDown a month, Home/End the week's ends, Enter picks, Esc closes.
 * Weeks start on Saturday, as in Bangladesh. "Today" is Asia/Dhaka's.
 */
@Component({
    selector: 'fm-date-picker',
    imports: [ButtonComponent, IconComponent],
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatePickerComponent), multi: true }],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'relative block w-full' },
    template: `
        <div class="fm-control">
            <input
                #input
                class="fm-input pr-10"
                type="text"
                autocomplete="off"
                inputmode="numeric"
                placeholder="dd/mm/yyyy"
                [attr.aria-describedby]="field?.describedBy() ?? null"
                [attr.aria-invalid]="invalidText() || field?.invalid() ? 'true' : null"
                [disabled]="disabled()"
                [id]="id() ?? field?.controlId ?? null"
                [value]="text()"
                (blur)="commitText()"
                (input)="text.set($any($event.target).value)"
                (keydown.enter)="commitText()"
            />
            <span class="fm-suffix">
                <button
                    #toggleBtn
                    aria-label="Choose date"
                    fmButton
                    iconOnly
                    size="sm"
                    variant="ghost"
                    [attr.aria-expanded]="open()"
                    [disabled]="disabled()"
                    (click)="toggle()"
                >
                    <fm-icon name="calendar" size="1rem" />
                </button>
            </span>
        </div>
        <div #panel class="fm-popover fm-calendar" aria-label="Choose date" aria-modal="false" popover="auto" role="dialog" (toggle)="onToggle($event)">
            <div class="fm-calendar-head">
                <button aria-label="Previous month" fmButton iconOnly size="sm" variant="ghost" (click)="moveMonth(-1)">
                    <fm-icon name="chevron-left" size="1rem" />
                </button>
                <span aria-live="polite">{{ monthLabel() }}</span>
                <button aria-label="Next month" fmButton iconOnly size="sm" variant="ghost" (click)="moveMonth(1)">
                    <fm-icon name="chevron-right" size="1rem" />
                </button>
            </div>
            <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -- arrow keys for the day buttons inside, which are focusable -->
            <div class="fm-calendar-grid" role="grid" [attr.aria-label]="monthLabel()" (keydown)="onGridKey($event)">
                @for (d of weekdays; track d) {
                    <span role="columnheader">{{ d }}</span>
                }
                @for (day of days(); track day.iso) {
                    <button
                        class="fm-day"
                        type="button"
                        role="gridcell"
                        [attr.aria-label]="day.label"
                        [attr.aria-selected]="day.iso === value()"
                        [attr.data-iso]="day.iso"
                        [attr.data-outside]="day.outside ? '' : null"
                        [attr.data-today]="day.iso === today ? '' : null"
                        [disabled]="day.disabled"
                        [tabIndex]="day.iso === focusIso() ? 0 : -1"
                        (click)="pick(day.iso)"
                    >
                        {{ day.n }}
                    </button>
                }
            </div>
            <div class="mt-1 flex justify-between border-t border-border pt-1">
                <button fmButton size="sm" variant="ghost" (click)="clear()">Clear</button>
                <button fmButton size="sm" variant="ghost" [disabled]="isOutOfRange(today)" (click)="pick(today)">Today</button>
            </div>
        </div>
    `
})
export class DatePickerComponent implements ControlValueAccessor, OnDestroy {
    private readonly _input = viewChild.required<ElementRef<HTMLInputElement>>('input');
    private readonly _panel = viewChild.required<ElementRef<PopoverElement>>('panel');
    private readonly _browser = isPlatformBrowser(inject(PLATFORM_ID));
    private _unanchor: (() => void) | null = null;
    private _supported = false;
    private _onChange: (v: string | null) => void = noop;
    private _onTouched: () => void = noop;

    protected readonly field = inject(FM_FIELD, { optional: true });
    protected readonly value = signal<string | null>(null);
    protected readonly text = signal('');
    protected readonly invalidText = signal(false);
    protected readonly disabled = signal(false);
    protected readonly open = signal(false);
    /** The month on screen (any day in it) and the day that holds keyboard focus. */
    protected readonly view = signal<Date>(new Date());
    protected readonly focusIso = signal<string>('');
    protected readonly today = todayIso();
    protected readonly weekdays = WEEKDAYS;

    readonly id = input<string>();
    /** `yyyy-MM-dd` bounds, inclusive. */
    readonly min = input<string | null>(null);
    readonly max = input<string | null>(null);

    protected readonly monthLabel = computed(() => format(this.view(), 'MMMM yyyy'));
    protected readonly days = computed(() => {
        const month = this.view();
        const start = startOfWeek(startOfMonth(month), { weekStartsOn: 6 });
        const end = endOfWeek(endOfMonth(month), { weekStartsOn: 6 });
        const out: { iso: string; n: number; outside: boolean; disabled: boolean; label: string }[] = [];
        for (let d = start; d <= end; d = addDays(d, 1)) {
            const iso = format(d, ISO);
            out.push({
                iso,
                n: d.getDate(),
                outside: d.getMonth() !== month.getMonth(),
                disabled: this.isOutOfRange(iso),
                label: format(d, 'EEEE d MMMM yyyy')
            });
        }
        return out;
    });

    constructor() {
        afterNextRender(() => (this._supported = typeof this._panel().nativeElement.showPopover === 'function'));
    }

    writeValue(value: string | null): void {
        const d = fromIso(value);
        this.value.set(d ? format(d, ISO) : null);
        this.text.set(d ? format(d, DISPLAY) : '');
        this.invalidText.set(false);
    }

    registerOnChange(fn: (v: string | null) => void): void {
        this._onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this._onTouched = fn;
    }

    setDisabledState(disabled: boolean): void {
        this.disabled.set(disabled);
    }

    ngOnDestroy(): void {
        this._unanchor?.();
    }

    protected isOutOfRange(iso: string): boolean {
        const min = this.min();
        const max = this.max();
        return (!!min && iso < min) || (!!max && iso > max);
    }

    protected commitText(): void {
        const raw = this.text();
        const iso = parseDisplayDate(raw);
        if (!raw.trim()) this._set(null);
        else if (iso && !this.isOutOfRange(iso)) this._set(iso);
        else this.invalidText.set(true);
        this._onTouched();
    }

    protected toggle(): void {
        const panel = this._panel().nativeElement;
        if (panel.matches(':popover-open')) panel.hidePopover?.();
        else this._show();
    }

    protected pick(iso: string): void {
        if (this.isOutOfRange(iso)) return;
        this._set(iso);
        this._panel().nativeElement.hidePopover?.();
        this._input().nativeElement.focus();
    }

    protected clear(): void {
        this._set(null);
        this._panel().nativeElement.hidePopover?.();
        this._input().nativeElement.focus();
    }

    protected moveMonth(delta: number): void {
        this.view.update(v => addMonths(v, delta));
        const focus = fromIso(this.focusIso());
        if (focus) this.focusIso.set(format(addMonths(focus, delta), ISO));
    }

    protected onGridKey(event: KeyboardEvent): void {
        const current = fromIso(this.focusIso());
        if (!current) return;
        const step: Record<string, () => Date> = {
            ArrowLeft: () => addDays(current, -1),
            ArrowRight: () => addDays(current, 1),
            ArrowUp: () => addDays(current, -7),
            ArrowDown: () => addDays(current, 7),
            PageUp: () => addMonths(current, -1),
            PageDown: () => addMonths(current, 1),
            Home: () => startOfWeek(current, { weekStartsOn: 6 }),
            End: () => endOfWeek(current, { weekStartsOn: 6 })
        };
        const next = step[event.key]?.();
        if (!next) return;
        event.preventDefault();
        this.focusIso.set(format(next, ISO));
        if (next.getMonth() !== this.view().getMonth() || next.getFullYear() !== this.view().getFullYear()) this.view.set(next);
        queueMicrotask(() => this._panel().nativeElement.querySelector<HTMLElement>(`[data-iso="${this.focusIso()}"]`)?.focus());
    }

    protected onToggle(event: Event): void {
        const opened = (event as ToggleEvent).newState === 'open';
        this.open.set(opened);
        if (!opened) {
            this._unanchor?.();
            this._unanchor = null;
        }
    }

    private _show(): void {
        if (!this._browser || !this._supported) return;
        const selected = fromIso(this.value()) ?? fromIso(this.today) ?? new Date();
        this.view.set(selected);
        this.focusIso.set(format(selected, ISO));
        const panel = this._panel().nativeElement;
        panel.showPopover?.();
        this._unanchor = anchorPosition(this._input().nativeElement, panel, { placement: 'bottom-start' });
        queueMicrotask(() => panel.querySelector<HTMLElement>(`[data-iso="${this.focusIso()}"]`)?.focus());
    }

    private _set(iso: string | null): void {
        this.value.set(iso);
        this.text.set(iso ? format(fromIso(iso)!, DISPLAY) : '');
        this.invalidText.set(false);
        this._onChange(iso);
    }
}
