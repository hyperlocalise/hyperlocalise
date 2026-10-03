"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/primitives/cn";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type {
  CatStringGroup,
  CatStringGroupsQuery,
  CatGroupPagination,
} from "@/lib/go-svc/go-svc-cat-groups.types";
import { groupMessages as m } from "./content-editor-groups.messages";

const PAGE_LIMIT = 25;
const FILTERS = [
  "all",
  "untranslated",
  "needs_review",
  "reviewed",
  "has_issues",
  "hidden",
] as const;

export function GroupLoading() {
  const intl = useIntl();
  return (
    <div
      role="status"
      aria-label={intl.formatMessage(m.loading)}
      className="flex flex-col gap-3 p-4"
    >
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function GroupError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 p-4">
      <FormattedMessage {...m.error} />
      <Button variant="outline" size="sm" onClick={retry}>
        <FormattedMessage {...m.retry} />
      </Button>
    </div>
  );
}

function GroupPagination({
  pagination,
  onChange,
  label,
}: {
  pagination: CatGroupPagination;
  onChange: (offset: number) => void;
  label: string;
}) {
  if (!pagination.totalCount) return null;
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-2 border-t p-3"
    >
      <span className="text-xs text-muted-foreground tabular-nums">
        <FormattedMessage
          {...m.page}
          values={{
            start: pagination.returnedCount ? pagination.offset + 1 : 0,
            end: pagination.offset + pagination.returnedCount,
            total: pagination.totalCount,
          }}
        />
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pagination.offset === 0}
          onClick={() => onChange(Math.max(0, pagination.offset - pagination.limit))}
        >
          <FormattedMessage {...m.previous} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!pagination.hasMore}
          onClick={() => onChange(pagination.offset + pagination.limit)}
        >
          <FormattedMessage {...m.next} />
        </Button>
      </div>
    </nav>
  );
}

