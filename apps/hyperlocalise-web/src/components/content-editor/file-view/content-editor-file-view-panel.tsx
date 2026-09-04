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
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Loading03Icon,
  SparklesIcon,
  Upload01Icon,
  ViewIcon,
  ViewOffSlashIcon,
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
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { Spinner } from "@/components/ui/spinner";
import { Title } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { contentEditorFileViewMessages } from "./content-editor-file-view.messages";
import {
  readCatFileViewSourcePaneVisible,
  writeCatFileViewSourcePaneVisible,
} from "./content-editor-file-view-source-pane";
import { ContentEditorFileGenerateDialog } from "./content-editor-file-generate-dialog";
import {
  FileViewHeader,
  FileViewLocalePill,
  FileViewPane,
  FileViewPaneColumn,
  FileViewUnsupportedPreview,
  FileViewWorkspace,
  FileViewWorkspaceContent,
} from "./content-editor-file-view-layout";
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
      <div className="flex min-h-56 items-center justify-center border border-dashed border-border">
        <Spinner className="size-5 text-muted-foreground" />
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
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [sourcePaneVisible, setSourcePaneVisible] = useState(() =>
    readCatFileViewSourcePaneVisible(),
  );
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

    try {
      await onRegenerate({ instructions: instructions || undefined });
      setGenerateDialogOpen(false);
    } catch {
      // Keep the dialog open so the user can retry after a failed generation.
    }
  }

  function toggleSourcePane() {
    setSourcePaneVisible((current) => {
      const next = !current;
      writeCatFileViewSourcePaneVisible(next);
      return next;
    });
  }

  const targetFileActions = (
    <>
      {onRegenerate ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={!canEdit || isImageBusy}
          onClick={() => setGenerateDialogOpen(true)}
        >
          {isImageBusy ? (
            <HugeiconsIcon icon={Loading03Icon} className="animate-spin" aria-hidden />
          ) : (
            <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" aria-hidden />
          )}
          <FormattedMessage
            {...(hasTarget
              ? contentEditorFileViewMessages.regenerate
              : contentEditorFileViewMessages.generate)}
          />
        </Button>
      ) : null}
      {onUpload && uploadAccept ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!canEdit || isImageBusy}
            onClick={() => uploadInputRef.current?.click()}
          >
            <HugeiconsIcon icon={Upload01Icon} data-icon="inline-start" aria-hidden />
            <FormattedMessage {...contentEditorFileViewMessages.uploadFile} />
          </Button>
          <input
            ref={uploadInputRef}
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
        </>
      ) : null}
    </>
  );

  const hasTargetFileActions = Boolean(onRegenerate || (onUpload && uploadAccept));

  const sourcePane = (
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
        <FileViewUnsupportedPreview />
      )}
    </FileViewPane>
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      <FileViewHeader>
        <Row spacing="1.5u" alignY="center">
          {onPrevious || onNext ? (
            <Column width="content">
              <Row spacing="1u" alignY="center">
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={onPrevious}
                  disabled={!hasPreviousSegment || !onPrevious}
                  aria-label={intl.formatMessage(contentEditorFileViewMessages.previousFileAria)}
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={onNext}
                  disabled={!hasNextSegment || !onNext}
                  aria-label={intl.formatMessage(contentEditorFileViewMessages.nextFileAria)}
                >
                  <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden />
                </Button>
              </Row>
            </Column>
          ) : null}

          <Column width="fluid">
            <Row spacing="1u" alignY="center">
              <Title tagName="h1" size="xxsmall" weight="medium" lineClamp={1} title={displayName}>
                {displayName}
              </Title>
              <FileViewLocalePill>
                {segment.sourceLocale} → {segment.targetLocale}
              </FileViewLocalePill>
              {shouldShowSegmentStatusBadge(segment.status, segment.isHidden) ? (
                <SegmentStatusBadge status={segment.status} />
              ) : null}
              {segment.isHidden ? <ContentEditorHiddenStringBadge /> : null}
              {segment.isLocked ? <ContentEditorLockedStringBadge /> : null}
            </Row>
          </Column>

          <Column width="content">
            <Row spacing="1u" alignY="center">
              <Button
                type="button"
                variant="outline"
                size="xs"
                aria-pressed={sourcePaneVisible}
                onClick={toggleSourcePane}
              >
                <HugeiconsIcon
                  icon={sourcePaneVisible ? ViewOffSlashIcon : ViewIcon}
                  data-icon="inline-start"
                  aria-hidden
                />
                <FormattedMessage
                  {...(sourcePaneVisible
                    ? contentEditorFileViewMessages.hideSource
                    : contentEditorFileViewMessages.showSource)}
                />
              </Button>
              <ContentEditorWorkspaceViewSwitcherConnected size="xs" variant="outline" />
              {onApprove ? (
                <Button
                  variant="default"
                  size="xs"
                  disabled={!canTriggerApprove}
                  onClick={onApprove}
                >
                  {isApproving ? <Spinner className="size-3 text-primary-foreground" /> : null}
                  {resolvedPrimaryActionLabel}
                </Button>
              ) : null}
            </Row>
          </Column>
        </Row>
      </FileViewHeader>

      <FileViewWorkspace>
        <FileViewWorkspaceContent layout={sourcePaneVisible ? "split" : "single"}>
          <div className="flex min-h-0 flex-1 flex-col">
            <Columns
              spacing="3u"
              height="full"
              alignY="stretch"
              align={sourcePaneVisible ? "start" : "center"}
              collapseBelow="large"
            >
              {sourcePaneVisible ? (
                <Column width="1/2">
                  <FileViewPaneColumn>{sourcePane}</FileViewPaneColumn>
                </Column>
              ) : null}
              <Column width={sourcePaneVisible ? "1/2" : "containedContent"}>
                <FileViewPaneColumn>
                  <FileViewPane
                    title={
                      <FormattedMessage
                        {...contentEditorFileViewMessages.targetHeading}
                        values={{ locale: segment.targetLocale }}
                      />
                    }
                    footer={
                      !isDocumentViewer && hasTargetFileActions ? targetFileActions : undefined
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
                        footerActions={hasTargetFileActions ? targetFileActions : undefined}
                      />
                    ) : (
                      <FileViewUnsupportedPreview />
                    )}
                  </FileViewPane>
                </FileViewPaneColumn>
              </Column>
            </Columns>
          </div>
        </FileViewWorkspaceContent>
      </FileViewWorkspace>
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
