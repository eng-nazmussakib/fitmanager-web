import { Injectable } from '@angular/core';

import { TENANT } from '@config/tenant';

/** Read access to the build-time brand (`src/app/config/tenant.ts`). Colours are applied by ThemeService. */
@Injectable({ providedIn: 'root' })
export class TenantService {
    readonly config = TENANT;
    readonly brand = TENANT.brand;
    readonly name = TENANT.brand.name;
    readonly darkMode = TENANT.features.darkMode ?? true;
    readonly themeSwitcher = (TENANT.features.themeSwitcher ?? true) && TENANT.themes.length > 1;
}
