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
import { Image01Icon, Loading03Icon, RefreshIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { ContentEditorSegmentKeyMeta } from "@/components/content-editor/segment/content-editor-segment-key-meta";
import { contentEditorEditorPanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

import { ContentEditorImagePreview } from "./content-editor-image-preview";

function isImageMode(segment: ContentEditorSegment) {
  return segment.contentKind === "image_file" || segment.contentKind === "image_url";
}

export function ContentEditorEditorImageSourceSection({
  segment,
  canEdit,
  isBusy,
  onTreatAsImage,
  onRegenerate,
}: {
  segment: ContentEditorSegment;
  canEdit: boolean;
  isBusy?: boolean;
  onTreatAsImage?: (treatAsImage: boolean) => void;
  onRegenerate?: () => void;
}) {
  const intl = useIntl();
  const showTreatToggle = Boolean(
    onTreatAsImage &&
    segment.contentKind !== "image_file" &&
    (segment.contentKind === "image_url" || segment.looksLikeImageUrl),
  );
  const treatAsImage = segment.contentKind === "image_url";
  const previewSrc =
    segment.contentKind === "image_file"
      ? segment.sourceAssetUrl
      : treatAsImage
        ? (segment.sourceAssetUrl ?? segment.sourceText)
        : null;

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <ContentEditorSegmentKeyMeta segmentKey={segment.key} sourcePath={segment.sourcePath} />
        <h3 className="text-xs font-medium text-muted-foreground">
          <FormattedMessage
            {...contentEditorEditorPanelMessages.sourceHeading}
            values={{ locale: segment.sourceLocale }}
          />
        </h3>
      </div>

      {isImageMode(segment) || treatAsImage ? (
        <ContentEditorImagePreview
          src={previewSrc}
          alt={intl.formatMessage(contentEditorEditorPanelMessages.imageSourceAlt)}
          emptyLabel={intl.formatMessage(contentEditorEditorPanelMessages.imageSourceEmpty)}
        />
      ) : (
        <p className="break-all text-pretty text-base leading-relaxed text-foreground lg:text-lg">
          {segment.sourceText}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {showTreatToggle ? (
          <Button
            type="button"
            variant={treatAsImage ? "secondary" : "outline"}
            size="xs"
            disabled={!canEdit || isBusy}
            onClick={() => onTreatAsImage?.(!treatAsImage)}
            title={intl.formatMessage(contentEditorEditorPanelMessages.treatAsImageTitle)}
          >
            <HugeiconsIcon icon={Image01Icon} className="size-3" aria-hidden />
            <FormattedMessage
              {...(treatAsImage
                ? contentEditorEditorPanelMessages.treatAsText
                : contentEditorEditorPanelMessages.treatAsImage)}
            />
          </Button>
        ) : null}

        {isImageMode(segment) && onRegenerate ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!canEdit || isBusy}
            onClick={onRegenerate}
          >
            {isBusy ? (
              <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" aria-hidden />
            ) : (
              <HugeiconsIcon icon={RefreshIcon} className="size-3" aria-hidden />
            )}
            <FormattedMessage {...contentEditorEditorPanelMessages.regenerateImage} />
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function ContentEditorEditorImageTargetSection({
  segment,
  canEdit,
  isBusy,
  isLoading,
  onUpload,
  onRegenerate,
}: {
  segment: ContentEditorSegment;
  canEdit: boolean;
  isBusy?: boolean;
  isLoading?: boolean;
  onUpload?: (file: File) => void;
  onRegenerate?: () => void;
}) {
  const intl = useIntl();
  const previewSrc =
    segment.targetAssetUrl ??
    (segment.contentKind === "image_url" && /^https?:\/\//i.test(segment.targetText)
      ? segment.targetText
      : null);

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium text-muted-foreground">
        <FormattedMessage
          {...contentEditorEditorPanelMessages.targetHeading}
          values={{ locale: segment.targetLocale }}
        />
      </h3>

      {isLoading ? (
        <div className="flex min-h-40 items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
          <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" aria-hidden />
        </div>
      ) : (
        <ContentEditorImagePreview
          src={previewSrc}
          alt={intl.formatMessage(contentEditorEditorPanelMessages.imageTargetAlt)}
          emptyLabel={intl.formatMessage(contentEditorEditorPanelMessages.imageTargetEmpty)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {onRegenerate ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!canEdit || isBusy}
            onClick={onRegenerate}
          >
            {isBusy ? (
              <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" aria-hidden />
            ) : (
              <HugeiconsIcon icon={RefreshIcon} className="size-3" aria-hidden />
            )}
            <FormattedMessage {...contentEditorEditorPanelMessages.regenerateImage} />
          </Button>
        ) : null}

        {onUpload ? (
          <label
            className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded border border-input bg-background px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground ${
              !canEdit || isBusy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <HugeiconsIcon icon={Upload01Icon} className="size-3" aria-hidden />
            <FormattedMessage {...contentEditorEditorPanelMessages.uploadImage} />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={!canEdit || isBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onUpload(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </label>
        ) : null}
      </div>
    </section>
  );
}
