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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type { MemoryRecord } from "@/api/routes/memory/memory.schema";
import type {
  MemoryInterchangeAttemptResponse,
  MemoryInterchangeAttemptStatus,
  MemoryInterchangeDiagnostic,
} from "@/lib/go-svc/go-svc-client.types";
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { tmImportAttemptDetailMessages as messages } from "./tm-import-attempt-detail.messages";

const IMPORT_COUNT_FIELDS = [
  ["totalRead", messages.totalRead],
  ["created", messages.created],
  ["updated", messages.updated],
  ["variantCreated", messages.variants],
  ["skipped", messages.skipped],
  ["warned", messages.warnings],
  ["failed", messages.failedCount],
] as const;

type InterchangeCountItem = {
  label: (typeof IMPORT_COUNT_FIELDS)[number][1] | typeof messages.entriesExported;
  value: number;
};

export function memoryInterchangeCountItems(attempt: {
  operation: "import" | "export";
  counts: Record<string, unknown> | null;
}): InterchangeCountItem[] {
  const counts = attempt.counts;
  if (!counts) return [];
  if (attempt.operation === "export") {
    const entries = counts.entries;
    return typeof entries === "number" && Number.isFinite(entries)
      ? [{ label: messages.entriesExported, value: entries }]
      : [];
  }
  return IMPORT_COUNT_FIELDS.map(([key, label]) => ({
    label,
    value: typeof counts[key] === "number" ? counts[key] : 0,
  }));
}

class ImportReportRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ImportReportRequestError";
    this.status = status;
  }
}

export function TmInterchangeFailureDetails({
  failureCode,
  failureMessage,
}: {
  failureCode: string | null;
  failureMessage?: string | null;
}) {
  const message = failureMessage?.trim();
  if (!failureCode && !message) return null;
  return (
    <>
      {failureCode ? (
        <MetadataItem label={<FormattedMessage {...messages.failureCode} />}>
          <code className="text-xs">{failureCode}</code>
        </MetadataItem>
      ) : null}
      {message ? (
        <MetadataItem label={<FormattedMessage {...messages.failureMessage} />}>
          {message}
        </MetadataItem>
      ) : null}
    </>
  );
}

