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
  readImportBrazeCampaigns,
  readImportBrazeTemplates,
  readImportCustomerIoCampaigns,
  readImportGoogleDriveFiles,
  readImportIntercomArticles,
  readImportLoopsEmails,
  readImportSanityDocuments,
  readImportWebflowItems,
  readPushBrazeCampaigns,
  readPushBrazeTemplates,
  readPushCustomerIoCampaigns,
  readPushGoogleDriveTranslations,
  readPushIntercomTranslations,
  readPushLoopsEmails,
  readPushSanityTranslations,
  readPushWebflowTranslations,
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

  it("preserves Sanity import and push results from the current step", () => {
    const outputSummary = buildWorkspaceOrchestratorOutputSummary(
      { orchestratorEnqueuedAt: "2026-10-07T00:00:00.000Z" },
      {
        import_sanity_documents: {
          imported: 2,
          failed: 0,
          status: "succeeded",
        },
        push_sanity_translations: {
          pushedLocales: 1,
          failedLocales: 0,
          status: "succeeded",
        },
      },
    );

    expect(outputSummary.importSanityDocuments).toEqual({
      imported: 2,
      failed: 0,
      status: "succeeded",
    });
    expect(outputSummary.pushSanityTranslations).toEqual({
      pushedLocales: 1,
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

describe("readImportBrazeCampaigns", () => {
  it("prefers the current step, then the persisted summary, then prior step results", () => {
    expect(
      readImportBrazeCampaigns(
        { importBrazeCampaigns: { imported: 4, status: "stale" } },
        { import_braze_campaigns: { imported: 0, failed: 2 } },
      ),
    ).toEqual({ imported: 0, failed: 2 });
    expect(
      readImportBrazeCampaigns({ importBrazeCampaigns: { imported: 3, skipped: 1 } }, {}),
    ).toEqual({ imported: 3, skipped: 1 });
    expect(
      readImportBrazeCampaigns(
        {
          orchestratorStepResults: {
            import_braze_campaigns: { imported: 2, status: "succeeded" },
          },
        },
        {},
      ),
    ).toEqual({ imported: 2, status: "succeeded" });
  });

  it("rejects a partial object missing imported so the tool can run again", () => {
    expect(
      readImportBrazeCampaigns(
        { importBrazeCampaigns: { status: "succeeded", failed: 0 } },
        { import_braze_campaigns: { status: "succeeded" } },
      ),
    ).toBeNull();
  });
});

describe("readImportBrazeTemplates", () => {
  it("treats imported 0 as a completed idempotent result", () => {
    expect(
      readImportBrazeTemplates({}, { import_braze_templates: { imported: 0, failed: 0 } }),
    ).toEqual({ imported: 0, failed: 0 });
  });
});

describe("readPushBrazeCampaigns", () => {
  it("treats pushedLocales 0 as a completed idempotent result", () => {
    expect(
      readPushBrazeCampaigns({}, { push_braze_campaigns: { pushedLocales: 0, failedLocales: 1 } }),
    ).toEqual({ pushedLocales: 0, failedLocales: 1 });
  });

  it("rejects a persisted object missing pushedLocales", () => {
    expect(readPushBrazeCampaigns({ pushBrazeCampaigns: { status: "succeeded" } }, {})).toBeNull();
  });
});

describe("readPushBrazeTemplates", () => {
  it("reads prior orchestrator step results when the current step is empty", () => {
    expect(
      readPushBrazeTemplates(
        {
          orchestratorStepResults: {
            push_braze_templates: { pushedLocales: 2, failedLocales: 0 },
          },
        },
        {},
      ),
    ).toEqual({ pushedLocales: 2, failedLocales: 0 });
  });
});

describe("readImportSanityDocuments", () => {
  it("prefers the current step over a persisted summary", () => {
    expect(
      readImportSanityDocuments(
        {
          importSanityDocuments: { imported: 4, status: "stale" },
        },
        {
          import_sanity_documents: { imported: 0, failed: 2, status: "partial" },
        },
      ),
    ).toEqual({ imported: 0, failed: 2, status: "partial" });
  });

  it("rejects a partial object missing imported so the tool can run again", () => {
    expect(
      readImportSanityDocuments(
        { importSanityDocuments: { status: "succeeded", failed: 0 } },
        { import_sanity_documents: { status: "succeeded" } },
      ),
    ).toBeNull();
  });
});

describe("readPushSanityTranslations", () => {
  it("treats pushedLocales 0 as a completed idempotent result", () => {
    expect(
      readPushSanityTranslations(
        {},
        { push_sanity_translations: { pushedLocales: 0, failedLocales: 0 } },
      ),
    ).toEqual({ pushedLocales: 0, failedLocales: 0 });
  });

  it("rejects a persisted object missing pushedLocales", () => {
    expect(
      readPushSanityTranslations({ pushSanityTranslations: { status: "succeeded" } }, {}),
    ).toBeNull();
  });
});

describe("readImportWebflowItems", () => {
  it("prefers the current step over a persisted summary", () => {
    expect(
      readImportWebflowItems(
        {
          importWebflowItems: { imported: 4, status: "stale" },
        },
        {
          import_webflow_items: { imported: 0, failed: 2, status: "partial" },
        },
      ),
    ).toEqual({ imported: 0, failed: 2, status: "partial" });
  });

  it("rejects a partial object missing imported so the tool can run again", () => {
    expect(
      readImportWebflowItems(
        { importWebflowItems: { status: "succeeded", failed: 0 } },
        { import_webflow_items: { status: "succeeded" } },
      ),
    ).toBeNull();
  });
});

describe("readPushWebflowTranslations", () => {
  it("treats pushedLocales 0 as a completed idempotent result", () => {
    expect(
      readPushWebflowTranslations(
        {},
        { push_webflow_translations: { pushedLocales: 0, failedLocales: 0 } },
      ),
    ).toEqual({ pushedLocales: 0, failedLocales: 0 });
  });

  it("rejects a persisted object missing pushedLocales", () => {
    expect(
      readPushWebflowTranslations({ pushWebflowTranslations: { status: "succeeded" } }, {}),
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

describe("readImportGoogleDriveFiles", () => {
  it("prefers the current step, then the persisted summary, then prior step results", () => {
    expect(
      readImportGoogleDriveFiles(
        { importGoogleDriveFiles: { imported: 4, status: "stale" } },
        { import_google_drive_files: { imported: 0, failed: 2 } },
      ),
    ).toEqual({ imported: 0, failed: 2 });
    expect(
      readImportGoogleDriveFiles({ importGoogleDriveFiles: { imported: 3, skipped: 1 } }, {}),
    ).toEqual({ imported: 3, skipped: 1 });
    expect(
      readImportGoogleDriveFiles(
        {
          orchestratorStepResults: {
            import_google_drive_files: { imported: 2, status: "succeeded" },
          },
        },
        {},
      ),
    ).toEqual({ imported: 2, status: "succeeded" });
  });

  it("rejects a partial object missing imported so the tool can run again", () => {
    expect(
      readImportGoogleDriveFiles(
        { importGoogleDriveFiles: { status: "succeeded", failed: 0 } },
        { import_google_drive_files: { status: "succeeded" } },
      ),
    ).toBeNull();
  });
});

describe("readPushGoogleDriveTranslations", () => {
  it("treats pushed 0 as a completed idempotent result", () => {
    expect(
      readPushGoogleDriveTranslations(
        {},
        { push_google_drive_translations: { pushed: 0, failed: 1 } },
      ),
    ).toEqual({ pushed: 0, failed: 1 });
  });

  it("rejects a persisted object missing pushed", () => {
    expect(
      readPushGoogleDriveTranslations({ pushGoogleDriveTranslations: { status: "succeeded" } }, {}),
    ).toBeNull();
  });
});

describe("readImportLoopsEmails", () => {
  it("prefers the current step, then the persisted summary, then prior step results", () => {
    expect(
      readImportLoopsEmails(
        { importLoopsEmails: { imported: 4, status: "stale" } },
        { import_loops_emails: { imported: 0, failed: 2 } },
      ),
    ).toEqual({ imported: 0, failed: 2 });
    expect(readImportLoopsEmails({ importLoopsEmails: { imported: 3, skipped: 1 } }, {})).toEqual({
      imported: 3,
      skipped: 1,
    });
    expect(
      readImportLoopsEmails(
        {
          orchestratorStepResults: {
            import_loops_emails: { imported: 2, status: "succeeded" },
          },
        },
        {},
      ),
    ).toEqual({ imported: 2, status: "succeeded" });
  });

  it("rejects a partial object missing imported so the tool can run again", () => {
    expect(
      readImportLoopsEmails(
        { importLoopsEmails: { status: "succeeded", failed: 0 } },
        { import_loops_emails: { status: "succeeded" } },
      ),
    ).toBeNull();
  });
});

describe("readPushLoopsEmails", () => {
  it("treats pushedLocales 0 as a completed idempotent result", () => {
    expect(
      readPushLoopsEmails({}, { push_loops_emails: { pushedLocales: 0, failedLocales: 0 } }),
    ).toEqual({ pushedLocales: 0, failedLocales: 0 });
  });

  it("rejects a persisted object missing pushedLocales", () => {
    expect(readPushLoopsEmails({ pushLoopsEmails: { status: "succeeded" } }, {})).toBeNull();
  });
});

describe("readImportCustomerIoCampaigns", () => {
  it("prefers the current step over a persisted summary", () => {
    expect(
      readImportCustomerIoCampaigns(
        { importCustomerIoCampaigns: { imported: 4, status: "stale" } },
        { import_customer_io_campaigns: { imported: 0, failed: 2, status: "partial" } },
      ),
    ).toEqual({ imported: 0, failed: 2, status: "partial" });
  });

  it("rejects a partial object missing imported so the tool can run again", () => {
    expect(
      readImportCustomerIoCampaigns(
        { importCustomerIoCampaigns: { status: "succeeded", failed: 0 } },
        { import_customer_io_campaigns: { status: "succeeded" } },
      ),
    ).toBeNull();
  });
});

describe("readPushCustomerIoCampaigns", () => {
  it("treats pushedLocales 0 as a completed idempotent result", () => {
    expect(
      readPushCustomerIoCampaigns(
        {},
        { push_customer_io_campaigns: { pushedLocales: 0, failedLocales: 0 } },
      ),
    ).toEqual({ pushedLocales: 0, failedLocales: 0 });
  });

  it("rejects a persisted object missing pushedLocales", () => {
    expect(
      readPushCustomerIoCampaigns({ pushCustomerIoCampaigns: { status: "succeeded" } }, {}),
    ).toBeNull();
  });
});