function GroupMembers({
  client,
  organizationSlug,
  projectId,
  group,
  query,
}: {
  client: GoSvcClient;
  organizationSlug: string;
  projectId: string;
  group: CatStringGroup;
  query: CatStringGroupsQuery;
}) {
  const intl = useIntl();
  const [offset, setOffset] = useState(0);
  const members = useQuery({
    queryKey: ["cat-string-group-members", organizationSlug, projectId, group.id, query, offset],
    queryFn: ({ signal }) =>
      client.cat.stringGroupMembers(
        organizationSlug,
        projectId,
        group.id,
        { ...query, offset, limit: PAGE_LIMIT },
        { signal },
      ),
    gcTime: 60_000,
  });
  return (
    <section aria-label={intl.formatMessage(m.members)} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-2 border-b p-4">
        <h2 className="text-balance text-sm font-semibold">
          <FormattedMessage {...m.members} />
        </h2>
        <p className="whitespace-pre-wrap break-words text-sm">{group.sourceText}</p>
        <p className="text-pretty text-xs text-muted-foreground">
          <FormattedMessage {...m.readOnly} />
        </p>
      </div>
      {members.isPending ? (
        <GroupLoading />
      ) : members.isError ? (
        <GroupError retry={() => void members.refetch()} />
      ) : (
        <>
          <ul className="flex flex-col gap-3 px-4">
            {members.data.members.map((member) => (
              <li key={member.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <p className="break-all font-mono text-xs">{member.key}</p>
                <p className="break-all text-xs text-muted-foreground">{member.sourcePath}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    <FormattedMessage
                      {...(member.status === "approved"
                        ? m.reviewed
                        : member.status === "needs_review"
                          ? m.needs_review
                          : member.status === "rejected"
                            ? m.rejected
                            : m.draft)}
                    />
                  </Badge>
                  {member.isLocked ? (
                    <Badge variant="outline">
                      <FormattedMessage {...m.locked} />
                    </Badge>
                  ) : null}
                  {member.isHidden ? (
                    <Badge variant="outline">
                      <FormattedMessage {...m.hidden} />
                    </Badge>
                  ) : null}
                  {!member.matchesFilter ? (
                    <Badge variant="outline">
                      <FormattedMessage {...m.outsideFilter} />
                    </Badge>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {member.targetText || <FormattedMessage {...m.untranslated} />}
                </p>
                {member.context ? (
                  <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {member.context}
                  </p>
                ) : null}
                {member.maxLength != null ? (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    <FormattedMessage {...m.maxLength} values={{ count: member.maxLength }} />
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <GroupPagination
            label={intl.formatMessage(m.members)}
            pagination={members.data.pagination}
            onChange={setOffset}
          />
        </>
      )}
    </section>
  );
}

export function ContentEditorGroupBrowser({
  client,
  organizationSlug,
  projectId,
  sourcePath,
  sourcePaths,
  targetLocale,
}: {
  client: GoSvcClient;
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  sourcePaths?: string;
  targetLocale: string;
}) {
  const intl = useIntl();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<NonNullable<CatStringGroupsQuery["queueFilter"]>>("all");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
      setSelectedId(null);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const query = {
    sourcePath,
    sourcePaths,
    targetLocale,
    search: debouncedSearch,
    queueFilter: filter,
  };
  const groups = useQuery({
    queryKey: ["cat-string-groups", organizationSlug, projectId, query, offset],
    queryFn: ({ signal }) =>
      client.cat.stringGroups(
        organizationSlug,
        projectId,
        { ...query, offset, limit: PAGE_LIMIT },
        { signal },
      ),
    gcTime: 60_000,
  });
  const selected = groups.data?.groups.find((group) => group.id === selectedId);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-lg border">
      <div className="flex flex-wrap gap-2 border-b p-3">
        <Input
          type="search"
          aria-label={intl.formatMessage(m.search)}
          placeholder={intl.formatMessage(m.search)}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-40 flex-1"
        />
        <Select
          value={filter}
          onValueChange={(value) => {
            if (value && FILTERS.includes(value)) {
              setFilter(value);
              setOffset(0);
              setSelectedId(null);
            }
          }}
        >
          <SelectTrigger aria-label={intl.formatMessage(m.filter)}>
            <SelectValue>{intl.formatMessage(m[filter])}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {intl.formatMessage(m[value])}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-h-0 flex-1 md:grid-cols-2">
        <section
          aria-label={intl.formatMessage(m.grouped)}
          className="min-w-0 border-b md:border-e md:border-b-0"
        >
          {groups.isPending ? (
            <GroupLoading />
          ) : groups.isError ? (
            <GroupError retry={() => void groups.refetch()} />
          ) : (
            <>
              {groups.data.groups.length === 0 ? (
                <div className="flex flex-col items-start gap-3 p-4">
                  <p>
                    <FormattedMessage {...m.empty} />
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                      setOffset(0);
                    }}
                  >
                    <FormattedMessage {...m.clear} />
                  </Button>
                </div>
              ) : (
                <ul className="flex flex-col gap-2 p-3">
                  {groups.data.groups.map((group) => (
                    <li key={group.id}>
                      <button
                        type="button"
                        aria-pressed={selectedId === group.id}
                        onClick={() => setSelectedId(group.id)}
                        className={cn(
                          "flex w-full flex-col gap-2 rounded-lg border p-3 text-start hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                          selectedId === group.id && "bg-muted",
                        )}
                      >
                        <span className="line-clamp-3 whitespace-pre-wrap break-words text-sm">
                          {group.sourceText}
                        </span>
                        <span className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            <FormattedMessage
                              {...m.occurrences}
                              values={{ count: group.occurrenceCount }}
                            />
                          </Badge>
                          {group.translationVariants > 1 ? (
                            <Badge variant="outline">
                              <FormattedMessage {...m.mixed} />
                            </Badge>
                          ) : null}
                        </span>
                        {group.matchingCount !== group.occurrenceCount ? (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            <FormattedMessage
                              {...m.matching}
                              values={{ count: group.matchingCount }}
                            />
                          </span>
                        ) : null}
                        <span className="text-xs text-muted-foreground tabular-nums">
                          <FormattedMessage
                            {...m.progress}
                            values={{
                              translated: group.translatedCount,
                              approved: group.approvedCount,
                              locked: group.lockedCount,
                            }}
                          />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <GroupPagination
                label={intl.formatMessage(m.grouped)}
                pagination={groups.data.pagination}
                onChange={(next) => {
                  setOffset(next);
                  setSelectedId(null);
                }}
              />
            </>
          )}
        </section>
        {selected ? (
          <GroupMembers
            key={`${selected.id}:${debouncedSearch}:${filter}`}
            client={client}
            organizationSlug={organizationSlug}
            projectId={projectId}
            group={selected}
            query={query}
          />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            <FormattedMessage {...m.select} />
          </p>
        )}
      </div>
    </div>
  );
}
