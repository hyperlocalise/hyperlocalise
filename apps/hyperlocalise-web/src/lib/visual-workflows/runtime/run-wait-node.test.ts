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

import type { CanonicalVisualWorkflowNode } from "../schema/types";
import { createVisualWorkflowExecutionContext } from "./context";
import { runWaitNode } from "./run-wait-node";

const waitNode: CanonicalVisualWorkflowNode = {
  id: "wait",
  type: "flow.wait",
  config: {
    kind: "flow.wait",
    mode: "duration",
    durationMs: 60_000,
  },
};

describe("runWaitNode", () => {
  it("suspends a duration wait", () => {
    const result = runWaitNode({
      node: waitNode,
      context: createVisualWorkflowExecutionContext({}),
      nowMs: Date.parse("2026-10-01T10:00:00.000Z"),
    });

    expect(result).toMatchObject({
      exitHandle: null,
      execution: {
        ok: false,
        error: {
          code: "wait_suspended",
          waitNodeId: "wait",
          wakeAt: "2026-10-01T10:01:00.000Z",
        },
      },
    });
  });

  it("completes through the completed handle after wakeup", () => {
    const result = runWaitNode({
      node: waitNode,
      context: createVisualWorkflowExecutionContext({}),
      resume: {
        waitNodeId: "wait",
        mode: "duration",
        scheduledAt: "2026-10-01T10:00:00.000Z",
        wakeAt: "2026-10-01T10:01:00.000Z",
      },
      nowMs: Date.parse("2026-10-01T10:01:01.000Z"),
    });

    expect(result).toEqual({
      exitHandle: "completed",
      execution: {
        ok: true,
        output: {
          status: "completed",
          scheduledAt: "2026-10-01T10:00:00.000Z",
          resumedAt: "2026-10-01T10:01:01.000Z",
        },
      },
    });
  });

  it("completes immediately in mock mode", () => {
    const result = runWaitNode({
      node: waitNode,
      context: createVisualWorkflowExecutionContext({}),
      mockMode: true,
      nowMs: Date.parse("2026-10-01T10:00:00.000Z"),
    });

    expect(result.exitHandle).toBe("completed");
    expect(result.execution).toMatchObject({
      ok: true,
      output: {
        status: "completed",
      },
    });
  });

  it("rejects an invalid timestamp for the error branch", () => {
    const result = runWaitNode({
      node: {
        id: "wait",
        type: "flow.wait",
        config: {
          kind: "flow.wait",
          mode: "timestamp",
          timestamp: "not-a-timestamp",
        },
      },
      context: createVisualWorkflowExecutionContext({}),
      nowMs: Date.parse("2026-10-01T10:00:00.000Z"),
    });

    expect(result).toEqual({
      exitHandle: null,
      execution: {
        ok: false,
        error: {
          code: "invalid_wait",
          message: "Wait timestamp must be a valid ISO timestamp.",
        },
      },
    });
  });
});
