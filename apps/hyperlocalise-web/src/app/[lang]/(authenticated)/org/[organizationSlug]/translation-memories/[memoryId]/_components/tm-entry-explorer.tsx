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
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import type { MemoryEntryRecord } from "@/api/routes/memory/memory.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { formatLocaleOptionLabel } from "@/lib/i18n/locale-display-names.messages";
import { cn } from "@/lib/primitives/cn";

import { tmEntryExplorerMessages as messages } from "./tm-entry-explorer.messages";
import { TmEntryListToolbar } from "./tm-entry-list-toolbar";
import {
    buildTmEntryLocaleOptions,
    getActiveTmEntryFilterChips,
    readTmEntryCursorStack,
    readTmEntryScrollOffset,
    tmEntryCursorStackStorageKey,
    tmEntryListStateToApiQuery,
    tmEntryScrollStorageKey,
    writeTmEntryCursorStack,
    writeTmEntryScrollOffset,
} from "./tm-entry-list-state";
import {
    fetchTmEntrySearchPage,
    isAbortError,
    isInvalidCursorError,
    shouldApplyTmEntrySearchResult,
    tmEntrySearchQueryKey,
} from "./tm-entry-search";
import { useTmEntryListUrlState } from "./use-tm-entry-list-url-state";

export function TmEntryExplorer({
    organizationSlug,
    memoryId,
    localeCoverage,
    canEdit,
    onEditEntry,
    onDeleteEntry,
    isDeleting = false,
}: {
    organizationSlug: string;
    memoryId: string;
    localeCoverage: string[];
    canEdit: boolean;
    onEditEntry?: (entry: MemoryEntryRecord) => void;
    onDeleteEntry?: (entryId: string) => void;
    isDeleting?: boolean;
}) {
    const intl = useIntl();
    const { state, searchDraft, setSearchDraft, updateState, clearFilters } =
        useTmEntryListUrlState();
    const listRef = useRef<HTMLDivElement>(null);
    const requestIdRef = useRef(0);
    const [cursorNotice, setCursorNotice] = useState<string | null>(null);
    const apiQuery = tmEntryListStateToApiQuery(state);
    const cursorStackKey = tmEntryCursorStackStorageKey(memoryId, state);
    const [cursorStack, setCursorStack] = useState(() => readTmEntryCursorStack(cursorStackKey));

    useEffect(() => {
        setCursorStack(readTmEntryCursorStack(cursorStackKey));
    }, [cursorStackKey]);

    const localeOptions = useMemo(
        () =>
            buildTmEntryLocaleOptions({
                localeCoverage: [
                    ...localeCoverage,
                    state.sourceLocale,
                    state.targetLocale,
                ].filter((locale): locale is string => Boolean(locale)),
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

    useEffect(() => {
        if (!entriesQuery.isError || !isInvalidCursorError(entriesQuery.error) || !state.cursor) {
            return;
        }
        setCursorNotice(intl.formatMessage(messages.invalidCursor));
        writeTmEntryCursorStack(cursorStackKey, []);
        setCursorStack([]);
        updateState({ cursor: undefined });
    }, [
        cursorStackKey,
        entriesQuery.error,
        entriesQuery.isError,
        intl,
        state.cursor,
        updateState,
    ]);

    useEffect(() => {
        setCursorNotice(null);
    }, [cursorStackKey]);

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

    const persistScroll = () => {
        if (listRef.current) {
            writeTmEntryScrollOffset(tmEntryScrollStorageKey(memoryId), listRef.current.scrollTop);
        }
    };

    const openEntry = (entry: MemoryEntryRecord) => {
        persistScroll();
        updateState({ entry: entry.id });
        listRef.current
            ?.querySelector<HTMLElement>(`[data-entry-id="${entry.id}"]`)
            ?.focus();
    };

    const closeEntry = () => {
        updateState({ entry: undefined });
        const stored = readTmEntryScrollOffset(tmEntryScrollStorageKey(memoryId));
        if (stored !== null && listRef.current) {
            listRef.current.scrollTop = stored;
        }
    };

    const goNext = () => {
        const nextCursor = entriesQuery.data?.nextCursor;
        if (!nextCursor) {
            return;
        }
        persistScroll();
        const nextStack = [...cursorStack, state.cursor ?? ""];
        writeTmEntryCursorStack(cursorStackKey, nextStack);
        setCursorStack(nextStack);
        updateState({ cursor: nextCursor });
    };

    const goPrevious = () => {
        persistScroll();
        const nextStack = [...cursorStack];
        const previous = nextStack.pop();
        writeTmEntryCursorStack(cursorStackKey, nextStack);
        setCursorStack(nextStack);
        updateState({ cursor: previous || undefined });
    };

    const statusMessage = entriesQuery.isFetching
        ? intl.formatMessage(messages.statusLoading)
        : cursorNotice ??
          intl.formatMessage(messages.statusCount, {
              shown: entries.length,
              total,
          });

    return (
        <div className="grid gap-4">
            <TmEntryListToolbar
                state={state}
                searchDraft={searchDraft}
                localeOptions={localeOptions}
                onSearchDraftChange={setSearchDraft}
                onStateChange={updateState}
                onClearFilters={clearFilters}
            />

            <div className="sr-only" role="status" aria-live="polite">
                {statusMessage}
            </div>
            {cursorNotice ? (
                <TypographyP className="text-sm text-muted-foreground">{cursorNotice}</TypographyP>
            ) : null}

            {selectedEntry ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    <TypographyP className="text-sm font-medium">
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
                    <TypographyP className="text-sm text-muted-foreground">
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
                <TypographyP className="rounded-lg border border-border px-4 py-6 text-sm text-muted-foreground">
                    <FormattedMessage {...(hasFilters ? messages.empty : messages.emptyNoFilters)} />
                </TypographyP>
            ) : null}

            {entriesQuery.isSuccess && entries.length > 0 ? (
                <div
                    ref={listRef}
                    className="max-h-[40rem] overflow-auto rounded-lg border border-border"
                    aria-busy={entriesQuery.isFetching}
                >
                    {entries.map((entry) => {
                        const isSelected = entry.id === state.entry;
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
                                    "grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1fr_1fr_auto] md:items-center",
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
                                <div>
                                    <TypographyP className="text-sm font-medium">{entry.sourceText}</TypographyP>
                                    <TypographyP className="text-xs text-muted-foreground">
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
                                    <TypographyP className="text-sm text-subtle-foreground">
                                        {entry.targetText}
                                    </TypographyP>
                                    <div className="flex flex-wrap gap-1">
                                        <Badge variant="outline">{entry.reviewStatus}</Badge>
                                        <Badge variant="outline">{entry.provenance}</Badge>
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
                                                openEntry(entry);
                                                onEditEntry?.(entry);
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
                    <TypographyP className="text-xs text-muted-foreground">{statusMessage}</TypographyP>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!state.cursor || entriesQuery.isFetching}
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
}
