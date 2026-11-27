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
"use client";

import { DownloadSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiResponseError } from "@/lib/api-error";
import type { GoSvcDownload } from "@/lib/go-svc/go-svc-client.types";
import { cn } from "@/lib/primitives/cn";

import { reportsPageMessages as messages } from "./reports-page.messages";
import { isRefusedRead } from "./reports-queries";

/** A panel of the Reports page: a title, an optional note, actions, and its content. */
export function ReportSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col gap-4", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          {title ? (
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-medium text-foreground">{title}</h2>
              {description ? (
                <p className="text-[13px] text-muted-foreground">{description}</p>
              ) : null}
            </div>
          ) : null}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function failureMessage(error: unknown, kept: boolean) {
  if (kept) return messages.refreshFailed;
  const code = error instanceof ApiResponseError ? error.code : null;
  if (code === "reports_busy") return messages.reportsBusy;
  if (code === "report_timed_out") return messages.reportTooSlow;
  return messages.loadFailed;
}

/** A failed read, with a way to try again. `kept` says figures from earlier are on screen. */
export function ReportLoadFailed({
  error,
  kept = false,
  retry,
}: {
  error?: unknown;
  kept?: boolean;
  retry: () => unknown;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[13px]"
    >
      <WarningCircleIcon aria-hidden className="size-3.5 shrink-0 text-destructive" />
      <p className="min-w-0 flex-1 text-foreground">
        <FormattedMessage {...failureMessage(error, kept)} />
      </p>
      <Button size="sm" variant="ghost" onClick={() => void retry()}>
        <FormattedMessage {...messages.retry} />
      </Button>
    </div>
  );
}

/**
 * A section's loading, failed and empty states, or its content once loaded. A reload that fails
 * keeps what was loaded under the failure, so a slow moment after a save takes nothing away,
 * unless go-svc refused it.
 */
export function ReportSectionState<T>({
  query,
  isEmpty,
  skeletonHeight = 160,
  showFailure = true,
  children,
}: {
  query: {
    data: T | undefined;
    isPending: boolean;
    isError: boolean;
    error?: unknown;
    refetch: () => unknown;
  };
  isEmpty?: (data: T) => boolean;
  skeletonHeight?: number;
  /**
   * Whether this wrapper says the query failed. Several wrappers of one query leave it to the
   * first, so a failed reload does not stack the same warning.
   */
  showFailure?: boolean;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending && query.data === undefined)
    return <Skeleton className="w-full rounded-xl" style={{ height: skeletonHeight }} />;
  if (query.data === undefined || (query.isError && isRefusedRead(query.error)))
    return showFailure ? <ReportLoadFailed error={query.error} retry={query.refetch} /> : null;
  return (
    <>
      {showFailure && query.isError ? <ReportLoadFailed kept retry={query.refetch} /> : null}
      {isEmpty?.(query.data) ? <ReportEmpty /> : children(query.data)}
    </>
  );
}

export function ReportEmpty({ title, description }: { title?: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-6 py-8 text-center">
      <p className="text-[13px] font-medium text-foreground">
        {title ?? <FormattedMessage {...messages.noDataTitle} />}
      </p>
      <p className="text-[13px] text-muted-foreground">
        {description ?? <FormattedMessage {...messages.noData} />}
      </p>
    </div>
  );
}

/** Previous and Next under a paged table. */
export function ReportPager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground">
      <span>
        <FormattedMessage {...messages.showingRows} values={{ from: first, to: last, total }} />
      </span>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <FormattedMessage {...messages.previousPage} />
        </Button>
        <Button variant="ghost" size="sm" disabled={last >= total} onClick={() => onPage(page + 1)}>
          <FormattedMessage {...messages.nextPage} />
        </Button>
      </div>
    </div>
  );
}

const DOWNLOAD_RELEASE_MS = 40_000;

/**
 * A button that downloads a table as CSV. The file is fetched with the viewer's sign-in and
 * then saved, so a report that go-svc refuses or cannot finish in time says so instead.
 */
export function DownloadCsvButton({ download }: { download: () => Promise<GoSvcDownload> }) {
  const [pending, setPending] = useState(false);
  const run = async () => {
    setPending(true);
    try {
      saveReportDownload(await download());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => void run()}>
      {pending ? (
        <Spinner data-icon="inline-start" aria-hidden className="size-3.5" />
      ) : (
        <DownloadSimpleIcon
          data-icon="inline-start"
          aria-hidden
          className="size-3.5 text-muted-foreground"
        />
      )}
      <FormattedMessage {...messages.downloadCsv} />
    </Button>
  );
}

export function saveReportDownload(file: GoSvcDownload) {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename ?? "report.csv";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Released well after the click: some browsers cancel a download whose file goes too soon.
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_RELEASE_MS);
}
