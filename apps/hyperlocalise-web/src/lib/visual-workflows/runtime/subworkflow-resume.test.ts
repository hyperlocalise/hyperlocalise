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
import { describe, expect, it } from "vite-plus/test";

import { hasWorkflowRunExceededDeadline, shouldStopAutomaticNodeRetry } from "./subworkflow-resume";

describe("subworkflow durable resume", () => {
  it("does not consume another attempt while the child is still running", () => {
    expect(
      shouldStopAutomaticNodeRetry({
        execution: {
          ok: false,
          error: { code: "yield_execution", message: "Child is still running." },
        },
        offset: 0,
        maxAttempts: 3,
      }),
    ).toBe(true);
    expect(
      shouldStopAutomaticNodeRetry({
        execution: { ok: false, error: { code: "temporary_failure", message: "Retry." } },
        offset: 0,
        maxAttempts: 3,
      }),
    ).toBe(false);
  });

  it("exempts an active child wait and subtracts completed child-wait time", () => {
    const nowMs = Date.parse("2026-10-13T06:00:00.000Z");
    const startedAt = "2026-10-13T02:00:00.000Z";
    const timeoutMs = 2 * 60 * 60 * 1000;

    expect(
      hasWorkflowRunExceededDeadline({
        startedAt,
        nowMs,
        timeoutMs,
        pausedMs: 0,
        hasDurableResume: true,
      }),
    ).toBe(false);
    expect(
      hasWorkflowRunExceededDeadline({
        startedAt,
        nowMs,
        timeoutMs,
        pausedMs: 3 * 60 * 60 * 1000,
        hasDurableResume: false,
      }),
    ).toBe(false);
    expect(
      hasWorkflowRunExceededDeadline({
        startedAt,
        nowMs,
        timeoutMs,
        pausedMs: 60 * 60 * 1000,
        hasDurableResume: false,
      }),
    ).toBe(true);
  });
});
