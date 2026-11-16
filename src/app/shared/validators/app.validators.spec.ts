import { FormControl, FormGroup } from '@angular/forms';

import { AppValidators } from './app.validators';

describe('AppValidators', () => {
    it.each([
        ['01712345678', null],
        ['01212345678', { bdMobile: true }], // 012 is not a valid operator prefix
        ['0171234567', { bdMobile: true }], // 10 digits
        ['', null] // empty is left to Validators.required
    ])('bdMobile(%s)', (value, expected) => {
        expect(AppValidators.bdMobile(new FormControl(value))).toEqual(expected);
    });

    it('strongPassword needs upper, lower, digit and symbol', () => {
        expect(AppValidators.strongPassword(new FormControl('Secret@123'))).toBeNull();
        expect(AppValidators.strongPassword(new FormControl('secret123'))).toEqual({ strongPassword: true });
    });

    it('match() sets the error on the group, not on the child control', () => {
        const form = new FormGroup(
            { password: new FormControl('Secret@1'), confirm: new FormControl('Secret@2') },
            { validators: AppValidators.match('password', 'confirm') }
        );
        expect(form.hasError('mismatch')).toBe(true);
        expect(form.controls.confirm.errors).toBeNull();
    });
});
