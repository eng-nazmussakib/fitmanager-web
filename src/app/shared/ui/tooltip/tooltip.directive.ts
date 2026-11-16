import { isPlatformBrowser } from '@angular/common';
import { Directive, DOCUMENT, effect, ElementRef, inject, input, OnDestroy, PLATFORM_ID } from '@angular/core';

import { anchorPosition, type Placement } from '../a11y/anchor-position';

let nextId = 0;

type PopoverElement = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

/**
 * `<button fmButton iconOnly aria-label="Freeze" fmTooltip="Freeze membership">`: a short hint shown on hover and
 * keyboard focus (WAI-ARIA tooltip pattern), linked with `aria-describedby`, closed with Esc. The tip is a
 * `popover="manual"` element in the top layer, created in the browser on first use. Never put the only label of a
 * control in a tooltip: icon-only buttons still need `aria-label`.
 */
@Directive({
    selector: '[fmTooltip]',
    host: {
        '(mouseenter)': 'show(400)',
        '(mouseleave)': 'hide()',
        '(focusin)': 'show(0)',
        '(focusout)': 'hide()',
        '(keydown.escape)': 'hide()',
        '[attr.aria-describedby]': 'fmTooltip() ? tipId : null'
    }
})
export class TooltipDirective implements OnDestroy {
    private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly _document = inject(DOCUMENT);
    private readonly _browser = isPlatformBrowser(inject(PLATFORM_ID));
    private _tip: PopoverElement | null = null;
    private _timer: ReturnType<typeof setTimeout> | undefined;
    private _unanchor: (() => void) | null = null;

    protected readonly tipId = `fm-tip-${nextId++}`;

    readonly fmTooltip = input<string | null | undefined>('');
    readonly tooltipPlacement = input<Placement>('top');

    constructor() {
        // The describedby target must exist for screen readers even before the first hover.
        effect(() => {
            const text = this.fmTooltip();
            if (!this._browser) return;
            this._ensureTip().textContent = text ?? '';
        });
    }

    show(delay: number): void {
        if (!this._browser || !this.fmTooltip()) return;
        clearTimeout(this._timer);
        this._timer = setTimeout(() => {
            const tip = this._ensureTip();
            if (typeof tip.showPopover !== 'function' || tip.matches(':popover-open')) return;
            tip.showPopover();
            this._unanchor = anchorPosition(this._host.nativeElement, tip, { placement: this.tooltipPlacement(), offset: 8 });
        }, delay);
    }

    hide(): void {
        clearTimeout(this._timer);
        this._unanchor?.();
        this._unanchor = null;
        if (this._tip?.matches(':popover-open')) this._tip.hidePopover?.();
    }

    ngOnDestroy(): void {
        this.hide();
        this._tip?.remove();
    }

    private _ensureTip(): PopoverElement {
        if (this._tip) return this._tip;
        const tip = this._document.createElement('div') as PopoverElement;
        tip.id = this.tipId;
        tip.className = 'fm-tooltip';
        tip.setAttribute('role', 'tooltip');
        tip.setAttribute('popover', 'manual');
        this._document.body.appendChild(tip);
        this._tip = tip;
        return tip;
    }
}
