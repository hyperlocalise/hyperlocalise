"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { FormattedMessage } from "react-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/primitives/cn";

import { CatEditorPanel } from "@/components/cat/editor/cat-editor-panel";
import { CatIntelligencePanel } from "@/components/cat/intelligence/cat-intelligence-panel";
import { CatQueuePanel } from "@/components/cat/queue/cat-queue-panel";
import { CatSideBySidePanel } from "@/components/cat/side-by-side/cat-side-by-side-panel";
import type { CatWorkspaceViewProps } from "@/components/cat/shared/dependencies";
import { catWorkspaceMessages } from "@/components/cat/shared/cat.messages";

import { CatPanelErrorBoundary } from "./cat-panel-error-boundary";
import { useCatWorkspace } from "./cat-workspace-context";
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
  onQueueSearchChange,
  isQueueSearchPending = false,
  isQueueFetchingPage = false,
  isQueueLoading = false,
  isCommentsLoading = false,
  isSegmentTargetLoading = false,
  isImageBusy = false,
  queuePagination = null,
  hasMoreQueue = false,
  onLoadMoreQueue,
  queueFilter,
  onQueueFilterChange,
  availableQueueFilters,
  checkedSegmentIds,
  onToggleSegmentChecked,
  onSelectAllVisible,
  onClearChecked,
  onBulkApprove,
  onBulkSkip,
  isBulkActionPending = false,
  buildSegmentShareUrl,
  onIntelligencePanelVisible,
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
  const selectedSegmentIdForIntelligence = intelligenceSegmentId;
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
            onSearchChange={onQueueSearchChange}
            isSearching={isQueueSearchPending}
            queueFilter={queueFilter}
            onQueueFilterChange={onQueueFilterChange}
            availableQueueFilters={availableQueueFilters}
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
            onSearchChange={onQueueSearchChange}
            isSearching={isQueueSearchPending}
            queueFilter={queueFilter}
            onQueueFilterChange={onQueueFilterChange}
            availableQueueFilters={availableQueueFilters}
            checkedSegmentIds={checkedSegmentIds}
            onToggleSegmentChecked={onToggleSegmentChecked}
            onSelectAllVisible={onSelectAllVisible}
            onClearChecked={onClearChecked}
            onBulkApprove={onBulkApprove}
            onBulkSkip={onBulkSkip}
            isBulkActionPending={isBulkActionPending}
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
  const supportsIssueComments =
    (shell.fileContext.providerKind === "crowdin" || shell.fileContext.providerKind === null) &&
    canAddComment;

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
          isConcordanceLoading={isConcordanceLoading}
          isVisualContextLoading={isVisualContextLoading}
          showAgentContext={
            revealedAgentContextSegmentIds?.has(intelligenceSegmentId) ?? showAgentContext
          }
          showVisualContext={showVisualContext}
          canLookupFreshContext={canLookupContext}
          search={queueSearch}
          onSearchChange={onQueueSearchChange}
          isSearching={isQueueSearchPending}
          queueFilter={queueFilter}
          onQueueFilterChange={onQueueFilterChange}
          availableQueueFilters={availableQueueFilters}
          isFetchingPage={isQueueFetchingPage}
          isQueueLoading={isQueueLoading}
          pagination={queuePagination}
          hasMoreQueue={hasMoreQueue}
          onLoadMoreQueue={onLoadMoreQueue}
          onFocusSegment={dependencies.navigation.onSelectSegment}
          onTargetChange={(segmentId, value) => editing.onTargetChange(segmentId, value)}
          onAskQuestion={
            intelligenceSegment ? () => review.onAskQuestion(intelligenceSegment.id) : undefined
          }
          onRefreshContext={() =>
            intelligenceSegment
              ? review.onAskQuestion(intelligenceSegment.id, { forceRefresh: true })
              : undefined
          }
          onUseTmMatch={(segmentId, match) => editing.onUseTmMatch(segmentId, match)}
          onUseGlossaryTerm={(segmentId, term) =>
            editing.onUseGlossaryTerm(
              segmentId,
              term,
              queueSegments.find((segment) => segment.id === segmentId)?.sourceText ?? "",
            )
          }
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
        />
      </CatPanelErrorBoundary>
    );
  }

  function renderEditorPanel() {
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
          onSearchChange={onQueueSearchChange}
          isSearching={isQueueSearchPending}
          queueFilter={queueFilter}
          onQueueFilterChange={onQueueFilterChange}
          availableQueueFilters={availableQueueFilters}
          checkedSegmentIds={checkedSegmentIds}
          onToggleSegmentChecked={onToggleSegmentChecked}
          onSelectAllVisible={onSelectAllVisible}
          onClearChecked={onClearChecked}
          onBulkApprove={onBulkApprove}
          onBulkSkip={onBulkSkip}
          isBulkActionPending={isBulkActionPending}
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
          targetText={editorSegment.targetText}
          isLookingUpContext={isLookingUpContext}
          isConcordanceLoading={isConcordanceLoading}
          isVisualContextLoading={isVisualContextLoading}
          showAgentContext={showAgentContext}
          showVisualContext={showVisualContext}
          canEditTranslations={shell.fileContext.canEditTranslations !== false}
          canLookupFreshContext={canLookupContext}
          onRefreshContext={() => review.onAskQuestion(editorSegment.id, { forceRefresh: true })}
          onUseTmMatch={(match) => editing.onUseTmMatch(editorSegment.id, match)}
          onUseGlossaryTerm={(term) =>
            editing.onUseGlossaryTerm(editorSegment.id, term, editorSegment.sourceText)
          }
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="min-w-0 space-y-1">
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {String(segmentPosition).padStart(2, "0")}
                {totalSegments != null ? ` / ${String(totalSegments).padStart(2, "0")}` : "+"}
              </p>
              <p className="truncate font-mono text-sm font-medium text-foreground">
                {editorSegment.key}
              </p>
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
      ) : isSideBySideDesktop ? (
        renderSideBySidePanel()
      ) : (
        <div className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,22rem)] overflow-hidden">
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            {renderQueuePanel()}
          </div>

          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            {renderEditorPanel()}
          </div>

          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            {renderIntelligencePanel()}
          </div>
        </div>
      )}
    </div>
  );
});
