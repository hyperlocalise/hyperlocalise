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

import { createDefaultConfig } from "../catalog/node-catalog";
import { buildVisualWorkflowNodeIdempotencyKey } from "./retry-idempotency";

describe("buildVisualWorkflowNodeIdempotencyKey", () => {
  it("reuses the same key across retry attempts when an idempotency header is set", () => {
    const node = {
      id: "http",
      type: "action.http" as const,
      config: {
        kind: "action.http" as const,
        method: "POST" as const,
        url: "https://example.test",
        idempotencyHeader: "Idempotency-Key",
        onError: "stop" as const,
      },
    };

    const attempt1 = buildVisualWorkflowNodeIdempotencyKey({
      runId: "run-1",
      nodeId: "http",
      iteration: 1,
      inRetryBody: true,
      node,
    });
    const attempt2 = buildVisualWorkflowNodeIdempotencyKey({
      runId: "run-1",
      nodeId: "http",
      iteration: 2,
      inRetryBody: true,
      node,
    });

    expect(attempt1).toBe("run-1/http");
    expect(attempt2).toBe(attempt1);
  });

  it("includes iteration outside retry bodies", () => {
    const node = {
      id: "http",
      type: "action.http" as const,
      config: createDefaultConfig("action.http"),
    };

    expect(
      buildVisualWorkflowNodeIdempotencyKey({
        runId: "run-1",
        nodeId: "http",
        iteration: 3,
        inRetryBody: false,
        node,
      }),
    ).toBe("run-1/http/3");
  });
});
