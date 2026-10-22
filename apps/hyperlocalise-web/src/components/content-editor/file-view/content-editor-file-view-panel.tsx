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
import { ContentEditorVideoWorkspace } from "./content-editor-video-workspace";
import { imageViewerMessages } from "./content-editor-image-viewer.messages";
import { ContentEditorImageWorkspace } from "./content-editor-image-workspace";

import type { MarkdownSelectionAiConfig } from "@/components/markdown-editor/markdown-selection-ai.types";
import type { DocumentAssistantServices } from "@/components/document-editor/document-editor-assistant.types";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { observer } from "mobx-react-lite";
import {
  PaintBrushIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  DotsThreeIcon,
  SparkleIcon,
  UploadSimpleIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { ContentEditorWorkspaceViewSwitcherConnected } from "@/components/content-editor/workspace/content-editor-workspace-view-switcher-connected";
import { ContentEditorWorkspacePersonaSwitcherConnected } from "@/components/content-editor/workspace/content-editor-workspace-persona-switcher-connected";
import { contentEditorWorkspacePersonaMessages } from "@/components/content-editor/workspace/content-editor-workspace-persona.messages";
import { ContentEditorHiddenStringBadge } from "@/components/content-editor/segment/content-editor-hidden-string-badge";
import { ContentEditorLockedStringBadge } from "@/components/content-editor/segment/content-editor-locked-string-badge";
import {
  SegmentStatusBadge,
  shouldShowSegmentStatusBadge,
} from "@/components/content-editor/segment/content-editor-segment-status";
import type {
  ContentEditorSegment,
  ContentEditorSegmentIntelligence,
} from "@/components/content-editor/shared/types";
import type { ContentEditorFileViewerId } from "@/components/content-editor/workspace/content-editor-file-view-capabilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MarkdownContent } from "@/components/markdown-editor/markdown-editor";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { Spinner } from "@/components/ui/spinner";
import { Title } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { ContentEditorPanelErrorBoundary } from "@/components/content-editor/workspace/content-editor-panel-error-boundary";
import { ContentEditorSectionErrorBoundary } from "@/components/content-editor/workspace/content-editor-section-error-boundary";
import { useOptionalCatWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { ContentEditorWorkspaceUiStore } from "@/components/content-editor/workspace/store/content-editor-workspace-ui-store";

import { contentEditorFileViewMessages } from "./content-editor-file-view.messages";
import { useOfficeDownloadOverflowKeys } from "./use-office-download-overflow-keys";
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
  ContentEditorDocumentEditorPane,
} from "./content-editor-document-editor-pane";
import {
  CONTENT_EDITOR_HTML_FILE_UPLOAD_ACCEPT,
  ContentEditorHtmlEditorPane,
} from "./content-editor-html-editor-pane";
import { contentEditorOfficeUploadAccept } from "./content-editor-office-mime";
import {
  ContentEditorOfficeSegmentFieldsPane,
  type ContentEditorOfficeSegmentFieldsConfig,
} from "./content-editor-office-segment-fields-pane";
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

const ContentEditorPdfPreview = dynamic(
  () =>
    import("./content-editor-pdf-preview").then((module) => ({
      default: module.ContentEditorPdfPreview,
    })),
  { ssr: false },
);

function isSegmentedBinaryViewerId(
  viewerId: ContentEditorFileViewerId | null,
): viewerId is ContentEditorOfficeKind | "pdf" {
  return viewerId === "docx" || viewerId === "xlsx" || viewerId === "pptx" || viewerId === "pdf";
}

function isOfficeEditorViewerId(
  viewerId: ContentEditorFileViewerId | null,
): viewerId is ContentEditorOfficeKind {
  return viewerId === "docx" || viewerId === "xlsx" || viewerId === "pptx";
}

/** Generated Office downloads are rebuilt on request, so a new query forces a fresh copy. */
function withPreviewRevision(src: string | null, revision: number) {
  if (!src || revision === 0) {
    return src;
  }
  return `${src}${src.includes("?") ? "&" : "?"}revision=${revision}`;
}

function useFileViewUiStore() {
  const workspace = useOptionalCatWorkspace();
  const [localStore] = useState(() => new ContentEditorWorkspaceUiStore());
  return workspace?.ui ?? localStore;
}

export const ContentEditorFileViewPanel = observer(function ContentEditorFileViewPanel({
  segment,
  viewerId,
  filename,
  canEdit = true,
  canApprove = true,
  isApproving = false,
  isImageBusy = false,
  isImageGenerating = false,
  isSegmentTargetLoading = false,
  primaryActionLabel,
  hasPreviousSegment = false,
  hasNextSegment = false,
  onPrevious,
  onNext,
  onApprove,
  onUpload,
  onRegenerate,
  selectionAi,
  documentAssistant,
  className,
  adaptiveWorkspaceEnabled = false,
  isDesignerPersona = false,
  intelligence,
  officeSegments,
}: {
  segment: ContentEditorSegment;
  viewerId: ContentEditorFileViewerId | null;
  filename?: string;
  canEdit?: boolean;
  canApprove?: boolean;
  isApproving?: boolean;
  isImageBusy?: boolean;
  isImageGenerating?: boolean;
  isSegmentTargetLoading?: boolean;
  primaryActionLabel?: string;
  hasPreviousSegment?: boolean;
  hasNextSegment?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  onApprove?: () => void;
  onUpload?: (file: File) => void | Promise<void>;
  selectionAi?: MarkdownSelectionAiConfig;
  documentAssistant?: DocumentAssistantServices;
  onRegenerate?: (input: { instructions?: string }) => void | Promise<void>;
  className?: string;
  adaptiveWorkspaceEnabled?: boolean;
  isDesignerPersona?: boolean;
  intelligence?: ContentEditorSegmentIntelligence;
  /** Edits a generated Office file through its segments instead of the file itself. */
  officeSegments?: ContentEditorOfficeSegmentFieldsConfig;
}) {
  const intl = useIntl();
  const [previewRevision, setPreviewRevision] = useState(0);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const ui = useFileViewUiStore();
  ui.applyFileViewViewer(viewerId);
  const setImageLayersDirty = useCallback(
    (dirty: boolean) => ui.setFileViewImageLayersDirty(dirty),
    [ui],
  );
  const setVideoDirty = useCallback((dirty: boolean) => ui.setFileViewVideoDirty(dirty), [ui]);
  const setDocumentReviewBlocked = useCallback(
    (blocked: boolean) => ui.setFileViewDocumentReviewBlocked(blocked),
    [ui],
  );
  const imageLayersDirty = ui.fileViewImageLayersDirty;
  const videoDirty = ui.fileViewVideoDirty;
  const documentReviewBlocked = ui.fileViewDocumentReviewBlocked;
  const [saveActionsContainer, setSaveActionsContainer] = useState<HTMLDivElement | null>(null);
  const generateDialogOpen = ui.fileViewGenerateDialogOpen;
  const aiDrawerOpen = ui.fileViewAiDrawerOpen;
  const isDocumentViewer = viewerId === "markdown" || viewerId === "html";
  const sourcePaneVisible = ui.fileViewSourcePaneVisible;
  const agentBadges = [
    intelligence?.locationBreadcrumb,
    intelligence?.componentName,
    intelligence?.filePath,
  ].filter(Boolean);
  const hasAiContext =
    adaptiveWorkspaceEnabled &&
    Boolean(
      intelligence?.productMeaning?.trim() ||
      intelligence?.agentContext?.trim() ||
      agentBadges.length > 0,
    );

  useEffect(() => {
    if (!hasAiContext && aiDrawerOpen) {
      ui.setFileViewAiDrawerOpen(false);
    }
  }, [hasAiContext, aiDrawerOpen, ui]);

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
          : viewerId === "html"
            ? CONTENT_EDITOR_HTML_FILE_UPLOAD_ACCEPT
            : contentEditorOfficeUploadAccept(viewerId);
  const displayName = segment.sourcePath || filename || segment.key;
  const assetFormatLabel = viewerId
    ? viewerId.toUpperCase()
    : displayName.includes(".")
      ? (displayName.split(".").pop()?.toUpperCase() ?? "ASSET")
      : "ASSET";
  const segmentedBinaryKind = isSegmentedBinaryViewerId(viewerId) ? viewerId : null;
  const officeKind = isOfficeEditorViewerId(viewerId) ? viewerId : null;
  const isPdfViewer = segmentedBinaryKind === "pdf";
  const pdfOverflowKeys = useOfficeDownloadOverflowKeys(
    isPdfViewer && officeSegments ? segment.targetAssetUrl : null,
  );
  const isMediaViewer = viewerId === "image" || viewerId === "video";

  const sourceSrc =
    isMediaViewer || segmentedBinaryKind || isDocumentViewer
      ? (segment.sourceAssetUrl ?? null)
      : null;
  const targetSrc =
    isMediaViewer || segmentedBinaryKind || isDocumentViewer
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
      ui.setFileViewGenerateDialogOpen(false);
    } catch {
      // Keep the dialog open so the user can retry after a failed generation.
    }
  }

  function toggleSourcePane() {
    ui.toggleFileViewSourcePane();
  }

  const targetFileActions = (
    <>
      {onUpload && uploadAccept ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!canEdit || isImageBusy}
            onClick={() => uploadInputRef.current?.click()}
          >
            <UploadSimpleIcon data-icon="inline-start" aria-hidden />
            <FormattedMessage
              {...(viewerId === "image"
                ? imageViewerMessages.upload
                : contentEditorFileViewMessages.uploadFile)}
            />
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
                void onUpload(file);
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
      ) : isPdfViewer ? (
        <ContentEditorPdfPreview
          url={sourceSrc}
          title={intl.formatMessage(contentEditorFileViewMessages.sourceHeading, {
            locale: segment.sourceLocale,
          })}
        />
      ) : officeKind ? (
        <ContentEditorOfficeFileViewerPane
          kind={officeKind}
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
        <div className="flex w-full min-w-0 flex-wrap items-center gap-3">
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
                  <ArrowLeftIcon aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={onNext}
                  disabled={!hasNextSegment || !onNext}
                  aria-label={intl.formatMessage(contentEditorFileViewMessages.nextFileAria)}
                >
                  <ArrowRightIcon aria-hidden />
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
              {adaptiveWorkspaceEnabled && isDesignerPersona ? (
                <Badge
                  variant="outline"
                  className="hidden items-center gap-1 border-blue-500/30 bg-blue-500/10 text-xs font-normal text-blue-600 sm:inline-flex dark:text-blue-400"
                >
                  <PaintBrushIcon className="size-3" />
                  <FormattedMessage {...contentEditorWorkspacePersonaMessages.designerPersona} />
                </Badge>
              ) : null}
            </Row>
          </Column>

          <div className="max-w-full">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                aria-pressed={sourcePaneVisible}
                onClick={toggleSourcePane}
              >
                {sourcePaneVisible ? (
                  <EyeSlashIcon data-icon="inline-start" aria-hidden />
                ) : (
                  <EyeIcon data-icon="inline-start" aria-hidden />
                )}
                <FormattedMessage
                  {...(sourcePaneVisible
                    ? isDocumentViewer || isMediaViewer
                      ? contentEditorFileViewMessages.closeComparison
                      : contentEditorFileViewMessages.hideSource
                    : isDocumentViewer || isMediaViewer
                      ? contentEditorFileViewMessages.compareOriginal
                      : contentEditorFileViewMessages.showSource)}
                />
              </Button>
              {adaptiveWorkspaceEnabled && hasAiContext ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => ui.setFileViewAiDrawerOpen(true)}
                  className={cn(
                    "gap-1",
                    aiDrawerOpen &&
                      "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
                  )}
                  aria-label={intl.formatMessage({
                    defaultMessage: "AI asset context",
                    id: "bz08WHCwL2",
                    description: "Accessible label for AI context button in file view",
                  })}
                >
                  <SparkleIcon data-icon="inline-start" className="size-3.5 text-blue-500" />
                  <FormattedMessage
                    defaultMessage="AI Context"
                    id="HCZzZ6mMQr"
                    description="Button in file view header to open the AI Context drawer"
                  />
                </Button>
              ) : null}
              {adaptiveWorkspaceEnabled ? (
                <ContentEditorWorkspacePersonaSwitcherConnected size="xs" variant="outline" />
              ) : null}
              <ContentEditorWorkspaceViewSwitcherConnected size="xs" variant="outline" />
              {isDocumentViewer || segmentedBinaryKind ? (
                <div ref={setSaveActionsContainer} />
              ) : null}
              {!isMediaViewer && hasTargetFileActions ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={intl.formatMessage(
                          contentEditorFileViewMessages.documentActions,
                        )}
                      />
                    }
                  >
                    <DotsThreeIcon aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      {onRegenerate ? (
                        <DropdownMenuItem
                          disabled={!canEdit || isImageBusy}
                          onClick={() => ui.setFileViewGenerateDialogOpen(true)}
                        >
                          <FormattedMessage
                            {...(hasTarget
                              ? contentEditorFileViewMessages.regenerate
                              : contentEditorFileViewMessages.generate)}
                          />
                        </DropdownMenuItem>
                      ) : null}
                      {onUpload && uploadAccept ? (
                        <DropdownMenuItem
                          disabled={!canEdit || isImageBusy}
                          onClick={() => uploadInputRef.current?.click()}
                        >
                          <FormattedMessage {...contentEditorFileViewMessages.uploadFile} />
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {onApprove ? (
                <Button
                  variant="default"
                  size="xs"
                  disabled={
                    !canTriggerApprove ||
                    (isDocumentViewer && documentReviewBlocked) ||
                    (viewerId === "image" && imageLayersDirty) ||
                    (viewerId === "video" && videoDirty)
                  }
                  onClick={onApprove}
                >
                  {isApproving ? <Spinner className="size-3 text-primary-foreground" /> : null}
                  {resolvedPrimaryActionLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </FileViewHeader>

      {adaptiveWorkspaceEnabled && isDesignerPersona ? (
        <div className="flex shrink-0 items-center justify-between border-b border-border/40 bg-muted/20 px-4 py-1.5 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
              {assetFormatLabel}
            </span>
            <span className="text-border">·</span>
            <span className="max-w-[200px] truncate sm:max-w-sm">{displayName}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
            <span>{segment.sourceLocale}</span>
            <span className="text-muted-foreground/70">
              (<FormattedMessage {...contentEditorFileViewMessages.originalLocaleLabel} />)
            </span>
            <span>→</span>
            <span>{segment.targetLocale}</span>
            <span className="text-muted-foreground/70">
              (<FormattedMessage {...contentEditorFileViewMessages.localizedLocaleLabel} />)
            </span>
          </div>
        </div>
      ) : null}

      <ContentEditorPanelErrorBoundary
        scope="editor"
        className="flex-1"
        resetKeys={[segment.id, segment.targetLocale, viewerId]}
      >
        {viewerId === "image" ? (
          <ContentEditorImageWorkspace
            key={`${segment.id}:${sourceSrc}:${segment.targetLocale}`}
            sourceSrc={sourceSrc}
            targetSrc={targetSrc}
            sourceLocale={segment.sourceLocale}
            targetLocale={segment.targetLocale}
            sourcePaneVisible={sourcePaneVisible}
            canEdit={canEdit}
            isBusy={isImageBusy}
            isGenerating={isImageGenerating}
            isLoading={isSegmentTargetLoading}
            actions={hasTargetFileActions ? targetFileActions : null}
            onDirtyChange={setImageLayersDirty}
            onRegenerate={onRegenerate}
          />
        ) : viewerId === "video" ? (
          <ContentEditorVideoWorkspace
            key={`${segment.id}:${sourceSrc}:${segment.targetLocale}`}
            sourceSrc={sourceSrc}
            targetSrc={targetSrc}
            sourceLocale={segment.sourceLocale}
            targetLocale={segment.targetLocale}
            sourcePaneVisible={sourcePaneVisible}
            canEdit={canEdit}
            isBusy={isImageBusy}
            isLoading={isSegmentTargetLoading}
            actions={hasTargetFileActions ? targetFileActions : null}
            onDirtyChange={setVideoDirty}
            onRegenerate={onRegenerate}
          />
        ) : viewerId === "html" ? (
          <ContentEditorHtmlEditorPane
            key={segment.id}
            documentKey={`${segment.id}:${segment.targetLocale}`}
            sourceSrc={sourceSrc}
            targetSrc={targetSrc}
            filename={displayName}
            sourceLocale={segment.sourceLocale}
            targetLocale={segment.targetLocale}
            isLoading={isSegmentTargetLoading}
            canEdit={canEdit}
            splitView={sourcePaneVisible}
            onSave={onUpload}
            saveActionsContainer={saveActionsContainer}
            onReviewBlockedChange={setDocumentReviewBlocked}
          />
        ) : isDocumentViewer ? (
          <ContentEditorDocumentEditorPane
            key={segment.id}
            documentKey={`${segment.id}:${segment.targetLocale}`}
            sourceSrc={sourceSrc}
            targetSrc={targetSrc}
            filename={displayName}
            sourceLocale={segment.sourceLocale}
            targetLocale={segment.targetLocale}
            isLoading={isSegmentTargetLoading}
            canEdit={canEdit}
            splitView={sourcePaneVisible}
            onSave={onUpload}
            saveActionsContainer={saveActionsContainer}
            onReviewBlockedChange={setDocumentReviewBlocked}
            selectionAi={selectionAi}
            assistant={documentAssistant}
          />
        ) : segmentedBinaryKind && officeSegments ? (
          <FileViewWorkspace>
            <FileViewWorkspaceContent layout="split">
              <div className="flex min-h-0 flex-1 flex-col">
                <Columns
                  spacing="3u"
                  height="full"
                  alignY="stretch"
                  align="start"
                  collapseBelow="large"
                >
                  <Column width="1/2">
                    <FileViewPaneColumn>
                      <ContentEditorOfficeSegmentFieldsPane
                        {...officeSegments}
                        overflowKeys={isPdfViewer ? pdfOverflowKeys : undefined}
                        onSaveDrafts={async (segmentIds) => {
                          await officeSegments.onSaveDrafts(segmentIds);
                          setPreviewRevision((revision) => revision + 1);
                        }}
                      />
                    </FileViewPaneColumn>
                  </Column>
                  <Column width="1/2">
                    <FileViewPaneColumn>
                      {sourcePaneVisible ? (
                        sourcePane
                      ) : (
                        <FileViewPane
                          title={
                            <FormattedMessage
                              {...contentEditorFileViewMessages.targetHeading}
                              values={{ locale: segment.targetLocale }}
                            />
                          }
                        >
                          {isPdfViewer ? (
                            <ContentEditorPdfPreview
                              url={withPreviewRevision(targetSrc, previewRevision)}
                              title={intl.formatMessage(
                                contentEditorFileViewMessages.targetHeading,
                                {
                                  locale: segment.targetLocale,
                                },
                              )}
                            />
                          ) : officeKind ? (
                            <ContentEditorOfficeFileViewerPane
                              key={previewRevision}
                              kind={officeKind}
                              role="target"
                              src={withPreviewRevision(targetSrc, previewRevision)}
                              seedSrc={sourceSrc}
                              filename={displayName}
                              isLoading={isSegmentTargetLoading}
                              canEdit={false}
                            />
                          ) : (
                            <FileViewUnsupportedPreview />
                          )}
                        </FileViewPane>
                      )}
                    </FileViewPaneColumn>
                  </Column>
                </Columns>
              </div>
            </FileViewWorkspaceContent>
          </FileViewWorkspace>
        ) : (
          <FileViewWorkspace>
            <FileViewWorkspaceContent
              layout={sourcePaneVisible ? "split" : segmentedBinaryKind ? "wide" : "single"}
            >
              <div className="flex min-h-0 flex-1 flex-col">
                <Columns
                  spacing="3u"
                  height="full"
                  alignY="stretch"
                  align={sourcePaneVisible || segmentedBinaryKind ? "start" : "center"}
                  collapseBelow="large"
                >
                  {sourcePaneVisible ? (
                    <Column width="1/2">
                      <FileViewPaneColumn>{sourcePane}</FileViewPaneColumn>
                    </Column>
                  ) : null}
                  <Column
                    width={
                      sourcePaneVisible ? "1/2" : segmentedBinaryKind ? "fluid" : "containedContent"
                    }
                  >
                    <FileViewPaneColumn>
                      <FileViewPane
                        title={
                          <FormattedMessage
                            {...contentEditorFileViewMessages.targetHeading}
                            values={{ locale: segment.targetLocale }}
                          />
                        }
                      >
                        {isPdfViewer ? (
                          <ContentEditorPdfPreview
                            url={targetSrc}
                            title={intl.formatMessage(contentEditorFileViewMessages.targetHeading, {
                              locale: segment.targetLocale,
                            })}
                          />
                        ) : officeKind ? (
                          <ContentEditorOfficeFileViewerPane
                            kind={officeKind}
                            role="target"
                            src={targetSrc}
                            seedSrc={sourceSrc}
                            filename={displayName}
                            isLoading={isSegmentTargetLoading}
                            canEdit={canEdit}
                            isBusy={isImageBusy}
                            onSave={onUpload}
                            saveActionsContainer={saveActionsContainer}
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
        )}
      </ContentEditorPanelErrorBoundary>
      {!isMediaViewer && onUpload && uploadAccept ? (
        <input
          ref={uploadInputRef}
          type="file"
          accept={uploadAccept}
          className="sr-only"
          aria-label={intl.formatMessage(contentEditorFileViewMessages.uploadFile)}
          disabled={!canEdit || isImageBusy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onUpload(file);
            event.currentTarget.value = "";
          }}
        />
      ) : null}
      {onRegenerate && !isMediaViewer ? (
        <ContentEditorFileGenerateDialog
          open={generateDialogOpen}
          onOpenChange={(open) => ui.setFileViewGenerateDialogOpen(open)}
          mode={generateMode}
          viewerId={viewerId}
          isSubmitting={isImageBusy}
          onSubmit={handleGenerateSubmit}
        />
      ) : null}
      {adaptiveWorkspaceEnabled && hasAiContext ? (
        <Sheet open={aiDrawerOpen} onOpenChange={(open) => ui.setFileViewAiDrawerOpen(open)}>
          <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
            <SheetHeader className="border-b border-border px-6 py-4">
              <div className="flex items-center gap-2">
                <SparkleIcon className="size-4 text-blue-500" />
                <SheetTitle className="text-base font-medium">
                  <FormattedMessage
                    defaultMessage="Asset Intelligence"
                    id="ZsbAToAoYu"
                    description="Title for AI Context drawer in file view"
                  />
                </SheetTitle>
              </div>
              <SheetDescription className="text-xs text-muted-foreground">
                <FormattedMessage
                  defaultMessage="AI-derived context, placement, and product meaning for this visual asset"
                  id="HmIchM6Zb8"
                  description="Description for AI Context drawer in file view"
                />
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
              <ContentEditorSectionErrorBoundary
                section="fileView.aiContext"
                resetKeys={[segment.id]}
              >
                {intelligence?.productMeaning?.trim() ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <FormattedMessage
                        defaultMessage="Product Meaning & Intent"
                        id="wEsY0WRe0u"
                        description="Section title for product meaning in AI drawer"
                      />
                    </h4>
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-foreground">
                      <MarkdownContent value={intelligence.productMeaning} />
                    </div>
                  </div>
                ) : null}

                {intelligence?.agentContext?.trim() ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <FormattedMessage
                        defaultMessage="Repository & Code Context"
                        id="N6HeARlaSS"
                        description="Section title for code context in AI drawer"
                      />
                    </h4>
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-foreground">
                      <MarkdownContent value={intelligence.agentContext} />
                    </div>
                  </div>
                ) : null}

                {agentBadges.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <FormattedMessage
                        defaultMessage="Asset Placement"
                        id="gTSRgtU4sZ"
                        description="Section title for placement in AI drawer"
                      />
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {intelligence?.locationBreadcrumb ? (
                        <Badge variant="outline" className="text-xs font-normal">
                          {intelligence.locationBreadcrumb}
                        </Badge>
                      ) : null}
                      {intelligence?.componentName ? (
                        <Badge variant="outline" className="text-xs font-normal">
                          {intelligence.componentName}
                        </Badge>
                      ) : null}
                      {intelligence?.filePath ? (
                        <Badge variant="outline" className="font-mono text-xs font-normal">
                          {intelligence.filePath}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </ContentEditorSectionErrorBoundary>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
});
