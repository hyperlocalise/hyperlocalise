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
import { Loader2, RefreshCw, Upload, Video } from "lucide-react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { CatSegmentKeyMeta } from "@/components/cat/segment/cat-segment-key-meta";
import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";
import type { CatSegment } from "@/components/cat/shared/types";

import { CatVideoPreview } from "./cat-video-preview";

function isVideoMode(segment: CatSegment) {
  return segment.contentKind === "video_file" || segment.contentKind === "video_url";
}

export function CatEditorVideoSourceSection({
  segment,
  canEdit,
  isBusy,
  onTreatAsVideo,
  onRegenerate,
}: {
  segment: CatSegment;
  canEdit: boolean;
  isBusy?: boolean;
  onTreatAsVideo?: (treatAsVideo: boolean) => void;
  onRegenerate?: () => void;
}) {
  const intl = useIntl();
  const showTreatToggle = Boolean(
    onTreatAsVideo &&
    segment.contentKind !== "video_file" &&
    (segment.contentKind === "video_url" || segment.looksLikeVideoUrl),
  );
  const treatAsVideo = segment.contentKind === "video_url";
  const previewSrc =
    segment.contentKind === "video_file"
      ? segment.sourceAssetUrl
      : treatAsVideo
        ? (segment.sourceAssetUrl ?? segment.sourceText)
        : null;

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <CatSegmentKeyMeta segmentKey={segment.key} sourcePath={segment.sourcePath} />
        <h3 className="text-xs font-medium text-muted-foreground">
          <FormattedMessage
            {...catEditorPanelMessages.sourceHeading}
            values={{ locale: segment.sourceLocale }}
          />
        </h3>
      </div>

      {isVideoMode(segment) || treatAsVideo ? (
        <CatVideoPreview
          src={previewSrc}
          emptyLabel={intl.formatMessage(catEditorPanelMessages.videoSourceEmpty)}
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
            variant={treatAsVideo ? "secondary" : "outline"}
            size="xs"
            disabled={!canEdit || isBusy}
            onClick={() => onTreatAsVideo?.(!treatAsVideo)}
            title={intl.formatMessage(catEditorPanelMessages.treatAsVideoTitle)}
          >
            <Video className="size-3" aria-hidden />
            <FormattedMessage
              {...(treatAsVideo
                ? catEditorPanelMessages.treatAsText
                : catEditorPanelMessages.treatAsVideo)}
            />
          </Button>
        ) : null}

        {isVideoMode(segment) && onRegenerate ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!canEdit || isBusy}
            onClick={onRegenerate}
          >
            {isBusy ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3" aria-hidden />
            )}
            <FormattedMessage {...catEditorPanelMessages.regenerateVideo} />
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function CatEditorVideoTargetSection({
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
    (segment.contentKind === "video_url" && /^https?:\/\//i.test(segment.targetText)
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
        <CatVideoPreview
          src={previewSrc}
          emptyLabel={intl.formatMessage(catEditorPanelMessages.videoTargetEmpty)}
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
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3" aria-hidden />
            )}
            <FormattedMessage {...catEditorPanelMessages.regenerateVideo} />
          </Button>
        ) : null}

        {onUpload ? (
          <label
            className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded border border-input bg-background px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground ${
              !canEdit || isBusy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Upload className="size-3" aria-hidden />
            <FormattedMessage {...catEditorPanelMessages.uploadVideo} />
            <input
              type="file"
              accept="video/mp4,.mp4"
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
