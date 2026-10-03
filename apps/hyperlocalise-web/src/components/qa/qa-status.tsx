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
import { useIntl } from "react-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { qaMessages as m } from "./qa.messages";
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
}: {
  report?: {
    status: string;
    segmentCount: number;
    errorCount: number;
    warningCount: number;
    completedAt: string | null;
    summary: { checkVersion?: number; skippedChecksByLocale?: Record<string, string[]> };
  };
  onRetry?: () => void;
}) {
  const intl = useIntl();
  if (!report) return <QaNotice message={intl.formatMessage(m.notScanned)} />;
  if (report.status === "failed")
    return <QaNotice message={intl.formatMessage(m.failed)} onRetry={onRetry} />;
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
