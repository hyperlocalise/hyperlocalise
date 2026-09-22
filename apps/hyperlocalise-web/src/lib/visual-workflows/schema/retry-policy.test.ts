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
import { describe, expect, it, vi } from "vite-plus/test";

import {
  computeRetryDelayMs,
  isRetryableWorkflowError,
  resolveRetryPolicyFromConfig,
  RETRY_MAX_ATTEMPTS_CAP,
} from "./retry-policy";

describe("resolveRetryPolicyFromConfig", () => {
  it("clamps max attempts and applies defaults", () => {
    const policy = resolveRetryPolicyFromConfig({
      kind: "logic.retry",
      maxAttempts: 99,
      initialDelayMs: -5,
      backoffMultiplier: 0.5,
      jitter: false,
      acknowledgeDuplicateRisk: true,
    });
    expect(policy.maxAttempts).toBe(RETRY_MAX_ATTEMPTS_CAP);
    expect(policy.initialDelayMs).toBe(0);
    expect(policy.backoffMultiplier).toBe(1);
    expect(policy.jitter).toBe(false);
    expect(policy.acknowledgeDuplicateRisk).toBe(true);
    expect(policy.retryableErrorCodes).toContain("http_request_failed");
  });
});

describe("computeRetryDelayMs", () => {
  it("returns zero for the first attempt window", () => {
    const policy = resolveRetryPolicyFromConfig({
      kind: "logic.retry",
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      jitter: false,
    });
    expect(computeRetryDelayMs(policy, 1)).toBe(0);
  });

  it("applies exponential backoff without jitter", () => {
    const policy = resolveRetryPolicyFromConfig({
      kind: "logic.retry",
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      jitter: false,
    });
    expect(computeRetryDelayMs(policy, 2)).toBe(1000);
    expect(computeRetryDelayMs(policy, 3)).toBe(2000);
  });

  it("jitters delay within a bounded spread", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const policy = resolveRetryPolicyFromConfig({
      kind: "logic.retry",
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      jitter: true,
    });
    expect(computeRetryDelayMs(policy, 2)).toBe(1000);
    vi.restoreAllMocks();
  });
});

describe("isRetryableWorkflowError", () => {
  const policy = resolveRetryPolicyFromConfig({ kind: "logic.retry" });

  it("allows configured retryable codes", () => {
    expect(isRetryableWorkflowError("http_request_failed", policy)).toBe(true);
  });

  it("rejects never-retry control codes", () => {
    expect(isRetryableWorkflowError("yield_execution", policy)).toBe(false);
    expect(isRetryableWorkflowError("retry_backoff", policy)).toBe(false);
  });
});
