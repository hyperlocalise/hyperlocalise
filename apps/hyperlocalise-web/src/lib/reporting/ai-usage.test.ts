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

import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";

import { queryAiUsage } from "./ai-usage";
import { aiChannel, aiOrigin } from "./ai-usage-origins";
import { createReportingTestFixture } from "./reporting.fixture";
import { resolvePeriod } from "./report-period";

const fixture = createReportingTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

describe("AI usage origins", () => {
  it("places a call by its parent's source", () => {
    expect(aiOrigin("translation_job_create")).toBe("translation");
    expect(aiOrigin("email_translation_job_create")).toBe("translation");
    expect(aiOrigin("agent_run_create", "translate")).toBe("translation");
    expect(aiOrigin("agent_run_create", "qa_fix")).toBe("review_and_qa");
    expect(aiOrigin("agent_run_create", "comment_only")).toBe("other");
    expect(aiOrigin("project_video_variant")).toBe("images_and_video");
    expect(aiOrigin("slack_agent_turn")).toBe("assistants_and_chat");
    expect(aiOrigin("automation_assistant_turn")).toBe("building_automations");
    expect(aiOrigin("workspace_github_repository_agent")).toBe("running_automations");
    expect(aiOrigin("something_new")).toBe("other");
  });

  it("places one-off calls by their own source", () => {
    expect(aiOrigin("content_editor_ai_suggestion")).toBe("translation");
    expect(aiOrigin("content_editor_document_regenerate")).toBe("translation");
    expect(aiOrigin("contentful_field_translation")).toBe("translation");
    expect(aiOrigin("chat_translate_string")).toBe("assistants_and_chat");
    expect(aiOrigin("project_file_string_context_lookup")).toBe("assistants_and_chat");
    expect(aiOrigin("visual_workflow_ai_step")).toBe("running_automations");
    expect(aiOrigin("workspace_crowdin_review_suggestion")).toBe("running_automations");
  });

  it("tells channels apart", () => {
    expect(aiChannel("translation_job_create", true)).toBe("api");
    expect(aiChannel("translation_job_create", false)).toBe("app");
    expect(aiChannel("slack_image_localization", false)).toBe("slack");
    expect(aiChannel("email_translation_job_create", false)).toBe("email");
    expect(aiChannel("web_chat_agent_turn", false)).toBe("web_chat");
    expect(aiChannel("agent_run_create", false)).toBe("connected_tms");
    expect(aiChannel("workspace_gitlab_repository_agent", false)).toBe("gitlab");
    expect(aiChannel("workspace_orchestrator", false)).toBe("automation");
    expect(aiChannel("visual_workflow_ai_step", false)).toBe("automation");
    expect(aiChannel("contentful_field_translation", false)).toBe("contentful");
    expect(aiChannel("content_editor_ai_suggestion", false)).toBe("app");
  });
});

