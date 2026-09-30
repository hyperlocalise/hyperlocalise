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
import type { VisualNodeConfig } from "./types";

export const RETRY_DELAY_INLINE_MAX_MS = 30_000;
export const RETRY_MAX_ATTEMPTS_CAP = 10;

export const DEFAULT_RETRYABLE_ERROR_CODES = [
  "node_execution_failed",
  "http_request_failed",
  "http_error",
  "invalid_node_input",
  "invalid_node_output",
] as const;

export const NEVER_RETRY_ERROR_CODES = new Set([
  "needs_attention",
  "cancelled",
  "yield_execution",
  "retry_backoff",
  "invalid_graph",
  "execution_limit",
  "loop_limit",
  "non_idempotent_retry",
]);

export type ResolvedRetryPolicy = {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrorCodes: string[];
  acknowledgeDuplicateRisk: boolean;
};

export function isLogicRetryConfig(
  config: VisualNodeConfig,
): config is Extract<VisualNodeConfig, { kind: "logic.retry" }> {
  return config.kind === "logic.retry";
}

export function resolveRetryPolicyFromConfig(
  config: Extract<VisualNodeConfig, { kind: "logic.retry" }>,
): ResolvedRetryPolicy {
  const maxAttempts = Math.min(
    RETRY_MAX_ATTEMPTS_CAP,
    Math.max(1, Math.floor(config.maxAttempts ?? 3)),
  );
  const initialDelayMs = Math.max(0, Math.floor(config.initialDelayMs ?? 1000));
  const backoffMultiplier = Math.max(1, config.backoffMultiplier ?? 2);
  const codes =
    config.retryableErrorCodes && config.retryableErrorCodes.length > 0
      ? config.retryableErrorCodes
      : [...DEFAULT_RETRYABLE_ERROR_CODES];
  return {
    maxAttempts,
    initialDelayMs,
    backoffMultiplier,
    jitter: config.jitter ?? true,
    retryableErrorCodes: codes,
    acknowledgeDuplicateRisk: config.acknowledgeDuplicateRisk ?? false,
  };
}

export function computeRetryDelayMs(policy: ResolvedRetryPolicy, attemptIndex: number): number {
  if (attemptIndex <= 1) {
    return 0;
  }
  const exponent = attemptIndex - 2;
  let delay = policy.initialDelayMs * policy.backoffMultiplier ** exponent;
  if (policy.jitter) {
    const spread = delay * 0.25;
    delay = delay - spread + Math.random() * spread * 2;
  }
  return Math.max(0, Math.floor(delay));
}

export function isRetryableWorkflowError(
  code: string | undefined,
  policy: ResolvedRetryPolicy,
): boolean {
  if (!code || NEVER_RETRY_ERROR_CODES.has(code)) {
    return false;
  }
  return policy.retryableErrorCodes.includes(code);
}
