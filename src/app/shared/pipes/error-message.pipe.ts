import { Pipe, PipeTransform } from '@angular/core';
import { ValidationErrors } from '@angular/forms';

type Detail = Record<string, unknown>;

/** One message per validator error key, in one place (not repeated per field). */
const MESSAGES: Record<string, (d: Detail) => string> = {
    required: () => 'This field is required.',
    email: () => 'Enter a valid e-mail address.',
    minlength: d => `Enter at least ${String(d['requiredLength'])} characters.`,
    maxlength: d => `Enter at most ${String(d['requiredLength'])} characters.`,
    min: d => `Value must be at least ${String(d['min'])}.`,
    max: d => `Value must be at most ${String(d['max'])}.`,
    pattern: () => 'The format is not valid.',
    bdMobile: () => 'Enter a valid Bangladeshi mobile number, e.g. 01712345678.',
    strongPassword: () => 'Use at least 8 characters with upper and lower case letters, a digit and a symbol.',
    englishText: () => 'Use English letters only.',
    mismatch: () => 'The values do not match.',
    emailList: d => `Invalid e-mail: ${String(d['invalid'])}`
};

/**
 * Turns a control's first error into a message:
 *   <ng-template #err let-control>{{ control.errors | errorMessage }}</ng-template>
 */
@Pipe({ name: 'errorMessage' })
export class ErrorMessagePipe implements PipeTransform {
    transform(errors: ValidationErrors | null | undefined): string {
        if (!errors) return '';
        const [key, detail] = Object.entries(errors)[0] as [string, unknown];
        const params = typeof detail === 'object' && detail !== null ? (detail as Detail) : {};
        return MESSAGES[key]?.(params) ?? 'This value is not valid.';
    }
}
