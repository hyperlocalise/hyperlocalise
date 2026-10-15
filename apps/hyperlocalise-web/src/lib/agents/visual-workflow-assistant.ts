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

import { assertNever } from "@/lib/primitives/assert-never/assert-never";
import {
  createDefaultConfig,
  getVisualNodeDimensions,
  isTriggerType,
  resolveNodeSubtitle,
  VISUAL_NODE_CATALOG,
} from "@/lib/visual-workflows/catalog/node-catalog";
import { NODE_CONTRACTS } from "@/lib/visual-workflows/catalog/node-contracts";
import { VISUAL_NODE_DESCRIPTIONS } from "@/lib/visual-workflows/catalog/node-descriptions";
import { getVisualWorkflowDataPorts } from "@/lib/visual-workflows/editor/visual-workflow-data-ports";
import {
  applyNodeConfigUpdate,
  applyVisualWorkflowGraphConnection,
  reconcileFlowBodyMembership,
  removeVisualWorkflowNode,
} from "@/lib/visual-workflows/editor/visual-workflow-editor-graph";
import { nextVisualWorkflowNodeId } from "@/lib/visual-workflows/editor/visual-workflow-node-id";
import { placeNewVisualWorkflowNode } from "@/lib/visual-workflows/editor/visual-workflow-node-placement";
import { fieldReference } from "@/lib/visual-workflows/editor/visual-workflow-upstream-fields";
import {
  visualCatalogTypeSchema,
  visualNodeConfigSchema,
  visualWorkflowV3DefinitionSchema,
} from "@/lib/visual-workflows/schema/definition-schema";
import {
  fromVisualWorkflowV3Definition,
  toVisualWorkflowV3Definition,
} from "@/lib/visual-workflows/schema/serializers";
import type {
  VisualCatalogType,
  VisualNodeConfig,
  VisualWorkflowEditorState,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
  VisualWorkflowV3Definition,
} from "@/lib/visual-workflows/schema/types";
import {
  collectWorkflowSecrets,
  redactWorkflowSnapshot,
} from "@/lib/visual-workflows/runtime/snapshots";
import { getAllowedExecutionSourceHandles } from "@/lib/visual-workflows/validation/execution-handles";
import {
  validateVisualWorkflowConnection,
  type ConnectionValidationCode,
} from "@/lib/visual-workflows/validation/validate-connection";
import { validateVisualWorkflowV3Definition } from "@/lib/visual-workflows/validation/validate-workflow-v3";

import {
  isAssistantToolPart,
  type AutomationAssistantCallSummary,
  type AutomationAssistantEditor,
} from "./automation-assistant-editor";
import {
  VISUAL_WORKFLOW_EDITOR_CONTEXT_KIND,
  visualWorkflowEditorContextSchema,
  type VisualWorkflowEditorContext,
} from "./visual-workflow-editor-context";
import {
  findVisualWorkflowReferenceProblems,
  type VisualWorkflowReferenceProblem,
} from "./visual-workflow-references";

export const EDIT_VISUAL_WORKFLOW_TOOL_NAME = "edit_visual_workflow";

const MAX_OPERATIONS = 50;
const MAX_NAME_CHARS = 120;
/** A node id the model chooses: short and readable, as the editor names a new step. */
const newNodeIdSchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const nodeIdSchema = z.string().trim().min(1).max(128);
const handleSchema = z.string().max(64).nullable();
const positionSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

const addNodeSchema = z.object({
  op: z.literal("add_node"),
  id: newNodeIdSchema,
  type: visualCatalogTypeSchema,
  /** Places the node after this one and connects it from this output; null for nowhere. */
  after: z.object({ nodeId: nodeIdSchema, handle: handleSchema }).nullable().optional(),
  /** Settings merged into the type's defaults. */
  config: z.record(z.string(), z.unknown()).nullable().optional(),
});

const operationSchema = z.discriminatedUnion("op", [
  addNodeSchema,
  z.object({ op: z.literal("remove_node"), nodeId: nodeIdSchema }),
  z.object({
    op: z.literal("connect"),
    source: nodeIdSchema,
    sourceHandle: handleSchema,
    target: nodeIdSchema,
    targetHandle: handleSchema,
  }),
  z.object({
    op: z.literal("disconnect"),
    source: nodeIdSchema,
    target: nodeIdSchema,
    sourceHandle: handleSchema.optional(),
    targetHandle: handleSchema.optional(),
  }),
  z.object({
    op: z.literal("configure_node"),
    nodeId: nodeIdSchema,
    /** Settings merged into the node's; null for none. */
    config: z.record(z.string(), z.unknown()).nullable().optional(),
  }),
  z.object({
    op: z.literal("rename_workflow"),
    name: z.string().trim().min(1).max(MAX_NAME_CHARS),
  }),
]);

export type VisualWorkflowEditOperation = z.infer<typeof operationSchema>;

/** What the tool takes: the changes to make, in order. */
export const visualWorkflowEditInputSchema = z.object({
  operations: z.array(operationSchema).min(1).max(MAX_OPERATIONS),
});

export type VisualWorkflowEditInput = z.infer<typeof visualWorkflowEditInputSchema>;

