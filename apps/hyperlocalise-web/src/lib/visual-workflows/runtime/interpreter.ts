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
  CanonicalVisualWorkflowEdge,
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
      terminal?:
        | { kind: "completed"; nodeId: string }
        | { kind: "returned"; nodeId: string; outputs: Record<string, unknown> };
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

function collectSequencePriorityNodeIds(
  selectedEdges: readonly CanonicalVisualWorkflowEdge[],
  outgoingByNodeId: ReadonlyMap<string, readonly CanonicalVisualWorkflowEdge[]>,
): string[] {
  const orderedNodeIds: string[] = [];
  const visited = new Set<string>();

  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    orderedNodeIds.push(nodeId);

    for (const edge of outgoingByNodeId.get(nodeId) ?? []) {
      visit(edge.target);
    }
  };

  for (const edge of selectedEdges) {
    visit(edge.target);
  }

  return orderedNodeIds;
}

/** True when a held Sequence output can still reach `mergeNodeId` in this scope. */
function sequenceHoldBlocksMerge(input: {
  mergeNodeId: string;
  heldSequenceEdges: readonly CanonicalVisualWorkflowEdge[];
  outgoingByNodeId: ReadonlyMap<string, readonly CanonicalVisualWorkflowEdge[]>;
  scopeIds: ReadonlySet<string>;
}): boolean {
  if (input.heldSequenceEdges.length === 0) return false;

  const canReachMerge = (nodeId: string, visited: Set<string>): boolean => {
    if (!input.scopeIds.has(nodeId) || visited.has(nodeId)) return false;
    if (nodeId === input.mergeNodeId) return true;
    visited.add(nodeId);
    for (const edge of input.outgoingByNodeId.get(nodeId) ?? []) {
      if (canReachMerge(edge.target, visited)) return true;
    }
    return false;
  };

  return input.heldSequenceEdges.some((edge) => canReachMerge(edge.target, new Set()));
}

type SequenceHoldFrame = {
  kind: "sequence" | "try_catch";
  heldEdges: CanonicalVisualWorkflowEdge[];
  activeReleasedEdge: CanonicalVisualWorkflowEdge | null;
  deferredTerminal: boolean;
};

function resolveTryCatchAttemptMetadata(
  definition: VisualWorkflowDefinition,
  boundaryNodeId: string,
  iteration: number | undefined,
): Record<string, never> | { number: number } {
  if (iteration === undefined) return {};

  const belongsToRetry = definition.nodes.some(
    (node) => node.type === "logic.retry" && node.bodyNodeIds?.includes(boundaryNodeId),
  );
  return { number: belongsToRetry ? iteration : iteration + 1 };
}

function collectReachableNodeIds(
  startNodeIds: readonly string[],
  outgoingByNodeId: ReadonlyMap<string, readonly CanonicalVisualWorkflowEdge[]>,
  scopeIds: ReadonlySet<string>,
): Set<string> {
  const reachable = new Set<string>();
  const visit = (nodeId: string) => {
    if (!scopeIds.has(nodeId) || reachable.has(nodeId)) return;
    reachable.add(nodeId);
    for (const edge of outgoingByNodeId.get(nodeId) ?? []) {
      visit(edge.target);
    }
  };
  for (const nodeId of startNodeIds) {
    visit(nodeId);
  }
  return reachable;
}

/**
 * A released Sequence path is done enough to release the next output when every
 * non-boundary descendant has completed *and* settled its outgoing edges. Merge
 * nodes and ordinary joins that are still waiting on another held Sequence path
 * are propagation boundaries so later Sequence outputs can settle those joins.
 * A suspended Wait stays in `completed` but has not settled outgoing edges yet,
 * so later Sequence feeders stay held (and Merge timeouts are not armed against them).
 */
