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
import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import type { GlossaryInterchangeRun } from "@/lib/go-svc/go-svc-client.types";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { OrgNavLink } from "@/components/app-shell/org-nav-link";

import { glossaryInterchangeHistoryMessages as messages } from "./glossary-interchange-history.messages";
import { formatGlossaryInterchangeRunName } from "./glossary-interchange-run-name";

const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: string }) {
  const message =
    status === "completed"
      ? messages.completed
      : status === "failed"
        ? messages.failed
        : messages.running;
  const variant =
    status === "completed" ? "success" : status === "failed" ? "destructive" : "secondary";
  return (
    <Badge variant={variant}>
      <FormattedMessage {...message} />
    </Badge>
  );
}

function RunCard({
  organizationSlug,
  glossaryId,
  run,
}: {
  organizationSlug: string;
  glossaryId: string;
  run: GlossaryInterchangeRun;
}) {
  const intl = useIntl();
  const runName = formatGlossaryInterchangeRunName(run, intl);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <TypographyP weight="medium">{runName}</TypographyP>
          <Badge variant="outline">{run.format.toUpperCase()}</Badge>
          <StatusBadge status={run.status} />
        </div>
        <TypographyP size="xsmall" tone="subtle">
          {intl.formatDate(new Date(run.createdAt), { dateStyle: "medium", timeStyle: "short" })}
        </TypographyP>
        {run.errorMessage ? (
          <TypographyP size="xsmall" tone="critical">
            {run.errorMessage}
          </TypographyP>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="outline"
        render={
          <OrgNavLink
            href={`/org/${organizationSlug}/glossaries/${glossaryId}/imports/${run.id}`}
          />
        }
      >
        <FormattedMessage {...messages.viewReport} />
      </Button>
    </div>
  );
}

export function GlossaryInterchangeHistory({
  organizationSlug,
  glossaryId,
}: {
  organizationSlug: string;
  glossaryId: string;
}) {
  const intl = useIntl();
  const { client, loading } = useGoSvcClient();
  const glossaryQuery = useQuery({
    queryKey: ["glossary", organizationSlug, glossaryId],
    enabled: !loading,
    queryFn: () => client.glossary.get(organizationSlug, glossaryId),
  });
  const query = useInfiniteQuery({
    queryKey: ["glossary-interchange-runs", organizationSlug, glossaryId],
    enabled: !loading,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      client.glossary.listRuns(
        organizationSlug,
        glossaryId,
        { limit: PAGE_SIZE, cursor: pageParam },
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: (current) =>
      current.state.data?.pages.some((page) =>
        page.runs.some((run) => !["completed", "failed"].includes(run.status)),
      )
        ? 3000
        : false,
  });
  const runs = useMemo(
    () => query.data?.pages.flatMap((page) => page.runs) ?? [],
    [query.data?.pages],
  );

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <TypographyH1>
            <FormattedMessage {...messages.title} />
          </TypographyH1>
          <TypographyP tone="subtle">
            <FormattedMessage {...messages.description} />
          </TypographyP>
          {glossaryQuery.data?.glossary.name ? (
            <TypographyP size="xsmall" tone="subtle">
              <FormattedMessage
                {...messages.glossary}
                values={{ name: glossaryQuery.data.glossary.name }}
              />
            </TypographyP>
          ) : null}
        </div>
        <Button
          variant="outline"
          render={<OrgNavLink href={`/org/${organizationSlug}/glossaries/${glossaryId}`} />}
        >
          <FormattedMessage {...messages.back} />
        </Button>
      </div>
      {loading || query.isPending ? (
        <div className="grid gap-3" aria-label={intl.formatMessage(messages.loading)}>
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-24 w-full" />
          ))}
        </div>
      ) : null}
      {query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>
            <FormattedMessage {...messages.error} />
          </AlertTitle>
          <AlertDescription>
            <Button type="button" variant="outline" onClick={() => query.refetch()}>
              <FormattedMessage {...messages.retry} />
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {!loading && !query.isPending && !query.isError && runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
          <TypographyP>
            <FormattedMessage {...messages.empty} />
          </TypographyP>
        </div>
      ) : null}
      {runs.length > 0 ? (
        <div className="grid gap-3">
          {runs.map((run) => (
            <RunCard
              key={run.id}
              organizationSlug={organizationSlug}
              glossaryId={glossaryId}
              run={run}
            />
          ))}
          {query.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                <FormattedMessage {...messages.loadMore} />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
