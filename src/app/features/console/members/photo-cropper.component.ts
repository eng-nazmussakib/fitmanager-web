import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { ImageCropperComponent } from 'ngx-image-cropper';

import { ButtonComponent } from '@shared/ui/button/button.component';

/**
 * Crops a member photo to a square (ngx-image-cropper, browser-only: load it inside `@defer`). Emits a small
 * base64 JPEG; the form turns it into a Blob and uploads it through FilesService.
 */
@Component({
    selector: 'app-photo-cropper',
    imports: [ImageCropperComponent, ButtonComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <image-cropper
            format="jpeg"
            output="base64"
            [aspectRatio]="1"
            [imageChangedEvent]="event()"
            [maintainAspectRatio]="true"
            [resizeToWidth]="320"
            [roundCropper]="true"
            (imageCropped)="cropped.set($event.base64 ?? null)"
            (loadImageFailed)="cancelled.emit()"
        />
        <div class="mt-4 flex justify-end gap-2">
            <button fmButton (click)="cancelled.emit()">Cancel</button>
            <button fmButton variant="primary" [disabled]="!cropped()" (click)="done.emit(cropped()!)">Use photo</button>
        </div>
    `
})
export class PhotoCropperComponent {
    readonly event = input.required<Event>();
    readonly done = output<string>();
    readonly cancelled = output<void>();

    protected readonly cropped = signal<string | null>(null);
}
