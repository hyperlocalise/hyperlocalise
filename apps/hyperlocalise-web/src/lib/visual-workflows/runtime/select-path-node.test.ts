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
import { describe, expect, it } from "vitest";
import { resolveWorkflowNodeInputs } from "./bindings";
import { createVisualWorkflowExecutionContext } from "./context";
import { executeLogicVisualWorkflowNode } from "./execute-logic-node";

function execute(config: Record<string, unknown>) {
  return executeLogicVisualWorkflowNode({
    node: {
      id: "select",
      type: "logic.select_path",
      config: { kind: "logic.select_path", ...config } as never,
    },
    context: createVisualWorkflowExecutionContext({}),
    inputsResolved: true,
  });
}

describe("Select Path node executor", () => {
  it("selects nested object fields and reports that they were found", () => {
    expect(
      execute({
        value: { customer: { email: "hello@example.com" } },
        path: ["customer", "email"],
        outputType: "string",
        missingBehavior: "error",
      }),
    ).toEqual({ ok: true, output: { value: "hello@example.com", found: true } });
  });

  it("selects non-negative array indexes", () => {
    expect(
      execute({
        value: { items: [{ id: 1 }, { id: 2 }] },
        path: ["items", 1, "id"],
        outputType: "number",
        missingBehavior: "error",
      }),
    ).toEqual({ ok: true, output: { value: 2, found: true } });
  });

  it("uses values and paths resolved through the production binding pipeline", () => {
    const context = createVisualWorkflowExecutionContext({});
    context.nodes.source = {
      payload: { customers: [{ email: "bound@example.com" }] },
      selectedPath: ["customers", 0, "email"],
    };
    const node = resolveWorkflowNodeInputs(
      {
        id: "select",
        type: "logic.select_path",
        config: {
          kind: "logic.select_path",
          path: ["fallback"],
          outputType: "string",
          missingBehavior: "error",
        },
        inputs: {
          value: { kind: "reference", nodeId: "source", path: ["payload"] },
          path: { kind: "reference", nodeId: "source", path: ["selectedPath"] },
        },
      },
      context,
    );

    expect(executeLogicVisualWorkflowNode({ node, context, inputsResolved: true })).toEqual({
      ok: true,
      output: { value: "bound@example.com", found: true },
    });
  });

  it("returns an optional missing result", () => {
    expect(
      execute({
        value: {},
        path: ["missing"],
        outputType: "string",
        missingBehavior: "optional",
      }),
    ).toEqual({ ok: true, output: { value: undefined, found: false } });
  });

  it("returns the configured default for a missing path", () => {
    expect(
      execute({
        value: {},
        path: ["locale"],
        outputType: "string",
        missingBehavior: "default",
        defaultValue: "en",
      }),
    ).toEqual({ ok: true, output: { value: "en", found: false } });
  });

  it("fails when a required path is missing", () => {
    expect(
      execute({
        value: {},
        path: ["missing"],
        outputType: "unknown",
        missingBehavior: "error",
      }),
    ).toMatchObject({ ok: false, error: { code: "select_path_not_found" } });
  });

  it.each([{ path: ["__proto__"] }, { path: ["items", -1] }, { path: ["items", 1.5] }])(
    "rejects unsafe or malformed path %j",
    ({ path }) => {
      expect(
        execute({ value: {}, path, outputType: "unknown", missingBehavior: "error" }),
      ).toMatchObject({ ok: false, error: { code: "invalid_select_path" } });
    },
  );

  it("fails when the selected value violates the declared output type", () => {
    expect(
      execute({
        value: { count: "two" },
        path: ["count"],
        outputType: "number",
        missingBehavior: "error",
      }),
    ).toMatchObject({ ok: false, error: { code: "select_path_output_type_mismatch" } });
  });
});
