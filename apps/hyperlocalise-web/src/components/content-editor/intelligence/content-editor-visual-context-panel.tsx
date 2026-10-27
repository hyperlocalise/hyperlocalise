"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { ImagesIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { ImageLightbox } from "@/components/ui/image-lightbox/image-lightbox";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadDropzone } from "@/components/ui/upload-dropzone";
import type {
  ContentEditorVisualContext,
  ContentEditorVisualContextScreenshot,
} from "@/lib/translation/content-editor-visual-context";
import { VISUAL_CONTEXT_SCREENSHOT_MAX_BYTES } from "@/lib/translation/content-editor-visual-context";

import { contentEditorVisualContextPanelMessages } from "@/components/content-editor/shared/content-editor.messages";

const VISUAL_CONTEXT_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";
const VISUAL_CONTEXT_UPLOAD_MAX_MB = VISUAL_CONTEXT_SCREENSHOT_MAX_BYTES / (1024 * 1024);

function VisualContextSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-32 rounded-full bg-skeleton" />
      <Skeleton className="aspect-[9/16] w-full rounded-xl bg-skeleton" />
    </div>
  );
}

function VisualContextScreenshotPreview({
  screenshot,
  alt,
}: {
  screenshot: ContentEditorVisualContextScreenshot;
  alt: string;
}) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={screenshot.imageUrl}
        alt={alt}
        className="block h-auto w-full"
        loading="lazy"
        decoding="async"
      />
      {screenshot.markers.map((marker, index) => (
        <span
          key={`${screenshot.id}-${index}`}
          className="pointer-events-none absolute rounded-sm border-2 border-grove-300/80 bg-grove-300/15 shadow-[0_0_0_1px_rgba(255,255,255,0.35)_inset]"
          style={{
            left: `${marker.left}%`,
            top: `${marker.top}%`,
            width: `${marker.width}%`,
            height: `${marker.height}%`,
          }}
        />
      ))}
    </>
  );
}

function VisualContextScreenshotCard({
  screenshot,
}: {
  screenshot: ContentEditorVisualContextScreenshot;
}) {
  const intl = useIntl();
  const alt =
    screenshot.name ??
    intl.formatMessage(contentEditorVisualContextPanelMessages.screenshotAltFallback);

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-background">
      {screenshot.name ? (
        <figcaption className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {screenshot.name}
        </figcaption>
      ) : null}
      <ImageLightbox
        alt={alt}
        imageUrl={screenshot.imageUrl}
        markers={screenshot.markers}
        title={screenshot.name}
        trigger={
          <div className="group relative bg-muted">
            <VisualContextScreenshotPreview screenshot={screenshot} alt={alt} />
            <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10 group-focus-visible:bg-black/10" />
          </div>
        }
      />
    </figure>
  );
}

export function ContentEditorVisualContextPanel({
  visualContext,
  isLoading = false,
  showPanel = false,
  canUpload = false,
  isUploading = false,
  onUpload,
}: {
  visualContext?: ContentEditorVisualContext;
  isLoading?: boolean;
  showPanel?: boolean;
  canUpload?: boolean;
  isUploading?: boolean;
  onUpload?: (file: File) => void | Promise<void>;
}) {
  const intl = useIntl();

  if (!showPanel) {
    return null;
  }

  const screenshots = visualContext?.screenshots ?? [];
  const showDropzone = Boolean(canUpload && onUpload);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <ImagesIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <h3 className="min-w-0 flex-1 text-sm font-medium text-foreground">
          <FormattedMessage {...contentEditorVisualContextPanelMessages.title} />
        </h3>
      </div>
      <div className="space-y-3 px-3.5 py-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          <FormattedMessage {...contentEditorVisualContextPanelMessages.description} />
        </p>

        {isLoading ? (
          <VisualContextSkeleton />
        ) : screenshots.length > 0 ? (
          <div className="space-y-3">
            {screenshots.map((screenshot) => (
              <VisualContextScreenshotCard key={screenshot.id} screenshot={screenshot} />
            ))}
          </div>
        ) : showDropzone ? null : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            <FormattedMessage {...contentEditorVisualContextPanelMessages.empty} />
          </p>
        )}

        {showDropzone && onUpload ? (
          <UploadDropzone
            accept={VISUAL_CONTEXT_UPLOAD_ACCEPT}
            compact={screenshots.length > 0}
            disabled={isUploading}
            dropTitle={intl.formatMessage(contentEditorVisualContextPanelMessages.dropOver)}
            failedTitle={intl.formatMessage(contentEditorVisualContextPanelMessages.uploadFailed)}
            hint={intl.formatMessage(contentEditorVisualContextPanelMessages.dropHint)}
            idleTitle={intl.formatMessage(contentEditorVisualContextPanelMessages.dropIdle)}
            invalidTitle={intl.formatMessage(contentEditorVisualContextPanelMessages.invalidFile)}
            maxMb={VISUAL_CONTEXT_UPLOAD_MAX_MB}
            tooBigTitle={intl.formatMessage(contentEditorVisualContextPanelMessages.fileTooLarge)}
            wide
            onUpload={onUpload}
          />
        ) : null}
      </div>
    </section>
  );
}
