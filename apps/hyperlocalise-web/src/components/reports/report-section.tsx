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

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import { toast } from "sonner";

import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { GoSvcDownload } from "@/lib/go-svc/go-svc-client.types";
import { cn } from "@/lib/primitives/cn";

import { reportsPageMessages as messages } from "./reports-page.messages";

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
    <section
      aria-label={title}
      className={cn("flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5", className)}
    >
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          {title ? (
            <div className="flex flex-col gap-1">
              <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
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

/** A section's loading, failed and empty states, or its content once loaded. */
export function ReportSectionState<T>({
  query,
  isEmpty,
  skeletonHeight = 160,
  children,
}: {
  query: { data: T | undefined; isPending: boolean; isError: boolean; refetch: () => unknown };
  isEmpty?: (data: T) => boolean;
  skeletonHeight?: number;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending && query.data === undefined)
    return <Skeleton className="w-full rounded-xl" style={{ height: skeletonHeight }} />;
  if (query.isError || query.data === undefined)
    return (
      <Alert variant="destructive">
        <WarningCircleIcon />
        <AlertDescription>
          <FormattedMessage {...messages.loadFailed} />
        </AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            <FormattedMessage {...messages.retry} />
          </Button>
        </AlertAction>
      </Alert>
    );
  if (isEmpty?.(query.data)) return <ReportEmpty />;
  return <>{children(query.data)}</>;
}

export function ReportEmpty({ title, description }: { title?: string; description?: string }) {
  return (
    <Empty className="border border-dashed border-border">
      <EmptyHeader>
        <EmptyTitle>{title ?? <FormattedMessage {...messages.noDataTitle} />}</EmptyTitle>
        <EmptyDescription>
          {description ?? <FormattedMessage {...messages.noData} />}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
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
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <FormattedMessage {...messages.previousPage} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={last >= total}
          onClick={() => onPage(page + 1)}
        >
          <FormattedMessage {...messages.nextPage} />
        </Button>
      </div>
    </div>
  );
}

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
    <Button variant="outline" size="sm" disabled={pending} onClick={() => void run()}>
      {pending ? <Spinner className="size-3.5" /> : null}
      <FormattedMessage {...messages.downloadCsv} />
    </Button>
  );
}

function saveReportDownload(file: GoSvcDownload) {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename ?? "report.csv";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Released after the click has started the download; some browsers cancel it otherwise.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
