import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { type AppRule, createAppAbility } from '@core/auth/ability';
import { AuthService } from '@core/auth/auth.service';

import { CanDirective } from './can.directive';

@Component({
    imports: [CanDirective],
    template: `
        <button *appCan="'create'; on: 'Member'" type="button">Create</button>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
class HostComponent {}

describe('CanDirective', () => {
    const rules = signal<AppRule[]>([]);

    beforeEach(() => {
        rules.set([]);
        TestBed.configureTestingModule({
            providers: [{ provide: AuthService, useValue: { can: (a: never, s: never) => createAppAbility(rules()).can(a, s) } }]
        });
    });

    it('does not create the element without the ability', async () => {
        const fixture = TestBed.createComponent(HostComponent);
        await fixture.whenStable();
        expect((fixture.nativeElement as HTMLElement).querySelector('button')).toBeNull();
    });

    it('adds and removes the element when the ability changes (signals, no reload)', async () => {
        const fixture = TestBed.createComponent(HostComponent);
        rules.set([{ action: 'create', subject: 'Member' }]);
        await fixture.whenStable();
        expect((fixture.nativeElement as HTMLElement).querySelector('button')?.textContent).toBe('Create');

        rules.set([{ action: 'read', subject: 'Member' }]);
        await fixture.whenStable();
        expect((fixture.nativeElement as HTMLElement).querySelector('button')).toBeNull();
    });
});
