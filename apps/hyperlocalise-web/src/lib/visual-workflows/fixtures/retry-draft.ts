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

export const visualWorkflowRetryDraft = fromVisualWorkflowDefinition({
  schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
  name: "Retry attempt wiring",
  nodes: [
    {
      id: "trigger",
      type: "trigger.manual",
      config: { kind: "trigger.manual" },
    },
    {
      id: "retry",
      type: "logic.retry",
      config: {
        kind: "logic.retry",
        maxAttempts: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        jitter: true,
        acknowledgeDuplicateRisk: true,
      },
      bodyNodeIds: ["body"],
    },
    {
      id: "body",
      type: "logic.set",
      config: { kind: "logic.set", assignments: [{ key: "attempt", value: "1" }] },
    },
  ],
  edges: [
    { id: "e1", source: "trigger", target: "retry", sourceHandle: null, targetHandle: null },
    { id: "e2", source: "retry", target: "body", sourceHandle: "attempt", targetHandle: null },
  ],
  editor: {
    positions: {
      trigger: { x: 40, y: 160 },
      retry: { x: 320, y: 160 },
      body: { x: 580, y: 160 },
    },
  },
});
