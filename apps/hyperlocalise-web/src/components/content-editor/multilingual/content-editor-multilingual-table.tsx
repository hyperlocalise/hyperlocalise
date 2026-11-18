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
import type { ImageEditRequest } from "@/lib/projects/files/image-edit";
import { useNearEndPagination } from "../project-file/content-editor-near-end-pagination";
import { useEditorPageWindow } from "../project-file/content-editor-page-window";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { reaction } from "mobx";
import { observer } from "mobx-react-lite";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useIntl, type IntlShape } from "react-intl";
import { ListIcon, QuestionIcon, RowsIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/primitives/cn";
import { formatLocaleDisplayName } from "@/lib/i18n/locale-display-names.messages";
import { getLocaleFlagEmoji } from "@/lib/i18n/locales";
import type {
  ContentEditorFormatCheck,
  ContentEditorSegment,
} from "@/components/content-editor/shared/types";
import { useContentEditorSegmentTarget } from "@/components/content-editor/project-file/use-content-editor-segment-target";
import { formatInternalMarkupForDisplay } from "@/components/content-editor/message-format/content-editor-internal-markup";
import {
  ContentEditorSegmentCheckbox,
  type ContentEditorSegmentCheckHandler,
} from "@/components/content-editor/segment/content-editor-segment-checkbox";
import { multilingualMessages as messages } from "./content-editor-multilingual.messages";

import { ContentEditorTargetEditor } from "../editor/content-editor-target-editor";
import { MultilingualDrafts } from "./content-editor-multilingual-drafts";
import { ContentEditorGroupVariantsCell } from "../groups/content-editor-group-variants";
import { useHasGroupTranslationVariants } from "../groups/use-content-editor-group-variants";
import { ContentEditorOccurrenceBadge } from "../groups/content-editor-occurrence-badge";

const KEY_WIDTH = 224;
const LANGUAGE_WIDTH = 320;
const HEADER_HEIGHT = 44;
const ROW_OVERSCAN = 3;
// A source longer than this likely wraps once translated, so its row gets two lines.
const TALL_SOURCE_LENGTH = 26;
const ROW_HEIGHTS = {
  comfortable: { short: 48, tall: 68 },
  compact: { short: 36, tall: 52 },
} as const;
const TWO_LINE_MIN_HEIGHT = 48;
const KEY_COLUMN_SHADOW_CLASS_NAME = "shadow-[6px_0_8px_-6px_rgb(0_0_0/0.15)]";
const DENSITY_STORAGE_KEY = "hl:content-editor:multilingual-density";

type RowDensity = keyof typeof ROW_HEIGHTS;
type CellHighlight = "all" | "missing" | "needs_review" | "variants";
type CellStatus =
  | "approved"
  | "needs_review"
  | "draft"
  | "rejected"
  | "unsaved"
  | "error"
  | "missing";

const CELL_HIGHLIGHTS = [
  { value: "all", message: messages.highlightAll },
  { value: "missing", message: messages.highlightMissing },
  { value: "needs_review", message: messages.highlightNeedsReview },
  { value: "variants", message: messages.highlightVariants },
] as const satisfies readonly { value: CellHighlight; message: unknown }[];

const STATUS_BAR_CLASS_NAME: Record<CellStatus, string | null> = {
  approved: "bg-grove-700 dark:bg-grove-300",
  needs_review: "bg-beam-700 dark:bg-warning",
  draft: "bg-muted-foreground/40",
  rejected: "bg-flame-700",
  unsaved: "bg-bud-400",
  error: "bg-destructive",
  missing: null,
};

const LEGEND_STATUSES = [
  { status: "approved", message: messages.approved },
  { status: "needs_review", message: messages.statusNeedsReview },
  { status: "draft", message: messages.statusDraft },
  { status: "rejected", message: messages.statusRejected },
  { status: "unsaved", message: messages.statusUnsaved },
] as const satisfies readonly { status: CellStatus; message: unknown }[];

function cellStatus(input: {
  text?: string;
  status?: "draft" | "needs_review" | "approved" | "rejected";
  isApproved?: boolean;
  dirty?: boolean;
  error?: string | null;
}): CellStatus {
  if (input.error) return "error";
  if (input.dirty) return "unsaved";
  if (!input.text) return "missing";
  if (input.isApproved || input.status === "approved") return "approved";
  if (input.status === "rejected") return "rejected";
  if (input.status === "draft") return "draft";
  return "needs_review";
}

function cellStatusLabel(intl: IntlShape, status: CellStatus) {
  switch (status) {
    case "approved":
      return intl.formatMessage(messages.approved);
    case "needs_review":
      return intl.formatMessage(messages.statusNeedsReview);
    case "draft":
      return intl.formatMessage(messages.statusDraft);
    case "rejected":
      return intl.formatMessage(messages.statusRejected);
    case "unsaved":
      return intl.formatMessage(messages.statusUnsaved);
    case "error":
      return intl.formatMessage(messages.failed);
    case "missing":
      return intl.formatMessage(messages.missing);
  }
}

function matchesHighlight(highlight: CellHighlight, status: CellStatus, divergent: boolean) {
  switch (highlight) {
    case "all":
      return true;
    case "missing":
      return status === "missing";
    case "needs_review":
      return status === "needs_review" || status === "rejected";
    case "variants":
      return divergent;
  }
}

function rowHeight(sourceText: string, density: RowDensity) {
  const tall = sourceText.length > TALL_SOURCE_LENGTH || sourceText.includes("\n");
  return ROW_HEIGHTS[density][tall ? "tall" : "short"];
}

function readStoredDensity(): RowDensity | null {
  try {
    const value = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return value === "compact" || value === "comfortable" ? value : null;
  } catch {
    return null;
  }
}

function storeDensity(density: RowDensity) {
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // Density is a per-viewer convenience; losing it is fine.
  }
}

