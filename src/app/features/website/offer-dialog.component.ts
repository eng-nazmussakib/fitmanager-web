import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { Offer, OfferPayload } from '@core/models/website.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';

import { slugify } from './site-image';
import { WebsiteService } from './website.service';

/** HQ adds or edits an offer on the website: its text, conditions, the promo code the desk applies, and dates. */
@Component({
    selector: 'app-offer-dialog',
    imports: [FormsModule, ButtonComponent, DialogShellComponent, DialogFooterDirective, AlertComponent, FieldComponent, InputDirective, SwitchComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell [title]="data ? data.title : 'New offer'">
            <div class="grid gap-4 sm:grid-cols-2">
                <fm-field label="Title" required><input fmInput maxlength="80" [(ngModel)]="f.title" (ngModelChange)="suggestSlug()" /></fm-field>
                <fm-field hint="Lower-case letters, digits and dashes" label="Short name" required>
                    <input fmInput maxlength="80" [(ngModel)]="f.slug" (ngModelChange)="slugTouched = true" />
                </fm-field>
                <fm-field class="sm:col-span-2" label="Summary" required>
                    <textarea fmInput maxlength="300" rows="2" [(ngModel)]="f.summary"></textarea>
                </fm-field>
                <fm-field class="sm:col-span-2" hint="Markdown, optional" label="More text">
                    <textarea fmInput maxlength="8000" rows="3" [(ngModel)]="f.body"></textarea>
                </fm-field>
                <fm-field class="sm:col-span-2" hint="One per line" label="Conditions">
                    <textarea fmInput rows="3" [(ngModel)]="conditions"></textarea>
                </fm-field>
                <fm-field hint="The code the desk applies, if any" label="Promo code">
                    <input class="uppercase" fmInput maxlength="20" [(ngModel)]="code" />
                </fm-field>
                <fm-field label="Order on the page"><input type="number" fmInput max="999" min="0" [(ngModel)]="f.sort_order" /></fm-field>
                <fm-field label="Starts" required><input type="date" fmInput [(ngModel)]="f.starts_on" /></fm-field>
                <fm-field hint="Empty: ongoing" label="Ends"><input type="date" fmInput [(ngModel)]="ends" /></fm-field>
                <fm-switch class="sm:col-span-2" [(ngModel)]="f.published">Show on the website</fm-switch>
                @if (problem()) {
                    <fm-alert class="sm:col-span-2" tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" [loading]="saving()" (click)="save()">Save</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class OfferDialogComponent {
    protected readonly data = inject<Offer | null>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<Offer>>(DialogRef);
    private readonly _service = inject(WebsiteService);
    protected readonly f: OfferPayload = {
        title: this.data?.title ?? '',
        slug: this.data?.slug ?? '',
        summary: this.data?.summary ?? '',
        body: this.data?.body ?? '',
        conditions: this.data?.conditions ?? [],
        promo_code: this.data?.promo_code ?? null,
        starts_on: this.data?.starts_on ?? new Date().toISOString().slice(0, 10),
        ends_on: this.data?.ends_on ?? null,
        sort_order: this.data?.sort_order ?? 0,
        published: this.data?.published ?? true
    };
    protected slugTouched = !!this.data;
    protected conditions = this.f.conditions.join('\n');
    protected code = this.f.promo_code ?? '';
    protected ends = this.f.ends_on ?? '';
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);

    protected suggestSlug(): void {
        if (!this.slugTouched) this.f.slug = slugify(this.f.title);
    }

    protected save(): void {
        if (this.f.title.trim().length < 3) return this.problem.set('Give the offer a title.');
        if (this.f.summary.trim().length < 10) return this.problem.set('Write a summary of at least 10 characters.');
        const body: OfferPayload = {
            ...this.f,
            title: this.f.title.trim(),
            summary: this.f.summary.trim(),
            conditions: this.conditions
                .split('\n')
                .map(c => c.trim())
                .filter(Boolean),
            promo_code: this.code.trim() ? this.code.trim().toUpperCase() : null,
            ends_on: this.ends || null,
            sort_order: Number(this.f.sort_order) || 0
        };
        this.saving.set(true);
        this.problem.set(null);
        (this.data ? this._service.updateOffer(this.data.oid, body) : this._service.createOffer(body)).subscribe({
            next: o => this.ref.close(o),
            error: () => this.saving.set(false)
        });
    }
}
