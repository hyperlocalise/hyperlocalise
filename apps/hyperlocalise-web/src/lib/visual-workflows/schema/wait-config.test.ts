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

import { visualWorkflowV3DefinitionSchema } from "./definition-schema";

function createDefinition(config: unknown) {
  return {
    schemaVersion: 3,
    name: "Wait workflow",
    nodes: [
      {
        id: "wait",
        type: "flow.wait",
        config,
      },
    ],
    edges: [],
    editor: {
      positions: {
        wait: { x: 0, y: 0 },
      },
    },
  };
}
describe("flow.wait configuration", () => {
  it("accepts a duration wait", () => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(
      createDefinition({
        kind: "flow.wait",
        mode: "duration",
        durationMs: 60_000,
      }),
    );

    expect(result.success).toBe(true);
  });

  it("accepts an absolute timestamp wait", () => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(
      createDefinition({
        kind: "flow.wait",
        mode: "timestamp",
        timestamp: "2026-10-01T10:00:00.000Z",
      }),
    );

    expect(result.success).toBe(true);
  });

  it("accepts a bounded condition wait", () => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(
      createDefinition({
        kind: "flow.wait",
        mode: "condition",
        condition: "status === 'ready'",
        pollingIntervalMs: 5_000,
        timeoutMs: 300_000,
      }),
    );

    expect(result.success).toBe(true);
  });

  it("rejects a condition wait without a timeout", () => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(
      createDefinition({
        kind: "flow.wait",
        mode: "condition",
        condition: "status === 'ready'",
        pollingIntervalMs: 5_000,
      }),
    );

    expect(result.success).toBe(false);
  });
});
