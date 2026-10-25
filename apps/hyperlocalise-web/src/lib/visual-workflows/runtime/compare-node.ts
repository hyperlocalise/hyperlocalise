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
import { matchesWorkflowType } from "../catalog/node-contracts";
import type { VisualComparisonOperand, VisualComparisonOperator } from "../schema/types";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

export const COMPARE_NODE_LIMITS = { maxDepth: 32, maxEntries: 10_000 } as const;

type ComparableValue = null | string | number | boolean | ComparableValue[] | ComparableObject;
type ComparableObject = { [key: string]: ComparableValue };

function validateComparableValue(
  value: unknown,
): { ok: true; value: ComparableValue } | { ok: false } {
  let entries = 0;
  const ancestors = new WeakSet<object>();

  const visit = (
    candidate: unknown,
    depth: number,
  ): { ok: true; value: ComparableValue } | { ok: false } => {
    if (depth > COMPARE_NODE_LIMITS.maxDepth) return { ok: false };
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean")
      return { ok: true, value: candidate };
    if (typeof candidate === "number")
      return Number.isFinite(candidate) ? { ok: true, value: candidate } : { ok: false };
    if (typeof candidate !== "object" || ancestors.has(candidate)) return { ok: false };
    if (
      !Array.isArray(candidate) &&
      Object.getPrototypeOf(candidate) !== Object.prototype &&
      Object.getPrototypeOf(candidate) !== null
    )
      return { ok: false };
    if (
      Array.isArray(candidate) &&
      (Object.keys(candidate).length !== candidate.length ||
        !candidate.every((_, index) => Object.hasOwn(candidate, index)))
    )
      return { ok: false };
    if (Object.getOwnPropertySymbols(candidate).length > 0) return { ok: false };

    ancestors.add(candidate);
    for (const [key, child] of Object.entries(candidate)) {
      entries += 1;
      if (
        entries > COMPARE_NODE_LIMITS.maxEntries ||
        (!Array.isArray(candidate) && ["__proto__", "prototype", "constructor"].includes(key))
      )
        return { ok: false };
      if (!visit(child, depth + 1).ok) return { ok: false };
    }
    ancestors.delete(candidate);
    return { ok: true, value: candidate as ComparableValue };
  };

  return visit(value, 0);
}

function deepEqual(left: ComparableValue, right: ComparableValue): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null)
    return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => deepEqual(value, right[index]!))
    );
  }
  const leftEntries = Object.entries(left);
  const rightObject = right as ComparableObject;
  return (
    leftEntries.length === Object.keys(rightObject).length &&
    leftEntries.every(
      ([key, value]) => Object.hasOwn(rightObject, key) && deepEqual(value, rightObject[key]!),
    )
  );
}

function stringContains(
  haystack: string,
  needle: string,
  collator: Intl.Collator | undefined,
): boolean {
  if (!collator) return haystack.includes(needle);
  const normalizedHaystack = Array.from(haystack.normalize("NFC"));
  const normalizedNeedle = Array.from(needle.normalize("NFC"));
  if (normalizedNeedle.length === 0) return true;
  for (let start = 0; start < normalizedHaystack.length; start += 1) {
    for (
      let length = Math.max(1, normalizedNeedle.length - 2);
      length <= normalizedNeedle.length + 2 && start + length <= normalizedHaystack.length;
      length += 1
    ) {
      if (collator.compare(normalizedHaystack.slice(start, start + length).join(""), needle) === 0)
        return true;
    }
  }
  return false;
}

function stringStartsOrEndsWith(
  value: string,
  search: string,
  position: "start" | "end",
  collator: Intl.Collator | undefined,
): boolean {
  if (!collator) return position === "start" ? value.startsWith(search) : value.endsWith(search);
  const valueParts = Array.from(value.normalize("NFC"));
  const searchLength = Array.from(search.normalize("NFC")).length;
  for (let delta = -2; delta <= 2; delta += 1) {
    const length = searchLength + delta;
    if (length < 0 || length > valueParts.length) continue;
    const candidate =
      position === "start"
        ? valueParts.slice(0, length).join("")
        : valueParts.slice(valueParts.length - length).join("");
    if (collator.compare(candidate, search) === 0) return true;
  }
  return false;
}

