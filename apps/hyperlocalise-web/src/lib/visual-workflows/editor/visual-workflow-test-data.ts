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
import { z } from "zod";

import { isTriggerType } from "../catalog/node-catalog";
import { NODE_CONTRACTS, getWorkflowOutputFields } from "../catalog/node-contracts";
import { readWorkflowPath } from "../runtime/bindings";
import { WORKFLOW_LIMITS } from "../runtime/limits";
import type {
  VisualCatalogType,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
  WorkflowBinding,
  WorkflowOutputField,
} from "../schema/types";

/** Test data by step id: a trigger's sample event, or what a mocked step returns in a test run. */
export type VisualWorkflowTestData = Record<string, Record<string, unknown>>;

/** How a mocked step fails in a test run, in place of returning its test data. */
export type VisualWorkflowTestFailure = { code?: string; message?: string };

/** What the editor keeps for test runs, saved with the draft and never published. */
export type VisualWorkflowTestSetup = {
  data: VisualWorkflowTestData;
  /** Mockable steps that run for real in a test run; every other one gives its test data. */
  realNodeIds: string[];
  /** Mocked steps that fail in a test run. */
  failures: Record<string, VisualWorkflowTestFailure>;
};

export const EMPTY_VISUAL_WORKFLOW_TEST_SETUP: VisualWorkflowTestSetup = {
  data: {},
  realNodeIds: [],
  failures: {},
};

/** The most a workflow's saved test setup may hold, as JSON text. */
const TEST_SETUP_MAX_BYTES = 512_000;

const STEP_ID_SCHEMA = z.string().min(1).max(128);

export const visualWorkflowTestFailuresSchema = z.record(
  STEP_ID_SCHEMA,
  z
    .object({
      code: z.string().trim().max(128).optional(),
      message: z.string().max(2000).optional(),
    })
    .strict(),
);

export const visualWorkflowTestSetupSchema = z
  .object({
    data: z.record(STEP_ID_SCHEMA, z.record(z.string(), z.unknown())).default({}),
    realNodeIds: z.array(STEP_ID_SCHEMA).max(WORKFLOW_LIMITS.nodes).default([]),
    failures: visualWorkflowTestFailuresSchema.default({}),
  })
  .strict()
  .refine((value) => JSON.stringify(value).length <= TEST_SETUP_MAX_BYTES, {
    message: "Test data is too large to save.",
  });

/**
 * Whether a test run can take a step's result from its test data. A mockable step's result comes
 * from outside the run: a trigger's event, or what a call to something returns. Every other step
 * is worked out by the run from its inputs, in a test as in a live run, so it has no test data.
 * Typed over every step type, so a new type has to choose.
 */
const MOCKABLE: Record<VisualCatalogType, boolean> = {
  "trigger.manual": true,
  "trigger.scheduled": true,
  "trigger.github": true,
  "trigger.source_upload": true,
  "trigger.webhook": true,
  "action.http": true,
  "action.content_sync": true,
  "action.notify_slack": true,
  "action.notify_email": true,
  "action.machine_translate": true,
  "action.create_task": true,
  "action.check_progress": true,
  "action.run_qa": true,
  "action.list_source_files": true,
  "action.update_job": true,
  "action.pick_assignee": true,
  "action.crowdin_pre_translate": true,
  "action.crowdin_create_task": true,
  "action.crowdin_check_progress": true,
  "ai.agent": true,
  "flow.call_workflow": true,
  "logic.if": false,
  "logic.switch": false,
  "logic.set": false,
  "logic.create_object": false,
  "logic.merge_objects": false,
  "logic.select_path": false,
  "logic.coalesce": false,
  "logic.compare": false,
  "logic.for_each": false,
  "logic.retry": false,
  "logic.sequence": false,
  "logic.try_catch": false,
  "logic.merge": false,
  "flow.human_approval": true,
  "flow.wait": false,
  "flow.stop": false,
  "flow.return": false,
  "flow.fail": false,
};

/** Trigger fields the run sets itself, so a sample event never needs them. */
const RUN_SET_TRIGGER_FIELDS = new Set(["triggeredAt", "scheduledRunAt"]);

