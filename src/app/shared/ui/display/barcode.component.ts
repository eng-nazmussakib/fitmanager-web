import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Code 39: 9 elements per character (bar, space, bar…), `1` = wide. Every USB scanner reads it out of the box. */
const CODE39: Record<string, string> = {
    '0': '000110100',
    '1': '100100001',
    '2': '001100001',
    '3': '101100000',
    '4': '000110001',
    '5': '100110000',
    '6': '001110000',
    '7': '000100101',
    '8': '100100100',
    '9': '001100100',
    A: '100001001',
    B: '001001001',
    C: '101001000',
    D: '000011001',
    E: '100011000',
    F: '001011000',
    G: '000001101',
    H: '100001100',
    I: '001001100',
    J: '000011100',
    K: '100000011',
    L: '001000011',
    M: '101000010',
    N: '000010011',
    O: '100010010',
    P: '001010010',
    Q: '000000111',
    R: '100000110',
    S: '001000110',
    T: '000010110',
    U: '110000001',
    V: '011000001',
    W: '111000000',
    X: '010010001',
    Y: '110010000',
    Z: '011010000',
    '-': '010000101',
    '.': '110000100',
    ' ': '011000100',
    '*': '010010100'
};

/** Bars of a Code 39 symbol (`*CODE*`), in narrow-module units: `[x, width]` for each black bar. */
export function code39Bars(text: string, wide = 2.5): { bars: [number, number][]; width: number } {
    const chars = `*${text.toUpperCase()}*`.split('').filter(c => CODE39[c]);
    const bars: [number, number][] = [];
    let x = 0;
    for (const c of chars) {
        CODE39[c].split('').forEach((bit, i) => {
            const w = bit === '1' ? wide : 1;
            if (i % 2 === 0) bars.push([x, w]);
            x += w;
        });
        x += 1; // inter-character gap
    }
    return { bars, width: x - 1 };
}

/**
 * `<fm-barcode value="MEM-GUL-000123" />`: the member code as a Code 39 barcode, for the front desk's USB scanner
 *. Black on white with quiet zones, whatever the theme, so it scans from a phone screen too.
 */
@Component({
    selector: 'fm-barcode',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'inline-block rounded-md bg-white px-3 pt-2 pb-1 text-black' },
    template: `
        <svg
            preserveAspectRatio="none"
            role="img"
            [attr.aria-label]="'Barcode ' + value()"
            [attr.height]="height()"
            [attr.viewBox]="'0 0 ' + symbol().width + ' 10'"
            [attr.width]="'100%'"
        >
            @for (b of symbol().bars; track $index) {
                <rect fill="currentColor" height="10" y="0" [attr.width]="b[1]" [attr.x]="b[0]" />
            }
        </svg>
        <p class="mt-0.5 text-center font-mono text-xs tracking-widest">{{ value() }}</p>
    `
})
export class BarcodeComponent {
    readonly value = input.required<string>();
    readonly height = input(56);

    protected readonly symbol = computed(() => code39Bars(this.value()));
}
