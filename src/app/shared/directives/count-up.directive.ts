import { afterNextRender, computed, DestroyRef, Directive, ElementRef, inject, input, signal } from '@angular/core';

/** `'1,200+'` → `{ prefix: '', target: 1200, suffix: '+', grouped: true }`; null when there is no number to count. */
export function parseFigure(value: string): { prefix: string; target: number; suffix: string; grouped: boolean } | null {
    const match = /^(\D*)(\d[\d,]*)(.*)$/.exec(value);
    if (!match) return null;
    return { prefix: match[1], target: Number(match[2].replaceAll(',', '')), suffix: match[3], grouped: match[2].includes(',') };
}

/**
 * Counts a figure up from 0 when it scrolls into view: `<span [appCountUp]="'1,200+'"></span>` shows `0+` … `1,200+`.
 * Renders the final figure on the server and without JavaScript; skipped when the visitor prefers reduced motion.
 */
@Directive({
    selector: '[appCountUp]',
    host: { '[textContent]': 'text()' }
})
export class CountUpDirective {
    readonly appCountUp = input.required<string>();
    /** Animation length in ms. */
    readonly countUpDuration = input(1600);

    private readonly _shown = signal<string | null>(null);
    protected readonly text = computed(() => this._shown() ?? this.appCountUp());

    constructor() {
        const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
        const destroyRef = inject(DestroyRef);
        afterNextRender(() => {
            const figure = parseFigure(this.appCountUp());
            const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
            if (!figure || calm || typeof IntersectionObserver === 'undefined') return;
            const format = (n: number): string => `${figure.prefix}${figure.grouped ? n.toLocaleString('en-US') : n}${figure.suffix}`;
            this._shown.set(format(0));
            let frame = 0;
            const observer = new IntersectionObserver(([entry]) => {
                if (!entry.isIntersecting) return;
                observer.disconnect();
                const start = performance.now();
                const step = (now: number): void => {
                    const t = Math.min((now - start) / this.countUpDuration(), 1);
                    const eased = 1 - Math.pow(1 - t, 3);
                    this._shown.set(format(Math.round(figure.target * eased)));
                    if (t < 1) frame = requestAnimationFrame(step);
                    else this._shown.set(null);
                };
                frame = requestAnimationFrame(step);
            });
            observer.observe(host);
            destroyRef.onDestroy(() => {
                observer.disconnect();
                cancelAnimationFrame(frame);
            });
        });
    }
}
