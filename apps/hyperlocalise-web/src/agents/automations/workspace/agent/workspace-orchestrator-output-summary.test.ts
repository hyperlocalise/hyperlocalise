/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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

  it("preserves createNativeTmsJob and assignTranslateWithAgent from current step results", () => {
    const outputSummary = buildWorkspaceOrchestratorOutputSummary(
      { orchestratorEnqueuedAt: "2026-06-24T00:00:00.000Z" },
      {
        create_native_tms_job: {
          jobId: "job_123",
          projectId: "project_123",
        },
        assign_translate_with_agent: {
          jobId: "job_123",
          projectId: "project_123",
          action: "translate_with_agent",
          enqueued: true,
        },
      },
    );

    expect(outputSummary).toMatchObject({
      createNativeTmsJob: {
        jobId: "job_123",
        projectId: "project_123",
      },
      assignTranslateWithAgent: {
        jobId: "job_123",
        projectId: "project_123",
        action: "translate_with_agent",
        enqueued: true,
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
