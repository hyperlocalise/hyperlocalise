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
import { useState } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Loading03Icon,
  SparklesIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { ContentEditorWorkspaceViewSwitcherConnected } from "@/components/content-editor/workspace/content-editor-workspace-view-switcher-connected";
import { ContentEditorHiddenStringBadge } from "@/components/content-editor/segment/content-editor-hidden-string-badge";
import { ContentEditorLockedStringBadge } from "@/components/content-editor/segment/content-editor-locked-string-badge";
import {
  SegmentStatusBadge,
  shouldShowSegmentStatusBadge,
} from "@/components/content-editor/segment/content-editor-segment-status";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";
import type { ContentEditorFileViewerId } from "@/components/content-editor/workspace/content-editor-file-view-capabilities";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";

import { contentEditorFileViewMessages } from "./content-editor-file-view.messages";
import { ContentEditorFileGenerateDialog } from "./content-editor-file-generate-dialog";
import {
  CAT_IMAGE_FILE_UPLOAD_ACCEPT,
  ContentEditorImageFileViewerPane,
} from "./content-editor-image-file-viewer";
import {
  CAT_VIDEO_FILE_UPLOAD_ACCEPT,
  ContentEditorVideoFileViewerPane,
} from "./content-editor-video-file-viewer";
import {
  CONTENT_EDITOR_DOCUMENT_FILE_UPLOAD_ACCEPT,
  ContentEditorDocumentFileViewerPane,
} from "./content-editor-document-file-viewer";
import { contentEditorOfficeUploadAccept } from "./content-editor-office-mime";
import type { ContentEditorOfficeKind } from "./content-editor-office-convert";

