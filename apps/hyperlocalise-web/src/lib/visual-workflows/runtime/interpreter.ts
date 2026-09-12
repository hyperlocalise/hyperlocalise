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
  VisualWorkflowDefinition,
  MockNodeRunStatus,
} from "../schema/types";
import {
  createVisualWorkflowExecutionContext,
  setNodeOutput,
  type VisualWorkflowExecutionContext,
} from "./context";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";
import { buildVisualWorkflowGraphIndex, selectNextEdges } from "./graph-index";
import { validateVisualWorkflowDefinition } from "../validation/validate-workflow";
import { resolveNodeErrorBehavior } from "./node-options";
import { resolveWorkflowNodeInputs, resolveWorkflowBinding } from "./bindings";
import { getWorkflowOutputFields, matchesWorkflowType } from "../catalog/node-contracts";
import { readWorkflowPath } from "./bindings";
import { WORKFLOW_LIMITS } from "./limits";

export type VisualWorkflowInterpreterNodeUpdate = {
  nodeId: string;
  nodeType: string;
  status: Exclude<MockNodeRunStatus, "idle">;
  iteration?: number;
  inputSnapshot?: Record<string, unknown>;
  outputSnapshot?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
};
export type VisualWorkflowInterpreterResult =
  | {
      ok: true;
      context: VisualWorkflowExecutionContext;
      nodeResults: Record<string, Record<string, unknown>>;
    }
  | {
      ok: false;
      context: VisualWorkflowExecutionContext;
      nodeResults: Record<string, Record<string, unknown>>;
      failedNodeId: string;
      error: Record<string, unknown>;
    };
export type VisualWorkflowInterpreterExecuteNode = (args: {
  node: CanonicalVisualWorkflowNode;
  context: VisualWorkflowExecutionContext;
  organizationId: string;
  iteration?: number;
  signal?: AbortSignal;
}) => Promise<VisualWorkflowNodeExecutionResult>;

