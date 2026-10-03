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
import { useState, type ReactNode } from "react";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
  const firstExpandedGroupId = groups.find((group) => !(collapsed[group.id] ?? false))?.id;

  return (
    <div className="space-y-3">
      {groups.map((group, groupIndex) => {
        const isCollapsed = collapsed[group.id] ?? false;
        const showColumnHeaders = group.id === firstExpandedGroupId;
        const tableLabel = groupIndex === 0 ? ariaLabel : group.title;

        return (
          <section
            key={group.id}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="flex items-center gap-2">
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
                <HugeiconsIcon
                  icon={isCollapsed ? ArrowRight01Icon : ArrowDown01Icon}
                  strokeWidth={2}
                  className="ms-auto size-3.5 shrink-0 text-muted-foreground"
                />
              </button>
              {group.headerActions ? (
                <div className="min-w-0 shrink-0 pe-3">{group.headerActions}</div>
              ) : null}
            </div>

            {isCollapsed ? null : (
              <table className="w-full min-w-[48rem] table-fixed" aria-label={tableLabel}>
                {showColumnHeaders ? (
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
                ) : (
                  <colgroup>
                    {columns.map((column) => (
                      <col key={column.id} className={column.className} />
                    ))}
                  </colgroup>
                )}
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
                  {group.query.isError ? (
                    <tr>
                      <td colSpan={columnCount} className="px-4 py-6">
                        <TypographyP className="text-destructive" size="small" weight="medium">
                          {intl.formatMessage(messages.loadFailed)}
                        </TypographyP>
                        <TypographyP className="mt-1" size="xsmall" tone="subtle">
                          {group.query.error instanceof Error
                            ? group.query.error.message
                            : intl.formatMessage(messages.loadFailedFallback)}
                        </TypographyP>
                        {group.query.refetch ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={group.query.refetch}
                          >
                            <FormattedMessage {...messages.retry} />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                  {group.query.isSuccess && group.items.length === 0 ? (
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
                        {group.emptyAction ? <div className="mt-3">{group.emptyAction}</div> : null}
                      </td>
                    </tr>
                  ) : null}
                  {group.query.isSuccess
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
                  {group.query.isSuccess && group.hasMore && group.onLoadMore ? (
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
            )}
          </section>
        );
      })}
    </div>
  );
}
