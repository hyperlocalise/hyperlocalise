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
import { visualWorkflowV3DefinitionSchema } from "./definition-schema";
import { fromVisualWorkflowV3Definition, toVisualWorkflowV3Definition } from "./serializers";
import type { CanonicalVisualWorkflowNode, VisualNodeConfig } from "./types";

function definition(type: "logic.create_object" | "logic.merge_objects", config: VisualNodeConfig) {
  return {
    schemaVersion: 3 as const,
    name: "Object nodes",
    nodes: [{ id: "object", type, config }],
    edges: [],
    editor: { positions: { object: { x: 0, y: 0 } } },
  };
}

describe("object node contracts", () => {
  it("creates safe defaults for both object nodes", () => {
    expect(createDefaultConfig("logic.create_object")).toEqual({
      kind: "logic.create_object",
      fields: [],
    });
    const merge = createDefaultConfig("logic.merge_objects");
    expect(merge).toMatchObject({
      kind: "logic.merge_objects",
      conflictPolicy: "reject",
      inputs: [{ name: "Object 1" }, { name: "Object 2" }],
    });
    if (merge.kind === "logic.merge_objects") {
      expect(new Set(merge.inputs.map((input) => input.id)).size).toBe(2);
    }
  });

  it("uses stable IDs for dynamic Create Object ports", () => {
    const node: CanonicalVisualWorkflowNode = {
      id: "create",
      type: "logic.create_object",
      config: {
        kind: "logic.create_object",
        fields: [
          { id: "customer-id", name: "Renamed customer", type: "string" },
          { id: "metadata", name: "Metadata", type: "object", defaultValue: {} },
        ],
      },
    };

    expect(getWorkflowInputFields(node)).toEqual([
      { name: "value.customer-id", type: "string", required: true },
      { name: "value.metadata", type: "object", required: false },
    ]);
    expect(getWorkflowOutputFields(node)).toContainEqual({
      path: "value",
      type: "object",
      optional: false,
    });
  });

  it("uses stable object input IDs and an explicit merge conflict policy", () => {
    const config: VisualNodeConfig = {
      kind: "logic.merge_objects",
      inputs: [
        { id: "base", name: "Renamed base" },
        { id: "override", name: "Overrides" },
      ],
      conflictPolicy: "last_wins",
    };
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(definition(config.kind, config)).success,
    ).toBe(true);

    const node: CanonicalVisualWorkflowNode = {
      id: "merge",
      type: config.kind,
      config,
    };
    expect(getWorkflowInputFields(node)).toEqual([
      { name: "value.base", type: "object", required: true },
      { name: "value.override", type: "object", required: true },
    ]);
  });

  it("rejects duplicate field IDs, duplicate names and fewer than two merge inputs", () => {
    const duplicateFields: VisualNodeConfig = {
      kind: "logic.create_object",
      fields: [
        { id: "same", name: "same", type: "string" },
        { id: "same", name: "same", type: "number" },
      ],
    };
    const tooFewInputs: VisualNodeConfig = {
      kind: "logic.merge_objects",
      inputs: [{ id: "only", name: "Only" }],
      conflictPolicy: "reject",
    };

    expect(
      visualWorkflowV3DefinitionSchema.safeParse(definition(duplicateFields.kind, duplicateFields))
        .success,
    ).toBe(false);
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(definition(tooFewInputs.kind, tooFewInputs))
        .success,
    ).toBe(false);
  });

  it("rejects unsafe field names and defaults with incompatible types", () => {
    const unsafe: VisualNodeConfig = {
      kind: "logic.create_object",
      fields: [{ id: "unsafe", name: "__proto__", type: "string" }],
    };
    const incompatibleDefault: VisualNodeConfig = {
      kind: "logic.create_object",
      fields: [{ id: "count", name: "count", type: "number", defaultValue: "one" }],
    };

    expect(
      visualWorkflowV3DefinitionSchema.safeParse(definition(unsafe.kind, unsafe)).success,
    ).toBe(false);
    expect(
      visualWorkflowV3DefinitionSchema.safeParse(
        definition(incompatibleDefault.kind, incompatibleDefault),
      ).success,
    ).toBe(false);
  });

  it("round-trips nested defaults, conflict policy, stable IDs and null bindings", () => {
    const original = {
      schemaVersion: 3 as const,
      name: "Object round trip",
      nodes: [
        {
          id: "create",
          type: "logic.create_object" as const,
          config: {
            kind: "logic.create_object" as const,
            fields: [
              {
                id: "metadata",
                name: "metadata",
                type: "object" as const,
                defaultValue: { nested: { nullable: null } },
              },
            ],
          },
          inputs: { optional: { kind: "literal" as const, value: null, optional: true } },
        },
        {
          id: "merge",
          type: "logic.merge_objects" as const,
          config: {
            kind: "logic.merge_objects" as const,
            inputs: [
              { id: "base", name: "Base" },
              { id: "override", name: "Override" },
            ],
            conflictPolicy: "last_wins" as const,
          },
        },
      ],
      edges: [],
      editor: { positions: { create: { x: 0, y: 0 }, merge: { x: 240, y: 0 } } },
    };

    const parsed = visualWorkflowV3DefinitionSchema.parse(original);
    expect(toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(parsed))).toEqual(original);
  });
});