const TEMPLATE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Whether a step has a Test tab: its result in a test run can come from its test data. */
export function isMockable(type: VisualCatalogType): boolean {
  return MOCKABLE[type];
}

/** Whether a test run can run a step for real in place of using its test data. A trigger cannot. */
export function canRunForReal(type: VisualCatalogType): boolean {
  return MOCKABLE[type] && !isTriggerType(type);
}

/** The steps a test run with this setup runs for real: listed, present and able to. */
export function realTestNodeIds(
  nodes: readonly VisualWorkflowRfNode[],
  setup: VisualWorkflowTestSetup,
): Set<string> {
  const listed = new Set(setup.realNodeIds);
  return new Set(
    nodes
      .filter((node) => listed.has(node.id) && canRunForReal(node.data.catalogType))
      .map((node) => node.id),
  );
}

/** The failure a step is set to give in a test run, or undefined when it gives its test data. */
export function testFailureOf(
  node: VisualWorkflowRfNode,
  setup: VisualWorkflowTestSetup,
): VisualWorkflowTestFailure | undefined {
  if (!canRunForReal(node.data.catalogType) || setup.realNodeIds.includes(node.id)) return;
  return setup.failures[node.id];
}

/** A test run uses a step's test data when it is a trigger, or a mockable step left mocked. */
function usesTestData(node: VisualWorkflowRfNode, real: ReadonlySet<string>): boolean {
  return isMockable(node.data.catalogType) && !real.has(node.id);
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

/** A value one step reads from another. */
type StepRead = TestDataRead & { readerId: string };

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
export function listStepReads(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): StepRead[] {
  const triggerId = nodes.find((node) => isTriggerType(node.data.catalogType))?.id;
  const wires = edges.flatMap((edge) =>
    edge.data?.kind === "data" && edge.sourceHandle
      ? [{ readerId: edge.target, nodeId: edge.source, path: edge.sourceHandle.split(".") }]
      : [],
  );
  const steps = nodes.flatMap((node) =>
    [
      ...Object.values(node.data.inputs ?? {}).flatMap((binding) =>
        bindingReads(binding, triggerId),
      ),
      ...Object.values(node.data.collect ?? {}).flatMap((binding) =>
        bindingReads(binding, triggerId),
      ),
      ...stringsIn(node.data.config).flatMap((text) => templateReads(text, triggerId)),
    ].map((read) => ({ ...read, readerId: node.id })),
  );
  return [...wires, ...steps];
}

export type MissingTestValue = {
  nodeId: string;
  path: string;
  /** `required`: the step's output must have it; `read`: another step reads it. */
  reason: "required" | "read";
};

/**
 * The values a test run would need and that have not been set. A test run invents nothing, so
 * each of these would stop it. A step that runs for real, or is set to fail, needs none.
 */
export function findMissingTestValues({
  nodes,
  edges,
  setup,
}: {
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  setup: VisualWorkflowTestSetup;
}): MissingTestValue[] {
  const reads = listStepReads(nodes, edges);
  const real = realTestNodeIds(nodes, setup);
  return nodes.flatMap((node) => {
    if (!usesTestData(node, real) || testFailureOf(node, setup)) return [];
    const data = setup.data[node.id] ?? {};
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

/** A step that runs for real in a test and reads values that come from mocked steps. */
export type RealStepFedByTestData = { nodeId: string; mockedNodeIds: string[] };

/**
 * The steps a test run runs for real that read, directly or through steps the run works out, a
 * value from a mocked step. Such a step acts for real on test data. The trigger's sample event is
 * not counted: every test run uses one.
 */
export function findRealStepsFedByTestData({
  nodes,
  edges,
  setup,
}: {
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  setup: VisualWorkflowTestSetup;
}): RealStepFedByTestData[] {
  const real = realTestNodeIds(nodes, setup);
  if (real.size === 0) return [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sources = new Map<string, Set<string>>();
  for (const read of listStepReads(nodes, edges)) {
    if (read.nodeId === read.readerId || !byId.has(read.nodeId)) continue;
    const set = sources.get(read.readerId) ?? new Set<string>();
    set.add(read.nodeId);
    sources.set(read.readerId, set);
  }
  return nodes.flatMap((node) => {
    if (!real.has(node.id)) return [];
    const mocked = new Set<string>();
    const seen = new Set<string>([node.id]);
    const queue = [...(sources.get(node.id) ?? [])];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const source = byId.get(id)!;
      const type = source.data.catalogType;
      if (isTriggerType(type) || real.has(id)) continue;
      if (canRunForReal(type)) {
        mocked.add(id);
        continue;
      }
      // A step the run works out passes on whatever it reads.
      queue.push(...(sources.get(id) ?? []));
    }
    return mocked.size > 0 ? [{ nodeId: node.id, mockedNodeIds: [...mocked] }] : [];
  });
}

/** What a test run sends to the run engine. */
export type VisualWorkflowTestRunData = {
  /** `live` when every step that could be mocked runs for real, as in a live run. */
  mode: "mock" | "live";
  triggerInput: Record<string, unknown>;
  mockOutputs: VisualWorkflowTestData;
  realNodeIds: string[];
  mockFailures: Record<string, VisualWorkflowTestFailure>;
};

/**
 * What a test run sends: the trigger's sample event, an entry for every step whose result the
 * editor decides, the steps that run for real, and the mocked steps that fail. A step with an
 * entry returns exactly its test data, or its own result when the run works it out; the mock
 * executor makes up values only for a step without one, and a step that runs for real has none.
 */
export function buildTestRunData({
  nodes,
  setup,
}: {
  nodes: readonly VisualWorkflowRfNode[];
  setup: VisualWorkflowTestSetup;
}): VisualWorkflowTestRunData {
  const trigger = nodes.find((node) => isTriggerType(node.data.catalogType));
  const triggerInput = structuredClone(trigger ? (setup.data[trigger.id] ?? {}) : {});
  const real = realTestNodeIds(nodes, setup);
  const realSteps = nodes.filter((node) => canRunForReal(node.data.catalogType));
  if (realSteps.length > 0 && realSteps.every((node) => real.has(node.id))) {
    return {
      mode: "live",
      triggerInput,
      mockOutputs: {},
      realNodeIds: [...real],
      mockFailures: {},
    };
  }
  const mockOutputs: VisualWorkflowTestData = {};
  const mockFailures: Record<string, VisualWorkflowTestFailure> = {};
  for (const node of nodes) {
    if (real.has(node.id)) continue;
    const failure = testFailureOf(node, setup);
    if (failure) mockFailures[node.id] = structuredClone(failure);
    mockOutputs[node.id] = canRunForReal(node.data.catalogType)
      ? structuredClone(setup.data[node.id] ?? {})
      : {};
  }
  return { mode: "mock", triggerInput, mockOutputs, realNodeIds: [...real], mockFailures };
}

/** The setup without entries for steps the workflow no longer has. */
export function pruneTestSetup(
  setup: VisualWorkflowTestSetup,
  nodeIds: Iterable<string>,
): VisualWorkflowTestSetup {
  const ids = new Set(nodeIds);
  return {
    data: Object.fromEntries(Object.entries(setup.data).filter(([id]) => ids.has(id))),
    realNodeIds: setup.realNodeIds.filter((id) => ids.has(id)),
    failures: Object.fromEntries(Object.entries(setup.failures).filter(([id]) => ids.has(id))),
  };
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

/** Test data with one value set, or removed when `value` is undefined. */
export function withTestValue(
  data: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const next = structuredClone(data);
  const segments = path.split(".");
  if (value !== undefined) {
    setPath(next, segments, value);
    return next;
  }
  const parent = readWorkflowPath(next, segments.slice(0, -1));
  if (parent && typeof parent === "object")
    delete (parent as Record<string, unknown>)[segments.at(-1)!];
  return next;
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
  const base = canRunForReal(node.data.catalogType)
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
    if (!isMockable(node.data.catalogType)) continue;
    // A step that ran more than once, in a loop or a retry, keeps its last output.
    const nodeRun = nodeRuns.findLast(
      (entry) => entry.nodeId === node.id && entry.status === "succeeded",
    );
    const output = testDataFromOutput(node, nodeRun?.outputSnapshot);
    if (output) data[node.id] = output;
  }
  return data;
}
