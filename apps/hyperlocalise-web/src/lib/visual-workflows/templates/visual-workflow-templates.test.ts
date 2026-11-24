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

import { createMockWorkflowExecutor } from "../runtime/mock-executor";
import { runVisualWorkflowInterpreter } from "../runtime/interpreter";
import { parseVisualWorkflowV3Definition } from "../schema/definition-migration";
import {
  compileVisualWorkflowV3Definition,
  toVisualWorkflowExecutionDefinition,
} from "../validation/compile-workflow-v3";
import { validateVisualWorkflowV3Definition } from "../validation/validate-workflow-v3";
import type { VisualWorkflowV3Definition } from "../schema/types";
import {
  buildVisualWorkflowTemplate,
  VISUAL_WORKFLOW_TEMPLATE_IDS,
  type VisualWorkflowTemplateId,
} from "./visual-workflow-templates";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000099";

/** Fills in what a person picks before publishing, as they would on the Configuration tab. */
function withPersonChoices(definition: VisualWorkflowV3Definition): VisualWorkflowV3Definition {
  return {
    ...definition,
    nodes: definition.nodes.map((node) => {
      if (node.config.kind === "action.notify_slack") {
        return { ...node, config: { ...node.config, channelId: "C0123" } };
      }
      if (node.config.kind === "action.pick_assignee") {
        return { ...node, config: { ...node.config, fallbackAssigneeIds: ["user_mock"] } };
      }
      return node;
    }),
  };
}

async function runTemplate(
  id: VisualWorkflowTemplateId,
  input: {
    triggerInput: Record<string, unknown>;
    mockOutputs?: Record<string, Record<string, unknown>>;
  },
) {
  const compiled = compileVisualWorkflowV3Definition(
    parseVisualWorkflowV3Definition(withPersonChoices(buildVisualWorkflowTemplate(id))),
  );
  const mockExecutor = createMockWorkflowExecutor(input.mockOutputs);
  const executed: { id: string; config: Record<string, unknown> }[] = [];
  const result = await runVisualWorkflowInterpreter({
    definition: toVisualWorkflowExecutionDefinition(compiled),
    organizationId: ORGANIZATION_ID,
    triggerInput: { ...input.triggerInput, triggeredAt: "2026-11-24T00:00:00.000Z" },
    mockMode: true,
    executeNode: async (args) => {
      executed.push({
        id: args.node.id,
        config: args.node.config as unknown as Record<string, unknown>,
      });
      return mockExecutor(args);
    },
  });
  return { result, executed, ran: executed.map((node) => node.id) };
}

const sourceUpload = {
  projectId: PROJECT_ID,
  sourceFileId: "file_1",
  sourcePath: "locales/en/app.json",
  fileName: "app.json",
  targetLocales: ["fr-FR", "de-DE"],
};

/** What each template leaves for the person: Slack channels and who does the work. */
const PERSON_CHOICES: Record<VisualWorkflowTemplateId, string[]> = {
  "ai-translate-on-upload": [
    "notify_slack.channelId",
    "notify_slack_2.channelId",
    "notify_slack_3.channelId",
  ],
  "mtpe-on-upload": ["pick_assignee.rules", "notify_slack.channelId"],
  "tep-on-upload": [
    "pick_assignee.rules",
    "pick_assignee_2.rules",
    "pick_assignee_3.rules",
    "notify_slack.channelId",
  ],
  "review-done-qa": ["notify_slack.channelId", "notify_slack_2.channelId"],
};

