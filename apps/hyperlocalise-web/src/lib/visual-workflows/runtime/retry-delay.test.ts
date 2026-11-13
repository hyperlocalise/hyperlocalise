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

import { isRetryWakePending, parseRetryResumeState } from "./retry-delay";

describe("parseRetryResumeState", () => {
  it("parses resume without wake", () => {
    expect(parseRetryResumeState({ retryNodeId: "retry", nextAttempt: 2 })).toEqual({
      retryNodeId: "retry",
      nextAttempt: 2,
    });
  });

  it("rejects invalid shapes", () => {
    expect(parseRetryResumeState(null)).toBeNull();
    expect(parseRetryResumeState({ retryNodeId: "x" })).toBeNull();
  });
});

describe("isRetryWakePending", () => {
  it("returns true before wakeAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    expect(
      isRetryWakePending({
        retryNodeId: "retry",
        nextAttempt: 2,
        wakeAt: "2026-01-01T00:05:00.000Z",
      }),
    ).toBe(true);
    vi.useRealTimers();
  });

  it("returns false after wakeAt or without wakeAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:10:00.000Z"));
    expect(
      isRetryWakePending({
        retryNodeId: "retry",
        nextAttempt: 2,
        wakeAt: "2026-01-01T00:05:00.000Z",
      }),
    ).toBe(false);
    expect(isRetryWakePending({ retryNodeId: "retry", nextAttempt: 2 })).toBe(false);
    vi.useRealTimers();
  });
});
