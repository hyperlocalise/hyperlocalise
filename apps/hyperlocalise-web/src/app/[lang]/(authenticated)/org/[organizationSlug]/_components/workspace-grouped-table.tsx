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
import { createElement, useState, type ReactNode } from "react";
import { CaretDownIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { workspaceGroupedTableMessages as messages } from "./workspace-grouped-table.messages";

export type WorkspaceGroupedTableQuery = {
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
  refetch?: () => void;
};

export type WorkspaceGroupedTableColumn = {
  id: string;
  label: ReactNode;
  className?: string;
};

export type WorkspaceGroupedTableAccent = "workspace" | "provider";

export type WorkspaceGroupedTableGroup<T> = {
  id: string;
  title: string;
  count: number;
  items: T[];
  query: WorkspaceGroupedTableQuery;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  headerActions?: ReactNode;
  accent?: WorkspaceGroupedTableAccent;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
};

const GROUP_ACCENT_CLASS: Record<WorkspaceGroupedTableAccent, string> = {
  workspace: "bg-emerald-500",
  provider: "bg-sky-500",
};

export function WorkspaceGroupedTable<T>({
  ariaLabel,
  columns,
  groups,
  getRowId,
  renderCells,
}: {
  ariaLabel: string;
  columns: readonly WorkspaceGroupedTableColumn[];
  groups: readonly WorkspaceGroupedTableGroup<T>[];
  getRowId: (item: T) => string;
  renderCells: (item: T) => ReactNode[];
}) {
  const intl = useIntl();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const columnCount = columns.length;

  return (
    <div className="space-y-3">
      {groups.map((group, groupIndex) => {
        const isCollapsed = collapsed[group.id] ?? false;
        const tableLabel = groupIndex === 0 ? ariaLabel : group.title;
        const hasItems = group.items.length > 0;
        const showRows = hasItems && (group.query.isSuccess || group.query.isError);
        const showEmpty = group.query.isSuccess && !hasItems;
        const showLoadMore =
          group.query.isSuccess &&
          !group.query.isLoading &&
          group.hasMore &&
          Boolean(group.onLoadMore);

        return (
          <section
            key={group.id}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted/40"
                aria-expanded={!isCollapsed}
                aria-label={intl.formatMessage(
                  isCollapsed ? messages.expandGroupAria : messages.collapseGroupAria,
                  { group: group.title },
                )}
                onClick={() =>
                  setCollapsed((current) => ({
                    ...current,
                    [group.id]: !isCollapsed,
                  }))
                }
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    group.accent ? GROUP_ACCENT_CLASS[group.accent] : "bg-muted-foreground",
                  )}
                />
                <span className="truncate">{group.title}</span>
                <span className="font-normal tabular-nums text-muted-foreground">
                  {group.count}
                </span>
                {createElement(isCollapsed ? ArrowRightIcon : CaretDownIcon, {
                  className: "ms-auto size-3.5 shrink-0 text-muted-foreground",
                })}
              </button>
              {group.headerActions ? (
                <div className="min-w-0 px-3 pb-2.5 sm:max-w-sm sm:px-0 sm:pb-0 sm:pe-3">
                  {group.headerActions}
                </div>
              ) : null}
            </div>

            {isCollapsed ? null : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] table-fixed" aria-label={tableLabel}>
                  <thead>
                    <tr className="border-t border-border/70 text-xs font-medium text-muted-foreground">
                      {columns.map((column) => (
                        <th
                          key={column.id}
                          scope="col"
                          className={cn("px-3 py-2 text-left font-medium", column.className)}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.query.isLoading
                      ? Array.from({ length: 3 }).map((_, index) => (
                          <tr key={`${group.id}-skeleton-${index}`}>
                            {columns.map((column) => (
                              <td key={column.id} className={cn("px-3 py-2.5", column.className)}>
                                <Skeleton className="h-4 w-24 max-w-full" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : null}
                    {group.query.isError && !hasItems ? (
                      <tr>
                        <td colSpan={columnCount} className="px-4 py-6">
                          <GroupedTableError
                            error={group.query.error}
                            onRetry={group.query.refetch}
                          />
                        </td>
                      </tr>
                    ) : null}
                    {showEmpty ? (
                      <tr>
                        <td colSpan={columnCount} className="px-4 py-6">
                          <TypographyP size="small" weight="medium" tone="content">
                            {group.emptyTitle}
                          </TypographyP>
                          {group.emptyDescription ? (
                            <TypographyP
                              className="mt-1 max-w-lg text-pretty"
                              size="small"
                              tone="subtle"
                            >
                              {group.emptyDescription}
                            </TypographyP>
                          ) : null}
                          {group.emptyAction ? (
                            <div className="mt-3">{group.emptyAction}</div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                    {showRows
                      ? group.items.map((item) => (
                          <tr
                            key={getRowId(item)}
                            className="border-t border-border/50 hover:bg-muted/30"
                          >
                            {renderCells(item).map((cell, index) => (
                              <td
                                key={`${getRowId(item)}-${columns[index]?.id ?? index}`}
                                className={cn(
                                  "px-3 py-2.5 text-sm text-muted-foreground",
                                  index === 0 && "font-medium text-foreground",
                                  columns[index]?.className,
                                )}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))
                      : null}
                    {group.query.isError && hasItems ? (
                      <tr className="border-t border-border/50">
                        <td colSpan={columnCount} className="px-4 py-4">
                          <GroupedTableError
                            error={group.query.error}
                            onRetry={group.query.refetch}
                          />
                        </td>
                      </tr>
                    ) : null}
                    {showLoadMore ? (
                      <tr className="border-t border-border/50">
                        <td colSpan={columnCount} className="px-3 py-2.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-full"
                            onClick={group.onLoadMore}
                            disabled={group.isLoadingMore}
                          >
                            <FormattedMessage
                              {...(group.isLoadingMore ? messages.loadingMore : messages.loadMore)}
                            />
                          </Button>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function GroupedTableError({ error, onRetry }: { error: Error | null; onRetry?: () => void }) {
  const intl = useIntl();

  return (
    <>
      <TypographyP className="text-destructive" size="small" weight="medium">
        {intl.formatMessage(messages.loadFailed)}
      </TypographyP>
      <TypographyP className="mt-1" size="xsmall" tone="subtle">
        {error instanceof Error ? error.message : intl.formatMessage(messages.loadFailedFallback)}
      </TypographyP>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <FormattedMessage {...messages.retry} />
        </Button>
      ) : null}
    </>
  );
}
