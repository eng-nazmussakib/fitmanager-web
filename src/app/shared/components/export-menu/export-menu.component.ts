import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { ExportFormat } from '@core/models/report.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { MenuComponent, MenuItemDirective, MenuTriggerDirective } from '@shared/ui/menu/menu';

/**
 * "Export" with Excel and PDF. Presentational: the page does the export when `export` fires and shows
 * `busy` meanwhile. Gate it with `*appCan="'export'; on: 'Report'"` where it is used.
 */
@Component({
    selector: 'app-export-menu',
    imports: [ButtonComponent, IconComponent, MenuComponent, MenuItemDirective, MenuTriggerDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <button fmButton [attr.aria-label]="label()" [fmMenuTrigger]="menu" [loading]="busy()" [size]="size()">
            <fm-icon name="download" />
            {{ compact() ? '' : 'Export' }}
        </button>
        <fm-menu #menu [label]="label()">
            <button fmMenuItem (click)="export.emit('xlsx')">
                <fm-icon name="file-spreadsheet" />
                Excel (.xlsx)
            </button>
            <button fmMenuItem (click)="export.emit('pdf')">
                <fm-icon name="file-text" />
                PDF
            </button>
        </fm-menu>
    `
})
export class ExportMenuComponent {
    /** What is exported, for screen readers: "Export the member list". */
    readonly label = input('Export');
    readonly busy = input(false, { transform: booleanAttribute });
    readonly size = input<'sm' | 'md'>('md');
    /** Icon only. */
    readonly compact = input(false, { transform: booleanAttribute });
    readonly export = output<ExportFormat>();
}
