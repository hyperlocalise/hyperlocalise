"use client";

import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";

import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/primitives/cn";

import { CatEditorPanel } from "./cat-editor-panel";
import { CatIntelligencePanel } from "./cat-intelligence-panel";
import { CatQueuePanel } from "./cat-queue-panel";
import { catWorkspaceMessages } from "./cat.messages";
import type { CatWorkspaceViewProps } from "./dependencies";

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

export function CatWorkspaceView({
  state,
  editorState,
  dependencies,
  isValidating: _isValidating = false,
  isApproving = false,
  isPostingComment = false,
  commentPostError,
  isLookingUpContext = false,
  isConcordanceLoading = false,
  isAiSuggestionLoading = false,
  isFormatChecksLoading = false,
  canLookupContext = false,
  canUseAiRecommendation = false,
  showAgentContext = false,
  dirtySegmentIds,
  className,
  queueSearch,
  onQueueSearchChange,
  isQueueSearchPending = false,
  isQueueFetchingPage = false,
  queuePagination = null,
  onQueuePreviousPage,
  onQueueNextPage,
  onQueueNearEnd,
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
}: CatWorkspaceViewProps) {
  const fullState = editorState ?? state;
  const navigationSegments = editorState ? state.segments : fullState.segments;
  const selectedSegmentIndex = navigationSegments.findIndex(
    (segment) =>
      segment.id === fullState.selectedSegmentId || segment.key === fullState.selectedSegmentId,
  );
  const selectedSegment =
    fullState.segments.find(
      (segment) =>
        segment.id === fullState.selectedSegmentId || segment.key === fullState.selectedSegmentId,
    ) ?? navigationSegments[selectedSegmentIndex >= 0 ? selectedSegmentIndex : 0];
  const isCompact = useIsCompactWorkspace();
  const [activePanel, setActivePanel] = useState<CatWorkspacePanel>("edit");
  const reviewedProgress =
    fullState.queueSummary.total > 0
      ? Math.round((fullState.queueSummary.reviewed / fullState.queueSummary.total) * 100)
      : 0;

  if (!selectedSegment) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center text-sm text-muted-foreground",
          className,
        )}
      >
        <FormattedMessage {...catWorkspaceMessages.emptyQueue} />
      </div>
    );
  }

  const segmentPosition = queuePagination
    ? queuePagination.offset + (selectedSegmentIndex >= 0 ? selectedSegmentIndex + 1 : 1)
    : selectedSegmentIndex >= 0
      ? selectedSegmentIndex + 1
      : 1;
  const totalSegments = queuePagination?.totalCount ?? navigationSegments.length;
  const hasPreviousSegment = segmentPosition > 1;
  const hasNextSegment = segmentPosition < totalSegments;
  const { navigation, editing, review } = dependencies;
  const selectedSegmentIntelligence =
    fullState.segmentIntelligence?.[selectedSegment.id] ?? fullState.intelligence;
  const selectedSegmentFormatChecks =
    fullState.segmentFormatChecks?.[selectedSegment.id] ?? fullState.formatChecks;
  const aiRecommendationError = selectedSegmentFormatChecks.find(
    (check) => check.id === `ai-recommendation-failed-${selectedSegment.id}`,
  )?.message;
  const isEditorBusy = isApproving;
  const canApprove = fullState.canEditTranslations !== false;
  const canAddComment = fullState.canAddComments === true;
  const isTargetDirty = dirtySegmentIds?.has(selectedSegment.id) ?? false;
  const segmentShareUrl = buildSegmentShareUrl?.(selectedSegment) ?? null;

  function renderEditorPanel() {
    return (
      <CatEditorPanel
        segment={selectedSegment}
        segmentPosition={segmentPosition}
        totalSegments={totalSegments}
        formatChecks={selectedSegmentFormatChecks}
        intelligence={selectedSegmentIntelligence}
        isEditorBusy={isEditorBusy}
        isApproving={isApproving}
        isLookingUpContext={isLookingUpContext}
        isAiSuggestionLoading={isAiSuggestionLoading}
        isFormatChecksLoading={isFormatChecksLoading}
        isPostingComment={isPostingComment}
        commentPostError={commentPostError}
        canApprove={canApprove}
        canAddComment={canAddComment}
        canEditTranslations={canApprove}
        isTargetDirty={isTargetDirty}
        canLookupContext={canLookupContext}
        canUseAiRecommendation={canUseAiRecommendation}
        segmentShareUrl={segmentShareUrl}
        onTargetChange={(value) => editing.onTargetChange(selectedSegment.id, value)}
        onCopySource={() => editing.onTargetChange(selectedSegment.id, selectedSegment.sourceText)}
        onClearTarget={() => editing.onTargetChange(selectedSegment.id, "")}
        onUseAiSuggestion={() => editing.onUseAiSuggestion(selectedSegment.id)}
        onApprove={() => void review.onApprove(selectedSegment.id, selectedSegment.targetText)}
        onAddComment={
          review.onAddComment
            ? (text) => review.onAddComment?.(selectedSegment.id, text)
            : undefined
        }
        primaryActionLabel={fullState.primaryActionLabel}
        onAskQuestion={() => review.onAskQuestion(selectedSegment.id)}
        onGenerateAiRecommendation={
          canUseAiRecommendation ? () => void review.onReviewWithAi(selectedSegment.id) : undefined
        }
        aiRecommendationError={aiRecommendationError}
        onPrevious={navigation.onPreviousSegment}
        onNext={navigation.onNextSegment}
        hasPreviousSegment={hasPreviousSegment}
        hasNextSegment={hasNextSegment}
      />
    );
  }

  function renderQueuePanel() {
    return (
      <CatQueuePanel
        segments={state.segments}
        selectedSegmentId={selectedSegment.id}
        summary={fullState.queueSummary}
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
        pagination={queuePagination}
        onPreviousPage={onQueuePreviousPage}
        onNextPage={onQueueNextPage}
        onNearEnd={onQueueNearEnd}
      />
    );
  }

  function renderIntelligencePanel() {
    return (
      <CatIntelligencePanel
        intelligence={selectedSegmentIntelligence}
        isLookingUpContext={isLookingUpContext}
        isConcordanceLoading={isConcordanceLoading}
        showAgentContext={showAgentContext}
        canEditTranslations={fullState.canEditTranslations !== false}
        onUseTmMatch={(match) => editing.onUseTmMatch(selectedSegment.id, match)}
        onUseGlossaryTerm={(term) =>
          editing.onUseGlossaryTerm(selectedSegment.id, term, selectedSegment.sourceText)
        }
      />
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
          <div className="shrink-0 border-b border-foreground/8 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {String(segmentPosition).padStart(2, "0")} /{" "}
                  {String(totalSegments).padStart(2, "0")}
                </p>
                <p className="truncate font-mono text-sm font-medium text-foreground">
                  {selectedSegment.key}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-medium text-foreground">
                  <FormattedMessage
                    {...catWorkspaceMessages.reviewedProgress}
                    values={{ progress: reviewedProgress }}
                  />
                </p>
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage
                    {...catWorkspaceMessages.reviewedSummary}
                    values={{
                      reviewed: fullState.queueSummary.reviewed,
                      total: fullState.queueSummary.total,
                    }}
                  />
                </p>
              </div>
            </div>
            <Progress value={reviewedProgress} className="mt-3 h-1.5" />
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
              {renderIntelligencePanel()}
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[20rem_minmax(0,1fr)_22rem] overflow-hidden">
          <div className="min-w-0 overflow-hidden">{renderQueuePanel()}</div>

          <div className="flex min-w-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">{renderEditorPanel()}</div>
          </div>

          <div className="min-w-0 overflow-hidden">{renderIntelligencePanel()}</div>
        </div>
      )}
    </div>
  );
}
