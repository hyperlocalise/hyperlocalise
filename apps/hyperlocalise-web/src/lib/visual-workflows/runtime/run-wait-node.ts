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
import type { VisualWorkflowExecutionContext } from "./context";
import { evaluateVisualWorkflowCondition } from "./expressions";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";
import { resolveWaitSchedule, type WaitResumeState } from "./wait-schedule";

export type WaitExecutionResult = {
  execution: VisualWorkflowNodeExecutionResult;
  exitHandle: "completed" | "timed_out" | null;
};

export function runWaitNode(input: {
  node: CanonicalVisualWorkflowNode;
  context: VisualWorkflowExecutionContext;
  resume?: WaitResumeState | null;
  mockMode?: boolean;
  nowMs?: number;
}): WaitExecutionResult {
  if (input.node.config.kind !== "flow.wait") {
    return {
      execution: {
        ok: false,
        error: {
          code: "invalid_wait",
          message: "Expected a Wait node configuration.",
        },
      },
      exitHandle: null,
    };
  }

  const config = input.node.config;
  const nowMs = input.nowMs ?? Date.now();

  if (input.mockMode) {
    const now = new Date(nowMs).toISOString();

    return {
      execution: {
        ok: true,
        output: {
          status: "completed",
          scheduledAt: now,
          resumedAt: now,
        },
      },
      exitHandle: "completed",
    };
  }

  let condition: unknown = config.condition;

  if (config.mode === "condition") {
    condition =
      typeof config.condition === "boolean"
        ? config.condition
        : evaluateVisualWorkflowCondition(String(config.condition ?? ""), input.context, true);
  }

  const result = resolveWaitSchedule({
    waitNodeId: input.node.id,
    mode: config.mode,
    durationMs: config.durationMs,
    timestamp: config.timestamp,
    condition,
    pollingIntervalMs: config.pollingIntervalMs,
    timeoutMs: config.timeoutMs,
    previous: input.resume?.waitNodeId === input.node.id ? input.resume : null,
    nowMs,
  });

  if (result.status === "invalid") {
    return {
      execution: {
        ok: false,
        error: result.error,
      },
      exitHandle: null,
    };
  }

  if (result.status === "waiting") {
    return {
      execution: {
        ok: false,
        error: {
          code: "wait_suspended",
          message: "Workflow execution is waiting for a durable wakeup.",
          ...result.resume,
        },
      },
      exitHandle: null,
    };
  }

  return {
    execution: {
      ok: true,
      output: {
        status: result.status,
        scheduledAt: result.scheduledAt,
        resumedAt: result.resumedAt,
      },
    },
    exitHandle: result.status === "timed_out" ? "timed_out" : "completed",
  };
}
