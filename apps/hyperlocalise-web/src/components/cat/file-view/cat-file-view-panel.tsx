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
import type { ReactNode } from "react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { FormattedMessage, useIntl } from "react-intl";

import { CatWorkspaceViewSwitcherConnected } from "@/components/cat/workspace/cat-workspace-view-switcher-connected";
import { SegmentStatusBadge } from "@/components/cat/segment/cat-segment-status";
import type { CatSegment } from "@/components/cat/shared/types";
import type { CatFileViewerId } from "@/components/cat/workspace/cat-file-view-capabilities";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";

import { catFileViewMessages } from "./cat-file-view.messages";
import { CAT_IMAGE_FILE_UPLOAD_ACCEPT, CatImageFileViewerPane } from "./cat-image-file-viewer";

export function CatFileViewPanel({
  segment,
  viewerId,
  filename,
  canEdit = true,
  canApprove = true,
  isApproving = false,
  isImageBusy = false,
  isSegmentTargetLoading = false,
  primaryActionLabel,
  hasPreviousSegment = false,
  hasNextSegment = false,
  onPrevious,
  onNext,
  onApprove,
  onUpload,
  onRegenerate,
  className,
}: {
  segment: CatSegment;
  viewerId: CatFileViewerId | null;
  filename?: string;
  canEdit?: boolean;
  canApprove?: boolean;
  isApproving?: boolean;
  isImageBusy?: boolean;
  isSegmentTargetLoading?: boolean;
  primaryActionLabel?: string;
  hasPreviousSegment?: boolean;
  hasNextSegment?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  onApprove?: () => void;
  onUpload?: (file: File) => void;
  onRegenerate?: () => void;
  className?: string;
}) {
  const intl = useIntl();
  const resolvedPrimaryActionLabel =
    primaryActionLabel ?? intl.formatMessage(catFileViewMessages.approve);
  const hasTarget = Boolean(segment.targetAssetUrl || segment.targetText.trim());
  const canTriggerApprove = Boolean(canApprove && hasTarget && !isApproving && !isImageBusy);
  const uploadAccept = viewerId === "image" ? CAT_IMAGE_FILE_UPLOAD_ACCEPT : undefined;
  const displayName = segment.sourcePath || filename || segment.key;

  const sourceSrc = viewerId === "image" ? (segment.sourceAssetUrl ?? null) : null;
  const targetSrc =
    viewerId === "image"
      ? (segment.targetAssetUrl ??
        (/^https?:\/\//i.test(segment.targetText) ? segment.targetText : null))
      : null;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-5">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentStatusBadge status={segment.status} />
            <p className="truncate font-mono text-xs text-muted-foreground">{displayName}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {segment.sourceLocale} → {segment.targetLocale}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onPrevious || onNext ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onPrevious}
                disabled={!hasPreviousSegment || !onPrevious}
                aria-label={intl.formatMessage(catFileViewMessages.previousFileAria)}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onNext}
                disabled={!hasNextSegment || !onNext}
                aria-label={intl.formatMessage(catFileViewMessages.nextFileAria)}
              >
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
              </Button>
            </div>
          ) : null}
          <CatWorkspaceViewSwitcherConnected />
          {onApprove ? (
            <Button variant="default" size="sm" disabled={!canTriggerApprove} onClick={onApprove}>
              {isApproving ? <Spinner className="size-4 text-primary-foreground" /> : null}
              {resolvedPrimaryActionLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid h-full min-h-0 gap-4 p-4 lg:grid-cols-2 lg:gap-6 lg:p-6">
          <FileViewPane
            title={
              <FormattedMessage
                {...catFileViewMessages.targetHeading}
                values={{ locale: segment.targetLocale }}
              />
            }
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                {onRegenerate ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={!canEdit || isImageBusy}
                    onClick={onRegenerate}
                  >
                    {isImageBusy ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                    ) : (
                      <RefreshCw className="size-3" aria-hidden />
                    )}
                    <FormattedMessage {...catFileViewMessages.regenerate} />
                  </Button>
                ) : null}
                {onUpload && uploadAccept ? (
                  <label
                    className={cn(
                      "inline-flex h-6 cursor-pointer items-center gap-1 rounded border border-input bg-background px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground",
                      !canEdit || isImageBusy ? "pointer-events-none opacity-50" : "",
                    )}
                  >
                    <Upload className="size-3" aria-hidden />
                    <FormattedMessage {...catFileViewMessages.uploadFile} />
                    <input
                      type="file"
                      accept={uploadAccept}
                      className="sr-only"
                      disabled={!canEdit || isImageBusy}
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
            }
          >
            {viewerId === "image" ? (
              <CatImageFileViewerPane
                role="target"
                src={targetSrc}
                isLoading={isSegmentTargetLoading}
              />
            ) : (
              <UnsupportedPreview />
            )}
          </FileViewPane>

          <FileViewPane
            title={
              <FormattedMessage
                {...catFileViewMessages.sourceHeading}
                values={{ locale: segment.sourceLocale }}
              />
            }
          >
            {viewerId === "image" ? (
              <CatImageFileViewerPane role="source" src={sourceSrc} />
            ) : (
              <UnsupportedPreview />
            )}
          </FileViewPane>
        </div>
      </div>
    </div>
  );
}

function FileViewPane({
  title,
  toolbar,
  children,
}: {
  title: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {toolbar}
      </div>
      {children}
    </section>
  );
}

function UnsupportedPreview() {
  return (
    <div className="flex min-h-56 items-center justify-center border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground">
      <FormattedMessage {...catFileViewMessages.previewUnsupported} />
    </div>
  );
}
