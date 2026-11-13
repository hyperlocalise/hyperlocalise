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

import { resolveDurableWaitMergeWake } from "./durable-resume-wake";
import type { MergeResumeState } from "./merge-timeout";
import type { WaitResumeState } from "./wait-schedule";

const wait = (wakeAt: string): WaitResumeState => ({
  waitNodeId: "wait",
  mode: "duration",
  iteration: -1,
  scheduledAt: "2026-01-01T00:00:00.000Z",
  wakeAt,
});

const merge = (wakeAt: string): MergeResumeState => ({
  mergeNodeId: "merge",
  iteration: -1,
  scheduledAt: "2026-01-01T00:00:00.000Z",
  wakeAt,
});

describe("resolveDurableWaitMergeWake", () => {
  it("sleeps until the earliest pending wake", () => {
    expect(
      resolveDurableWaitMergeWake({
        waitResume: wait("2026-01-01T00:00:05.000Z"),
        mergeResume: merge("2026-01-01T00:01:00.000Z"),
        nowMs: Date.parse("2026-01-01T00:00:01.000Z"),
      }),
    ).toEqual({ action: "sleep", wakeAt: "2026-01-01T00:00:05.000Z" });
  });

  it("executes immediately when Wait is due while Merge timeout is still pending", () => {
    expect(
      resolveDurableWaitMergeWake({
        waitResume: wait("2026-01-01T00:00:05.000Z"),
        mergeResume: merge("2026-01-01T00:01:00.000Z"),
        nowMs: Date.parse("2026-01-01T00:00:10.000Z"),
      }),
    ).toEqual({ action: "execute" });
  });

  it("executes immediately when Merge timeout is due while Wait is still pending", () => {
    expect(
      resolveDurableWaitMergeWake({
        waitResume: wait("2026-01-01T00:01:00.000Z"),
        mergeResume: merge("2026-01-01T00:00:05.000Z"),
        nowMs: Date.parse("2026-01-01T00:00:10.000Z"),
      }),
    ).toEqual({ action: "execute" });
  });

  it("executes when both wakes are due", () => {
    expect(
      resolveDurableWaitMergeWake({
        waitResume: wait("2026-01-01T00:00:05.000Z"),
        mergeResume: merge("2026-01-01T00:00:06.000Z"),
        nowMs: Date.parse("2026-01-01T00:00:10.000Z"),
      }),
    ).toEqual({ action: "execute" });
  });
});
