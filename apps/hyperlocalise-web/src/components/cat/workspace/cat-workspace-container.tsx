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
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
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
import type { CatQueueFilter, CatQueueSort } from "@/components/cat/queue/cat-queue-filter";
import { CatQueueToolbarConnected } from "@/components/cat/queue/cat-queue-toolbar-connected";
import { catWorkspaceContainerMessages } from "@/components/cat/shared/cat.messages";
import type { CatSegment, CatWorkspaceState } from "@/components/cat/shared/types";

import { CatQueryBridge } from "./bridge/cat-query-bridge";
import { CatChatDockPageContextBridge } from "./cat-chat-dock-page-context-bridge";
import { CatPanelErrorBoundary } from "./cat-panel-error-boundary";
import { CatWorkspaceLazySegmentSync } from "./cat-workspace-lazy-segment-sync";
import { CatWorkspaceView } from "./cat-workspace";
import { CatWorkspaceProvider, useCatWorkspace } from "./cat-workspace-context";
import type { CatWorkspaceOrchestrator } from "./cat-workspace-orchestrator";
import type { CatPageNavigationGuardRef } from "./cat-page-navigation-guard";
import type { CatWorkspaceViewMode } from "./cat-workspace-view-mode";
import { CatWorkspaceViewModeSync } from "./cat-workspace-view-mode-sync";
import { useCatWorkspaceRuntime } from "./use-cat-workspace-runtime";

