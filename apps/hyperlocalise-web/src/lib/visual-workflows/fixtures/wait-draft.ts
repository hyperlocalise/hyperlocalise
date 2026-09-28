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
import { fromVisualWorkflowDefinition } from "../schema/serializers";
import { VISUAL_WORKFLOW_SCHEMA_VERSION } from "../schema/types";

export const visualWorkflowWaitDraft = fromVisualWorkflowDefinition({
  schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
  name: "Wait branches",
  nodes: [
    {
      id: "trigger",
      type: "trigger.manual",
      config: { kind: "trigger.manual" },
    },
    {
      id: "wait",
      type: "flow.wait",
      config: {
        kind: "flow.wait",
        mode: "duration",
        durationMs: 60_000,
      },
    },
    {
      id: "completed",
      type: "logic.set",
      config: {
        kind: "logic.set",
        assignments: [{ key: "waitResult", value: "completed" }],
      },
    },
    {
      id: "timed-out",
      type: "logic.set",
      config: {
        kind: "logic.set",
        assignments: [{ key: "waitResult", value: "timed_out" }],
      },
    },
    {
      id: "error",
      type: "logic.set",
      config: {
        kind: "logic.set",
        assignments: [{ key: "waitResult", value: "error" }],
      },
    },
  ],
  edges: [
    {
      id: "trigger-wait",
      source: "trigger",
      target: "wait",
      sourceHandle: null,
      targetHandle: null,
    },
    {
      id: "wait-completed",
      source: "wait",
      target: "completed",
      sourceHandle: "completed",
      targetHandle: null,
    },
    {
      id: "wait-timed-out",
      source: "wait",
      target: "timed-out",
      sourceHandle: "timed_out",
      targetHandle: null,
    },
    {
      id: "wait-error",
      source: "wait",
      target: "error",
      sourceHandle: "error",
      targetHandle: null,
    },
  ],
  editor: {
    positions: {
      trigger: { x: 40, y: 220 },
      wait: { x: 340, y: 220 },
      completed: { x: 700, y: 80 },
      "timed-out": { x: 700, y: 240 },
      error: { x: 700, y: 400 },
    },
  },
});
