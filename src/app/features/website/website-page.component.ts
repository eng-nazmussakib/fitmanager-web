import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { filter, switchMap } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { BranchContextService } from '@core/branch/branch-context.service';
import type { BlogPost, GalleryPhoto, Offer, PostStatus } from '@core/models/website.model';
import { FilesService } from '@core/services/files.service';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { ConfirmService } from '@shared/ui/dialog/confirm.service';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { AlertComponent, BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TabDirective, TabsComponent } from '@shared/ui/tabs/tabs.component';

import { OfferDialogComponent } from './offer-dialog.component';
import { PostDialogComponent, type PostDialogData } from './post-dialog.component';
import { uploadSiteImage } from './site-image';
import { WebsiteService } from './website.service';

const STATUS: Record<PostStatus, { label: string; tone: 'success' | 'info' | 'neutral' }> = {
    published: { label: 'Published', tone: 'success' },
    scheduled: { label: 'Scheduled', tone: 'info' },
    draft: { label: 'Draft', tone: 'neutral' }
};

/**
 * `/hq/website` and `/console/:branch/website`: the public site's content.
 * - HQ: the blog, the offers, every branch's photos and text. The public pages are prerendered at each deploy, so
 *   new content is in the built pages (and the sitemap) from the next deploy; in the browser they read it live.
 * - A branch manager: their branch's photos and the text on its page.
 */
