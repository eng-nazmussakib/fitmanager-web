import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { homeUrl } from '@core/branch/branch.guards';
import { AuthShellComponent } from '@layout/auth-shell/auth-shell.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { type DemoAccount, DemoAccountsService } from './demo-accounts';

/**
 * `/demo`: the showcase entry (phase 0.5). One click signs in as a demo role and lands on that role's home
 * (owner → HQ dashboard, manager → Gulshan dashboard, front desk → check-in, trainer → classes, member → portal).
 */
@Component({
    selector: 'app-demo-page',
    imports: [RouterLink, AuthShellComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-auth-shell
            heading="Try FitManager"
            lead="Pick a role. Every screen runs on realistic demo data for three Dhaka branches, and nothing you do leaves this browser."
            [wide]="true"
        >
            <ul class="grid gap-3 sm:grid-cols-2">
                @for (a of accounts(); track a.username) {
                    <li>
                        <button
                            class="group flex h-full w-full flex-col gap-2 rounded-xl border border-white/12 bg-ink-800 p-4 text-left transition hover:border-primary-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
                            type="button"
                            [disabled]="!!busy()"
                            (click)="enter(a)"
                        >
                            <span class="flex items-center gap-2 font-semibold text-white">
                                <span class="grid size-9 place-items-center rounded-lg bg-primary-500/20 text-primary-300"><fm-icon [name]="a.icon" /></span>
                                {{ a.role }}
                                @if (busy() === a.username) {
                                    <span class="fm-spinner ml-auto text-primary-300" aria-label="Signing in"></span>
                                }
                            </span>
                            <span class="text-sm text-white/70">{{ a.blurb }}</span>
                            <span class="mt-auto text-xs text-white/45">
                                {{ a.name }} ·
                                <code>{{ a.username }}</code>
                            </span>
                        </button>
                    </li>
                }
                <li>
                    <a
                        class="flex h-full flex-col gap-2 rounded-xl border border-white/12 bg-ink-800 p-4 text-white no-underline transition hover:border-primary-500 focus-visible:outline-2 focus-visible:outline-white"
                        routerLink="/"
                    >
                        <span class="flex items-center gap-2 font-semibold">
                            <span class="grid size-9 place-items-center rounded-lg bg-primary-500/20 text-primary-300"><fm-icon name="house" /></span>
                            Visitor
                        </span>
                        <span class="text-sm text-white/70">
                            The public website: branches, plans, classes and the join form. Server-rendered for search engines.
                        </span>
                    </a>
                </li>
            </ul>
            <p class="mt-6 text-sm text-white/55">
                Or sign in with these accounts on the
                <a class="underline hover:text-white" routerLink="/auth/sign-in">sign-in page</a>
                .
            </p>
        </app-auth-shell>
    `
})
export class DemoPageComponent {
    private readonly _auth = inject(AuthService);
    private readonly _router = inject(Router);

    protected readonly accounts = toSignal(inject(DemoAccountsService).accounts(), { initialValue: [] });
    protected readonly busy = signal<string | null>(null);

    protected enter(a: DemoAccount): void {
        this.busy.set(a.username);
        // Switching role: end the current demo session first (no redirect), then sign in as the new role.
        if (this._auth.isLoggedIn()) this._auth.logout({ redirect: false });
        this._auth.login({ username: a.username, password: a.password }).subscribe({
            next: user => void this._router.navigateByUrl(homeUrl(user)).finally(() => this.busy.set(null)),
            error: () => this.busy.set(null)
        });
    }
}
