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
import { NODE_CONTRACTS } from "../catalog/node-contracts";
import { visualNodeConfigSchema } from "./definition-schema";
import { fromVisualWorkflowV3Definition, toVisualWorkflowV3Definition } from "./serializers";
import type { VisualWorkflowV3Definition } from "./types";

describe("Array transform node configuration", () => {
  it("provides a valid map configuration by default", () => {
    const config = createDefaultConfig("logic.array_transform");

    expect(config).toEqual({
      kind: "logic.array_transform",
      operation: "map",
      collection: "[]",
      itemType: "unknown",
      resultType: "unknown",
    });
    expect(visualNodeConfigSchema.safeParse(config).success).toBe(true);
  });

  it.each(["filter", "map", "find"] as const)("accepts the %s operation", (operation) => {
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "logic.array_transform",
        operation,
        collection: "{{ trigger.items }}",
        itemType: "object",
        resultType: operation === "map" ? "string" : "object",
      }).success,
    ).toBe(true);
  });

  it("requires an explicit initial value for reduce", () => {
    const reduce = {
      kind: "logic.array_transform",
      operation: "reduce",
      collection: "{{ trigger.items }}",
      itemType: "number",
      resultType: "number",
    } as const;

    expect(visualNodeConfigSchema.safeParse(reduce).success).toBe(false);
    expect(visualNodeConfigSchema.safeParse({ ...reduce, initialValue: 0 }).success).toBe(true);
  });

  it("rejects unsupported operations and unbounded collection expressions", () => {
    const config = createDefaultConfig("logic.array_transform");

    expect(visualNodeConfigSchema.safeParse({ ...config, operation: "sort" }).success).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({ ...config, collection: "x".repeat(2_001) }).success,
    ).toBe(false);
  });

  it("declares stable typed collection, item, index, accumulator, and result ports", () => {
    expect(NODE_CONTRACTS["logic.array_transform"]).toEqual({
      inputs: [
        { name: "collection", type: "array", required: true },
        { name: "initialValue", type: "unknown", required: false },
      ],
      outputs: [
        { path: "item", type: "unknown", optional: false },
        { path: "index", type: "number", optional: false },
        { path: "count", type: "number", optional: false },
        { path: "accumulator", type: "unknown", optional: true },
        { path: "items", type: "array", optional: true },
        { path: "value", type: "unknown", optional: true },
        { path: "found", type: "boolean", optional: true },
      ],
      mock: {},
    });
  });

  it("round-trips operation, collection bindings, body ownership, and collected result", () => {
    const original: VisualWorkflowV3Definition = {
      schemaVersion: 3,
      name: "Array transform round trip",
      nodes: [
        {
          id: "transform",
          type: "logic.array_transform",
          config: {
            kind: "logic.array_transform",
            operation: "reduce",
            collection: "{{trigger.items}}",
            itemType: "number",
            resultType: "number",
            initialValue: 0,
          },
          bodyNodeIds: ["body"],
          collect: {
            result: { kind: "reference", nodeId: "body", path: ["value"] },
          },
        },
        {
          id: "body",
          type: "logic.select_path",
          config: {
            kind: "logic.select_path",
            path: ["value"],
            outputType: "unknown",
            missingBehavior: "error",
          },
        },
        {
          id: "after",
          type: "logic.set",
          config: { kind: "logic.set", assignments: [] },
        },
      ],
      edges: [
        {
          id: "each",
          kind: "execution",
          source: "transform",
          target: "body",
          sourcePortId: "each",
          targetPortId: "input",
        },
        {
          id: "done",
          kind: "execution",
          source: "transform",
          target: "after",
          sourcePortId: "done",
          targetPortId: "input",
        },
      ],
      editor: { positions: {} },
    };

    const roundTripped = toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(original));
    const transform = roundTripped.nodes.find((node) => node.id === "transform");

    expect(roundTripped).toMatchObject({
      schemaVersion: 3,
      name: original.name,
      edges: original.edges,
    });
    expect(transform).toMatchObject({
      type: "logic.array_transform",
      config: original.nodes[0]?.config,
      bodyNodeIds: ["body"],
      collect: original.nodes[0]?.collect,
    });
  });
});
