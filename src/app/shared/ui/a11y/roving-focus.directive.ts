import { booleanAttribute, Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Arrow-key navigation between the items of a composite widget (menus, tabs, listboxes, toolbars), following the
 * WAI-ARIA "roving tabindex" pattern: only one item is in the Tab order, the arrows move between them, Home and End
 * jump to the ends, and typing a letter jumps to the next item starting with it. Replaces @angular/cdk/a11y
 * ListKeyManager.
 *
 *   <div role="tablist" fmRovingFocus orientation="horizontal" itemSelector="[role=tab]">…</div>
 *
 * Disabled items (`disabled` or `aria-disabled="true"`) are skipped. With `manageTabindex`, the directive keeps
 * `tabindex="0"` on the focused (or selected) item and `-1` on the others.
 */
@Directive({
    selector: '[fmRovingFocus]',
    host: { '(keydown)': 'onKeydown($event)', '(focusin)': 'onFocusIn($event)' }
})
export class RovingFocusDirective {
    private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
    private _typed = '';
    private _typedAt = 0;

    readonly itemSelector = input('[role=menuitem],[role=option],[role=tab]');
    readonly orientation = input<'horizontal' | 'vertical' | 'both'>('vertical');
    readonly wrap = input(true, { transform: booleanAttribute });
    readonly manageTabindex = input(false, { transform: booleanAttribute });

    /** Current items, enabled ones only. */
    items(): HTMLElement[] {
        return Array.from(this._host.nativeElement.querySelectorAll<HTMLElement>(this.itemSelector())).filter(
            el => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true'
        );
    }

    /** Focus the first item (or the selected one, `aria-selected`/`aria-checked`). */
    focusFirst(): void {
        const items = this.items();
        (items.find(el => el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
    }

    focusLast(): void {
        this.items().at(-1)?.focus();
    }

    /** Puts tabindex 0 on the selected (or first) item and -1 on the rest. Call after the items render. */
    syncTabindex(): void {
        const items = this.items();
        const current = items.find(el => el.getAttribute('aria-selected') === 'true') ?? items[0];
        for (const el of items) el.tabIndex = el === current ? 0 : -1;
    }

    protected onFocusIn(event: FocusEvent): void {
        if (!this.manageTabindex()) return;
        const items = this.items();
        if (!items.includes(event.target as HTMLElement)) return;
        for (const el of items) el.tabIndex = el === event.target ? 0 : -1;
    }

    protected onKeydown(event: KeyboardEvent): void {
        const items = this.items();
        if (!items.length) return;
        const index = items.indexOf(event.target as HTMLElement);
        const o = this.orientation();
        const next = o === 'horizontal' ? ['ArrowRight'] : o === 'vertical' ? ['ArrowDown'] : ['ArrowRight', 'ArrowDown'];
        const prev = o === 'horizontal' ? ['ArrowLeft'] : o === 'vertical' ? ['ArrowUp'] : ['ArrowLeft', 'ArrowUp'];
        let target: HTMLElement | undefined;

        if (next.includes(event.key)) target = this._step(items, index, 1);
        else if (prev.includes(event.key)) target = this._step(items, index, -1);
        else if (event.key === 'Home') target = items[0];
        else if (event.key === 'End') target = items.at(-1);
        else if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey)
            target = this._typeahead(items, index, event.key);

        if (target) {
            event.preventDefault();
            target.focus();
        }
    }

    private _step(items: HTMLElement[], index: number, delta: 1 | -1): HTMLElement | undefined {
        if (index === -1) return delta === 1 ? items[0] : items.at(-1);
        const to = index + delta;
        if (to < 0 || to >= items.length) return this.wrap() ? items[(to + items.length) % items.length] : undefined;
        return items[to];
    }

    private _typeahead(items: HTMLElement[], index: number, key: string): HTMLElement | undefined {
        const now = Date.now();
        this._typed = now - this._typedAt > 700 ? key.toLowerCase() : this._typed + key.toLowerCase();
        this._typedAt = now;
        const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)];
        const label = (el: HTMLElement): string => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().toLowerCase();
        return (
            ordered.find(el => label(el).startsWith(this._typed)) ??
            (this._typed.length > 1 ? undefined : ordered.find(el => label(el).startsWith(key.toLowerCase())))
        );
    }
}
