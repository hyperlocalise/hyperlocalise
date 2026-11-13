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

import { createVisualWorkflowExecutionContext } from "./context";
import { executeLogicVisualWorkflowNode } from "./execute-logic-node";
import { executeCreateObject, executeMergeObjects, OBJECT_NODE_LIMITS } from "./object-nodes";
import { resolveWorkflowNodeInputs } from "./bindings";

describe("object node executors", () => {
  it("creates an object from dynamic values and inline defaults", () => {
    const result = executeLogicVisualWorkflowNode({
      node: {
        id: "create",
        type: "logic.create_object",
        config: {
          kind: "logic.create_object",
          fields: [
            { id: "customer", name: "customerId", type: "string" },
            { id: "locale", name: "locale", type: "string", defaultValue: "en" },
            { id: "metadata", name: "metadata", type: "object", defaultValue: { source: "web" } },
          ],
          "value.customer": "customer-123",
        } as never,
      },
      context: createVisualWorkflowExecutionContext({}),
      inputsResolved: true,
    });

    expect(result).toEqual({
      ok: true,
      output: {
        value: {
          customerId: "customer-123",
          locale: "en",
          metadata: { source: "web" },
        },
      },
    });
  });

  it("executes values resolved through the production binding pipeline", () => {
    const context = createVisualWorkflowExecutionContext({});
    context.nodes.source = { value: "customer-456" };
    const resolved = resolveWorkflowNodeInputs(
      {
        id: "create",
        type: "logic.create_object",
        config: {
          kind: "logic.create_object",
          fields: [
            { id: "customer", name: "customerId", type: "string" },
            { id: "locale", name: "locale", type: "string", defaultValue: "en" },
          ],
        },
        inputs: {
          "value.customer": { kind: "reference", nodeId: "source", path: ["value"] },
        },
      },
      context,
    );

    expect(
      executeLogicVisualWorkflowNode({ node: resolved, context, inputsResolved: true }),
    ).toEqual({
      ok: true,
      output: { value: { customerId: "customer-456", locale: "en" } },
    });
  });

  it("returns a controlled error when a required field is missing", () => {
    const result = executeLogicVisualWorkflowNode({
      node: {
        id: "create",
        type: "logic.create_object",
        config: {
          kind: "logic.create_object",
          fields: [{ id: "required", name: "required", type: "string" }],
        },
      },
      context: createVisualWorkflowExecutionContext({}),
      inputsResolved: true,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "missing_object_field", fieldId: "required" },
    });
  });

  it.each([
    ["first_wins", 1],
    ["last_wins", 2],
  ] as const)("merges objects with the %s policy", (conflictPolicy, expectedShared) => {
    const result = executeMergeObjects({
      inputs: [
        { id: "first", name: "First" },
        { id: "second", name: "Second" },
      ],
      conflictPolicy,
      resolvedConfig: {
        "value.first": { first: true, shared: 1 },
        "value.second": { second: true, shared: 2 },
      },
    });

    expect(result).toEqual({
      ok: true,
      output: { value: { first: true, shared: expectedShared, second: true } },
    });
  });

  it("rejects conflicts without returning a partial object", () => {
    const result = executeMergeObjects({
      inputs: [
        { id: "first", name: "First" },
        { id: "second", name: "Second" },
      ],
      conflictPolicy: "reject",
      resolvedConfig: {
        "value.first": { shared: 1 },
        "value.second": { shared: 2 },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "object_key_conflict", key: "shared" },
    });
  });

  it("rejects non-object merge inputs", () => {
    const result = executeMergeObjects({
      inputs: [
        { id: "first", name: "First" },
        { id: "second", name: "Second" },
      ],
      conflictPolicy: "last_wins",
      resolvedConfig: { "value.first": {}, "value.second": ["not", "an", "object"] },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_merge_object_input", inputId: "second" },
    });
  });

  it("preserves nested arrays and nulls without retaining input references", () => {
    const nested = { items: [{ value: null }] };
    const result = executeCreateObject({
      fields: [{ id: "nested", name: "nested", type: "object" }],
      resolvedConfig: { "value.nested": nested },
    });

    expect(result).toEqual({
      ok: true,
      output: { value: { nested: { items: [{ value: null }] } } },
    });
    if (result.ok) expect(result.output.value).not.toBe(nested);
  });

  it("rejects dangerous keys at any nesting level", () => {
    const nested: Record<string, unknown> = {};
    Object.defineProperty(nested, "__proto__", { enumerable: true, value: { polluted: true } });

    expect(
      executeCreateObject({
        fields: [{ id: "nested", name: "nested", type: "object" }],
        resolvedConfig: { "value.nested": nested },
      }),
    ).toMatchObject({ ok: false, error: { code: "unsafe_object_key" } });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("rejects values beyond depth and byte limits", () => {
    let deep: Record<string, unknown> = {};
    for (let index = 0; index <= OBJECT_NODE_LIMITS.maxDepth; index += 1) deep = { child: deep };

    expect(
      executeCreateObject({
        fields: [{ id: "deep", name: "deep", type: "object" }],
        resolvedConfig: { "value.deep": deep },
      }),
    ).toMatchObject({ ok: false, error: { code: "object_value_too_deep" } });
    expect(
      executeCreateObject({
        fields: [{ id: "large", name: "large", type: "string" }],
        resolvedConfig: { "value.large": "x".repeat(OBJECT_NODE_LIMITS.maxBytes + 1) },
      }),
    ).toMatchObject({ ok: false, error: { code: "object_value_too_large" } });
  });

  it("rejects values beyond the entry limit", () => {
    const entries = Object.fromEntries(
      Array.from({ length: OBJECT_NODE_LIMITS.maxEntries + 1 }, (_, index) => [
        `key-${index}`,
        index,
      ]),
    );

    expect(
      executeCreateObject({
        fields: [{ id: "large", name: "large", type: "object" }],
        resolvedConfig: { "value.large": entries },
      }),
    ).toMatchObject({ ok: false, error: { code: "object_value_too_large" } });
  });

  it("rejects cyclic, non-finite and custom-prototype values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    for (const value of [cyclic, Number.POSITIVE_INFINITY, new Date()]) {
      expect(
        executeCreateObject({
          fields: [{ id: "invalid", name: "invalid", type: "unknown" }],
          resolvedConfig: { "value.invalid": value },
        }),
      ).toMatchObject({ ok: false, error: { code: "invalid_object_value" } });
    }
  });
});
