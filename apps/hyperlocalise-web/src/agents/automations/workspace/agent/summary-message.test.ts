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

import type { WorkspaceOrchestratorSession } from "./context";
import { buildOrchestratorRunSummaryMessage, resolveNotificationOutcome } from "./summary-message";

function createSession(
  overrides: Partial<WorkspaceOrchestratorSession> = {},
): WorkspaceOrchestratorSession {
  return {
    organizationId: "org-1",
    automation: {
      id: "auto-1",
      organizationId: "org-1",
      authorUserId: null,
      status: "active",
      name: "Translate on source upload",
      instructions: "",
      projectId: "project-1",
      triggerConfig: { mode: "source_upload" },
      repositoryTarget: { kind: "none" },
      toolConfig: {},
      configVersion: 1,
      nextRunAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    run: {
      id: "run-1",
      automationId: "auto-1",
      organizationId: "org-1",
      status: "succeeded",
      triggerSource: "source_upload",
      idempotencyKey: null,
      outputSummary: {},
      inputSnapshot: {},
      error: null,
      githubRepositoryAutomationJobId: null,
      startedAt: null,
      completedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    plan: { tools: ["create_native_tms_job", "assign_translate_with_agent", "notify_slack"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: "succeeded",
    terminalError: null,
    ...overrides,
  };
}

describe("resolveNotificationOutcome", () => {
  it("treats in-loop running status without terminalStatus as completed", () => {
    const session = createSession({
      terminalStatus: null,
      run: {
        ...createSession().run,
        status: "running",
        error: null,
      },
    });

    expect(resolveNotificationOutcome(session)).toBe("completed");
  });

  it("returns failed when a terminal error is present", () => {
    const session = createSession({
      terminalStatus: null,
      terminalError: "native_tms_job_missing",
      run: {
        ...createSession().run,
        status: "running",
      },
    });

    expect(resolveNotificationOutcome(session)).toBe("failed");
  });
});

describe("buildOrchestratorRunSummaryMessage", () => {
  it("formats native TMS runs as scannable markdown while the run is still running", () => {
    const message = buildOrchestratorRunSummaryMessage(
      createSession({
        terminalStatus: null,
        run: {
          ...createSession().run,
          status: "running",
        },
        stepResults: {
          create_native_tms_job: {
            jobId: "job_a8e92d25-932f-49f8-b9e3-7143822fcc6e",
            sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
            sourceFileVersionId: "c349d33c-1605-4d2c-8498-c0468da388ce",
            targetLocales: ["de-DE", "fr-FR", "vi-VN", "zh-CN"],
          },
          assign_translate_with_agent: {
            jobId: "job_a8e92d25-932f-49f8-b9e3-7143822fcc6e",
            enqueued: true,
          },
        },
      }),
    );

    expect(message).toBe(
      [
        "**Translate on source upload** completed",
        "",
        "- **Job:** `job_a8e92d25-932f-49f8-b9e3-7143822fcc6e`",
        "- **Source file:** `file_3b017712-ec57-448f-8015-ca282a5a103a`",
        "- **Version:** `c349d33c-1605-4d2c-8498-c0468da388ce`",
        "- **Locales:**",
        "  - de-DE",
        "  - fr-FR",
        "  - vi-VN",
        "  - zh-CN",
        "- **Next:** Assigned to Translate with agent; localisation enqueued",
      ].join("\n"),
    );
  });

  it("prefers github repository digests when present", () => {
    const message = buildOrchestratorRunSummaryMessage(
      createSession({
        stepResults: {
          use_github_repository: {
            digest: "Daily digest: 3 PRs merged.",
          },
        },
      }),
    );

    expect(message).toBe("Daily digest: 3 PRs merged.");
  });

  it("prefers the github digest alone when Crowdin also ran", () => {
    const message = buildOrchestratorRunSummaryMessage(
      createSession({
        stepResults: {
          use_github_repository: {
            digest: "## Translation Review Results\n\n**Keys reviewed**: 0\n**Issues found**: 0 high priority / 0 medium priority / 0 low priority\n\n### High Priority (P0)\n\nNone.",
          },
          use_crowdin: {
            summary: "### `btn.save` · `de-DE`\n- **Glossary:** Save → Speichern",
          },
        },
      }),
    );

    expect(message).toBe("## Translation Review Results\n\n**Keys reviewed**: 0\n**Issues found**: 0 high priority / 0 medium priority / 0 low priority\n\n### High Priority (P0)\n\nNone.");
  });

  it("returns the Crowdin summary when there is no GitHub digest", () => {
    const message = buildOrchestratorRunSummaryMessage(
      createSession({
        stepResults: {
          use_crowdin: {
            summary: "Glossary prefers Speichern for Save.",
          },
        },
      }),
    );

    expect(message).toBe("Glossary prefers Speichern for Save.");
  });
});
