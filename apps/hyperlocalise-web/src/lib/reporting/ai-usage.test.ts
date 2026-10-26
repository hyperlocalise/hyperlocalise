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
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";

import {
  AI_USAGE_CHILD_ROWS,
  AI_USAGE_PAGE_SIZE,
  queryAiUsage,
  type AiUsageQuery,
} from "./ai-usage";
import {
  AI_IMAGE_SOURCES,
  AI_VIDEO_SOURCES,
  ORIGIN_BY_SOURCE,
  aiChannel,
  aiOrigin,
} from "./ai-usage-origins";
import { readAi } from "./report-reads";
import { createReportingTestFixture } from "./reporting.fixture";
import { resolvePeriod } from "./report-period";

const fixture = createReportingTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

type UsageInsert = typeof schema.usageEvents.$inferInsert;

const AT = new Date("2026-06-10T12:00:00Z");
const PERIOD = resolvePeriod({
  from: "2026-06-08",
  to: "2026-06-14",
  today: "2026-10-21",
  startedDay: "2026-01-01",
});

/** Billing rows for one workspace: parent rows and the token rows that point at them. */
function usageRows(organizationId: string) {
  const usage = (values: Partial<UsageInsert> & { source: string }): UsageInsert => ({
    organizationId,
    featureId: "ai_tokens",
    status: "tracking_succeeded",
    operationKey: `test:${randomUUID()}`,
    createdAt: AT,
    ...values,
  });
  const tokens = (
    parent: UsageInsert,
    input: number,
    output: number,
    values: Partial<UsageInsert> = {},
  ) =>
    usage({
      source: "agent_runtime_complete",
      modelId: "openai/gpt-6-luna",
      credentialSource: "byok",
      amountUsd: "0",
      ...values,
      dimensions: {
        input_tokens: input,
        output_tokens: output,
        parent_operation_key: parent.operationKey,
      },
    });
  return { usage, tokens };
}

