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

import { isWaitWakePending, parseWaitResumeState, resolveWaitSchedule } from "./wait-schedule";

const NOW = Date.parse("2026-10-01T10:00:00.000Z");

describe("resolveWaitSchedule", () => {
  it("schedules a duration without holding an in-process timer", () => {
    expect(
      resolveWaitSchedule({
        waitNodeId: "wait",
        mode: "duration",
        durationMs: 60_000,
        nowMs: NOW,
      }),
    ).toEqual({
      status: "waiting",
      resume: {
        waitNodeId: "wait",
        mode: "duration",
        scheduledAt: "2026-10-01T10:00:00.000Z",
        wakeAt: "2026-10-01T10:01:00.000Z",
      },
    });
  });

  it("completes a duration idempotently after its wake time", () => {
    const previous = {
      waitNodeId: "wait",
      mode: "duration" as const,
      scheduledAt: "2026-10-01T10:00:00.000Z",
      wakeAt: "2026-10-01T10:01:00.000Z",
    };

    expect(
      resolveWaitSchedule({
        waitNodeId: "wait",
        mode: "duration",
        durationMs: 60_000,
        previous,
        nowMs: Date.parse("2026-10-01T10:01:30.000Z"),
      }),
    ).toEqual({
      status: "completed",
      scheduledAt: "2026-10-01T10:00:00.000Z",
      resumedAt: "2026-10-01T10:01:30.000Z",
    });
  });

  it("completes immediately for a timestamp in the past", () => {
    expect(
      resolveWaitSchedule({
        waitNodeId: "wait",
        mode: "timestamp",
        timestamp: "2026-10-01T09:00:00.000Z",
        nowMs: NOW,
      }),
    ).toEqual({
      status: "completed",
      scheduledAt: "2026-10-01T10:00:00.000Z",
      resumedAt: "2026-10-01T10:00:00.000Z",
    });
  });

  it("schedules another bounded condition poll", () => {
    expect(
      resolveWaitSchedule({
        waitNodeId: "wait",
        mode: "condition",
        condition: false,
        pollingIntervalMs: 5_000,
        timeoutMs: 60_000,
        nowMs: NOW,
      }),
    ).toEqual({
      status: "waiting",
      resume: {
        waitNodeId: "wait",
        mode: "condition",
        scheduledAt: "2026-10-01T10:00:00.000Z",
        wakeAt: "2026-10-01T10:00:05.000Z",
        timeoutAt: "2026-10-01T10:01:00.000Z",
      },
    });
  });

  it("routes a bounded condition to timed out", () => {
    const previous = {
      waitNodeId: "wait",
      mode: "condition" as const,
      scheduledAt: "2026-10-01T10:00:00.000Z",
      wakeAt: "2026-10-01T10:00:55.000Z",
      timeoutAt: "2026-10-01T10:01:00.000Z",
    };

    expect(
      resolveWaitSchedule({
        waitNodeId: "wait",
        mode: "condition",
        condition: false,
        pollingIntervalMs: 5_000,
        timeoutMs: 60_000,
        previous,
        nowMs: Date.parse("2026-10-01T10:01:00.000Z"),
      }),
    ).toEqual({
      status: "timed_out",
      scheduledAt: "2026-10-01T10:00:00.000Z",
      resumedAt: "2026-10-01T10:01:00.000Z",
    });
  });

  it("completes when the condition succeeds", () => {
    expect(
      resolveWaitSchedule({
        waitNodeId: "wait",
        mode: "condition",
        condition: true,
        pollingIntervalMs: 5_000,
        timeoutMs: 60_000,
        nowMs: NOW,
      }).status,
    ).toBe("completed");
  });
});

describe("Wait resume state", () => {
  it("parses persisted state and detects a pending wake", () => {
    const resume = parseWaitResumeState({
      waitNodeId: "wait",
      mode: "duration",
      scheduledAt: "2026-10-01T10:00:00.000Z",
      wakeAt: "2026-10-01T10:01:00.000Z",
    });

    expect(resume).not.toBeNull();
    expect(isWaitWakePending(resume, NOW)).toBe(true);
    expect(isWaitWakePending(resume, Date.parse("2026-10-01T10:01:00.000Z"))).toBe(false);
  });

  it("rejects malformed persisted state", () => {
    expect(parseWaitResumeState({ waitNodeId: "wait" })).toBeNull();
  });
});
