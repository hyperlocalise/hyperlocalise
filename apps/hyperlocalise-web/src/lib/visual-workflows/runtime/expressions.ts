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
import type { VisualWorkflowExecutionContext } from "./context";

const TEMPLATE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

function readPath(root: Record<string, unknown>, path: string): unknown {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  let current: unknown = root;

  for (const segment of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function resolveExpressionPath(path: string, context: VisualWorkflowExecutionContext): unknown {
  const trimmed = path.trim();
  if (trimmed.startsWith("trigger.")) {
    return readPath({ trigger: context.trigger }, trimmed);
  }
  if (trimmed.startsWith("nodes.")) {
    return readPath({ nodes: context.nodes }, trimmed);
  }
  return undefined;
}

function stringifyResolvedValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function resolveVisualWorkflowTemplate(
  template: string,
  context: VisualWorkflowExecutionContext,
): string {
  return template.replace(TEMPLATE_PATTERN, (_match, expression: string) => {
    const value = resolveExpressionPath(expression, context);
    return stringifyResolvedValue(value);
  });
}

export function evaluateVisualWorkflowCondition(
  condition: string,
  context: VisualWorkflowExecutionContext,
): boolean {
  const resolved = resolveVisualWorkflowTemplate(condition, context).trim();
  if (!resolved) {
    return false;
  }

  const comparisonMatch = resolved.match(/^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
  if (comparisonMatch) {
    const left = comparisonMatch[1]?.trim() ?? "";
    const operator = comparisonMatch[2] ?? "==";
    const right = comparisonMatch[3]?.trim() ?? "";
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const numericComparison =
      left.length > 0 &&
      right.length > 0 &&
      Number.isFinite(leftNumber) &&
      Number.isFinite(rightNumber);

    if (numericComparison) {
      switch (operator) {
        case "===":
        case "==":
          return leftNumber === rightNumber;
        case "!==":
        case "!=":
          return leftNumber !== rightNumber;
        case ">":
          return leftNumber > rightNumber;
        case ">=":
          return leftNumber >= rightNumber;
        case "<":
          return leftNumber < rightNumber;
        case "<=":
          return leftNumber <= rightNumber;
      }
    }

    switch (operator) {
      case "===":
      case "==":
        return left === right;
      case "!==":
      case "!=":
        return left !== right;
      default:
        return false;
    }
  }

  const lowered = resolved.toLowerCase();
  if (lowered === "true" || lowered === "yes" || lowered === "1") {
    return true;
  }
  if (lowered === "false" || lowered === "no" || lowered === "0") {
    return false;
  }

  return true;
}
