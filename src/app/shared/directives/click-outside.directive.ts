import { Directive, DOCUMENT, ElementRef, inject, input, output } from '@angular/core';

/**
 * `<div (appClickOutside)="close()">`: emits when a pointer press lands outside the element (custom panels that
 * are not a popover; `popover="auto"` has light dismiss built in). Server-safe: the listener is a host binding on
 * `document`, which only fires in the browser. `ignore` lists extra elements that count as inside (the trigger).
 */
@Directive({
    selector: '[appClickOutside]',
    host: { '(document:pointerdown)': 'onPointerDown($event)' }
})
export class ClickOutsideDirective {
    private readonly _el = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly _document = inject(DOCUMENT);

    readonly ignore = input<(HTMLElement | null | undefined)[]>([]);
    readonly appClickOutside = output<PointerEvent>();

    onPointerDown(event: PointerEvent): void {
        const target = event.target as Node | null;
        if (!target || !this._document.contains(target)) return;
        if (this._el.nativeElement.contains(target)) return;
        if (this.ignore().some(el => el?.contains(target))) return;
        this.appClickOutside.emit(event);
    }
}
