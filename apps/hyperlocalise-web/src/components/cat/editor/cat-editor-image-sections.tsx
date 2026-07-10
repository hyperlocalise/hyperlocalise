"use client";

import { ImageIcon, Loader2, RefreshCw, Upload } from "lucide-react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";
import type { CatSegment } from "@/components/cat/shared/types";

import { CatImagePreview } from "./cat-image-preview";

function isImageMode(segment: CatSegment) {
  return segment.contentKind === "image_file" || segment.contentKind === "image_url";
}

export function CatEditorImageSourceSection({
  segment,
  canEdit,
  isBusy,
  onTreatAsImage,
  onRegenerate,
}: {
  segment: CatSegment;
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
        <p
          className="truncate font-mono text-[11px] leading-5 text-muted-foreground"
          title={segment.key}
        >
          {segment.key}
        </p>
        <h3 className="text-xs font-medium text-muted-foreground">
          <FormattedMessage
            {...catEditorPanelMessages.sourceHeading}
            values={{ locale: segment.sourceLocale }}
          />
        </h3>
      </div>

      {isImageMode(segment) || treatAsImage ? (
        <CatImagePreview
          src={previewSrc}
          alt={intl.formatMessage(catEditorPanelMessages.imageSourceAlt)}
          emptyLabel={intl.formatMessage(catEditorPanelMessages.imageSourceEmpty)}
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
            size="sm"
            disabled={!canEdit || isBusy}
            onClick={() => onTreatAsImage?.(!treatAsImage)}
            title={intl.formatMessage(catEditorPanelMessages.treatAsImageTitle)}
          >
            <ImageIcon className="size-4" aria-hidden />
            <FormattedMessage
              {...(treatAsImage
                ? catEditorPanelMessages.treatAsText
                : catEditorPanelMessages.treatAsImage)}
            />
          </Button>
        ) : null}

        {isImageMode(segment) && onRegenerate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || isBusy}
            onClick={onRegenerate}
          >
            {isBusy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            <FormattedMessage {...catEditorPanelMessages.regenerateImage} />
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function CatEditorImageTargetSection({
  segment,
  canEdit,
  isBusy,
  isLoading,
  onUpload,
  onRegenerate,
}: {
  segment: CatSegment;
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
          {...catEditorPanelMessages.targetHeading}
          values={{ locale: segment.targetLocale }}
        />
      </h3>

      {isLoading ? (
        <div className="flex min-h-40 items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
        </div>
      ) : (
        <CatImagePreview
          src={previewSrc}
          alt={intl.formatMessage(catEditorPanelMessages.imageTargetAlt)}
          emptyLabel={intl.formatMessage(catEditorPanelMessages.imageTargetEmpty)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {onRegenerate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || isBusy}
            onClick={onRegenerate}
          >
            {isBusy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            <FormattedMessage {...catEditorPanelMessages.regenerateImage} />
          </Button>
        ) : null}

        {onUpload ? (
          <label
            className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground ${
              !canEdit || isBusy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Upload className="size-4" aria-hidden />
            <FormattedMessage {...catEditorPanelMessages.uploadImage} />
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