export interface CatWorkspaceContainerProps {
  initialState: CatWorkspaceState;
  /** Overrides persisted view-mode preference for this workspace instance. */
  initialViewMode?: CatWorkspaceViewMode;
  queueSnapshot?: CatWorkspaceState | null;
  lazySegment?: {
    organizationSlug: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    externalResourceId?: string | null;
    resourceType?: "file" | "key";
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
  queueSort?: CatQueueSort;
  onQueueSortChange?: (sort: CatQueueSort) => void;
  availableQueueSorts?: CatQueueSort[];
  isQueueSearchPending?: boolean;
  isQueueFetchingPage?: boolean;
  isQueueLoading?: boolean;
  isImageBusy?: boolean;
  isMaxLengthSaving?: boolean;
  queuePagination?: CatWorkspaceViewProps["queuePagination"];
  hasMoreQueue?: boolean;
  onLoadMoreQueue?: () => void;
  initialSegmentKeyOrId?: string | null;
  buildSegmentShareUrl?: (segment: CatSegment) => string | null;
  canLookupFreshContext?: boolean;
  onPageLimitChange?: (pageLimit: number) => void;
  pageNavigationGuardRef?: CatPageNavigationGuardRef;
  nativeIssuesEnabled?: boolean;
  onDownloadFilteredView?: (format: "csv" | "tmx" | "xlf" | "xliff") => void;
  isDownloadingFilteredView?: boolean;
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
  queueSort,
  onQueueSortChange,
  availableQueueSorts,
  isQueueSearchPending,
  isQueueFetchingPage,
  isQueueLoading,
  isImageBusy,
  isMaxLengthSaving,
  queuePagination,
  hasMoreQueue,
  onLoadMoreQueue,
  buildSegmentShareUrl,
  canLookupFreshContext,
  onPageLimitChange,
  nativeIssuesEnabled = false,
  onDownloadFilteredView,
  isDownloadingFilteredView = false,
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
    canLookupFreshContext,
    hasMoreQueue,
    onLoadMoreQueue,
  });

  useEffect(() => {
    if (queueFilter !== undefined && store.queue.filter !== queueFilter) {
      store.queue.setFilter(queueFilter);
    }
  }, [queueFilter, store]);

  useEffect(() => {
    if (queueSort !== undefined && store.queue.sort !== queueSort) {
      store.queue.setSort(queueSort);
    }
  }, [queueSort, store]);

  useEffect(() => {
    if (queueSearch !== undefined && store.queue.search !== queueSearch) {
      store.queue.setSearch(queueSearch);
    }
  }, [queueSearch, store]);

  // Cache hits make the query look ready before CatQueryBridge writes the
  // snapshot. Block bulk targets until both the query and the store agree.
  const isQueueBulkBlocked =
    Boolean(isQueueLoading) || !store.hasIngestedQueueSnapshot(queueSnapshot ?? null);

  return (
    <>
      <CatChatDockPageContextBridge projectId={lazySegment?.projectId} />
      {onPageLimitChange ? (
        <CatWorkspaceViewModeSync onPageLimitChange={onPageLimitChange} />
      ) : null}
      <CatQueryBridge
        snapshot={queueSnapshot ?? null}
        initialSegmentKeyOrId={initialSegmentKeyOrId}
      />
      {lazySegment ? <CatWorkspaceLazySegmentSync {...lazySegment} /> : null}

      <CatQueueToolbarConnected
        onQueueSearchChange={onQueueSearchChange}
        onQueueFilterChange={controller.handleQueueFilterChange}
        availableQueueFilters={availableQueueFilters}
        queueSort={queueSort}
        onQueueSortChange={onQueueSortChange}
        availableQueueSorts={availableQueueSorts}
        isSearching={isQueueSearchPending}
        isQueueLoading={isQueueBulkBlocked}
        visibleCount={isQueueBulkBlocked ? 0 : controller.queueSegments.length}
        onSelectAllVisible={() => {
          // Placeholder or not-yet-ingested pages still expose the previous
          // filter's segment ids.
          if (isQueueBulkBlocked) {
            return;
          }
          store.selectAllVisible(controller.queueSegments.map((segment) => segment.id));
        }}
        onBulkApprove={() => {
          if (isQueueBulkBlocked) {
            return;
          }
          void controller.handleBulkApprove();
        }}
        onBulkSkip={() => {
          if (isQueueBulkBlocked) {
            return;
          }
          void controller.handleBulkSkip();
        }}
        onBulkHide={
          review?.onBulkHide
            ? () => {
                if (isQueueBulkBlocked) {
                  return;
                }
                void controller.handleBulkHide();
              }
            : undefined
        }
        onBulkUnhide={
          review?.onBulkUnhide
            ? () => {
                if (isQueueBulkBlocked) {
                  return;
                }
                void controller.handleBulkUnhide();
              }
            : undefined
        }
        onBulkLock={
          review?.onBulkLock || review?.onSetLocked
            ? () => {
                if (isQueueBulkBlocked) {
                  return;
                }
                void controller.handleBulkLock();
              }
            : undefined
        }
        onBulkUnlock={
          review?.onBulkUnlock || review?.onSetLocked
            ? () => {
                if (isQueueBulkBlocked) {
                  return;
                }
                void controller.handleBulkUnlock();
              }
            : undefined
        }
        onDownloadFilteredView={onDownloadFilteredView}
        isDownloadingFilteredView={isDownloadingFilteredView}
      />

      <CatPanelErrorBoundary
        scope="workspace"
        className={className}
        resetKeys={[
          store.selectedSegmentId,
          controller.queueFilter,
          queueSearch,
          queuePagination?.offset,
          store.ui.viewMode,
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
          revealedAgentContextSegmentIds={store.revealedAgentContextSegmentIds}
          showVisualContext={controller.canLoadVisualContext}
          canUseAiRecommendation={controller.canUseAiRecommendation}
          className={className}
          queueSearch={queueSearch}
          isQueueFetchingPage={isQueueFetchingPage}
          isQueueLoading={isQueueLoading}
          isCommentsLoading={store.isCommentsLoading}
          isSegmentTargetLoading={store.isSegmentTargetLoading}
          isImageBusy={isImageBusy}
          isMaxLengthSaving={isMaxLengthSaving}
          queuePagination={queuePagination}
          hasMoreQueue={hasMoreQueue}
          onLoadMoreQueue={onLoadMoreQueue}
          queueFilter={controller.queueFilter}
          checkedSegmentIds={store.checkedSegmentIds}
          onToggleSegmentChecked={(segmentId, checked) =>
            store.toggleSegmentChecked(segmentId, checked)
          }
          buildSegmentShareUrl={controller.resolvedBuildSegmentShareUrl}
          onIntelligencePanelVisible={controller.handleIntelligencePanelVisible}
          organizationSlug={lazySegment?.organizationSlug}
          projectId={lazySegment?.projectId}
          nativeIssuesEnabled={nativeIssuesEnabled}
          onReloadConcordance={(segmentId) => {
            void controller.handleReloadConcordance(segmentId);
          }}
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
              <FormattedMessage {...catWorkspaceContainerMessages.unsavedPageNavigationTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage
                {...catWorkspaceContainerMessages.unsavedPageNavigationDescription}
              />
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
  initialViewMode,
  queueFilter,
  queueSearch,
  queueSort,
  ...props
}: CatWorkspaceContainerProps) {
  return (
    <CatWorkspaceProvider
      initialState={initialState}
      initialSegmentKeyOrId={initialSegmentKeyOrId}
      initialViewMode={initialViewMode}
      initialQueueFilter={queueFilter}
      initialQueueSort={queueSort}
      initialSearch={queueSearch}
    >
      <CatWorkspaceContainerInner
        initialState={initialState}
        initialSegmentKeyOrId={initialSegmentKeyOrId}
        initialViewMode={initialViewMode}
        queueFilter={queueFilter}
        queueSearch={queueSearch}
        queueSort={queueSort}
        {...props}
      />
    </CatWorkspaceProvider>
  );
}

const CatWorkspaceContainerInner = observer(function CatWorkspaceContainerInner({
  pageNavigationGuardRef,
  ...props
}: CatWorkspaceContainerProps) {
  const store = useCatWorkspace();

  useEffect(() => {
    if (!pageNavigationGuardRef) {
      return;
    }

    pageNavigationGuardRef.current = (proceed) => store.attemptPageNavigation(proceed);

    return () => {
      if (pageNavigationGuardRef.current) {
        pageNavigationGuardRef.current = null;
      }
    };
  }, [pageNavigationGuardRef, store]);

  return <CatWorkspaceContainerObserver store={store} {...props} />;
});
