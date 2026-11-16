import { Pipe, PipeTransform } from '@angular/core';

/** Lakh/crore grouping, as used in Bangladesh: 12,50,000.00. `en-IN` is the Intl locale with that grouping. */
const formatters = new Map<number, Intl.NumberFormat>();

function formatter(decimals: number): Intl.NumberFormat {
    let f = formatters.get(decimals);
    if (!f) {
        f = new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        formatters.set(decimals, f);
    }
    return f;
}

/** `{{ 1250000 | taka }}` → `৳12,50,000.00`; `{{ 500 | taka: 0 }}` → `৳500`. */
@Pipe({ name: 'taka' })
export class TakaPipe implements PipeTransform {
    transform(value: number | string | null | undefined, decimals = 2, symbol = '৳'): string {
        if (value === null || value === undefined || value === '' || isNaN(Number(value))) return '';
        return `${symbol}${formatter(decimals).format(Number(value))}`;
    }
}
