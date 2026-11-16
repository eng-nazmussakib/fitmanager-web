/** Where a floating element sits relative to its anchor. */
export type Placement = 'bottom-start' | 'bottom-end' | 'bottom' | 'top-start' | 'top-end' | 'top' | 'right-start' | 'left-start';

export interface AnchorOptions {
    placement?: Placement;
    /** Gap between anchor and floating element, px. */
    offset?: number;
    /** Make the floating element at least as wide as the anchor (selects, comboboxes). */
    matchWidth?: boolean;
}

const MARGIN = 8;

/**
 * Positions `floating` (a `position: fixed` popover in the top layer) next to `anchor`, flips it to the other side
 * when it does not fit, and keeps it inside the viewport. Replaces @angular/cdk/overlay (D-007). CSS anchor
 * positioning would do this natively, but it is not in every supported browser yet, so one code path for all.
 *
 * Returns a cleanup function: the position follows scrolling and resizing until it is called. Browser-only: call
 * it from an event handler or `afterNextRender`, never during server rendering.
 */
export function anchorPosition(anchor: HTMLElement, floating: HTMLElement, opts: AnchorOptions = {}): () => void {
    const view = anchor.ownerDocument.defaultView;
    if (!view) return () => undefined;
    const update = (): void => place(anchor, floating, opts, view);
    update();
    view.addEventListener('scroll', update, { capture: true, passive: true });
    view.addEventListener('resize', update, { passive: true });
    return () => {
        view.removeEventListener('scroll', update, { capture: true });
        view.removeEventListener('resize', update);
    };
}

function place(anchor: HTMLElement, floating: HTMLElement, opts: AnchorOptions, view: Window): void {
    const { placement = 'bottom-start', offset = 6, matchWidth = false } = opts;
    const a = anchor.getBoundingClientRect();
    if (matchWidth) floating.style.minWidth = `${a.width}px`;
    const f = floating.getBoundingClientRect();
    const vw = view.innerWidth;
    const vh = view.innerHeight;
    const [side, align = 'center'] = placement.split('-') as ['bottom' | 'top' | 'right' | 'left', ('start' | 'end' | 'center')?];

    let top: number;
    let left: number;
    if (side === 'bottom' || side === 'top') {
        const below = a.bottom + offset;
        const above = a.top - offset - f.height;
        const fitsBelow = below + f.height <= vh - MARGIN;
        const fitsAbove = above >= MARGIN;
        top = side === 'bottom' ? (fitsBelow || !fitsAbove ? below : above) : fitsAbove || !fitsBelow ? above : below;
        left = align === 'start' ? a.left : align === 'end' ? a.right - f.width : a.left + (a.width - f.width) / 2;
    } else {
        const right = a.right + offset;
        const leftSide = a.left - offset - f.width;
        left = side === 'right' ? (right + f.width <= vw - MARGIN ? right : leftSide) : leftSide >= MARGIN ? leftSide : right;
        top = a.top;
    }
    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - f.width - MARGIN));
    top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - f.height - MARGIN));
    floating.style.top = `${Math.round(top)}px`;
    floating.style.left = `${Math.round(left)}px`;
}
