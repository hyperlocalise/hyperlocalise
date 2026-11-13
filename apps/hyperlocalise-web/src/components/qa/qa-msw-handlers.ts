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
import { delay, http, HttpResponse } from "msw";

import type { ProjectQaReport, WorkspaceQaFinding } from "@/lib/qa/qa-report-client";

import {
  createQaProjectSettings,
  createQaReport,
  qaCleanReport,
  qaOlderReport,
  qaPartialReport,
  qaProjectFindings,
  qaProjectSettings,
  qaRunningReport,
  qaWebsiteProjectId,
  qaWebsiteReport,
  qaWhitespaceFinding,
  qaWorkspaceFindings,
  qaWorkspaceReports,
} from "./qa.fixture";

type QaSettings = ReturnType<typeof createQaProjectSettings>;

type QaHandlerOptions = {
  workspaceReports?: typeof qaWorkspaceReports;
  workspaceFindings?: WorkspaceQaFinding[];
  projectReports?: ProjectQaReport[];
  projectFindings?: WorkspaceQaFinding[];
  settings?: QaSettings;
  wait?: "infinite";
  listError?: "error" | "unsupported";
  findingsError?: boolean;
  startScanError?: boolean;
  settingsError?: boolean;
  firstPageSize?: number;
};

function matchesFinding(finding: WorkspaceQaFinding, url: URL) {
  const projectId = url.searchParams.get("projectId");
  const locale = url.searchParams.get("locale");
  const checkType = url.searchParams.get("checkType");
  const severity = url.searchParams.get("severity");
  const status = url.searchParams.get("status");
  if (projectId && projectId !== "all" && finding.projectId !== projectId) return false;
  if (locale && locale !== "all" && finding.targetLocale !== locale) return false;
  if (checkType && checkType !== "all" && finding.checkType !== checkType) return false;
  if (severity && severity !== "all" && finding.severity !== severity) return false;
  if (status && status !== "all" && (finding.status ?? "open") !== status) return false;
  return true;
}

function pageFindings(findings: WorkspaceQaFinding[], url: URL, firstPageSize?: number) {
  const matched = findings.filter((finding) => matchesFinding(finding, url));
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? matched.length);
  let page = matched.slice(offset, offset + limit);
  if (firstPageSize && offset === 0) {
    page = page.slice(0, firstPageSize);
  }
  return {
    findings: page.map((finding) => ({ ...finding })),
    total: matched.length,
    limit,
    offset,
  };
}

