import { afterNextRender, DestroyRef, Directive, DOCUMENT, ElementRef, inject, input } from '@angular/core';

/**
 * Fades an element up the first time it scrolls into view: `<li appReveal [revealDelay]="i * 80">`.
 *
 * Progressive: the server and no-JS render show everything. In the browser, only elements that start below the
 * fold get the hidden `.reveal` state, so nothing on screen flickers at load. The motion itself lives in
 * `styles.css` (`.reveal` / `.revealed`) and is skipped when the visitor prefers reduced motion.
 */
@Directive({ selector: '[appReveal]' })
export class RevealDirective {
    private readonly _el = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly _document = inject(DOCUMENT);

    /** Delay in ms, to stagger siblings. */
    readonly revealDelay = input(0);

    constructor() {
        const destroyRef = inject(DestroyRef);
        afterNextRender(() => {
            const el = this._el.nativeElement;
            if (typeof IntersectionObserver === 'undefined') return;
            if (el.getBoundingClientRect().top < this._document.documentElement.clientHeight) return; // already visible

            el.classList.add('reveal');
            el.style.setProperty('--reveal-delay', `${this.revealDelay()}ms`);
            const observer = new IntersectionObserver(
                entries => {
                    if (!entries.some(e => e.isIntersecting)) return;
                    el.classList.add('revealed');
                    observer.disconnect();
                },
                { rootMargin: '0px 0px -8% 0px' }
            );
            observer.observe(el);
            destroyRef.onDestroy(() => observer.disconnect());
        });
    }
}
