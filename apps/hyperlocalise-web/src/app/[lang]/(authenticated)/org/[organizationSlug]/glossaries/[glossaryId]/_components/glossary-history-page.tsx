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
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import type {
  GlossaryHistoryEventRecord,
  GlossaryHistoryPageResponse,
} from "@/api/routes/glossary/glossary.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { glossaryHistoryPageMessages as messages } from "./glossary-history-page.messages";

const PAGE_SIZE = 50;

class GlossaryHistoryRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function importCount(attributes: Record<string, unknown>, key: string) {
  const counts = attributes.counts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return 0;
  const value = (counts as Record<string, unknown>)[key];
  return typeof value === "number" ? value : 0;
}

function HistoryEventCard({
  event,
  glossaryHref,
}: {
  event: GlossaryHistoryEventRecord;
  glossaryHref: string;
}) {
  const intl = useIntl();
  const format = event.attributes.format;
  const mode = event.attributes.mode;
  const isImport = event.eventType === "imported";

  return (
    <article className="grid gap-2 rounded-md border border-border p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium capitalize">{event.eventType}</span>
        <span className="text-xs text-muted-foreground">
          <FormattedMessage
            {...messages.eventMeta}
            values={{
              actor: event.actorDisplayName,
              date: intl.formatDate(new Date(event.occurredAt), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            }}
          />
        </span>
      </div>
      {event.conceptId ? (
        <Link
          href={`${glossaryHref}/concepts/${event.conceptId}`}
          className="text-xs text-primary hover:underline"
        >
          <FormattedMessage {...messages.concept} values={{ id: event.conceptId }} />
        </Link>
      ) : null}
      {isImport && typeof format === "string" && typeof mode === "string" ? (
        <TypographyP size="xsmall" tone="subtle">
          <FormattedMessage {...messages.importMeta} values={{ format, mode }} />
        </TypographyP>
      ) : null}
      {isImport ? (
        <TypographyP size="xsmall" tone="subtle">
          <FormattedMessage
            {...messages.importCounts}
            values={{
              created: importCount(event.attributes, "created"),
              updated: importCount(event.attributes, "updated"),
              merged: importCount(event.attributes, "merged"),
              skipped: importCount(event.attributes, "skipped"),
              failed: importCount(event.attributes, "failed"),
            }}
          />
        </TypographyP>
      ) : null}
      {event.changedFields.length ? (
        <TypographyP size="xsmall" tone="subtle">
          <FormattedMessage
            {...messages.changedFields}
            values={{ fields: event.changedFields.join(", ") }}
          />
        </TypographyP>
      ) : null}
      {event.changes.length ? (
        <div className="grid gap-1 rounded-md bg-muted/40 p-2 font-mono text-xs">
          {event.changes.map((change) => (
            <div key={change.field} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
              <span className="font-semibold">{change.field}</span>
              <span className="break-words text-muted-foreground">
                <FormattedMessage
                  {...messages.fieldChange}
                  values={{
                    before: formatValue(change.before),
                    after: formatValue(change.after),
                  }}
                />
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function HistorySkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-28 w-full" />
      ))}
    </div>
  );
}

export function GlossaryHistoryPage({
  organizationSlug,
  glossaryId,
}: {
  organizationSlug: string;
  glossaryId: string;
}) {
  const intl = useIntl();
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const glossaryHref = `/org/${organizationSlug}/glossaries/${glossaryId}`;

  const historyQuery = useInfiniteQuery({
    queryKey: ["glossary-history", organizationSlug, glossaryId, search, eventType],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts.history.$get(
        {
          param: { organizationSlug, glossaryId },
          query: {
            limit: String(PAGE_SIZE),
            ...(pageParam ? { cursor: pageParam } : {}),
            ...(search.trim() ? { search: search.trim() } : {}),
            ...(eventType ? { eventType } : {}),
          },
        },
        { init: { signal } },
      );
      if (!response.ok) {
        throw new GlossaryHistoryRequestError(
          response.status,
          await readApiError(response, intl.formatMessage(messages.errorTitle)),
        );
      }
      return (await response.json()) as GlossaryHistoryPageResponse;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const events = useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.events) ?? [],
    [historyQuery.data?.pages],
  );
  const unavailable =
    historyQuery.error instanceof GlossaryHistoryRequestError &&
    [400, 401, 403, 404].includes(historyQuery.error.status);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Link
        href={glossaryHref}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={1.8} />
        <FormattedMessage {...messages.backToGlossary} />
      </Link>
      <section className="grid gap-2">
        <TypographyH1>{intl.formatMessage(messages.title)}</TypographyH1>
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.description} />
        </TypographyP>
      </section>
      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-1.5">
            <label htmlFor="glossary-history-search" className="text-xs font-medium">
              <FormattedMessage {...messages.searchLabel} />
            </label>
            <Input
              id="glossary-history-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder={intl.formatMessage(messages.searchPlaceholder)}
            />
          </div>
          <div className="grid gap-1.5 sm:w-48">
            <label htmlFor="glossary-history-event-type" className="text-xs font-medium">
              <FormattedMessage {...messages.eventTypeLabel} />
            </label>
            <Select
              value={eventType || "all"}
              onValueChange={(value) => setEventType(value === "all" ? "" : (value ?? ""))}
            >
              <SelectTrigger id="glossary-history-event-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <FormattedMessage {...messages.allEvents} />
                </SelectItem>
                <SelectItem value="imported">
                  <FormattedMessage {...messages.imported} />
                </SelectItem>
                <SelectItem value="created">
                  <FormattedMessage {...messages.created} />
                </SelectItem>
                <SelectItem value="updated">
                  <FormattedMessage {...messages.updated} />
                </SelectItem>
                <SelectItem value="deleted">
                  <FormattedMessage {...messages.deleted} />
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {historyQuery.isPending ? (
          <HistorySkeleton />
        ) : historyQuery.isError ? (
          <div className="grid gap-3 rounded-md border border-destructive/30 p-4">
            <div>
              <TypographyP weight="medium">
                <FormattedMessage
                  {...(unavailable ? messages.unavailableTitle : messages.errorTitle)}
                />
              </TypographyP>
              <TypographyP size="small" tone="subtle">
                <FormattedMessage
                  {...(unavailable ? messages.unavailableDescription : messages.errorDescription)}
                />
              </TypographyP>
            </div>
            {!unavailable ? (
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() => historyQuery.refetch()}
              >
                <FormattedMessage {...messages.retry} />
              </Button>
            ) : null}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-5 py-10 text-center">
            <TypographyP weight="medium">
              <FormattedMessage {...messages.emptyTitle} />
            </TypographyP>
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.emptyDescription} />
            </TypographyP>
          </div>
        ) : (
          <div className="grid gap-3">
            {events.map((event) => (
              <HistoryEventCard key={event.id} event={event} glossaryHref={glossaryHref} />
            ))}
            {historyQuery.hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                className="mx-auto"
                disabled={historyQuery.isFetchingNextPage}
                onClick={() => historyQuery.fetchNextPage()}
              >
                <FormattedMessage {...messages.loadMore} />
              </Button>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
