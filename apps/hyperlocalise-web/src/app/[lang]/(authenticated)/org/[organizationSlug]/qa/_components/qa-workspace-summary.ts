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
import type { WorkspaceQaReportRow } from "@/lib/qa/qa-report-client";

export type QaWorkspaceProjectState = "scanned" | "failed" | "running" | "not_scanned";

export type QaWorkspaceProjectSummary = {
  projectId: string;
  projectName: string;
  state: QaWorkspaceProjectState;
  cadence: WorkspaceQaReportRow["cadence"];
  errors: number;
  warnings: number;
};

export type QaWorkspaceBreakdownRow = { value: string; findings: number };

export type QaWorkspaceSummary = {
  errors: number;
  warnings: number;
  /** Change across projects that have a previous completed scan; undefined when none does. */
  errorsChange: number | undefined;
  warningsChange: number | undefined;
  segments: number;
  projectCount: number;
  stateCounts: Record<QaWorkspaceProjectState, number>;
  locales: QaWorkspaceBreakdownRow[];
  checks: QaWorkspaceBreakdownRow[];
  projects: QaWorkspaceProjectSummary[];
};

const STATE_RANK: Record<QaWorkspaceProjectState, number> = {
  failed: 0,
  scanned: 1,
  running: 2,
  not_scanned: 3,
};

function projectState(row: WorkspaceQaReportRow): QaWorkspaceProjectState {
  if (!row.report) return "not_scanned";
  if (row.report.status === "succeeded") return "scanned";
  if (row.report.status === "failed") return "failed";
  return "running";
}

function addCounts(target: Map<string, number>, counts: Record<string, number>) {
  for (const [key, value] of Object.entries(counts)) {
    target.set(key, (target.get(key) ?? 0) + value);
  }
}

function toBreakdown(counts: Map<string, number>): QaWorkspaceBreakdownRow[] {
  return [...counts.entries()]
    .filter(([, findings]) => findings > 0)
    .map(([value, findings]) => ({ value, findings }))
    .toSorted((a, b) => b.findings - a.findings || a.value.localeCompare(b.value));
}

/**
 * Totals and breakdowns only count projects whose latest scan succeeded. Rows for
 * failed or running scans do not carry the counts of their last completed scan.
 */
export function summarizeWorkspaceQa(reports: WorkspaceQaReportRow[]): QaWorkspaceSummary {
  const stateCounts: Record<QaWorkspaceProjectState, number> = {
    scanned: 0,
    failed: 0,
    running: 0,
    not_scanned: 0,
  };
  const locales = new Map<string, number>();
  const checks = new Map<string, number>();
  let errors = 0;
  let warnings = 0;
  let segments = 0;
  let comparedErrors = 0;
  let comparedWarnings = 0;
  let previousErrors = 0;
  let previousWarnings = 0;
  let hasPrevious = false;

  const projects = reports.map((row): QaWorkspaceProjectSummary => {
    const state = projectState(row);
    stateCounts[state] += 1;
    const report = state === "scanned" ? row.report : null;
    if (report) {
      errors += report.errorCount;
      warnings += report.warningCount;
      segments += report.segmentCount;
      if (row.previousSuccessful) {
        hasPrevious = true;
        comparedErrors += report.errorCount;
        comparedWarnings += report.warningCount;
        previousErrors += row.previousSuccessful.errorCount;
        previousWarnings += row.previousSuccessful.warningCount;
      }
      addCounts(locales, report.summary.byLocale);
      addCounts(checks, report.summary.byCheckType);
    }
    return {
      projectId: row.projectId,
      projectName: row.projectName,
      state,
      cadence: row.cadence,
      errors: report?.errorCount ?? 0,
      warnings: report?.warningCount ?? 0,
    };
  });

  return {
    errors,
    warnings,
    errorsChange: hasPrevious ? comparedErrors - previousErrors : undefined,
    warningsChange: hasPrevious ? comparedWarnings - previousWarnings : undefined,
    segments,
    projectCount: reports.length,
    stateCounts,
    locales: toBreakdown(locales),
    checks: toBreakdown(checks),
    projects: projects.toSorted(
      (a, b) =>
        STATE_RANK[a.state] - STATE_RANK[b.state] ||
        b.errors - a.errors ||
        b.warnings - a.warnings ||
        a.projectName.localeCompare(b.projectName),
    ),
  };
}
