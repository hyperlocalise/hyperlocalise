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
import { RETRY_DELAY_INLINE_MAX_MS } from "../schema/retry-policy";

/** Persisted on the run payload to resume a `logic.retry` region across durable slices. */
export type RetryResumeState = {
  retryNodeId: string;
  nextAttempt: number;
  /** Present when the worker must not execute until this instant (long backoff). */
  wakeAt?: string;
};

/** @deprecated Use `RetryResumeState` — kept as alias for existing imports. */
export type RetryBackoffState = RetryResumeState;

export function parseRetryResumeState(value: unknown): RetryResumeState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.retryNodeId !== "string" || typeof record.nextAttempt !== "number") {
    return null;
  }
  const wakeAt = typeof record.wakeAt === "string" ? record.wakeAt : undefined;
  return {
    retryNodeId: record.retryNodeId,
    nextAttempt: record.nextAttempt,
    wakeAt,
  };
}

export function isRetryWakePending(resume: RetryResumeState | null | undefined): boolean {
  if (!resume?.wakeAt) {
    return false;
  }
  const wakeMs = Date.parse(resume.wakeAt);
  return Number.isFinite(wakeMs) && Date.now() < wakeMs;
}

export async function waitForRetryDelay(input: {
  delayMs: number;
  signal?: AbortSignal;
  mockMode?: boolean;
}): Promise<{ ok: true } | { ok: false; error: Record<string, unknown> }> {
  if (input.mockMode || input.delayMs <= 0) {
    return { ok: true };
  }
  if (input.signal?.aborted) {
    return { ok: false, error: { code: "cancelled", message: "Run cancelled." } };
  }
  if (input.delayMs <= RETRY_DELAY_INLINE_MAX_MS) {
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, input.delayMs);
        input.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("cancelled"));
          },
          { once: true },
        );
      });
    } catch {
      return { ok: false, error: { code: "cancelled", message: "Run cancelled." } };
    }
    return { ok: true };
  }
  const wakeAt = new Date(Date.now() + input.delayMs).toISOString();
  return {
    ok: false,
    error: {
      code: "retry_backoff",
      message: "Waiting before the next retry attempt.",
      wakeAt,
      delayMs: input.delayMs,
    },
  };
}
