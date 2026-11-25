import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
import { DemoBannerComponent } from '@layout/demo-banner/demo-banner.component';
import { GuestBannerComponent } from '@layout/guest-banner/guest-banner.component';
import { ToastHostComponent } from '@shared/ui/toast/toast-host.component';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, ToastHostComponent, DemoBannerComponent, GuestBannerComponent],
    template: `
        @if (demo) {
            <app-demo-banner />
        } @else if (guest()) {
            <app-guest-banner />
        }
        <router-outlet />
        <fm-toast-host />
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
    private readonly _auth = inject(AuthService);
    /** The showcase build: a banner on every page. */
    protected readonly demo = environment.demo;
    /** Signed in as a shared guest account of the hosted demo. */
    protected readonly guest = computed(() => !!this._auth.user()?.guest);
}