@Component({
    selector: 'app-website-page',
    imports: [
        FormsModule,
        PageHeaderComponent,
        AppDatePipe,
        ButtonComponent,
        AlertComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        FieldComponent,
        InputDirective,
        SelectComponent,
        IconComponent,
        TabDirective,
        TabsComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header title="Website" [subtitle]="hq ? 'The blog, offers and photos on the public site' : 'Your branch page on the public site'" />

        <fm-tabs [(active)]="tab">
            @if (hq) {
                <ng-template fmTab="posts" label="Blog" [count]="posts.value()?.length ?? null">
                    <div class="mb-3 flex justify-end">
                        <button fmButton variant="primary" (click)="editPost(null)">
                            <fm-icon name="plus" />
                            New post
                        </button>
                    </div>
                    @if (posts.value(); as list) {
                        <fm-card flush>
                            <ul class="divide-y divide-border" aria-label="Posts">
                                @for (p of list; track p.oid) {
                                    <li class="flex flex-wrap items-center gap-3 px-4 py-3">
                                        @if (p.cover) {
                                            <img class="h-12 w-20 rounded object-cover" alt="" [src]="p.cover.src" />
                                        }
                                        <div class="min-w-0 flex-1">
                                            <p class="flex flex-wrap items-center gap-2 font-medium">
                                                {{ p.title }}
                                                <fm-badge [tone]="statusOf[p.status].tone">{{ statusOf[p.status].label }}</fm-badge>
                                            </p>
                                            <p class="text-xs text-fg-subtle">
                                                /blog/{{ p.slug }} · {{ p.category?.name ?? 'No category' }}
                                                @if (p.published_at) {
                                                    · {{ p.published_at | appDate: 'd MMM yyyy, h:mm a' }}
                                                }
                                            </p>
                                        </div>
                                        <button fmButton size="sm" variant="ghost" [attr.aria-label]="'Edit ' + p.title" (click)="editPost(p)">
                                            <fm-icon name="pencil" />
                                            Edit
                                        </button>
                                        <button fmButton iconOnly size="sm" variant="ghost" [attr.aria-label]="'Delete ' + p.title" (click)="deletePost(p)">
                                            <fm-icon name="trash-2" />
                                        </button>
                                    </li>
                                } @empty {
                                    <li class="p-4"><fm-empty-state icon="file-text" title="No posts yet" /></li>
                                }
                            </ul>
                        </fm-card>
                        <form class="mt-4 flex flex-wrap items-end gap-3" (ngSubmit)="addCategory()">
                            <fm-field label="New category"><input name="category" fmInput maxlength="40" [(ngModel)]="newCategory" /></fm-field>
                            <button type="submit" fmButton [disabled]="newCategory.trim().length < 2">Add</button>
                            <p class="text-sm text-fg-subtle">Categories: {{ categoryNames() }}</p>
                        </form>
                    } @else {
                        <fm-skeleton height="8rem" />
                    }
                </ng-template>

                <ng-template fmTab="offers" label="Offers" [count]="offers.value()?.length ?? null">
                    <div class="mb-3 flex justify-end">
                        <button fmButton variant="primary" (click)="editOffer(null)">
                            <fm-icon name="plus" />
                            New offer
                        </button>
                    </div>
                    <fm-card flush>
                        <ul class="divide-y divide-border" aria-label="Offers">
                            @for (o of offers.value() ?? []; track o.oid) {
                                <li class="flex flex-wrap items-center gap-3 px-4 py-3">
                                    <div class="min-w-0 flex-1">
                                        <p class="flex flex-wrap items-center gap-2 font-medium">
                                            {{ o.title }}
                                            <fm-badge [tone]="offerState(o).tone">{{ offerState(o).label }}</fm-badge>
                                            @if (o.promo_code) {
                                                <code class="text-xs">{{ o.promo_code }}</code>
                                            }
                                        </p>
                                        <p class="text-sm text-fg-muted">{{ o.summary }}</p>
                                        <p class="text-xs text-fg-subtle">
                                            From {{ o.starts_on | appDate: 'd MMM yyyy'
                                            }}{{ o.ends_on ? ' to ' + (o.ends_on | appDate: 'd MMM yyyy') : ', ongoing' }}
                                        </p>
                                    </div>
                                    <button fmButton size="sm" variant="ghost" [attr.aria-label]="'Edit ' + o.title" (click)="editOffer(o)">
                                        <fm-icon name="pencil" />
                                        Edit
                                    </button>
                                    <button fmButton iconOnly size="sm" variant="ghost" [attr.aria-label]="'Delete ' + o.title" (click)="deleteOffer(o)">
                                        <fm-icon name="trash-2" />
                                    </button>
                                </li>
                            } @empty {
                                <li class="p-4"><fm-empty-state icon="sparkles" title="No offers yet" /></li>
                            }
                        </ul>
                    </fm-card>
                </ng-template>
            }

            <ng-template fmTab="photos" label="Photos" [count]="photos.value()?.length ?? null">
                <div class="mb-3 flex flex-wrap items-end gap-3">
                    @if (hq) {
                        <fm-field class="w-56" label="Branch">
                            <fm-select [ngModel]="branch()" [options]="branchOptions()" (ngModelChange)="branch.set($event)" />
                        </fm-field>
                    }
                    <fm-field class="min-w-60 flex-1" hint="Say what the photo shows, for people who cannot see it." label="Describe the new photo">
                        <input fmInput maxlength="200" [(ngModel)]="alt" />
                    </fm-field>
                    <label
                        class="fm-btn fm-btn-primary cursor-pointer"
                        [attr.aria-disabled]="!canUpload() || null"
                        [class.opacity-50]="!canUpload()"
                        [class.pointer-events-none]="!canUpload()"
                    >
                        <fm-icon name="upload" />
                        Add a photo
                        <input #file class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" [disabled]="!canUpload()" (change)="addPhoto(file)" />
                    </label>
                </div>
                @if (photoProblem()) {
                    <fm-alert class="mb-3" tone="danger">{{ photoProblem() }}</fm-alert>
                }
                @if (photos.value(); as list) {
                    <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Photos">
                        @for (g of list; track g.oid) {
                            <li class="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
                                <img class="aspect-[4/3] w-full object-cover" [alt]="g.alt" [src]="g.thumb" />
                                <div class="flex items-start gap-2 p-2">
                                    <p class="min-w-0 flex-1 text-xs">
                                        @if (hq) {
                                            <span class="font-medium">{{ g.branch.name }} ·</span>
                                        }
                                        {{ g.alt }}
                                    </p>
                                    <button fmButton iconOnly size="sm" variant="ghost" [attr.aria-label]="'Remove: ' + g.alt" (click)="removePhoto(g)">
                                        <fm-icon name="trash-2" />
                                    </button>
                                </div>
                            </li>
                        } @empty {
                            <li class="col-span-full"><fm-empty-state icon="image" title="No photos yet" /></li>
                        }
                    </ul>
                } @else {
                    <fm-skeleton height="8rem" />
                }
            </ng-template>

            <ng-template fmTab="page" label="Branch page">
                <fm-card>
                    <div class="grid gap-3">
                        @if (hq) {
                            <fm-field class="w-56" label="Branch">
                                <fm-select [ngModel]="pageBranch()" [options]="pageBranchOptions()" (ngModelChange)="pageBranch.set($event)" />
                            </fm-field>
                        }
                        <fm-field hint="Shown under the branch's name on its public page. Plain text, up to 4 000 characters." label="About the branch">
                            <textarea fmInput maxlength="4000" rows="5" [(ngModel)]="description"></textarea>
                        </fm-field>
                        <div>
                            <button fmButton variant="primary" [disabled]="hq && !pageBranch()" [loading]="savingText()" (click)="saveDescription()">
                                Save
                            </button>
                        </div>
                    </div>
                </fm-card>
            </ng-template>
        </fm-tabs>
    `
})
export class WebsitePageComponent {
    private readonly _service = inject(WebsiteService);
    private readonly _files = inject(FilesService);
    private readonly _dialog = inject(DialogService);
    private readonly _confirm = inject(ConfirmService);
    private readonly _auth = inject(AuthService);
    private readonly _active = inject(BranchContextService).active;

    protected readonly hq = inject(ActivatedRoute).snapshot.data['hq'] === true;
    protected readonly statusOf = STATUS;
    protected readonly tab = signal(this.hq ? 'posts' : 'photos');

    protected readonly posts = rxResource({ params: () => this.hq || undefined, stream: () => this._service.posts() });
    protected readonly categories = rxResource({ stream: () => this._service.categories() });
    protected readonly offers = rxResource({ params: () => this.hq || undefined, stream: () => this._service.offers() });
    protected readonly categoryNames = computed(() => (this.categories.value() ?? []).map(c => c.name).join(', ') || 'none');
    protected newCategory = '';

    /** The branches HQ can pick (the user's branch assignments). */
    private readonly _branches = computed(() =>
        (this._auth.user()?.assignments ?? []).filter(a => a.branch.kind === 'BRANCH').map(a => ({ value: a.branch.oid, label: a.branch.name }))
    );
    protected readonly branchOptions = computed<SelectOption<string>[]>(() => [{ value: '', label: 'Every branch' }, ...this._branches()]);
    protected readonly pageBranchOptions = computed<SelectOption<string>[]>(() => this._branches());
    protected readonly branch = signal('');
    protected readonly photos = rxResource({
        params: () => ({ b: this.branch(), at: this._active()?.oid }),
        stream: ({ params }) => this._service.gallery(params.b || undefined)
    });
    protected alt = '';
    protected readonly photoProblem = signal<string | null>(null);
    private readonly _uploading = signal(false);
    /** At HQ a photo belongs to one branch: choose it first. */
    protected readonly canUpload = computed(() => !this._uploading() && (!this.hq || !!this.branch()));

    protected readonly pageBranch = signal('');
    private readonly _profile = rxResource({
        params: () => (this.hq ? this.pageBranch() : (this._active()?.oid ?? '')) || undefined,
        stream: ({ params }) => this._service.branch(params)
    });
    protected description = '';
    protected readonly savingText = signal(false);

    constructor() {
        // The branch page's current text: the active branch's, or at HQ the one picked.
        effect(() => {
            this.description = this._profile.value()?.description ?? '';
        });
    }

    protected offerState(o: Offer): { label: string; tone: 'success' | 'neutral' | 'warning' | 'info' } {
        const today = new Date().toISOString().slice(0, 10);
        if (!o.published) return { label: 'Hidden', tone: 'neutral' };
        if (o.ends_on && o.ends_on < today) return { label: 'Ended', tone: 'warning' };
        if (o.starts_on > today) return { label: 'Starts later', tone: 'info' };
        return { label: 'Running', tone: 'success' };
    }

    protected editPost(post: BlogPost | null): void {
        this._dialog
            .open<PostDialogComponent, PostDialogData, BlogPost>(PostDialogComponent, { data: { post, categories: this.categories.value() ?? [] }, size: 'lg' })
            .afterClosed.pipe(filter(Boolean))
            .subscribe(() => this._changed(this.posts));
    }

    protected deletePost(p: BlogPost): void {
        this._confirm
            .ask(`Delete "${p.title}"? It leaves the site.`, { danger: true })
            .pipe(switchMap(() => this._service.deletePost(p.oid)))
            .subscribe(() => this._changed(this.posts));
    }

    protected addCategory(): void {
        const name = this.newCategory.trim();
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        this._service.addCategory(name, slug).subscribe(() => {
            this.newCategory = '';
            this.categories.reload();
        });
    }

    protected editOffer(offer: Offer | null): void {
        this._dialog
            .open<OfferDialogComponent, Offer | null, Offer>(OfferDialogComponent, { data: offer, size: 'lg' })
            .afterClosed.pipe(filter(Boolean))
            .subscribe(() => this._changed(this.offers));
    }

    protected deleteOffer(o: Offer): void {
        this._confirm
            .ask(`Delete the offer "${o.title}"?`, { danger: true })
            .pipe(switchMap(() => this._service.deleteOffer(o.oid)))
            .subscribe(() => this._changed(this.offers));
    }

    protected async addPhoto(input: HTMLInputElement): Promise<void> {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        if (this.alt.trim().length < 3) {
            this.photoProblem.set('Describe the photo first (at least 3 characters).');
            return;
        }
        this.photoProblem.set(null);
        this._uploading.set(true);
        try {
            const up = await uploadSiteImage(this._files, file);
            URL.revokeObjectURL(up.preview);
            this._service
                .addPhoto({ ...(this.hq ? { branch_oid: this.branch() } : {}), file_oid: up.oid, alt: this.alt.trim(), width: up.width, height: up.height })
                .subscribe(() => {
                    this.alt = '';
                    this._changed(this.photos);
                });
        } catch (e) {
            this.photoProblem.set(e instanceof Error ? e.message : 'The photo could not be uploaded.');
        } finally {
            this._uploading.set(false);
        }
    }

    protected removePhoto(g: GalleryPhoto): void {
        this._confirm
            .ask(`Remove this photo from ${g.branch.name}'s page?`, { danger: true })
            .pipe(switchMap(() => this._service.removePhoto(g.oid)))
            .subscribe(() => this._changed(this.photos));
    }

    protected saveDescription(): void {
        this.savingText.set(true);
        this._service.setDescription(this.description.trim() || null, this.hq ? this.pageBranch() : undefined).subscribe({
            next: () => {
                this.savingText.set(false);
            },
            error: () => this.savingText.set(false)
        });
    }

    private _changed(list: { reload(): void }): void {
        list.reload();
    }
}
