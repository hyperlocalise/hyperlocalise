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
import type {
  VisualObjectConflictPolicy,
  VisualObjectField,
  VisualObjectMergeInput,
} from "../schema/types";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
export const OBJECT_NODE_LIMITS = {
  maxDepth: 16,
  maxEntries: 1_000,
  maxBytes: 256_000,
} as const;

type ObjectValueErrorCode =
  | "unsafe_object_key"
  | "object_value_too_deep"
  | "object_value_too_large"
  | "invalid_object_value";

function cloneBoundedWorkflowValue(
  value: unknown,
): { ok: true; value: unknown } | { ok: false; code: ObjectValueErrorCode } {
  let entries = 0;
  const ancestors = new WeakSet<object>();

  const clone = (
    candidate: unknown,
    depth: number,
  ): { ok: true; value: unknown } | { ok: false; code: ObjectValueErrorCode } => {
    if (depth > OBJECT_NODE_LIMITS.maxDepth) return { ok: false, code: "object_value_too_deep" };
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean")
      return { ok: true, value: candidate };
    if (typeof candidate === "number")
      return Number.isFinite(candidate)
        ? { ok: true, value: candidate }
        : { ok: false, code: "invalid_object_value" };
    if (typeof candidate !== "object") return { ok: false, code: "invalid_object_value" };
    if (ancestors.has(candidate)) return { ok: false, code: "invalid_object_value" };
    if (
      !Array.isArray(candidate) &&
      Object.getPrototypeOf(candidate) !== Object.prototype &&
      Object.getPrototypeOf(candidate) !== null
    )
      return { ok: false, code: "invalid_object_value" };

    ancestors.add(candidate);
    const output: unknown[] | Record<string, unknown> = Array.isArray(candidate) ? [] : {};
    for (const [key, child] of Object.entries(candidate)) {
      entries += 1;
      if (entries > OBJECT_NODE_LIMITS.maxEntries)
        return { ok: false, code: "object_value_too_large" };
      if (!Array.isArray(candidate) && UNSAFE_OBJECT_KEYS.has(key))
        return { ok: false, code: "unsafe_object_key" };
      const cloned = clone(child, depth + 1);
      if (!cloned.ok) return cloned;
      if (Array.isArray(output)) output.push(cloned.value);
      else assignSafeKey(output, key, cloned.value);
    }
    ancestors.delete(candidate);
    return { ok: true, value: output };
  };

  const cloned = clone(value, 0);
  if (!cloned.ok) return cloned;
  const serialized = JSON.stringify(cloned.value);
  if (serialized === undefined) return { ok: false, code: "invalid_object_value" };
  if (new TextEncoder().encode(serialized).byteLength > OBJECT_NODE_LIMITS.maxBytes)
    return { ok: false, code: "object_value_too_large" };
  return cloned;
}

function invalidObjectValueResult(code: ObjectValueErrorCode): VisualWorkflowNodeExecutionResult {
  return {
    ok: false,
    error: {
      code,
      message:
        code === "unsafe_object_key"
          ? "Object values cannot contain keys that modify object prototypes."
          : code === "object_value_too_deep"
            ? "Object value exceeds the maximum nesting depth."
            : code === "object_value_too_large"
              ? "Object value exceeds the maximum size."
              : "Object value must be JSON-compatible.",
    },
  };
}

function assignSafeKey(target: Record<string, unknown>, key: string, value: unknown): boolean {
  if (UNSAFE_OBJECT_KEYS.has(key)) return false;
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
  return true;
}

export function executeCreateObject(input: {
  fields: readonly VisualObjectField[];
  resolvedConfig: Record<string, unknown>;
}): VisualWorkflowNodeExecutionResult {
  const value: Record<string, unknown> = {};
  for (const field of input.fields) {
    const resolved = input.resolvedConfig[`value.${field.id}`];
    const fieldValue = resolved === undefined ? field.defaultValue : resolved;
    if (fieldValue === undefined) {
      return {
        ok: false,
        error: {
          code: "missing_object_field",
          message: `Object field "${field.name}" is required.`,
          fieldId: field.id,
        },
      };
    }
    if (UNSAFE_OBJECT_KEYS.has(field.name)) {
      return {
        ok: false,
        error: {
          code: "unsafe_object_key",
          message: "Object field names cannot modify object prototypes.",
          fieldId: field.id,
        },
      };
    }
    assignSafeKey(value, field.name, fieldValue);
  }
  const bounded = cloneBoundedWorkflowValue(value);
  return bounded.ok
    ? { ok: true, output: { value: bounded.value as Record<string, unknown> } }
    : invalidObjectValueResult(bounded.code);
}

export function executeMergeObjects(input: {
  inputs: readonly VisualObjectMergeInput[];
  conflictPolicy: VisualObjectConflictPolicy;
  resolvedConfig: Record<string, unknown>;
}): VisualWorkflowNodeExecutionResult {
  const value: Record<string, unknown> = {};
  for (const objectInput of input.inputs) {
    const source = input.resolvedConfig[`value.${objectInput.id}`];
    if (source === null || typeof source !== "object" || Array.isArray(source)) {
      return {
        ok: false,
        error: {
          code: "invalid_merge_object_input",
          message: `Merge input "${objectInput.name}" must be an object.`,
          inputId: objectInput.id,
        },
      };
    }

    const boundedSource = cloneBoundedWorkflowValue(source);
    if (!boundedSource.ok) return invalidObjectValueResult(boundedSource.code);
    for (const [key, entryValue] of Object.entries(
      boundedSource.value as Record<string, unknown>,
    )) {
      const conflict = Object.hasOwn(value, key);
      if (conflict && input.conflictPolicy === "reject") {
        return {
          ok: false,
          error: {
            code: "object_key_conflict",
            message: `Object key "${key}" exists in more than one merge input.`,
            key,
          },
        };
      }
      if (conflict && input.conflictPolicy === "first_wins") continue;
      assignSafeKey(value, key, entryValue);
    }
  }
  const bounded = cloneBoundedWorkflowValue(value);
  return bounded.ok
    ? { ok: true, output: { value: bounded.value as Record<string, unknown> } }
    : invalidObjectValueResult(bounded.code);
}