/** An operation as it was applied: an added node carries where it was put. */
const resolvedOperationSchema = z.discriminatedUnion("op", [
  addNodeSchema.extend({ position: positionSchema }),
  ...operationSchema.options.filter(
    (option): option is Exclude<typeof option, typeof addNodeSchema> => option !== addNodeSchema,
  ),
]);

export type VisualWorkflowResolvedOperation = z.infer<typeof resolvedOperationSchema>;

export type VisualWorkflowEditRejection =
  | "unknown_node"
  | "node_id_taken"
  | "trigger_exists"
  | "unknown_edge"
  | "invalid_config"
  | ConnectionValidationCode;

export type VisualWorkflowEditResult =
  | { status: "applied"; op: VisualWorkflowResolvedOperation }
  | {
      status: "rejected";
      op: VisualWorkflowEditOperation;
      code: VisualWorkflowEditRejection;
      message: string;
    };

const edgeEndsSchema = z.object({
  source: nodeIdSchema,
  sourceHandle: handleSchema,
  target: nodeIdSchema,
  targetHandle: handleSchema,
});

/**
 * One thing the person changed on the workflow themselves between two turns, and the shapes a
 * call's change lines share with it, so the panel words both the same way.
 */
export const visualWorkflowPageEditSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workflow_renamed"), name: z.string() }),
  z.object({ kind: z.literal("node_added"), nodeId: nodeIdSchema, type: visualCatalogTypeSchema }),
  z.object({
    kind: z.literal("node_removed"),
    nodeId: nodeIdSchema,
    type: visualCatalogTypeSchema,
  }),
  z.object({
    kind: z.literal("node_configured"),
    nodeId: nodeIdSchema,
    type: visualCatalogTypeSchema,
    /** The settings that changed, by name. */
    fields: z.array(z.string()),
  }),
  edgeEndsSchema.extend({ kind: z.literal("edge_added") }),
  edgeEndsSchema.extend({ kind: z.literal("edge_removed") }),
]);

export type VisualWorkflowPageEdit = z.infer<typeof visualWorkflowPageEditSchema>;

/** One thing a call of the tool did on the workflow, or could not do, as the panel lists it. */
export const visualWorkflowChangeLineSchema = z.discriminatedUnion("kind", [
  ...visualWorkflowPageEditSchema.options,
  z.object({
    kind: z.literal("rejected"),
    op: z.enum([
      "add_node",
      "remove_node",
      "connect",
      "disconnect",
      "configure_node",
      "rename_workflow",
    ]),
    code: z.string(),
  }),
]);

export type VisualWorkflowChangeLine = z.infer<typeof visualWorkflowChangeLineSchema>;

/** The part of the tool's output the editor page acts on. */
export const visualWorkflowEditChangeSchema = z.object({
  applied: z.literal(true),
  editorSessionId: z.string().min(1),
  operations: z.array(resolvedOperationSchema),
});

export type VisualWorkflowEditChange = z.infer<typeof visualWorkflowEditChangeSchema>;

export type VisualWorkflowEditCallSummary =
  AutomationAssistantCallSummary<VisualWorkflowChangeLine>;

/** The config rules of one node type, as a plain object schema so settings can be picked from it. */
function nodeConfigSchemaFor(type: VisualCatalogType): z.ZodObject<z.ZodRawShape> {
  const variant = visualNodeConfigSchema.options.find((option) => option.shape.kind.value === type);
  if (!variant) {
    throw new Error(`No config schema for node type ${type}`);
  }
  return variant as z.ZodObject<z.ZodRawShape>;
}

/** Settings of a type that only the person sets, on the step's panel. */
const PERSON_ONLY_SETTINGS: Partial<Record<VisualCatalogType, readonly string[]>> = {
  // The called workflow, its version and its fields come from a workflow the person picks.
  "flow.call_workflow": ["workflowId", "version", "inputFields", "outputFields"],
};

function describeZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "value"}: ${issue.message}`)
    .join("; ");
}

/**
 * The settings merged into a node's config. Each given setting is checked against the type's
 * own rules; the rest of the config is left as it is, which may be incomplete, as a node fresh
 * from the picker is. What the whole workflow still lacks is reported with the result instead.
 */
function mergeConfig(
  type: VisualCatalogType,
  current: VisualNodeConfig,
  patch: Record<string, unknown> | null | undefined,
): { config: VisualNodeConfig } | { error: string } {
  const keys = Object.keys(patch ?? {});
  if (!patch || keys.length === 0) {
    return { config: current };
  }
  const personOnly = keys.filter((key) => PERSON_ONLY_SETTINGS[type]?.includes(key));
  if (personOnly.length > 0) {
    return {
      error: `${personOnly.join(", ")} on ${VISUAL_NODE_DESCRIPTIONS[type].title} is chosen by the person on the step's panel.`,
    };
  }
  const variant = nodeConfigSchemaFor(type);
  const unknown = keys.filter((key) => key === "kind" || !(key in variant.shape));
  if (unknown.length > 0) {
    return {
      error: `${VISUAL_NODE_DESCRIPTIONS[type].title} has no setting called ${unknown.join(", ")}.`,
    };
  }
  const parsed = variant
    .pick(Object.fromEntries(keys.map((key) => [key, true as const])))
    .safeParse(patch);
  return parsed.success
    ? { config: { ...current, ...parsed.data } as VisualNodeConfig }
    : { error: describeZodIssues(parsed.error) };
}