const ContentEditorOfficeFileViewerPane = dynamic(
  () =>
    import("./content-editor-office-file-viewer").then((module) => ({
      default: module.ContentEditorOfficeFileViewerPane,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-56 items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
        <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      </div>
    ),
  },
);

function isOfficeViewerId(
  viewerId: ContentEditorFileViewerId | null,
): viewerId is ContentEditorOfficeKind {
  return viewerId === "docx" || viewerId === "xlsx" || viewerId === "pptx";
}

export function ContentEditorFileViewPanel({
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
  segment: ContentEditorSegment;
  viewerId: ContentEditorFileViewerId | null;
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
  onRegenerate?: (input: { instructions?: string }) => void | Promise<void>;
  className?: string;
}) {
  const intl = useIntl();
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const resolvedPrimaryActionLabel =
    primaryActionLabel ?? intl.formatMessage(contentEditorFileViewMessages.approve);
  const hasTarget = Boolean(segment.targetAssetUrl || segment.targetText.trim());
  const canTriggerApprove = Boolean(canApprove && hasTarget && !isApproving && !isImageBusy);
  const uploadAccept =
    viewerId === "image"
      ? CAT_IMAGE_FILE_UPLOAD_ACCEPT
      : viewerId === "video"
        ? CAT_VIDEO_FILE_UPLOAD_ACCEPT
        : viewerId === "markdown"
          ? CONTENT_EDITOR_DOCUMENT_FILE_UPLOAD_ACCEPT
          : contentEditorOfficeUploadAccept(viewerId);
  const displayName = segment.sourcePath || filename || segment.key;
  const officeKind = isOfficeViewerId(viewerId) ? viewerId : null;
  const isMediaViewer = viewerId === "image" || viewerId === "video";
  const isDocumentViewer = viewerId === "markdown";

  const sourceSrc =
    isMediaViewer || officeKind || isDocumentViewer ? (segment.sourceAssetUrl ?? null) : null;
  const targetSrc =
    isMediaViewer || officeKind || isDocumentViewer
      ? (segment.targetAssetUrl ??
        (/^https?:\/\//i.test(segment.targetText) ? segment.targetText : null))
      : null;
  const generateMode = hasTarget ? "regenerate" : "generate";

  async function handleGenerateSubmit(instructions: string) {
    if (!onRegenerate) {
      return;
    }
    await onRegenerate({ instructions: instructions || undefined });
    setGenerateDialogOpen(false);
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-5">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {shouldShowSegmentStatusBadge(segment.status, segment.isHidden) ? (
              <SegmentStatusBadge status={segment.status} />
            ) : null}
            {segment.isHidden ? <ContentEditorHiddenStringBadge /> : null}
            {segment.isLocked ? <ContentEditorLockedStringBadge /> : null}
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
                aria-label={intl.formatMessage(contentEditorFileViewMessages.previousFileAria)}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onNext}
                disabled={!hasNextSegment || !onNext}
                aria-label={intl.formatMessage(contentEditorFileViewMessages.nextFileAria)}
              >
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
              </Button>
            </div>
          ) : null}
          <ContentEditorWorkspaceViewSwitcherConnected />
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
                {...contentEditorFileViewMessages.sourceHeading}
                values={{ locale: segment.sourceLocale }}
              />
            }
          >
            {viewerId === "image" ? (
              <ContentEditorImageFileViewerPane role="source" src={sourceSrc} />
            ) : viewerId === "video" ? (
              <ContentEditorVideoFileViewerPane role="source" src={sourceSrc} />
            ) : officeKind ? (
              <ContentEditorOfficeFileViewerPane
                kind={officeKind}
                role="source"
                src={sourceSrc}
                filename={displayName}
                canEdit={false}
              />
            ) : isDocumentViewer ? (
              <ContentEditorDocumentFileViewerPane
                role="source"
                src={sourceSrc}
                filename={displayName}
                canEdit={false}
              />
            ) : (
              <UnsupportedPreview />
            )}
          </FileViewPane>

          <FileViewPane
            title={
              <FormattedMessage
                {...contentEditorFileViewMessages.targetHeading}
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
                    onClick={() => setGenerateDialogOpen(true)}
                  >
                    {isImageBusy ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        className="size-3 animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <HugeiconsIcon icon={SparklesIcon} className="size-3" aria-hidden />
                    )}
                    <FormattedMessage
                      {...(hasTarget
                        ? contentEditorFileViewMessages.regenerate
                        : contentEditorFileViewMessages.generate)}
                    />
                  </Button>
                ) : null}
                {onUpload && uploadAccept ? (
                  <label
                    className={cn(
                      "inline-flex h-6 cursor-pointer items-center gap-1 rounded border border-input bg-background px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground",
                      !canEdit || isImageBusy ? "pointer-events-none opacity-50" : "",
                    )}
                  >
                    <HugeiconsIcon icon={Upload01Icon} className="size-3" aria-hidden />
                    <FormattedMessage {...contentEditorFileViewMessages.uploadFile} />
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
              <ContentEditorImageFileViewerPane
                role="target"
                src={targetSrc}
                isLoading={isSegmentTargetLoading}
              />
            ) : viewerId === "video" ? (
              <ContentEditorVideoFileViewerPane
                role="target"
                src={targetSrc}
                isLoading={isSegmentTargetLoading}
              />
            ) : officeKind ? (
              <ContentEditorOfficeFileViewerPane
                kind={officeKind}
                role="target"
                src={targetSrc}
                filename={displayName}
                isLoading={isSegmentTargetLoading}
                canEdit={canEdit}
                isBusy={isImageBusy}
                onSave={onUpload}
              />
            ) : isDocumentViewer ? (
              <ContentEditorDocumentFileViewerPane
                role="target"
                src={targetSrc}
                seedSrc={sourceSrc}
                filename={displayName}
                isLoading={isSegmentTargetLoading}
                canEdit={canEdit}
                isBusy={isImageBusy}
                onSave={onUpload}
              />
            ) : (
              <UnsupportedPreview />
            )}
          </FileViewPane>
        </div>
      </div>
      {onRegenerate ? (
        <ContentEditorFileGenerateDialog
          open={generateDialogOpen}
          onOpenChange={setGenerateDialogOpen}
          mode={generateMode}
          viewerId={viewerId}
          isSubmitting={isImageBusy}
          onSubmit={handleGenerateSubmit}
        />
      ) : null}
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
      <FormattedMessage {...contentEditorFileViewMessages.previewUnsupported} />
    </div>
  );
}
