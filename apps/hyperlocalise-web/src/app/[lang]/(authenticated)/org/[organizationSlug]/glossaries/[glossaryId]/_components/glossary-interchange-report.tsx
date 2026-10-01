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
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { OrgNavLink } from "@/components/app-shell/org-nav-link";

import { glossaryInterchangeHistoryMessages as messages } from "./glossary-interchange-history.messages";
import { formatGlossaryInterchangeRunName } from "./glossary-interchange-run-name";

function shouldRetryReport(error: unknown): boolean {
  if (!(error instanceof GoSvcClientError)) return false;
  return (
    error.code === "network_error" ||
    error.status === 408 ||
    error.status === 429 ||
    (error.status !== null && error.status >= 500)
  );
}

export function GlossaryInterchangeReport({
  organizationSlug,
  glossaryId,
  runId,
}: {
  organizationSlug: string;
  glossaryId: string;
  runId: string;
}) {
  const intl = useIntl();
  const { client, loading } = useGoSvcClient();
  const queryClient = useQueryClient();
  const [downloadPending, setDownloadPending] = useState(false);
  const reportQuery = useQuery({
    queryKey: ["glossary-interchange-report", organizationSlug, glossaryId, runId],
    enabled: !loading,
    queryFn: ({ signal }) =>
      client.glossary.report(organizationSlug, glossaryId, runId, { signal }),
    retry: (failureCount, error) => failureCount < 3 && shouldRetryReport(error),
    refetchInterval: (current) => {
      if (current.state.status === "error") {
        return shouldRetryReport(current.state.error) ? 3000 : false;
      }
      const status = current.state.data?.report.status;
      return !status || !["completed", "failed"].includes(status) ? 3000 : false;
    },
  });
  const run = reportQuery.data?.report;
  useEffect(() => {
    if (run?.operation === "import" && run.status === "completed") {
      void queryClient.invalidateQueries({
        queryKey: ["glossary-concepts-page", organizationSlug, glossaryId],
      });
    }
  }, [glossaryId, organizationSlug, queryClient, run?.operation, run?.status]);
  const glossaryQuery = useQuery({
    queryKey: ["glossary", organizationSlug, glossaryId],
    enabled: !loading,
    queryFn: () => client.glossary.get(organizationSlug, glossaryId),
  });
  const runName = run ? formatGlossaryInterchangeRunName(run, intl) : undefined;

  const download = async (backup = false) => {
    if (!run) return;
    setDownloadPending(true);
    try {
      const file = backup
        ? await client.glossary.importBackup(organizationSlug, glossaryId, runId)
        : await (async () => {
            const signed = await client.glossary.downloadUrl(organizationSlug, glossaryId, runId);
            const response = await fetch(signed.url);
            if (!response.ok) throw new Error("download failed");
            return {
              blob: await response.blob(),
              filename: signed.filename ?? run.resultFilename ?? `glossary.${run.format}`,
            };
          })();
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename ?? `glossary.${run.format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      void error;
      toast.error(intl.formatMessage(messages.downloadFailed));
    } finally {
      setDownloadPending(false);
    }
  };

  if (loading || reportQuery.isPending)
    return (
      <main className="mx-auto grid w-full max-w-5xl gap-4 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  if (reportQuery.isError || !run)
    return (
      <main className="mx-auto grid w-full max-w-3xl gap-4 py-12">
        <Alert variant="destructive">
          <AlertTitle>
            <FormattedMessage {...messages.error} />
          </AlertTitle>
          <AlertDescription />
        </Alert>
        <Button
          variant="outline"
          render={<OrgNavLink href={`/org/${organizationSlug}/glossaries/${glossaryId}/imports`} />}
        >
          <FormattedMessage {...messages.backToHistory} />
        </Button>
      </main>
    );

  const canExportDownload =
    run.operation === "export" && run.status === "completed" && run.resultReady;
  const canBackupDownload =
    run.operation === "import" && run.status === "completed" && run.backupReady;
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <TypographyH1>{runName}</TypographyH1>
          <TypographyP tone="subtle">
            {glossaryQuery.data?.glossary.name ? `${glossaryQuery.data.glossary.name} · ` : ""}
            {run.operation} · {run.format.toUpperCase()} · {run.status}
          </TypographyP>
        </div>
        <Button
          variant="outline"
          render={<OrgNavLink href={`/org/${organizationSlug}/glossaries/${glossaryId}/imports`} />}
        >
          <FormattedMessage {...messages.backToHistory} />
        </Button>
      </div>
      <section className="grid gap-3 rounded-xl border border-border p-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{run.format.toUpperCase()}</Badge>
          <Badge
            variant={
              run.status === "failed"
                ? "destructive"
                : run.status === "completed"
                  ? "success"
                  : "secondary"
            }
          >
            {run.status}
          </Badge>
        </div>
        <TypographyP>
          {run.errorMessage ?? run.sourceFilename ?? run.resultFilename ?? ""}
        </TypographyP>
        <div className="flex flex-wrap gap-2">
          {canExportDownload ? (
            <Button type="button" disabled={downloadPending} onClick={() => download()}>
              <FormattedMessage {...messages.download} />
            </Button>
          ) : null}
          {canBackupDownload ? (
            <Button
              type="button"
              variant="outline"
              disabled={downloadPending}
              onClick={() => download(true)}
            >
              <FormattedMessage {...messages.backup} />
            </Button>
          ) : null}
        </div>
      </section>
      <section className="grid gap-3">
        <TypographyP weight="medium">
          <FormattedMessage {...messages.diagnostics} />
        </TypographyP>
        {reportQuery.data.entries.length === 0 ? (
          <TypographyP tone="subtle">
            <FormattedMessage {...messages.noDiagnostics} />
          </TypographyP>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {reportQuery.data.entries.map((entry) => (
              <li key={entry.id} className="space-y-1 p-3">
                <div className="flex gap-2">
                  <Badge variant={entry.severity === "error" ? "destructive" : "warning"}>
                    {entry.severity}
                  </Badge>
                  <code className="text-xs text-muted-foreground">{entry.code}</code>
                </div>
                <TypographyP size="small">{entry.message}</TypographyP>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