function describeConnectionEnds(input: {
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
}) {
  return {
    source: input.source,
    sourceHandle: input.sourceHandle ?? null,
    target: input.target,
    targetHandle: input.targetHandle ?? null,
  };
}

type Graph = { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[] };

function rejected(
  op: VisualWorkflowEditOperation,
  code: VisualWorkflowEditRejection,
  message: string,
): VisualWorkflowEditResult {
  return { status: "rejected", op, code, message };
}

/**
 * The node without the stored bindings of the given settings, as the panel's "Edit as text"
 * leaves it: a binding would override the value at run time.
 */
function withoutBindingsOf(node: VisualWorkflowRfNode, keys: readonly string[]) {
  const bound = Object.keys(node.data.inputs ?? {});
  const dropped = bound.filter((name) =>
    keys.some((key) => name === key || name.startsWith(`${key}.`)),
  );
  if (dropped.length === 0) {
    return node;
  }
  const inputs = Object.fromEntries(
    Object.entries(node.data.inputs ?? {}).filter(([name]) => !dropped.includes(name)),
  );
  return { ...node, data: { ...node.data, inputs } };
}

function applyOne(
  state: VisualWorkflowEditorState,
  op: VisualWorkflowEditOperation | VisualWorkflowResolvedOperation,
): { state: VisualWorkflowEditorState; result: VisualWorkflowEditResult } {
  const { nodes, edges } = state;
  const find = (id: string) => nodes.find((node) => node.id === id);
  const withGraph = (graph: Graph) => ({ ...state, ...graph });

  switch (op.op) {
    case "add_node": {
      if (find(op.id)) {
        return {
          state,
          result: rejected(op, "node_id_taken", `A node with the id ${op.id} is already there.`),
        };
      }
      if (isTriggerType(op.type) && nodes.some((node) => isTriggerType(node.data.catalogType))) {
        return {
          state,
          result: rejected(
            op,
            "trigger_exists",
            "The workflow already has a trigger; it can have only one.",
          ),
        };
      }
      const source = op.after ? find(op.after.nodeId) : undefined;
      if (op.after && !source) {
        return {
          state,
          result: rejected(op, "unknown_node", `There is no node with the id ${op.after.nodeId}.`),
        };
      }
      const merged = mergeConfig(op.type, createDefaultConfig(op.type), op.config);
      if ("error" in merged) {
        return { state, result: rejected(op, "invalid_config", merged.error) };
      }
      const position =
        "position" in op
          ? op.position
          : placeNewVisualWorkflowNode({ nodes, source, handleId: op.after?.handle });
      const node: VisualWorkflowRfNode = {
        id: op.id,
        type: op.type,
        position,
        ...getVisualNodeDimensions(op.type, merged.config),
        data: { catalogType: op.type, config: merged.config, runStatus: "idle" },
      };
      const resolved: VisualWorkflowResolvedOperation = { ...op, position };
      if (!source || isTriggerType(op.type)) {
        return {
          state: withGraph({ nodes: [...nodes, node], edges }),
          result: { status: "applied", op: resolved },
        };
      }
      const connection = {
        source: source.id,
        target: node.id,
        sourceHandle: op.after?.handle ?? null,
        targetHandle: null,
      };
      const validation = validateVisualWorkflowConnection({
        nodes: [...nodes, node],
        edges,
        connection,
      });
      if (!validation.valid) {
        return { state, result: rejected(op, validation.code, validation.message) };
      }
      return {
        state: withGraph(applyVisualWorkflowGraphConnection([...nodes, node], edges, connection)),
        result: { status: "applied", op: resolved },
      };
    }
    case "remove_node": {
      if (!find(op.nodeId)) {
        return {
          state,
          result: rejected(op, "unknown_node", `There is no node with the id ${op.nodeId}.`),
        };
      }
      return {
        state: withGraph(removeVisualWorkflowNode(nodes, edges, op.nodeId)),
        result: { status: "applied", op },
      };
    }
    case "connect": {
      for (const id of [op.source, op.target]) {
        if (!find(id)) {
          return {
            state,
            result: rejected(op, "unknown_node", `There is no node with the id ${id}.`),
          };
        }
      }
      const connection = {
        source: op.source,
        target: op.target,
        sourceHandle: op.sourceHandle,
        targetHandle: op.targetHandle,
      };
      const validation = validateVisualWorkflowConnection({ nodes, edges, connection });
      if (!validation.valid) {
        return { state, result: rejected(op, validation.code, validation.message) };
      }
      return {
        state: withGraph(applyVisualWorkflowGraphConnection(nodes, edges, connection)),
        result: { status: "applied", op },
      };
    }
    case "disconnect": {
      const matches = (edge: VisualWorkflowRfEdge) =>
        edge.source === op.source &&
        edge.target === op.target &&
        (op.sourceHandle === undefined || (edge.sourceHandle ?? null) === op.sourceHandle) &&
        (op.targetHandle === undefined || (edge.targetHandle ?? null) === op.targetHandle);
      if (!edges.some(matches)) {
        return {
          state,
          result: rejected(
            op,
            "unknown_edge",
            `There is no connection from ${op.source} to ${op.target}.`,
          ),
        };
      }
      const kept = edges.filter((edge) => !matches(edge));
      return {
        state: withGraph({ nodes: reconcileFlowBodyMembership(nodes, kept), edges: kept }),
        result: { status: "applied", op },
      };
    }
    case "configure_node": {
      const node = find(op.nodeId);
      if (!node) {
        return {
          state,
          result: rejected(op, "unknown_node", `There is no node with the id ${op.nodeId}.`),
        };
      }
      const keys = Object.keys(op.config ?? {});
      if (keys.length === 0) {
        return { state, result: { status: "applied", op } };
      }
      const merged = mergeConfig(node.data.catalogType, node.data.config, op.config);
      if ("error" in merged) {
        return { state, result: rejected(op, "invalid_config", merged.error) };
      }
      const graph = applyNodeConfigUpdate(nodes, edges, node.id, merged.config);
      return {
        state: withGraph({
          nodes: graph.nodes.map((entry) =>
            entry.id === node.id ? withoutBindingsOf(entry, keys) : entry,
          ),
          edges: graph.edges,
        }),
        result: { status: "applied", op },
      };
    }
    case "rename_workflow":
      return { state: { ...state, name: op.name.trim() }, result: { status: "applied", op } };
    default:
      return assertNever(op);
  }
}

