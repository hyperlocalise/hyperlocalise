/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 */
import { describe, expect, it } from "vite-plus/test";
import { isMergeWakePending, parseMergeResumeState, resolveMergeTimeout } from "./merge-timeout";

describe("Merge durable timeout", () => {
  it("creates and reuses a durable wakeup", () => {
    const first = resolveMergeTimeout({
      mergeNodeId: "merge",
      timeoutMs: 5_000,
      nowMs: 1_000,
    });
    expect(first).toEqual({
      status: "waiting",
      resume: {
        mergeNodeId: "merge",
        iteration: -1,
        scheduledAt: "1970-01-01T00:00:01.000Z",
        wakeAt: "1970-01-01T00:00:06.000Z",
      },
    });
    if (first.status !== "waiting") throw new Error("expected waiting");
    expect(
      resolveMergeTimeout({
        mergeNodeId: "merge",
        timeoutMs: 5_000,
        previous: first.resume,
        nowMs: 2_000,
      }),
    ).toEqual(first);
    expect(isMergeWakePending(first.resume, 5_999)).toBe(true);
  });

  it("times out only the matching invocation", () => {
    const resume = parseMergeResumeState({
      mergeNodeId: "merge",
      iteration: 2,
      scheduledAt: "1970-01-01T00:00:01.000Z",
      wakeAt: "1970-01-01T00:00:06.000Z",
    });
    expect(resume).not.toBeNull();
    expect(
      resolveMergeTimeout({
        mergeNodeId: "merge",
        iteration: 2,
        timeoutMs: 5_000,
        previous: resume,
        nowMs: 6_000,
      }),
    ).toEqual({ status: "timed_out" });
    expect(
      resolveMergeTimeout({
        mergeNodeId: "merge",
        iteration: 3,
        timeoutMs: 5_000,
        previous: resume,
        nowMs: 6_000,
      }).status,
    ).toBe("waiting");
  });
});
