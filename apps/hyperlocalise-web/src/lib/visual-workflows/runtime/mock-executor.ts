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
import { NODE_CONTRACTS, getWorkflowOutputFields } from "../catalog/node-contracts";
import type { CanonicalVisualWorkflowNode } from "../schema/types";
import { executeLogicVisualWorkflowNode } from "./execute-logic-node";
import type { VisualWorkflowInterpreterExecuteNode } from "./interpreter";

function fillMissingOutputFields(
  node: CanonicalVisualWorkflowNode,
  output: Record<string, unknown>,
) {
  for (const field of getWorkflowOutputFields(node)) {
    if (field.optional) continue;
    const path = field.path.split(".");
    let current = output;
    for (const segment of path.slice(0, -1)) {
      if (["__proto__", "constructor", "prototype"].includes(segment))
        throw new Error("invalid_output_path");
      if (!current[segment] || typeof current[segment] !== "object") current[segment] = {};
      current = current[segment] as Record<string, unknown>;
    }
    const key = path.at(-1)!;
    if (["__proto__", "constructor", "prototype"].includes(key))
      throw new Error("invalid_output_path");
    if (current[key] === undefined)
      current[key] =
        field.type === "array"
          ? []
          : field.type === "object"
            ? {}
            : field.type === "number"
              ? 0
              : field.type === "boolean"
                ? false
                : field.type === "string"
                  ? "Sample value"
                  : null;
  }
}

/** The error code of a step set to fail in a test that names none. */
export const TEST_FAILURE_CODE = "test_failure";

/**
 * Runs a step without calling out. A step with an entry in `outputs` returns it, a step in
 * `failures` fails with that error, and a step the run works out runs its own logic.
 */
export function createMockWorkflowExecutor(
  outputs: Record<string, Record<string, unknown>> = {},
  failures: Record<string, { code?: string; message?: string }> = {},
): VisualWorkflowInterpreterExecuteNode {
  return async ({ node, context }) => {
    const logic = executeLogicVisualWorkflowNode({ node, context, inputsResolved: true });
    if (logic.ok || logic.error.code !== "not_logic_node") {
      if (!logic.ok || outputs[node.id]) {
        return logic;
      }
      const output = structuredClone(logic.output);
      fillMissingOutputFields(node, output);
      return { ...logic, output };
    }
    const failure = failures[node.id];
    if (failure) {
      return {
        ok: false,
        error: {
          code: failure.code?.trim() || TEST_FAILURE_CODE,
          message: failure.message?.trim() || "This step was set to fail in the test.",
        },
      };
    }
    const output = structuredClone(outputs[node.id] ?? NODE_CONTRACTS[node.type].mock);
    if (!outputs[node.id] && !node.type.startsWith("trigger.")) {
      output.simulated = true;
    }
    if (!outputs[node.id]) {
      fillMissingOutputFields(node, output);
    }
    return {
      ok: true,
      output,
      ...(node.type === "flow.human_approval" && typeof output.decision === "string"
        ? { switchCase: output.decision }
        : {}),
    };
  };
}
