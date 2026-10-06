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

export const visualWorkflowTerminalNodesDraft = fromVisualWorkflowDefinition({
  schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
  name: "Terminal workflow outcomes",
  nodes: [
    { id: "trigger", type: "trigger.manual", config: { kind: "trigger.manual" } },
    {
      id: "stop",
      type: "flow.stop",
      config: { kind: "flow.stop", outcome: "completed", reason: "No more work required" },
    },
    {
      id: "return",
      type: "flow.return",
      config: {
        kind: "flow.return",
        outputs: [{ id: "result", name: "result", type: "string" }],
      },
      inputs: { "value.result": { kind: "literal", value: "accepted" } },
    },
    {
      id: "fail",
      type: "flow.fail",
      config: {
        kind: "flow.fail",
        errorCode: "ORDER_REJECTED",
        message: "The order cannot be processed",
      },
    },
  ],
  edges: [
    {
      id: "trigger-stop",
      source: "trigger",
      target: "stop",
      sourceHandle: null,
      targetHandle: null,
    },
    {
      id: "trigger-return",
      source: "trigger",
      target: "return",
      sourceHandle: null,
      targetHandle: null,
    },
    {
      id: "trigger-fail",
      source: "trigger",
      target: "fail",
      sourceHandle: null,
      targetHandle: null,
    },
  ],
  editor: {
    positions: {
      trigger: { x: 40, y: 240 },
      stop: { x: 440, y: 40 },
      return: { x: 440, y: 240 },
      fail: { x: 440, y: 440 },
    },
  },
});
