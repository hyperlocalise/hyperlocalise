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
import { getVisualNodeDimensions } from "../catalog/node-catalog";
import type { VisualWorkflowRfNode } from "../schema/types";
import { getAllowedExecutionSourceHandles } from "../validation/execution-handles";

const NODE_GAP_X = 340;
const NODE_GAP_Y = 36;
// How far a new step is moved off a step already at its spot, so both can be seen.
const STACK_OFFSET_X = 24;
const STACK_OFFSET_Y = 16;

/**
 * How far below its source a node added from one of the source's output handles goes: one row per
 * output above it, in the order the card draws them.
 */
function quickAddOffsetY(
  handleId: string | null | undefined,
  source: VisualWorkflowRfNode,
): number {
  const sourceHeight =
    source.height ?? getVisualNodeDimensions(source.data.catalogType, source.data.config).height;
  const outputs = getAllowedExecutionSourceHandles({
    type: source.data.catalogType,
    config: source.data.config,
  }).filter((handle) => handle !== null);
  return Math.max(outputs.indexOf(handleId ?? ""), 0) * (sourceHeight + NODE_GAP_Y);
}

/**
 * Where a new node goes: to the right of the node it is added from, on the row of that node's
 * output handle, or on a diagonal below the nodes already there when it is added from nowhere.
 * The canvas' "+" buttons and the assistant place nodes through this one rule.
 */
/**
 * Where a new step goes: beside the step it was added from, else in the middle of what the canvas
 * shows, else at a fixed spot when the view is not known.
 */
export function placeNewVisualWorkflowNode(input: {
  nodes: readonly VisualWorkflowRfNode[];
  source?: VisualWorkflowRfNode | null;
  handleId?: string | null;
  /** The canvas position at the middle of the view. */
  viewCenter?: { x: number; y: number } | null;
  /** The new step's size, so the step and not its corner lands on `viewCenter`. */
  size?: { width: number; height: number };
}): { x: number; y: number } {
  if (input.source) {
    return {
      x: input.source.position.x + NODE_GAP_X,
      y: input.source.position.y + quickAddOffsetY(input.handleId, input.source),
    };
  }
  if (input.viewCenter) {
    let x = Math.round(input.viewCenter.x - (input.size?.width ?? 0) / 2);
    let y = Math.round(input.viewCenter.y - (input.size?.height ?? 0) / 2);
    const isTaken = () =>
      input.nodes.some(
        (node) =>
          Math.abs(node.position.x - x) < STACK_OFFSET_X &&
          Math.abs(node.position.y - y) < STACK_OFFSET_Y,
      );
    while (isTaken()) {
      x += STACK_OFFSET_X;
      y += STACK_OFFSET_Y;
    }
    return { x, y };
  }
  return {
    x: 120 + input.nodes.length * STACK_OFFSET_X,
    y: 160 + input.nodes.length * STACK_OFFSET_Y,
  };
}
