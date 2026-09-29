/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 */
import { fromVisualWorkflowDefinition } from "../schema/serializers";
import { VISUAL_WORKFLOW_SCHEMA_VERSION } from "../schema/types";

export const visualWorkflowSequenceDraft = fromVisualWorkflowDefinition({
  schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
  name: "Sequence outputs",
  nodes: [
    { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
    {
      id: "sequence",
      type: "logic.sequence",
      config: {
        kind: "logic.sequence",
        outputs: [
          { id: "prepare", label: "Prepare" },
          { id: "notify", label: "Notify" },
          { id: "audit", label: "Audit" },
        ],
      },
    },
    {
      id: "prepare",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "step", value: "prepare" }] },
    },
    {
      id: "notify",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "step", value: "notify" }] },
    },
    {
      id: "audit",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "step", value: "audit" }] },
    },
  ],
  edges: [
    {
      id: "trigger-sequence",
      source: "trigger",
      target: "sequence",
      sourceHandle: null,
      targetHandle: null,
    },
    {
      id: "sequence-prepare",
      source: "sequence",
      target: "prepare",
      sourceHandle: "prepare",
      targetHandle: null,
    },
    {
      id: "sequence-notify",
      source: "sequence",
      target: "notify",
      sourceHandle: "notify",
      targetHandle: null,
    },
    {
      id: "sequence-audit",
      source: "sequence",
      target: "audit",
      sourceHandle: "audit",
      targetHandle: null,
    },
  ],
  editor: {
    positions: {
      trigger: { x: 40, y: 240 },
      sequence: { x: 380, y: 240 },
      prepare: { x: 780, y: 40 },
      notify: { x: 780, y: 240 },
      audit: { x: 780, y: 440 },
    },
  },
});
