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

import type { VisualComparisonOperand, VisualComparisonOperator } from "../schema/types";
import { resolveWorkflowNodeInputs } from "./bindings";
import { COMPARE_NODE_LIMITS, executeCompare } from "./compare-node";
import { createVisualWorkflowExecutionContext } from "./context";
import { executeLogicVisualWorkflowNode } from "./execute-logic-node";

const left = { id: "left", name: "Left", type: "unknown" } satisfies VisualComparisonOperand;
const right = {
  id: "right",
  name: "Right",
  type: "unknown",
} satisfies VisualComparisonOperand;

function compare(
  operator: VisualComparisonOperator,
  leftValue: unknown,
  rightValue?: unknown,
  options: { locale?: string; sensitivity?: Intl.CollatorOptions["sensitivity"] } = {},
) {
  return executeCompare({
    operator,
    operands: operator === "not" ? [left] : [left, right],
    resolvedConfig: {
      "value.left": leftValue,
      ...(operator === "not" ? {} : { "value.right": rightValue }),
    },
    ...options,
  });
}

describe("Compare node executor", () => {
  it("uses strict equality without numeric coercion", () => {
    expect(compare("equal", "10", 10)).toEqual({ ok: true, output: { result: false } });
    expect(compare("not_equal", false, 0)).toEqual({ ok: true, output: { result: true } });
    expect(compare("equal", null, null)).toEqual({ ok: true, output: { result: true } });
    expect(compare("equal", -0, 0)).toEqual({ ok: true, output: { result: true } });
  });

  it("compares arrays and objects structurally and deterministically", () => {
    expect(
      compare("equal", { a: 1, nested: [true, null] }, { nested: [true, null], a: 1 }),
    ).toEqual({ ok: true, output: { result: true } });
    expect(compare("equal", [1, 2], [2, 1])).toEqual({
      ok: true,
      output: { result: false },
    });
    expect(compare("contains", [{ id: 1 }, { id: 2 }], { id: 2 })).toEqual({
      ok: true,
      output: { result: true },
    });
  });

  it("orders only values of the same supported primitive type", () => {
    expect(compare("greater_than", 10, 2)).toEqual({ ok: true, output: { result: true } });
    expect(compare("greater_than_or_equal", 10, 10)).toEqual({
      ok: true,
      output: { result: true },
    });
    expect(compare("less_than", 2, 10)).toEqual({ ok: true, output: { result: true } });
    expect(compare("less_than_or_equal", "alpha", "beta")).toEqual({
      ok: true,
      output: { result: true },
    });
    expect(compare("greater_than", 10, "2")).toMatchObject({
      ok: false,
      error: { code: "invalid_comparison" },
    });
  });

  it("treats not_equal as the inverse of structural equal", () => {
    expect(compare("not_equal", { a: 1 }, { a: 2 })).toEqual({
      ok: true,
      output: { result: true },
    });
    expect(compare("not_equal", { a: 1, nested: [true] }, { nested: [true], a: 1 })).toEqual({
      ok: true,
      output: { result: false },
    });
  });

  it("orders locale-aware strings and rejects an invalid locale", () => {
    expect(compare("less_than", "cote", "coté", { locale: "fr" })).toEqual({
      ok: true,
      output: { result: true },
    });
    expect(compare("greater_than_or_equal", "ä", "z", { locale: "sv" })).toEqual({
      ok: true,
      output: { result: true },
    });
    expect(compare("equal", "a", "a", { locale: "not_a_real_locale_tag_xyz" })).toMatchObject({
      ok: false,
      error: { code: "invalid_comparison_locale" },
    });
  });

  it("rejects values that are not bounded JSON-compatible data", () => {
    expect(compare("equal", Number.NaN, 1)).toMatchObject({
      ok: false,
      error: { code: "comparison_value_not_supported" },
    });
    expect(compare("equal", Number.POSITIVE_INFINITY, 1)).toMatchObject({
      ok: false,
      error: { code: "comparison_value_not_supported" },
    });
    expect(compare("equal", new Date("2026-01-01T00:00:00.000Z"), "2026-01-01")).toMatchObject({
      ok: false,
      error: { code: "comparison_value_not_supported" },
    });
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(compare("equal", cyclic, cyclic)).toMatchObject({
      ok: false,
      error: { code: "comparison_value_not_supported" },
    });
    expect(compare("equal", { __proto__: { polluted: true } }, { polluted: true })).toMatchObject({
      ok: false,
      error: { code: "comparison_value_not_supported" },
    });
  });

  it("treats array contains as membership and empty string needles as contained", () => {
    expect(compare("contains", [{ id: 1 }, { id: 2 }], { id: 3 })).toEqual({
      ok: true,
      output: { result: false },
    });
    expect(compare("contains", "translation memory", "")).toEqual({
      ok: true,
      output: { result: true },
    });
  });

  it("supports containment and string boundaries", () => {
    expect(compare("contains", "translation memory", "memory")).toEqual({
      ok: true,
      output: { result: true },
    });
    expect(compare("starts_with", "en-AU", "en")).toEqual({
      ok: true,
      output: { result: true },
    });
    expect(compare("ends_with", "messages.json", ".json")).toEqual({
      ok: true,
      output: { result: true },
    });
  });

  it("performs opt-in locale-sensitive string comparison", () => {
    expect(compare("equal", "Résumé", "resume", { locale: "en", sensitivity: "base" })).toEqual({
      ok: true,
      output: { result: true },
    });
    expect(
      compare("contains", "Résumé final", "resume", { locale: "en", sensitivity: "base" }),
    ).toEqual({ ok: true, output: { result: true } });
    const expandedGrapheme = `a${"\u0301".repeat(5)}`;
    expect(
      compare("ends_with", expandedGrapheme, "a", { locale: "en", sensitivity: "base" }),
    ).toEqual({ ok: true, output: { result: true } });
    expect(
      compare("contains", `before ${expandedGrapheme} after`, "a", {
        locale: "en",
        sensitivity: "base",
      }),
    ).toEqual({ ok: true, output: { result: true } });
  });

  it("combines boolean predicates", () => {
    const operands = [
      { id: "one", name: "One", type: "boolean" as const },
      { id: "two", name: "Two", type: "boolean" as const },
      { id: "three", name: "Three", type: "boolean" as const },
    ];
    expect(
      executeCompare({
        operator: "and",
        operands,
        resolvedConfig: { "value.one": true, "value.two": true, "value.three": false },
      }),
    ).toEqual({ ok: true, output: { result: false } });
    expect(
      executeCompare({
        operator: "or",
        operands,
        resolvedConfig: { "value.one": false, "value.two": true, "value.three": false },
      }),
    ).toEqual({ ok: true, output: { result: true } });
    expect(compare("not", false)).toEqual({ ok: true, output: { result: true } });
    expect(compare("not", "false")).toMatchObject({
      ok: false,
      error: { code: "invalid_comparison" },
    });
  });

  it("rejects locale comparison when runtime values are not strings", () => {
    expect(compare("equal", 1, 1, { locale: "en" })).toMatchObject({
      ok: false,
      error: { code: "invalid_comparison" },
    });
  });

  it("returns stable errors for missing, mismatched, and unbounded values", () => {
    expect(compare("equal", undefined, "value")).toMatchObject({
      ok: false,
      error: { code: "missing_comparison_input", inputId: "left" },
    });
    expect(
      executeCompare({
        operator: "equal",
        operands: [
          { ...left, type: "number" },
          { ...right, type: "number" },
        ],
        resolvedConfig: { "value.left": "1", "value.right": 1 },
      }),
    ).toMatchObject({ ok: false, error: { code: "comparison_input_type_mismatch" } });

    let value: unknown = null;
    for (let depth = 0; depth <= COMPARE_NODE_LIMITS.maxDepth; depth += 1) value = [value];
    expect(compare("equal", value, value)).toMatchObject({
      ok: false,
      error: { code: "comparison_value_not_supported" },
    });
    const sparse = Array.from({ length: 2 }) as unknown[];
    sparse[1] = "value";
    expect(compare("equal", sparse, sparse)).toMatchObject({
      ok: false,
      error: { code: "comparison_value_not_supported" },
    });
  });

  it("executes values resolved through the production binding pipeline", () => {
    const context = createVisualWorkflowExecutionContext({});
    context.nodes.translation = { status: "approved" };
    const resolved = resolveWorkflowNodeInputs(
      {
        id: "compare",
        type: "logic.compare",
        config: {
          kind: "logic.compare",
          operator: "equal",
          operands: [
            { id: "left", name: "Left", type: "string" },
            { id: "right", name: "Right", type: "string" },
          ],
        },
        inputs: {
          "value.left": { kind: "reference", nodeId: "translation", path: ["status"] },
          "value.right": { kind: "literal", value: "approved" },
        },
      },
      context,
    );

    expect(
      executeLogicVisualWorkflowNode({ node: resolved, context, inputsResolved: true }),
    ).toEqual({ ok: true, output: { result: true } });
  });
});
