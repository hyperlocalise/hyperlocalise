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
import type { CanonicalVisualWorkflowNode } from "../schema/types";
import type { VisualWorkflowExecutionContext } from "./context";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";
import {
  evaluateVisualWorkflowCondition,
  resolveVisualWorkflowCollection,
  resolveVisualWorkflowTemplate,
} from "./expressions";

export function executeLogicVisualWorkflowNode(input: {
  node: CanonicalVisualWorkflowNode;
  context: VisualWorkflowExecutionContext;
}): VisualWorkflowNodeExecutionResult {
  const { node, context } = input;

  switch (node.config.kind) {
    case "trigger.manual":
    case "trigger.scheduled":
    case "trigger.github":
    case "trigger.source_upload":
      return {
        ok: true,
        output: {
          ...context.trigger,
        },
      };
    case "logic.if": {
      const resolvedCondition = resolveVisualWorkflowTemplate(node.config.condition, context);
      const branchResult = evaluateVisualWorkflowCondition(node.config.condition, context);
      return {
        ok: true,
        output: {
          condition: resolvedCondition,
          result: branchResult,
        },
        branchResult,
      };
    }
    case "logic.switch": {
      const expressionValue = resolveVisualWorkflowTemplate(node.config.expression, context).trim();
      let matchedCase = "default";

      for (let index = 0; index < node.config.cases.length; index += 1) {
        const caseValue = resolveVisualWorkflowTemplate(
          node.config.cases[index]?.value ?? "",
          context,
        ).trim();
        if (caseValue.length > 0 && expressionValue === caseValue) {
          matchedCase = String(index);
          break;
        }
      }

      return {
        ok: true,
        output: {
          expression: expressionValue,
          matchedCase,
        },
        switchCase: matchedCase,
      };
    }
    case "logic.set": {
      const output: Record<string, unknown> = {};
      for (const assignment of node.config.assignments) {
        const key = assignment.key.trim();
        if (!key) {
          continue;
        }
        const resolved = resolveVisualWorkflowTemplate(assignment.value, context);
        output[key] = coerceSetValue(resolved);
      }

      return {
        ok: true,
        output,
      };
    }
    case "logic.for_each": {
      const items = resolveVisualWorkflowCollection(node.config.collection, context);
      return {
        ok: true,
        output: {
          items,
          count: items.length,
        },
      };
    }
    default:
      return {
        ok: false,
        error: {
          code: "not_logic_node",
          message: "Node is not handled by the logic executor.",
        },
      };
  }
}

function coerceSetValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed === "null") {
    return null;
  }
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && trimmed === String(asNumber)) {
    return asNumber;
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}
