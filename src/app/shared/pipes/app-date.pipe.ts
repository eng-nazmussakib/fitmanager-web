import { Pipe, PipeTransform } from '@angular/core';

import { DateInput, formatDate } from '@core/utils/date.utils';

/** `{{ emp.joining_date | appDate }}` → `05 Mar 2021`, always in Asia/Dhaka time. */
@Pipe({ name: 'appDate' })
export class AppDatePipe implements PipeTransform {
    transform(value: DateInput, pattern = 'dd MMM yyyy'): string {
        return formatDate(value, pattern);
    }
}
