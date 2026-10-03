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
import { useState } from "react";
import { useIntl } from "react-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProjectQaReport } from "@/lib/qa/qa-report-client";
import { qaMessages as m } from "./qa.messages";

type RunStatusReport = Pick<
  ProjectQaReport,
  | "id"
  | "status"
  | "trigger"
  | "createdAt"
  | "completedAt"
  | "segmentCount"
  | "errorCount"
  | "warningCount"
  | "errorCode"
  | "summary"
>;

function failureMessage(code: string | null) {
  switch (code) {
    case "qa_scan_enqueue_failed":
      return m.failureQueue;
    case "qa_scan_stale":
      return m.failureStale;
    case "qa_scan_processing_failed":
      return m.failureProcessing;
    case "qa_scan_finalization_failed":
      return m.failureFinalization;
    default:
      return m.failureUnknown;
  }
}

function QaFailureStatus({
  report,
  lastSuccessfulAt,
  onRetry,
  isRetrying,
  compact,
}: {
  report: RunStatusReport;
  lastSuccessfulAt?: string | null;
  onRetry?: () => void;
  isRetrying?: boolean;
  compact?: boolean;
}) {
  const intl = useIntl();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const reason = intl.formatMessage(failureMessage(report.errorCode));
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="destructive">{intl.formatMessage(m.scanFailed)}</Badge>
        <span className="text-pretty text-muted-foreground">{reason}</span>
      </div>
    );
  }
  const attemptedAt = report.completedAt ?? report.createdAt;
  return (
    <section
      role="alert"
      className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-1">
          <h3 className="text-balance text-base font-semibold text-destructive">
            {intl.formatMessage(m.scanFailed)}
          </h3>
          <p className="text-pretty text-sm">{reason}</p>
          <p className="text-pretty text-sm text-muted-foreground">
            {intl.formatMessage(m.failedNoResults)}
          </p>
        </div>
        {onRetry ? (
          <Button variant="outline" size="sm" disabled={isRetrying} onClick={onRetry}>
            {intl.formatMessage(m.retryScan)}
          </Button>
        ) : null}
      </div>
      {lastSuccessfulAt ? (
        <p className="text-pretty text-sm">
          {intl.formatMessage(m.lastCompleted, {
            date: intl.formatDate(lastSuccessfulAt, { dateStyle: "medium", timeStyle: "short" }),
          })}
        </p>
      ) : null}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{intl.formatMessage(m.attemptedAt)}</dt>
          <dd className="tabular-nums">
            {intl.formatDate(attemptedAt, { dateStyle: "medium", timeStyle: "short" })}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">{intl.formatMessage(m.trigger)}</dt>
          <dd>
            {intl.formatMessage(
              report.trigger === "scheduled" ? m.triggerScheduled : m.triggerManual,
            )}
          </dd>
        </div>
      </dl>
      <details className="border-t border-border pt-3 text-sm">
        <summary className="w-fit cursor-pointer font-medium">
          {intl.formatMessage(m.technicalDetails)}
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-x-3">
            <span className="text-muted-foreground">{intl.formatMessage(m.failureCode)}</span>
            <code className="break-all">{report.errorCode ?? "qa_scan_failed"}</code>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-muted-foreground">{intl.formatMessage(m.runId)}</span>
            <code className="select-all break-all">{report.id}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(report.id).then(
                  () => setCopyState("copied"),
                  () => setCopyState("failed"),
                );
              }}
            >
              {intl.formatMessage(copyState === "copied" ? m.copiedRunId : m.copyRunId)}
            </Button>
            {copyState === "failed" ? (
              <span role="status">{intl.formatMessage(m.copyRunIdFailed)}</span>
            ) : null}
          </div>
        </div>
      </details>
    </section>
  );
}

export function QaNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const intl = useIntl();
  return (
    <Alert>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {intl.formatMessage(m.retry)}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
export function QaRunStatus({
  report,
  onRetry,
  isRetrying,
  lastSuccessfulAt,
  compact,
}: {
  report?: RunStatusReport;
  onRetry?: () => void;
  isRetrying?: boolean;
  lastSuccessfulAt?: string | null;
  compact?: boolean;
}) {
  const intl = useIntl();
  if (!report) return <QaNotice message={intl.formatMessage(m.notScanned)} />;
  if (report.status === "failed")
    return (
      <QaFailureStatus
        report={report}
        onRetry={onRetry}
        isRetrying={isRetrying}
        lastSuccessfulAt={lastSuccessfulAt}
        compact={compact}
      />
    );
  if (report.status !== "succeeded")
    return (
      <div role="status">
        <QaNotice message={intl.formatMessage(m.running)} />
      </div>
    );
  const skipped = Object.entries(report.summary.skippedChecksByLocale ?? {})
    .map(
      ([locale, checks]) =>
        `${locale}: ${checks.map((check) => intl.formatMessage(check === "spelling" ? m.spelling : m.check)).join(", ")}`,
    )
    .join("; ");
  return (
    <div className="flex flex-col gap-2" role="status">
      <p className="text-sm tabular-nums">
        {intl.formatMessage(m.summary, {
          segments: report.segmentCount,
          errors: report.errorCount,
          warnings: report.warningCount,
        })}
      </p>
      {report.completedAt ? (
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage(m.lastChecked, {
            date: intl.formatDate(report.completedAt, { dateStyle: "medium", timeStyle: "short" }),
          })}
        </p>
      ) : null}
      {skipped ? <QaNotice message={intl.formatMessage(m.skipped, { checks: skipped })} /> : null}
      {!report.summary.checkVersion ? <QaNotice message={intl.formatMessage(m.legacy)} /> : null}
    </div>
  );
}
