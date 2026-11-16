import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { ButtonComponent } from './button/button.component';
import { ConfirmService } from './dialog/confirm.service';
import { DialogRef } from './dialog/dialog-ref';
import { code39Bars } from './display/barcode.component';
import { AvatarComponent, BadgeComponent } from './display/display';
import { parseDisplayDate } from './forms/date-picker.component';
import { FieldComponent, InputDirective } from './forms/field.component';
import { parseAmount } from './forms/number-input.component';
import { pageWindow } from './navigation/pagination.component';
import { ToastService } from './toast/toast.service';

@Component({
    imports: [ButtonComponent, BadgeComponent, AvatarComponent, FieldComponent, InputDirective, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <button fmButton variant="primary" [loading]="loading()">Save</button>
        <a fmButton href="/x" [disabled]="true">Link</a>
        <fm-badge dot tone="danger">Expired</fm-badge>
        <fm-avatar name="Rahim Uddin" />
        <fm-field hint="01XXXXXXXXX" label="Phone" required><input fmInput [formControl]="phone" /></fm-field>
    `
})
class HostComponent {
    readonly loading = signal(false);
    readonly phone = new FormControl('', Validators.required);
}

describe('UI kit', () => {
    it('button: variant classes, type="button", loading disables and sets aria-busy; links get aria-disabled', async () => {
        const fixture = TestBed.createComponent(HostComponent);
        await fixture.whenStable();
        const [button, link] = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[fmButton]');
        expect(button.className).toContain('fm-btn-primary');
        expect(button.getAttribute('type')).toBe('button');
        expect(button.hasAttribute('disabled')).toBe(false);
        fixture.componentInstance.loading.set(true);
        await fixture.whenStable();
        expect(button.hasAttribute('disabled')).toBe(true);
        expect(button.getAttribute('aria-busy')).toBe('true');
        expect(link.getAttribute('aria-disabled')).toBe('true');
        expect(link.hasAttribute('type')).toBe(false);
    });

    it('badge and avatar: tone class and initials', async () => {
        const fixture = TestBed.createComponent(HostComponent);
        await fixture.whenStable();
        const el = fixture.nativeElement as HTMLElement;
        expect(el.querySelector('fm-badge')!.className).toContain('fm-badge-danger');
        expect(el.querySelector('fm-avatar')!.textContent.trim()).toBe('RU');
    });

    it('field: label for/id, hint as description, error after touch with aria-invalid', async () => {
        const fixture = TestBed.createComponent(HostComponent);
        await fixture.whenStable();
        const el = fixture.nativeElement as HTMLElement;
        const input = el.querySelector('input')!;
        const label = el.querySelector('label')!;
        expect(label.getAttribute('for')).toBe(input.id);
        expect(input.getAttribute('aria-describedby')).toContain('hint');
        expect(input.hasAttribute('aria-invalid')).toBe(false);
        fixture.componentInstance.phone.markAsTouched();
        await fixture.whenStable();
        expect(el.querySelector('.fm-error')!.textContent).toContain('required');
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toContain('error');
    });

    it('toast service: queues, caps at four, dismisses', () => {
        const toasts = TestBed.inject(ToastService);
        for (let i = 0; i < 6; i++) toasts.show(`m${i}`, { duration: 0 });
        expect(toasts.toasts().map(t => t.message)).toEqual(['m2', 'm3', 'm4', 'm5']);
        toasts.dismiss(toasts.toasts()[0].id);
        expect(toasts.toasts().length).toBe(3);
    });

    it('confirm: emits only on yes (dialog ref contract)', async () => {
        const ref = new DialogRef<boolean>();
        const result = firstValueFrom(ref.afterClosed);
        ref.complete(true);
        expect(await result).toBe(true);
        expect(TestBed.inject(ConfirmService)).toBeTruthy();
    });

    it('pagination window: ends, current neighbourhood and gaps', () => {
        expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
        expect(pageWindow(6, 20)).toEqual([1, null, 5, 6, 7, null, 20]);
        expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
        expect(pageWindow(19, 20)).toEqual([1, null, 16, 17, 18, 19, 20]);
    });

    it('number input parsing: taka, lakh grouping, junk', () => {
        expect(parseAmount('৳ 1,25,000.50')).toBe(125000.5);
        expect(parseAmount('abc')).toBeNull();
        expect(parseAmount('')).toBeNull();
    });

    it('date parsing: dd/MM/yyyy and friends → yyyy-MM-dd', () => {
        expect(parseDisplayDate('05/03/2026')).toBe('2026-03-05');
        expect(parseDisplayDate('5/3/2026')).toBe('2026-03-05');
        expect(parseDisplayDate('2026-03-05')).toBe('2026-03-05');
        expect(parseDisplayDate('31/02/2026')).toBeNull();
        expect(parseDisplayDate('')).toBeNull();
    });

    it('Code 39: start/stop characters, 5 bars per character', () => {
        const { bars } = code39Bars('MEM-GUL-1');
        expect(bars.length).toBe((9 + 2) * 5);
        expect(code39Bars('a').bars.length).toBe(code39Bars('A').bars.length);
    });
});
