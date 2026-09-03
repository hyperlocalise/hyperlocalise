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

export const visualWorkflowDemoDraft = fromVisualWorkflowDefinition({
  schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
  name: "Lead ping",
  nodes: [
    {
      id: "trigger",
      type: "trigger.manual",
      config: { kind: "trigger.manual" },
    },
    {
      id: "http",
      type: "action.http",
      config: { kind: "action.http", method: "GET", url: "https://example.test/leads" },
    },
    {
      id: "branch",
      type: "logic.if",
      config: { kind: "logic.if", condition: "status == 200" },
    },
    {
      id: "agent",
      type: "ai.agent",
      config: { kind: "ai.agent", prompt: "Summarize the lead." },
    },
  ],
  edges: [
    { id: "e1", source: "trigger", target: "http", sourceHandle: null, targetHandle: null },
    { id: "e2", source: "http", target: "branch", sourceHandle: null, targetHandle: null },
    { id: "e3", source: "branch", target: "agent", sourceHandle: "true", targetHandle: null },
  ],
  editor: {
    positions: {
      trigger: { x: 40, y: 160 },
      http: { x: 300, y: 160 },
      branch: { x: 560, y: 160 },
      agent: { x: 820, y: 80 },
    },
  },
});
