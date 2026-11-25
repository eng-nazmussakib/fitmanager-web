const FOCUSABLE = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    '[contenteditable]',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

/** The elements inside `root` that Tab can reach, in DOM order. */
export function focusableElements(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.hasAttribute('inert') && el.getClientRects().length > 0);
}

/**
 * Keeps Tab and Shift+Tab inside `root` (for panels that are not a modal `<dialog>`, which traps focus natively,
 * e.g. the mobile navigation drawer). Moves focus in, and returns a release function that restores the focus
 * to where it was. Replaces @angular/cdk/a11y FocusTrap. Browser-only.
 */
export function focusTrap(root: HTMLElement, opts: { initialFocus?: HTMLElement | null } = {}): () => void {
    const doc = root.ownerDocument;
    const previous = doc.activeElement as HTMLElement | null;
    const onKeydown = (e: KeyboardEvent): void => {
        if (e.key !== 'Tab') return;
        const items = focusableElements(root);
        if (!items.length) {
            e.preventDefault();
            return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = doc.activeElement;
        if (e.shiftKey && (active === first || !root.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !root.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    };
    doc.addEventListener('keydown', onKeydown, true);
    (opts.initialFocus ?? focusableElements(root)[0] ?? root).focus();
    return () => {
        doc.removeEventListener('keydown', onKeydown, true);
        if (previous?.isConnected) previous.focus();
    };
}
