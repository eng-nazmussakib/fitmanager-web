import { afterNextRender, computed, DestroyRef, Directive, ElementRef, inject, signal } from '@angular/core';

/**
 * Pages a horizontal scroll-snap track: `<div appScrollPager #pager="pager">` then `pager.prev()`, `pager.next()`,
 * `pager.goTo(i)`, `pager.page()` and `pager.dots()` for arrows and dot indicators.
 * A page is one visible width. Smooth scrolling comes from CSS (`motion-safe:scroll-smooth` on the track), so it
 * follows the reduced-motion setting. Safe on the server: it only measures after the first browser render.
 */
@Directive({
    selector: '[appScrollPager]',
    exportAs: 'pager',
    host: { '(scroll)': 'sync()' }
})
export class ScrollPagerDirective {
    private readonly _el = inject<ElementRef<HTMLElement>>(ElementRef);

    readonly page = signal(0);
    readonly pages = signal(1);
    readonly dots = computed(() => Array.from({ length: this.pages() }, (_, i) => i));
    readonly atStart = computed(() => this.page() === 0);
    readonly atEnd = computed(() => this.page() >= this.pages() - 1);

    constructor() {
        const destroyRef = inject(DestroyRef);
        afterNextRender(() => {
            this.sync();
            const observer = new ResizeObserver(() => this.sync());
            observer.observe(this._el.nativeElement);
            destroyRef.onDestroy(() => observer.disconnect());
        });
    }

    prev(): void {
        this.goTo(this.page() - 1);
    }

    next(): void {
        this.goTo(this.page() + 1);
    }

    goTo(index: number): void {
        const el = this._el.nativeElement;
        const max = el.scrollWidth - el.clientWidth;
        const i = Math.min(Math.max(index, 0), this.pages() - 1);
        el.scrollTo({ left: Math.min(i * el.clientWidth, max) });
    }

    protected sync(): void {
        const el = this._el.nativeElement;
        if (!el.clientWidth) return;
        const pages = Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth - 0.02));
        const max = el.scrollWidth - el.clientWidth;
        this.pages.set(pages);
        this.page.set(el.scrollLeft >= max - 2 ? pages - 1 : Math.round(el.scrollLeft / el.clientWidth));
    }
}
