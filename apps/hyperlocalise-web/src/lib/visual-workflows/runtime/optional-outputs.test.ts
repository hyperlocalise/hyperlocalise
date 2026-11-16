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

import { createDefaultConfig } from "../catalog/node-catalog";
import type { VisualNodeConfig, VisualWorkflowDefinition } from "../schema/types";
import { runVisualWorkflowInterpreter } from "./interpreter";

/** A Job changed trigger followed by an Assign task step, run with the given outputs. */
function run(outputs: { trigger: Record<string, unknown>; task: Record<string, unknown> }) {
  const definition: VisualWorkflowDefinition = {
    schemaVersion: 2,
    name: "Assign a proofread when a job changes",
    nodes: [
      {
        id: "trigger",
        type: "trigger.job_changed",
        config: { kind: "trigger.job_changed", eventTypes: ["job.status_changed"] },
      },
      {
        id: "create_task",
        type: "action.create_task",
        config: {
          ...(createDefaultConfig("action.create_task") as Extract<
            VisualNodeConfig,
            { kind: "action.create_task" }
          >),
          projectId: "project_zh",
          sourceFileId: "file_1",
        },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "trigger",
        target: "create_task",
        sourceHandle: null,
        targetHandle: null,
      },
    ],
    editor: { positions: {} },
  };
  return runVisualWorkflowInterpreter({
    definition,
    organizationId: "org_1",
    triggerInput: outputs.trigger,
    executeNode: async ({ node }) => ({
      ok: true,
      output: node.id === "trigger" ? outputs.trigger : outputs.task,
    }),
  });
}

const jobChanged = {
  triggeredAt: "2026-11-14T00:00:00.000Z",
  eventId: "00000000-0000-4000-8000-000000000000",
  eventType: "job.status_changed",
  jobId: "job_1",
  jobKind: "proofread",
  status: "succeeded",
};

const task = {
  jobId: "job_2",
  step: "proofread",
  assigned: false,
  targetLocales: ["en-US"],
};

describe("optional step outputs", () => {
  it("accepts an empty value for an optional output, such as a job with no assignee", async () => {
    const result = await run({
      trigger: { ...jobChanged, projectId: null, previousStatus: null, assigneeType: null },
      task: { ...task, dueAt: null },
    });

    expect(result.ok ? {} : { node: result.failedNodeId, code: result.error.code }).toEqual({});
  });

  it("accepts an Assign task step with no due date", async () => {
    const result = await run({
      trigger: { ...jobChanged, projectId: "project_zh", assigneeType: "user" },
      task: { ...task, dueAt: null },
    });

    expect(result.ok ? {} : { node: result.failedNodeId, code: result.error.code }).toEqual({});
  });

  it("still refuses a value of the wrong type", async () => {
    const result = await run({
      trigger: { ...jobChanged, assigneeType: 7 },
      task: { ...task, dueAt: null },
    });

    expect(result).toMatchObject({
      ok: false,
      failedNodeId: "trigger",
      error: { code: "invalid_node_output" },
    });
  });
});