describe("AI usage", () => {
  it("counts tokens, images and videos by origin and model, within the viewer's projects", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, createProject, createJob } = workspace;
    const hidden = await createProject("Hidden");
    const job = await createJob();
    const hiddenJob = await createJob({ projectId: hidden.id });
    const [automation] = await db
      .insert(schema.workspaceAutomations)
      .values({
        organizationId: organization.id,
        name: "Nightly",
        instructions: "",
        projectId: project.id,
      })
      .returning();
    const at = new Date("2026-06-10T12:00:00Z");
    const usage = (
      values: Partial<typeof schema.usageEvents.$inferInsert> & { source: string },
    ): typeof schema.usageEvents.$inferInsert => ({
      organizationId: organization.id,
      featureId: "ai_tokens",
      status: "tracking_succeeded",
      operationKey: `test:${randomUUID()}`,
      createdAt: at,
      ...values,
    });
    const tokens = (
      parent: typeof schema.usageEvents.$inferInsert,
      input: number,
      output: number,
      values: Partial<typeof schema.usageEvents.$inferInsert> = {},
    ) =>
      usage({
        source: "agent_runtime_complete",
        modelId: "gpt-6-luna",
        credentialSource: "byok",
        dimensions: {
          input_tokens: input,
          output_tokens: output,
          parent_operation_key: parent.operationKey,
        },
        ...values,
      });
    const translation = usage({
      featureId: "translation_jobs",
      source: "translation_job_create",
      jobId: job.id,
    });
    const hiddenTranslation = usage({
      featureId: "translation_jobs",
      source: "translation_job_create",
      jobId: hiddenJob.id,
    });
    const chat = usage({ featureId: "agent_runs", source: "chat_agent_turn" });
    const nightly = usage({
      featureId: "agent_runs",
      source: "workspace_orchestrator",
      dimensions: { automation_id: automation!.id },
    });
    await db.insert(schema.usageEvents).values([
      translation,
      hiddenTranslation,
      chat,
      nightly,
      tokens(translation, 1000, 200, { jobId: job.id }),
      tokens(translation, 500, 100, { jobId: job.id, modelId: "claude-haiku-4.5" }),
      tokens(hiddenTranslation, 9999, 9999, { jobId: hiddenJob.id }),
      tokens(chat, 300, 30),
      tokens(nightly, 40, 4),
      tokens(translation, 7, 7, { jobId: job.id, status: "rejected" }),
      tokens(translation, 7, 7, { jobId: job.id, createdAt: new Date("2026-05-01T00:00:00Z") }),
      usage({
        featureId: "agent_runs",
        source: "project_image_variant",
        dimensions: { project_id: project.id },
      }),
      usage({
        featureId: "agent_runs",
        source: "project_image_variant",
        dimensions: { project_id: project.id },
      }),
      usage({
        featureId: "agent_runs",
        source: "project_video_variant",
        dimensions: { project_id: project.id },
      }),
    ]);
    const period = resolvePeriod({
      from: "2026-06-08",
      to: "2026-06-14",
      today: "2026-10-21",
      startedDay: "2026-01-01",
    });
    const scope = { organizationId: organization.id, projectIds: [project.id], period };

    const projectOnly = await queryAiUsage({ ...scope, includeUnattributed: false });
    expect(projectOnly.byOrigin).toEqual([
      {
        origin: "translation",
        calls: 2,
        inputTokens: 1500,
        outputTokens: 300,
        images: 0,
        videos: 0,
        models: ["claude-haiku-4.5", "gpt-6-luna"],
        channels: ["app"],
      },
      expect.objectContaining({ origin: "images_and_video", calls: 0, images: 2, videos: 1 }),
      expect.objectContaining({
        origin: "running_automations",
        calls: 1,
        inputTokens: 40,
        channels: ["automation"],
      }),
    ]);
    expect(projectOnly.totals).toEqual({
      calls: 3,
      inputTokens: 1540,
      outputTokens: 304,
      images: 2,
      videos: 1,
    });
    expect(projectOnly.byModel).toEqual([
      expect.objectContaining({
        model: "gpt-6-luna",
        calls: 2,
        inputTokens: 1040,
        origins: ["translation", "running_automations"],
      }),
      expect.objectContaining({ model: "claude-haiku-4.5", calls: 1 }),
    ]);

    // AI used outside any project is shown only when asked for, and never for one project.
    const workspaceWide = await queryAiUsage({ ...scope, includeUnattributed: true });
    expect(workspaceWide.byOrigin.map((row) => row.origin)).toContain("assistants_and_chat");
    expect(workspaceWide.totals.calls).toBe(4);
    const chosen = await queryAiUsage({
      ...scope,
      projectId: project.id,
      includeUnattributed: true,
    });
    expect(chosen.totals.calls).toBe(3);
  });

  it("places a one-off call with no parent row by its own source and recorded project", async () => {
    const { organization, project } = await fixture.createWorkspace();
    const call = (source: string, dimensions: Record<string, unknown> = {}) => ({
      organizationId: organization.id,
      featureId: "ai_tokens" as const,
      status: "tracking_succeeded" as const,
      operationKey: `ai-call:${source}:${randomUUID()}:ai_tokens`,
      source,
      modelId: "gpt-6-luna",
      credentialSource: "gateway" as const,
      dimensions: {
        input_tokens: 100,
        output_tokens: 10,
        parent_operation_key: `ai-call:${source}:${randomUUID()}`,
        ...dimensions,
      },
      createdAt: new Date("2026-06-10T12:00:00Z"),
    });
    await db
      .insert(schema.usageEvents)
      .values([
        call("content_editor_ai_suggestion"),
        call("visual_workflow_ai_step"),
        call("content_editor_document_regenerate", { project_id: project.id }),
      ]);
    const scope = {
      organizationId: organization.id,
      projectIds: [project.id],
      period: resolvePeriod({
        from: "2026-06-08",
        to: "2026-06-14",
        today: "2026-10-21",
        startedDay: "2026-01-01",
      }),
    };

    const workspaceWide = await queryAiUsage({ ...scope, includeUnattributed: true });
    expect(workspaceWide.byOrigin).toEqual([
      expect.objectContaining({ origin: "translation", calls: 2, channels: ["app"] }),
      expect.objectContaining({
        origin: "running_automations",
        calls: 1,
        channels: ["automation"],
      }),
    ]);
    // Without a project on the record, a call counts only as AI used outside any project.
    const projectOnly = await queryAiUsage({ ...scope, includeUnattributed: false });
    expect(projectOnly.totals.calls).toBe(1);
  });

  it("reads a fractional or unreadable token count without failing", async () => {
    const { organization, project } = await fixture.createWorkspace();
    await db.insert(schema.usageEvents).values(
      [
        { input_tokens: "12.5", output_tokens: 3, project_id: project.id },
        { input_tokens: "many", output_tokens: null, project_id: project.id },
      ].map((dimensions) => ({
        organizationId: organization.id,
        featureId: "ai_tokens" as const,
        status: "tracking_succeeded" as const,
        operationKey: `test:${randomUUID()}`,
        source: "chat_agent_turn",
        dimensions,
        createdAt: new Date("2026-06-10T12:00:00Z"),
      })),
    );
    const usage = await queryAiUsage({
      organizationId: organization.id,
      projectIds: [project.id],
      period: resolvePeriod({
        from: "2026-06-08",
        to: "2026-06-14",
        today: "2026-10-21",
        startedDay: "2026-01-01",
      }),
      includeUnattributed: false,
    });
    expect(usage.totals).toMatchObject({ calls: 2, inputTokens: 12.5, outputTokens: 3 });
  });
});
