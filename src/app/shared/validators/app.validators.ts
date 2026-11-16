import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

import { REGEX } from '@core/constants/regex.constants';

/** Builds a validator that skips empty values (combine with Validators.required). */
function patternValidator(regex: RegExp, errorKey: string): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const value = control.value as string | null;
        if (value === null || value === undefined || value === '') return null;
        return regex.test(String(value)) ? null : { [errorKey]: true };
    };
}

export const AppValidators = {
    bdMobile: patternValidator(REGEX.BD_MOBILE, 'bdMobile'),
    strongPassword: patternValidator(REGEX.STRONG_PASSWORD, 'strongPassword'),
    englishText: patternValidator(REGEX.ENGLISH_TEXT, 'englishText'),

    /**
     * Group-level validator: `fb.group({...}, { validators: AppValidators.match('password', 'confirm') })`.
     * Unlike OMS `MustMatch`, it does not call setErrors() on a child control (that overwrote the child's other errors).
     * It returns the error on the group, and the template reads `form.hasError('mismatch')`.
     */
    match(field: string, confirmField: string): ValidatorFn {
        return (group: AbstractControl): ValidationErrors | null => {
            const a: unknown = group.get(field)?.value;
            const b: unknown = group.get(confirmField)?.value;
            return a && b && a !== b ? { mismatch: true } : null;
        };
    }
};
