import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { environment } from '@env/environment';
import { DemoBannerComponent } from '@layout/demo-banner/demo-banner.component';
import { ToastHostComponent } from '@shared/ui/toast/toast-host.component';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, ToastHostComponent, DemoBannerComponent],
    template: `
        @if (demo) {
            <app-demo-banner />
        }
        <router-outlet />
        <fm-toast-host />
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
    /** The showcase build (phase 0.5): a banner on every page. */
    protected readonly demo = environment.demo;
}