export interface ContentEditorMultilingualConfig {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  sourceLocale: string;
  targetLocales: readonly string[];
  externalResourceId?: string | null;
  resourceType?: "file" | "key";
  identities?: ReadonlyMap<
    string,
    {
      sourcePath?: string | null;
      externalResourceId?: string | null;
      resourceType?: "file" | "key" | null;
    }
  >;
  canEdit?: boolean;
  /** Project-wide progress per target locale (0–100), shown in the column headers. */
  localeProgress?: ReadonlyMap<string, { translated: number; approved: number }>;
  onSaveTranslation?: (
    segment: ContentEditorSegment,
    locale: string,
    text: string,
    formatChecks?: readonly ContentEditorFormatCheck[],
  ) => Promise<void>;
  onOpenTranslation?: (segment: ContentEditorSegment, locale: string) => void;
  /** Generates the localised image for one locale; used by the multilingual image gallery. */
  onRegenerateImage?: (
    segment: ContentEditorSegment,
    locale: string,
    options?: { force?: boolean; signal?: AbortSignal },
  ) => Promise<void>;
  /** Runs a targeted AI edit on one locale's image; used by the multilingual image gallery. */
  onEditImage?: (
    segment: ContentEditorSegment,
    locale: string,
    input: {
      request: ImageEditRequest;
      image: Blob;
      mask: Blob | null;
      references: Blob[];
      force?: boolean;
      signal?: AbortSignal;
    },
  ) => Promise<void>;
}

function GroupedTranslationCell(props: Parameters<typeof TranslationCell>[0]) {
  const divergent = useHasGroupTranslationVariants(props.segment, props.locale);
  if (!divergent) return <TranslationCell {...props} />;
  const dimmed = !props.active && props.highlight !== "all" && props.highlight !== "variants";
  return (
    <div
      className={cn(
        "flex h-full w-full items-center px-2 transition-opacity",
        dimmed && "opacity-35",
      )}
    >
      <ContentEditorGroupVariantsCell
        segment={props.segment}
        locale={props.locale}
        active={props.active}
        onActivate={props.onActivate}
        onClose={() => props.onFinish()}
      />
    </div>
  );
}

