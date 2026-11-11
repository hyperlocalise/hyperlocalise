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
import type { VisualWorkflowV3Definition } from "../schema/types";

// A definition as text that is the same for the same content: keys are sorted, and a key that is
// set to nothing is left out, as it is when the definition is saved.
function definitionSnapshot(definition: VisualWorkflowV3Definition): string {
  return JSON.stringify(definition, (_key, value: unknown) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
        )
      : value,
  );
}

/** Whether two definitions would be saved as the same workflow, step positions included. */
export function visualWorkflowDefinitionsEqual(
  left: VisualWorkflowV3Definition,
  right: VisualWorkflowV3Definition,
): boolean {
  return left === right || definitionSnapshot(left) === definitionSnapshot(right);
}
