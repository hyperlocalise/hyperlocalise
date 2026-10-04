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
import { useQuery } from "@tanstack/react-query";

import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { createWorkspaceQaReportClient, type WorkspaceQaReportRow } from "./qa-report-client";

const QA_REPORTS_STALE_TIME_MS = 60_000;
const QA_IN_PROGRESS_REFETCH_MS = 2000;

export function workspaceQaReportsQueryKey(organizationSlug: string) {
  return ["workspace-qa-reports", organizationSlug] as const;
}

export function workspaceQaReportsRefetchInterval(
  rows: WorkspaceQaReportRow[] | undefined,
): number | false {
  return rows?.some((row) => ["running", "queued"].includes(row.report?.status ?? ""))
    ? QA_IN_PROGRESS_REFETCH_MS
    : false;
}

export function useWorkspaceQaReports(
  organizationSlug: string,
  options: {
    enabled?: boolean;
    staleTime?: number;
    refetchInterval?: (rows: WorkspaceQaReportRow[] | undefined) => number | false;
  } = {},
) {
  const { client } = useGoSvcClient();
  const api = useMemo(() => createWorkspaceQaReportClient(client), [client]);
  const { refetchInterval } = options;

  return useQuery({
    queryKey: workspaceQaReportsQueryKey(organizationSlug),
    queryFn: () => api.listReports({ param: { organizationSlug } }),
    enabled: Boolean(organizationSlug) && (options.enabled ?? true),
    staleTime: options.staleTime ?? QA_REPORTS_STALE_TIME_MS,
    refetchInterval: (query) =>
      (refetchInterval ?? workspaceQaReportsRefetchInterval)(query.state.data?.reports),
  });
}

export type QaAttention = {
  errors: number;
  projectsWithErrors: number;
  failedScans: number;
};

function latestCompletedErrorCount(row: WorkspaceQaReportRow): number {
  if (row.report?.status === "succeeded") return row.report.errorCount;
  return row.previousSuccessful?.errorCount ?? 0;
}

/** Errors come from each project's latest successful scan, even if a later scan is running or failed. */
export function summarizeQaAttention(
  rows: WorkspaceQaReportRow[] | undefined,
  projectId?: string,
): QaAttention {
  const attention: QaAttention = { errors: 0, projectsWithErrors: 0, failedScans: 0 };
  for (const row of rows ?? []) {
    if (projectId && row.projectId !== projectId) continue;
    if (row.report?.status === "failed") attention.failedScans += 1;
    const errors = latestCompletedErrorCount(row);
    if (errors > 0) {
      attention.errors += errors;
      attention.projectsWithErrors += 1;
    }
  }
  return attention;
}