/**
 * Applies the operations to the workflow in order, keeping going past one that is rejected, and
 * says what became of each. The page applies the operations that were applied with the same
 * function, so both end with the same workflow unless the person has edited the canvas since.
 */
export function applyVisualWorkflowEdits(input: {
  state: VisualWorkflowEditorState;
  operations: ReadonlyArray<VisualWorkflowEditOperation | VisualWorkflowResolvedOperation>;
}): { state: VisualWorkflowEditorState; results: VisualWorkflowEditResult[] } {
  let state = input.state;
  const results: VisualWorkflowEditResult[] = [];
  for (const op of input.operations) {
    const next = applyOne(state, op);
    state = next.state;
    results.push(next.result);
  }
  return { state, results };
}

function nodeType(state: VisualWorkflowEditorState, nodeId: string): VisualCatalogType {
  return state.nodes.find((node) => node.id === nodeId)?.data.catalogType ?? "action.http";
}

/** What a call did, in the order it did it, with what it could not do last. */
export function toVisualWorkflowChangeLines(
  before: VisualWorkflowEditorState,
  results: readonly VisualWorkflowEditResult[],
): VisualWorkflowChangeLine[] {
  const done: VisualWorkflowChangeLine[] = [];
  const leftOut: VisualWorkflowChangeLine[] = [];
  for (const result of results) {
    if (result.status === "rejected") {
      leftOut.push({ kind: "rejected", op: result.op.op, code: result.code });
      continue;
    }
    const { op } = result;
    switch (op.op) {
      case "add_node":
        done.push({ kind: "node_added", nodeId: op.id, type: op.type });
        if (op.after && !isTriggerType(op.type)) {
          done.push({
            kind: "edge_added",
            ...describeConnectionEnds({
              source: op.after.nodeId,
              sourceHandle: op.after.handle,
              target: op.id,
              targetHandle: null,
            }),
          });
        }
        break;
      case "remove_node":
        done.push({ kind: "node_removed", nodeId: op.nodeId, type: nodeType(before, op.nodeId) });
        break;
      case "connect":
        done.push({ kind: "edge_added", ...describeConnectionEnds(op) });
        break;
      case "disconnect":
        done.push({ kind: "edge_removed", ...describeConnectionEnds(op) });
        break;
      case "configure_node":
        done.push({
          kind: "node_configured",
          nodeId: op.nodeId,
          type: nodeType(before, op.nodeId),
          fields: Object.keys(op.config ?? {}),
        });
        break;
      case "rename_workflow":
        done.push({ kind: "workflow_renamed", name: op.name });
        break;
      default:
        assertNever(op);
    }
  }
  return [...done, ...leftOut];
}

/** How a node is named to the model and in the reply: its title and what its settings say. */
function nodeLabel(node: VisualWorkflowRfNode): string {
  return `${VISUAL_NODE_DESCRIPTIONS[node.data.catalogType].title} (${resolveNodeSubtitle(node.data.config)})`;
}

function describeOperation(
  state: VisualWorkflowEditorState,
  op: VisualWorkflowResolvedOperation,
): string {
  const label = (id: string) => {
    const node = state.nodes.find((entry) => entry.id === id);
    return node ? `${nodeLabel(node)} [${id}]` : `[${id}]`;
  };
  switch (op.op) {
    case "add_node":
      return op.after
        ? `added ${VISUAL_NODE_DESCRIPTIONS[op.type].title} [${op.id}] after ${label(op.after.nodeId)}`
        : `added ${VISUAL_NODE_DESCRIPTIONS[op.type].title} [${op.id}]`;
    case "remove_node":
      return `removed ${label(op.nodeId)}`;
    case "connect":
      return `connected ${label(op.source)} (${op.sourceHandle ?? "success"}) to ${label(op.target)}`;
    case "disconnect":
      return `disconnected ${label(op.source)} from ${label(op.target)}`;
    case "configure_node":
      return `changed ${Object.keys(op.config ?? {}).join(", ")} on ${label(op.nodeId)}`;
    case "rename_workflow":
      return `renamed the workflow to "${op.name}"`;
    default:
      return assertNever(op);
  }
}