function sequenceReleasedPathFullyPropagated(input: {
  releasedEdge: CanonicalVisualWorkflowEdge;
  completed: ReadonlySet<string>;
  states: ReadonlyMap<string, MergeInputSettlement>;
  nodesById: ReadonlyMap<string, CanonicalVisualWorkflowNode>;
  outgoingByNodeId: ReadonlyMap<string, readonly CanonicalVisualWorkflowEdge[]>;
  incomingByNodeId: ReadonlyMap<string, readonly CanonicalVisualWorkflowEdge[]>;
  heldSequenceEdges: readonly CanonicalVisualWorkflowEdge[];
  scopeIds: ReadonlySet<string>;
}): boolean {
  const heldEdgeIds = new Set(input.heldSequenceEdges.map((edge) => edge.id));
  const reachableFromHeld = collectReachableNodeIds(
    input.heldSequenceEdges.map((edge) => edge.target),
    input.outgoingByNodeId,
    input.scopeIds,
  );
  const waitingOnHeldSequencePath = (nodeId: string): boolean => {
    const incoming = (input.incomingByNodeId.get(nodeId) ?? []).filter((edge) =>
      input.scopeIds.has(edge.source),
    );
    return incoming.some((edge) => {
      if (input.states.has(edge.id)) return false;
      return heldEdgeIds.has(edge.id) || reachableFromHeld.has(edge.source);
    });
  };
  const visit = (nodeId: string): boolean => {
    if (!input.scopeIds.has(nodeId)) return true;
    const node = input.nodesById.get(nodeId);
    if (!node) return true;
    if (node.config.kind === "logic.merge") return true;
    if (!input.completed.has(nodeId)) return waitingOnHeldSequencePath(nodeId);
    const outgoing = (input.outgoingByNodeId.get(nodeId) ?? []).filter((edge) =>
      input.scopeIds.has(edge.target),
    );
    for (const edge of outgoing) {
      if (!input.states.has(edge.id)) return false;
      if (input.states.get(edge.id) === "skipped") continue;
      if (!visit(edge.target)) return false;
    }
    return true;
  };

  return visit(input.releasedEdge.target);
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
    let priorityNodeIds: string[] = [];
    // Nested Sequences each keep their own hold frame so an inner Sequence
    // cannot replace the outer Sequence's later outputs.
    const sequenceHoldStack: SequenceHoldFrame[] = [];
    const deferredTryCatch = {
      result: null as {
        frame: SequenceHoldFrame;
        nodeId: string;
        error: Record<string, unknown>;
      } | null,
    };
    const incomingByNodeId = new Map<string, CanonicalVisualWorkflowEdge[]>();
    for (const edge of definition.edges) {
      if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
      const incoming = incomingByNodeId.get(edge.target) ?? [];
      incoming.push(edge);
      incomingByNodeId.set(edge.target, incoming);
    }
    const allHeldSequenceEdges = () => sequenceHoldStack.flatMap((frame) => frame.heldEdges);
    const sequencePathFullyPropagated = (releasedEdge: CanonicalVisualWorkflowEdge) =>
      sequenceReleasedPathFullyPropagated({
        releasedEdge,
        completed,
        states,
        nodesById: graph.nodesById,
        outgoingByNodeId: graph.outgoingByNodeId,
        incomingByNodeId,
        heldSequenceEdges: allHeldSequenceEdges(),
        scopeIds: ids,
      });
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
      if (
        sequenceHoldBlocksMerge({
          mergeNodeId: node.id,
          heldSequenceEdges: allHeldSequenceEdges(),
          outgoingByNodeId: graph.outgoingByNodeId,
          scopeIds: ids,
        })
      ) {
        return null;
      }
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
    const deferTryCatchResultUntilFinally = (
      nodeId: string,
      error: Record<string, unknown>,
    ): boolean => {
      for (let index = sequenceHoldStack.length - 1; index >= 0; index--) {
        const frame = sequenceHoldStack[index]!;
        if (
          frame.kind !== "try_catch" ||
          frame.deferredTerminal ||
          frame.activeReleasedEdge?.sourceHandle === "finally"
        ) {
          continue;
        }

        const finallyEdges = frame.heldEdges.filter((edge) => edge.sourceHandle === "finally");
        if (finallyEdges.length === 0) return false;

        for (const nestedFrame of sequenceHoldStack.splice(index + 1)) {
          for (const heldEdge of nestedFrame.heldEdges) states.set(heldEdge.id, "skipped");
        }
        for (const heldEdge of frame.heldEdges) {
          if (heldEdge.sourceHandle !== "finally") states.set(heldEdge.id, "skipped");
        }

        const [firstFinallyEdge, ...remainingFinallyEdges] = finallyEdges;
        frame.activeReleasedEdge = firstFinallyEdge!;
        frame.heldEdges = remainingFinallyEdges;
        frame.deferredTerminal = true;
        states.set(
          firstFinallyEdge!.id,
          selectedEdgeSettlement({
            sourceHandle: firstFinallyEdge!.sourceHandle,
            executionSucceeded: true,
          }),
        );
        priorityNodeIds = collectSequencePriorityNodeIds(
          [firstFinallyEdge!],
          graph.outgoingByNodeId,
        );
        deferredTryCatch.result = { frame, nodeId, error };
        return true;
      }
      return false;
    };
    const releaseHeldSequenceEdges = () => {
      while (sequenceHoldStack.length > 0) {
        const frame = sequenceHoldStack[sequenceHoldStack.length - 1]!;
        while (
          frame.heldEdges.length > 0 &&
          frame.activeReleasedEdge &&
          sequencePathFullyPropagated(frame.activeReleasedEdge)
        ) {
          const edge = frame.heldEdges.shift()!;
          states.set(
            edge.id,
            selectedEdgeSettlement({
              sourceHandle: edge.sourceHandle,
              executionSucceeded: true,
            }),
          );
          frame.activeReleasedEdge = edge;
          const target = graph.nodesById.get(edge.target);
          if (target?.config.kind === "logic.merge") armMergeTimeout(target);
          priorityNodeIds = collectSequencePriorityNodeIds([edge], graph.outgoingByNodeId);
        }
        const frameDone =
          frame.heldEdges.length === 0 &&
          (!frame.activeReleasedEdge || sequencePathFullyPropagated(frame.activeReleasedEdge));
        if (frameDone) {
          sequenceHoldStack.pop();
          continue;
        }
        break;
      }
    };
    while (completed.size < ids.size) {
      let progressed = false;
      const pendingMerges: CanonicalVisualWorkflowNode[] = [];
      const expiredMergeId =
        input.mergeResume && Date.now() >= Date.parse(input.mergeResume.wakeAt)
          ? input.mergeResume.mergeNodeId
          : null;
      releaseHeldSequenceEdges();
      if (deferredTryCatch.result && !sequenceHoldStack.includes(deferredTryCatch.result.frame)) {
        return {
          nodeId: deferredTryCatch.result.nodeId,
          error: deferredTryCatch.result.error,
        };
      }
      const prioritizedIds = priorityNodeIds.filter((id) => ids.has(id));
      priorityNodeIds = [];

      const orderedIds = expiredMergeId
        ? [
            expiredMergeId,
            ...prioritizedIds.filter((id) => id !== expiredMergeId),
            ...[...ids].filter((id) => id !== expiredMergeId && !prioritizedIds.includes(id)),
          ]
        : [...prioritizedIds, ...[...ids].filter((id) => !prioritizedIds.includes(id))];
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
            // Prefer a durable cached completion so later slices can clear
            // mergeResume without re-timing-out a Merge that already settled.
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

            if (
              cachedStatus === "completed" ||
              cachedStatus === "timed_out" ||
              cachedStatus === "error"
            ) {
              execution = cached;
              mergeExitHandle = cachedStatus;
            } else if (mergeTimedOut) {
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
        let tryCatchExitHandles: Array<"success" | "catch" | "finally"> | null = null;
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
          if (behavior === "stop") {
            if (deferTryCatchResultUntilFinally(id, execution.error)) break;
            return { nodeId: id, error: execution.error };
          }
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
                  failure.error.code !== "merge_suspended" &&
                  failure.error.code !== "workflow_completed" &&
                  failure.error.code !== "workflow_returned" &&
                  failure.error.code !== "cancelled" &&
                  failure.error.terminal !== true
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
                retryResult.error.code !== "retry_backoff" &&
                retryResult.error.code !== "workflow_completed" &&
                retryResult.error.code !== "workflow_returned" &&
                retryResult.error.code !== "cancelled" &&
                retryResult.error.terminal !== true
              ) {
                await emit(node, "failed", iteration, { error: retryResult.error });
              }
              return {
                nodeId:
                  typeof retryResult.error.terminalNodeId === "string"
                    ? retryResult.error.terminalNodeId
                    : id,
                error: retryResult.error,
              };
            }
            retryExitHandle = retryResult.exitHandle;
            execution = { ok: true, output: retryResult.output };
            setNodeOutput(context, id, retryResult.output);
            nodeResults[id] = retryResult.output;
          }
          if (node.type === "logic.try_catch") {
            const bodyIds = node.bodyNodeIds ?? [];
            const body = new Set(bodyIds);
            const starts = new Set(
              (graph.outgoingByNodeId.get(node.id) ?? [])
                .filter((edge) => edge.sourceHandle === "try")
                .map((edge) => edge.target),
            );
            const cachedBoundaryStatus =
              execution.output.boundaryStatus === "succeeded" ||
              execution.output.boundaryStatus === "caught"
                ? execution.output.boundaryStatus
                : null;
            const regionFailure = cachedBoundaryStatus
              ? null
              : await runScope(body, starts, iteration, { failOnHandledErrors: true });

            if (cachedBoundaryStatus) {
              tryCatchExitHandles = [
                cachedBoundaryStatus === "caught" ? "catch" : "success",
                "finally",
              ];
            } else if (regionFailure) {
              const errorCode =
                typeof regionFailure.error.code === "string"
                  ? regionFailure.error.code
                  : "node_execution_failed";
              if (
                [
                  "yield_execution",
                  "needs_attention",
                  "cancelled",
                  "retry_backoff",
                  "wait_suspended",
                  "merge_suspended",
                  "workflow_completed",
                  "workflow_returned",
                ].includes(errorCode) ||
                regionFailure.error.terminal === true
              ) {
                return regionFailure;
              }

              execution = {
                ok: true,
                output: {
                  errorCode,
                  errorMessage: "The protected workflow region failed.",
                  failedNodeId: regionFailure.nodeId,
                  attempt: resolveTryCatchAttemptMetadata(definition, node.id, iteration),
                  boundaryStatus: "caught",
                },
              };
              tryCatchExitHandles = ["catch", "finally"];
            } else {
              execution = { ok: true, output: { boundaryStatus: "succeeded" } };
              tryCatchExitHandles = ["success", "finally"];
            }

            for (const bodyId of bodyIds) {
              delete context.nodes[bodyId];
              delete nodeResults[bodyId];
            }
            setNodeOutput(context, id, execution.output);
            nodeResults[id] = execution.output;
          }
          await emit(node, "succeeded", iteration, {
            outputSnapshot: execution.output,
            error: null,
          });
          if (node.config.kind === "flow.stop") {
            const terminalResult = {
              nodeId: id,
              error: {
                code: "workflow_completed",
                message: "Workflow completed by a Stop node.",
              },
            };
            if (deferTryCatchResultUntilFinally(terminalResult.nodeId, terminalResult.error)) break;
            return terminalResult;
          }
          if (node.config.kind === "flow.return") {
            const terminalResult = {
              nodeId: id,
              error: {
                code: "workflow_returned",
                message: "Workflow completed with returned outputs.",
                outputs: execution.output.returnedOutputs ?? {},
              },
            };
            if (deferTryCatchResultUntilFinally(terminalResult.nodeId, terminalResult.error)) break;
            return terminalResult;
          }
        }
        const next =
          node.type === "logic.for_each"
            ? outgoing.filter((edge) => edge.sourceHandle === "done")
            : node.type === "logic.retry" && retryExitHandle
              ? outgoing.filter((edge) => edge.sourceHandle === retryExitHandle)
              : node.type === "logic.try_catch" && tryCatchExitHandles
                ? tryCatchExitHandles.flatMap((handle) =>
                    outgoing.filter((edge) => edge.sourceHandle === handle),
                  )
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
                        sequenceOutputIds:
                          node.config.kind === "logic.sequence"
                            ? node.config.outputs.map((output) => output.id)
                            : undefined,
                      });
        const selectedIds = new Set(next.map((edge) => edge.id));
        const holdsOrderedExits =
          node.config.kind === "logic.sequence" || node.config.kind === "logic.try_catch";
        const sequenceReleaseEdge = holdsOrderedExits ? (next[0] ?? null) : null;
        const sequenceHeldEdges = holdsOrderedExits ? next.slice(1) : [];

        for (const edge of outgoing) {
          if (!selectedIds.has(edge.id)) {
            states.set(edge.id, "skipped");
            continue;
          }

          if (holdsOrderedExits && sequenceReleaseEdge && edge.id !== sequenceReleaseEdge.id) {
            // Defer settlement until earlier Sequence paths fully propagate.
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
        if (holdsOrderedExits) {
          sequenceHoldStack.push({
            kind: node.config.kind === "logic.try_catch" ? "try_catch" : "sequence",
            heldEdges: sequenceHeldEdges,
            activeReleasedEdge: sequenceReleaseEdge,
            deferredTerminal: false,
          });
          priorityNodeIds = sequenceReleaseEdge
            ? collectSequencePriorityNodeIds([sequenceReleaseEdge], graph.outgoingByNodeId)
            : [];
          break;
        }
        if (expiredMergeId && id !== expiredMergeId) break;
      }
      if (!progressed) {
        const pendingMerge = pendingMerges[0];
        if (
          pendingMerge?.config.kind === "logic.merge" &&
          pendingMerge.config.timeoutMs &&
          !sequenceHoldBlocksMerge({
            mergeNodeId: pendingMerge.id,
            heldSequenceEdges: allHeldSequenceEdges(),
            outgoingByNodeId: graph.outgoingByNodeId,
            scopeIds: ids,
          })
        ) {
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
    releaseHeldSequenceEdges();
    if (deferredTryCatch.result && !sequenceHoldStack.includes(deferredTryCatch.result.frame)) {
      return {
        nodeId: deferredTryCatch.result.nodeId,
        error: deferredTryCatch.result.error,
      };
    }
    return null;
  };
  const failure = await runScope(
    new Set(definition.nodes.filter((node) => !bodyIds.has(node.id)).map((node) => node.id)),
    new Set([graph.triggerNodeId]),
  );
  if (failure && ["workflow_completed", "workflow_returned"].includes(String(failure.error.code))) {
    for (const node of definition.nodes)
      if (!settledIds.has(node.id)) await emit(node, "cancelled");

    if (failure.error.code === "workflow_returned") {
      const outputs =
        failure.error.outputs && typeof failure.error.outputs === "object"
          ? (failure.error.outputs as Record<string, unknown>)
          : {};
      return {
        ok: true,
        context,
        nodeResults,
        terminal: { kind: "returned", nodeId: failure.nodeId, outputs },
      };
    }

    return {
      ok: true,
      context,
      nodeResults,
      terminal: { kind: "completed", nodeId: failure.nodeId },
    };
  }
  if (
    failure &&
    failure.error.code !== "yield_execution" &&
    failure.error.code !== "retry_backoff" &&
    failure.error.code !== "wait_suspended" &&
    failure.error.code !== "merge_suspended"
  )
    for (const node of definition.nodes)
      if (!settledIds.has(node.id))
        await emit(
          node,
          failure.error.code === "cancelled" || failure.error.terminal === true
            ? "cancelled"
            : "blocked",
        );
  if (!failure)
    for (const node of definition.nodes) if (!settledIds.has(node.id)) await emit(node, "skipped");
  return failure ? fail(failure.nodeId, failure.error) : { ok: true, context, nodeResults };
}
export const getVisualWorkflowGraphIndex = buildVisualWorkflowGraphIndex;
export type { VisualWorkflowGraphIndex } from "./graph-index";
