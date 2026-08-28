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
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { FormattedMessage } from "react-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/primitives/cn";

import { CatEditorPanel } from "@/components/cat/editor/cat-editor-panel";
import { CatFileViewPanel } from "@/components/cat/file-view/cat-file-view-panel";
import { CatIntelligencePanel } from "@/components/cat/intelligence/cat-intelligence-panel";
import { resolveCatLinkedIssueTranslationKeyId } from "@/components/cat/issues/cat-linked-issue-translation-key";
import { CatEditorIssuesSection } from "@/components/cat/issues/cat-editor-issues-section";
import { CatQueuePanel } from "@/components/cat/queue/cat-queue-panel";
import { CatSegmentKeyMeta } from "@/components/cat/segment/cat-segment-key-meta";
import { CatSideBySidePanel } from "@/components/cat/side-by-side/cat-side-by-side-panel";
import type { CatWorkspaceViewProps } from "@/components/cat/shared/dependencies";
import { catWorkspaceMessages } from "@/components/cat/shared/cat.messages";

import { resolveCatFileViewCapabilities } from "./cat-file-view-capabilities";
import { CatPanelErrorBoundary } from "./cat-panel-error-boundary";
import { useCatWorkspace } from "./cat-workspace-context";
import { catWorkspaceViewMessages } from "./cat-workspace.messages";
import { CatComfortableResizableLayout } from "./cat-workspace-resizable-layout";
import { resolveSegmentIntelligenceForDisplay } from "./store/cat-workspace-store-utils";

const COMPACT_WORKSPACE_QUERY = "(max-width: 1023px)";

type CatWorkspacePanel = "edit" | "queue" | "ai";

function useIsCompactWorkspace() {
  const [isCompact, setIsCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia(COMPACT_WORKSPACE_QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_WORKSPACE_QUERY);
    const sync = () => setIsCompact(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener("change", sync);
    return () => {
      mediaQuery.removeEventListener("change", sync);
    };
  }, []);

  return isCompact;
}

