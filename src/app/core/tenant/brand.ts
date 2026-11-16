import type { BrandConfig } from '@config/tenant.model';

/** `['Fit', 'Manager']` from `brand.wordmark`, else the name split before its second capital letter. */
export function splitWordmark(name: string, wordmark?: [string, string]): [string, string] {
    if (wordmark) return wordmark;
    const match = /^(.[^A-Z]*)([A-Z].*)$/.exec(name);
    return match ? [match[1], match[2]] : [name, ''];
}

/**
 * The letters in the logo block and the browser icon: `brand.initials`; else, for a name of several words, the first
 * letter of each (up to three: "Iron Tribe Fitness" → "ITF"); else the wordmark parts' first letters ("PulseForge" → "PF").
 */
export function brandInitials(brand: BrandConfig): string {
    if (brand.initials) return brand.initials;
    const words = brand.name.trim().split(/\s+/);
    const parts = words.length > 1 ? words.slice(0, 3) : splitWordmark(brand.name, brand.wordmark);
    return parts
        .map(part => part.trim().charAt(0))
        .join('')
        .toUpperCase();
}

/** A dumbbell in a 24×24 box, drawn with round 2.6-wide strokes: two plates a side and the bar. */
export const DUMBBELL_PATH = 'M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11';

/**
 * The browser icon as an SVG data URL: a rounded block of the brand colour with, in white, the initials, or a dumbbell
 * (`brand.mark === 'dumbbell'`).
 */
export function faviconSvg(initials: string, color: string, mark: BrandConfig['mark'] = 'initials'): string {
    const inner =
        mark === 'dumbbell'
            ? `<path d="${DUMBBELL_PATH}" transform="translate(8 8) scale(2)" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`
            : `<text x="32" y="33" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="${initials.length > 2 ? 26 : 34}" font-weight="700" ` +
              `text-anchor="middle" dominant-baseline="central">${initials.replace(/[<>&"]/g, '')}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="${color}"/>${inner}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