function MetadataItem({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="wrap-break-word text-sm text-foreground">{children}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: MemoryInterchangeAttemptStatus }) {
  const message =
    status === "upload_pending"
      ? messages.uploadPending
      : status === "queued"
        ? messages.queued
        : status === "preview_completed"
          ? messages.previewCompleted
          : status === "running"
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

export function TmImportDiagnosticList({
  diagnostics,
}: {
  diagnostics: MemoryInterchangeDiagnostic[];
}) {
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
  currentUserId,
  canWriteMemories,
}: {
  organizationSlug: string;
  memoryId: string;
  attemptId: string;
  currentUserId: string;
  canWriteMemories: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient, loading: goSvcLoading } = useGoSvcClient();
  const [downloadPending, setDownloadPending] = useState(false);
  const attemptQuery = useQuery({
    queryKey: ["translation-memory-import-attempt", organizationSlug, memoryId, attemptId],
    enabled: !goSvcLoading,
    queryFn: async ({ signal }) => {
      try {
        return await goSvcClient.memory.importAttempts.get(organizationSlug, memoryId, attemptId, {
          signal,
        });
      } catch (error) {
        throw new ImportReportRequestError(
          typeof error === "object" &&
            error !== null &&
            "status" in error &&
            typeof error.status === "number"
            ? error.status
            : 500,
          error instanceof Error ? error.message : intl.formatMessage(messages.errorTitle),
        );
      }
    },
    refetchInterval: (query) => {
      const status = query.state.data?.memoryImportAttempt.status;
      return status === "upload_pending" || status === "queued" || status === "running"
        ? 3_000
        : false;
    },
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
  const applyImport = useMutation({
    mutationFn: async () => {
      try {
        return await goSvcClient.memory.entries.queueImport(organizationSlug, memoryId, {
          attemptId,
          mode: "apply",
        });
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.applyFailed)), {
          cause: error,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["translation-memory-import-attempt", organizationSlug, memoryId, attemptId],
      });
    },
    onError: (error) => toast.error(error.message),
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
        {!unavailable ? (
          <Button type="button" onClick={() => attemptQuery.refetch()}>
            <FormattedMessage {...messages.retry} />
          </Button>
        ) : null}
      </main>
    );
  }

  const { memoryImportAttempt: attempt, diagnostics } =
    attemptQuery.data as MemoryInterchangeAttemptResponse;
  const memoryLabel = memoryQuery.data?.name ?? attempt.memoryId;
  const reportUrl = `/api/orgs/${encodeURIComponent(organizationSlug)}/translation-memories/${encodeURIComponent(memoryId)}/import-attempts/${encodeURIComponent(attemptId)}/report`;
  const affectedEntriesUrl = `/org/${organizationSlug}/translation-memories/${memoryId}?origin=import&importBatchId=${encodeURIComponent(attempt.importBatchId)}`;
  const downloadExport = async () => {
    setDownloadPending(true);
    try {
      const signed = await goSvcClient.memory.importAttempts.downloadUrl(
        organizationSlug,
        memoryId,
        attemptId,
      );
      const response = await fetch(signed.url);
      if (!response.ok) throw new Error("download failed");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = signed.filename ?? `translation-memory.${attempt.format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      void error;
      toast.error(intl.formatMessage(messages.downloadFailed));
    } finally {
      setDownloadPending(false);
    }
  };
  const countItems = memoryInterchangeCountItems(attempt);
  const filename =
    (attempt.operation === "export" ? attempt.resultFilename : attempt.sourceFilename) ||
    intl.formatMessage(messages.unknown);
  // Applying mirrors finalizeMemoryImport: only the uploader, with memory
  // write access, on a non-archived memory. Everyone else would get a 409,
  // so don't offer the action.
  const canApplyImport =
    attempt.status === "preview_completed" &&
    canWriteMemories &&
    attempt.createdByUserId === currentUserId &&
    memoryQuery.data?.status !== "archived";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <TypographyH1 className="text-2xl" weight="medium">
              <FormattedMessage
                {...(attempt.operation === "export" ? messages.exportTitle : messages.title)}
              />
            </TypographyH1>
            <StatusBadge status={attempt.status} />
          </div>
          <TypographyP size="small" tone="subtle">
            <FormattedMessage
              {...(attempt.operation === "export" ? messages.exportSubtitle : messages.subtitle)}
            />
          </TypographyP>
        </div>
        <div className="flex flex-wrap gap-2">
          {attempt.operation === "import" ? (
            <>
              {canApplyImport ? (
                <Button
                  type="button"
                  disabled={applyImport.isPending}
                  onClick={() => applyImport.mutate()}
                >
                  <FormattedMessage {...messages.applyImport} />
                </Button>
              ) : null}
              <Button variant="outline" render={<a href={reportUrl} download />}>
                <FormattedMessage {...messages.download} />
              </Button>
              {attempt.status === "completed" || attempt.status === "partially_successful" ? (
                <Button render={<OrgNavLink href={affectedEntriesUrl} />}>
                  <FormattedMessage {...messages.affectedEntries} />
                </Button>
              ) : null}
            </>
          ) : attempt.status === "completed" && attempt.resultReady ? (
            <Button type="button" disabled={downloadPending} onClick={() => void downloadExport()}>
              <FormattedMessage {...messages.downloadExport} />
            </Button>
          ) : null}
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
            <MetadataItem
              label={
                <FormattedMessage
                  {...(attempt.operation === "export" ? messages.exportedBy : messages.actor)}
                />
              }
            >
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
              {filename}
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
            <TmInterchangeFailureDetails
              failureCode={attempt.failureCode}
              failureMessage={attempt.failureMessage}
            />
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
          {countItems.length > 0 ? (
            <dl
              className={
                countItems.length === 1
                  ? "grid max-w-xs gap-3"
                  : "grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7"
              }
            >
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
              <FormattedMessage
                {...(attempt.operation === "export"
                  ? messages.pendingExportCounts
                  : messages.pendingCounts)}
              />
            </TypographyP>
          )}
        </CardContent>
      </Card>

      {attempt.operation === "import" ? (
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
      ) : null}
    </main>
  );
}
