import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ButtonComponent } from '@shared/ui/button/button.component';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';

/** One page for 403 and 404, picked from the URL. Rendered in the browser only, so it is never indexed. */
@Component({
    selector: 'app-result-page',
    imports: [RouterLink, ButtonComponent, EmptyStateComponent],
    host: { class: 'grid min-h-dvh place-items-center bg-bg p-6 text-fg' },
    template: `
        <fm-empty-state size="lg" [description]="text.subtitle" [icon]="is403 ? 'lock' : 'file-question'" [title]="text.title">
            <a fmButton routerLink="/home" variant="primary">Go to my home page</a>
            <a fmButton routerLink="/">Public site</a>
        </fm-empty-state>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResultPageComponent {
    // A new instance is created for every navigation here, so reading the URL once is enough.
    protected readonly is403 = inject(Router).url.startsWith('/forbidden');
    protected readonly text = this.is403
        ? { title: 'Access denied', subtitle: 'You do not have permission to open this page, or it belongs to a branch you do not work at.' }
        : { title: 'Page not found', subtitle: 'The page you are looking for does not exist or has moved.' };
}
