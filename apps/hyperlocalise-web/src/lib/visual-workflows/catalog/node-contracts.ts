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
import type {
  CanonicalVisualWorkflowNode,
  VisualCatalogType,
  WorkflowValueType,
  WorkflowOutputField,
} from "../schema/types";
export type WorkflowInputField = { name: string; type: WorkflowValueType; required?: boolean };
export type NodeContract = {
  inputs: WorkflowInputField[];
  outputs: WorkflowOutputField[];
  mock: Record<string, unknown>;
};
const field = (
  name: string,
  type: WorkflowValueType = "string",
  required = true,
): WorkflowInputField => ({ name, type, required });
const output = (
  path: string,
  type: WorkflowValueType = "string",
  optional = false,
): WorkflowOutputField => ({ path, type, optional });
const trigger: NodeContract = { inputs: [], outputs: [output("triggeredAt")], mock: {} };
export const NODE_CONTRACTS: Record<VisualCatalogType, NodeContract> = {
  "trigger.manual": trigger,
  "trigger.scheduled": { ...trigger, outputs: [...trigger.outputs, output("scheduledRunAt")] },
  "trigger.github": {
    ...trigger,
    outputs: [
      ...trigger.outputs,
      ...["githubDeliveryId", "pushBranch", "commitBefore", "commitAfter"].map((name) =>
        output(name),
      ),
      ...["githubEvent", "githubAction", "pullRequestUrl", "baseBranch", "headBranch"].map((name) =>
        output(name, "string", true),
      ),
      output("pullRequestNumber", "number", true),
    ],
  },
  "trigger.source_upload": {
    ...trigger,
    outputs: [...trigger.outputs, output("projectId"), output("sourceFileId")],
  },
  "action.http": {
    inputs: [field("url"), field("body", "unknown", false)],
    outputs: [
      output("status", "number"),
      output("ok", "boolean"),
      output("headers", "object"),
      output("body"),
      output("json", "unknown", true),
    ],
    mock: { status: 200, ok: true, headers: {}, body: '{"items":[]}', json: { items: [] } },
  },
  "action.notify_slack": {
    inputs: [field("channelId"), field("message")],
    outputs: [output("sent", "boolean"), output("channelId")],
    mock: { sent: true, channelId: "mock-channel" },
  },
  "action.notify_email": {
    inputs: [field("from"), field("recipients"), field("subject"), field("message")],
    outputs: [output("sent", "boolean"), output("recipientCount", "number")],
    mock: { sent: true, recipientCount: 1 },
  },
  "ai.agent": {
    inputs: [field("prompt")],
    outputs: [output("text"), output("json", "unknown", true)],
    mock: { text: "Sample AI result" },
  },
  "logic.if": {
    inputs: [field("condition", "unknown")],
    outputs: [output("result", "boolean")],
    mock: {},
  },
  "logic.switch": {
    inputs: [field("expression", "unknown")],
    outputs: [output("matchedCase")],
    mock: {},
  },
  "logic.set": { inputs: [], outputs: [], mock: {} },
  "logic.for_each": {
    inputs: [field("collection", "array")],
    outputs: [
      output("item", "unknown"),
      output("index", "number"),
      output("count", "number"),
      output("iterationOutputs", "array"),
    ],
    mock: {},
  },
};
export function matchesWorkflowType(value: unknown, type: WorkflowValueType): boolean {
  if (type === "unknown") return true;
  if (type === "array") return Array.isArray(value);
  if (type === "object")
    return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

export function getWorkflowOutputFields(node: CanonicalVisualWorkflowNode): WorkflowOutputField[] {
  const fields = new Map(NODE_CONTRACTS[node.type].outputs.map((field) => [field.path, field]));
  if (node.config.kind === "logic.set") {
    for (const assignment of node.config.assignments)
      fields.set(assignment.key, { path: assignment.key, type: "string" });
    for (const [name, binding] of Object.entries(node.inputs ?? {})) {
      const value = binding.kind === "literal" ? binding.value : undefined;
      const type: WorkflowValueType = Array.isArray(value)
        ? "array"
        : value !== null && typeof value === "object"
          ? "object"
          : typeof value === "string"
            ? "string"
            : typeof value === "number"
              ? "number"
              : typeof value === "boolean"
                ? "boolean"
                : "unknown";
      fields.set(name, { path: name, type });
    }
  }
  for (const field of node.outputFields ?? []) fields.set(field.path, field);
  return [...fields.values()];
}
