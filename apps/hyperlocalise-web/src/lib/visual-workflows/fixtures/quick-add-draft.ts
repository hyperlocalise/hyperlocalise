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

export const visualWorkflowQuickAddDraft = fromVisualWorkflowDefinition({
  schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
  name: "Quick-add branches",
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
        cases: [{ value: "pending" }, { value: "ready" }],
      },
    },
    {
      id: "loop",
      type: "logic.for_each",
      config: { kind: "logic.for_each", collection: "[]" },
      bodyNodeIds: ["body"],
    },
    {
      id: "body",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "item", value: "1" }] },
    },
  ],
  edges: [
    { id: "e1", source: "trigger", target: "switch", sourceHandle: null, targetHandle: null },
    { id: "e2", source: "trigger", target: "loop", sourceHandle: null, targetHandle: null },
    { id: "e3", source: "loop", target: "body", sourceHandle: "each", targetHandle: null },
  ],
  editor: {
    positions: {
      trigger: { x: 40, y: 160 },
      switch: { x: 320, y: 80 },
      loop: { x: 320, y: 280 },
      body: { x: 580, y: 280 },
    },
  },
});