export type EditVisualWorkflowOutput =
  | { applied: false; reason: "no_workflow_page_open"; message: string }
  | (VisualWorkflowEditChange & {
      /** What the call did, for the panel to list. The reply is written from `result`. */
      changes: VisualWorkflowChangeLine[];
      result: {
        /** False when every operation was rejected. */
        changed: boolean;
        /** What was changed on the canvas, one sentence each. */
        applied: string[];
        /** What could not be done, with the reason. */
        rejected: string[];
        /** What the workflow still lacks before it can be activated. */
        issues: string[];
        /** Field references in settings that the run could not read, which stop it there. */
        brokenReferences: string[];
        saved: false;
      };
    });

const REFERENCE_PROBLEMS: Record<VisualWorkflowReferenceProblem["reason"], string> = {
  unknown_step: "reads a step that is not in the workflow",
  not_earlier: "reads a step that does not run before it",
  no_trigger: "reads the trigger, and the workflow has none",
};

function describeReferenceProblems(state: VisualWorkflowEditorState): string[] {
  return findVisualWorkflowReferenceProblems(state).map(
    (problem) => `${problem.reference} on node [${problem.nodeId}] ${REFERENCE_PROBLEMS[problem.reason]}`,
  );
}

function describeIssues(definition: VisualWorkflowV3Definition): string[] {
  return validateVisualWorkflowV3Definition(definition).map((issue) => {
    const where =
      "nodeId" in issue && issue.nodeId
        ? ` on node [${issue.nodeId}]`
        : "edgeId" in issue && issue.edgeId
          ? ` on edge ${issue.edgeId}`
          : "";
    return `${issue.code}${where}`;
  });
}

/**
 * Applies what the model asked for to the workflow the page sent, and reports what happened.
 * The returned context carries the changed workflow, so a second call in one turn builds on the
 * first.
 */
export function editVisualWorkflow(
  context: VisualWorkflowEditorContext | null | undefined,
  input: VisualWorkflowEditInput,
): { context: VisualWorkflowEditorContext | null; output: EditVisualWorkflowOutput } {
  if (!context) {
    return {
      context: null,
      output: {
        applied: false,
        reason: "no_workflow_page_open",
        message:
          "No visual workflow editor is open. Ask the person to open the workflow and use Configure with assistant there, then send the request again.",
      },
    };
  }
  const before = fromVisualWorkflowV3Definition(context.definition);
  const { state, results } = applyVisualWorkflowEdits({
    state: before,
    operations: input.operations,
  });
  const definition = toVisualWorkflowV3Definition(state);
  const applied = results.filter(
    (result): result is Extract<VisualWorkflowEditResult, { status: "applied" }> =>
      result.status === "applied",
  );
  return {
    context: { ...context, definition },
    output: {
      applied: true,
      editorSessionId: context.editorSessionId,
      operations: applied.map((result) => result.op),
      changes: toVisualWorkflowChangeLines(before, results),
      result: {
        changed: applied.length > 0,
        applied: applied.map((result) => describeOperation(state, result.op)),
        rejected: results
          .filter((result) => result.status === "rejected")
          .map((result) => `${result.op.op}: ${result.message}`),
        issues: describeIssues(definition),
        brokenReferences: describeReferenceProblems(state),
        saved: false,
      },
    },
  };
}

const callPartSchema = z.object({
  type: z.string(),
  toolName: z.string().optional(),
  state: z.string(),
  toolCallId: z.string().optional(),
  output: z.unknown().optional(),
});

const callOutputSchema = z.object({
  applied: z.boolean(),
  changes: z.array(visualWorkflowChangeLineSchema).optional(),
});

/** Reads what a call of the tool came to from its part of a reply. Null for a part of anything else. */
export function summarizeVisualWorkflowEditCall(
  part: unknown,
): VisualWorkflowEditCallSummary | null {
  const parsed = callPartSchema.safeParse(part);
  if (!parsed.success || !isAssistantToolPart(parsed.data, EDIT_VISUAL_WORKFLOW_TOOL_NAME)) {
    return null;
  }
  if (parsed.data.state === "output-error" || parsed.data.state === "output-denied") {
    return { state: "failed" };
  }
  if (parsed.data.state !== "output-available") {
    return { state: "running" };
  }
  const output = callOutputSchema.safeParse(parsed.data.output);
  if (!output.success) {
    return { state: "failed" };
  }
  if (!output.data.applied) {
    return { state: "done", changes: [] };
  }
  return { state: "done", changes: output.data.changes ?? null };
}

/**
 * The changes the tool reported in a reply's parts, each with the call it belongs to, in the
 * order they were made. Parts of other tools, unfinished calls and refusals are skipped.
 */
