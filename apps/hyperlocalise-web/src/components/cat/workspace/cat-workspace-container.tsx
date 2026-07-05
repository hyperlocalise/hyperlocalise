"use client";

import { observer } from "mobx-react-lite";
import { FormattedMessage } from "react-intl";

import type { ProjectFileCatQueueFile } from "@/api/routes/project/project.schema";
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

import { CatQueryBridge } from "./bridge/cat-query-bridge";
import { CatPanelErrorBoundary } from "./cat-panel-error-boundary";
import { CatWorkspaceLazySegmentSync } from "./cat-workspace-lazy-segment-sync";
import { CatWorkspaceView } from "./cat-workspace";
import { CatWorkspaceProvider, useCatWorkspace } from "./cat-workspace-context";
import type { CatWorkspaceOrchestrator } from "./cat-workspace-orchestrator";
import { useCatWorkspaceRuntime } from "./use-cat-workspace-runtime";

export interface CatWorkspaceContainerProps {
  initialState: CatWorkspaceState;
  queueSnapshot?: CatWorkspaceState | null;
  lazySegment?: {
    organizationSlug: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    externalResourceId?: string | null;
    resourceType?: "file" | "key";
    repositoryFullName?: string | null;
    catFile: ProjectFileCatQueueFile | null | undefined;
    enabled: boolean;
  };
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
  initialSegmentKeyOrId?: string | null;
  buildSegmentShareUrl?: (segment: CatSegment) => string | null;
  tmAutoFillMinMatchPercent?: number;
}

const CatWorkspaceContainerObserver = observer(function CatWorkspaceContainerObserver({
  store,
  queueSnapshot,
  lazySegment,
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
  buildSegmentShareUrl,
  tmAutoFillMinMatchPercent,
}: CatWorkspaceContainerProps & { store: CatWorkspaceOrchestrator }) {
  const controller = useCatWorkspaceRuntime({
    store,
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
      <CatQueryBridge
        snapshot={queueSnapshot ?? null}
        initialSegmentKeyOrId={initialSegmentKeyOrId}
      />
      {lazySegment ? <CatWorkspaceLazySegmentSync {...lazySegment} /> : null}

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
          shell={controller.shell}
          queueSegments={controller.queueSegments}
          selectedSegment={controller.selectedSegment}
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
          isCommentsLoading={store.isCommentsLoading}
          isSegmentTargetLoading={store.isSegmentTargetLoading}
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
            store.selectAllVisible(controller.queueSegments.map((segment) => segment.id))
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

export function CatWorkspaceContainer({
  initialState,
  initialSegmentKeyOrId,
  ...props
}: CatWorkspaceContainerProps) {
  return (
    <CatWorkspaceProvider initialState={initialState} initialSegmentKeyOrId={initialSegmentKeyOrId}>
      <CatWorkspaceContainerInner
        initialState={initialState}
        initialSegmentKeyOrId={initialSegmentKeyOrId}
        {...props}
      />
    </CatWorkspaceProvider>
  );
}

const CatWorkspaceContainerInner = observer(function CatWorkspaceContainerInner(
  props: CatWorkspaceContainerProps,
) {
  const store = useCatWorkspace();

  return <CatWorkspaceContainerObserver store={store} {...props} />;
});
