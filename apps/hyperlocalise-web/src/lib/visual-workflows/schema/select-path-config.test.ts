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
  return { id: "select", type: "logic.select_path", config };
}

describe("Select Path node contract", () => {
  it("creates an unconfigured safe default", () => {
    expect(createDefaultConfig("logic.select_path")).toEqual({
      kind: "logic.select_path",
      path: [],
      outputType: "unknown",
      missingBehavior: "error",
    });
  });

  it("declares value and path inputs with typed value and found outputs", () => {
    const config: VisualNodeConfig = {
      kind: "logic.select_path",
      path: ["customers", 0, "locale"],
      outputType: "string",
      missingBehavior: "optional",
    };

    expect(getWorkflowInputFields(node(config))).toEqual([
      { name: "value", type: "unknown", required: true },
      { name: "path", type: "array", required: false },
    ]);
    expect(getWorkflowOutputFields(node(config))).toEqual([
      { path: "value", type: "string", optional: true },
      { path: "found", type: "boolean", optional: false },
    ]);
  });

  it("infers an output type only from safe literal value and path bindings", () => {
    const config: VisualNodeConfig = {
      kind: "logic.select_path",
      path: ["customers", 0, "active"],
      outputType: "unknown",
      missingBehavior: "error",
    };
    const literalNode = node(config);
    literalNode.inputs = {
      value: {
        kind: "literal",
        value: { customers: [{ active: true }] },
      },
    };
    expect(getWorkflowOutputFields(literalNode)).toContainEqual({
      path: "value",
      type: "boolean",
      optional: false,
    });

    literalNode.inputs.path = {
      kind: "reference",
      nodeId: "source",
      path: ["path"],
    };
    expect(getWorkflowOutputFields(literalNode)).toContainEqual({
      path: "value",
      type: "unknown",
      optional: false,
    });
  });

  it("rejects unsafe, negative and overlong paths", () => {
    const base = {
      kind: "logic.select_path" as const,
      outputType: "unknown" as const,
      missingBehavior: "error" as const,
    };

    expect(visualNodeConfigSchema.safeParse({ ...base, path: ["__proto__"] }).success).toBe(false);
    expect(visualNodeConfigSchema.safeParse({ ...base, path: [-1] }).success).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({ ...base, path: Array.from({ length: 33 }, () => "x") })
        .success,
    ).toBe(false);
  });

  it("allows an empty static path so the path can come from a connection", () => {
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "logic.select_path",
        path: [],
        outputType: "unknown",
        missingBehavior: "error",
      }).success,
    ).toBe(true);
  });

  it("requires a compatible default only for default behavior", () => {
    const base = {
      kind: "logic.select_path" as const,
      path: ["count"],
      outputType: "number" as const,
    };

    expect(visualNodeConfigSchema.safeParse({ ...base, missingBehavior: "default" }).success).toBe(
      false,
    );
    expect(
      visualNodeConfigSchema.safeParse({
        ...base,
        missingBehavior: "default",
        defaultValue: "zero",
      }).success,
    ).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({
        ...base,
        missingBehavior: "default",
        defaultValue: 0,
      }).success,
    ).toBe(true);
    expect(
      visualNodeConfigSchema.safeParse({
        ...base,
        missingBehavior: "optional",
        defaultValue: 0,
      }).success,
    ).toBe(false);
  });

  it("round-trips path segments and declared output semantics", () => {
    const original = {
      schemaVersion: 3 as const,
      name: "Select path",
      nodes: [
        {
          id: "select",
          type: "logic.select_path" as const,
          config: {
            kind: "logic.select_path" as const,
            path: ["customers", 0, "locale"],
            outputType: "string" as const,
            missingBehavior: "default" as const,
            defaultValue: "en",
          },
        },
      ],
      edges: [],
      editor: { positions: { select: { x: 0, y: 0 } } },
    };

    const parsed = visualWorkflowV3DefinitionSchema.parse(original);
    expect(toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(parsed))).toEqual(original);
  });
});