export function collectVisualWorkflowEditChanges(
  parts: readonly unknown[],
): Array<{ toolCallId: string; change: VisualWorkflowEditChange }> {
  const changes: Array<{ toolCallId: string; change: VisualWorkflowEditChange }> = [];
  for (const part of parts) {
    const parsed = callPartSchema.safeParse(part);
    if (
      !parsed.success ||
      parsed.data.state !== "output-available" ||
      !parsed.data.toolCallId ||
      !isAssistantToolPart(parsed.data, EDIT_VISUAL_WORKFLOW_TOOL_NAME)
    ) {
      continue;
    }
    const change = visualWorkflowEditChangeSchema.safeParse(parsed.data.output);
    if (change.success) {
      changes.push({ toolCallId: parsed.data.toolCallId, change: change.data });
    }
  }
  return changes;
}

/**
 * Applies the changes made for this editor that have not been applied yet, in order, and says
 * what each call did. A change made for another editor, or a call already applied, is skipped.
 */
export function applyVisualWorkflowEditChanges(input: {
  state: VisualWorkflowEditorState;
  changes: ReadonlyArray<{ toolCallId: string; change: VisualWorkflowEditChange }>;
  editorSessionId: string;
  appliedToolCallIds: ReadonlySet<string>;
}): {
  state: VisualWorkflowEditorState;
  applied: Array<{ toolCallId: string; made: number }>;
} {
  let state = input.state;
  const applied: Array<{ toolCallId: string; made: number }> = [];
  for (const { toolCallId, change } of input.changes) {
    if (
      change.editorSessionId !== input.editorSessionId ||
      input.appliedToolCallIds.has(toolCallId) ||
      applied.some((entry) => entry.toolCallId === toolCallId)
    ) {
      continue;
    }
    const before = state;
    const result = applyVisualWorkflowEdits({ state, operations: change.operations });
    state = result.state;
    // Counted as the panel lists them: a step added after another is a node and a connection.
    applied.push({
      toolCallId,
      made: toVisualWorkflowChangeLines(before, result.results).filter(
        (line) => line.kind !== "rejected",
      ).length,
    });
  }
  return { state, applied };
}

const historyOutputSchema = z.object({
  applied: z.literal(true),
  result: z.object({
    changed: z.boolean(),
    applied: z.array(z.string()),
    rejected: z.array(z.string()),
  }),
});

/** A finished call's output as the model is shown it later. */
export function reduceVisualWorkflowHistoryOutput(output: unknown): {
  changed: boolean;
  output: unknown;
} {
  const parsed = historyOutputSchema.safeParse(output);
  return parsed.success
    ? { changed: parsed.data.result.changed, output: parsed.data.result }
    : { changed: false, output: { changed: false, applied: [], rejected: [] } };
}

function settingsKey(node: VisualWorkflowRfNode): string {
  return JSON.stringify({
    config: node.data.config,
    inputs: node.data.inputs ?? {},
    outputFields: node.data.outputFields ?? [],
    collect: node.data.collect ?? {},
  });
}

function changedSettings(before: VisualWorkflowRfNode, after: VisualWorkflowRfNode): string[] {
  const fields = new Set<string>();
  const left = before.data.config as unknown as Record<string, unknown>;
  const right = after.data.config as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) {
      fields.add(key);
    }
  }
  if (JSON.stringify(before.data.inputs ?? {}) !== JSON.stringify(after.data.inputs ?? {})) {
    fields.add("inputs");
  }
  if (
    JSON.stringify(before.data.outputFields ?? []) !== JSON.stringify(after.data.outputFields ?? [])
  ) {
    fields.add("outputFields");
  }
  return [...fields];
}

function edgeKey(edge: VisualWorkflowRfEdge): string {
  return JSON.stringify(describeConnectionEnds(edge));
}

/**
 * What differs between the workflow as the assistant's last turn left it and the workflow the
 * person sends their next message from. Whatever differs, the person did. Where a node was only
 * moved, nothing is reported: a position means nothing to the assistant.
 */
export function listVisualWorkflowPageEdits(
  before: VisualWorkflowEditorState,
  after: VisualWorkflowEditorState,
): VisualWorkflowPageEdit[] {
  const edits: VisualWorkflowPageEdit[] = [];
  if (before.name.trim() !== after.name.trim()) {
    edits.push({ kind: "workflow_renamed", name: after.name.trim() });
  }
  const previous = new Map(before.nodes.map((node) => [node.id, node]));
  const next = new Map(after.nodes.map((node) => [node.id, node]));
  for (const node of after.nodes) {
    const old = previous.get(node.id);
    if (!old) {
      edits.push({ kind: "node_added", nodeId: node.id, type: node.data.catalogType });
    } else if (old.data.catalogType !== node.data.catalogType) {
      edits.push({ kind: "node_removed", nodeId: node.id, type: old.data.catalogType });
      edits.push({ kind: "node_added", nodeId: node.id, type: node.data.catalogType });
    } else if (settingsKey(old) !== settingsKey(node)) {
      edits.push({
        kind: "node_configured",
        nodeId: node.id,
        type: node.data.catalogType,
        fields: changedSettings(old, node),
      });
    }
  }
  for (const node of before.nodes) {
    if (!next.has(node.id)) {
      edits.push({ kind: "node_removed", nodeId: node.id, type: node.data.catalogType });
    }
  }
  const previousEdges = new Set(before.edges.map(edgeKey));
  const nextEdges = new Set(after.edges.map(edgeKey));
  for (const edge of after.edges) {
    if (!previousEdges.has(edgeKey(edge))) {
      edits.push({ kind: "edge_added", ...describeConnectionEnds(edge) });
    }
  }
  for (const edge of before.edges) {
    if (!nextEdges.has(edgeKey(edge))) {
      edits.push({ kind: "edge_removed", ...describeConnectionEnds(edge) });
    }
  }
  return edits;
}