const TranslationCell = observer(function TranslationCell({
  config,
  segment,
  locale,
  pending,
  drafts,
  active,
  lines,
  highlight,
  onActivate,
  onFinish,
  onOpenTranslation,
}: {
  config: ContentEditorMultilingualConfig;
  segment: ContentEditorSegment;
  locale: string;
  pending: boolean;
  drafts: MultilingualDrafts;
  active: boolean;
  /** How many lines of text the row has room for. */
  lines: 1 | 2;
  highlight: CellHighlight;
  onActivate: () => void;
  onFinish: (direction?: "down" | "next" | "previous") => void;
  onOpenTranslation?: (segment: ContentEditorSegment, locale: string) => void;
}) {
  const intl = useIntl();
  const identity = config.identities?.get(segment.id);
  const sourcePath = identity?.sourcePath || segment.sourcePath || config.sourcePath;
  const cellKey = JSON.stringify([config.projectId, sourcePath, segment.id, locale]);
  const query = useContentEditorSegmentTarget({
    organizationSlug: config.organizationSlug,
    projectId: config.projectId,
    sourcePath,
    externalResourceId: identity?.externalResourceId ?? config.externalResourceId,
    resourceType: identity?.resourceType ?? config.resourceType,
    targetLocale: locale,
    externalStringId: segment.id,
    enabled: !pending,
    priority: active,
  });
  const draft = drafts.cells.get(cellKey);
  useEffect(() => {
    if (!active && draft && !draft.dirty && !draft.error) drafts.release(cellKey);
  }, [active, draft?.dirty, draft?.error, drafts]);
  const editable =
    config.canEdit !== false && Boolean(config.onSaveTranslation) && !segment.isLocked;
  const openTranslation = config.onOpenTranslation ?? onOpenTranslation;
  const label = intl.formatMessage(messages.open, {
    key: segment.key,
    language: formatLocaleDisplayName(intl, locale),
  });
  useEffect(() => {
    if (active && editable && !pending && query.data !== undefined) {
      drafts.get(cellKey, query.data?.text ?? "");
    }
  }, [active, editable, pending, query.data, drafts, cellKey]);
  const save = () => {
    if (draft && editable && config.onSaveTranslation) {
      void draft.save((text) => config.onSaveTranslation!(segment, locale, text));
    }
  };
  const cancelled = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active && cancelled.current) {
      buttonRef.current?.focus();
      cancelled.current = false;
    }
  }, [active]);
  if (pending || query.isPending) return <Skeleton className="mx-4 h-4 w-3/4" />;
  if (query.isError && query.data === undefined) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="mx-2"
        title={intl.formatMessage(messages.failed)}
        onClick={() => void query.refetch()}
      >
        {intl.formatMessage(messages.retry)}
      </Button>
    );
  }
  const text = draft?.dirty || draft?.error ? draft.text : query.data?.text;
  if (active && draft && editable) {
    return (
      <div
        className="absolute inset-x-1 top-1 z-40 min-h-[calc(100%-0.5rem)] rounded-md bg-background shadow-lg ring-2 ring-ring"
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          if (!cancelled.current) save();
          cancelled.current = false;
        }}
        onKeyDownCapture={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelled.current = true;
            draft.cancel();
            onFinish();
          } else if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
            event.preventDefault();
            event.stopPropagation();
            save();
            onFinish(event.key === "Enter" ? "down" : event.shiftKey ? "previous" : "next");
          }
        }}
      >
        <ContentEditorTargetEditor
          sourceText={segment.sourceText}
          sourcePath={segment.sourcePath}
          value={draft.text}
          maxLength={segment.maxLength}
          messageFormat={segment.messageFormat}
          placeholderPatterns={segment.placeholderPatterns}
          onChange={(text) => draft.change(text)}
          compact
          inline
          autoFocus
          ariaLabel={label}
        />
        {draft.error ? (
          <p role="alert" className="px-3 py-1 text-xs text-destructive">
            {draft.error}
          </p>
        ) : null}
        {draft.saving ? (
          <p role="status" className="px-3 text-xs text-muted-foreground">
            {intl.formatMessage(messages.saving)}
          </p>
        ) : null}
      </div>
    );
  }
  const status = cellStatus({
    text,
    status: query.data?.status,
    isApproved: query.data?.isApproved,
    dirty: draft?.dirty,
    error: draft?.error,
  });
  const statusBarClassName = STATUS_BAR_CLASS_NAME[status];
  const dimmed = !matchesHighlight(highlight, status, false);
  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={!editable && !openTranslation}
      data-status={status}
      className={cn(
        "relative flex h-full w-full items-center gap-2 ps-4 pe-3 text-start text-sm transition-[opacity,background-color] hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        !text && "text-muted-foreground",
        dimmed && "opacity-35",
      )}
      aria-label={label}
      aria-description={cellStatusLabel(intl, status)}
      onClick={() => {
        if (!editable) {
          openTranslation?.(segment, locale);
          return;
        }
        cancelled.current = false;
        drafts.get(cellKey, query.data?.text ?? "");
        onActivate();
      }}
      title={draft?.error ?? text ?? intl.formatMessage(messages.missing)}
    >
      {statusBarClassName ? (
        <span
          aria-hidden
          className={cn("absolute inset-y-2.5 start-1.5 w-[3px] rounded-full", statusBarClassName)}
        />
      ) : null}
      {text ? (
        <span
          dir="auto"
          className={cn(
            "min-w-0 flex-1 whitespace-pre-wrap break-words",
            lines === 2 ? "line-clamp-2" : "line-clamp-1",
          )}
        >
          {formatInternalMarkupForDisplay(text)}
        </span>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="inline-flex items-center rounded-md border border-dashed border-border px-1.5 py-0.5 text-xs">
            {intl.formatMessage(messages.missing)}
          </span>
        </span>
      )}
      {draft?.saving ? <span role="status">{intl.formatMessage(messages.saving)}</span> : null}
      {draft?.error ? (
        <span role="alert" className="text-destructive">
          {intl.formatMessage(messages.retry)}
        </span>
      ) : null}
    </button>
  );
});

