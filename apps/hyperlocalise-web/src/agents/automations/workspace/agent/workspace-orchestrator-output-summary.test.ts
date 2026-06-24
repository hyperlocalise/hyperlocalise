import { describe, expect, it } from "vite-plus/test";

import { buildWorkspaceOrchestratorOutputSummary } from "./workspace-orchestrator-output-summary";

describe("buildWorkspaceOrchestratorOutputSummary", () => {
  it("preserves contentfulTranslationRunId from current step results", () => {
    const outputSummary = buildWorkspaceOrchestratorOutputSummary(
      { orchestratorEnqueuedAt: "2026-06-24T00:00:00.000Z" },
      {
        run_contentful_translation: {
          contentfulTranslationRunId: "contentful-run-1",
          status: "succeeded",
        },
      },
    );

    expect(outputSummary).toMatchObject({
      orchestratorEnqueuedAt: "2026-06-24T00:00:00.000Z",
      contentfulTranslationRunId: "contentful-run-1",
      orchestratorStepResults: {
        run_contentful_translation: {
          contentfulTranslationRunId: "contentful-run-1",
          status: "succeeded",
        },
      },
    });
  });

  it("preserves createTranslationJobs from current step results", () => {
    const outputSummary = buildWorkspaceOrchestratorOutputSummary(
      { orchestratorEnqueuedAt: "2026-06-24T00:00:00.000Z" },
      {
        create_translation_jobs: {
          jobId: "job_123",
          projectId: "project_123",
        },
      },
    );

    expect(outputSummary).toMatchObject({
      createTranslationJobs: {
        jobId: "job_123",
        projectId: "project_123",
      },
    });
  });

  it("falls back to prior orchestrator step results when the stale snapshot omitted tool fields", () => {
    const outputSummary = buildWorkspaceOrchestratorOutputSummary(
      {
        orchestratorEnqueuedAt: "2026-06-24T00:00:00.000Z",
        orchestratorStepResults: {
          run_contentful_translation: {
            contentfulTranslationRunId: "contentful-run-1",
            status: "succeeded",
          },
        },
      },
      {},
    );

    expect(outputSummary.contentfulTranslationRunId).toBe("contentful-run-1");
  });
});
