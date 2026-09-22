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
import type { CanonicalVisualWorkflowNode } from "../schema/types";
import {
  computeRetryDelayMs,
  isRetryableWorkflowError,
  resolveRetryPolicyFromConfig,
} from "../schema/retry-policy";
import type { VisualWorkflowGraphIndex } from "./graph-index";
import type { VisualWorkflowExecutionContext } from "./context";
import { setNodeOutput } from "./context";
import { waitForRetryDelay } from "./retry-delay";

export type RunRetryScopeOptions = {
  /** When true, `onError: continue` still fails the attempt (retry body semantics). */
  failOnHandledErrors?: boolean;
};

export type RunRetryScope = (
  ids: Set<string>,
  entry: Set<string>,
  iteration?: number,
  options?: RunRetryScopeOptions,
) => Promise<{ nodeId: string; error: Record<string, unknown> } | null>;

function workflowErrorCode(error: Record<string, unknown>): string | undefined {
  return typeof error.code === "string" ? error.code : undefined;
}

function workflowErrorMessage(error: Record<string, unknown>, fallback: string): string {
  return typeof error.message === "string" ? error.message : fallback;
}

export async function runRetryRegion(input: {
  node: CanonicalVisualWorkflowNode;
  graph: VisualWorkflowGraphIndex;
  context: VisualWorkflowExecutionContext;
  nodeResults: Record<string, Record<string, unknown>>;
  runScope: RunRetryScope;
  signal?: AbortSignal;
  mockMode?: boolean;
  startAttempt?: number;
}): Promise<
  | { ok: true; output: Record<string, unknown>; exitHandle: "succeeded" | "exhausted" }
  | { ok: false; error: Record<string, unknown> }
> {
  if (input.node.config.kind !== "logic.retry") {
    return {
      ok: false,
      error: { code: "invalid_retry", message: "Node is not a retry policy node." },
    };
  }
  const policy = resolveRetryPolicyFromConfig(input.node.config);
  const bodyIds = input.node.bodyNodeIds ?? [];
  const body = new Set(bodyIds);
  const starts = new Set(
    (input.graph.outgoingByNodeId.get(input.node.id) ?? [])
      .filter((edge) => edge.sourceHandle === "attempt")
      .map((edge) => edge.target),
  );
  if (!body.size || starts.size === 0) {
    return {
      ok: false,
      error: { code: "invalid_retry", message: "Retry requires a body connected to Attempt." },
    };
  }

  let lastError: Record<string, unknown> = {
    code: "node_execution_failed",
    message: "Retry body did not succeed.",
  };
  const firstAttempt = Math.max(1, input.startAttempt ?? 1);
  let lastAttempt = firstAttempt;

  for (let attempt = firstAttempt; attempt <= policy.maxAttempts; attempt++) {
    lastAttempt = attempt;
    for (const bodyId of bodyIds) {
      delete input.context.nodes[bodyId];
      delete input.nodeResults[bodyId];
    }
    setNodeOutput(input.context, input.node.id, {
      attemptNumber: attempt,
      exhausted: false,
    });

    const failure = await input.runScope(body, starts, attempt, { failOnHandledErrors: true });
    if (!failure) {
      for (const bodyId of bodyIds) {
        delete input.context.nodes[bodyId];
        delete input.nodeResults[bodyId];
      }
      return {
        ok: true,
        output: {
          attemptNumber: attempt,
          exhausted: false,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        exitHandle: "succeeded",
      };
    }

    lastError = failure.error;
    const failureCode = workflowErrorCode(failure.error);
    if (failureCode === "yield_execution") {
      return {
        ok: false,
        error: {
          ...failure.error,
          retryNodeId: input.node.id,
          nextAttempt: attempt,
        },
      };
    }
    if (failureCode && ["needs_attention", "cancelled", "retry_backoff"].includes(failureCode)) {
      return { ok: false, error: failure.error };
    }

    const retryable = isRetryableWorkflowError(failureCode, policy);
    if (!retryable || attempt >= policy.maxAttempts) {
      break;
    }

    const delayMs = computeRetryDelayMs(policy, attempt + 1);
    const delayResult = await waitForRetryDelay({
      delayMs,
      signal: input.signal,
      mockMode: input.mockMode,
    });
    if (!delayResult.ok) {
      const error = delayResult.error;
      if (error.code === "retry_backoff") {
        return {
          ok: false,
          error: {
            ...error,
            retryNodeId: input.node.id,
            nextAttempt: attempt + 1,
          },
        };
      }
      return { ok: false, error };
    }
  }

  for (const bodyId of bodyIds) {
    delete input.context.nodes[bodyId];
    delete input.nodeResults[bodyId];
  }
  return {
    ok: true,
    output: {
      attemptNumber: lastAttempt,
      exhausted: true,
      lastErrorCode: workflowErrorCode(lastError) ?? "node_execution_failed",
      lastErrorMessage: workflowErrorMessage(lastError, "Retry attempts exhausted."),
    },
    exitHandle: "exhausted",
  };
}
