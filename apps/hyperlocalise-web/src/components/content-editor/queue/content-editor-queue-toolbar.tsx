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
import {
  CaretDownIcon,
  ListChecksIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import type { CatBilingualImportCounts } from "@/lib/projects/content-editor/content-editor-bilingual-import";
import type { ContentEditorFilteredExportFormat } from "@/lib/projects/content-editor/content-editor-filtered-export";
import type { ContentEditorAdvancedQueueFilter } from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";
import {
  includedTagsOnly,
  isCatQueueFilterEmpty,
  withoutShownScope,
} from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";
import { cn } from "@/lib/primitives/cn";
import { formatLocaleDisplayName } from "@/lib/i18n/locale-display-names.messages";

import {
  contentEditorQueueFilterValues,
  contentEditorQueueSortValues,
  type ContentEditorQueueFilter,
  type ContentEditorQueueSort,
} from "./content-editor-queue-filter";
import {
  ContentEditorQueueFilterMenu,
  resolveQueueFilterButtonMessage,
} from "./content-editor-queue-filter-menu";
import { ContentEditorAdvancedQueueFilterDialog } from "./content-editor-advanced-queue-filter-dialog";
import { ContentEditorOverflowMenu } from "./content-editor-overflow-menu";
import { ContentEditorViewMenu } from "./content-editor-view-menu";
import { useContentEditorTagSearch } from "./content-editor-tag-search";
import { contentEditorTagSearchMessages } from "./content-editor-tag-search.messages";
import { ContentEditorShortcutHint } from "@/components/content-editor/editor/content-editor-shortcut-hints";
import { contentEditorBulkBarMessages } from "@/components/content-editor/shared/content-editor-chrome.messages";
import { contentEditorQueuePanelMessages } from "@/components/content-editor/shared/content-editor.messages";

export function ContentEditorQueueToolbar({
  search = "",
  onSearchChange,
  isSearching = false,
  queueFilter = "all",
  onQueueFilterChange,
  availableQueueFilters = contentEditorQueueFilterValues,
  queueSort = "file_order",
  onQueueSortChange,
  availableQueueSorts = contentEditorQueueSortValues,
  queueFilterQualifier,
  onQueueFilterQualifierChange,
  queueAdvanced,
  onQueueAdvancedChange,
  providerKind,
  organizationSlug,
  projectId,
  selectionMode = false,
  onSelectionModeChange,
  selectedCount = 0,
  visibleCount = 0,
  onSelectAllVisible,
  onClearChecked,
  onBulkApprove,
  onBulkSkip,
  onBulkHide,
  onBulkUnhide,
  onBulkLock,
  onBulkUnlock,
  onBulkCreateTask,
  onBulkEditTags,
  isBulkActionPending = false,
  bulkProgress,
  bulkActionLocale,
  isQueueLoading = false,
  onDownloadFilteredView,
  isDownloadingFilteredView = false,
  onImportBilingualFile,
  isImportingBilingualFile = false,
  adaptiveWorkspaceEnabled = false,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  isSearching?: boolean;
  queueFilter?: ContentEditorQueueFilter;
  onQueueFilterChange?: (filter: ContentEditorQueueFilter) => void;
  availableQueueFilters?: ContentEditorQueueFilter[];
  queueSort?: ContentEditorQueueSort;
  onQueueSortChange?: (sort: ContentEditorQueueSort) => void;
  availableQueueSorts?: ContentEditorQueueSort[];
  queueFilterQualifier?: string;
  onQueueFilterQualifierChange?: (qualifier: string | undefined) => void;
  queueAdvanced?: ContentEditorAdvancedQueueFilter;
  onQueueAdvancedChange?: (filter: ContentEditorAdvancedQueueFilter | undefined) => void;
  providerKind?: string | null;
  organizationSlug?: string;
  projectId?: string;
  selectionMode?: boolean;
  onSelectionModeChange?: (enabled: boolean) => void;
  selectedCount?: number;
  visibleCount?: number;
  onSelectAllVisible?: () => void;
  onClearChecked?: () => void;
  onBulkApprove?: () => void;
  onBulkSkip?: () => void;
  onBulkHide?: () => void;
  onBulkUnhide?: () => void;
  onBulkLock?: () => void;
  onBulkUnlock?: () => void;
  onBulkCreateTask?: () => void;
  onBulkEditTags?: () => void;
  isBulkActionPending?: boolean;
  bulkProgress?: string;
  /**
   * Language that Approve, Lock and Unlock act on, named on those actions. Set where several
   * languages are on screen (the multilingual table). Hide and unhide act on every language,
   * and skip is not saved, so they keep their usual names.
   */
  bulkActionLocale?: string;
  /**
   * When the queue query is showing placeholder data, or the store has not
   * ingested the current snapshot yet, visible segments may still be from the
   * previous page. Bulk select/mutate must wait until both are ready.
   */
  isQueueLoading?: boolean;
  onDownloadFilteredView?: (format: ContentEditorFilteredExportFormat) => void;
  isDownloadingFilteredView?: boolean;
  onImportBilingualFile?: (file: File) => Promise<CatBilingualImportCounts>;
  isImportingBilingualFile?: boolean;
  /** When true, the View menu offers the adaptive workspace persona switch. Off by default. */
  adaptiveWorkspaceEnabled?: boolean;
}) {
  const intl = useIntl();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const canEnterSelectionMode = Boolean(onSelectionModeChange);
  const isSelecting = canEnterSelectionMode && selectionMode;
  const showBulkBar = isSelecting && selectedCount > 0;
  const hasActiveFilter =
    queueFilter !== "all" || Boolean(queueFilterQualifier) || !isCatQueueFilterEmpty(queueAdvanced);
  // Native projects' labels are their strings' tags, which `tag:` in the search box filters by.
  const tagSearchEnabled = providerKind == null || providerKind === "native";
  // A key job's scope and searched tags show beside the search box, so the button names the
  // quick filter unless other advanced filters are set.
  const filterButtonMessage = resolveQueueFilterButtonMessage({
    queueFilter,
    queueSort,
    queueAdvanced: withoutShownScope(queueAdvanced, tagSearchEnabled),
  });
  // Placeholder reuse or a not-yet-ingested cache hit can keep chrome mounted
  // while the store still holds the previous page — never treat those ids as
  // bulk targets.
  const bulkTargetsReady = !isQueueLoading;
  // A key job's scope rides in the advanced filter; other filter changes keep it.
  const jobId = queueAdvanced?.jobId;
  const keepJobScope = (filter: ContentEditorAdvancedQueueFilter | undefined) =>
    jobId ? { ...filter, jobId } : filter;
  const selectableVisibleCount = bulkTargetsReady ? visibleCount : 0;
  const tagSearch = useContentEditorTagSearch({
    enabled: tagSearchEnabled,
    search,
    onSearchChange,
    queueAdvanced,
    onQueueAdvancedChange,
    organizationSlug,
    projectId,
  });

  useHotkeys("escape", () => onSelectionModeChange?.(false), {
    enabled: isSelecting && !isBulkActionPending,
  });

  const selectAllButton = onSelectAllVisible ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 text-xs"
      onClick={onSelectAllVisible}
      disabled={selectableVisibleCount === 0 || isBulkActionPending}
    >
      <FormattedMessage
        {...contentEditorBulkBarMessages.selectAllVisible}
        values={{ count: selectableVisibleCount }}
      />
    </Button>
  ) : null;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
      {jobId && onQueueAdvancedChange ? (
        <div
          role="status"
          className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
        >
          <FormattedMessage {...contentEditorQueuePanelMessages.keyJobScope} />
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-xs"
            onClick={() => {
              const rest = { ...queueAdvanced };
              delete rest.jobId;
              onQueueAdvancedChange(isCatQueueFilterEmpty(rest) ? undefined : rest);
            }}
          >
            <FormattedMessage {...contentEditorQueuePanelMessages.keyJobShowAll} />
          </Button>
        </div>
      ) : null}
      {showBulkBar ? (
        <ContentEditorBulkBar
          selectedCount={selectedCount}
          canMutate={bulkTargetsReady && !isBulkActionPending}
          isBulkActionPending={isBulkActionPending}
          bulkProgress={bulkProgress}
          selectAllButton={selectAllButton}
          onClearChecked={onClearChecked}
          onBulkApprove={onBulkApprove}
          onBulkSkip={onBulkSkip}
          onBulkHide={onBulkHide}
          onBulkUnhide={onBulkUnhide}
          onBulkLock={onBulkLock}
          onBulkUnlock={onBulkUnlock}
          actionLocale={bulkActionLocale}
          onBulkCreateTask={onBulkCreateTask}
          onBulkEditTags={onBulkEditTags}
          onDone={() => onSelectionModeChange?.(false)}
        />
      ) : (
        <>
          {onSearchChange ? (
            <div className="relative min-w-0 flex-1 basis-40">
              {tagSearch.active ? (
                // Tag filters sit in the box as pills before the text, as fields do in a
                // visual workflow's settings.
                <InputGroup className="h-8 rounded-lg">
                  <InputGroupAddon
                    align="inline-start"
                    className="max-w-[60%] gap-1 overflow-x-auto py-0 ps-2.5"
                  >
                    <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
                    {tagSearch.chips}
                  </InputGroupAddon>
                  <InputGroupInput
                    value={tagSearch.inputValue}
                    onChange={(event) => tagSearch.onInputChange(event.target.value)}
                    onKeyDown={tagSearch.onInputKeyDown}
                    {...tagSearch.inputProps}
                    placeholder={
                      tagSearch.hasTags
                        ? undefined
                        : intl.formatMessage(contentEditorTagSearchMessages.searchPlaceholder)
                    }
                    aria-label={intl.formatMessage(contentEditorQueuePanelMessages.searchAria)}
                    className="h-8 pe-9 font-mono text-xs"
                    data-content-editor-string-search="true"
                  />
                </InputGroup>
              ) : (
                <>
                  <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={intl.formatMessage(
                      contentEditorQueuePanelMessages.searchPlaceholder,
                    )}
                    aria-label={intl.formatMessage(contentEditorQueuePanelMessages.searchAria)}
                    className="h-8 pl-9 font-mono text-xs"
                    data-content-editor-string-search="true"
                  />
                </>
              )}
              {isSearching ? (
                <Spinner className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2" />
              ) : (
                <ContentEditorShortcutHint
                  shortcut="searchStrings"
                  className="top-1/2 right-2 -translate-y-1/2"
                />
              )}
              {tagSearch.suggestions}
            </div>
          ) : null}

          {onQueueFilterChange ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 shrink-0 gap-1.5 font-normal",
                        hasActiveFilter && "border-grove-400/40",
                      )}
                      aria-label={intl.formatMessage(
                        contentEditorQueuePanelMessages.filterQueueAria,
                      )}
                    />
                  }
                >
                  <FunnelIcon className="size-3.5" />
                  <span className="text-xs">
                    <FormattedMessage {...filterButtonMessage} />
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <ContentEditorQueueFilterMenu
                    queueFilter={queueFilter}
                    queueSort={queueSort}
                    queueFilterQualifier={queueFilterQualifier}
                    queueAdvanced={queueAdvanced}
                    availableQueueFilters={availableQueueFilters}
                    availableQueueSorts={availableQueueSorts}
                    providerKind={providerKind}
                    onSelect={(selection) => {
                      onQueueFilterChange(selection.filter);
                      onQueueFilterQualifierChange?.(selection.qualifier);
                      // Searched tags stay, as the search text does.
                      onQueueAdvancedChange?.(
                        keepJobScope(
                          tagSearchEnabled ? includedTagsOnly(queueAdvanced) : undefined,
                        ),
                      );
                      if (selection.sort) {
                        onQueueSortChange?.(selection.sort);
                      }
                    }}
                    onOpenAdvanced={() => setAdvancedOpen(true)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
              <ContentEditorAdvancedQueueFilterDialog
                open={advancedOpen}
                onOpenChange={setAdvancedOpen}
                value={queueAdvanced}
                providerKind={providerKind}
                organizationSlug={organizationSlug}
                projectId={projectId}
                onApply={(filter) => {
                  onQueueFilterChange("all");
                  onQueueFilterQualifierChange?.(undefined);
                  onQueueAdvancedChange?.(keepJobScope(filter));
                }}
              />
            </>
          ) : null}

          {isSelecting ? selectAllButton : null}
        </>
      )}

      <div className="flex shrink-0 items-center gap-1.5">
        {canEnterSelectionMode && !showBulkBar ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-8 gap-1.5 font-normal", isSelecting && "border-foreground bg-muted")}
            aria-pressed={isSelecting}
            onClick={() => onSelectionModeChange?.(!isSelecting)}
          >
            <ListChecksIcon className="size-3.5" aria-hidden />
            <span className="text-xs">
              <FormattedMessage {...contentEditorBulkBarMessages.select} />
            </span>
          </Button>
        ) : null}
        <ContentEditorViewMenu
          showPersona={adaptiveWorkspaceEnabled}
          queueSort={queueSort}
          onQueueSortChange={onQueueSortChange}
          availableQueueSorts={availableQueueSorts}
        />
        <ContentEditorOverflowMenu
          filterLabel={intl.formatMessage(filterButtonMessage)}
          onDownloadFilteredView={onDownloadFilteredView}
          isDownloadingFilteredView={isDownloadingFilteredView}
          onImportBilingualFile={onImportBilingualFile}
          isImportingBilingualFile={isImportingBilingualFile}
        />
      </div>
    </div>
  );
}

