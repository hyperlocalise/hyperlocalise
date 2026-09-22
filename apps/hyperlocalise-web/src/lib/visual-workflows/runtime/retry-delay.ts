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

export type RetryBackoffState = {
  retryNodeId: string;
  wakeAt: string;
  nextAttempt: number;
};

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
