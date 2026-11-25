import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { BlogCategory, BlogPost, PostPayload } from '@core/models/website.model';
import { FilesService } from '@core/services/files.service';
import { renderMarkdown } from '@core/utils/markdown';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { slugify, uploadSiteImage } from './site-image';
import { WebsiteService } from './website.service';

export interface PostDialogData {
    post: BlogPost | null;
    categories: BlogCategory[];
}

type When = 'draft' | 'now' | 'later';

/**
 * HQ writes a blog post: Markdown with a live preview (the same renderer as the public page, which escapes any
 * HTML typed), a cover shrunk in the browser, a category, and when it goes live: a draft, now, or a date (scheduled).
 */
@Component({
    selector: 'app-post-dialog',
    imports: [
        FormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        FieldComponent,
        InputDirective,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    // The Markdown is inserted with [innerHTML], which scoped styles do not reach: these rules are global, under a
    // class of their own.
    encapsulation: ViewEncapsulation.None,
    styles: `
        .md-preview :is(h2, h3, h4) {
            margin-top: 1rem;
            font-weight: 600;
        }
        .md-preview h2 {
            font-size: 1.25rem;
        }
        .md-preview h3 {
            font-size: 1.1rem;
        }
        .md-preview :is(p, ul, ol, blockquote) {
            margin-top: 0.6rem;
        }
        .md-preview ul {
            padding-left: 1.25rem;
            list-style: disc;
        }
        .md-preview ol {
            padding-left: 1.25rem;
            list-style: decimal;
        }
        .md-preview blockquote {
            border-left: 3px solid var(--color-accent);
            padding-left: 0.75rem;
            color: var(--color-fg-muted);
        }
        .md-preview a {
            color: var(--color-accent);
            text-decoration: underline;
        }
        .md-preview code {
            border-radius: 0.25rem;
            background: var(--color-surface-sunken);
            padding: 0 0.25rem;
        }
    `,
    template: `
        <fm-dialog-shell [title]="data.post ? 'Edit post' : 'New post'">
            <div class="grid gap-4 md:grid-cols-2">
                <fm-field class="md:col-span-2" label="Title" required>
                    <input fmInput maxlength="120" [(ngModel)]="title" (ngModelChange)="suggestSlug()" />
                </fm-field>
                <fm-field hint="The post's web address: /blog/…" label="Address" required>
                    <input fmInput maxlength="80" [(ngModel)]="slug" (ngModelChange)="slugTouched = true" />
                </fm-field>
                <fm-field label="Category">
                    <fm-select [options]="categoryOptions" [(ngModel)]="category" />
                </fm-field>
                <fm-field class="md:col-span-2" hint="One or two sentences for the list and search results." label="Excerpt" required>
                    <textarea fmInput maxlength="300" rows="2" [(ngModel)]="excerpt"></textarea>
                </fm-field>
                <fm-field hint="Markdown: ## heading, **bold**, *italic*, - list, 1. list, > quote, [link](https://…)" label="Text">
                    <textarea class="font-mono text-sm" fmInput maxlength="40000" rows="14" [ngModel]="body()" (ngModelChange)="body.set($event)"></textarea>
                </fm-field>
                <div>
                    <p class="mb-1.5 text-sm font-medium">Preview</p>
                    <div
                        class="md-preview h-[19.5rem] overflow-y-auto rounded-[var(--radius-control)] border border-border bg-surface-sunken/40 p-3 text-sm leading-relaxed"
                        aria-label="Preview"
                        aria-live="polite"
                        role="region"
                        [innerHTML]="preview()"
                    ></div>
                </div>
                <div class="md:col-span-2">
                    <p class="mb-1.5 text-sm font-medium">Cover image</p>
                    <div class="flex flex-wrap items-center gap-3">
                        @if (coverSrc()) {
                            <img class="h-16 w-28 rounded object-cover" alt="" [src]="coverSrc()" />
                        }
                        <label class="fm-btn fm-btn-secondary cursor-pointer">
                            <fm-icon name="upload" />
                            {{ coverSrc() ? 'Replace' : 'Upload' }}
                            <input #file class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" (change)="upload(file)" />
                        </label>
                        <fm-field class="min-w-60 flex-1" label="Describe the image">
                            <input fmInput maxlength="200" [(ngModel)]="coverAlt" />
                        </fm-field>
                    </div>
                </div>
                <fm-field label="Publish">
                    <fm-select [options]="whenOptions" [(ngModel)]="when" />
                </fm-field>
                @if (when === 'later') {
                    <fm-field hint="Hidden until then (Dhaka time)." label="Date and time">
                        <input type="datetime-local" fmInput [(ngModel)]="at" />
                    </fm-field>
                }
                @if (problem()) {
                    <fm-alert class="md:col-span-2" tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" [disabled]="uploading()" [loading]="saving()" (click)="save()">Save</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class PostDialogComponent {
    protected readonly data = inject<PostDialogData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<BlogPost>>(DialogRef);
    private readonly _service = inject(WebsiteService);
    private readonly _files = inject(FilesService);

    private readonly _p = this.data.post;
    protected title = this._p?.title ?? '';
    protected slug = this._p?.slug ?? '';
    protected slugTouched = !!this._p;
    protected excerpt = this._p?.excerpt ?? '';
    protected category = this._p?.category?.oid ?? '';
    protected coverAlt = this._p?.cover?.alt ?? '';
    protected when: When = !this._p?.published_at ? 'draft' : this._p.status === 'scheduled' ? 'later' : 'now';
    /** `YYYY-MM-DDTHH:mm` in Dhaka time, for the datetime-local field. */
    protected at = this._p?.published_at ? dhakaLocal(this._p.published_at) : '';
    protected readonly body = signal(this._p?.body ?? '');
    protected readonly preview = computed(() => renderMarkdown(this.body()));
    protected readonly coverSrc = signal(this._p?.cover?.src ?? '');
    private _coverFile: string | null | undefined;

    protected readonly categoryOptions: SelectOption<string>[] = [
        { value: '', label: 'None' },
        ...this.data.categories.map(c => ({ value: c.oid, label: c.name }))
    ];
    protected readonly whenOptions: SelectOption<When>[] = [
        { value: 'draft', label: 'Draft: not on the site' },
        { value: 'now', label: this._p?.status === 'published' ? 'Published' : 'Publish now' },
        { value: 'later', label: 'On a date' }
    ];
    protected readonly saving = signal(false);
    protected readonly uploading = signal(false);
    protected readonly problem = signal<string | null>(null);

    protected suggestSlug(): void {
        if (!this.slugTouched) this.slug = slugify(this.title);
    }

    protected async upload(input: HTMLInputElement): Promise<void> {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        this.problem.set(null);
        this.uploading.set(true);
        try {
            const up = await uploadSiteImage(this._files, file);
            this._coverFile = up.oid;
            this.coverSrc.set(up.preview);
        } catch (e) {
            this.problem.set(e instanceof Error ? e.message : 'The image could not be uploaded.');
        } finally {
            this.uploading.set(false);
        }
    }

    protected save(): void {
        if (this.title.trim().length < 3) return this.problem.set('Give the post a title.');
        if (this.excerpt.trim().length < 10) return this.problem.set('Write an excerpt of at least 10 characters.');
        if (this.when === 'later' && !this.at) return this.problem.set('Choose the date it goes live.');
        const publishedAt =
            this.when === 'draft'
                ? null
                : this.when === 'later'
                  ? `${this.at}:00+06:00`
                  : this._p?.status === 'published'
                    ? this._p.published_at
                    : new Date().toISOString();
        const body: PostPayload = {
            title: this.title.trim(),
            slug: this.slug.trim(),
            excerpt: this.excerpt.trim(),
            body: this.body(),
            category_oid: this.category || null,
            cover_alt: this.coverAlt.trim(),
            published_at: publishedAt,
            ...(this._coverFile !== undefined ? { cover_file_oid: this._coverFile } : {})
        };
        this.saving.set(true);
        this.problem.set(null);
        (this._p ? this._service.updatePost(this._p.oid, body) : this._service.createPost(body)).subscribe({
            next: p => this.ref.close(p),
            error: () => this.saving.set(false)
        });
    }
}

/** An instant as `YYYY-MM-DDTHH:mm` in Dhaka (UTC+6, no daylight saving). */
function dhakaLocal(iso: string): string {
    return new Date(new Date(iso).getTime() + 6 * 3600_000).toISOString().slice(0, 16);
}
