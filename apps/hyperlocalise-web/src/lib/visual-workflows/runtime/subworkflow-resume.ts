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
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

export type SubworkflowResumeState = {
  childRunId: string;
  waitingSince: string;
};

export function parseSubworkflowResumeState(value: unknown): SubworkflowResumeState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.childRunId === "string" && typeof candidate.waitingSince === "string"
    ? { childRunId: candidate.childRunId, waitingSince: candidate.waitingSince }
    : null;
}

export function parseSubworkflowPausedMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function shouldStopAutomaticNodeRetry(input: {
  execution: Extract<VisualWorkflowNodeExecutionResult, { ok: false }>;
  offset: number;
  maxAttempts: number;
}): boolean {
  return input.execution.error.code === "yield_execution" || input.offset === input.maxAttempts - 1;
}

export function hasWorkflowRunExceededDeadline(input: {
  startedAt: string | null;
  nowMs: number;
  timeoutMs: number;
  pausedMs: number;
  hasDurableResume: boolean;
}): boolean {
  if (!input.startedAt || input.hasDurableResume) return false;
  return input.nowMs - Date.parse(input.startedAt) - input.pausedMs > input.timeoutMs;
}
