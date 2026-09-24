/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { apiClient } from "@/lib/api-client-instance";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";

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
type StartScanInput = { param: ProjectParams };

function pageQuery(query: PageQuery) {
  return {
    ...(query.limit ? { limit: Number(query.limit) } : {}),
    ...(query.offset ? { offset: Number(query.offset) } : {}),
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

export function createProjectQaReportClient(goSvcClient: GoSvcClient) {
  return {
    listReports: ({ param }: { param: ProjectParams }) =>
      goSvcClient.qaReport.project.list(param.organizationSlug, param.projectId) as Promise<{
        reports: ProjectQaReport[];
        settings: {
          cadence: "off" | "daily";
          lastRunAt: string | null;
          canRun: boolean;
          canManageSchedule: boolean;
        };
      }>,

    startScan: async ({ param }: StartScanInput) =>
      apiClient.api.orgs[":organizationSlug"].projects[":projectId"]["qa-reports"].$post({
        param,
      }) as Promise<QaReportResponse<{ report: ProjectQaReport }>>,

    updateSettings: ({
      param,
      json,
    }: {
      param: ProjectParams;
      json: { cadence: "off" | "daily" };
    }) =>
      goSvcClient.qaReport.project.updateSettings(
        param.organizationSlug,
        param.projectId,
        json,
      ) as Promise<{
        settings: {
          cadence: "off" | "daily";
          lastRunAt: string | null;
          canRun: boolean;
          canManageSchedule: boolean;
        };
      }>,

    getRun: ({
      param,
      query = {},
    }: {
      param: RunParams;
      query?: PageQuery & { locale?: string; checkType?: string; severity?: string };
    }) =>
      goSvcClient.qaReport.project.get(param.organizationSlug, param.projectId, param.runId, {
        ...pageQuery(query),
        ...(query.locale ? { locale: query.locale } : {}),
        ...(query.checkType ? { checkType: query.checkType } : {}),
        ...(query.severity ? { severity: query.severity } : {}),
      }) as Promise<{
        report: ProjectQaReport;
        findings: ProjectQaFinding[];
        total: number;
        limit: number;
        offset: number;
      }>,

    latestFindings: ({
      param,
      query,
    }: {
      param: ProjectParams;
      query: PageQuery & { locale: string; sourcePath?: string };
    }) =>
      goSvcClient.qaReport.project.latestFindings(param.organizationSlug, param.projectId, {
        ...pageQuery(query),
        locale: query.locale,
        ...(query.sourcePath ? { sourcePath: query.sourcePath } : {}),
      }) as Promise<{
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
      }>,

    promoteFindings: ({ param, json }: { param: ProjectParams; json: { findingIds: string[] } }) =>
      goSvcClient.qaReport.project.promoteFindings(
        param.organizationSlug,
        param.projectId,
        json,
      ) as Promise<{
        results: Array<{
          findingId: string;
          issueId: string;
          identifier: string;
          created: boolean;
        }>;
      }>,
  };
}

export function createWorkspaceQaReportClient(goSvcClient: GoSvcClient) {
  return {
    listReports: ({ param }: { param: OrgParams }) =>
      goSvcClient.qaReport.list(param.organizationSlug) as Promise<{
        reports: WorkspaceQaReportRow[];
      }>,

    listFindings: ({ param, query = {} }: { param: OrgParams; query?: WorkspaceFindingsQuery }) =>
      goSvcClient.qaReport.findings.list(param.organizationSlug, {
        ...pageQuery(query),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.locale ? { locale: query.locale } : {}),
        ...(query.checkType ? { checkType: query.checkType } : {}),
        ...(query.severity ? { severity: query.severity } : {}),
      }) as Promise<{
        findings: WorkspaceQaFinding[];
        total: number;
        limit: number;
        offset: number;
      }>,

    promoteFindings: ({ param, json }: { param: OrgParams; json: { findingIds: string[] } }) =>
      goSvcClient.qaReport.findings.promote(param.organizationSlug, json) as Promise<{
        results: Array<{
          findingId: string;
          issueId: string;
          identifier: string;
          created: boolean;
        }>;
      }>,
  };
}
