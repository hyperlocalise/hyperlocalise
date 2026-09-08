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
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import type {
  MemoryImportAttemptRecord,
  MemoryImportAttemptsResponse,
} from "@/api/routes/memory/memory.schema";
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { tmImportHistoryMessages as messages } from "./tm-import-history.messages";

const PAGE_SIZE = 20;

class ImportHistoryRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ImportHistoryRequestError";
  }
}

export const tmImportAttemptsQueryKey = (organizationSlug: string, memoryId: string) =>
  ["translation-memory-import-attempts", organizationSlug, memoryId] as const;

function ImportStatusBadge({ status }: { status: MemoryImportAttemptRecord["status"] }) {
  const message =
    status === "running"
      ? messages.running
      : status === "completed"
        ? messages.completed
        : status === "partially_successful"
          ? messages.partiallySuccessful
          : messages.failed;
  const variant =
    status === "completed"
      ? "success"
      : status === "partially_successful"
        ? "warning"
        : status === "failed"
          ? "destructive"
          : "secondary";

  return (
    <Badge variant={variant}>
      <FormattedMessage {...message} />
    </Badge>
  );
}

export function TmImportHistory({
  organizationSlug,
  memoryId,
}: {
  organizationSlug: string;
  memoryId: string;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const attemptsQuery = useInfiniteQuery({
    queryKey: tmImportAttemptsQueryKey(organizationSlug, memoryId),
    enabled: open,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ]["import-attempts"].$get(
        {
          param: { organizationSlug, memoryId },
          query: {
            limit: String(PAGE_SIZE),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        { init: { signal } },
      );
      if (!response.ok) {
        throw new ImportHistoryRequestError(
          response.status,
          await readApiError(response, intl.formatMessage(messages.errorTitle)),
        );
      }
      return (await response.json()) as MemoryImportAttemptsResponse;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const attempts = useMemo(
    () => attemptsQuery.data?.pages.flatMap((page) => page.memoryImportAttempts) ?? [],
    [attemptsQuery.data?.pages],
  );
  const isUnauthorized =
    attemptsQuery.error instanceof ImportHistoryRequestError &&
    [401, 403, 404].includes(attemptsQuery.error.status);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <FormattedMessage {...messages.action} />
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} />
          </DialogDescription>
        </DialogHeader>

        {attemptsQuery.isPending ? (
          <div className="grid gap-3" aria-label={intl.formatMessage(messages.loading)}>
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        ) : attemptsQuery.isError ? (
          <Alert variant={isUnauthorized ? "default" : "destructive"}>
            <AlertTitle>
              <FormattedMessage
                {...(isUnauthorized ? messages.unauthorizedTitle : messages.errorTitle)}
              />
            </AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <FormattedMessage
                {...(isUnauthorized ? messages.unauthorizedDescription : messages.errorDescription)}
              />
              {!isUnauthorized ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => attemptsQuery.refetch()}
                >
                  <FormattedMessage {...messages.retry} />
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : attempts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
            <TypographyP weight="medium">
              <FormattedMessage {...messages.emptyTitle} />
            </TypographyP>
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.emptyDescription} />
            </TypographyP>
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pe-1">
            {attempts.map((attempt) => (
              <div
                key={attempt.id}
                className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <TypographyP className="truncate" weight="medium">
                      {attempt.sourceFilename || intl.formatMessage(messages.unknownFile)}
                    </TypographyP>
                    <ImportStatusBadge status={attempt.status} />
                  </div>
                  <TypographyP size="xsmall" tone="subtle">
                    <FormattedMessage
                      {...messages.attemptMeta}
                      values={{
                        actor:
                          attempt.actorDisplayName || intl.formatMessage(messages.unknownActor),
                        date: intl.formatDate(new Date(attempt.createdAt), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      }}
                    />
                  </TypographyP>
                  {attempt.counts ? (
                    <TypographyP size="xsmall" tone="subtle">
                      <FormattedMessage {...messages.counts} values={attempt.counts} />
                    </TypographyP>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <OrgNavLink
                      href={`/org/${organizationSlug}/translation-memories/${memoryId}/imports/${attempt.id}`}
                    />
                  }
                >
                  <FormattedMessage {...messages.viewReport} />
                </Button>
              </div>
            ))}
            {attemptsQuery.hasNextPage ? (
              <div className="flex justify-center pt-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={attemptsQuery.isFetchingNextPage}
                  onClick={() => attemptsQuery.fetchNextPage()}
                >
                  <FormattedMessage {...messages.loadMore} />
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
