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
import type { CanonicalVisualWorkflowNode, VisualNodeConfig } from "./types";
import { visualNodeConfigSchema } from "./definition-schema";

const LEFT_ID = "11111111-1111-4111-8111-111111111111";
const RIGHT_ID = "22222222-2222-4222-8222-222222222222";

function node(config: VisualNodeConfig): CanonicalVisualWorkflowNode {
  return { id: "compare", type: "logic.compare", config };
}

describe("Compare node config", () => {
  it("creates a binary equality comparison with stable operand ports", () => {
    const config = createDefaultConfig("logic.compare");
    expect(config).toMatchObject({ kind: "logic.compare", operator: "equal" });
    if (config.kind !== "logic.compare") throw new Error("Expected compare config");

    expect(config.operands).toHaveLength(2);
    expect(new Set(config.operands.map((operand) => operand.id)).size).toBe(2);
    expect(getWorkflowInputFields(node(config))).toEqual(
      config.operands.map((operand) => ({
        name: `value.${operand.id}`,
        type: "unknown",
        required: true,
      })),
    );
    expect(getWorkflowOutputFields(node(config))).toEqual([
      { path: "result", type: "boolean", optional: false },
    ]);
  });

  it("accepts boolean groups and locale-aware binary comparisons", () => {
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "logic.compare",
        operator: "and",
        operands: [
          { id: LEFT_ID, name: "Ready", type: "boolean" },
          { id: RIGHT_ID, name: "Approved", type: "boolean" },
        ],
      }).success,
    ).toBe(true);
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "logic.compare",
        operator: "equal",
        operands: [
          { id: LEFT_ID, name: "Left", type: "string" },
          { id: RIGHT_ID, name: "Right", type: "string" },
        ],
        locale: "en-AU",
        sensitivity: "accent",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid operand counts, types, and duplicate ids", () => {
    const operand = { id: LEFT_ID, name: "Value", type: "boolean" as const };

    expect(
      visualNodeConfigSchema.safeParse({
        kind: "logic.compare",
        operator: "not",
        operands: [operand, { ...operand, id: RIGHT_ID }],
      }).success,
    ).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "logic.compare",
        operator: "or",
        operands: [{ ...operand, type: "string" }],
      }).success,
    ).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "logic.compare",
        operator: "and",
        operands: [operand, { ...operand, name: "Other" }],
      }).success,
    ).toBe(false);
  });

  it("rejects malformed locale configuration", () => {
    const operands = [
      { id: LEFT_ID, name: "Left", type: "string" as const },
      { id: RIGHT_ID, name: "Right", type: "string" as const },
    ];
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "logic.compare",
        operator: "equal",
        operands,
        locale: "not_a_locale",
      }).success,
    ).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({
        kind: "logic.compare",
        operator: "equal",
        operands,
        sensitivity: "base",
      }).success,
    ).toBe(false);
  });
});
