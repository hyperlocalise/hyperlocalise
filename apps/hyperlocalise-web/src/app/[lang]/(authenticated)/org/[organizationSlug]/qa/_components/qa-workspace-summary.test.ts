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
import { describe, expect, it } from "vite-plus/test";

import { createQaReport, qaWorkspaceReports } from "@/components/qa/qa.fixture";
import type { WorkspaceQaReportRow } from "@/lib/qa/qa-report-client";

import { summarizeWorkspaceQa } from "./qa-workspace-summary";

function scannedRow(
  projectId: string,
  projectName: string,
  counts: {
    errors: number;
    warnings: number;
    segments: number;
    byLocale: Record<string, number>;
    byCheckType: Record<string, number>;
  },
): WorkspaceQaReportRow {
  return {
    projectId,
    projectName,
    cadence: "off",
    lastRunAt: "2026-10-01T08:04:00.000Z",
    lastSuccessfulAt: "2026-10-01T08:04:00.000Z",
    report: createQaReport({
      id: `run_${projectId}`,
      projectId,
      status: "succeeded",
      segmentCount: counts.segments,
      errorCount: counts.errors,
      warningCount: counts.warnings,
      findingCount: counts.errors + counts.warnings,
      summary: {
        byCheckType: counts.byCheckType,
        bySeverity: {},
        byLocale: counts.byLocale,
      },
    }),
  };
}

describe("summarizeWorkspaceQa", () => {
  it("totals only projects whose latest scan succeeded", () => {
    const summary = summarizeWorkspaceQa(qaWorkspaceReports);

    expect(summary).toMatchObject({
      errors: 2,
      warnings: 3,
      segments: 128,
      projectCount: 4,
      stateCounts: { scanned: 1, failed: 1, running: 1, not_scanned: 1 },
    });
  });

  it("merges locale and check breakdowns across projects, largest first", () => {
    const summary = summarizeWorkspaceQa([
      scannedRow("a", "Alpha", {
        errors: 1,
        warnings: 2,
        segments: 10,
        byLocale: { "de-DE": 2, "fr-FR": 1 },
        byCheckType: { spelling: 2, length: 1 },
      }),
      scannedRow("b", "Beta", {
        errors: 3,
        warnings: 0,
        segments: 20,
        byLocale: { "fr-FR": 3, "ja-JP": 0 },
        byCheckType: { length: 3 },
      }),
    ]);

    expect(summary.locales).toEqual([
      { value: "fr-FR", findings: 4 },
      { value: "de-DE", findings: 2 },
    ]);
    expect(summary.checks).toEqual([
      { value: "length", findings: 4 },
      { value: "spelling", findings: 2 },
    ]);
  });

  it("orders projects by attention: failed, then most errors, then in progress and unscanned", () => {
    const summary = summarizeWorkspaceQa([
      ...qaWorkspaceReports,
      scannedRow("worse", "Worse project", {
        errors: 9,
        warnings: 0,
        segments: 5,
        byLocale: {},
        byCheckType: {},
      }),
    ]);

    expect(summary.projects.map((project) => [project.projectName, project.state])).toEqual([
      ["Release notes", "failed"],
      ["Worse project", "scanned"],
      ["Website localization", "scanned"],
      ["Mobile app", "running"],
      ["Help center", "not_scanned"],
    ]);
  });

  it("compares scanned projects with their previous completed scans", () => {
    const counts = { segments: 10, byLocale: {}, byCheckType: {} };
    const summary = summarizeWorkspaceQa([
      {
        ...scannedRow("a", "Alpha", { ...counts, errors: 1, warnings: 4 }),
        previousSuccessful: { errorCount: 2, warningCount: 4 },
      },
      scannedRow("b", "Beta", { ...counts, errors: 2, warnings: 1 }),
    ]);

    expect(summary.errorsChange).toBe(1);
    expect(summary.warningsChange).toBe(1);
    expect(summarizeWorkspaceQa(qaWorkspaceReports).errorsChange).toBeUndefined();
  });

  it("returns empty breakdowns when nothing has been scanned", () => {
    expect(summarizeWorkspaceQa([])).toMatchObject({
      errors: 0,
      warnings: 0,
      projectCount: 0,
      locales: [],
      checks: [],
      projects: [],
    });
  });
});
