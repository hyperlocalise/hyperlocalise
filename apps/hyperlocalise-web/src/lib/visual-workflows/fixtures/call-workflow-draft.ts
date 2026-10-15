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
import { fromVisualWorkflowV3Definition } from "../schema/serializers";

export const visualWorkflowCallWorkflowDraft = fromVisualWorkflowV3Definition({
  schemaVersion: 3,
  name: "Call reusable workflow",
  nodes: [
    {
      id: "trigger",
      type: "trigger.manual",
      config: { kind: "trigger.manual" },
      outputFields: [{ path: "customerId", type: "string" }],
    },
    {
      id: "call",
      type: "flow.call_workflow",
      config: {
        kind: "flow.call_workflow",
        workflowId: "22222222-2222-4222-8222-222222222222",
        version: 3,
        inputFields: [{ id: "customerId", name: "customerId", type: "string", required: true }],
        outputFields: [
          { id: "result", name: "result", type: "object", required: true },
          { id: "warnings", name: "warnings", type: "array", required: false },
        ],
        onError: "branch",
      },
    },
  ],
  edges: [
    {
      id: "execute-call",
      kind: "execution",
      source: "trigger",
      target: "call",
      sourcePortId: "success",
      targetPortId: "input",
    },
    {
      id: "bind-customer",
      kind: "data",
      source: "trigger",
      target: "call",
      sourcePortId: "customerId",
      targetPortId: "value.customerId",
    },
  ],
  editor: {
    positions: {
      trigger: { x: 80, y: 180 },
      call: { x: 460, y: 180 },
    },
  },
});
