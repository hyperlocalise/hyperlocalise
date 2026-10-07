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

import {
  buildWorkspaceOrchestratorOutputSummary,
  readImportIntercomArticles,
  readPushIntercomTranslations,
} from "./workspace-orchestrator-output-summary";

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

  it("keeps a persisted web-search summary off logged step results", () => {
    const outputSummary = buildWorkspaceOrchestratorOutputSummary(
      {
        webSearch: {
          summary: "Acme Corp competitor research for Jane Doe",
          provider: "exa",
          toolNames: ["exa_search"],
        },
      },
      {
        use_web_search: {
          provider: "exa",
          toolCount: 1,
          status: "completed",
        },
      },
    );

    expect(outputSummary.webSearch).toEqual({
      summary: "Acme Corp competitor research for Jane Doe",
      provider: "exa",
      toolNames: ["exa_search"],
    });
    expect(outputSummary.orchestratorStepResults).toEqual({
      use_web_search: {
        provider: "exa",
        toolCount: 1,
        status: "completed",
      },
    });
    expect(JSON.stringify(outputSummary.orchestratorStepResults)).not.toContain("Jane Doe");
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

  it("records GitHub comment notification warnings", () => {
    const outputSummary = buildWorkspaceOrchestratorOutputSummary(
      { orchestratorEnqueuedAt: "2026-06-24T00:00:00.000Z" },
      {
        notify_github_comment: {
          posted: false,
          skipped: false,
          code: "github_comment_send_failed",
          message: "GitHub comment failed.",
        },
      },
      {
        notificationWarnings: [
          {
            channel: "github_comment",
            code: "github_comment_send_failed",
            message: "GitHub comment failed.",
          },
        ],
      },
    );

    expect(outputSummary.notificationWarnings).toEqual([
      {
        channel: "github_comment",
        code: "github_comment_send_failed",
        message: "GitHub comment failed.",
      },
    ]);
  });

  it("preserves Intercom import and push results from the current step", () => {
    const outputSummary = buildWorkspaceOrchestratorOutputSummary(
      { orchestratorEnqueuedAt: "2026-10-07T00:00:00.000Z" },
      {
        import_intercom_articles: {
          imported: 0,
          failed: 0,
          status: "succeeded",
        },
        push_intercom_translations: {
          pushedLocales: 0,
          failedLocales: 0,
          status: "succeeded",
        },
      },
    );

    expect(outputSummary.importIntercomArticles).toEqual({
      imported: 0,
      failed: 0,
      status: "succeeded",
    });
    expect(outputSummary.pushIntercomTranslations).toEqual({
      pushedLocales: 0,
      failedLocales: 0,
      status: "succeeded",
    });
  });
});

describe("readImportIntercomArticles", () => {
  it("prefers the current step over a persisted summary", () => {
    expect(
      readImportIntercomArticles(
        {
          importIntercomArticles: { imported: 4, status: "stale" },
        },
        {
          import_intercom_articles: { imported: 0, failed: 2, status: "partial" },
        },
      ),
    ).toEqual({ imported: 0, failed: 2, status: "partial" });
  });

  it("falls back to prior orchestrator step results", () => {
    expect(
      readImportIntercomArticles(
        {
          orchestratorStepResults: {
            import_intercom_articles: { imported: 3, status: "succeeded" },
          },
        },
        {},
      ),
    ).toEqual({ imported: 3, status: "succeeded" });
  });

  it("rejects a partial object missing imported so the tool can run again", () => {
    expect(
      readImportIntercomArticles(
        { importIntercomArticles: { status: "succeeded", failed: 0 } },
        { import_intercom_articles: { status: "succeeded" } },
      ),
    ).toBeNull();
  });
});

describe("readPushIntercomTranslations", () => {
  it("treats pushedLocales 0 as a completed idempotent result", () => {
    expect(
      readPushIntercomTranslations(
        {},
        { push_intercom_translations: { pushedLocales: 0, failedLocales: 0 } },
      ),
    ).toEqual({ pushedLocales: 0, failedLocales: 0 });
  });

  it("rejects a persisted object missing pushedLocales", () => {
    expect(
      readPushIntercomTranslations({ pushIntercomTranslations: { status: "succeeded" } }, {}),
    ).toBeNull();
  });
});
