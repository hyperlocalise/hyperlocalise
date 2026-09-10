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
import { useState } from "react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

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

import { glossaryDetailPageContentMessages as messages } from "./glossary-detail-page-content.messages";

type GlossaryHistoryEvent = {
  id: string;
  conceptId: string | null;
  termId: string | null;
  eventType: string;
  actorKind: string;
  actorUserId: string | null;
  changedFields: string[];
  changes: Array<{ field: string; before: unknown; after: unknown }>;
  occurredAt: string;
};

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date);
}

export function GlossaryHistoryPageContent({
  organizationSlug,
  glossaryId,
}: {
  organizationSlug: string;
  glossaryId: string;
}) {
  const intl = useIntl();
  const [historySearch, setHistorySearch] = useState("");
  const [historyEventType, setHistoryEventType] = useState("");
  const glossaryHref = `/org/${organizationSlug}/glossaries/${glossaryId}`;

  const historyQuery = useQuery({
    queryKey: ["glossary-history", organizationSlug, glossaryId, historySearch, historyEventType],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts.history.$get({
        param: { organizationSlug, glossaryId },
        query: {
          search: historySearch || undefined,
          eventType: historyEventType || undefined,
          limit: "100",
        },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadConceptsFailed)),
        );
      return (await response.json()).events as GlossaryHistoryEvent[];
    },
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Link
        href={glossaryHref}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={1.8} />
        <FormattedMessage {...messages.backToGlossaryDetail} />
      </Link>
      <section className="grid gap-2">
        <TypographyH1>{intl.formatMessage(messages.historyTitle)}</TypographyH1>
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...messages.historyPageDescription} />
        </TypographyP>
      </section>
      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder={intl.formatMessage(messages.historySearchPlaceholder)}
            className="sm:max-w-sm"
          />
          <Select
            value={historyEventType || "all"}
            onValueChange={(value) => setHistoryEventType(value === "all" ? "" : (value ?? ""))}
          >
            <SelectTrigger className="sm:w-44">
              <SelectValue>
                {historyEventType || intl.formatMessage(messages.historyAllEvents)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <FormattedMessage {...messages.historyAllEvents} />
              </SelectItem>
              <SelectItem value="created">created</SelectItem>
              <SelectItem value="updated">updated</SelectItem>
              <SelectItem value="deleted">deleted</SelectItem>
              <SelectItem value="imported">imported</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {historyQuery.isError ? (
          <TypographyP size="small" tone="subtle">
            {historyQuery.error instanceof Error
              ? historyQuery.error.message
              : intl.formatMessage(messages.historyLoadFailed)}
          </TypographyP>
        ) : historyQuery.isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        ) : historyQuery.data?.length ? (
          <ol className="grid gap-4">
            {historyQuery.data.map((event) => (
              <li key={event.id} className="grid gap-2 rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium capitalize">{event.eventType}</span>
                  <span className="text-xs text-muted-foreground">
                    <FormattedMessage
                      {...messages.historyBy}
                      values={{
                        event: event.actorKind,
                        actor: event.actorUserId ?? "system",
                        date: formatDate(event.occurredAt),
                      }}
                    />
                  </span>
                </div>
                {event.conceptId ? (
                  <Link
                    href={`${glossaryHref}/concepts/${event.conceptId}`}
                    className="text-xs text-primary hover:underline"
                  >
                    {event.conceptId}
                  </Link>
                ) : null}
                {event.changedFields.length ? (
                  <span className="text-xs text-muted-foreground">
                    <FormattedMessage
                      {...messages.historyChangedFields}
                      values={{ fields: event.changedFields.join(", ") }}
                    />
                  </span>
                ) : null}
                {event.changes.length ? (
                  <div className="grid gap-1 rounded-md bg-muted/40 p-2 font-mono text-xs">
                    {event.changes.map((change) => (
                      <div key={change.field} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
                        <span className="font-semibold">{change.field}</span>
                        <span className="break-words text-muted-foreground">
                          {JSON.stringify(change.before)} → {JSON.stringify(change.after)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.historyEmpty} />
          </TypographyP>
        )}
        {historyQuery.isFetching && !historyQuery.isLoading ? (
          <TypographyP size="xsmall" tone="subtle">
            Loading…
          </TypographyP>
        ) : null}
      </section>
      <Button render={<Link href={glossaryHref} />} variant="outline" className="w-fit">
        <FormattedMessage {...messages.backToGlossaryDetail} />
      </Button>
    </main>
  );
}