function ContentEditorBulkBar({
  selectedCount,
  canMutate,
  isBulkActionPending,
  bulkProgress,
  selectAllButton,
  onClearChecked,
  onBulkApprove,
  onBulkSkip,
  onBulkHide,
  onBulkUnhide,
  onBulkLock,
  onBulkUnlock,
  actionLocale,
  onBulkCreateTask,
  onBulkEditTags,
  onDone,
}: {
  selectedCount: number;
  canMutate: boolean;
  isBulkActionPending: boolean;
  bulkProgress?: string;
  selectAllButton: ReactNode;
  onClearChecked?: () => void;
  onBulkApprove?: () => void;
  onBulkSkip?: () => void;
  onBulkHide?: () => void;
  onBulkUnhide?: () => void;
  onBulkLock?: () => void;
  onBulkUnlock?: () => void;
  actionLocale?: string;
  onBulkCreateTask?: () => void;
  onBulkEditTags?: () => void;
  onDone: () => void;
}) {
  const intl = useIntl();
  const language = actionLocale ? formatLocaleDisplayName(intl, actionLocale) : undefined;
  const messages = contentEditorQueuePanelMessages;
  const moreActions = [
    { key: "hide", handler: onBulkHide, message: messages.bulkHide },
    { key: "unhide", handler: onBulkUnhide, message: messages.bulkUnhide },
    {
      key: "lock",
      handler: onBulkLock,
      message: language ? messages.bulkLockInLanguage : messages.bulkLock,
    },
    {
      key: "unlock",
      handler: onBulkUnlock,
      message: language ? messages.bulkUnlockInLanguage : messages.bulkUnlock,
    },
    {
      key: "task",
      handler: onBulkCreateTask,
      message: messages.bulkCreateTask,
    },
    {
      key: "tags",
      handler: onBulkEditTags,
      message: contentEditorQueuePanelMessages.bulkEditTags,
    },
  ].filter((action) => Boolean(action.handler));

  return (
    <div
      role="toolbar"
      aria-label={intl.formatMessage(contentEditorBulkBarMessages.barAria)}
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-0.5"
    >
      <span role="status" className="px-1 text-xs font-medium text-foreground tabular-nums">
        <FormattedMessage
          {...contentEditorBulkBarMessages.selectedCount}
          values={{ count: selectedCount }}
        />
      </span>
      {selectAllButton}
      {onBulkApprove ? (
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          onClick={onBulkApprove}
          disabled={!canMutate}
        >
          <FormattedMessage
            {...(language ? messages.bulkApproveInLanguage : messages.bulkApprove)}
            values={{ language }}
          />
        </Button>
      ) : null}
      {onBulkSkip ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={onBulkSkip}
          disabled={!canMutate}
        >
          <FormattedMessage {...messages.bulkSkip} />
        </Button>
      ) : null}
      {moreActions.length > 0 || onClearChecked ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs font-normal"
                disabled={isBulkActionPending}
              />
            }
          >
            <FormattedMessage {...contentEditorBulkBarMessages.more} />
            <CaretDownIcon className="size-3" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {moreActions.length > 0 ? (
              <DropdownMenuGroup>
                {moreActions.map((action) => (
                  <DropdownMenuItem key={action.key} onClick={action.handler} disabled={!canMutate}>
                    <FormattedMessage {...action.message} values={{ language }} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ) : null}
            {moreActions.length > 0 && onClearChecked ? <DropdownMenuSeparator /> : null}
            {onClearChecked ? (
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onClearChecked} disabled={isBulkActionPending}>
                  <FormattedMessage {...contentEditorQueuePanelMessages.bulkClearSelection} />
                </DropdownMenuItem>
              </DropdownMenuGroup>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {isBulkActionPending ? (
        <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          {bulkProgress ? <span className="tabular-nums">{bulkProgress}</span> : null}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ms-auto h-7 text-xs"
        onClick={onDone}
        disabled={isBulkActionPending}
      >
        <FormattedMessage {...contentEditorBulkBarMessages.done} />
      </Button>
    </div>
  );
}
