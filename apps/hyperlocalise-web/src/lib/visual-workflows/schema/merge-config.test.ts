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
    name: "Merge workflow",
    nodes: [
      {
        id: "merge",
        type: "logic.merge",
        config,
      },
    ],
    edges: [],
    editor: {
      positions: {
        merge: { x: 0, y: 0 },
      },
    },
  };
}

describe("logic.merge configuration", () => {
  it.each(["all", "any", "first_success"] as const)("accepts the %s mode", (mode) => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(
      createDefinition({
        kind: "logic.merge",
        mode,
        inputs: [
          { id: "email", name: "Email" },
          { id: "slack", name: "Slack" },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });

  it("accepts an optional timeout", () => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(
      createDefinition({
        kind: "logic.merge",
        mode: "all",
        inputs: [
          { id: "email", name: "Email" },
          { id: "slack", name: "Slack" },
        ],
        timeoutMs: 300_000,
      }),
    );

    expect(result.success).toBe(true);
  });

  it("rejects duplicate input IDs", () => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(
      createDefinition({
        kind: "logic.merge",
        mode: "all",
        inputs: [
          { id: "same", name: "Email" },
          { id: "same", name: "Slack" },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects fewer than two inputs", () => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(
      createDefinition({
        kind: "logic.merge",
        mode: "all",
        inputs: [{ id: "email", name: "Email" }],
      }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects an invalid timeout", () => {
    const result = visualWorkflowV3DefinitionSchema.safeParse(
      createDefinition({
        kind: "logic.merge",
        mode: "all",
        inputs: [
          { id: "email", name: "Email" },
          { id: "slack", name: "Slack" },
        ],
        timeoutMs: 0,
      }),
    );

    expect(result.success).toBe(false);
  });
});
