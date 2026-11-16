import { brandInitials, faviconSvg } from './brand';

describe('brandInitials', () => {
    it('takes the first letter of each word, or of each wordmark part', () => {
        expect(brandInitials({ name: 'PulseForge' })).toBe('PF');
        expect(brandInitials({ name: 'Acme Bank' })).toBe('AB');
        expect(brandInitials({ name: 'Iron Tribe Fitness', wordmark: ['Iron Tribe ', 'Fitness'] })).toBe('ITF');
        expect(brandInitials({ name: 'gym' })).toBe('G');
    });

    it('uses the configured initials', () => {
        expect(brandInitials({ name: 'PulseForge', initials: 'P' })).toBe('P');
    });
});

describe('faviconSvg', () => {
    it('is an SVG data URL with the initials on the colour', () => {
        const svg = decodeURIComponent(faviconSvg('PF', '#d90a14'));
        expect(svg).toMatch(/^data:image\/svg\+xml,<svg/);
        expect(svg).toContain('fill="#d90a14"');
        expect(svg).toContain('>PF</text>');
    });

    it('draws a dumbbell instead of the initials', () => {
        const svg = decodeURIComponent(faviconSvg('ITF', '#d90a14', 'dumbbell'));
        expect(svg).toContain('<path d="M6.5 7v10');
        expect(svg).not.toContain('ITF');
    });
});