describe("visual workflow templates", () => {
  it.each(VISUAL_WORKFLOW_TEMPLATE_IDS)(
    "%s saves as a draft and asks only for the person's choices before publishing",
    (id) => {
      const definition = parseVisualWorkflowV3Definition(buildVisualWorkflowTemplate(id));

      expect(compileVisualWorkflowV3Definition(definition).issues).toEqual([]);
      const issues = validateVisualWorkflowV3Definition(definition);
      expect(issues.every((issue) => issue.reason === "required")).toBe(true);
      expect(issues.map((issue) => `${issue.nodeId}.${issue.field}`)).toEqual(PERSON_CHOICES[id]);
    },
  );

  it.each(VISUAL_WORKFLOW_TEMPLATE_IDS)("%s fills the trigger's project when given one", (id) => {
    const definition = buildVisualWorkflowTemplate(id, { projectId: PROJECT_ID });
    const trigger = definition.nodes.find((node) => node.type.startsWith("trigger."));

    expect(trigger?.config).toMatchObject({ projectId: PROJECT_ID });
  });

  it("AI translation waits for the job, checks its work and reports a pass", async () => {
    const { result, ran, executed } = await runTemplate("ai-translate-on-upload", {
      triggerInput: sourceUpload,
      mockOutputs: {
        machine_translate: { jobId: "job_mt", status: "queued", targetLocales: ["fr-FR"] },
      },
    });

    expect(result.ok).toBe(true);
    expect(ran).toEqual(
      expect.arrayContaining([
        "machine_translate",
        "check_progress",
        "wait",
        "run_qa",
        "notify_slack",
      ]),
    );
    expect(ran).not.toContain("notify_slack_2");
    const configOf = (id: string) => executed.find((node) => node.id === id)?.config;
    expect(configOf("machine_translate")).toMatchObject({
      projectId: PROJECT_ID,
      sourceFileId: "file_1",
    });
    expect(configOf("run_qa")).toMatchObject({ projectId: PROJECT_ID, jobId: "job_mt" });
    expect(configOf("notify_slack")?.message).toContain("locales/en/app.json");
  });

  it("AI translation reports QA errors", async () => {
    const { result, ran } = await runTemplate("ai-translate-on-upload", {
      triggerInput: sourceUpload,
      mockOutputs: {
        run_qa: {
          runId: "qa_1",
          passed: false,
          errorCount: 3,
          warningCount: 0,
          findingCount: 3,
          targetLocales: ["fr-FR"],
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(ran).toContain("notify_slack_2");
    expect(ran).not.toContain("notify_slack");
  });

  it("MTPE assigns one post-edit task per locale after the AI translation, due in two days", async () => {
    const { result, executed } = await runTemplate("mtpe-on-upload", {
      triggerInput: sourceUpload,
      mockOutputs: {
        machine_translate: { jobId: "job_mt", status: "queued", targetLocales: ["fr-FR", "de-DE"] },
      },
    });

    expect(result.ok).toBe(true);
    const tasks = executed.filter((node) => node.id === "create_task");
    expect(tasks.map((task) => task.config.targetLocales)).toEqual(["fr-FR", "de-DE"]);
    expect(tasks[0]?.config).toMatchObject({
      step: "edit",
      afterJobId: "job_mt",
      assigneeWorkosUserId: "user_mock",
      title: "Post-edit app.json (fr-FR)",
      dueInHours: 48,
    });
  });

  it("TEP chains translate, edit and proofread tasks for each of the project's locales", async () => {
    const { result, executed } = await runTemplate("tep-on-upload", {
      triggerInput: sourceUpload,
      mockOutputs: {
        create_task: {
          jobId: "job_translate",
          step: "translate",
          assigned: true,
          targetLocales: [],
        },
        create_task_2: { jobId: "job_edit", step: "edit", assigned: true, targetLocales: [] },
      },
    });

    expect(result.ok).toBe(true);
    const configsOf = (id: string) =>
      executed.filter((node) => node.id === id).map((node) => node.config);
    expect(configsOf("create_task").map((config) => config.targetLocales)).toEqual([
      "fr-FR",
      "de-DE",
    ]);
    expect(configsOf("create_task")[0]).toMatchObject({ step: "translate", afterJobId: "" });
    expect(configsOf("create_task_2")[0]).toMatchObject({
      step: "edit",
      afterJobId: "job_translate",
    });
    expect(configsOf("create_task_3")[0]).toMatchObject({
      step: "proofread",
      afterJobId: "job_edit",
      dueInHours: 72,
    });
  });

  const reviewDone = {
    jobId: "job_1",
    jobKind: "proofread",
    taskStep: "edit",
    status: "succeeded",
    projectId: PROJECT_ID,
    sourceFileId: "file_1",
    targetLocales: ["fr-FR"],
    assigneeId: "user_editor",
  };

  it("review done checks the finished task's work and announces a pass", async () => {
    const { result, ran, executed } = await runTemplate("review-done-qa", {
      triggerInput: reviewDone,
    });

    expect(result.ok).toBe(true);
    expect(executed.find((node) => node.id === "run_qa")?.config).toMatchObject({
      projectId: PROJECT_ID,
      jobId: "job_1",
    });
    expect(ran).toContain("notify_slack");
    expect(ran).not.toContain("create_task");
  });

  it("review done sends failing work back to the same person", async () => {
    const { result, executed } = await runTemplate("review-done-qa", {
      triggerInput: reviewDone,
      mockOutputs: {
        run_qa: {
          runId: "qa_1",
          passed: false,
          errorCount: 2,
          warningCount: 0,
          findingCount: 2,
          targetLocales: ["fr-FR"],
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(executed.find((node) => node.id === "create_task")?.config).toMatchObject({
      step: "edit",
      sourceFileId: "file_1",
      targetLocales: '["fr-FR"]',
      assigneeWorkosUserId: "user_editor",
      title: "Fix 2 QA errors",
      dueInHours: 24,
    });
    expect(executed.map((node) => node.id)).toContain("notify_slack_2");
  });
});
