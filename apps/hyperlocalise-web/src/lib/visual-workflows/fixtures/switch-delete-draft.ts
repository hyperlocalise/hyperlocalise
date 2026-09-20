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

export const visualWorkflowSwitchDeleteDraft = fromVisualWorkflowDefinition({
  schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
  name: "Switch case delete",
  nodes: [
    {
      id: "trigger",
      type: "trigger.manual",
      config: { kind: "trigger.manual" },
    },
    {
      id: "switch",
      type: "logic.switch",
      config: {
        kind: "logic.switch",
        expression: "status",
        cases: [
          { id: "case-pending", value: "pending" },
          { id: "case-ready", value: "ready" },
        ],
      },
    },
    {
      id: "pending",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "branch", value: "pending" }] },
    },
    {
      id: "ready",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "branch", value: "ready" }] },
    },
  ],
  edges: [
    { id: "e1", source: "trigger", target: "switch", sourceHandle: null, targetHandle: null },
    {
      id: "e2",
      source: "switch",
      target: "pending",
      sourceHandle: "case-pending",
      targetHandle: null,
    },
    {
      id: "e3",
      source: "switch",
      target: "ready",
      sourceHandle: "case-ready",
      targetHandle: null,
    },
  ],
  editor: {
    positions: {
      trigger: { x: 40, y: 160 },
      switch: { x: 320, y: 160 },
      pending: { x: 580, y: 80 },
      ready: { x: 580, y: 240 },
    },
  },
});
