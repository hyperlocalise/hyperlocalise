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

import type { ProjectFileContentEditorQueueFile } from "@/api/routes/project/project.schema";
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
  ContentEditorWorkspaceDependencies,
  ContentEditorWorkspaceViewProps,
  PartialCatWorkspaceDependencies,
} from "@/components/content-editor/shared/dependencies";
import type {
  ContentEditorQueueFilter,
  ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import { ContentEditorQueueToolbarConnected } from "@/components/content-editor/queue/content-editor-queue-toolbar-connected";
import { contentEditorWorkspaceContainerMessages } from "@/components/content-editor/shared/content-editor.messages";
import type {
  ContentEditorSegment,
  ContentEditorWorkspaceState,
} from "@/components/content-editor/shared/types";

import { ContentEditorQueryBridge } from "./bridge/content-editor-query-bridge";
import { ContentEditorChatDockPageContextBridge } from "./content-editor-chat-dock-page-context-bridge";
import { ContentEditorPanelErrorBoundary } from "./content-editor-panel-error-boundary";
import { ContentEditorWorkspaceLazySegmentSync } from "./content-editor-workspace-lazy-segment-sync";
import { ContentEditorWorkspaceView } from "./content-editor-workspace";
import {
  ContentEditorWorkspaceProvider,
  useContentEditorWorkspace,
} from "./content-editor-workspace-context";
import type { ContentEditorWorkspaceOrchestrator } from "./content-editor-workspace-orchestrator";
import type { ContentEditorPageNavigationGuardRef } from "./content-editor-page-navigation-guard";
import type { ContentEditorWorkspaceViewMode } from "./content-editor-workspace-view-mode";
import { ContentEditorWorkspaceViewModeSync } from "./content-editor-workspace-view-mode-sync";
import { useContentEditorWorkspaceRuntime } from "./use-content-editor-workspace-runtime";

export interface ContentEditorWorkspaceContainerProps {
  initialState: ContentEditorWorkspaceState;
  /** Overrides persisted view-mode preference for this workspace instance. */
  initialViewMode?: ContentEditorWorkspaceViewMode;
  queueSnapshot?: ContentEditorWorkspaceState | null;
  lazySegment?: {
    organizationSlug: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    externalResourceId?: string | null;
    resourceType?: "file" | "key";
    contentEditorFile: ProjectFileContentEditorQueueFile | null | undefined;
    enabled: boolean;
  };
  dependencies?: PartialCatWorkspaceDependencies;
  navigation?: Partial<ContentEditorWorkspaceDependencies["navigation"]>;
  editing?: Partial<ContentEditorWorkspaceDependencies["editing"]>;
  review?: Partial<ContentEditorWorkspaceDependencies["review"]>;
  services?: ContentEditorWorkspaceDependencies["services"];
  className?: string;
  queueSearch?: string;
  onQueueSearchChange?: (value: string) => void;
  queueFilter?: ContentEditorQueueFilter;
  onQueueFilterChange?: (filter: ContentEditorQueueFilter) => void;
  availableQueueFilters?: ContentEditorQueueFilter[];
  queueSort?: ContentEditorQueueSort;
  onQueueSortChange?: (sort: ContentEditorQueueSort) => void;
  availableQueueSorts?: ContentEditorQueueSort[];
  isQueueSearchPending?: boolean;
  isQueueFetchingPage?: boolean;
  isQueueLoading?: boolean;
  isImageBusy?: boolean;
  isMaxLengthSaving?: boolean;
  queuePagination?: ContentEditorWorkspaceViewProps["queuePagination"];
  hasMoreQueue?: boolean;
  onLoadMoreQueue?: () => void;
  initialSegmentKeyOrId?: string | null;
  buildSegmentShareUrl?: (segment: ContentEditorSegment) => string | null;
  canLookupFreshContext?: boolean;
  onPageLimitChange?: (pageLimit: number) => void;
  pageNavigationGuardRef?: ContentEditorPageNavigationGuardRef;
  nativeIssuesEnabled?: boolean;
  onDownloadFilteredView?: (format: "csv" | "tmx" | "xlf" | "xliff") => void;
  isDownloadingFilteredView?: boolean;
}

const ContentEditorWorkspaceContainerObserver = observer(
  function ContentEditorWorkspaceContainerObserver({
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
  }: ContentEditorWorkspaceContainerProps & { store: ContentEditorWorkspaceOrchestrator }) {
    const controller = useContentEditorWorkspaceRuntime({
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

    // Cache hits make the query look ready before ContentEditorQueryBridge writes the
    // snapshot. Block bulk targets until both the query and the store agree.
    const isQueueBulkBlocked =
      Boolean(isQueueLoading) || !store.hasIngestedQueueSnapshot(queueSnapshot ?? null);

    return (
      <>
        <ContentEditorChatDockPageContextBridge projectId={lazySegment?.projectId} />
        {onPageLimitChange ? (
          <ContentEditorWorkspaceViewModeSync onPageLimitChange={onPageLimitChange} />
        ) : null}
        <ContentEditorQueryBridge
          snapshot={queueSnapshot ?? null}
          initialSegmentKeyOrId={initialSegmentKeyOrId}
        />
        {lazySegment ? <ContentEditorWorkspaceLazySegmentSync {...lazySegment} /> : null}

        <ContentEditorQueueToolbarConnected
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

        <ContentEditorPanelErrorBoundary
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
          <ContentEditorWorkspaceView
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
        </ContentEditorPanelErrorBoundary>

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
                <FormattedMessage
                  {...contentEditorWorkspaceContainerMessages.unsavedPageNavigationTitle}
                />
              </AlertDialogTitle>
              <AlertDialogDescription>
                <FormattedMessage
                  {...contentEditorWorkspaceContainerMessages.unsavedPageNavigationDescription}
                />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <FormattedMessage
                  {...contentEditorWorkspaceContainerMessages.unsavedNavigationStay}
                />
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => store.confirmUnsavedNavigation()}>
                <FormattedMessage
                  {...contentEditorWorkspaceContainerMessages.unsavedNavigationDiscard}
                />
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);

export function ContentEditorWorkspaceContainer({
  initialState,
  initialSegmentKeyOrId,
  initialViewMode,
  queueFilter,
  queueSearch,
  queueSort,
  ...props
}: ContentEditorWorkspaceContainerProps) {
  return (
    <ContentEditorWorkspaceProvider
      initialState={initialState}
      initialSegmentKeyOrId={initialSegmentKeyOrId}
      initialViewMode={initialViewMode}
      initialQueueFilter={queueFilter}
      initialQueueSort={queueSort}
      initialSearch={queueSearch}
    >
      <ContentEditorWorkspaceContainerInner
        initialState={initialState}
        initialSegmentKeyOrId={initialSegmentKeyOrId}
        initialViewMode={initialViewMode}
        queueFilter={queueFilter}
        queueSearch={queueSearch}
        queueSort={queueSort}
        {...props}
      />
    </ContentEditorWorkspaceProvider>
  );
}

const ContentEditorWorkspaceContainerInner = observer(
  function ContentEditorWorkspaceContainerInner({
    pageNavigationGuardRef,
    ...props
  }: ContentEditorWorkspaceContainerProps) {
    const store = useContentEditorWorkspace();

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

    return <ContentEditorWorkspaceContainerObserver store={store} {...props} />;
  },
);