function describePageEdit(edit: VisualWorkflowPageEdit): string {
  const title = (type: VisualCatalogType) => VISUAL_NODE_DESCRIPTIONS[type].title;
  switch (edit.kind) {
    case "workflow_renamed":
      return edit.name
        ? `the workflow is now called "${edit.name}"`
        : "the workflow's name was cleared";
    case "node_added":
      return `a ${title(edit.type)} node [${edit.nodeId}] was added`;
    case "node_removed":
      return `the ${title(edit.type)} node [${edit.nodeId}] was removed`;
    case "node_configured":
      return `${edit.fields.join(", ")} changed on the ${title(edit.type)} node [${edit.nodeId}]`;
    case "edge_added":
      return `[${edit.source}] was connected to [${edit.target}]`;
    case "edge_removed":
      return `[${edit.source}] was disconnected from [${edit.target}]`;
    default:
      return assertNever(edit);
  }
}

/** The page's record, for the model, of what the person changed themselves before a message. */
export function describeVisualWorkflowPageEdits(edits: readonly VisualWorkflowPageEdit[]): string {
  return `[Page record, written by the page: since your last turn the person changed the workflow themselves, by hand or with Undo: ${edits.map(describePageEdit).join("; ")}. Your earlier turns describe the workflow as it was before that.]`;
}

function describeHandles(node: VisualWorkflowRfNode): string {
  const handles = getAllowedExecutionSourceHandles({
    type: node.data.catalogType,
    config: node.data.config,
  }).map((handle) => handle ?? "success");
  return handles.length > 0 ? handles.join(", ") : "(none: the workflow ends here)";
}

/**
 * What the assistant can add, whatever workflow is open: each node type, what it is for, how
 * execution leaves it, which data it takes and gives, and its settings. It never changes, so it
 * sits in the system prompt.
 */
export function describeVisualWorkflowCatalogue(): string {
  const entries = VISUAL_NODE_CATALOG.filter((item) => item.enabled).map((item) => {
    const description = VISUAL_NODE_DESCRIPTIONS[item.type];
    const config = createDefaultConfig(item.type);
    const contract = NODE_CONTRACTS[item.type];
    const handles = getAllowedExecutionSourceHandles({ type: item.type, config }).map(
      (handle) => handle ?? "success",
    );
    const personOnly = PERSON_ONLY_SETTINGS[item.type] ?? [];
    const variant = nodeConfigSchemaFor(item.type);
    const schema = z.toJSONSchema(
      personOnly.length > 0
        ? variant.omit(Object.fromEntries(personOnly.map((key) => [key, true as const])))
        : variant,
      { unrepresentable: "any" },
    );
    const { $schema: _schema, ...settings } = schema;
    return [
      `- type: ${item.type}`,
      `  id when added: ${nextVisualWorkflowNodeId(item.type, [])}`,
      `  title: ${description.title}`,
      `  category: ${item.category}`,
      `  does: ${description.purpose}`,
      `  execution outputs: ${handles.length > 0 ? handles.join(", ") : "(none: the workflow ends here)"}`,
      `  data inputs: ${contract.inputs.length > 0 ? contract.inputs.map((field) => `${field.name} (${field.type}${field.required ? "" : ", optional"})`).join(", ") : "(none)"}`,
      `  data outputs: ${contract.outputs.length > 0 ? contract.outputs.map((field) => `${field.path} (${field.type})`).join(", ") : "(none)"}`,
      `  settings: ${JSON.stringify(settings)}`,
      ...(personOnly.length > 0 ? [`  set by the person only: ${personOnly.join(", ")}`] : []),
    ].join("\n");
  });

  return [
    "## What you can build with",
    "",
    "Operations of `edit_visual_workflow`, applied in order: add_node, remove_node, connect,",
    "disconnect, configure_node, rename_workflow. A node's execution outputs are the handles a",
    "connection can leave it from; `success` is the plain one. An execution connection enters a",
    "node at its one input (targetHandle null), or at one of a Merge node's named inputs. A data",
    "connection goes from a data output to a data input of the same type (targetHandle is the",
    "input's name). A Switch node's outputs are `default` and one per case id; a Sequence node's",
    "are its output ids; the page lists both.",
    "",
    "A text setting can read a field of a step that runs before it: `{{ nodes.<id>.<path> }}`, or",
    "`{{ trigger.<path> }}` for the trigger's. The page lists each step's fields with that text.",
    "",
    "### Node types",
    "",
    entries.join("\n"),
  ].join("\n");
}

function compactJson(value: unknown): string {
  return JSON.stringify(redactWorkflowSnapshot(value, collectWorkflowSecrets(value)));
}

