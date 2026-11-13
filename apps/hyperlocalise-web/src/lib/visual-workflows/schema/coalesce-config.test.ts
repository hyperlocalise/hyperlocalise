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
import { getWorkflowInputFields, getWorkflowOutputFields } from "../catalog/node-contracts";
import { visualNodeConfigSchema, visualWorkflowV3DefinitionSchema } from "./definition-schema";
import { fromVisualWorkflowV3Definition, toVisualWorkflowV3Definition } from "./serializers";
import type { CanonicalVisualWorkflowNode, VisualNodeConfig } from "./types";

function node(config: VisualNodeConfig): CanonicalVisualWorkflowNode {
  return { id: "coalesce", type: "logic.coalesce", config };
}

const flags = {
  treatNullAsMissing: true,
  treatEmptyStringAsMissing: false,
  treatEmptyArrayAsMissing: false,
  treatEmptyObjectAsMissing: false,
};

describe("Coalesce node contract", () => {
  it("creates two ordered inputs with stable unique ids", () => {
    const config = createDefaultConfig("logic.coalesce");
    expect(config).toMatchObject({ kind: "logic.coalesce", ...flags });
    if (config.kind !== "logic.coalesce") throw new Error("Expected coalesce config");
    expect(config.inputs).toHaveLength(2);
    expect(config.inputs[0]?.id).not.toBe(config.inputs[1]?.id);
  });

  it("exposes ordered optional inputs and derives a safe output type", () => {
    const config: VisualNodeConfig = {
      kind: "logic.coalesce",
      inputs: [
        { id: "primary", name: "Primary", type: "string" },
        { id: "fallback", name: "Fallback", type: "string", defaultValue: "en" },
      ],
      ...flags,
    };
    expect(getWorkflowInputFields(node(config))).toEqual([
      { name: "value.primary", type: "string", required: false },
      { name: "value.fallback", type: "string", required: false },
    ]);
    expect(getWorkflowOutputFields(node(config))).toContainEqual({
      path: "value",
      type: "string",
      optional: false,
    });

    config.inputs[1] = {
      id: "fallback",
      name: "Fallback",
      type: "string",
      defaultValue: "",
    };
    config.treatEmptyStringAsMissing = true;
    expect(getWorkflowOutputFields(node(config))).toContainEqual({
      path: "value",
      type: "string",
      optional: true,
    });

    config.inputs[1] = { id: "fallback", name: "Fallback", type: "number" };
    expect(getWorkflowOutputFields(node(config))).toContainEqual({
      path: "value",
      type: "unknown",
      optional: true,
    });
  });

  it("rejects malformed lists, duplicate identities and incompatible defaults", () => {
    const base = { kind: "logic.coalesce" as const, ...flags };
    expect(visualNodeConfigSchema.safeParse({ ...base, inputs: [] }).success).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({
        ...base,
        inputs: [
          { id: "same", name: "Same", type: "string" },
          { id: "same", name: "Same", type: "number" },
        ],
      }).success,
    ).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({
        ...base,
        inputs: [
          { id: "one", name: "One", type: "number", defaultValue: "nope" },
          { id: "two", name: "Two", type: "number" },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts at most 32 ordered inputs", () => {
    const inputs = Array.from({ length: 32 }, (_, index) => ({
      id: `value-${index}`,
      name: `Value ${index}`,
      type: "unknown" as const,
    }));
    expect(
      visualNodeConfigSchema.safeParse({ kind: "logic.coalesce", inputs, ...flags }).success,
    ).toBe(true);
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "logic.coalesce",
        inputs: [...inputs, { id: "overflow", name: "Overflow", type: "unknown" }],
        ...flags,
      }).success,
    ).toBe(false);
  });

  it("round-trips ordering, stable ids, defaults and missing-value policy", () => {
    const original = {
      schemaVersion: 3 as const,
      name: "Default locale",
      nodes: [
        {
          id: "coalesce",
          type: "logic.coalesce" as const,
          config: {
            kind: "logic.coalesce" as const,
            inputs: [
              { id: "requested", name: "Requested", type: "string" as const },
              { id: "default", name: "Default", type: "string" as const, defaultValue: "en" },
            ],
            ...flags,
          },
          inputs: {
            "value.requested": {
              kind: "reference" as const,
              nodeId: "source",
              path: ["locale"],
              optional: true,
              fallback: "fr",
            },
          },
        },
      ],
      edges: [],
      editor: { positions: { coalesce: { x: 0, y: 0 } } },
    };
    const parsed = visualWorkflowV3DefinitionSchema.parse(original);
    expect(toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(parsed))).toEqual(original);
  });
});
