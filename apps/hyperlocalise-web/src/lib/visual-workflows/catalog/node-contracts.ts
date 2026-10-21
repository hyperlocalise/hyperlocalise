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
  "action.content_sync": {
    inputs: [
      field("projectId"),
      field("connectionId"),
      field("resourceKey"),
      field("projectFolder"),
    ],
    outputs: [output("pulled", "object"), output("pushed", "object")],
    mock: {
      pulled: { uploaded: 1, skipped: 0, failed: 0 },
      pushed: { written: 1 },
    },
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
  "logic.create_object": {
    inputs: [],
    outputs: [output("value", "object")],
    mock: { value: {} },
  },
  "logic.merge_objects": {
    inputs: [],
    outputs: [output("value", "object")],
    mock: { value: {} },
  },
  "logic.select_path": {
    inputs: [field("value", "unknown"), field("path", "array", false)],
    outputs: [output("value", "unknown"), output("found", "boolean")],
    mock: { value: null, found: false },
  },
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
  "logic.retry": {
    inputs: [
      field("maxAttempts", "number", false),
      field("initialDelayMs", "number", false),
      field("backoffMultiplier", "number", false),
    ],
    outputs: [
      output("attemptNumber", "number"),
      output("exhausted", "boolean"),
      output("lastErrorCode", "string", true),
      output("lastErrorMessage", "string", true),
    ],
    mock: { attemptNumber: 1, exhausted: false },
  },
  "flow.wait": {
    inputs: [
      field("durationMs", "number", false),
      field("timestamp", "string", false),
      field("condition", "unknown", false),
      field("pollingIntervalMs", "number", false),
      field("timeoutMs", "number", false),
    ],
    outputs: [
      output("status"),
      output("scheduledAt", "string"),
      output("resumedAt", "string", true),
    ],
    mock: {
      status: "completed",
      scheduledAt: "2026-01-01T00:00:00.000Z",
      resumedAt: "2026-01-01T00:01:00.000Z",
    },
  },
  "flow.stop": { inputs: [], outputs: [], mock: {} },
  "flow.return": { inputs: [], outputs: [], mock: {} },
  "flow.fail": { inputs: [], outputs: [], mock: {} },
  "logic.merge": {
    inputs: [],
    outputs: [
      output("status"),
      output("selectedInputId", "string", true),
      output("values", "object"),
    ],
    mock: {
      status: "completed",
      values: {},
    },
  },
  "logic.sequence": {
    inputs: [],
    outputs: [],
    mock: {},
  },
  "logic.try_catch": {
    inputs: [],
    outputs: [
      output("errorCode", "string", true),
      output("errorMessage", "string", true),
      output("failedNodeId", "string", true),
      output("attempt", "object", true),
    ],
    mock: {},
  },
  "flow.call_workflow": {
    inputs: [],
    outputs: [],
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

function workflowValueType(value: unknown): WorkflowValueType {
  if (Array.isArray(value)) return "array";
  if (value !== null && typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "unknown";
}

function inferLiteralSelectPathOutput(node: CanonicalVisualWorkflowNode): WorkflowValueType {
  if (node.config.kind !== "logic.select_path") return "unknown";
  const valueBinding = node.inputs?.value;
  const pathBinding = node.inputs?.path;
  if (valueBinding?.kind !== "literal" || (pathBinding && pathBinding.kind !== "literal"))
    return "unknown";
  const path = pathBinding?.value ?? node.config.path;
  if (!Array.isArray(path) || path.length === 0 || path.length > 32) return "unknown";

  let selected = valueBinding.value;
  for (const segment of path) {
    if (
      (typeof segment === "string" &&
        (segment.length === 0 ||
          segment.length > 256 ||
          ["__proto__", "prototype", "constructor"].includes(segment))) ||
      (typeof segment === "number" &&
        (!Number.isInteger(segment) || segment < 0 || segment > 1_000_000)) ||
      (typeof segment !== "string" && typeof segment !== "number")
    )
      return "unknown";
    if (Array.isArray(selected)) {
      if (typeof segment !== "number" || !Object.hasOwn(selected, segment)) return "unknown";
      selected = selected[segment];
    } else if (
      selected !== null &&
      typeof selected === "object" &&
      typeof segment === "string" &&
      Object.hasOwn(selected, segment)
    ) {
      selected = (selected as Record<string, unknown>)[segment];
    } else return "unknown";
  }
  return workflowValueType(selected);
}

export function getWorkflowOutputFields(node: CanonicalVisualWorkflowNode): WorkflowOutputField[] {
  const fields = new Map(NODE_CONTRACTS[node.type].outputs.map((field) => [field.path, field]));
  if (node.config.kind === "logic.select_path") {
    const outputType =
      node.config.outputType === "unknown"
        ? inferLiteralSelectPathOutput(node)
        : node.config.outputType;
    fields.set("value", {
      path: "value",
      type: outputType,
      optional: node.config.missingBehavior === "optional",
    });
  }
  if (node.config.kind === "logic.set") {
    for (const assignment of node.config.assignments)
      fields.set(assignment.key, { path: assignment.key, type: "string" });
    for (const [name, binding] of Object.entries(node.inputs ?? {})) {
      if (binding.kind === "secret") {
        continue;
      }

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
  if (node.config.kind === "flow.call_workflow") {
    for (const outputField of node.config.outputFields) {
      fields.set(`value.${outputField.id}`, {
        path: `value.${outputField.id}`,
        type: outputField.type,
        optional: outputField.required === false,
      });
    }
  }
  for (const field of node.outputFields ?? []) fields.set(field.path, field);
  return [...fields.values()];
}

export function getWorkflowInputFields(node: CanonicalVisualWorkflowNode): WorkflowInputField[] {
  if (node.config.kind === "logic.create_object") {
    return node.config.fields.map((objectField) => ({
      name: `value.${objectField.id}`,
      type: objectField.type,
      required: !Object.hasOwn(objectField, "defaultValue"),
    }));
  }

  if (node.config.kind === "logic.merge_objects") {
    return node.config.inputs.map((objectInput) => ({
      name: `value.${objectInput.id}`,
      type: "object",
      required: true,
    }));
  }

  if (node.config.kind === "flow.return") {
    return node.config.outputs.map((returnOutput) => ({
      name: `value.${returnOutput.id}`,
      type: returnOutput.type,
      required: true,
    }));
  }

  if (node.config.kind === "flow.call_workflow") {
    return node.config.inputFields.map((inputField) => ({
      name: `value.${inputField.id}`,
      type: inputField.type,
      required: inputField.required !== false,
    }));
  }

  return NODE_CONTRACTS[node.type].inputs;
}
