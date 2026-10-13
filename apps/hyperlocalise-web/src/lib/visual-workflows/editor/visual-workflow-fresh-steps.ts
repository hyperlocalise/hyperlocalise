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
import type { VisualWorkflowRfNode } from "../schema/types";

const NO_STEPS: ReadonlySet<string> = new Set();

/**
 * The steps to mark as new once the canvas went from `previous` to `next`: those that have
 * appeared since, and those marked before, less the ones that are selected or gone. A step is
 * new until it is first selected, however it got there. Returns `marked` itself when nothing
 * changes.
 */
export function markFreshVisualWorkflowSteps(input: {
  marked: ReadonlySet<string>;
  previous: readonly VisualWorkflowRfNode[];
  next: readonly VisualWorkflowRfNode[];
  /** The step whose settings are open, which counts as selected. */
  selectedNodeId: string | null;
}): ReadonlySet<string> {
  const known = new Set(input.previous.map((node) => node.id));
  const result = new Set<string>();
  for (const node of input.next) {
    if (node.selected || node.id === input.selectedNodeId) {
      continue;
    }
    if (input.marked.has(node.id) || !known.has(node.id)) {
      result.add(node.id);
    }
  }
  if (result.size === 0) {
    return input.marked.size === 0 ? input.marked : NO_STEPS;
  }
  const unchanged =
    result.size === input.marked.size && [...result].every((id) => input.marked.has(id));
  return unchanged ? input.marked : result;
}
