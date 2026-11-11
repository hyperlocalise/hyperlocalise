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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const steps = vi.hoisted(() => ({
  analyseTaskLanguageStep: vi.fn<
    (input: { targetLocale: string; withoutMemory?: boolean }) => Promise<{
      strings: number;
      days: string[];
    }>
  >(),
  refreshTaskDaysStep: vi.fn<(input: unknown) => Promise<void>>(),
  setTaskAnalysisStatusStep: vi.fn<(input: unknown) => Promise<void>>(),
}));

vi.mock("./steps/task-analysis", () => steps);

import { taskAnalysisWorkflow } from "./task-analysis";

const input = {
  organizationId: "org_1",
  projectId: "project_1",
  jobId: "job_1",
  step: "review" as const,
  sourceLocale: "en-US",
  targetLocales: ["fr-FR", "de-DE"],
  repositorySourceFileId: "file_1",
};
const state = { organizationId: "org_1", jobId: "job_1", step: "review" };
const recorded = (day: string) => Promise.resolve({ strings: 2, days: [day] });

beforeEach(() => {
  for (const step of Object.values(steps)) step.mockReset();
  steps.refreshTaskDaysStep.mockResolvedValue(undefined);
  steps.setTaskAnalysisStatusStep.mockResolvedValue(undefined);
});

describe("taskAnalysisWorkflow", () => {
  it("records each language, refreshes the task's days once, and marks the analysis done", async () => {
    steps.analyseTaskLanguageStep
      .mockReturnValueOnce(recorded("2026-06-01"))
      .mockReturnValueOnce(recorded("2026-06-01"));
    await expect(taskAnalysisWorkflow(input)).resolves.toEqual({ strings: 2 });
    expect(steps.analyseTaskLanguageStep.mock.calls.map(([call]) => call.targetLocale)).toEqual([
      "fr-FR",
      "de-DE",
    ]);
    expect(steps.refreshTaskDaysStep).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "project_1",
      days: ["2026-06-01"],
    });
    expect(steps.setTaskAnalysisStatusStep).toHaveBeenCalledWith({
      ...state,
      status: "done",
      incomplete: false,
      strings: 2,
      error: null,
    });
  });

  it("records a language without match bands only when its memory could not be read, and says the quote is not exact", async () => {
    steps.analyseTaskLanguageStep
      .mockReturnValueOnce(recorded("2026-06-01"))
      .mockRejectedValueOnce(new Error("reporting_memory_unavailable: memory down"))
      .mockReturnValueOnce(recorded("2026-06-01"));
    await expect(taskAnalysisWorkflow(input)).resolves.toEqual({ strings: 2 });
    expect(steps.analyseTaskLanguageStep.mock.calls.map(([call]) => call)).toMatchObject([
      { targetLocale: "fr-FR" },
      { targetLocale: "de-DE" },
      { targetLocale: "de-DE", withoutMemory: true },
    ]);
    expect(steps.setTaskAnalysisStatusStep).toHaveBeenCalledWith({
      ...state,
      status: "done",
      incomplete: true,
      strings: 2,
      error: "reporting_memory_unavailable: memory down",
    });
  });

  it("marks the analysis failed on any other failure, keeping the strings counted so far", async () => {
    steps.analyseTaskLanguageStep
      .mockReturnValueOnce(recorded("2026-06-01"))
      .mockRejectedValueOnce(new Error("connection reset"));
    await expect(taskAnalysisWorkflow(input)).rejects.toThrow("connection reset");
    // No recording without bands: strings without a band are priced as new work, and that stays.
    expect(steps.analyseTaskLanguageStep).toHaveBeenCalledTimes(2);
    expect(steps.refreshTaskDaysStep).not.toHaveBeenCalled();
    expect(steps.setTaskAnalysisStatusStep).toHaveBeenCalledWith({
      ...state,
      status: "failed",
      strings: 2,
      error: "connection reset",
    });
  });

  it("marks the analysis done, with the error, when the summary stays busy: the scheduled run refreshes the days", async () => {
    steps.analyseTaskLanguageStep.mockReturnValue(recorded("2026-06-01"));
    steps.refreshTaskDaysStep.mockRejectedValue(new Error("reporting_summary_busy"));
    await expect(taskAnalysisWorkflow(input)).resolves.toEqual({ strings: 2 });
    expect(steps.setTaskAnalysisStatusStep).toHaveBeenCalledWith({
      ...state,
      status: "done",
      incomplete: false,
      strings: 2,
      error: "reporting_summary_busy",
    });
  });
});
