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
import { runRetryRegion } from "./run-retry-region";
import type { RetryResumeState } from "./retry-delay";
import type { RunRetryScopeOptions } from "./run-retry-region";
import { runWaitNode } from "./run-wait-node";
import type { WaitResumeState } from "./wait-schedule";
import { decideMerge, type MergeDecision, type MergeInputSettlement } from "./merge-decision";
import { resolveMergeTimeout, type MergeResumeState } from "./merge-timeout";

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

function selectedEdgeSettlement(input: {
  sourceHandle: string | null;
  executionSucceeded: boolean;
}): MergeInputSettlement {
  if (!input.executionSucceeded) {
    return "failed";
  }

  if (
    input.sourceHandle === "error" ||
    input.sourceHandle === "timed_out" ||
    input.sourceHandle === "exhausted"
  ) {
    return "failed";
  }

  return "succeeded";
}

function collectMergeValues(
  node: CanonicalVisualWorkflowNode,
  context: VisualWorkflowExecutionContext,
): Record<string, unknown> {
  if (node.config.kind !== "logic.merge") {
    return {};
  }

  const values: Record<string, unknown> = {};

  for (const input of node.config.inputs) {
    const binding = node.inputs?.[`value.${input.id}`];
    if (!binding) {
      continue;
    }

    const value = resolveWorkflowBinding(binding, context);
    if (value !== undefined) {
      values[input.id] = value;
    }
  }

  return values;
}