describe("AI usage origins", () => {
  it("places a call by its parent's source", () => {
    expect(aiOrigin("translation_job_create")).toBe("translation");
    expect(aiOrigin("email_translation_job_create")).toBe("translation");
    expect(aiOrigin("agent_run_create", "translate")).toBe("translation");
    expect(aiOrigin("agent_run_create", "qa_fix")).toBe("review_and_qa");
    expect(aiOrigin("agent_run_create", "comment_only")).toBe("review_and_qa");
    expect(aiOrigin("agent_run_create", "something_new")).toBe("other");
    expect(aiOrigin("project_video_variant")).toBe("images_and_video");
    expect(aiOrigin("slack_agent_turn")).toBe("assistants_and_chat");
    expect(aiOrigin("automation_assistant_turn")).toBe("building_automations");
    expect(aiOrigin("workspace_github_repository_agent")).toBe("running_automations");
    expect(aiOrigin("github_pull_request_review")).toBe("review_and_qa");
    expect(aiOrigin("github_repository_commit_review")).toBe("review_and_qa");
    expect(aiOrigin("repository_agent_workflow")).toBe("assistants_and_chat");
    expect(aiOrigin("image_text_extraction")).toBe("images_and_video");
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
    expect(aiChannel("github_pull_request_review", false)).toBe("github");
    expect(aiChannel("repository_agent_workflow", false)).toBe("github");
    expect(aiChannel("workspace_orchestrator", false)).toBe("automation");
    expect(aiChannel("visual_workflow_ai_step", false)).toBe("automation");
    expect(aiChannel("contentful_field_translation", false)).toBe("contentful");
    expect(aiChannel("content_editor_ai_suggestion", false)).toBe("app");
  });

  it("finds the run in every automation tool step's billing key", async () => {
    // `attributedUsage` reads the run id from the second part of these keys; a tool that puts
    // anything else there would lose its AI from the automation, here and on Costs.
    const tools = join(process.cwd(), "src/agents/automations/workspace/agent/tools");
    const keys = (await readdir(tools))
      .filter((name) => name.startsWith("use_") && !name.includes(".test."))
      .map(async (name) => {
        const text = await readFile(join(tools, name), "utf8");
        return [...text.matchAll(/operationKey: `(workspace-[^`]*)`/g)].map((match) => match[1]!);
      });
    const found = (await Promise.all(keys)).flat();
    expect(found.length).toBeGreaterThanOrEqual(7);
    for (const key of found) expect(key).toMatch(/^workspace-[a-z-]+:\$\{session\.run\.id\}:/);
  });

  it("places every source the same way in the database as on the page", async () => {
    const { organization, project } = await fixture.createWorkspace();
    const { usage } = usageRows(organization.id);
    const sources = [
      ...Object.keys(ORIGIN_BY_SOURCE),
      ...AI_IMAGE_SOURCES,
      ...AI_VIDEO_SOURCES,
      "workspace_orchestrator",
      "workspace_github_repository_agent",
      "workspace_gitlab_repository_agent",
      "slack_something_new",
      "something_new",
    ];
    await db
      .insert(schema.usageEvents)
      .values(
        sources.map((source) =>
          usage({ source, dimensions: { project_id: project.id, input_tokens: 1 } }),
        ),
      );
    const scope = { organizationId: organization.id, projectIds: [project.id], period: PERIOD };
    for (const dimension of ["area", "channel"] as const) {
      const placed = await queryAiUsage({
        ...scope,
        includeUnattributed: false,
        groupBy: "feature",
        thenBy: dimension,
        all: true,
      });
      expect(
        Object.fromEntries(
          placed.rows.map((row) => [row.key, row.children.map((child) => child.key)]),
        ),
      ).toEqual(
        Object.fromEntries(
          sources.map((source) => [
            source,
            [dimension === "area" ? aiOrigin(source) : aiChannel(source, false)],
          ]),
        ),
      );
    }
  });
});

describe("AI usage", () => {
  it("counts tokens, images and videos within the viewer's projects, and groups them", async () => {
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
    const { usage, tokens } = usageRows(organization.id);
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
      tokens(translation, 500, 100, { jobId: job.id, modelId: "anthropic/claude-haiku-4.5" }),
      tokens(hiddenTranslation, 9999, 9999, { jobId: hiddenJob.id }),
      tokens(chat, 300, 30),
      tokens(nightly, 40, 4),
      tokens(translation, 7, 7, { jobId: job.id, status: "rejected" }),
      tokens(translation, 7, 7, { jobId: job.id, createdAt: new Date("2026-05-01T00:00:00Z") }),
      // The week before: the previous period.
      tokens(translation, 11, 1, { jobId: job.id, createdAt: new Date("2026-06-03T00:00:00Z") }),
      // Images and videos: billing reserves a row for each, and writes its token row, with the
      // charge, once it is made. A failed one leaves only its reservation.
      ...["project_image_variant", "project_image_variant", "project_video_variant"].flatMap(
        (source) => {
          const made = usage({
            featureId: "agent_runs",
            source,
            dimensions: { project_id: project.id },
          });
          return [
            made,
            tokens(made, 0, 1, {
              modelId: "google/imagen-5",
              credentialSource: "gateway",
              amountUsd: "0.04",
            }),
          ];
        },
      ),
      usage({
        featureId: "agent_runs",
        source: "project_image_variant",
        status: "reserved",
        dimensions: { project_id: project.id },
      }),
    ]);
    const scope = { organizationId: organization.id, projectIds: [project.id], period: PERIOD };

    const byArea = await queryAiUsage({ ...scope, includeUnattributed: false, groupBy: "area" });
    expect(byArea.rows).toEqual([
      expect.objectContaining({ key: "translation", calls: 2, inputTokens: 1500, children: [] }),
      expect.objectContaining({ key: "running_automations", calls: 1, inputTokens: 40 }),
      expect.objectContaining({ key: "images_and_video", calls: 0, images: 2, videos: 1 }),
    ]);
    expect(byArea.totals).toMatchObject({
      calls: 3,
      inputTokens: 1540,
      // The images' and video's own tokens count too: one each when the model reports none.
      outputTokens: 307,
      images: 2,
      videos: 1,
      chargeUsd: "0.12000000",
      ownKeyCalls: 3,
    });
    expect(byArea.previous).toMatchObject({ calls: 1, inputTokens: 11 });
    expect(byArea.totalGroups).toBe(3);

    // By model, then area; by task and automation, named.
    const byModel = await queryAiUsage({
      ...scope,
      includeUnattributed: false,
      groupBy: "model",
      thenBy: "area",
    });
    expect(
      byModel.rows.map((row) => [row.key, row.calls, row.children.map((child) => child.key)]),
    ).toEqual([
      ["openai/gpt-6-luna", 2, ["translation", "running_automations"]],
      ["anthropic/claude-haiku-4.5", 1, ["translation"]],
      // An image's model and key are those of the call that made it.
      ["google/imagen-5", 0, ["images_and_video"]],
    ]);
    const byProvider = await queryAiUsage({
      ...scope,
      includeUnattributed: false,
      groupBy: "provider",
    });
    expect(byProvider.rows.map((row) => row.key)).toEqual(["openai", "anthropic", "google"]);
    const byTask = await queryAiUsage({ ...scope, includeUnattributed: false, groupBy: "task" });
    expect(byTask.rows[0]).toMatchObject({ key: job.id, calls: 2 });
    expect(byTask.rows[0]!.label).toBeTruthy();
    const byAutomation = await queryAiUsage({
      ...scope,
      includeUnattributed: false,
      groupBy: "automation",
    });
    const nightlyOnly = await queryAiUsage({
      ...scope,
      includeUnattributed: false,
      groupBy: "area",
      filters: { automation: automation!.id },
    });
    expect(nightlyOnly).toMatchObject({ automationName: "Nightly", totals: { calls: 1 } });
    expect(byAutomation.rows).toEqual([
      expect.objectContaining({ key: null, calls: 2 }),
      expect.objectContaining({ key: automation!.id, label: "Nightly", calls: 1 }),
    ]);

    // AI used outside any project counts only when asked for, and never for one project.
    const workspaceWide = await queryAiUsage({
      ...scope,
      includeUnattributed: true,
      groupBy: "project",
    });
    expect(workspaceWide.totals.calls).toBe(4);
    expect(workspaceWide.rows.map((row) => [row.key, row.label])).toEqual([
      [project.id, project.name],
      [null, null],
    ]);
    const chosen = await queryAiUsage({
      ...scope,
      projectId: project.id,
      includeUnattributed: true,
      groupBy: "area",
    });
    expect(chosen.totals.calls).toBe(3);
  });

  it("narrows to a detail, and keeps billing's charge apart from calls on the workspace's own key", async () => {
    const { organization, project } = await fixture.createWorkspace();
    const { usage } = usageRows(organization.id);
    const call = (values: Partial<UsageInsert>) =>
      usage({
        source: "chat_agent_turn",
        modelId: "openai/gpt-6-luna",
        dimensions: { project_id: project.id, input_tokens: 100, output_tokens: 10 },
        ...values,
      });
    await db.insert(schema.usageEvents).values([
      call({ credentialSource: "gateway", amountUsd: "0.25" }),
      call({ credentialSource: "gateway", amountUsd: "0.5" }),
      // Charge not received from billing yet.
      call({ credentialSource: "gateway", status: "tracking_pending" }),
      call({ credentialSource: "byok", amountUsd: "0" }),
      call({ credentialSource: null }),
      call({ credentialSource: "gateway", amountUsd: "9", source: "content_editor_ai_suggestion" }),
    ]);
    const scope = {
      organizationId: organization.id,
      projectIds: [project.id],
      period: PERIOD,
      includeUnattributed: false,
    };

    const byKey = await queryAiUsage({
      ...scope,
      groupBy: "key",
      filters: { area: "assistants_and_chat" },
    });
    expect(byKey.totals).toMatchObject({
      calls: 5,
      chargeUsd: "0.75000000",
      unrecordedCharges: 2,
      ownKeyCalls: 1,
    });
    expect(
      byKey.rows.map((row) => [row.key, row.calls, row.chargeUsd, row.unrecordedCharges]),
    ).toEqual([
      ["our_ai", 3, "0.75000000", 1],
      // Equal groups in the order of their keys.
      ["not_recorded", 1, "0.00000000", 1],
      ["own_key", 1, "0.00000000", 0],
    ]);

    const ownKey = await queryAiUsage({ ...scope, groupBy: "area", filters: { key: "own_key" } });
    expect(ownKey.totals).toMatchObject({ calls: 1, chargeUsd: "0.00000000", ownKeyCalls: 1 });
    const editor = await queryAiUsage({
      ...scope,
      groupBy: "feature",
      filters: { feature: "content_editor_ai_suggestion", channel: "app" },
    });
    expect(editor.rows).toEqual([
      expect.objectContaining({ key: "content_editor_ai_suggestion", chargeUsd: "9.00000000" }),
    ]);
  });

  it("counts the tokens billing adds for cache and reasoning, and ranks by the measure chosen", async () => {
    const { organization, project } = await fixture.createWorkspace();
    const { usage } = usageRows(organization.id);
    await db.insert(schema.usageEvents).values([
      // Billing's quantity is every token; input and output leave out cache and reasoning.
      usage({
        source: "chat_agent_turn",
        modelId: "anthropic/claude-haiku-4.5",
        credentialSource: "gateway",
        amountUsd: "0.01",
        quantity: 1_600,
        dimensions: { project_id: project.id, input_tokens: 400, output_tokens: 200 },
      }),
      // Fewer tokens, more credit.
      usage({
        source: "chat_agent_turn",
        modelId: "openai/gpt-6-luna",
        credentialSource: "gateway",
        amountUsd: "0.5",
        quantity: 300,
        dimensions: { project_id: project.id, input_tokens: 200, output_tokens: 100 },
      }),
    ]);
    const scope = {
      organizationId: organization.id,
      projectIds: [project.id],
      period: PERIOD,
      includeUnattributed: false,
      groupBy: "model" as const,
    };
    const byTokens = await queryAiUsage(scope);
    expect(byTokens.totals).toMatchObject({
      inputTokens: 600,
      outputTokens: 300,
      cacheAndReasoningTokens: 1_000,
    });
    expect(byTokens.rows.map((row) => row.key)).toEqual([
      "anthropic/claude-haiku-4.5",
      "openai/gpt-6-luna",
    ]);
    expect(byTokens.series.points[2]!.tokens).toEqual([1_600, 300]);
    const byCredit = await queryAiUsage({ ...scope, rankBy: "charge" });
    expect(byCredit.rows.map((row) => row.key)).toEqual([
      "openai/gpt-6-luna",
      "anthropic/claude-haiku-4.5",
    ]);
    expect(byCredit.series.groups.map((group) => group.key)).toEqual([
      "openai/gpt-6-luna",
      "anthropic/claude-haiku-4.5",
    ]);
    // The rows under a group follow the same measure.
    const underArea = await queryAiUsage({
      ...scope,
      groupBy: "area",
      thenBy: "model",
      rankBy: "charge",
    });
    expect(underArea.rows[0]!.children.map((child) => child.key)).toEqual([
      "openai/gpt-6-luna",
      "anthropic/claude-haiku-4.5",
    ]);

    // Two small runs make a third model the largest by runs.
    await db.insert(schema.usageEvents).values(
      [1, 2].map(() =>
        usage({
          source: "chat_agent_turn",
          modelId: "google/gemini-3.5-flash",
          dimensions: { project_id: project.id, input_tokens: 1 },
        }),
      ),
    );
    const byRuns = await queryAiUsage({ ...scope, rankBy: "calls" });
    expect(byRuns.rows[0]).toMatchObject({ key: "google/gemini-3.5-flash", calls: 2 });
  });

  it("charts the largest groups per day and folds the rest into Other", async () => {
    const { organization, project } = await fixture.createWorkspace();
    const { usage } = usageRows(organization.id);
    const models = ["a/one", "a/two", "a/three", "a/four", "a/five", "a/six", "a/seven"];
    await db.insert(schema.usageEvents).values(
      models.map((modelId, index) =>
        usage({
          source: "chat_agent_turn",
          modelId,
          credentialSource: "gateway",
          amountUsd: "1",
          // Alternate days, June 8 and 9; "one" has the most tokens.
          createdAt: new Date(`2026-06-0${8 + (index % 2)}T09:00:00Z`),
          dimensions: { project_id: project.id, input_tokens: 100 - index },
        }),
      ),
    );
    const scope = {
      organizationId: organization.id,
      projectIds: [project.id],
      includeUnattributed: false,
      groupBy: "model" as const,
    };
    const { series } = await queryAiUsage({ ...scope, period: PERIOD });
    expect(series.groups.map((group) => group.key)).toEqual([
      "a/one",
      "a/two",
      "a/three",
      "a/four",
      "a/five",
      null,
    ]);
    expect(series.groups.at(-1)).toMatchObject({ other: true });
    expect(series.points.map((point) => point.start)).toEqual([
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ]);
    // June 8: one, three, five and seven (Other); June 9: two, four and six (Other).
    expect(series.points[0]).toMatchObject({
      tokens: [100, 0, 98, 0, 96, 94],
      calls: [1, 0, 1, 0, 1, 1],
      chargeUsd: [1, 0, 1, 0, 1, 1],
    });
    expect(series.points[1]!.tokens).toEqual([0, 99, 0, 97, 0, 95]);

    // A long period is charted by week, from each week's Monday.
    const weekly = await queryAiUsage({
      ...scope,
      period: resolvePeriod({
        from: "2026-06-03",
        to: "2026-08-01",
        today: "2026-10-21",
        startedDay: "2026-01-01",
      }),
    });
    expect(weekly.series.points[0]!.start).toBe("2026-06-01");
    expect(weekly.series.points[1]).toMatchObject({
      start: "2026-06-08",
      calls: [1, 1, 1, 1, 1, 2],
    });
  });

  it("pages the groups, keeping each group's second-level rows with it", async () => {
    const { organization, project, createJob } = await fixture.createWorkspace();
    const { usage } = usageRows(organization.id);
    const jobs = [];
    for (let index = 0; index < AI_USAGE_PAGE_SIZE + 2; index += 1) jobs.push(await createJob());
    await db.insert(schema.usageEvents).values(
      jobs.flatMap((job, index) =>
        ["openai/gpt-6-luna", "anthropic/claude-haiku-4.5"].map((modelId) =>
          usage({
            source: "chat_agent_turn",
            modelId,
            jobId: job.id,
            credentialSource: "gateway",
            amountUsd: "0.000000005",
            dimensions: { input_tokens: 1000 - index },
          }),
        ),
      ),
    );
    const query: AiUsageQuery = {
      organizationId: organization.id,
      projectIds: [project.id],
      period: PERIOD,
      includeUnattributed: false,
      groupBy: "task",
      thenBy: "model",
    };
    const first = await queryAiUsage(query);
    expect(first.totalGroups).toBe(AI_USAGE_PAGE_SIZE + 2);
    expect(first.rows).toHaveLength(AI_USAGE_PAGE_SIZE);
    expect(first.rows[0]).toMatchObject({ key: jobs[0]!.id, calls: 2 });
    expect(first.rows[0]!.children).toHaveLength(2);
    const second = await queryAiUsage({ ...query, page: 2 });
    expect(second.rows.map((row) => row.key)).toEqual(jobs.slice(-2).map((job) => job.id));
    expect(second.rows.every((row) => row.children.length === 2)).toBe(true);
    const all = await queryAiUsage({ ...query, all: true });
    expect(all.rows).toHaveLength(AI_USAGE_PAGE_SIZE + 2);
    // A page past the end still says how many groups there are.
    await expect(queryAiUsage({ ...query, page: 9 })).resolves.toMatchObject({
      rows: [],
      totalGroups: AI_USAGE_PAGE_SIZE + 2,
    });

    // The largest rows under a group, and the rest as one "Other"; a download has every row.
    const byModelThenTask = await queryAiUsage({ ...query, groupBy: "model", thenBy: "task" });
    const luna = byModelThenTask.rows[0]!;
    expect(luna.children).toHaveLength(AI_USAGE_CHILD_ROWS + 1);
    expect(luna.children.slice(0, AI_USAGE_CHILD_ROWS).map((child) => child.key)).toEqual(
      jobs.slice(0, AI_USAGE_CHILD_ROWS).map((job) => job.id),
    );
    expect(luna.children.at(-1)).toMatchObject({
      key: null,
      other: true,
      calls: jobs.length - AI_USAGE_CHILD_ROWS,
      // The 42 rows' own credit, 42 × 0.000000005, rounded once.
      chargeUsd: "0.00000021",
    });
    const everyRow = await queryAiUsage({
      ...query,
      groupBy: "model",
      thenBy: "task",
      all: true,
    });
    expect(everyRow.rows[0]!.children).toHaveLength(jobs.length);
  });

  it("places an automation's tool steps in the automation, by the run in their key", async () => {
    const { organization, project } = await fixture.createWorkspace();
    const [automation] = await db
      .insert(schema.workspaceAutomations)
      .values({
        organizationId: organization.id,
        name: "Repo sync",
        instructions: "",
        projectId: project.id,
      })
      .returning();
    const [run] = await db
      .insert(schema.workspaceAutomationRuns)
      .values({
        organizationId: organization.id,
        automationId: automation!.id,
        triggerSource: "manual",
      })
      .returning();
    const { usage, tokens } = usageRows(organization.id);
    // The main run records its automation; the GitHub step records only the run, in its key.
    const main = usage({
      featureId: "agent_runs",
      source: "workspace_orchestrator",
      operationKey: `workspace-automation:${run!.id}:agent_runs`,
      dimensions: { automation_id: automation!.id },
    });
    const github = usage({
      featureId: "agent_runs",
      source: "workspace_github_repository_agent",
      operationKey: `workspace-github-repo:${run!.id}:agent_runs`,
    });
    await db
      .insert(schema.usageEvents)
      .values([main, github, tokens(main, 10, 1), tokens(github, 500, 50)]);

    const byAutomation = await queryAiUsage({
      organizationId: organization.id,
      projectIds: [project.id],
      period: PERIOD,
      includeUnattributed: false,
      groupBy: "automation",
      thenBy: "feature",
    });
    // Both count in the automation, and in its project.
    expect(byAutomation.rows).toEqual([
      expect.objectContaining({
        key: automation!.id,
        calls: 2,
        inputTokens: 510,
        children: [
          expect.objectContaining({ key: "workspace_github_repository_agent", calls: 1 }),
          expect.objectContaining({ key: "workspace_orchestrator", calls: 1 }),
        ],
      }),
    ]);

    // The page's and API's reader passes the automation and task filters to the query.
    const context = {
      organizationId: organization.id,
      projectIds: [project.id],
      startedDay: "2026-01-01",
      today: "2026-10-21",
      financial: true,
      userId: randomUUID(),
    };
    const dates = { from: PERIOD.from, to: PERIOD.to, page: 1, groupBy: "area" as const };
    await expect(
      readAi(context, { ...dates, automationId: automation!.id }),
    ).resolves.toMatchObject({ totals: { calls: 2 }, automationName: "Repo sync" });
    await expect(readAi(context, { ...dates, jobId: "job_elsewhere" })).resolves.toMatchObject({
      totals: { calls: 0 },
    });
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
        createdAt: AT,
      })),
    );
    const usage = await queryAiUsage({
      organizationId: organization.id,
      projectIds: [project.id],
      period: PERIOD,
      includeUnattributed: false,
      groupBy: "area",
    });
    expect(usage.totals).toMatchObject({ calls: 2, inputTokens: 12.5, outputTokens: 3 });
  });
});