function LocaleColumnHeader({
  locale,
  isSource,
  progress,
}: {
  locale: string;
  isSource: boolean;
  progress?: { translated: number; approved: number };
}) {
  const intl = useIntl();
  const flag = getLocaleFlagEmoji(locale);
  const language = formatLocaleDisplayName(intl, locale);
  const progressLabel = progress
    ? intl.formatMessage(messages.localeProgress, {
        translated: intl.formatNumber(progress.translated / 100, { style: "percent" }),
        approved: intl.formatNumber(progress.approved / 100, { style: "percent" }),
      })
    : null;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" title={language}>
      {flag ? <span aria-hidden>{flag}</span> : null}
      <span aria-hidden className="truncate font-mono text-xs font-medium text-foreground">
        {locale}
      </span>
      <span className="sr-only">
        {isSource ? intl.formatMessage(messages.source, { language }) : language}
      </span>
      {isSource ? (
        <span
          aria-hidden
          className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
        >
          {intl.formatMessage(messages.sourceTag)}
        </span>
      ) : null}
      {progress && progressLabel ? (
        <div className="ms-auto flex shrink-0 items-center gap-1.5" title={progressLabel}>
          <div
            role="meter"
            aria-label={progressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.translated)}
            className="relative h-1 w-12 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="absolute inset-y-0 start-0 rounded-full bg-grove-300"
              style={{ width: `${Math.min(100, progress.translated)}%` }}
            />
            <div
              className="absolute inset-y-0 start-0 rounded-full bg-grove-700"
              style={{ width: `${Math.min(100, progress.approved)}%` }}
            />
          </div>
          <span aria-hidden className="text-[11px] font-normal text-muted-foreground tabular-nums">
            {intl.formatNumber(progress.translated / 100, {
              style: "percent",
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
      ) : null}
    </div>
  );
}

const SHORTCUTS = [
  { message: messages.shortcutEdit, keys: null },
  { message: messages.shortcutDown, keys: ["Enter"] },
  { message: messages.shortcutAcross, keys: ["Tab"] },
  { message: messages.shortcutNewLine, keys: ["Shift", "Enter"] },
  { message: messages.shortcutCancel, keys: ["Esc"] },
] as const;

function MultilingualHelpPopover() {
  const intl = useIntl();
  const label = intl.formatMessage(messages.shortcuts);
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={label} title={label} />}
      >
        <QuestionIcon className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          {intl.formatMessage(messages.shortcutsTitle)}
        </p>
        <dl className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.message.id} className="contents">
              <dt>{intl.formatMessage(shortcut.message)}</dt>
              <dd className="justify-self-end">
                <KbdGroup>
                  {shortcut.keys ? (
                    shortcut.keys.map((key) => <Kbd key={key}>{key}</Kbd>)
                  ) : (
                    <Kbd>{intl.formatMessage(messages.shortcutEditKey)}</Kbd>
                  )}
                </KbdGroup>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs font-medium text-muted-foreground">
          {intl.formatMessage(messages.legendTitle)}
        </p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {LEGEND_STATUSES.map((item) => (
            <li key={item.status} className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn("h-3.5 w-[3px] rounded-full", STATUS_BAR_CLASS_NAME[item.status])}
              />
              {intl.formatMessage(item.message)}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export const ContentEditorMultilingualTable = observer(function ContentEditorMultilingualTable({
  config,
  segments,
  selectedSegmentId,
  isLoading = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  drafts: providedDrafts,
  onOpenTranslation,
  checkedSegmentIds,
  showSelection = false,
  onToggleSegmentChecked,
}: {
  config: ContentEditorMultilingualConfig;
  segments: ContentEditorSegment[];
  selectedSegmentId: string;
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  drafts?: MultilingualDrafts;
  onOpenTranslation?: (segment: ContentEditorSegment, locale: string) => void;
  /** Ticks whole strings (every language) for the toolbar's bulk actions in Select mode. */
  checkedSegmentIds?: ReadonlySet<string>;
  showSelection?: boolean;
  onToggleSegmentChecked?: ContentEditorSegmentCheckHandler;
}) {
  const intl = useIntl();
  const keyIdPrefix = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [localDrafts] = useState(() => new MultilingualDrafts());
  const drafts = providedDrafts ?? localDrafts;
  const [activeCell, setActiveCell] = useState<{ id: string; locale: string } | null>(null);
  useEffect(
    () =>
      reaction(
        () => [...drafts.cells.values()].map((cell) => [cell.dirty, cell.error]),
        () => drafts.releaseInactive(activeCell?.id, activeCell?.locale),
        { fireImmediately: true },
      ),
    [drafts, activeCell?.id, activeCell?.locale],
  );
  const activeRow = segments.findIndex((segment) => segment.id === activeCell?.id);
  const [hiddenLocales, setHiddenLocales] = useState<ReadonlySet<string>>(() => new Set());
  const locales = useMemo(() => [...new Set(config.targetLocales)], [config.targetLocales]);
  const visibleLocales = useMemo(
    () => locales.filter((locale) => !hiddenLocales.has(locale)),
    [locales, hiddenLocales],
  );
  // Column zero is always the source; target columns are independently virtualized.
  const columns = useMemo(
    () => [config.sourceLocale, ...visibleLocales],
    [config.sourceLocale, visibleLocales],
  );
  // The virtualizer invalidates measurements when these callbacks change.
  const getRowKey = useCallback((index: number) => segments[index].id, [segments]);
  const [density, setDensity] = useState<RowDensity>("comfortable");
  useEffect(() => {
    const stored = readStoredDensity();
    if (stored) setDensity(stored);
  }, []);
  const changeDensity = (next: RowDensity) => {
    setDensity(next);
    storeDensity(next);
  };
  const [highlight, setHighlight] = useState<CellHighlight>("all");
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const [isScrolledX, setIsScrolledX] = useState(false);
  const estimateRowSize = useCallback(
    (index: number) => rowHeight(segments[index].sourceText, density),
    [segments, density],
  );
  const getColumnKey = useCallback(
    (index: number) => (index === 0 ? "source" : columns[index]),
    [columns],
  );
  const rowVirtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimateRowSize,
    getItemKey: getRowKey,
    overscan: ROW_OVERSCAN,
    rangeExtractor: (range) =>
      [...new Set([...defaultRangeExtractor(range), ...(activeRow >= 0 ? [activeRow] : [])])].sort(
        (a, b) => a - b,
      ),
    paddingStart: HEADER_HEIGHT,
  });
  useEditorPageWindow(segments, scrollRef, rowVirtualizer);
  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, estimateRowSize]);
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LANGUAGE_WIDTH,
    getItemKey: getColumnKey,
    paddingStart: KEY_WIDTH,
    overscan: 1,
    rangeExtractor: (range) => {
      const activeColumn = activeCell ? columns.indexOf(activeCell.locale, 1) : -1;
      return [
        ...new Set([...defaultRangeExtractor(range), ...(activeColumn >= 0 ? [activeColumn] : [])]),
      ].sort((a, b) => a - b);
    },
  });
  const finishEditing = (row: number, locale: string, direction?: "down" | "next" | "previous") => {
    if (!direction) {
      setActiveCell(null);
      return;
    }
    let nextRow = row;
    let nextColumn = visibleLocales.indexOf(locale);
    if (direction === "down") nextRow++;
    else nextColumn += direction === "next" ? 1 : -1;
    if (nextColumn >= visibleLocales.length) {
      nextColumn = 0;
      nextRow++;
    }
    if (nextColumn < 0) {
      nextColumn = visibleLocales.length - 1;
      nextRow--;
    }
    if (!segments[nextRow]) {
      setActiveCell(null);
      return;
    }
    rowVirtualizer.scrollToIndex(nextRow, { align: "auto" });
    columnVirtualizer.scrollToIndex(nextColumn + 1, { align: "auto" });
    setActiveCell({ id: segments[nextRow].id, locale: visibleLocales[nextColumn] });
  };
  const rows = rowVirtualizer.getVirtualItems();
  const virtualColumns = columnVirtualizer.getVirtualItems();
  const lastRow = rows.at(-1)?.index ?? -1;
  const checkForNearEnd = useNearEndPagination({
    hasMore,
    isLoadingMore: isLoading || isLoadingMore,
    itemCount: segments.length,
    prefetchDistance: 12,
    onNearEnd: onLoadMore,
  });
  useEffect(() => {
    checkForNearEnd(lastRow < 0 ? [] : [{ index: lastRow }]);
  }, [checkForNearEnd, lastRow]);
  const width = columnVirtualizer.getTotalSize();
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <ButtonGroup aria-label={intl.formatMessage(messages.highlight)}>
          {CELL_HIGHLIGHTS.map((option) => (
            <Button
              key={option.value}
              variant={highlight === option.value ? "secondary" : "outline"}
              size="sm"
              aria-pressed={highlight === option.value}
              onClick={() => setHighlight(option.value)}
            >
              {intl.formatMessage(option.message)}
            </Button>
          ))}
        </ButtonGroup>
        <div className="ms-auto flex items-center gap-1.5">
          <ButtonGroup aria-label={intl.formatMessage(messages.density)}>
            {(
              [
                { value: "comfortable", Icon: RowsIcon, message: messages.densityComfortable },
                { value: "compact", Icon: ListIcon, message: messages.densityCompact },
              ] as const
            ).map(({ value, Icon, message }) => (
              <Button
                key={value}
                variant={density === value ? "secondary" : "outline"}
                size="icon-sm"
                aria-pressed={density === value}
                aria-label={intl.formatMessage(message)}
                title={intl.formatMessage(message)}
                onClick={() => changeDensity(value)}
              >
                <Icon className="size-4" aria-hidden />
              </Button>
            ))}
          </ButtonGroup>
          <MultilingualHelpPopover />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              {intl.formatMessage(messages.languages)}{" "}
              <span className="tabular-nums">{visibleLocales.length}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {locales.map((locale) => (
                  <DropdownMenuCheckboxItem
                    key={locale}
                    checked={!hiddenLocales.has(locale)}
                    onCheckedChange={(checked) => {
                      setHiddenLocales((previous) => {
                        const next = new Set(previous);
                        if (checked) next.delete(locale);
                        else next.add(locale);
                        return next;
                      });
                    }}
                  >
                    {formatLocaleDisplayName(intl, locale)}{" "}
                    <span className="text-muted-foreground">{locale}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto [overflow-anchor:none]"
        onScroll={(event) => {
          const scrolled = event.currentTarget.scrollLeft > 0;
          if (scrolled !== isScrolledX) setIsScrolledX(scrolled);
        }}
        onMouseLeave={() => setHoveredColumn(null)}
        tabIndex={0}
        role="region"
        aria-label={intl.formatMessage(messages.title)}
      >
        <div
          role="table"
          aria-label={intl.formatMessage(messages.title)}
          aria-rowcount={hasMore ? -1 : segments.length + 1}
          aria-colcount={columns.length + 1}
          aria-busy={isLoading}
          className="relative min-w-full text-sm"
          style={{ width, height: Math.max(HEADER_HEIGHT, rowVirtualizer.getTotalSize()) }}
        >
          <div
            role="row"
            aria-rowindex={1}
            className="sticky top-0 z-20 border-b bg-background"
            style={{ height: HEADER_HEIGHT, width }}
          >
            <div
              role="columnheader"
              aria-colindex={1}
              className={cn(
                "sticky left-0 z-30 flex h-full items-center border-r bg-background px-3 text-xs font-medium text-muted-foreground transition-shadow",
                isScrolledX && KEY_COLUMN_SHADOW_CLASS_NAME,
              )}
              style={{ width: KEY_WIDTH }}
            >
              {intl.formatMessage(messages.key)}
            </div>
            {virtualColumns.map((column) => (
              <div
                role="columnheader"
                aria-colindex={column.index + 2}
                key={column.key}
                className={cn(
                  "absolute top-0 flex h-full items-center px-4 transition-colors",
                  column.index === 0 && "border-r",
                  hoveredColumn === column.key && "bg-muted/40",
                )}
                style={{ left: column.start, width: column.size }}
                onMouseEnter={() => setHoveredColumn(String(column.key))}
              >
                <LocaleColumnHeader
                  locale={columns[column.index]}
                  isSource={column.index === 0}
                  progress={
                    column.index === 0
                      ? undefined
                      : config.localeProgress?.get(columns[column.index])
                  }
                />
              </div>
            ))}
          </div>
          {rows.map((row) => {
            const segment = segments[row.index];
            const isSelected = segment.id === selectedSegmentId;
            const lines = row.size >= TWO_LINE_MIN_HEIGHT ? 2 : 1;
            return (
              <div
                role="row"
                aria-rowindex={row.index + 2}
                key={row.key}
                className={cn(
                  "group/row absolute left-0 border-b border-border/50 transition-colors",
                  isSelected ? "bg-accent/40" : "hover:bg-muted/30",
                )}
                style={{ top: row.start, height: row.size, width }}
              >
                <div
                  role="rowheader"
                  aria-colindex={1}
                  // In Select mode, named by the key alone, not the tick box's "Select …" label.
                  aria-labelledby={showSelection ? `${keyIdPrefix}-${row.index}` : undefined}
                  title={segment.key}
                  className={cn(
                    "sticky left-0 z-10 isolate flex h-full items-center gap-1.5 border-r bg-background px-3 font-mono text-xs transition-shadow",
                    isScrolledX && KEY_COLUMN_SHADOW_CLASS_NAME,
                  )}
                  style={{ width: KEY_WIDTH }}
                >
                  {/* Repeats the row tint, which the sticky cell's opaque background hides. */}
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-0 -z-10 transition-opacity",
                      isSelected
                        ? "bg-accent/40"
                        : "bg-muted/30 opacity-0 group-hover/row:opacity-100",
                    )}
                  />
                  {showSelection && onToggleSegmentChecked ? (
                    <ContentEditorSegmentCheckbox
                      segmentId={segment.id}
                      segmentKey={segment.key}
                      checkedSegmentIds={checkedSegmentIds}
                      onCheckedChange={(checked, extendRange) =>
                        onToggleSegmentChecked(segment.id, checked, extendRange)
                      }
                    />
                  ) : null}
                  <span id={`${keyIdPrefix}-${row.index}`} className="truncate">
                    {segment.key}
                  </span>
                  {(segment.occurrenceCount ?? 0) > 1 ? (
                    <ContentEditorOccurrenceBadge
                      count={segment.occurrenceCount!}
                      divergent={Boolean(segment.divergentLocales?.length)}
                      className="shrink-0"
                    />
                  ) : null}
                </div>
                {virtualColumns.map((column) => (
                  <div
                    role="cell"
                    aria-colindex={column.index + 2}
                    key={column.key}
                    className={cn(
                      "absolute top-0 flex h-full items-center transition-colors",
                      column.index === 0 && "border-r",
                      hoveredColumn === column.key && "bg-muted/30",
                    )}
                    style={{ left: column.start, width: column.size }}
                    onMouseEnter={() => setHoveredColumn(String(column.key))}
                  >
                    {column.index === 0 ? (
                      <span
                        dir="auto"
                        title={segment.sourceText}
                        className={cn(
                          "whitespace-pre-wrap break-words px-4",
                          lines === 2 ? "line-clamp-2" : "line-clamp-1",
                        )}
                      >
                        {formatInternalMarkupForDisplay(segment.sourceText)}
                      </span>
                    ) : (
                      <GroupedTranslationCell
                        config={config}
                        segment={segment}
                        locale={columns[column.index]}
                        pending={isLoading}
                        drafts={drafts}
                        active={
                          activeCell?.id === segment.id &&
                          activeCell.locale === columns[column.index]
                        }
                        lines={lines}
                        highlight={highlight}
                        onActivate={() =>
                          setActiveCell({ id: segment.id, locale: columns[column.index] })
                        }
                        onFinish={(direction) =>
                          finishEditing(row.index, columns[column.index], direction)
                        }
                        onOpenTranslation={onOpenTranslation}
                      />
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {segments.length === 0 ? (
          <p role="status" className="p-6 text-sm text-muted-foreground">
            {intl.formatMessage(isLoading ? messages.loading : messages.empty)}
          </p>
        ) : null}
      </div>
      <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-t px-3 py-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {intl.formatMessage(messages.count, { count: segments.length })}
        </span>
        {hasMore ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={isLoadingMore || isLoading}
            onClick={onLoadMore}
          >
            {intl.formatMessage(isLoadingMore ? messages.loading : messages.more)}
          </Button>
        ) : null}
      </div>
    </section>
  );
});
