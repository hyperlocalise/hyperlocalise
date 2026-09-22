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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
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
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";
import { useContentEditorSegmentTarget } from "@/components/content-editor/project-file/use-content-editor-segment-target";
import { formatInternalMarkupForDisplay } from "@/components/content-editor/message-format/content-editor-internal-markup";
import { multilingualMessages as messages } from "./content-editor-multilingual.messages";

const KEY_WIDTH = 224;
const LANGUAGE_WIDTH = 320;
const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 44;
const ROW_OVERSCAN = 3;

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
  onOpenTranslation?: (segment: ContentEditorSegment, locale: string) => void;
}

const TranslationCell = memo(function TranslationCell({
  config,
  segment,
  locale,
  pending,
  onOpen,
}: {
  config: ContentEditorMultilingualConfig;
  segment: ContentEditorSegment;
  locale: string;
  pending: boolean;
  onOpen: (segment: ContentEditorSegment, locale: string) => void;
}) {
  const intl = useIntl();
  const identity = config.identities?.get(segment.id);
  const query = useContentEditorSegmentTarget({
    organizationSlug: config.organizationSlug,
    projectId: config.projectId,
    sourcePath: identity?.sourcePath || segment.sourcePath || config.sourcePath,
    externalResourceId: identity?.externalResourceId ?? config.externalResourceId,
    resourceType: identity?.resourceType ?? config.resourceType,
    targetLocale: locale,
    externalStringId: segment.id,
    enabled: !pending,
    priority: false,
  });
  if (pending || query.isPending) {
    return <Skeleton className="mx-3 h-4 w-3/4" />;
  }
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
  const text = query.data?.text;
  return (
    <button
      type="button"
      className={cn(
        "flex h-full w-full items-center gap-2 px-3 text-start text-sm hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        !text && "text-muted-foreground",
      )}
      aria-label={intl.formatMessage(messages.open, {
        key: segment.key,
        language: formatLocaleDisplayName(intl, locale),
      })}
      onClick={() => onOpen(segment, locale)}
      title={text || intl.formatMessage(messages.missing)}
    >
      <span dir="auto" className="line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap break-words">
        {text ? formatInternalMarkupForDisplay(text) : intl.formatMessage(messages.missing)}
      </span>
      {query.data?.isApproved ? (
        <span className="shrink-0 text-primary" aria-label={intl.formatMessage(messages.approved)}>
          ✓
        </span>
      ) : null}
    </button>
  );
});

export function ContentEditorMultilingualTable({
  config,
  segments,
  selectedSegmentId,
  isLoading = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onOpenTranslation,
}: {
  config: ContentEditorMultilingualConfig;
  segments: ContentEditorSegment[];
  selectedSegmentId: string;
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onOpenTranslation: (segment: ContentEditorSegment, locale: string) => void;
}) {
  const intl = useIntl();
  const scrollRef = useRef<HTMLDivElement>(null);
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
  const getColumnKey = useCallback(
    (index: number) => (index === 0 ? "source" : columns[index]),
    [columns],
  );
  const rowVirtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: getRowKey,
    overscan: ROW_OVERSCAN,
    paddingStart: HEADER_HEIGHT,
  });
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LANGUAGE_WIDTH,
    getItemKey: getColumnKey,
    paddingStart: KEY_WIDTH,
    overscan: 1,
  });
  const rows = rowVirtualizer.getVirtualItems();
  const virtualColumns = columnVirtualizer.getVirtualItems();
  const lastRow = rows.at(-1)?.index ?? -1;
  const requestedLength = useRef<number | null>(null);
  useEffect(() => {
    if (
      hasMore &&
      !isLoading &&
      !isLoadingMore &&
      lastRow >= segments.length - 4 &&
      requestedLength.current !== segments.length
    ) {
      requestedLength.current = segments.length;
      onLoadMore?.();
    }
  }, [hasMore, isLoading, isLoadingMore, lastRow, segments.length, onLoadMore]);
  const width = columnVirtualizer.getTotalSize();
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
        <p className="truncate text-xs text-muted-foreground">
          {intl.formatMessage(messages.hint)}
        </p>
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
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
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
            className="sticky top-0 z-20 border-b bg-muted"
            style={{ height: HEADER_HEIGHT, width }}
          >
            <div
              role="columnheader"
              aria-colindex={1}
              className="sticky left-0 z-30 flex h-full items-center border-r bg-muted px-3 text-xs font-medium"
              style={{ width: KEY_WIDTH }}
            >
              {intl.formatMessage(messages.key)}
            </div>
            {virtualColumns.map((column) => (
              <div
                role="columnheader"
                aria-colindex={column.index + 2}
                key={column.key}
                className="absolute top-0 flex h-full items-center border-r px-3 text-xs font-medium"
                style={{ left: column.start, width: column.size }}
              >
                <span className="truncate">
                  {column.index === 0
                    ? intl.formatMessage(messages.source, {
                        language: formatLocaleDisplayName(intl, config.sourceLocale),
                      })
                    : formatLocaleDisplayName(intl, columns[column.index])}
                </span>
              </div>
            ))}
          </div>
          {rows.map((row) => {
            const segment = segments[row.index];
            return (
              <div
                role="row"
                aria-rowindex={row.index + 2}
                key={row.key}
                className={cn(
                  "absolute left-0 border-b",
                  segment.id === selectedSegmentId ? "bg-accent/40" : "bg-background",
                )}
                style={{ top: row.start, height: row.size, width }}
              >
                <div
                  role="rowheader"
                  aria-colindex={1}
                  title={segment.key}
                  className="sticky left-0 z-10 flex h-full items-center border-r bg-background px-3 font-mono text-xs"
                  style={{ width: KEY_WIDTH }}
                >
                  <span className="truncate">{segment.key}</span>
                </div>
                {virtualColumns.map((column) => (
                  <div
                    role="cell"
                    aria-colindex={column.index + 2}
                    key={column.key}
                    className="absolute top-0 flex h-full items-center border-r"
                    style={{ left: column.start, width: column.size }}
                  >
                    {column.index === 0 ? (
                      <span
                        dir="auto"
                        title={segment.sourceText}
                        className="line-clamp-2 whitespace-pre-wrap break-words px-3"
                      >
                        {formatInternalMarkupForDisplay(segment.sourceText)}
                      </span>
                    ) : (
                      <TranslationCell
                        config={config}
                        segment={segment}
                        locale={columns[column.index]}
                        pending={isLoading}
                        onOpen={onOpenTranslation}
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
}
