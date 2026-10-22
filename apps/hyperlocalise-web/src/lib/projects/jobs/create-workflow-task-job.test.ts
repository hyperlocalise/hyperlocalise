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
import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { insertStoredSourceFile } from "@/api/routes/public-jobs/public-jobs.fixture";
import { db } from "@/lib/database/client";
import { isOk } from "@/lib/primitives/result/results";

import { createWorkflowTaskJob } from "./create-workflow-task-job";

const mocks = vi.hoisted(() => ({
  startTaskAnalysis: vi.fn(async () => undefined),
  enqueueJobCreatedActivity: vi.fn(async () => undefined),
}));

vi.mock("@/lib/reporting/task-analysis-start", () => ({
  startTaskAnalysis: mocks.startTaskAnalysis,
}));
vi.mock("@/lib/activity-log/job-automation-events", () => ({
  enqueueJobCreatedActivity: mocks.enqueueJobCreatedActivity,
}));

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  mocks.startTaskAnalysis.mockClear();
  await projectFixture.cleanup();
});

describe("createWorkflowTaskJob", () => {
  it("records the task's strings for Reports in the background, under the step's name", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const file = await insertStoredSourceFile({
      organizationId: organization.id,
      projectId: project.id,
      filename: "messages.json",
      contentType: "application/json",
      sourceKind: "repository_file",
      metadata: { sourcePath: "locales/messages.json" },
    });
    for (const [step, reportStep] of [
      ["edit", "translation"],
      ["proofread", "review"],
    ] as const) {
      const result = await createWorkflowTaskJob({
        organizationId: organization.id,
        projectId: project.id,
        sourceFileId: file.id,
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        step,
      });
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(mocks.startTaskAnalysis).toHaveBeenLastCalledWith({
        organizationId: organization.id,
        projectId: project.id,
        jobId: result.value.jobId,
        step: reportStep,
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        repositorySourceFileId: expect.any(String),
      });
    }
    expect(mocks.startTaskAnalysis).toHaveBeenCalledTimes(2);
  });
});
