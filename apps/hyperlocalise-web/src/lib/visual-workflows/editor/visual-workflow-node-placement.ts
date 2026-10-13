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
import { getSwitchCaseIndexByHandleId } from "../schema/switch-cases";
import type { VisualWorkflowRfNode } from "../schema/types";

const NODE_GAP_X = 340;
const NODE_GAP_Y = 36;

/** How far below its source a node added from one of the source's output handles goes. */
function quickAddOffsetY(
  handleId: string | null | undefined,
  source: VisualWorkflowRfNode,
): number {
  const sourceHeight =
    source.height ?? getVisualNodeDimensions(source.data.catalogType, source.data.config).height;
  const branchStep = sourceHeight + NODE_GAP_Y;

  if (!handleId || handleId === "true" || handleId === "each") {
    return 0;
  }
  if (source.data.catalogType === "logic.try_catch") {
    const outputIndex = ["try", "success", "catch", "finally"].indexOf(handleId);
    if (outputIndex >= 0) return outputIndex * branchStep;
  }
  if (source.data.config.kind === "logic.sequence") {
    const outputIndex = source.data.config.outputs.findIndex((output) => output.id === handleId);
    if (outputIndex >= 0) {
      return outputIndex * branchStep;
    }
  }
  if (handleId === "false" || handleId === "done" || handleId === "error") {
    return branchStep;
  }
  if (source.data.catalogType === "logic.switch" && source.data.config.kind === "logic.switch") {
    if (handleId === "default") {
      return source.data.config.cases.length * branchStep;
    }
    const caseIndex = getSwitchCaseIndexByHandleId(source.data.config.cases, handleId);
    if (caseIndex !== null) {
      return caseIndex * branchStep;
    }
  }
  return 0;
}

/**
 * Where a new node goes: to the right of the node it is added from, on the row of that node's
 * output handle, or on a diagonal below the nodes already there when it is added from nowhere.
 * The canvas' "+" buttons and the assistant place nodes through this one rule.
 */
export function placeNewVisualWorkflowNode(input: {
  nodes: readonly VisualWorkflowRfNode[];
  source?: VisualWorkflowRfNode | null;
  handleId?: string | null;
}): { x: number; y: number } {
  if (input.source) {
    return {
      x: input.source.position.x + NODE_GAP_X,
      y: input.source.position.y + quickAddOffsetY(input.handleId, input.source),
    };
  }
  return { x: 120 + input.nodes.length * 24, y: 160 + input.nodes.length * 16 };
}
