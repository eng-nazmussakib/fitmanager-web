import { TestBed } from '@angular/core/testing';

import { TENANT } from '@config/tenant';

import { LogoComponent, splitWordmark } from './logo.component';

describe('splitWordmark', () => {
    it('splits before the second capital letter', () => {
        expect(splitWordmark('FitManager')).toEqual(['Fit', 'Manager']);
        expect(splitWordmark('Acme Bank')).toEqual(['Acme ', 'Bank']);
    });

    it('keeps a name without a second capital whole, and an explicit split wins', () => {
        expect(splitWordmark('gym')).toEqual(['gym', '']);
        expect(splitWordmark('FitManager', ['FitMan', 'ager'])).toEqual(['FitMan', 'ager']);
    });
});

describe('LogoComponent', () => {
    it('renders the brand name without a gap, and the tagline on request', async () => {
        const fixture = TestBed.createComponent(LogoComponent);
        fixture.componentRef.setInput('tagline', true);
        await fixture.whenStable();
        const text = (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
        expect(text).toContain(TENANT.brand.name);
        if (TENANT.brand.tagline) expect(text).toContain(TENANT.brand.tagline);
    });
});