export async function runVisualWorkflowInterpreter(input: {
  definition: VisualWorkflowDefinition;
  organizationId: string;
  triggerInput?: Record<string, unknown>;
  executeNode: VisualWorkflowInterpreterExecuteNode;
  onNodeUpdate?: (update: VisualWorkflowInterpreterNodeUpdate) => Promise<void> | void;
  signal?: AbortSignal;
  shouldCancel?: () => Promise<boolean>;
}): Promise<VisualWorkflowInterpreterResult> {
  const context = createVisualWorkflowExecutionContext({ triggerInput: input.triggerInput });
  const nodeResults: Record<string, Record<string, unknown>> = {};
  const fail = (
    nodeId: string,
    error: Record<string, unknown>,
  ): VisualWorkflowInterpreterResult => ({
    ok: false,
    context,
    nodeResults,
    failedNodeId: nodeId,
    error,
  });
  const issues = validateVisualWorkflowDefinition(input.definition);
  if (issues.length)
    return fail("", { code: "invalid_graph", message: "Workflow graph is invalid.", issues });
  const graph = buildVisualWorkflowGraphIndex(input.definition)!;
  let stepCount = 0;
  const deadline = Date.now() + WORKFLOW_LIMITS.runTimeoutMs;
  const settledIds = new Set<string>();
  const bodyIds = new Set(input.definition.nodes.flatMap((node) => node.bodyNodeIds ?? []));
  const emit = async (
    node: CanonicalVisualWorkflowNode,
    status: VisualWorkflowInterpreterNodeUpdate["status"],
    iteration?: number,
    extra: Partial<VisualWorkflowInterpreterNodeUpdate> = {},
  ) => {
    if (status !== "running") settledIds.add(node.id);
    return input.onNodeUpdate?.({
      nodeId: node.id,
      nodeType: node.type,
      status,
      iteration,
      ...extra,
    });
  };
  const runScope = async (
    ids: Set<string>,
    entry: Set<string>,
    iteration?: number,
  ): Promise<{ nodeId: string; error: Record<string, unknown> } | null> => {
    const states = new Map<string, "selected" | "skipped">();
    const completed = new Set<string>();
    while (completed.size < ids.size) {
      let progressed = false;
      for (const id of ids) {
        if (completed.has(id)) continue;
        const node = graph.nodesById.get(id)!;
        const incoming = input.definition.edges.filter(
          (edge) => edge.target === id && ids.has(edge.source),
        );
        if (incoming.some((edge) => !states.has(edge.id))) continue;
        const selected =
          entry.has(id) || incoming.some((edge) => states.get(edge.id) === "selected");
        completed.add(id);
        progressed = true;
        const outgoing = (graph.outgoingByNodeId.get(id) ?? []).filter((edge) =>
          ids.has(edge.target),
        );
        if (!selected) {
          await emit(node, "skipped", iteration);
          for (const edge of outgoing) states.set(edge.id, "skipped");
          continue;
        }
        if (input.signal?.aborted || (await input.shouldCancel?.())) {
          await emit(node, "cancelled", iteration);
          return { nodeId: id, error: { code: "cancelled", message: "Run cancelled." } };
        }
        if (++stepCount > WORKFLOW_LIMITS.steps || Date.now() > deadline)
          return {
            nodeId: id,
            error: { code: "execution_limit", message: "Workflow execution limit exceeded." },
          };
        let execution: VisualWorkflowNodeExecutionResult;
        try {
          const resolved = resolveWorkflowNodeInputs(node, context);
          await emit(node, "running", iteration, { inputSnapshot: { config: resolved.config } });
          execution = await input.executeNode({
            node: resolved,
            context,
            organizationId: input.organizationId,
            iteration,
            signal: input.signal,
          });
        } catch {
          execution = {
            ok: false,
            error: {
              code: "invalid_node_input",
              message:
                "Input resolution or node execution failed. Check required fields and types.",
            },
          };
        }
        if (execution.ok && node.type !== "logic.for_each") {
          for (const field of getWorkflowOutputFields(node)) {
            const value = readWorkflowPath(execution.output, field.path.split("."));
            if (value === undefined && field.optional) continue;
            if (value === undefined || !matchesWorkflowType(value, field.type)) {
              execution = {
                ok: false,
                error: {
                  code: "invalid_node_output",
                  message: "Node output does not match its declared schema.",
                },
              };
              break;
            }
          }
        }
        let errorBranch = false;
        if (!execution.ok) {
          if (
            ["yield_execution", "needs_attention", "cancelled"].includes(execution.error.code ?? "")
          ) {
            if (execution.error.code !== "yield_execution")
              await emit(node, execution.error.code as "needs_attention" | "cancelled", iteration, {
                error: execution.error,
              });
            return { nodeId: id, error: execution.error };
          }
          const behavior = resolveNodeErrorBehavior(node.config);
          await emit(node, behavior === "stop" ? "failed" : "handled_error", iteration, {
            error: execution.error,
          });
          if (behavior === "stop") return { nodeId: id, error: execution.error };
          errorBranch = behavior === "branch";
          setNodeOutput(context, id, { failed: true, error: execution.error });
          nodeResults[id] = context.nodes[id]!;
        } else {
          setNodeOutput(context, id, execution.output);
          nodeResults[id] = execution.output;
          if (node.type === "logic.for_each") {
            const items = execution.output.items;
            if (!Array.isArray(items) || items.length > WORKFLOW_LIMITS.loopItems)
              return {
                nodeId: id,
                error: {
                  code: "loop_limit",
                  message: "Loop requires an array with at most 100 items.",
                },
              };
            const outputs: Record<string, unknown>[] = [];
            for (let index = 0; index < items.length; index++) {
              for (const bodyId of node.bodyNodeIds ?? []) {
                delete context.nodes[bodyId];
                delete nodeResults[bodyId];
              }
              setNodeOutput(context, id, { item: items[index], index, count: items.length });
              const body = new Set(node.bodyNodeIds ?? []);
              const starts = new Set(
                (graph.outgoingByNodeId.get(id) ?? [])
                  .filter((edge) => edge.sourceHandle === "each")
                  .map((edge) => edge.target),
              );
              const failure = await runScope(body, starts, index);
              if (failure) {
                if (failure.error.code !== "yield_execution")
                  await emit(node, "failed", iteration, { error: failure.error });
                return failure;
              }
              const collected: Record<string, unknown> = {};
              try {
                for (const [key, binding] of Object.entries(node.collect ?? {}))
                  collected[key] = resolveWorkflowBinding(binding, context);
              } catch {
                const error = {
                  code: "invalid_collection_output",
                  message:
                    "A collected loop value is missing. Add an optional binding or fallback.",
                };
                await emit(node, "failed", iteration, { error });
                return { nodeId: id, error };
              }
              outputs.push(collected);
            }
            for (const bodyId of node.bodyNodeIds ?? []) {
              delete context.nodes[bodyId];
              delete nodeResults[bodyId];
            }
            execution = { ok: true, output: { count: items.length, iterationOutputs: outputs } };
            setNodeOutput(context, id, execution.output);
            nodeResults[id] = execution.output;
          }
          await emit(node, "succeeded", iteration, {
            outputSnapshot: execution.output,
            error: null,
          });
        }
        const next =
          node.type === "logic.for_each"
            ? outgoing.filter((edge) => edge.sourceHandle === "done")
            : selectNextEdges({
                nodeType: node.type,
                branchResult: execution.ok ? (execution.branchResult ?? null) : null,
                switchCase: execution.ok ? (execution.switchCase ?? null) : null,
                useErrorBranch: errorBranch,
                outgoing,
              });
        const selectedIds = new Set(next.map((edge) => edge.id));
        for (const edge of outgoing)
          states.set(edge.id, selectedIds.has(edge.id) ? "selected" : "skipped");
      }
      if (!progressed) {
        for (const id of ids)
          if (!completed.has(id)) await emit(graph.nodesById.get(id)!, "blocked", iteration);
        return {
          nodeId: "",
          error: {
            code: "unresolved_dependencies",
            message: "Workflow dependencies did not settle.",
          },
        };
      }
    }
    return null;
  };
  const failure = await runScope(
    new Set(input.definition.nodes.filter((node) => !bodyIds.has(node.id)).map((node) => node.id)),
    new Set([graph.triggerNodeId]),
  );
  if (failure && failure.error.code !== "yield_execution")
    for (const node of input.definition.nodes)
      if (!settledIds.has(node.id))
        await emit(node, failure.error.code === "cancelled" ? "cancelled" : "blocked");
  if (!failure)
    for (const node of input.definition.nodes)
      if (!settledIds.has(node.id)) await emit(node, "skipped");
  return failure ? fail(failure.nodeId, failure.error) : { ok: true, context, nodeResults };
}
export const getVisualWorkflowGraphIndex = buildVisualWorkflowGraphIndex;
export type { VisualWorkflowGraphIndex } from "./graph-index";
