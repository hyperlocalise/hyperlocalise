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
import { isTriggerType } from "../catalog/node-catalog";
import { NODE_CONTRACTS, getWorkflowOutputFields } from "../catalog/node-contracts";
import { readWorkflowPath } from "../runtime/bindings";
import type {
  VisualCatalogType,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
  WorkflowBinding,
  WorkflowOutputField,
} from "../schema/types";

/** Test data by step id: a trigger's sample event, or what an action step returns in a mock run. */
export type VisualWorkflowTestData = Record<string, Record<string, unknown>>;

/** Steps that call out to something, so a mock run uses their test output instead. */
const TEST_OUTPUT_TYPES = new Set<VisualCatalogType>([
  "action.http",
  "action.content_sync",
  "action.notify_slack",
  "action.notify_email",
  "ai.agent",
  "flow.call_workflow",
]);

/** Steps the run engine computes in a mock run exactly as in a live one. */
const COMPUTED_TYPES = new Set<VisualCatalogType>([
  "trigger.manual",
  "trigger.scheduled",
  "trigger.github",
  "trigger.source_upload",
  "logic.if",
  "logic.switch",
  "logic.set",
  "logic.for_each",
  "logic.retry",
  "logic.sequence",
  "logic.try_catch",
  "flow.stop",
  "flow.return",
  "flow.fail",
]);

/** Trigger fields the run sets itself, so a sample event never needs them. */
const RUN_SET_TRIGGER_FIELDS = new Set(["triggeredAt", "scheduledRunAt"]);

const TEMPLATE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

export function takesTestData(type: VisualCatalogType): boolean {
  return isTriggerType(type) || TEST_OUTPUT_TYPES.has(type);
}

/** Only a trigger's sample event is used by a live test; every other step runs for real. */
function usesTestData(type: VisualCatalogType, live: boolean): boolean {
  return isTriggerType(type) || (!live && TEST_OUTPUT_TYPES.has(type));
}

/** The fields a step's test data gives values to: its output pins. */
export function getTestDataFields(node: VisualWorkflowRfNode): WorkflowOutputField[] {
  const trigger = isTriggerType(node.data.catalogType);
  return getWorkflowOutputFields({
    id: node.id,
    type: node.data.catalogType,
    config: node.data.config,
    inputs: node.data.inputs,
    outputFields: node.data.outputFields,
  }).filter(
    (field) => field.path.trim().length > 0 && !(trigger && RUN_SET_TRIGGER_FIELDS.has(field.path)),
  );
}

type TestDataRead = { nodeId: string; path: string[] };

function templateReads(template: string, triggerId: string | undefined): TestDataRead[] {
  return [...template.matchAll(TEMPLATE_PATTERN)].flatMap((match) => {
    const segments = (match[1] ?? "")
      .split(".")
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments[0] === "trigger" && triggerId && segments.length > 1) {
      return [{ nodeId: triggerId, path: segments.slice(1) }];
    }
    if (segments[0] === "nodes" && segments.length > 2) {
      return [{ nodeId: segments[1]!, path: segments.slice(2) }];
    }
    return [];
  });
}

function bindingReads(binding: WorkflowBinding, triggerId: string | undefined): TestDataRead[] {
  if (binding.kind === "reference") {
    const nodeId = binding.nodeId === "$trigger" ? triggerId : binding.nodeId;
    return nodeId ? [{ nodeId, path: binding.path.map(String) }] : [];
  }
  return binding.kind === "template" ? templateReads(binding.template, triggerId) : [];
}

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
}

/** Every value one step reads from another: through a data wire, a binding or a template. */
function collectTestDataReads(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): TestDataRead[] {
  const triggerId = nodes.find((node) => isTriggerType(node.data.catalogType))?.id;
  const wires = edges.flatMap((edge) =>
    edge.data?.kind === "data" && edge.sourceHandle
      ? [{ nodeId: edge.source, path: edge.sourceHandle.split(".") }]
      : [],
  );
  const steps = nodes.flatMap((node) => [
    ...Object.values(node.data.inputs ?? {}).flatMap((binding) => bindingReads(binding, triggerId)),
    ...Object.values(node.data.collect ?? {}).flatMap((binding) =>
      bindingReads(binding, triggerId),
    ),
    ...stringsIn(node.data.config).flatMap((text) => templateReads(text, triggerId)),
  ]);
  return [...wires, ...steps];
}

export type MissingTestValue = {
  nodeId: string;
  path: string;
  /** `required`: the step's output must have it; `read`: another step reads it. */
  reason: "required" | "read";
};

/**
 * The values a test run would need and that have not been set. A mock run invents nothing, so
 * each of these would stop it.
 */
