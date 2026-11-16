import { AbstractControl, FormArray, FormGroup } from '@angular/forms';

/**
 * Shows every validation error on submit.
 *
 * Why not just `form.markAllAsDirty()`? A field redraws its error only when the control's
 * `statusChanges` emits, and markAllAsDirty()/markAllAsTouched() change state without emitting.
 * So each leaf control is marked dirty and re-validated with `onlySelf`, which emits statusChanges on that control only.
 * This is the reason the 30-line OMS `markFormGroupTouched()` helper existed; this version also handles nested FormArrays.
 */
export function revealErrors(control: AbstractControl): void {
    if (control instanceof FormGroup || control instanceof FormArray) {
        Object.values(control.controls).forEach(revealErrors);
        control.markAsTouched({ onlySelf: true });
        return;
    }
    if (control.invalid) {
        control.markAsDirty({ onlySelf: true });
        control.markAsTouched({ onlySelf: true });
        control.updateValueAndValidity({ onlySelf: true });
    }
}

/** Returns true if the control has a `required` validator, for showing the * marker from config. */
export function isRequired(control: AbstractControl | null): boolean {
    return !!control?.validator?.({} as AbstractControl)?.['required'];
}
