import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { CardComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import type { IconName } from '@shared/ui/icon/icons';

/** A section that exists in the navigation but is built in a later phase (`data: { title, phase, icon }`). */
@Component({
    selector: 'app-placeholder-page',
    imports: [PageHeaderComponent, CardComponent, EmptyStateComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header [title]="data['title']" />
        <fm-card>
            <fm-empty-state
                title="Coming soon"
                [description]="'This section is planned for phase ' + data['phase'] + '. The navigation, permissions and branch context already work.'"
                [icon]="icon"
            />
        </fm-card>
    `
})
export class PlaceholderPageComponent {
    protected readonly data = inject(ActivatedRoute).snapshot.data as Record<string, string>;
    protected readonly icon = (this.data['icon'] as IconName | undefined) ?? 'wrench';
}