export async function runVisualWorkflowInterpreter(input: {
  definition: VisualWorkflowDefinition;
  organizationId: string;
  triggerInput?: Record<string, unknown>;
  executeNode: VisualWorkflowInterpreterExecuteNode;
  onNodeUpdate?: (update: VisualWorkflowInterpreterNodeUpdate) => Promise<void> | void;
  signal?: AbortSignal;
  shouldCancel?: () => Promise<boolean>;
  mockMode?: boolean;
  retryBackoff?: RetryResumeState | null;
  waitResume?: WaitResumeState | null;
  mergeResume?: MergeResumeState | null;
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
  const definition = input.definition;
  const issues = validateVisualWorkflowDefinition(definition);
  if (issues.length)
    return fail("", { code: "invalid_graph", message: "Workflow graph is invalid.", issues });
  const graph = buildVisualWorkflowGraphIndex(definition)!;
  let stepCount = 0;
  const deadline = Date.now() + WORKFLOW_LIMITS.runTimeoutMs;
  const settledIds = new Set<string>();
  const bodyIds = new Set(definition.nodes.flatMap((node) => node.bodyNodeIds ?? []));
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
    scopeOptions?: RunRetryScopeOptions,
  ): Promise<{ nodeId: string; error: Record<string, unknown> } | null> => {
    const states = new Map<string, MergeInputSettlement>();
    const completed = new Set<string>();
    const mergeResumes = new Map<string, MergeResumeState>();
    const mergeResumeFor = (node: CanonicalVisualWorkflowNode): MergeResumeState | null => {
      const current = mergeResumes.get(node.id);
      if (current) return current;
      const mergeIteration = iteration ?? -1;
      return input.mergeResume?.mergeNodeId === node.id &&
        input.mergeResume.iteration === mergeIteration
        ? input.mergeResume
        : null;
    };
    const armMergeTimeout = (node: CanonicalVisualWorkflowNode): MergeResumeState | null => {
      if (node.config.kind !== "logic.merge" || !node.config.timeoutMs) return null;
      const timeout = resolveMergeTimeout({
        mergeNodeId: node.id,
        iteration,
        timeoutMs: node.config.timeoutMs,
        previous: mergeResumeFor(node),
      });
      if (timeout.status === "timed_out") return null;
      mergeResumes.set(node.id, timeout.resume);
      return timeout.resume;
    };
    const earliestMergeResume = (): MergeResumeState | null =>
      [...mergeResumes.values()].sort(
        (left, right) => Date.parse(left.wakeAt) - Date.parse(right.wakeAt),
      )[0] ?? null;
    while (completed.size < ids.size) {
      let progressed = false;
      const pendingMerges: CanonicalVisualWorkflowNode[] = [];
      const expiredMergeId =
        input.mergeResume && Date.now() >= Date.parse(input.mergeResume.wakeAt)
          ? input.mergeResume.mergeNodeId
          : null;
      const orderedIds = expiredMergeId
        ? [expiredMergeId, ...[...ids].filter((id) => id !== expiredMergeId)]
        : [...ids];
      for (const id of orderedIds) {
        if (!ids.has(id)) continue;
        if (completed.has(id)) continue;
        const node = graph.nodesById.get(id)!;
        const incoming = definition.edges.filter(
          (edge) => edge.target === id && ids.has(edge.source),
        );

        let mergeDecision: MergeDecision | null = null;
        let mergeTimedOut = false;

        if (node.config.kind === "logic.merge") {
          const inputIds = incoming.map((edge) => edge.targetHandle ?? "input");

          const settlements = new Map<string, MergeInputSettlement>();

          const incomingById = new Map(incoming.map((edge) => [edge.id, edge]));
          for (const [edgeId, settlement] of states) {
            const edge = incomingById.get(edgeId);
            if (edge) settlements.set(edge.targetHandle ?? "input", settlement);
          }

          mergeDecision = decideMerge({
            mode: node.config.mode,
            inputIds,
            settlements,
          });

          const resume = mergeResumeFor(node);
          if (node.config.timeoutMs && resume) {
            mergeTimedOut =
              resolveMergeTimeout({
                mergeNodeId: node.id,
                iteration,
                timeoutMs: node.config.timeoutMs,
                previous: resume,
              }).status === "timed_out";
          }

          if (mergeDecision.state === "pending" && !mergeTimedOut) {
            if (node.config.timeoutMs) {
              armMergeTimeout(node);
              pendingMerges.push(node);
            }
            continue;
          }
        } else if (incoming.some((edge) => !states.has(edge.id))) {
          continue;
        }

        const selected =
          entry.has(id) ||
          (mergeDecision !== null
            ? mergeDecision.state !== "skipped"
            : incoming.some((edge) => states.get(edge.id) !== "skipped"));
        completed.add(id);
        mergeResumes.delete(id);
        progressed = true;
        const outgoing = (graph.outgoingByNodeId.get(id) ?? []).filter((edge) =>
          ids.has(edge.target),
        );
        if (!selected) {
          await emit(node, "skipped", iteration);
          for (const edge of outgoing) {
            states.set(edge.id, "skipped");
            const target = graph.nodesById.get(edge.target);
            if (target?.config.kind === "logic.merge") armMergeTimeout(target);
          }
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
        let mergeExitHandle: "completed" | "timed_out" | "error" | null = null;
        let waitExitHandle: "completed" | "timed_out" | null = null;
        let execution: VisualWorkflowNodeExecutionResult;
        try {
          const resolved = resolveWorkflowNodeInputs(node, context);

          await emit(node, "running", iteration, {
            inputSnapshot: { config: resolved.config },
          });

          if (resolved.type === "logic.merge") {
            if (mergeTimedOut) {
              execution = {
                ok: true,
                output: {
                  status: "timed_out",
                  values: collectMergeValues(node, context),
                },
              };
              mergeExitHandle = "timed_out";
            } else {
              if (!mergeDecision) {
                throw new Error("Merge executed before its inputs settled.");
              }

              if (mergeDecision.state === "skipped") {
                throw new Error("Skipped Merge must not execute.");
              }

              if (mergeDecision.state === "failed") {
                execution = {
                  ok: true,
                  output: {
                    status: "error",
                    values: collectMergeValues(node, context),
                  },
                };
                mergeExitHandle = "error";
              } else if (mergeDecision.state === "completed") {
                execution = {
                  ok: true,
                  output: {
                    status: "completed",
                    selectedInputId: mergeDecision.selectedInputId,
                    values: collectMergeValues(node, context),
                  },
                };
                mergeExitHandle = "completed";
              } else {
                throw new Error("Pending Merge must not execute.");
              }
            }
          } else if (resolved.type === "flow.wait") {
            const waitIteration = iteration ?? -1;
            // Prefer a durable cached completion so later slices can clear waitResume
            // without re-scheduling the same wait.
            const cached = await input.executeNode({
              node: resolved,
              context,
              organizationId: input.organizationId,
              iteration,
              signal: input.signal,
            });
            const cachedStatus =
              cached.ok && cached.output && typeof cached.output === "object"
                ? (cached.output as Record<string, unknown>).status
                : null;

            if (cachedStatus === "completed" || cachedStatus === "timed_out") {
              execution = cached;
              waitExitHandle = cachedStatus === "timed_out" ? "timed_out" : "completed";
            } else {
              const waitResult = runWaitNode({
                node: resolved,
                context,
                resume:
                  input.waitResume?.waitNodeId === resolved.id &&
                  input.waitResume.iteration === waitIteration
                    ? input.waitResume
                    : null,
                iteration,
                mockMode: input.mockMode,
              });

              execution = waitResult.execution;
              waitExitHandle = waitResult.exitHandle;
            }
          } else {
            execution = await input.executeNode({
              node: resolved,
              context,
              organizationId: input.organizationId,
              iteration,
              signal: input.signal,
            });
          }
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
        let retryExitHandle: "succeeded" | "exhausted" | null = null;
        if (execution.ok && node.type !== "logic.for_each" && node.type !== "logic.retry") {
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
            [
              "yield_execution",
              "needs_attention",
              "cancelled",
              "retry_backoff",
              "wait_suspended",
              "merge_suspended",
            ].includes(execution.error.code ?? "")
          ) {
            for (const edge of outgoing) {
              const target = graph.nodesById.get(edge.target);
              if (target?.config.kind === "logic.merge") armMergeTimeout(target);
            }
            if (
              execution.error.code !== "yield_execution" &&
              execution.error.code !== "retry_backoff" &&
              execution.error.code !== "wait_suspended" &&
              execution.error.code !== "merge_suspended"
            )
              await emit(node, execution.error.code as "needs_attention" | "cancelled", iteration, {
                error: execution.error,
              });
            const mergeResume = earliestMergeResume();
            return {
              nodeId: id,
              error: mergeResume ? { ...execution.error, mergeResume } : execution.error,
            };
          }
          const behavior =
            node.type === "flow.wait" ? "branch" : resolveNodeErrorBehavior(node.config);
          await emit(node, behavior === "stop" ? "failed" : "handled_error", iteration, {
            error: execution.error,
          });
          if (behavior === "stop") return { nodeId: id, error: execution.error };
          if (scopeOptions?.failOnHandledErrors && behavior === "continue") {
            return { nodeId: id, error: execution.error };
          }
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
                if (
                  failure.error.code !== "yield_execution" &&
                  failure.error.code !== "retry_backoff" &&
                  failure.error.code !== "wait_suspended" &&
                  failure.error.code !== "merge_suspended"
                )
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
          if (node.type === "logic.retry") {
            const resolvedRetry = resolveWorkflowNodeInputs(node, context);
            const resume = input.retryBackoff?.retryNodeId === node.id ? input.retryBackoff : null;
            const retryResult = await runRetryRegion({
              node: resolvedRetry,
              graph,
              context,
              nodeResults,
              runScope,
              signal: input.signal,
              mockMode: input.mockMode,
              startAttempt: resume?.nextAttempt,
            });
            if (!retryResult.ok) {
              if (
                retryResult.error.code !== "yield_execution" &&
                retryResult.error.code !== "retry_backoff"
              ) {
                await emit(node, "failed", iteration, { error: retryResult.error });
              }
              return { nodeId: id, error: retryResult.error };
            }
            retryExitHandle = retryResult.exitHandle;
            execution = { ok: true, output: retryResult.output };
            setNodeOutput(context, id, retryResult.output);
            nodeResults[id] = retryResult.output;
          }
          await emit(node, "succeeded", iteration, {
            outputSnapshot: execution.output,
            error: null,
          });
        }
        const next =
          node.type === "logic.for_each"
            ? outgoing.filter((edge) => edge.sourceHandle === "done")
            : node.type === "logic.retry" && retryExitHandle
              ? outgoing.filter((edge) => edge.sourceHandle === retryExitHandle)
              : node.type === "logic.merge" && mergeExitHandle
                ? outgoing.filter((edge) => edge.sourceHandle === mergeExitHandle)
                : node.type === "flow.wait" && waitExitHandle
                  ? outgoing.filter((edge) => edge.sourceHandle === waitExitHandle)
                  : selectNextEdges({
                      nodeType: node.type,
                      branchResult: execution.ok ? (execution.branchResult ?? null) : null,
                      switchCase: execution.ok ? (execution.switchCase ?? null) : null,
                      useErrorBranch: errorBranch,
                      outgoing,
                    });
        const selectedIds = new Set(next.map((edge) => edge.id));

        for (const edge of outgoing) {
          if (!selectedIds.has(edge.id)) {
            states.set(edge.id, "skipped");
            continue;
          }

          const settlement = selectedEdgeSettlement({
            sourceHandle: edge.sourceHandle,
            executionSucceeded: execution.ok,
          });
          states.set(edge.id, settlement);
          const target = graph.nodesById.get(edge.target);
          if (target?.config.kind === "logic.merge") armMergeTimeout(target);
        }
        if (expiredMergeId && id !== expiredMergeId) break;
      }
      if (!progressed) {
        const pendingMerge = pendingMerges[0];
        if (pendingMerge?.config.kind === "logic.merge" && pendingMerge.config.timeoutMs) {
          const timeout = resolveMergeTimeout({
            mergeNodeId: pendingMerge.id,
            iteration,
            timeoutMs: pendingMerge.config.timeoutMs,
            previous: mergeResumeFor(pendingMerge),
          });
          if (timeout.status === "waiting") {
            return {
              nodeId: pendingMerge.id,
              error: {
                code: "merge_suspended",
                message: "Merge is waiting for its remaining inputs.",
                ...timeout.resume,
              },
            };
          }
        }
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
    new Set(definition.nodes.filter((node) => !bodyIds.has(node.id)).map((node) => node.id)),
    new Set([graph.triggerNodeId]),
  );
  if (
    failure &&
    failure.error.code !== "yield_execution" &&
    failure.error.code !== "retry_backoff" &&
    failure.error.code !== "wait_suspended" &&
    failure.error.code !== "merge_suspended"
  )
    for (const node of definition.nodes)
      if (!settledIds.has(node.id))
        await emit(node, failure.error.code === "cancelled" ? "cancelled" : "blocked");
  if (!failure)
    for (const node of definition.nodes) if (!settledIds.has(node.id)) await emit(node, "skipped");
  return failure ? fail(failure.nodeId, failure.error) : { ok: true, context, nodeResults };
}
export const getVisualWorkflowGraphIndex = buildVisualWorkflowGraphIndex;
export type { VisualWorkflowGraphIndex } from "./graph-index";
