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
import { VISUAL_NODE_DESCRIPTIONS } from "../catalog/node-descriptions";
import { visualNodeConfigSchema, visualWorkflowV3DefinitionSchema } from "./definition-schema";
import { fromVisualWorkflowV3Definition, toVisualWorkflowV3Definition } from "./serializers";

describe("JSON node configuration", () => {
  it("provides safe defaults for parse, stringify, and schema validation", () => {
    expect(createDefaultConfig("logic.json_parse")).toEqual({
      kind: "logic.json_parse",
      text: "{}",
    });
    expect(createDefaultConfig("logic.json_stringify")).toEqual({
      kind: "logic.json_stringify",
      value: null,
    });
    expect(createDefaultConfig("logic.schema_validate")).toEqual({
      kind: "logic.schema_validate",
      value: null,
      schema: {},
    });
  });

  it("accepts bounded JSON configs and rejects non-object schemas", () => {
    expect(
      visualNodeConfigSchema.safeParse({ kind: "logic.json_parse", text: '{"ok":true}' }).success,
    ).toBe(true);
    expect(
      visualNodeConfigSchema.safeParse({ kind: "logic.json_stringify", value: { ok: true } })
        .success,
    ).toBe(true);
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "logic.schema_validate",
        value: { ok: true },
        schema: { type: "object" },
      }).success,
    ).toBe(true);
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "logic.schema_validate",
        value: null,
        schema: "https://example.com/schema.json",
      }).success,
    ).toBe(false);
  });

  it("registers user-facing catalog descriptions", () => {
    expect(VISUAL_NODE_DESCRIPTIONS["logic.json_parse"].title).toBe("Parse JSON");
    expect(VISUAL_NODE_DESCRIPTIONS["logic.json_stringify"].title).toBe("Stringify JSON");
    expect(VISUAL_NODE_DESCRIPTIONS["logic.schema_validate"].title).toBe("Validate schema");
  });

  it("declares stable typed inputs and structured result ports", () => {
    expect(NODE_CONTRACTS["logic.json_parse"]).toEqual({
      inputs: [{ name: "text", type: "string", required: true }],
      outputs: [
        { path: "value", type: "unknown", optional: true },
        { path: "error", type: "object", optional: true },
      ],
      mock: { value: null },
    });
    expect(NODE_CONTRACTS["logic.json_stringify"]).toEqual({
      inputs: [{ name: "value", type: "unknown", required: true }],
      outputs: [
        { path: "text", type: "string", optional: true },
        { path: "error", type: "object", optional: true },
      ],
      mock: { text: "null" },
    });
    expect(NODE_CONTRACTS["logic.schema_validate"]).toEqual({
      inputs: [
        { name: "value", type: "unknown", required: true },
        { name: "schema", type: "object", required: true },
      ],
      outputs: [
        { path: "value", type: "unknown", optional: false },
        { path: "valid", type: "boolean", optional: false },
        { path: "errors", type: "array", optional: true },
      ],
      mock: { value: null, valid: true, errors: [] },
    });
  });

  it("round-trips all JSON node configs", () => {
    const original = {
      schemaVersion: 3 as const,
      name: "JSON operations",
      nodes: [
        {
          id: "parse",
          type: "logic.json_parse" as const,
          config: { kind: "logic.json_parse" as const, text: '{"name":"Ada"}' },
        },
        {
          id: "stringify",
          type: "logic.json_stringify" as const,
          config: { kind: "logic.json_stringify" as const, value: { name: "Ada" } },
        },
        {
          id: "validate",
          type: "logic.schema_validate" as const,
          config: {
            kind: "logic.schema_validate" as const,
            value: { name: "Ada" },
            schema: { type: "object", required: ["name"] },
          },
        },
      ],
      edges: [],
      editor: {
        positions: {
          parse: { x: 0, y: 0 },
          stringify: { x: 320, y: 0 },
          validate: { x: 640, y: 0 },
        },
      },
    };

    const parsed = visualWorkflowV3DefinitionSchema.parse(original);
    expect(toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(parsed))).toEqual(original);
  });
});
