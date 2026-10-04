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

export function workspaceQaReportsQueryKey(organizationSlug: string) {
  return ["workspace-qa-reports", organizationSlug] as const;
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
    refetchInterval: refetchInterval
      ? (query) => refetchInterval(query.state.data?.reports)
      : undefined,
  });
}

export type QaAttention = {
  errors: number;
  projectsWithErrors: number;
  failedScans: number;
};

/** Errors come from each project's latest completed scan; failed or running scans carry no counts. */
export function summarizeQaAttention(
  rows: WorkspaceQaReportRow[] | undefined,
  projectId?: string,
): QaAttention {
  const attention: QaAttention = { errors: 0, projectsWithErrors: 0, failedScans: 0 };
  for (const row of rows ?? []) {
    if (projectId && row.projectId !== projectId) continue;
    if (row.report?.status === "failed") attention.failedScans += 1;
    if (row.report?.status === "succeeded" && row.report.errorCount > 0) {
      attention.errors += row.report.errorCount;
      attention.projectsWithErrors += 1;
    }
  }
  return attention;
}
