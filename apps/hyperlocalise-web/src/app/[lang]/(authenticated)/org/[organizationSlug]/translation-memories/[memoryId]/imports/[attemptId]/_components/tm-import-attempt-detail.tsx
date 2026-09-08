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
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import type {
  MemoryImportAttemptRecord,
  MemoryImportAttemptResponse,
  MemoryRecord,
} from "@/api/routes/memory/memory.schema";
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { tmImportAttemptDetailMessages as messages } from "./tm-import-attempt-detail.messages";

class ImportReportRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ImportReportRequestError";
    this.status = status;
  }
}

type MemoryImportDiagnostic = MemoryImportAttemptResponse["diagnostics"][number];

function MetadataItem({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="wrap-break-word text-sm text-foreground">{children}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: MemoryImportAttemptRecord["status"] }) {
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

export function TmImportDiagnosticList({ diagnostics }: { diagnostics: MemoryImportDiagnostic[] }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {diagnostics.map((diagnostic, index) => (
        <li key={`${diagnostic.code}-${diagnostic.unitIndex ?? index}`} className="space-y-1 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={diagnostic.severity === "error" ? "destructive" : "warning"}>
              {diagnostic.severity}
            </Badge>
            <code className="text-xs text-muted-foreground">{diagnostic.code}</code>
            {diagnostic.unitIndex !== undefined ? (
              <TypographyP size="xsmall" tone="subtle">
                <FormattedMessage
                  {...messages.diagnosticUnit}
                  values={{ unit: diagnostic.unitIndex }}
                />
              </TypographyP>
            ) : null}
            {diagnostic.tuid ? (
              <code className="text-xs text-muted-foreground">TUID {diagnostic.tuid}</code>
            ) : null}
          </div>
          <TypographyP size="small">{diagnostic.message}</TypographyP>
        </li>
      ))}
    </ul>
  );
}

