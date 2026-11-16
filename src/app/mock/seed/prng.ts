/** mulberry32: a tiny seeded PRNG. Same seed → same data on every machine, so demos and screenshots repeat. */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Helpers over one random stream. */
export class Rng {
    private readonly _next: () => number;

    constructor(seed: number) {
        this._next = mulberry32(seed);
    }

    next(): number {
        return this._next();
    }

    /** Integer in [min, max]. */
    int(min: number, max: number): number {
        return min + Math.floor(this._next() * (max - min + 1));
    }

    chance(p: number): boolean {
        return this._next() < p;
    }

    pick<T>(items: readonly T[]): T {
        return items[Math.floor(this._next() * items.length)];
    }

    /** Pick by weight: `weighted([['monthly', 45], ['annual', 10]])`. */
    weighted<T>(items: readonly (readonly [T, number])[]): T {
        const total = items.reduce((s, [, w]) => s + w, 0);
        let r = this._next() * total;
        for (const [item, w] of items) {
            r -= w;
            if (r < 0) return item;
        }
        return items[items.length - 1][0];
    }

    /** Roughly normal, clamped (sum of three uniforms). */
    around(mean: number, spread: number, min: number, max: number): number {
        const n = (this._next() + this._next() + this._next() - 1.5) / 1.5;
        return Math.min(max, Math.max(min, mean + n * spread));
    }
}