export const CatWorkspaceView = observer(function CatWorkspaceView({
  shell,
  queueSegments,
  selectedSegment,
  dependencies,
  isValidating: _isValidating = false,
  isApproving = false,
  isSavingDraft = false,
  isPostingComment = false,
  isResolvingComment = false,
  resolvingCommentId = null,
  commentPostError,
  isLookingUpContext = false,
  isConcordanceLoading = false,
  isVisualContextLoading = false,
  isAiSuggestionLoading = false,
  isFormatChecksLoading = false,
  canLookupContext = false,
  canUseAiRecommendation = false,
  showAgentContext = false,
  showVisualContext = false,
  revealedAgentContextSegmentIds,
  dirtySegmentIds,
  className,
  queueSearch,
  isQueueFetchingPage = false,
  isQueueLoading = false,
  isCommentsLoading = false,
  isSegmentTargetLoading = false,
  isImageBusy = false,
  isMaxLengthSaving = false,
  queuePagination = null,
  hasMoreQueue = false,
  onLoadMoreQueue,
  queueFilter,
  checkedSegmentIds,
  onToggleSegmentChecked,
  buildSegmentShareUrl,
  onIntelligencePanelVisible,
  organizationSlug,
  projectId,
  nativeIssuesEnabled = false,
  onReloadConcordance,
}: CatWorkspaceViewProps) {
  const store = useCatWorkspace();
  const viewMode = store.ui.viewMode;
  const intelligenceSegmentId = store.intelligenceSegmentId;
  const intelligenceSegment = store.intelligenceSegmentView ?? null;
  const loadingSegmentIds = store.loadingSegmentIds;
  const isIntelligenceCommentsLoading = store.isIntelligenceCommentsLoading;
  const navigationSegments = queueSegments;
  const selectedSegmentIndex = selectedSegment
    ? navigationSegments.findIndex(
        (segment) =>
          segment.id === shell.selectedSegmentId || segment.key === shell.selectedSegmentId,
      )
    : -1;
  const isCompact = useIsCompactWorkspace();
  const [activePanel, setActivePanel] = useState<CatWorkspacePanel>("edit");
  const isSideBySideDesktop = viewMode === "side-by-side" && !isCompact;
  const isFileView = viewMode === "file";
  const selectedSegmentIdForIntelligence = intelligenceSegmentId;
  const [isIssuePanelOpen, setIsIssuePanelOpen] = useState(false);
  const isIntelligencePanelVisible = Boolean(
    selectedSegmentIdForIntelligence &&
    (!isCompact || activePanel === "ai") &&
    !isSideBySideDesktop,
  );

  useEffect(() => {
    if (!selectedSegmentIdForIntelligence) {
      return;
    }

    if (!isIntelligencePanelVisible && !isSideBySideDesktop) {
      return;
    }

    onIntelligencePanelVisible?.(selectedSegmentIdForIntelligence);
  }, [
    isIntelligencePanelVisible,
    isSideBySideDesktop,
    onIntelligencePanelVisible,
    selectedSegmentIdForIntelligence,
  ]);

  if (!selectedSegment && isQueueLoading) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background",
          className,
        )}
      >
        <CatPanelErrorBoundary scope="queue" resetKeys={[queueSearch, queueFilter]}>
          <CatQueuePanel
            segments={[]}
            selectedSegmentId=""
            onSelectSegment={() => undefined}
            search={queueSearch}
            queueFilter={queueFilter}
            showSelection={store.selectionMode}
            isFetchingPage={isQueueFetchingPage}
            isQueueLoading
            pagination={queuePagination}
            hasMoreQueue={hasMoreQueue}
            onLoadMoreQueue={onLoadMoreQueue}
          />
        </CatPanelErrorBoundary>
      </div>
    );
  }

  if (!selectedSegment) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background",
          className,
        )}
      >
        <CatPanelErrorBoundary scope="queue" resetKeys={[queueSearch, queueFilter]}>
          <CatQueuePanel
            segments={queueSegments}
            selectedSegmentId=""
            onSelectSegment={dependencies.navigation.onSelectSegment}
            search={queueSearch}
            queueFilter={queueFilter}
            checkedSegmentIds={checkedSegmentIds}
            onToggleSegmentChecked={onToggleSegmentChecked}
            showSelection={store.selectionMode}
            isFetchingPage={isQueueFetchingPage}
            isQueueLoading={isQueueLoading}
            pagination={queuePagination}
            hasMoreQueue={hasMoreQueue}
            onLoadMoreQueue={onLoadMoreQueue}
          />
        </CatPanelErrorBoundary>
      </div>
    );
  }

  const editorSegment = selectedSegment;

  const segmentPosition =
    editorSegment.index ??
    (queuePagination
      ? queuePagination.offset + (selectedSegmentIndex >= 0 ? selectedSegmentIndex + 1 : 1)
      : selectedSegmentIndex >= 0
        ? selectedSegmentIndex + 1
        : 1);
  const totalSegments = hasMoreQueue
    ? null
    : (queuePagination?.totalCount ?? navigationSegments.length);
  const hasPreviousSegment = segmentPosition > 1;
  const hasNextSegment =
    hasMoreQueue ||
    (totalSegments != null
      ? segmentPosition < totalSegments
      : selectedSegmentIndex < navigationSegments.length - 1);
  const { navigation, editing, review } = dependencies;
  const selectedSegmentIntelligence = resolveSegmentIntelligenceForDisplay(
    {
      intelligence: shell.intelligence,
      segmentIntelligence: shell.segmentIntelligence,
    },
    editorSegment.id,
  );
  const selectedSegmentFormatChecks =
    shell.segmentFormatChecks?.[editorSegment.id] ?? shell.formatChecks;
  const aiRecommendationError = selectedSegmentFormatChecks.find(
    (check) => check.id === `ai-recommendation-failed-${editorSegment.id}`,
  )?.message;
  const isEditorBusy = isApproving || isSavingDraft;
  const canApprove = shell.fileContext.canEditTranslations !== false;
  const canAddComment = shell.fileContext.canAddComments === true;
  const isTargetDirty = dirtySegmentIds?.has(editorSegment.id) ?? false;
  const segmentShareUrl = buildSegmentShareUrl?.(editorSegment) ?? null;
  const intelligenceSegmentIntelligence = intelligenceSegment
    ? resolveSegmentIntelligenceForDisplay(
        {
          intelligence: shell.intelligence,
          segmentIntelligence: shell.segmentIntelligence,
        },
        intelligenceSegment.id,
      )
    : null;
  const supportsIssueComments = shell.fileContext.providerKind === "crowdin" && canAddComment;
  const isNativeProject = shell.fileContext.providerKind === null;
  const showNativeIssues = nativeIssuesEnabled && isNativeProject;
  const issueTargetLocale = showNativeIssues ? shell.fileContext.targetLocale : null;
  const editorTranslationKeyId = showNativeIssues
    ? resolveCatLinkedIssueTranslationKeyId({
        isNativeProject: true,
        segmentId: editorSegment.id,
        contentKind: editorSegment.contentKind,
      })
    : null;
  const editorIssueStringLink =
    showNativeIssues && editorTranslationKeyId
      ? {
          segmentId: editorSegment.id,
          sourcePath: editorSegment.sourcePath ?? shell.fileContext.sourcePath,
          targetLocale: shell.fileContext.targetLocale,
          translationKeyId: editorTranslationKeyId,
          defaultTitle: editorSegment.sourceText,
        }
      : null;
  const intelligenceTranslationKeyId =
    showNativeIssues && intelligenceSegment
      ? resolveCatLinkedIssueTranslationKeyId({
          isNativeProject: true,
          segmentId: intelligenceSegment.id,
          contentKind: intelligenceSegment.contentKind,
        })
      : null;
  const intelligenceIssueStringLink =
    showNativeIssues && intelligenceSegment && intelligenceTranslationKeyId
      ? {
          segmentId: intelligenceSegment.id,
          sourcePath: intelligenceSegment.sourcePath ?? shell.fileContext.sourcePath,
          targetLocale: shell.fileContext.targetLocale,
          translationKeyId: intelligenceTranslationKeyId,
          defaultTitle: intelligenceSegment.sourceText,
        }
      : null;
  const issueSegment = isSideBySideDesktop ? intelligenceSegment : editorSegment;
  const issueTranslationKeyId = isSideBySideDesktop
    ? intelligenceTranslationKeyId
    : editorTranslationKeyId;
  const issueStringLink = isSideBySideDesktop ? intelligenceIssueStringLink : editorIssueStringLink;

  function renderSideBySidePanel() {
    if (!selectedSegment) {
      return null;
    }

    return (
      <CatPanelErrorBoundary
        scope="editor"
        resetKeys={[viewMode, queueSearch, queueFilter, editorSegment.id]}
      >
        <CatSideBySidePanel
          segments={queueSegments}
          focusedSegmentId={editorSegment.id}
          intelligenceSegment={intelligenceSegment}
          intelligence={intelligenceSegmentIntelligence}
          dirtySegmentIds={dirtySegmentIds}
          loadingSegmentIds={loadingSegmentIds}
          canEditTranslations={canApprove}
          canAddComment={canAddComment}
          supportsIssueComments={supportsIssueComments}
          isCommentsLoading={isIntelligenceCommentsLoading}
          isPostingComment={isPostingComment}
          isResolvingComment={isResolvingComment}
          resolvingCommentId={resolvingCommentId}
          commentPostError={commentPostError}
          isLookingUpContext={isLookingUpContext}
          isApproving={isApproving}
          isSavingDraft={isSavingDraft}
          isAiSuggestionLoading={isAiSuggestionLoading}
          isFormatChecksLoading={isFormatChecksLoading}
          isImageBusy={isImageBusy}
          canUseAiRecommendation={canUseAiRecommendation}
          focusedIntelligence={selectedSegmentIntelligence}
          aiRecommendationError={aiRecommendationError}
          formatChecks={selectedSegmentFormatChecks}
          segmentFormatChecks={shell.segmentFormatChecks}
          formatCheckLoadingSegmentIds={store.formatCheckLoadingSegmentIds}
          isConcordanceLoading={isConcordanceLoading}
          isVisualContextLoading={isVisualContextLoading}
          showAgentContext={
            revealedAgentContextSegmentIds?.has(intelligenceSegmentId) ?? showAgentContext
          }
          showVisualContext={showVisualContext}
          canLookupFreshContext={canLookupContext}
          search={queueSearch}
          queueFilter={queueFilter}
          isFetchingPage={isQueueFetchingPage}
          isQueueLoading={isQueueLoading}
          pagination={queuePagination}
          hasMoreQueue={hasMoreQueue}
          onLoadMoreQueue={onLoadMoreQueue}
          onFocusSegment={dependencies.navigation.onSelectSegment}
          onTargetChange={(segmentId, value) => editing.onTargetChange(segmentId, value)}
          onApprove={(segmentId) => {
            const targetText = store.getSegmentView(segmentId)?.targetText;
            if (targetText === undefined) {
              return;
            }
            void review.onApprove(segmentId, targetText);
          }}
          onSaveDraft={
            review.onSaveDraft
              ? (segmentId) => {
                  const targetText = store.getSegmentView(segmentId)?.targetText;
                  if (targetText === undefined) {
                    return;
                  }
                  void review.onSaveDraft?.(segmentId, targetText);
                }
              : undefined
          }
          onAddToIssueSheet={
            review.onAddToIssueSheet
              ? (segmentId) => void review.onAddToIssueSheet?.(segmentId)
              : undefined
          }
          onUseAiSuggestion={(segmentId) => editing.onUseAiSuggestion(segmentId)}
          onGenerateAiRecommendation={
            canUseAiRecommendation
              ? (segmentId) => void review.onReviewWithAi(segmentId)
              : undefined
          }
          onTreatAsImage={
            editing.onTreatAsImage
              ? (segmentId, treatAsImage) => void editing.onTreatAsImage?.(segmentId, treatAsImage)
              : undefined
          }
          onTreatAsVideo={
            editing.onTreatAsVideo
              ? (segmentId, treatAsVideo) => void editing.onTreatAsVideo?.(segmentId, treatAsVideo)
              : undefined
          }
          onRegenerateImage={
            editing.onRegenerateImage
              ? (segmentId) => void editing.onRegenerateImage?.(segmentId)
              : undefined
          }
          onUploadImage={
            editing.onUploadImage
              ? (segmentId, file) => void editing.onUploadImage?.(segmentId, file)
              : undefined
          }
          onAskQuestion={
            intelligenceSegment ? () => review.onAskQuestion(intelligenceSegment.id) : undefined
          }
          onRefreshContext={() =>
            intelligenceSegment
              ? review.onAskQuestion(intelligenceSegment.id, { forceRefresh: true })
              : undefined
          }
          onUseTmMatch={(segmentId, match) => editing.onUseTmMatch(segmentId, match)}
          onAddComment={
            review.onAddComment
              ? (segmentId, input) => review.onAddComment?.(segmentId, input)
              : undefined
          }
          onResolveComment={
            review.onResolveComment
              ? (segmentId, commentId) => review.onResolveComment?.(segmentId, commentId)
              : undefined
          }
          showMaxLengthEditor={isNativeProject}
          isMaxLengthSaving={isMaxLengthSaving}
          onSetMaxLength={
            editing.onSetMaxLength
              ? (maxLength) => editing.onSetMaxLength!(intelligenceSegmentId, maxLength)
              : undefined
          }
          primaryActionLabel={shell.primaryActionLabel}
          segmentShareUrl={segmentShareUrl}
          organizationSlug={organizationSlug}
          projectId={projectId}
          onGlossaryTermAdded={
            intelligenceSegment ? () => onReloadConcordance?.(intelligenceSegment.id) : undefined
          }
        />
      </CatPanelErrorBoundary>
    );
  }

  function renderFileViewPanel() {
    const capabilities = resolveCatFileViewCapabilities({
      sourcePath: editorSegment.sourcePath ?? shell.fileContext.sourcePath,
      contentKind: editorSegment.contentKind,
    });

    return (
      <CatPanelErrorBoundary scope="editor" resetKeys={[viewMode, editorSegment.id]}>
        <CatFileViewPanel
          segment={editorSegment}
          viewerId={capabilities.viewerId}
          filename={shell.fileContext.filename}
          canEdit={canApprove && !editorSegment.isLocked}
          canApprove={canApprove && !editorSegment.isLocked}
          isApproving={isApproving}
          isImageBusy={isImageBusy}
          isSegmentTargetLoading={isSegmentTargetLoading}
          primaryActionLabel={shell.primaryActionLabel}
          hasPreviousSegment={hasPreviousSegment}
          hasNextSegment={hasNextSegment}
          onPrevious={navigation.onPreviousSegment}
          onNext={navigation.onNextSegment}
          onApprove={() => void review.onApprove(editorSegment.id, editorSegment.targetText)}
          onUpload={
            editing.onUploadImage
              ? (file) => void editing.onUploadImage?.(editorSegment.id, file)
              : undefined
          }
          onRegenerate={
            (capabilities.viewerId === "image" || capabilities.viewerId === "video") &&
            editing.onRegenerateImage
              ? () => void editing.onRegenerateImage?.(editorSegment.id)
              : undefined
          }
        />
      </CatPanelErrorBoundary>
    );
  }

  function renderEditorPanel() {
    if (isFileView) {
      return renderFileViewPanel();
    }

    return (
      <CatPanelErrorBoundary scope="editor" resetKeys={[editorSegment.id]}>
        <CatEditorPanel
          segment={editorSegment}
          segmentPosition={segmentPosition}
          totalSegments={totalSegments ?? navigationSegments.length}
          formatChecks={selectedSegmentFormatChecks}
          intelligence={selectedSegmentIntelligence}
          isEditorBusy={isEditorBusy}
          isApproving={isApproving}
          isSavingDraft={isSavingDraft}
          isLookingUpContext={isLookingUpContext}
          isAiSuggestionLoading={isAiSuggestionLoading}
          isFormatChecksLoading={isFormatChecksLoading}
          isCommentsLoading={isCommentsLoading}
          isSegmentTargetLoading={isSegmentTargetLoading}
          isImageBusy={isImageBusy}
          isPostingComment={isPostingComment}
          isResolvingComment={isResolvingComment}
          resolvingCommentId={resolvingCommentId}
          commentPostError={commentPostError}
          providerKind={shell.fileContext.providerKind ?? null}
          canApprove={canApprove}
          canAddComment={canAddComment}
          canEditTranslations={canApprove}
          isTargetDirty={isTargetDirty}
          canLookupContext={canLookupContext}
          canUseAiRecommendation={canUseAiRecommendation}
          segmentShareUrl={segmentShareUrl}
          onTargetChange={(value) => editing.onTargetChange(editorSegment.id, value)}
          onCopySource={() => editing.onTargetChange(editorSegment.id, editorSegment.sourceText)}
          onClearTarget={() => editing.onTargetChange(editorSegment.id, "")}
          onUseAiSuggestion={() => editing.onUseAiSuggestion(editorSegment.id)}
          onApprove={() => void review.onApprove(editorSegment.id, editorSegment.targetText)}
          onSaveDraft={
            review.onSaveDraft
              ? () => void review.onSaveDraft?.(editorSegment.id, editorSegment.targetText)
              : undefined
          }
          onAddComment={
            review.onAddComment
              ? (input) => review.onAddComment?.(editorSegment.id, input)
              : undefined
          }
          onAddToIssueSheet={
            review.onAddToIssueSheet
              ? () => void review.onAddToIssueSheet?.(editorSegment.id)
              : undefined
          }
          onResolveComment={
            review.onResolveComment
              ? (commentId) => review.onResolveComment?.(editorSegment.id, commentId)
              : undefined
          }
          primaryActionLabel={shell.primaryActionLabel}
          onAskQuestion={() => review.onAskQuestion(editorSegment.id)}
          onGenerateAiRecommendation={
            canUseAiRecommendation ? () => void review.onReviewWithAi(editorSegment.id) : undefined
          }
          onTreatAsImage={
            editing.onTreatAsImage
              ? (treatAsImage) => void editing.onTreatAsImage?.(editorSegment.id, treatAsImage)
              : undefined
          }
          onTreatAsVideo={
            editing.onTreatAsVideo
              ? (treatAsVideo) => void editing.onTreatAsVideo?.(editorSegment.id, treatAsVideo)
              : undefined
          }
          onRegenerateImage={
            editing.onRegenerateImage
              ? () => void editing.onRegenerateImage?.(editorSegment.id)
              : undefined
          }
          onUploadImage={
            editing.onUploadImage
              ? (file) => void editing.onUploadImage?.(editorSegment.id, file)
              : undefined
          }
          onToggleLocked={
            review.onSetLocked
              ? () => void review.onSetLocked?.([editorSegment.id], !editorSegment.isLocked)
              : undefined
          }
          aiRecommendationError={aiRecommendationError}
          onPrevious={navigation.onPreviousSegment}
          onNext={navigation.onNextSegment}
          hasPreviousSegment={hasPreviousSegment}
          hasNextSegment={hasNextSegment}
        />
      </CatPanelErrorBoundary>
    );
  }

  function renderQueuePanel() {
    return (
      <CatPanelErrorBoundary
        scope="queue"
        resetKeys={[queueSegments.length, editorSegment.id, queueSearch, queueFilter]}
      >
        <CatQueuePanel
          segments={queueSegments}
          selectedSegmentId={editorSegment.id}
          dirtySegmentIds={dirtySegmentIds}
          onSelectSegment={(segmentId) => {
            navigation.onSelectSegment(segmentId);
            if (isCompact) {
              setActivePanel("edit");
            }
          }}
          search={queueSearch}
          queueFilter={queueFilter}
          checkedSegmentIds={checkedSegmentIds}
          onToggleSegmentChecked={onToggleSegmentChecked}
          showSelection={store.selectionMode}
          isFetchingPage={isQueueFetchingPage}
          isQueueLoading={isQueueLoading}
          pagination={queuePagination}
          hasMoreQueue={hasMoreQueue}
          onLoadMoreQueue={onLoadMoreQueue}
        />
      </CatPanelErrorBoundary>
    );
  }

  function renderIntelligencePanel() {
    return (
      <CatPanelErrorBoundary
        scope="intelligence"
        resetKeys={[editorSegment.id, editorSegment.targetText]}
      >
        <CatIntelligencePanel
          intelligence={selectedSegmentIntelligence}
          segmentId={editorSegment.id}
          sourceText={editorSegment.sourceText}
          targetText={editorSegment.targetText}
          sourceLocale={editorSegment.sourceLocale}
          targetLocale={editorSegment.targetLocale}
          organizationSlug={organizationSlug}
          projectId={projectId}
          teamGlossaries={shell.fileContext.teamGlossaries ?? []}
          contributorTeams={shell.fileContext.contributorTeams ?? []}
          projectTeamId={shell.fileContext.projectTeamId}
          canContributeTeamGlossary={
            Boolean(shell.fileContext.canContributeTeamGlossary) && isNativeProject
          }
          teamName={shell.fileContext.teamName}
          isLookingUpContext={isLookingUpContext}
          isConcordanceLoading={isConcordanceLoading}
          isVisualContextLoading={isVisualContextLoading}
          showAgentContext={showAgentContext}
          showVisualContext={showVisualContext}
          showMaxLengthEditor={isNativeProject}
          isMaxLengthSaving={isMaxLengthSaving}
          canEditTranslations={
            shell.fileContext.canEditTranslations !== false && !editorSegment.isLocked
          }
          canLookupFreshContext={canLookupContext}
          onRefreshContext={() => review.onAskQuestion(editorSegment.id, { forceRefresh: true })}
          onUseTmMatch={(match) => editing.onUseTmMatch(editorSegment.id, match)}
          onSetMaxLength={
            editing.onSetMaxLength
              ? (maxLength) => editing.onSetMaxLength!(editorSegment.id, maxLength)
              : undefined
          }
          onGlossaryTermAdded={() => onReloadConcordance?.(editorSegment.id)}
        />
      </CatPanelErrorBoundary>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      {isCompact ? (
        isFileView ? (
          renderFileViewPanel()
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-border px-4 py-3">
              <div className="min-w-0 space-y-1">
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {totalSegments != null ? (
                    <FormattedMessage
                      {...catWorkspaceViewMessages.segmentPosition}
                      values={{
                        position: String(segmentPosition).padStart(2, "0"),
                        total: String(totalSegments).padStart(2, "0"),
                      }}
                    />
                  ) : (
                    <FormattedMessage
                      {...catWorkspaceViewMessages.segmentPositionOpenEnded}
                      values={{
                        position: String(segmentPosition).padStart(2, "0"),
                      }}
                    />
                  )}
                </p>
                <CatSegmentKeyMeta
                  segmentKey={editorSegment.key}
                  sourcePath={editorSegment.sourcePath}
                  keyClassName="text-sm font-medium text-foreground"
                />
              </div>
            </div>

            <Tabs
              value={activePanel}
              onValueChange={(value) => setActivePanel(value as CatWorkspacePanel)}
              className="min-h-0 flex-1 gap-0 overflow-hidden"
            >
              <TabsList className="mx-4 mt-3 grid h-10 w-auto grid-cols-3">
                <TabsTrigger value="edit">
                  <FormattedMessage {...catWorkspaceMessages.tabEdit} />
                </TabsTrigger>
                <TabsTrigger value="queue">
                  <FormattedMessage {...catWorkspaceMessages.tabQueue} />
                </TabsTrigger>
                <TabsTrigger value="ai">
                  <FormattedMessage {...catWorkspaceMessages.tabAi} />
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="edit"
                className="mt-3 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
              >
                {renderEditorPanel()}
              </TabsContent>
              <TabsContent
                value="queue"
                className="mt-3 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
              >
                {renderQueuePanel()}
              </TabsContent>
              <TabsContent
                value="ai"
                className="mt-3 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
              >
                {activePanel === "ai" ? renderIntelligencePanel() : null}
              </TabsContent>
            </Tabs>
          </div>
        )
      ) : isFileView ? (
        renderFileViewPanel()
      ) : isSideBySideDesktop ? (
        renderSideBySidePanel()
      ) : (
        <CatComfortableResizableLayout
          queue={renderQueuePanel()}
          editor={renderEditorPanel()}
          intelligence={renderIntelligencePanel()}
        />
      )}
      {showNativeIssues && organizationSlug && projectId && issueSegment ? (
        <CatEditorIssuesSection
          organizationSlug={organizationSlug}
          projectId={projectId}
          translationKeyId={issueTranslationKeyId}
          targetLocale={issueTargetLocale}
          stringLink={issueStringLink}
          canCreate={canAddComment}
          open={isIssuePanelOpen}
          onOpenChange={setIsIssuePanelOpen}
          onOpenIssueCountChange={(openIssueCount) => {
            store.applySegmentOpenIssueCount(issueSegment.id, openIssueCount);
          }}
        />
      ) : null}
    </div>
  );
});