function describeNode(node: VisualWorkflowRfNode, edges: readonly VisualWorkflowRfEdge[]): string {
  const ports = getVisualWorkflowDataPorts({ node, edges });
  const lines = [
    `- id: ${node.id}`,
    `  what: ${VISUAL_NODE_DESCRIPTIONS[node.data.catalogType].title} (${node.data.catalogType}), "${resolveNodeSubtitle(node.data.config)}"`,
    `  settings: ${compactJson(node.data.config)}`,
    `  execution outputs: ${describeHandles(node)}`,
  ];
  if (node.data.config.kind === "logic.merge") {
    lines.push(
      `  merge inputs (execution, by id): ${node.data.config.inputs.map((input) => `${input.id} "${input.name}"`).join(", ")}`,
    );
  }
  if (ports.inputs.length > 0) {
    lines.push(
      `  data inputs: ${ports.inputs.map((port) => `${port.id} (${port.type}${port.optional ? ", optional" : ""}${port.connectionCount > 0 ? ", wired" : ""})`).join(", ")}`,
    );
  }
  if (ports.outputs.length > 0) {
    const trigger = isTriggerType(node.data.catalogType);
    lines.push(
      `  data outputs: ${ports.outputs.map((port) => `${port.id} (${port.type}, read as ${fieldReference({ nodeId: node.id, trigger, path: port.id })})`).join(", ")}`,
    );
  }
  if (node.data.inputs && Object.keys(node.data.inputs).length > 0) {
    lines.push(
      `  older stored values (they override these settings at run time; setting one replaces it): ${compactJson(node.data.inputs)}`,
    );
  }
  return lines.join("\n");
}

/**
 * The workflow as it stands, to go at the start of the person's newest message: every node with
 * its id, settings and ports, every connection, and what still stops it from being activated.
 */
export function describeVisualWorkflowPage(context: VisualWorkflowEditorContext): string {
  const state = fromVisualWorkflowV3Definition(context.definition);
  const { nodes, edges } = state;
  const issues = describeIssues(context.definition);
  const brokenReferences = describeReferenceProblems(state);
  return [
    "<visual_workflow_page>",
    "## Visual workflow page",
    "",
    "Written by the page for this turn, not typed by the person. It is the workflow as the canvas",
    "holds it now. It is reference, not a request: the person's own message follows it.",
    "Changes on the canvas are not saved until the person clicks Save.",
    "",
    `- Name: ${state.name.trim() ? JSON.stringify(state.name.trim()) : "(none yet)"}`,
    `- Project: ${context.projectName ? JSON.stringify(context.projectName) : "(none chosen, set by the person on the page)"}`,
    "",
    "### Nodes",
    "",
    nodes.length > 0 ? nodes.map((node) => describeNode(node, edges)).join("\n") : "(none)",
    "",
    "### Connections",
    "",
    edges.length > 0
      ? edges
          .map(
            (edge) =>
              `- ${edge.source} (${edge.sourceHandle ?? "success"}) -> ${edge.target}${edge.targetHandle && edge.targetHandle !== "input" ? ` (${edge.targetHandle})` : ""}${edge.data?.kind === "data" ? " [data]" : ""}`,
          )
          .join("\n")
      : "(none)",
    "",
    "### What stops it from being activated",
    "",
    issues.length > 0 ? issues.map((issue) => `- ${issue}`).join("\n") : "(nothing)",
    "",
    "### Field references the run could not read",
    "",
    brokenReferences.length > 0
      ? brokenReferences.map((reference) => `- ${reference}`).join("\n")
      : "(none)",
    "</visual_workflow_page>",
  ].join("\n");
}

/** The visual workflow editor as the assistant works on it. */
export const visualWorkflowEditor = {
  kind: VISUAL_WORKFLOW_EDITOR_CONTEXT_KIND,
  toolName: EDIT_VISUAL_WORKFLOW_TOOL_NAME,
  contextSchema: visualWorkflowEditorContextSchema,
  pageEditSchema: visualWorkflowPageEditSchema,
  documentOf: (context) => fromVisualWorkflowV3Definition(context.definition),
  snapshotData: (state) => ({ definition: toVisualWorkflowV3Definition(state) }),
  readSnapshot: (data) => {
    const parsed = z
      .object({
        definition: visualWorkflowV3DefinitionSchema.extend({
          name: z.string().max(MAX_NAME_CHARS),
        }),
      })
      .safeParse(data);
    return parsed.success ? fromVisualWorkflowV3Definition(parsed.data.definition) : null;
  },
  describeCatalogue: describeVisualWorkflowCatalogue,
  describePage: describeVisualWorkflowPage,
  listPageEdits: listVisualWorkflowPageEdits,
  describePageEdits: describeVisualWorkflowPageEdits,
  reduceHistoryOutput: reduceVisualWorkflowHistoryOutput,
  summarizeCall: summarizeVisualWorkflowEditCall,
  collectChanges: collectVisualWorkflowEditChanges,
  applyChanges: (input) => {
    const result = applyVisualWorkflowEditChanges({
      state: input.document,
      changes: input.changes,
      editorSessionId: input.editorSessionId,
      appliedToolCallIds: input.appliedToolCallIds,
    });
    return { document: result.state, applied: result.applied };
  },
} satisfies AutomationAssistantEditor<
  VisualWorkflowEditorContext,
  VisualWorkflowEditorState,
  VisualWorkflowEditChange,
  VisualWorkflowChangeLine,
  VisualWorkflowPageEdit
>;
