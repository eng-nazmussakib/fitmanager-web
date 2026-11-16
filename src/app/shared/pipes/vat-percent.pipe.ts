import { Pipe, PipeTransform } from '@angular/core';

import { vatPercent } from '@core/models/settings.model';

/** `{{ 0.15 | vatPercent }}` → "15 %". Rounded to two decimals, so no floating-point tails. */
@Pipe({ name: 'vatPercent' })
export class VatPercentPipe implements PipeTransform {
    transform(rate: number | null | undefined): string {
        return rate === null || rate === undefined ? '' : `${vatPercent(rate)} %`;
    }
}