export function TmImportAttemptDetail({
  organizationSlug,
  memoryId,
  attemptId,
}: {
  organizationSlug: string;
  memoryId: string;
  attemptId: string;
}) {
  const intl = useIntl();
  const attemptQuery = useQuery({
    queryKey: ["translation-memory-import-attempt", organizationSlug, memoryId, attemptId],
    queryFn: async ({ signal }) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ]["import-attempts"][":attemptId"].$get(
        { param: { organizationSlug, memoryId, attemptId } },
        { init: { signal } },
      );
      if (!response.ok) {
        throw new ImportReportRequestError(
          response.status,
          await readApiError(response, intl.formatMessage(messages.errorTitle)),
        );
      }
      return (await response.json()) as MemoryImportAttemptResponse;
    },
    refetchInterval: (query) =>
      query.state.data?.memoryImportAttempt.status === "running" ? 3_000 : false,
  });
  const memoryQuery = useQuery({
    queryKey: ["translation-memory", organizationSlug, memoryId],
    queryFn: async ({ signal }) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].$get({ param: { organizationSlug, memoryId } }, { init: { signal } });
      if (!response.ok) return null;
      const body = await response.json();
      return body.memory as MemoryRecord;
    },
  });

  if (attemptQuery.isPending) {
    return (
      <main
        className="mx-auto grid w-full max-w-5xl gap-4"
        aria-label={intl.formatMessage(messages.loading)}
      >
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-56 w-full" />
      </main>
    );
  }

  if (attemptQuery.isError) {
    const unavailable =
      attemptQuery.error instanceof ImportReportRequestError &&
      [401, 403, 404].includes(attemptQuery.error.status);
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-12">
        <Alert variant={unavailable ? "default" : "destructive"}>
          <AlertTitle>
            <FormattedMessage
              {...(unavailable ? messages.unavailableTitle : messages.errorTitle)}
            />
          </AlertTitle>
          <AlertDescription>
            <FormattedMessage
              {...(unavailable ? messages.unavailableDescription : messages.errorDescription)}
            />
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={
              <OrgNavLink href={`/org/${organizationSlug}/translation-memories/${memoryId}`} />
            }
          >
            <FormattedMessage {...messages.back} />
          </Button>
          {!unavailable ? (
            <Button type="button" onClick={() => attemptQuery.refetch()}>
              <FormattedMessage {...messages.retry} />
            </Button>
          ) : null}
        </div>
      </main>
    );
  }

  const { memoryImportAttempt: attempt, diagnostics } = attemptQuery.data;
  const memoryLabel = memoryQuery.data?.name ?? attempt.memoryId;
  const reportUrl = `/api/orgs/${encodeURIComponent(organizationSlug)}/translation-memories/${encodeURIComponent(memoryId)}/import-attempts/${encodeURIComponent(attemptId)}/report`;
  const affectedEntriesUrl = `/org/${organizationSlug}/translation-memories/${memoryId}?origin=import&importBatchId=${encodeURIComponent(attempt.importBatchId)}`;
  const countItems: Array<{
    label: typeof messages.totalRead;
    value: number;
  }> = attempt.counts
    ? [
        { label: messages.totalRead, value: attempt.counts.totalRead },
        { label: messages.created, value: attempt.counts.created },
        { label: messages.updated, value: attempt.counts.updated },
        { label: messages.variants, value: attempt.counts.variantCreated },
        { label: messages.skipped, value: attempt.counts.skipped },
        { label: messages.warnings, value: attempt.counts.warned },
        { label: messages.failedCount, value: attempt.counts.failed },
      ]
    : [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <OrgNavLink
        href={`/org/${organizationSlug}/translation-memories/${memoryId}`}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={1.8} />
        <FormattedMessage {...messages.back} />
      </OrgNavLink>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <TypographyH1 className="text-2xl" weight="medium">
              <FormattedMessage {...messages.title} />
            </TypographyH1>
            <StatusBadge status={attempt.status} />
          </div>
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.subtitle} />
          </TypographyP>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<a href={reportUrl} download />}>
            <FormattedMessage {...messages.download} />
          </Button>
          <Button render={<OrgNavLink href={affectedEntriesUrl} />}>
            <FormattedMessage {...messages.affectedEntries} />
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            <FormattedMessage {...messages.overview} />
          </CardTitle>
          <CardAction>
            <StatusBadge status={attempt.status} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <MetadataItem label={<FormattedMessage {...messages.translationMemory} />}>
              {memoryLabel}
            </MetadataItem>
            <MetadataItem label={<FormattedMessage {...messages.actor} />}>
              {attempt.actorDisplayName || intl.formatMessage(messages.systemActor)}
            </MetadataItem>
            <MetadataItem label={<FormattedMessage {...messages.started} />}>
              {intl.formatDate(new Date(attempt.createdAt), {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </MetadataItem>
            <MetadataItem label={<FormattedMessage {...messages.completedAt} />}>
              {attempt.completedAt
                ? intl.formatDate(new Date(attempt.completedAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : intl.formatMessage(messages.unknown)}
            </MetadataItem>
            <MetadataItem label={<FormattedMessage {...messages.filename} />}>
              {attempt.sourceFilename || intl.formatMessage(messages.unknown)}
            </MetadataItem>
            <MetadataItem label={<FormattedMessage {...messages.byteSize} />}>
              {attempt.sourceByteSize === null
                ? intl.formatMessage(messages.unknown)
                : intl.formatNumber(attempt.sourceByteSize, {
                    style: "unit",
                    unit: "byte",
                    unitDisplay: "short",
                  })}
            </MetadataItem>
            <MetadataItem label={<FormattedMessage {...messages.format} />}>
              {attempt.format.toUpperCase()}
            </MetadataItem>
            <MetadataItem label={<FormattedMessage {...messages.sourceLanguage} />}>
              {attempt.headerSrclang || intl.formatMessage(messages.unknown)}
            </MetadataItem>
            <MetadataItem label={<FormattedMessage {...messages.status} />}>
              <StatusBadge status={attempt.status} />
            </MetadataItem>
            {attempt.failureCode ? (
              <MetadataItem label={<FormattedMessage {...messages.failureCode} />}>
                <code className="text-xs">{attempt.failureCode}</code>
              </MetadataItem>
            ) : null}
            <MetadataItem label={<FormattedMessage {...messages.sha256} />}>
              <code className="break-all text-xs">{attempt.sourceSha256}</code>
            </MetadataItem>
            <MetadataItem label={<FormattedMessage {...messages.options} />}>
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(attempt.options, null, 2)}
              </pre>
            </MetadataItem>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <FormattedMessage {...messages.results} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attempt.counts ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {countItems.map(({ label, value }) => (
                <div key={label.id} className="rounded-xl bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">
                    <FormattedMessage {...label} />
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">{intl.formatNumber(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.pendingCounts} />
            </TypographyP>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <FormattedMessage {...messages.diagnostics} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {attempt.diagnosticsAvailability === "expired" ? (
            <Alert>
              <AlertTitle>
                <FormattedMessage {...messages.diagnosticsExpiredTitle} />
              </AlertTitle>
              <AlertDescription>
                <FormattedMessage {...messages.diagnosticsExpiredDescription} />
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {attempt.diagnosticsTruncated ? (
                <Alert>
                  <AlertTitle>
                    <FormattedMessage {...messages.diagnosticsTruncatedTitle} />
                  </AlertTitle>
                  <AlertDescription>
                    <FormattedMessage {...messages.diagnosticsTruncatedDescription} />
                  </AlertDescription>
                </Alert>
              ) : null}
              {diagnostics.length > 0 ? (
                <TmImportDiagnosticList diagnostics={diagnostics} />
              ) : (
                <TypographyP size="small" tone="subtle">
                  <FormattedMessage {...messages.noDiagnostics} />
                </TypographyP>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