function invalidComparison(message: string): VisualWorkflowNodeExecutionResult {
  return { ok: false, error: { code: "invalid_comparison", message } };
}

export function executeCompare(input: {
  operator: VisualComparisonOperator;
  operands: readonly VisualComparisonOperand[];
  resolvedConfig: Record<string, unknown>;
  locale?: string;
  sensitivity?: Intl.CollatorOptions["sensitivity"];
}): VisualWorkflowNodeExecutionResult {
  const values: ComparableValue[] = [];
  for (const operand of input.operands) {
    const value = input.resolvedConfig[`value.${operand.id}`];
    if (value === undefined) {
      return {
        ok: false,
        error: {
          code: "missing_comparison_input",
          message: `Comparison input "${operand.name}" is required.`,
          inputId: operand.id,
        },
      };
    }
    if (!matchesWorkflowType(value, operand.type)) {
      return {
        ok: false,
        error: {
          code: "comparison_input_type_mismatch",
          message: `Comparison input "${operand.name}" does not match its declared type.`,
          inputId: operand.id,
        },
      };
    }
    const comparable = validateComparableValue(value);
    if (!comparable.ok) {
      return {
        ok: false,
        error: {
          code: "comparison_value_not_supported",
          message: "Comparison values must be bounded JSON-compatible values.",
          inputId: operand.id,
        },
      };
    }
    values.push(comparable.value);
  }

  let collator: Intl.Collator | undefined;
  if (input.locale) {
    try {
      collator = new Intl.Collator(input.locale, { sensitivity: input.sensitivity ?? "variant" });
    } catch {
      return {
        ok: false,
        error: { code: "invalid_comparison_locale", message: "Comparison locale is invalid." },
      };
    }
    if (!values.every((value) => typeof value === "string"))
      return invalidComparison("Locale-sensitive comparison requires string inputs.");
  }

  const [left, right] = values;
  let result: boolean;
  switch (input.operator) {
    case "and":
      if (!values.every((value) => typeof value === "boolean"))
        return invalidComparison("AND requires boolean inputs.");
      result = values.every((value) => value === true);
      break;
    case "or":
      if (!values.every((value) => typeof value === "boolean"))
        return invalidComparison("OR requires boolean inputs.");
      result = values.some((value) => value === true);
      break;
    case "not":
      if (typeof left !== "boolean") return invalidComparison("NOT requires a boolean input.");
      result = left === false;
      break;
    case "equal":
    case "not_equal": {
      const equal =
        typeof left === "string" && typeof right === "string" && collator
          ? collator.compare(left, right) === 0
          : left !== undefined && right !== undefined && deepEqual(left, right);
      result = input.operator === "equal" ? equal : !equal;
      break;
    }
    case "greater_than":
    case "greater_than_or_equal":
    case "less_than":
    case "less_than_or_equal": {
      if (
        !(
          (typeof left === "number" && typeof right === "number") ||
          (typeof left === "string" && typeof right === "string")
        )
      )
        return invalidComparison("Ordering requires two strings or two numbers of the same type.");
      const order =
        typeof left === "string" && typeof right === "string"
          ? collator
            ? collator.compare(left, right)
            : left === right
              ? 0
              : left < right
                ? -1
                : 1
          : (left as number) - (right as number);
      result =
        input.operator === "greater_than"
          ? order > 0
          : input.operator === "greater_than_or_equal"
            ? order >= 0
            : input.operator === "less_than"
              ? order < 0
              : order <= 0;
      break;
    }
    case "contains":
      if (typeof left === "string" && typeof right === "string")
        result = stringContains(left, right, collator);
      else if (Array.isArray(left) && right !== undefined)
        result = left.some((value) => deepEqual(value, right));
      else return invalidComparison("Contains requires a string or array as its first input.");
      break;
    case "starts_with":
    case "ends_with":
      if (typeof left !== "string" || typeof right !== "string")
        return invalidComparison("Starts with and ends with require two string inputs.");
      result = stringStartsOrEndsWith(
        left,
        right,
        input.operator === "starts_with" ? "start" : "end",
        collator,
      );
      break;
  }

  return { ok: true, output: { result } };
}
