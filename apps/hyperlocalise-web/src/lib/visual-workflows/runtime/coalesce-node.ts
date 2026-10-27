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
import type { VisualCoalesceInput } from "../schema/types";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

function isMissingCoalesceValue(
  value: unknown,
  policy: {
    treatNullAsMissing: boolean;
    treatEmptyStringAsMissing: boolean;
    treatEmptyArrayAsMissing: boolean;
    treatEmptyObjectAsMissing: boolean;
  },
): boolean {
  if (value === undefined) return true;
  if (value === null) return policy.treatNullAsMissing;
  if (value === "") return policy.treatEmptyStringAsMissing;
  if (Array.isArray(value)) return policy.treatEmptyArrayAsMissing && value.length === 0;
  return (
    policy.treatEmptyObjectAsMissing && typeof value === "object" && Object.keys(value).length === 0
  );
}

export function executeCoalesce(input: {
  inputs: readonly VisualCoalesceInput[];
  resolvedConfig: Record<string, unknown>;
  treatNullAsMissing: boolean;
  treatEmptyStringAsMissing: boolean;
  treatEmptyArrayAsMissing: boolean;
  treatEmptyObjectAsMissing: boolean;
}): VisualWorkflowNodeExecutionResult {
  const policy = {
    treatNullAsMissing: input.treatNullAsMissing,
    treatEmptyStringAsMissing: input.treatEmptyStringAsMissing,
    treatEmptyArrayAsMissing: input.treatEmptyArrayAsMissing,
    treatEmptyObjectAsMissing: input.treatEmptyObjectAsMissing,
  };

  for (const candidate of input.inputs) {
    const resolved = input.resolvedConfig[`value.${candidate.id}`];
    const value = resolved === undefined ? candidate.defaultValue : resolved;
    if (isMissingCoalesceValue(value, policy)) continue;
    if (!matchesWorkflowType(value, candidate.type)) {
      return {
        ok: false,
        error: {
          code: "coalesce_input_type_mismatch",
          message: `Coalesce input "${candidate.name}" does not match its declared type.`,
          inputId: candidate.id,
        },
      };
    }
    return { ok: true, output: { value } };
  }

  return { ok: true, output: { value: undefined } };
}
