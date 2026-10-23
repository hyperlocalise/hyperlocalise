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

import { resolveWorkflowNodeInputs } from "./bindings";
import { executeCoalesce } from "./coalesce-node";
import { createVisualWorkflowExecutionContext } from "./context";
import { executeLogicVisualWorkflowNode } from "./execute-logic-node";

const base = {
  inputs: [
    { id: "primary", name: "Primary", type: "unknown" as const },
    { id: "fallback", name: "Fallback", type: "unknown" as const },
  ],
  treatNullAsMissing: true,
  treatEmptyStringAsMissing: false,
  treatEmptyArrayAsMissing: false,
  treatEmptyObjectAsMissing: false,
};

describe("Coalesce node executor", () => {
  it("returns the first available value in configured order", () => {
    expect(
      executeCoalesce({
        ...base,
        resolvedConfig: { "value.primary": "first", "value.fallback": "second" },
      }),
    ).toEqual({ ok: true, output: { value: "first" } });
  });

  it("uses an inline default when an input binding is missing", () => {
    expect(
      executeCoalesce({
        ...base,
        inputs: [
          { id: "primary", name: "Primary", type: "string" },
          { id: "fallback", name: "Fallback", type: "string", defaultValue: "en" },
        ],
        resolvedConfig: {},
      }),
    ).toEqual({ ok: true, output: { value: "en" } });
  });

  it.each([
    [false, false],
    [0, 0],
  ])("does not treat %j as missing", (candidate, expected) => {
    expect(
      executeCoalesce({
        ...base,
        resolvedConfig: { "value.primary": candidate, "value.fallback": "fallback" },
      }),
    ).toEqual({ ok: true, output: { value: expected } });
  });

  it("only treats empty strings, arrays and objects as missing when configured", () => {
    expect(
      executeCoalesce({
        ...base,
        treatEmptyStringAsMissing: true,
        treatEmptyArrayAsMissing: true,
        treatEmptyObjectAsMissing: true,
        inputs: [
          { id: "string", name: "String", type: "string" },
          { id: "array", name: "Array", type: "array" },
          { id: "object", name: "Object", type: "object" },
          { id: "fallback", name: "Fallback", type: "string" },
        ],
        resolvedConfig: {
          "value.string": "",
          "value.array": [],
          "value.object": {},
          "value.fallback": "available",
        },
      }),
    ).toEqual({ ok: true, output: { value: "available" } });

    expect(executeCoalesce({ ...base, resolvedConfig: { "value.primary": [] } })).toEqual({
      ok: true,
      output: { value: [] },
    });
    expect(executeCoalesce({ ...base, resolvedConfig: { "value.primary": {} } })).toEqual({
      ok: true,
      output: { value: {} },
    });
  });

  it("can preserve null as an available value", () => {
    expect(
      executeCoalesce({
        ...base,
        treatNullAsMissing: false,
        resolvedConfig: { "value.primary": null, "value.fallback": "fallback" },
      }),
    ).toEqual({ ok: true, output: { value: null } });
  });

  it("returns an optional undefined value when no candidate is available", () => {
    expect(executeCoalesce({ ...base, resolvedConfig: {} })).toEqual({
      ok: true,
      output: { value: undefined },
    });
  });

  it("returns a controlled error for a value that violates its declared type", () => {
    expect(
      executeCoalesce({
        ...base,
        inputs: [
          { id: "primary", name: "Primary", type: "number" },
          { id: "fallback", name: "Fallback", type: "number" },
        ],
        resolvedConfig: { "value.primary": "not a number" },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "coalesce_input_type_mismatch", inputId: "primary" },
    });
  });

  it("executes values resolved through the production binding pipeline", () => {
    const context = createVisualWorkflowExecutionContext({});
    context.nodes.source = {};
    const resolved = resolveWorkflowNodeInputs(
      {
        id: "coalesce",
        type: "logic.coalesce",
        config: {
          kind: "logic.coalesce",
          inputs: [
            { id: "primary", name: "Primary", type: "string" },
            { id: "fallback", name: "Fallback", type: "string", defaultValue: "en" },
          ],
          treatNullAsMissing: true,
          treatEmptyStringAsMissing: false,
          treatEmptyArrayAsMissing: false,
          treatEmptyObjectAsMissing: false,
        },
        inputs: {
          "value.primary": {
            kind: "reference",
            nodeId: "source",
            path: ["missing"],
            optional: true,
          },
        },
      },
      context,
    );

    expect(
      executeLogicVisualWorkflowNode({ node: resolved, context, inputsResolved: true }),
    ).toEqual({ ok: true, output: { value: "en" } });
  });

  it("prefers a WorkflowBinding fallback over the input's inline default", () => {
    const context = createVisualWorkflowExecutionContext({});
    context.nodes.source = {};
    const resolved = resolveWorkflowNodeInputs(
      {
        id: "coalesce",
        type: "logic.coalesce",
        config: {
          kind: "logic.coalesce",
          inputs: [
            { id: "primary", name: "Primary", type: "string", defaultValue: "inline" },
            { id: "fallback", name: "Fallback", type: "string", defaultValue: "en" },
          ],
          treatNullAsMissing: true,
          treatEmptyStringAsMissing: false,
          treatEmptyArrayAsMissing: false,
          treatEmptyObjectAsMissing: false,
        },
        inputs: {
          "value.primary": {
            kind: "reference",
            nodeId: "source",
            path: ["missing"],
            optional: true,
            fallback: "binding",
          },
        },
      },
      context,
    );

    expect(
      executeLogicVisualWorkflowNode({ node: resolved, context, inputsResolved: true }),
    ).toEqual({ ok: true, output: { value: "binding" } });
  });
});
