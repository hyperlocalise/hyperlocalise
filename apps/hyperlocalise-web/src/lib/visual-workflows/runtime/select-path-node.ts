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
import type {
  VisualSelectPathMissingBehavior,
  VisualSelectPathSegment,
  WorkflowValueType,
} from "../schema/types";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

const UNSAFE_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

function isSafePath(path: unknown): path is VisualSelectPathSegment[] {
  return (
    Array.isArray(path) &&
    path.length > 0 &&
    path.length <= 32 &&
    path.every(
      (segment) =>
        (typeof segment === "string" &&
          segment.length > 0 &&
          segment.length <= 256 &&
          !UNSAFE_PATH_SEGMENTS.has(segment)) ||
        (typeof segment === "number" &&
          Number.isInteger(segment) &&
          segment >= 0 &&
          segment <= 1_000_000),
    )
  );
}

function selectValueAtPath(
  root: unknown,
  path: readonly VisualSelectPathSegment[],
): { found: true; value: unknown } | { found: false } {
  let value = root;
  for (const segment of path) {
    if (Array.isArray(value)) {
      if (typeof segment !== "number" || !Object.hasOwn(value, segment)) return { found: false };
      value = value[segment];
      continue;
    }
    if (
      value === null ||
      typeof value !== "object" ||
      typeof segment !== "string" ||
      !Object.hasOwn(value, segment)
    )
      return { found: false };
    value = (value as Record<string, unknown>)[segment];
  }
  return { found: true, value };
}

export function executeSelectPath(input: {
  value: unknown;
  path: unknown;
  outputType: WorkflowValueType;
  missingBehavior: VisualSelectPathMissingBehavior;
  defaultValue?: unknown;
}): VisualWorkflowNodeExecutionResult {
  if (!isSafePath(input.path)) {
    return {
      ok: false,
      error: {
        code: "invalid_select_path",
        message: "Select Path requires a safe path of object keys and non-negative array indexes.",
      },
    };
  }

  const selected = selectValueAtPath(input.value, input.path);
  if (!selected.found) {
    if (input.missingBehavior === "error") {
      return {
        ok: false,
        error: {
          code: "select_path_not_found",
          message: "The configured path does not exist in the input value.",
        },
      };
    }
    if (input.missingBehavior === "optional")
      return { ok: true, output: { value: undefined, found: false } };
    return { ok: true, output: { value: input.defaultValue, found: false } };
  }

  if (!matchesWorkflowType(selected.value, input.outputType)) {
    return {
      ok: false,
      error: {
        code: "select_path_output_type_mismatch",
        message: "The selected value does not match the declared output type.",
      },
    };
  }
  return { ok: true, output: { value: selected.value, found: true } };
}