export function createQaMswHandlers({
  workspaceReports = qaWorkspaceReports,
  workspaceFindings = qaWorkspaceFindings,
  projectReports = [qaWebsiteReport],
  projectFindings = qaProjectFindings,
  settings = qaProjectSettings,
  wait,
  listError,
  findingsError = false,
  startScanError = false,
  settingsError = false,
  firstPageSize,
}: QaHandlerOptions = {}) {
  const reports = structuredClone(workspaceReports);
  let findings = structuredClone(workspaceFindings);
  let projectRows = structuredClone(projectReports);
  let projectRowsFindings = structuredClone(projectFindings);
  let projectSettings = structuredClone(settings);

  async function maybeWait() {
    if (wait === "infinite") {
      await delay("infinite");
    }
  }

  function listFailure() {
    if (listError === "unsupported") {
      return HttpResponse.json(
        {
          error: "qa_scan_not_supported",
          message: "QA reports are available for native projects",
        },
        { status: 400 },
      );
    }
    return HttpResponse.json(
      { error: "qa_unavailable", message: "QA reports are unavailable" },
      { status: 500 },
    );
  }

  return [
    http.get("*/v1/orgs/:organizationSlug/qa-reports/findings", async ({ request }) => {
      await maybeWait();
      if (findingsError) {
        return HttpResponse.json(
          { error: "qa_unavailable", message: "QA findings are unavailable" },
          { status: 500 },
        );
      }
      return HttpResponse.json(pageFindings(findings, new URL(request.url), firstPageSize));
    }),
    http.patch(
      "*/v1/orgs/:organizationSlug/qa-reports/findings/:findingId",
      async ({ params, request }) => {
        const body = (await request.json()) as { status?: "open" | "ignored"; reason?: string };
        const findingId = String(params.findingId);
        const apply = (row: WorkspaceQaFinding) =>
          row.id === findingId
            ? {
                ...row,
                status: body.status ?? row.status,
                ignoreReason: body.status === "ignored" ? (body.reason ?? "") : null,
              }
            : row;
        findings = findings.map(apply);
        projectRowsFindings = projectRowsFindings.map(apply);
        const updated = findings.find((row) => row.id === findingId);
        return HttpResponse.json({ finding: updated ?? null });
      },
    ),
    http.post("*/v1/orgs/:organizationSlug/qa-reports/findings/promote", async ({ request }) => {
      const body = (await request.json()) as { findingIds?: string[] };
      return HttpResponse.json(
        promote(body.findingIds ?? [], findings, (next) => {
          findings = next;
        }),
      );
    }),
    http.post(
      "*/v1/orgs/:organizationSlug/projects/:projectId/qa-reports/findings/promote",
      async ({ request }) => {
        const body = (await request.json()) as { findingIds?: string[] };
        return HttpResponse.json(
          promote(body.findingIds ?? [], projectRowsFindings, (next) => {
            projectRowsFindings = next;
          }),
        );
      },
    ),
    http.get(
      "*/v1/orgs/:organizationSlug/projects/:projectId/qa-reports/last-successful",
      async ({ request }) => {
        await maybeWait();
        const beforeRunId = new URL(request.url).searchParams.get("beforeRunId");
        const beforeIndex = projectRows.findIndex((row) => row.id === beforeRunId);
        const report =
          beforeIndex < 0
            ? undefined
            : projectRows.slice(beforeIndex).find((row) => row.status === "succeeded");
        return HttpResponse.json(report ?? null);
      },
    ),
    http.get(
      "*/v1/orgs/:organizationSlug/projects/:projectId/qa-reports/:runId",
      async ({ params, request }) => {
        await maybeWait();
        if (findingsError) {
          return HttpResponse.json(
            { error: "qa_unavailable", message: "QA findings are unavailable" },
            { status: 500 },
          );
        }
        const runId = String(params.runId);
        const report = projectRows.find((row) => row.id === runId);
        if (!report) {
          return HttpResponse.json({ error: "qa_run_not_found" }, { status: 404 });
        }
        const runFindings = projectRowsFindings.filter((row) => row.runId === runId);
        return HttpResponse.json({
          report,
          ...pageFindings(runFindings, new URL(request.url), firstPageSize),
        });
      },
    ),
    http.patch(
      "*/v1/orgs/:organizationSlug/projects/:projectId/qa-reports/settings",
      async ({ request }) => {
        if (settingsError) {
          return HttpResponse.json(
            { error: "qa_settings_failed", message: "Could not save QA settings" },
            { status: 500 },
          );
        }
        const body = (await request.json()) as {
          cadence?: "off" | "daily";
          checks?: QaSettings["checks"];
        };
        projectSettings = {
          ...projectSettings,
          ...(body.cadence ? { cadence: body.cadence } : {}),
          ...(body.checks ? { checks: body.checks } : {}),
        };
        return HttpResponse.json({ settings: projectSettings });
      },
    ),
    http.get("*/v1/orgs/:organizationSlug/projects/:projectId/qa-reports", async () => {
      await maybeWait();
      if (listError) return listFailure();
      return HttpResponse.json({
        reports: projectRows,
        settings: projectSettings,
      });
    }),
    http.get("*/v1/orgs/:organizationSlug/qa-reports", async () => {
      await maybeWait();
      if (listError) return listFailure();
      return HttpResponse.json({ reports });
    }),
    http.post("*/api/orgs/:organizationSlug/projects/:projectId/qa-reports", async () => {
      if (startScanError) {
        return HttpResponse.json({ error: "scan_failed" }, { status: 500 });
      }
      const started = createQaReport({
        id: "run_started",
        projectId: qaWebsiteProjectId,
        status: "running",
        segmentCount: qaWebsiteReport.segmentCount,
        createdAt: "2026-10-03T00:00:00.000Z",
        startedAt: "2026-10-03T00:00:00.000Z",
      });
      projectRows = [started, ...projectRows];
      return HttpResponse.json({ report: started });
    }),
  ];
}