export function findMissingTestValues({
  nodes,
  edges,
  testData,
  live,
}: {
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  testData: VisualWorkflowTestData;
  live: boolean;
}): MissingTestValue[] {
  const reads = collectTestDataReads(nodes, edges);
  return nodes.flatMap((node) => {
    if (!usesTestData(node.data.catalogType, live)) return [];
    const data = testData[node.id] ?? {};
    const isSet = (path: readonly string[]) => readWorkflowPath(data, path) !== undefined;
    const missing = new Map<string, MissingTestValue>();
    for (const field of getTestDataFields(node)) {
      if (!field.optional && !isSet(field.path.split("."))) {
        missing.set(field.path, { nodeId: node.id, path: field.path, reason: "required" });
      }
    }
    for (const read of reads) {
      if (read.nodeId !== node.id || RUN_SET_TRIGGER_FIELDS.has(read.path[0] ?? "")) continue;
      const path = read.path.join(".");
      // A value under one already listed as missing is not listed again.
      const covered = [...missing.keys()].some(
        (listed) => path === listed || path.startsWith(`${listed}.`),
      );
      if (!covered && !isSet(read.path)) {
        missing.set(path, { nodeId: node.id, path, reason: "read" });
      }
    }
    return [...missing.values()];
  });
}

/**
 * What a test run sends: the trigger's sample event, and an entry for every step whose mock
 * result the editor decides. The mock executor invents values only for a step without an entry,
 * so with one an action step returns exactly its test output and a computed step its own result.
 * Wait and Merge are left to the run engine, which settles them from their inputs.
 */
export function buildTestRunData({
  nodes,
  testData,
  live,
}: {
  nodes: readonly VisualWorkflowRfNode[];
  testData: VisualWorkflowTestData;
  live: boolean;
}): { triggerInput: Record<string, unknown>; mockOutputs: VisualWorkflowTestData } {
  const trigger = nodes.find((node) => isTriggerType(node.data.catalogType));
  const triggerInput = structuredClone(trigger ? (testData[trigger.id] ?? {}) : {});
  if (live) return { triggerInput, mockOutputs: {} };
  const mockOutputs: VisualWorkflowTestData = {};
  for (const node of nodes) {
    if (TEST_OUTPUT_TYPES.has(node.data.catalogType)) {
      mockOutputs[node.id] = structuredClone(testData[node.id] ?? {});
    } else if (COMPUTED_TYPES.has(node.data.catalogType)) {
      mockOutputs[node.id] = {};
    }
  }
  return { triggerInput, mockOutputs };
}

function setPath(target: Record<string, unknown>, path: readonly string[], value: unknown) {
  let current = target;
  for (const segment of path.slice(0, -1)) {
    if (["__proto__", "constructor", "prototype"].includes(segment)) return;
    const next = current[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  }
  const key = path.at(-1);
  if (key && !["__proto__", "constructor", "prototype"].includes(key)) current[key] = value;
}

function exampleValue(field: WorkflowOutputField): unknown {
  switch (field.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return `example ${field.path}`;
  }
}

/**
 * Example values for every field of a step, written into its test data where the user sees them.
 * Values already set are kept.
 */
export function exampleTestData(
  node: VisualWorkflowRfNode,
  current: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = TEST_OUTPUT_TYPES.has(node.data.catalogType)
    ? structuredClone(NODE_CONTRACTS[node.data.catalogType].mock)
    : {};
  const next = { ...base, ...structuredClone(current) };
  for (const field of getTestDataFields(node)) {
    const path = field.path.split(".");
    if (readWorkflowPath(next, path) === undefined) setPath(next, path, exampleValue(field));
  }
  return next;
}

/** A step's recorded output from a run, as test data: without the values the run sets itself. */
export function testDataFromOutput(
  node: VisualWorkflowRfNode,
  output: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!output || Object.keys(output).length === 0) return null;
  const data = structuredClone(output);
  delete data.simulated;
  if (isTriggerType(node.data.catalogType)) {
    for (const field of RUN_SET_TRIGGER_FIELDS) delete data[field];
  }
  return data;
}

/** Test data for every step a run recorded an output for, to test with that run's values. */
export function testDataFromRun(
  nodes: readonly VisualWorkflowRfNode[],
  nodeRuns: ReadonlyArray<{
    nodeId: string;
    status: string;
    outputSnapshot?: Record<string, unknown>;
  }>,
): VisualWorkflowTestData {
  const data: VisualWorkflowTestData = {};
  for (const node of nodes) {
    if (!takesTestData(node.data.catalogType)) continue;
    // A step that ran more than once, in a loop or a retry, keeps its last output.
    const nodeRun = nodeRuns.findLast(
      (entry) => entry.nodeId === node.id && entry.status === "succeeded",
    );
    const output = testDataFromOutput(node, nodeRun?.outputSnapshot);
    if (output) data[node.id] = output;
  }
  return data;
}
