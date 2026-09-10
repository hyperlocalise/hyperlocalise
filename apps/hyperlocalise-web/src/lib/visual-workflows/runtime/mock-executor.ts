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
import { executeLogicVisualWorkflowNode } from "./execute-logic-node";
import type { VisualWorkflowInterpreterExecuteNode } from "./interpreter";
export function createMockWorkflowExecutor(
  outputs: Record<string, Record<string, unknown>> = {},
): VisualWorkflowInterpreterExecuteNode {
  return async ({ node, context }) => {
    const logic = executeLogicVisualWorkflowNode({ node, context, inputsResolved: true });
    if (logic.ok || logic.error.code !== "not_logic_node") return logic;
    const output = structuredClone(outputs[node.id] ?? NODE_CONTRACTS[node.type].mock);
    if (!outputs[node.id]) {
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
    return { ok: true, output };
  };
}
