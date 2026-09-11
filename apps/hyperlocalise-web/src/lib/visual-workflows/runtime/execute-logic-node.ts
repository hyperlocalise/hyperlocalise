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
  inputsResolved?: boolean;
}): VisualWorkflowNodeExecutionResult {
  const { node, context } = input;

  switch (node.config.kind) {
    case "trigger.manual":
    case "trigger.scheduled":
    case "trigger.github":
    case "trigger.source_upload": {
      const triggeredAt =
        typeof context.trigger.triggeredAt === "string"
          ? context.trigger.triggeredAt
          : new Date().toISOString();
      const scheduledRunAt =
        typeof context.trigger.scheduledRunAt === "string"
          ? context.trigger.scheduledRunAt
          : triggeredAt;
      return {
        ok: true,
        output: {
          ...context.trigger,
          triggeredAt,
          ...(node.config.kind === "trigger.scheduled" ? { scheduledRunAt } : {}),
        },
      };
    }
    case "logic.if": {
      const resolvedCondition = input.inputsResolved
        ? String(node.config.condition)
        : resolveVisualWorkflowTemplate(String(node.config.condition), context);
      const branchResult = evaluateVisualWorkflowCondition(resolvedCondition, context, true);
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
      const expressionValue = (
        input.inputsResolved
          ? String(node.config.expression)
          : resolveVisualWorkflowTemplate(String(node.config.expression), context)
      ).trim();
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
      const output: Record<string, unknown> = Object.fromEntries(
        Object.keys(node.inputs ?? {}).map((key) => [
          key,
          (node.config as unknown as Record<string, unknown>)[key],
        ]),
      );
      for (const assignment of node.config.assignments) {
        const key = assignment.key.trim();
        if (!key || node.inputs?.[key]) {
          continue;
        }
        const resolved = resolveVisualWorkflowTemplate(assignment.value, context);
        output[key] = resolved;
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
