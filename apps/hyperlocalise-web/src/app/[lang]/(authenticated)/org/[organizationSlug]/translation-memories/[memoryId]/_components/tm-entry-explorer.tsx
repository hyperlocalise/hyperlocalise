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
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { EraserIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type { MemoryEntryRecord } from "@/api/routes/memory/memory.schema";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { formatLocaleOptionLabel } from "@/lib/i18n/locale-display-names.messages";
import { cn } from "@/lib/primitives/cn";

import { tmEntryExplorerMessages as messages } from "./tm-entry-explorer.messages";
import { TM_ENTRY_DETAIL_QUERY_KEY } from "./tm-entry-detail";
import { TmEntryDetailSheet } from "./tm-entry-detail-sheet";
import { TmEntryListToolbar } from "./tm-entry-list-toolbar";
import {
  buildTmEntryLocaleOptions,
  canGoToPreviousTmEntryPage,
  getActiveTmEntryFilterChips,
  readTmEntryScrollOffset,
  tmEntryCursorStackStorageKey,
  tmEntryListStateToApiQuery,
  tmEntryScrollStorageKey,
  writeTmEntryScrollOffset,
} from "./tm-entry-list-state";
import {
  fetchTmEntrySearchPage,
  isAbortError,
  isInvalidCursorError,
  shouldApplyTmEntrySearchResult,
  TM_ENTRY_SEARCH_QUERY_KEY,
  tmEntrySearchQueryKey,
} from "./tm-entry-search";
import {
  bulkDeleteTmEntries,
  bulkReviewTmEntries,
  fetchTmEntryReviewSummary,
  tmEntryReviewSummaryQueryKey,
} from "./tm-entry-review";
import { useTmEntryListUrlState } from "./use-tm-entry-list-url-state";
import { TranslationMemoryDetailStore } from "../store/translation-memory-detail-store";
import { useOptionalTranslationMemoryDetailStore } from "../store/translation-memory-detail-store-context";

export const TmEntryExplorer = observer(function TmEntryExplorer({
  organizationSlug,
  memoryId,
  localeCoverage,
  canEdit,
  canReview = false,
  canBulkDelete = false,
  canManageMemories = false,
  onDeleteEntry,
  isDeleting = false,
  toolbarActions,
  emptyActions,
}: {
  organizationSlug: string;
  memoryId: string;
  localeCoverage: string[];
  canEdit: boolean;
  canReview?: boolean;
  canBulkDelete?: boolean;
  canManageMemories?: boolean;
  onDeleteEntry?: (entryId: string) => void;
  isDeleting?: boolean;
  toolbarActions?: ReactNode;
  emptyActions?: ReactNode;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const { state, searchDraft, setSearchDraft, updateState, clearFilters } =
    useTmEntryListUrlState();
  const pageStore = useOptionalTranslationMemoryDetailStore();
  const localStore = useMemo(
    () => new TranslationMemoryDetailStore(organizationSlug, memoryId),
    [organizationSlug, memoryId],
  );
  const store = pageStore ?? localStore;
  const selectedEntryIds = store.selectedEntryIds;
  const confirmBulkDeleteOpen = store.confirmBulkDeleteOpen;
  const cursorNotice = store.cursorNotice;
  const startInEditMode = store.startInEditMode;
  const cursorStack = store.cursorStack;
  const listRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const apiQuery = tmEntryListStateToApiQuery(state);
  const cursorStackKey = tmEntryCursorStackStorageKey(memoryId, state);

  useEffect(() => {
    store.loadCursorStack(cursorStackKey);
  }, [cursorStackKey, store]);

  const localeOptions = useMemo(
    () =>
      buildTmEntryLocaleOptions({
        localeCoverage: [...localeCoverage, state.sourceLocale, state.targetLocale].filter(
          (locale): locale is string => Boolean(locale),
        ),
      }),
    [localeCoverage, state.sourceLocale, state.targetLocale],
  );

  const entriesQuery = useQuery({
    queryKey: tmEntrySearchQueryKey(organizationSlug, memoryId, apiQuery),
    queryFn: async ({ signal }) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      try {
        const page = await fetchTmEntrySearchPage({
          client: goSvcClient,
          organizationSlug,
          memoryId,
          state,
          cursor: state.cursor,
          signal,
          fallbackMessage: intl.formatMessage(messages.error),
        });
        if (
          !shouldApplyTmEntrySearchResult({
            requestId,
            latestRequestId: requestIdRef.current,
            aborted: signal.aborted,
          })
        ) {
          throw new DOMException("Aborted", "AbortError");
        }
        return page;
      } catch (error) {
        if (isAbortError(error) || signal.aborted) {
          throw error;
        }
        if (
          !shouldApplyTmEntrySearchResult({
            requestId,
            latestRequestId: requestIdRef.current,
          })
        ) {
          throw new DOMException("Aborted", "AbortError");
        }
        throw error;
      }
    },
  });

  const reviewSummaryQuery = useQuery({
    queryKey: tmEntryReviewSummaryQueryKey(organizationSlug, memoryId),
    queryFn: ({ signal }) =>
      fetchTmEntryReviewSummary({
        organizationSlug,
        memoryId,
        signal,
        fallbackMessage: intl.formatMessage(messages.error),
      }),
  });

  useEffect(() => {
    if (!entriesQuery.isError || !isInvalidCursorError(entriesQuery.error) || !state.cursor) {
      return;
    }
    store.setCursorNotice(intl.formatMessage(messages.invalidCursor));
    store.resetCursorStack(cursorStackKey);
    updateState({ cursor: undefined });
  }, [
    cursorStackKey,
    entriesQuery.error,
    entriesQuery.isError,
    intl,
    state.cursor,
    store,
    updateState,
  ]);

  useEffect(() => {
    const stored = readTmEntryScrollOffset(tmEntryScrollStorageKey(memoryId));
    if (stored === null || !listRef.current) {
      return;
    }
    listRef.current.scrollTop = stored;
  }, [memoryId, entriesQuery.dataUpdatedAt]);

  const entries = entriesQuery.data?.memoryEntries ?? [];
  const total = entriesQuery.data?.total ?? 0;
  const hasMore = entriesQuery.data?.pagination.hasMore ?? Boolean(entriesQuery.data?.nextCursor);
  const selectedEntry = entries.find((entry) => entry.id === state.entry) ?? null;
  const hasFilters = getActiveTmEntryFilterChips(state).length > 0;
  const visibleEntryIds = entries.map((entry) => entry.id);
  const selectedVisibleEntries = entries.filter((entry) => selectedEntryIds.includes(entry.id));
  const selectedVisibleIds = selectedVisibleEntries.map((entry) => entry.id);
  const allVisibleSelected =
    visibleEntryIds.length > 0 && selectedVisibleIds.length === visibleEntryIds.length;
  const someVisibleSelected = selectedVisibleIds.length > 0 && !allVisibleSelected;
  const pendingDraftCount = reviewSummaryQuery.data?.pending ?? 0;
  const showReviewQueue =
    pendingDraftCount > 0 && state.reviewStatus !== "pending" && !state.sameAsSource;
  const canSelectEntries = canReview || canBulkDelete;

  const persistScroll = () => {
    if (listRef.current) {
      writeTmEntryScrollOffset(tmEntryScrollStorageKey(memoryId), listRef.current.scrollTop);
    }
  };

  const openEntry = (entry: MemoryEntryRecord, options?: { edit?: boolean }) => {
    persistScroll();
    store.openEntry(options);
    updateState({ entry: entry.id });
    listRef.current?.querySelector<HTMLElement>(`[data-entry-id="${entry.id}"]`)?.focus();
  };

  const closeEntry = () => {
    store.closeEntry();
    updateState({ entry: undefined });
    const stored = readTmEntryScrollOffset(tmEntryScrollStorageKey(memoryId));
    if (stored !== null && listRef.current) {
      listRef.current.scrollTop = stored;
    }
  };

  const invalidateMemoryEntries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [TM_ENTRY_SEARCH_QUERY_KEY, organizationSlug, memoryId],
      }),
      queryClient.invalidateQueries({
        queryKey: tmEntryReviewSummaryQueryKey(organizationSlug, memoryId),
      }),
      queryClient.invalidateQueries({
        queryKey: [TM_ENTRY_DETAIL_QUERY_KEY, organizationSlug, memoryId],
      }),
    ]);
    store.clearSelection();
  };

  const bulkReview = useMutation({
    mutationFn: (reviewStatus: "approved" | "rejected") =>
      bulkReviewTmEntries({
        organizationSlug,
        memoryId,
        entries: selectedVisibleEntries.map((entry) => ({
          id: entry.id,
          version: entry.version,
        })),
        reviewStatus,
        fallbackMessage: intl.formatMessage(messages.bulkReviewFailed),
      }),
    onSuccess: async (result, reviewStatus) => {
      await invalidateMemoryEntries();
      toast.success(
        intl.formatMessage(
          reviewStatus === "approved" ? messages.bulkApproved : messages.bulkRejected,
          {
            count: result.updated,
          },
        ),
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkDelete = useMutation({
    mutationFn: () =>
      bulkDeleteTmEntries({
        organizationSlug,
        memoryId,
        entryIds: selectedVisibleIds,
        fallbackMessage: intl.formatMessage(messages.bulkDeleteFailed),
      }),
    onSuccess: async (result) => {
      if (state.entry && selectedVisibleIds.includes(state.entry)) {
        closeEntry();
      }
      await invalidateMemoryEntries();
      store.setConfirmBulkDeleteOpen(false);
      toast.success(intl.formatMessage(messages.bulkDeleted, { count: result.deleted }));
    },
    onError: (error) => toast.error(error.message),
  });

  const goNext = () => {
    const nextCursor = entriesQuery.data?.nextCursor;
    if (!nextCursor) {
      return;
    }
    persistScroll();
    store.pushCursor(cursorStackKey, state.cursor ?? "");
    updateState({ cursor: nextCursor });
  };

  const canGoPrevious = canGoToPreviousTmEntryPage({
    cursor: state.cursor,
    cursorStack,
  });

  const goPrevious = () => {
    if (!canGoPrevious) {
      return;
    }
    persistScroll();
    const previous = store.popCursor(cursorStackKey);
    updateState({ cursor: previous || undefined });
  };

  const statusMessage = entriesQuery.isFetching
    ? intl.formatMessage(messages.statusLoading)
    : (cursorNotice ??
      intl.formatMessage(messages.statusCount, {
        total,
      }));

  return (
    <div className="grid gap-4">
      <TmEntryListToolbar
        state={state}
        searchDraft={searchDraft}
        localeOptions={localeOptions}
        onSearchDraftChange={setSearchDraft}
        onStateChange={updateState}
        onClearFilters={clearFilters}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button type="button" variant="outline" size="sm" className="gap-1.5" />}
              >
                <EraserIcon className="size-3.5" />
                <FormattedMessage {...messages.cleanupLabel} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem
                  onClick={() => updateState({ reviewStatus: "pending", sameAsSource: undefined })}
                >
                  <FormattedMessage {...messages.cleanupDrafts} />
                  {pendingDraftCount > 0 ? ` (${pendingDraftCount})` : ""}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    updateState({
                      reviewStatus: "rejected",
                      sameAsSource: undefined,
                    })
                  }
                >
                  <FormattedMessage {...messages.cleanupRejected} />
                  {reviewSummaryQuery.data?.rejected
                    ? ` (${reviewSummaryQuery.data.rejected})`
                    : ""}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    updateState({
                      sameAsSource: true,
                      reviewStatus: undefined,
                    })
                  }
                >
                  <FormattedMessage {...messages.cleanupSameAsSource} />
                  {reviewSummaryQuery.data?.sameAsSource
                    ? ` (${reviewSummaryQuery.data.sameAsSource})`
                    : ""}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    updateState({
                      origin: "file_job",
                      sameAsSource: undefined,
                    })
                  }
                >
                  <FormattedMessage {...messages.cleanupJobOrigin} />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {toolbarActions}
          </>
        }
      />

      {showReviewQueue ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <div className="grid gap-1">
            <TypographyP size="small" weight="medium">
              <FormattedMessage
                {...messages.reviewQueueTitle}
                values={{ count: pendingDraftCount }}
              />
            </TypographyP>
            <TypographyP size="xsmall" tone="subtle">
              <FormattedMessage {...messages.reviewQueueBody} />
            </TypographyP>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => updateState({ reviewStatus: "pending", sameAsSource: undefined })}
          >
            <FormattedMessage {...messages.reviewDrafts} />
          </Button>
        </div>
      ) : null}

      {canSelectEntries && selectedVisibleIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
          <TypographyP size="small" weight="medium">
            <FormattedMessage
              {...messages.selectedCount}
              values={{ count: selectedVisibleIds.length }}
            />
          </TypographyP>
          {canReview ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={bulkReview.isPending || bulkDelete.isPending}
                onClick={() => bulkReview.mutate("approved")}
              >
                <FormattedMessage {...messages.approveSelected} />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={bulkReview.isPending || bulkDelete.isPending}
                onClick={() => bulkReview.mutate("rejected")}
              >
                <FormattedMessage {...messages.rejectSelected} />
              </Button>
            </>
          ) : null}
          {canBulkDelete ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={bulkReview.isPending || bulkDelete.isPending}
              onClick={() => store.setConfirmBulkDeleteOpen(true)}
            >
              <FormattedMessage {...messages.deleteSelected} />
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </div>
      {cursorNotice ? (
        <TypographyP size="small" tone="subtle">
          {cursorNotice}
        </TypographyP>
      ) : null}

      {selectedEntry ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
          <TypographyP size="small" weight="medium">
            <FormattedMessage {...messages.selectedEntry} />
          </TypographyP>
          <Button type="button" size="sm" variant="outline" onClick={closeEntry}>
            <FormattedMessage {...messages.closeEntry} />
          </Button>
        </div>
      ) : null}

      {entriesQuery.isLoading ? (
        <div
          className="overflow-hidden rounded-lg border border-border"
          aria-busy="true"
          aria-label={intl.formatMessage(messages.loadingAria)}
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1fr_1fr_auto]"
            >
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      ) : null}

      {entriesQuery.isError && !isInvalidCursorError(entriesQuery.error) ? (
        <div className="grid gap-3 rounded-lg border border-border px-4 py-10 text-center">
          <TypographyP size="small" tone="subtle">
            {entriesQuery.error instanceof Error
              ? entriesQuery.error.message
              : intl.formatMessage(messages.error)}
          </TypographyP>
          <div>
            <Button type="button" variant="outline" onClick={() => entriesQuery.refetch()}>
              <FormattedMessage {...messages.retry} />
            </Button>
          </div>
        </div>
      ) : null}

      {entriesQuery.isSuccess && entries.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border px-4 py-10 text-center">
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...(hasFilters ? messages.empty : messages.emptyNoFilters)} />
          </TypographyP>
          {!hasFilters && emptyActions ? (
            <div className="flex flex-wrap items-center justify-center gap-2">{emptyActions}</div>
          ) : null}
        </div>
      ) : null}

      {entriesQuery.isSuccess && entries.length > 0 ? (
        <div
          ref={listRef}
          className="max-h-[40rem] overflow-auto rounded-lg border border-border"
          aria-busy={entriesQuery.isFetching}
        >
          {canSelectEntries ? (
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <Checkbox
                checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => {
                  store.setVisibleSelection(visibleEntryIds, checked === true);
                }}
                aria-label={intl.formatMessage(messages.selectAllAria)}
              />
              <TypographyP size="xsmall" tone="subtle">
                <FormattedMessage {...messages.selectAllAria} />
              </TypographyP>
            </div>
          ) : null}
          {entries.map((entry) => {
            const isSelected = entry.id === state.entry;
            const isChecked = selectedEntryIds.includes(entry.id);
            const reviewLabel =
              entry.reviewStatus === "approved"
                ? intl.formatMessage(messages.reviewApproved)
                : entry.reviewStatus === "rejected"
                  ? intl.formatMessage(messages.reviewRejected)
                  : intl.formatMessage(messages.reviewPending);
            const originLabel =
              entry.provenance === "file_job"
                ? intl.formatMessage(messages.originFileJob)
                : entry.provenance === "approved_job"
                  ? intl.formatMessage(messages.originApprovedJob)
                  : entry.provenance === "import"
                    ? intl.formatMessage(messages.originImport)
                    : entry.provenance === "sync"
                      ? intl.formatMessage(messages.originSync)
                      : intl.formatMessage(messages.originManual);
            return (
              <div
                key={entry.id}
                data-entry-id={entry.id}
                role="button"
                tabIndex={0}
                aria-current={isSelected ? "true" : undefined}
                aria-label={intl.formatMessage(messages.openEntryAria, {
                  sourceText: entry.sourceText,
                })}
                className={cn(
                  "grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:items-center",
                  canSelectEntries
                    ? "md:grid-cols-[auto_1fr_1fr_auto]"
                    : "md:grid-cols-[1fr_1fr_auto]",
                  isSelected && "bg-muted/50",
                )}
                onClick={() => openEntry(entry)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEntry(entry);
                  }
                }}
              >
                {canSelectEntries ? (
                  <div
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        store.toggleEntryId(entry.id, checked === true);
                      }}
                      aria-label={intl.formatMessage(messages.selectEntryAria, {
                        sourceText: entry.sourceText,
                      })}
                    />
                  </div>
                ) : null}
                <div>
                  <TypographyP size="small" weight="medium">
                    {entry.sourceText}
                  </TypographyP>
                  <TypographyP size="xsmall" tone="subtle">
                    <FormattedMessage
                      {...messages.localePair}
                      values={{
                        sourceLocale: formatLocaleOptionLabel(intl, entry.sourceLocale),
                        targetLocale: formatLocaleOptionLabel(intl, entry.targetLocale),
                      }}
                    />
                  </TypographyP>
                </div>
                <div className="grid gap-1">
                  <TypographyP size="small" tone="subtlest">
                    {entry.targetText}
                  </TypographyP>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={entry.reviewStatus === "pending" ? "default" : "outline"}>
                      {reviewLabel}
                    </Badge>
                    <Badge variant="outline">{originLabel}</Badge>
                  </div>
                </div>
                {canEdit ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEntry(entry, { edit: true });
                      }}
                    >
                      <FormattedMessage {...messages.editEntry} />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isDeleting}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteEntry?.(entry.id);
                      }}
                    >
                      <FormattedMessage {...messages.deleteEntry} />
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <AlertDialog
        open={confirmBulkDeleteOpen}
        onOpenChange={(nextOpen) => {
          if (bulkDelete.isPending) {
            return;
          }
          store.setConfirmBulkDeleteOpen(nextOpen);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.confirmBulkDeleteTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {intl.formatMessage(messages.confirmBulkDeleteBody, {
                count: selectedVisibleIds.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDelete.isPending}>
              <FormattedMessage {...messages.cancelBulkDelete} />
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={bulkDelete.isPending}
              onClick={() => bulkDelete.mutate()}
            >
              <FormattedMessage {...messages.confirmBulkDeleteAction} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TmEntryDetailSheet
        organizationSlug={organizationSlug}
        memoryId={memoryId}
        entryId={state.entry ?? null}
        localeCoverage={localeCoverage}
        canManageMemories={canManageMemories}
        open={Boolean(state.entry)}
        startInEditMode={startInEditMode}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeEntry();
          }
        }}
        onOpenVariant={(variantId) => {
          store.setStartInEditMode(false);
          persistScroll();
          updateState({ entry: variantId });
        }}
      />

      {selectedEntry && (selectedEntry.createdByUserId || selectedEntry.importBatchId) ? (
        <div className="flex flex-wrap gap-2">
          {selectedEntry.createdByUserId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                updateState({ createdByUserId: selectedEntry.createdByUserId ?? undefined })
              }
            >
              <FormattedMessage {...messages.filterByCreator} />
            </Button>
          ) : null}
          {selectedEntry.importBatchId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                updateState({ importBatchId: selectedEntry.importBatchId ?? undefined })
              }
            >
              <FormattedMessage {...messages.filterByBatch} />
            </Button>
          ) : null}
        </div>
      ) : null}

      {entriesQuery.isSuccess && (hasMore || Boolean(state.cursor)) ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TypographyP size="xsmall" tone="subtle">
            {statusMessage}
          </TypographyP>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canGoPrevious || entriesQuery.isFetching}
              onClick={goPrevious}
            >
              <FormattedMessage {...messages.previousPage} />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasMore || entriesQuery.isFetching}
              onClick={goNext}
            >
              <FormattedMessage {...messages.nextPage} />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
