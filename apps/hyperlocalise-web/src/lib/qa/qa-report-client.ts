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
import { apiClient } from "@/lib/api-client-instance";

type OrgParams = { organizationSlug: string };
type ProjectParams = OrgParams & { projectId: string };
type RunParams = ProjectParams & { runId: string };
type PageQuery = { limit?: string; offset?: string };
type WorkspaceFindingsQuery = PageQuery & {
  projectId?: string;
  locale?: string;
  checkType?: string;
  severity?: string;
};

type QaReportResponse<T> = Omit<Response, "json"> & { json(): Promise<T> };
type RequestInput<P, B, Q> = { param: P } & ([B] extends [never] ? {} : { json: B }) &
  ([Q] extends [never] ? {} : { query?: Q });

function endpoint<P extends OrgParams, B, Q, T>(method: string, path: string) {
  return async (input: RequestInput<P, B, Q>): Promise<QaReportResponse<T>> => {
    const pathname = path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      const value = (input.param as Record<string, string>)[key];
      if (!value) throw new Error(`Missing QA report path parameter: ${key}`);
      return encodeURIComponent(value);
    });
    const search = new URLSearchParams();
    if ("query" in input && input.query) {
      for (const [key, value] of Object.entries(input.query)) {
        if (typeof value === "string") search.set(key, value);
      }
    }
    const query = search.size ? `?${search}` : "";
    return fetch(
      `/api/go-svc/v1/orgs/:organizationSlug${pathname}`.replace(
        ":organizationSlug",
        encodeURIComponent(input.param.organizationSlug),
      ) + query,
      {
        method,
        credentials: "same-origin",
        ...("json" in input
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.json) }
          : {}),
      },
    ) as Promise<QaReportResponse<T>>;
  };
}

export type WorkspaceQaReportRow = {
  projectId: string;
  projectName: string;
  cadence: "off" | "daily";
  lastRunAt: string | null;
  report: {
    id: string;
    projectId: string;
    trigger: string;
    status: string;
    segmentCount: number;
    findingCount: number;
    errorCount: number;
    warningCount: number;
    summary: {
      byCheckType: Record<string, number>;
      bySeverity: Record<string, number>;
      byLocale: Record<string, number>;
    };
    errorCode: string | null;
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
  } | null;
};

export type WorkspaceQaFinding = {
  id: string;
  runId: string;
  projectId: string;
  projectName: string;
  key: string;
  sourcePath: string | null;
  targetLocale: string;
  checkType: string;
  severity: "error" | "warning";
  category: string;
  message: string;
  relatedTokens: string[];
  sourceText: string;
  targetText: string;
  editorHref: string;
};

export type ProjectQaReport = {
  id: string;
  projectId: string;
  trigger: string;
  status: string;
  segmentCount: number;
  findingCount: number;
  errorCount: number;
  warningCount: number;
  summary: {
    byCheckType: Record<string, number>;
    bySeverity: Record<string, number>;
    byLocale: Record<string, number>;
  };
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type ProjectQaFinding = {
  id: string;
  runId: string;
  projectId: string;
  key: string;
  sourcePath: string | null;
  targetLocale: string;
  checkType: string;
  severity: "error" | "warning";
  category: string;
  message: string;
  relatedTokens: string[];
  sourceText: string;
  targetText: string;
  editorHref: string;
};

export const projectQaReportClient = {
  listReports: endpoint<
    ProjectParams,
    never,
    never,
    {
      reports: ProjectQaReport[];
      settings: {
        cadence: "off" | "daily";
        lastRunAt: string | null;
        canRun: boolean;
        canManageSchedule: boolean;
      };
    }
  >("GET", "/projects/:projectId/qa-reports"),
  startScan: async (input: RequestInput<ProjectParams, never, never>) =>
    apiClient.api.orgs[":organizationSlug"].projects[":projectId"]["qa-reports"].$post({
      param: input.param,
    }) as Promise<QaReportResponse<{ report: ProjectQaReport }>>,
  updateSettings: endpoint<
    ProjectParams,
    { cadence: "off" | "daily" },
    never,
    {
      settings: {
        cadence: "off" | "daily";
        lastRunAt: string | null;
        canRun: boolean;
        canManageSchedule: boolean;
      };
    }
  >("PATCH", "/projects/:projectId/qa-reports/settings"),
  getRun: endpoint<
    RunParams,
    never,
    PageQuery & { locale?: string; checkType?: string; severity?: string },
    {
      report: ProjectQaReport;
      findings: ProjectQaFinding[];
      total: number;
      limit: number;
      offset: number;
    }
  >("GET", "/projects/:projectId/qa-reports/:runId"),
  latestFindings: endpoint<
    ProjectParams,
    never,
    PageQuery & { locale: string; sourcePath?: string },
    {
      runId: string | null;
      findings: Array<{
        translationKeyId: string | null;
        key: string;
        sourcePath: string | null;
        targetLocale: string;
        checkType: string;
        severity: "error" | "warning";
        category: string;
        message: string;
        relatedTokens: string[];
        sourceText: string;
        targetText: string;
      }>;
    }
  >("GET", "/projects/:projectId/qa-reports/latest-findings"),
  promoteFindings: endpoint<
    ProjectParams,
    { findingIds: string[] },
    never,
    { results: Array<{ findingId: string; issueId: string; identifier: string; created: boolean }> }
  >("POST", "/projects/:projectId/qa-reports/findings/promote"),
};

export const workspaceQaReportClient = {
  listReports: endpoint<OrgParams, never, never, { reports: WorkspaceQaReportRow[] }>(
    "GET",
    "/qa-reports",
  ),
  listFindings: endpoint<
    OrgParams,
    never,
    WorkspaceFindingsQuery,
    { findings: WorkspaceQaFinding[]; total: number; limit: number; offset: number }
  >("GET", "/qa-reports/findings"),
  promoteFindings: endpoint<
    OrgParams,
    { findingIds: string[] },
    never,
    { results: Array<{ findingId: string; issueId: string; identifier: string; created: boolean }> }
  >("POST", "/qa-reports/findings/promote"),
};