function promote(
  ids: string[],
  findings: WorkspaceQaFinding[],
  replace: (next: WorkspaceQaFinding[]) => void,
) {
  const results = ids.map((findingId, index) => ({
    findingId,
    issueId: `issue_${index + 1}`,
    identifier: `WEB-${21 + index}`,
    created: true,
  }));
  const identifiers = new Map(results.map((result) => [result.findingId, result.identifier]));
  replace(
    findings.map((row) =>
      identifiers.has(row.id) ? { ...row, issueIdentifier: identifiers.get(row.id) } : row,
    ),
  );
  return { results };
}

export const qaWorkspaceMswHandlers = createQaMswHandlers();

export const qaWorkspaceEmptyMswHandlers = createQaMswHandlers({
  workspaceReports: [],
  workspaceFindings: [],
});

export const qaWorkspaceLoadingMswHandlers = createQaMswHandlers({ wait: "infinite" });

export const qaWorkspaceErrorMswHandlers = createQaMswHandlers({ listError: "error" });

export const qaWorkspaceFindingsErrorMswHandlers = createQaMswHandlers({ findingsError: true });

export const qaWorkspaceLoadMoreMswHandlers = createQaMswHandlers({ firstPageSize: 1 });

export const qaWorkspaceWhitespaceMswHandlers = createQaMswHandlers({
  workspaceFindings: [qaWhitespaceFinding],
});

export const qaProjectMswHandlers = createQaMswHandlers();

export const qaProjectCleanMswHandlers = createQaMswHandlers({
  projectReports: [qaCleanReport],
  projectFindings: [],
});

export const qaProjectRunningMswHandlers = createQaMswHandlers({
  projectReports: [{ ...qaRunningReport, projectId: qaWebsiteProjectId }],
  projectFindings: [],
});

export const qaProjectFailedMswHandlers = createQaMswHandlers({
  projectReports: [
    createQaReport({
      id: "run_failed",
      projectId: qaWebsiteProjectId,
      status: "failed",
      errorCode: "qa_scan_processing_failed",
      errorMessage: "private source text must not appear in the UI",
      createdAt: "2026-10-02T08:00:00.000Z",
      completedAt: "2026-10-02T08:01:00.000Z",
    }),
    createQaReport({
      id: "run_previous_success",
      projectId: qaWebsiteProjectId,
      status: "succeeded",
      createdAt: "2026-10-01T08:00:00.000Z",
      completedAt: "2026-10-01T08:04:00.000Z",
    }),
  ],
  projectFindings: [],
});

export const qaProjectNotScannedMswHandlers = createQaMswHandlers({
  projectReports: [],
  projectFindings: [],
  settings: createQaProjectSettings({ cadence: "off", lastRunAt: null }),
});

export const qaProjectUnsupportedMswHandlers = createQaMswHandlers({
  listError: "unsupported",
});

export const qaProjectErrorMswHandlers = createQaMswHandlers({ listError: "error" });

export const qaProjectFindingsErrorMswHandlers = createQaMswHandlers({ findingsError: true });

export const qaProjectPartialMswHandlers = createQaMswHandlers({
  projectReports: [qaPartialReport],
  projectFindings: [],
});

export const qaProjectHistoryMswHandlers = createQaMswHandlers({
  projectReports: [qaWebsiteReport, qaOlderReport],
});

export const qaProjectLoadingMswHandlers = createQaMswHandlers({ wait: "infinite" });

export const qaProjectSettingsErrorMswHandlers = createQaMswHandlers({
  settingsError: true,
  settings: createQaProjectSettings({ cadence: "off" }),
});

export const qaProjectRunErrorMswHandlers = createQaMswHandlers({ startScanError: true });

export const qaProjectLockedMswHandlers = createQaMswHandlers({
  settings: createQaProjectSettings({ canRun: false, canManageSchedule: false }),
});
