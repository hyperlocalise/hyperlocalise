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
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
  ContentEditorDocumentEditorPane,
} from "./content-editor-document-editor-pane";
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
}) {
  const intl = useIntl();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [imageLayersDirty, setImageLayersDirty] = useState(false);
  const [videoDirty, setVideoDirty] = useState(false);
  const [documentReviewBlocked, setDocumentReviewBlocked] = useState(true);
  const [saveActionsContainer, setSaveActionsContainer] = useState<HTMLDivElement | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [sourcePaneVisible, setSourcePaneVisible] = useState(() =>
    readCatFileViewSourcePaneVisible(viewerId !== "markdown"),
  );
  const [sourcePaneViewerId, setSourcePaneViewerId] = useState(viewerId);
  if (sourcePaneViewerId !== viewerId) {
    setSourcePaneViewerId(viewerId);
    setSourcePaneVisible(readCatFileViewSourcePaneVisible(viewerId !== "markdown"));
  }
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
      setAiDrawerOpen(false);
    }
  }, [hasAiContext, aiDrawerOpen]);

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
  const assetFormatLabel = viewerId
    ? viewerId.toUpperCase()
    : displayName.includes(".")
      ? (displayName.split(".").pop()?.toUpperCase() ?? "ASSET")
      : "ASSET";
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
                  onClick={() => setAiDrawerOpen(true)}
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
              {isDocumentViewer || officeKind ? <div ref={setSaveActionsContainer} /> : null}
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
                          onClick={() => setGenerateDialogOpen(true)}
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
      ) : (
        <FileViewWorkspace>
          <FileViewWorkspaceContent
            layout={sourcePaneVisible ? "split" : officeKind ? "wide" : "single"}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <Columns
                spacing="3u"
                height="full"
                alignY="stretch"
                align={sourcePaneVisible || officeKind ? "start" : "center"}
                collapseBelow="large"
              >
                {sourcePaneVisible ? (
                  <Column width="1/2">
                    <FileViewPaneColumn>{sourcePane}</FileViewPaneColumn>
                  </Column>
                ) : null}
                <Column
                  width={sourcePaneVisible ? "1/2" : officeKind ? "fluid" : "containedContent"}
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
                      {officeKind ? (
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
          onOpenChange={setGenerateDialogOpen}
          mode={generateMode}
          viewerId={viewerId}
          isSubmitting={isImageBusy}
          onSubmit={handleGenerateSubmit}
        />
      ) : null}
      {adaptiveWorkspaceEnabled && hasAiContext ? (
        <Sheet open={aiDrawerOpen} onOpenChange={setAiDrawerOpen}>
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
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
