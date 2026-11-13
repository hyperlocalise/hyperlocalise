/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 */
import { fromVisualWorkflowDefinition } from "../schema/serializers";
import { VISUAL_WORKFLOW_SCHEMA_VERSION } from "../schema/types";

export const visualWorkflowMergeDraft = fromVisualWorkflowDefinition({
  schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
  name: "Merge branches",
  nodes: [
    { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
    {
      id: "email",
      type: "logic.set",
      config: {
        kind: "logic.set",
        assignments: [{ key: "result", value: "email-sent" }],
      },
    },
    {
      id: "slack",
      type: "logic.set",
      config: {
        kind: "logic.set",
        assignments: [{ key: "result", value: "slack-posted" }],
      },
    },
    {
      id: "merge",
      type: "logic.merge",
      config: {
        kind: "logic.merge",
        mode: "all",
        timeoutMs: 60_000,
        inputs: [
          { id: "email-input", name: "Email" },
          { id: "slack-input", name: "Slack" },
        ],
      },
      inputs: {
        "value.email-input": {
          kind: "reference",
          nodeId: "email",
          path: ["result"],
          optional: true,
        },
        "value.slack-input": {
          kind: "reference",
          nodeId: "slack",
          path: ["result"],
          optional: true,
        },
      },
    },
    {
      id: "completed",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "result", value: "completed" }] },
    },
    {
      id: "timed-out",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "result", value: "timed-out" }] },
    },
    {
      id: "error",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "result", value: "error" }] },
    },
  ],
  edges: [
    {
      id: "trigger-email",
      source: "trigger",
      target: "email",
      sourceHandle: null,
      targetHandle: null,
    },
    {
      id: "trigger-slack",
      source: "trigger",
      target: "slack",
      sourceHandle: null,
      targetHandle: null,
    },
    {
      id: "email-merge",
      source: "email",
      target: "merge",
      sourceHandle: null,
      targetHandle: "email-input",
    },
    {
      id: "slack-merge",
      source: "slack",
      target: "merge",
      sourceHandle: null,
      targetHandle: "slack-input",
    },
    {
      id: "merge-completed",
      source: "merge",
      target: "completed",
      sourceHandle: "completed",
      targetHandle: null,
    },
    {
      id: "merge-timed-out",
      source: "merge",
      target: "timed-out",
      sourceHandle: "timed_out",
      targetHandle: null,
    },
    {
      id: "merge-error",
      source: "merge",
      target: "error",
      sourceHandle: "error",
      targetHandle: null,
    },
  ],
  editor: {
    positions: {
      trigger: { x: 20, y: 220 },
      email: { x: 320, y: 80 },
      slack: { x: 320, y: 360 },
      merge: { x: 680, y: 220 },
      completed: { x: 1040, y: 40 },
      "timed-out": { x: 1040, y: 240 },
      error: { x: 1040, y: 440 },
    },
  },
});
