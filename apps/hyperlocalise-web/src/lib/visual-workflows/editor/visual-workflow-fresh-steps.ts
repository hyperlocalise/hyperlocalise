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
import { visualWorkflowStepSettings } from "./visual-workflow-undo";

const NO_STEPS: ReadonlySet<string> = new Set();

function settingsChanged(previous: VisualWorkflowRfNode, next: VisualWorkflowRfNode): boolean {
  return (
    previous.data !== next.data &&
    visualWorkflowStepSettings(previous) !== visualWorkflowStepSettings(next)
  );
}

/**
 * The steps to mark as fresh once the canvas went from `previous` to `next`: those that have
 * appeared or had their settings changed since, and those marked before, less the ones that are
 * selected or gone. A step is edited by hand in its settings panel, which selects it, so a step
 * marked here was added or changed by something else: an undo, a redo, the assistant. It stays
 * marked until it is first selected. Returns `marked` itself when nothing changes.
 */
export function markFreshVisualWorkflowSteps(input: {
  marked: ReadonlySet<string>;
  previous: readonly VisualWorkflowRfNode[];
  next: readonly VisualWorkflowRfNode[];
  /** The step whose settings are open, which counts as selected. */
  selectedNodeId: string | null;
}): ReadonlySet<string> {
  const known = new Map(input.previous.map((node) => [node.id, node]));
  const result = new Set<string>();
  for (const node of input.next) {
    if (node.selected || node.id === input.selectedNodeId) {
      continue;
    }
    const earlier = known.get(node.id);
    if (input.marked.has(node.id) || !earlier || settingsChanged(earlier, node)) {
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
