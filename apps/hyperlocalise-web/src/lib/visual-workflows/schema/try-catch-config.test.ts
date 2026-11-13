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
import { getWorkflowOutputFields } from "../catalog/node-contracts";
import { visualWorkflowV3DefinitionSchema } from "./definition-schema";
import { fromVisualWorkflowV3Definition, toVisualWorkflowV3Definition } from "./serializers";
import type { VisualWorkflowV3Definition } from "./types";

function definition(): VisualWorkflowV3Definition {
  return {
    schemaVersion: 3,
    name: "Try / Catch boundary",
    nodes: [
      {
        id: "boundary",
        type: "logic.try_catch",
        config: { kind: "logic.try_catch" },
      },
    ],
    edges: [],
    editor: { positions: { boundary: { x: 0, y: 0 } } },
  };
}

describe("logic.try_catch configuration", () => {
  it("provides a valid default configuration", () => {
    expect(createDefaultConfig("logic.try_catch")).toEqual({ kind: "logic.try_catch" });
    expect(visualWorkflowV3DefinitionSchema.safeParse(definition()).success).toBe(true);
  });

  it("rejects a mismatched node type and configuration", () => {
    const malformed = definition();
    malformed.nodes[0] = {
      id: "boundary",
      type: "logic.try_catch",
      config: { kind: "logic.if", condition: "true" },
    };

    expect(visualWorkflowV3DefinitionSchema.safeParse(malformed).success).toBe(false);
  });

  it("declares safe optional error outputs", () => {
    expect(getWorkflowOutputFields(definition().nodes[0]!)).toEqual([
      { path: "errorCode", type: "string", optional: true },
      { path: "errorMessage", type: "string", optional: true },
      { path: "failedNodeId", type: "string", optional: true },
      { path: "attempt", type: "object", optional: true },
    ]);
  });

  it("round-trips through editor serialization", () => {
    const original = definition();
    const serialized = toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(original));

    expect(serialized.nodes).toEqual([{ ...original.nodes[0], bodyNodeIds: [] }]);
  });
});
