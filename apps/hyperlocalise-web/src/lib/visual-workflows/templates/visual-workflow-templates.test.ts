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
import {
  buildVisualWorkflowTemplate,
  VISUAL_WORKFLOW_TEMPLATE_IDS,
  type VisualWorkflowTemplateId,
} from "./visual-workflow-templates";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000099";

async function runTemplate(
  id: VisualWorkflowTemplateId,
  input: {
    triggerInput: Record<string, unknown>;
    mockOutputs?: Record<string, Record<string, unknown>>;
  },
) {
  const compiled = compileVisualWorkflowV3Definition(
    parseVisualWorkflowV3Definition(buildVisualWorkflowTemplate(id)),
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

const sourceUpload = { projectId: PROJECT_ID, sourceFileId: "file_1" };

describe("visual workflow templates", () => {
  it.each(VISUAL_WORKFLOW_TEMPLATE_IDS)("%s saves as a draft and publishes", (id) => {
    const definition = parseVisualWorkflowV3Definition(buildVisualWorkflowTemplate(id));

    expect(compileVisualWorkflowV3Definition(definition).issues).toEqual([]);
    expect(validateVisualWorkflowV3Definition(definition)).toEqual([]);
  });

  it.each(VISUAL_WORKFLOW_TEMPLATE_IDS)("%s fills the trigger's project when given one", (id) => {
    const definition = buildVisualWorkflowTemplate(id, { projectId: PROJECT_ID });
    const trigger = definition.nodes.find((node) => node.type.startsWith("trigger."));

    expect(trigger?.config).toMatchObject({ projectId: PROJECT_ID });
  });

  it("AI translation waits for the job, then stops when QA passes", async () => {
    const { result, ran, executed } = await runTemplate("ai-translate-on-upload", {
      triggerInput: sourceUpload,
    });

    expect(result.ok).toBe(true);
    expect(ran).toEqual(
      expect.arrayContaining(["machine_translate", "check_progress", "wait", "run_qa", "stop"]),
    );
    expect(ran).not.toContain("fail_qa");
    expect(executed.find((node) => node.id === "machine_translate")?.config).toMatchObject({
      projectId: PROJECT_ID,
      sourceFileId: "file_1",
    });
  });

  it("AI translation fails the run when QA finds errors", async () => {
    const { result, ran } = await runTemplate("ai-translate-on-upload", {
      triggerInput: sourceUpload,
      mockOutputs: {
        run_qa: { runId: "qa_1", passed: false, errorCount: 3, warningCount: 0, findingCount: 3 },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.failedNodeId).toBe("fail_qa");
    expect(ran).not.toContain("stop");
  });

  it("MTPE assigns one post-edit task per locale after the AI translation", async () => {
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
    });
  });

  it("TEP chains translate, edit and proofread tasks", async () => {
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
    const configOf = (id: string) => executed.find((node) => node.id === id)?.config;
    expect(configOf("create_task")).toMatchObject({ step: "translate", afterJobId: "" });
    expect(configOf("create_task_2")).toMatchObject({ step: "edit", afterJobId: "job_translate" });
    expect(configOf("create_task_3")).toMatchObject({ step: "proofread", afterJobId: "job_edit" });
  });

  it("review done runs QA for the task's project", async () => {
    const { result, executed } = await runTemplate("review-done-qa", {
      triggerInput: {
        jobId: "job_1",
        jobKind: "proofread",
        status: "succeeded",
        projectId: PROJECT_ID,
      },
    });

    expect(result.ok).toBe(true);
    expect(executed.find((node) => node.id === "run_qa")?.config).toMatchObject({
      projectId: PROJECT_ID,
    });
  });
});
