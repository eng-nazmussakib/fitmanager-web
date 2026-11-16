import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ThemeService } from '@core/services/theme.service';
import { TenantService } from '@core/tenant/tenant.service';

import { ButtonComponent } from '../button/button.component';
import { IconComponent } from '../icon/icon.component';
import { TooltipDirective } from '../tooltip/tooltip.directive';

/** Light/dark switch for the consoles and the portal (hidden when the brand turns dark mode off). */
@Component({
    selector: 'fm-theme-toggle',
    imports: [ButtonComponent, IconComponent, TooltipDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (tenant.darkMode) {
            <button fmButton iconOnly variant="ghost" [attr.aria-label]="label()" [attr.aria-pressed]="dark()" [fmTooltip]="label()" (click)="theme.toggle()">
                <fm-icon [name]="dark() ? 'sun' : 'moon'" />
            </button>
        }
    `
})
export class ThemeToggleComponent {
    protected readonly theme = inject(ThemeService);
    protected readonly tenant = inject(TenantService);
    protected readonly dark = computed(() => this.theme.theme() === 'dark');
    protected readonly label = computed(() => (this.dark() ? 'Switch to light mode' : 'Switch to dark mode'));
}
