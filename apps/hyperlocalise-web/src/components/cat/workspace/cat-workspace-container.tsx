"use client";

import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { FormattedMessage } from "react-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import type {
  CatWorkspaceDependencies,
  CatWorkspaceViewProps,
  PartialCatWorkspaceDependencies,
} from "@/components/cat/shared/dependencies";
import { catWorkspaceContainerMessages } from "@/components/cat/shared/cat.messages";
import type { CatSegment, CatWorkspaceState } from "@/components/cat/shared/types";
import type { CatQueueFilter } from "@/components/cat/queue/cat-queue-filter";

import { CatPanelErrorBoundary } from "./cat-panel-error-boundary";
import { CatWorkspaceView } from "./cat-workspace";
import { createCatWorkspaceStore } from "./store/cat-workspace-store";
import { useCatWorkspaceController } from "./use-cat-workspace-controller";

export interface CatWorkspaceContainerProps {
  initialState: CatWorkspaceState;
  dependencies?: PartialCatWorkspaceDependencies;
  navigation?: Partial<CatWorkspaceDependencies["navigation"]>;
  editing?: Partial<CatWorkspaceDependencies["editing"]>;
  review?: Partial<CatWorkspaceDependencies["review"]>;
  services?: CatWorkspaceDependencies["services"];
  className?: string;
  queueSearch?: string;
  onQueueSearchChange?: (value: string) => void;
  queueFilter?: CatQueueFilter;
  onQueueFilterChange?: (filter: CatQueueFilter) => void;
  availableQueueFilters?: CatQueueFilter[];
  isQueueSearchPending?: boolean;
  isQueueFetchingPage?: boolean;
  isQueueLoading?: boolean;
  queuePagination?: CatWorkspaceViewProps["queuePagination"];
  hasMoreQueue?: boolean;
  onLoadMoreQueue?: () => void;
  isCommentsLoading?: boolean;
  isSegmentDetailLoading?: boolean;
  initialSegmentKeyOrId?: string | null;
  buildSegmentShareUrl?: (segment: CatSegment) => string | null;
  tmAutoFillMinMatchPercent?: number;
}

const CatWorkspaceContainerObserver = observer(function CatWorkspaceContainerObserver({
  store,
  initialState,
  initialSegmentKeyOrId,
  dependencies,
  navigation,
  editing,
  review,
  services,
  className,
  queueSearch,
  onQueueSearchChange,
  queueFilter,
  onQueueFilterChange,
  availableQueueFilters,
  isQueueSearchPending,
  isQueueFetchingPage,
  isQueueLoading,
  queuePagination,
  hasMoreQueue,
  onLoadMoreQueue,
  isCommentsLoading,
  isSegmentDetailLoading,
  buildSegmentShareUrl,
  tmAutoFillMinMatchPercent,
}: CatWorkspaceContainerProps & { store: ReturnType<typeof createCatWorkspaceStore> }) {
  const controller = useCatWorkspaceController({
    store,
    initialState,
    initialSegmentKeyOrId,
    dependencies,
    navigation,
    editing,
    review,
    services,
    queueFilter,
    onQueueFilterChange,
    buildSegmentShareUrl,
    tmAutoFillMinMatchPercent,
  });

  return (
    <>
      <CatPanelErrorBoundary
        scope="workspace"
        className={className}
        resetKeys={[
          store.selectedSegmentId,
          controller.queueFilter,
          queueSearch,
          queuePagination?.offset,
        ]}
      >
        <CatWorkspaceView
          state={controller.queueViewState}
          editorState={controller.editorState}
          dependencies={controller.dependencies}
          dirtySegmentIds={controller.dirtySegmentIds}
          isValidating={store.isValidating}
          isApproving={store.isApproving}
          isSavingDraft={store.isSavingDraft}
          isPostingComment={store.isPostingComment}
          isResolvingComment={store.isResolvingComment}
          resolvingCommentId={store.resolvingCommentId}
          commentPostError={store.commentPostError}
          isLookingUpContext={store.isLookingUpContext}
          isConcordanceLoading={store.isLoadingConcordance}
          isVisualContextLoading={store.isLoadingVisualContext}
          isAiSuggestionLoading={
            store.isGeneratingAiRecommendation && controller.canUseAiRecommendation
          }
          isFormatChecksLoading={store.isRunningFormatChecks || store.isValidating}
          canLookupContext={controller.canLookupContext}
          showAgentContext={store.revealedAgentContextSegmentIds.has(store.selectedSegmentId)}
          showVisualContext={controller.canLoadVisualContext}
          canUseAiRecommendation={controller.canUseAiRecommendation}
          className={className}
          queueSearch={queueSearch}
          onQueueSearchChange={onQueueSearchChange}
          isQueueSearchPending={isQueueSearchPending}
          isQueueFetchingPage={isQueueFetchingPage}
          isQueueLoading={isQueueLoading}
          isCommentsLoading={isCommentsLoading}
          isSegmentDetailLoading={isSegmentDetailLoading}
          queuePagination={queuePagination}
          hasMoreQueue={hasMoreQueue}
          onLoadMoreQueue={onLoadMoreQueue}
          queueFilter={controller.queueFilter}
          onQueueFilterChange={controller.handleQueueFilterChange}
          availableQueueFilters={availableQueueFilters}
          checkedSegmentIds={store.checkedSegmentIds}
          onToggleSegmentChecked={(segmentId, checked) =>
            store.toggleSegmentChecked(segmentId, checked)
          }
          onSelectAllVisible={() =>
            store.selectAllVisible(controller.queueViewState.segments.map((s) => s.id))
          }
          onClearChecked={() => store.clearChecked()}
          onBulkApprove={() => void controller.handleBulkApprove()}
          onBulkSkip={() => void controller.handleBulkSkip()}
          isBulkActionPending={store.isBulkActionPending}
          buildSegmentShareUrl={controller.resolvedBuildSegmentShareUrl}
          onIntelligencePanelVisible={controller.handleIntelligencePanelVisible}
        />
      </CatPanelErrorBoundary>

      <AlertDialog
        open={store.unsavedNavigationPrompt !== null}
        onOpenChange={(open) => {
          if (!open) {
            store.dismissUnsavedNavigationPrompt();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {store.unsavedNavigationPrompt?.kind === "page" ? (
                <FormattedMessage {...catWorkspaceContainerMessages.unsavedPageNavigationTitle} />
              ) : (
                <FormattedMessage
                  {...catWorkspaceContainerMessages.unsavedSegmentNavigationTitle}
                />
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {store.unsavedNavigationPrompt?.kind === "page" ? (
                <FormattedMessage
                  {...catWorkspaceContainerMessages.unsavedPageNavigationDescription}
                />
              ) : (
                <FormattedMessage
                  {...catWorkspaceContainerMessages.unsavedSegmentNavigationDescription}
                />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <FormattedMessage {...catWorkspaceContainerMessages.unsavedNavigationStay} />
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => store.confirmUnsavedNavigation()}>
              <FormattedMessage {...catWorkspaceContainerMessages.unsavedNavigationDiscard} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

export function CatWorkspaceContainer(props: CatWorkspaceContainerProps) {
  const store = useMemo(
    () => createCatWorkspaceStore(props.initialState, props.initialSegmentKeyOrId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return <CatWorkspaceContainerObserver {...props} store={store} />;
}
