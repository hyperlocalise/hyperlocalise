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
import {
  createDefaultConfig,
  getVisualNodeDimensions,
  isTriggerType,
  VISUAL_NODE_CATALOG,
} from "../catalog/node-catalog";
import type {
  VisualCatalogType,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "../schema/types";

export const VISUAL_TRIGGER_TYPES = VISUAL_NODE_CATALOG.filter(
  (item) => item.enabled && item.category === "trigger",
).map((item) => item.type);

export function replaceVisualWorkflowNodeType(
  node: VisualWorkflowRfNode,
  nextType: VisualCatalogType,
): VisualWorkflowRfNode {
  if (node.data.catalogType === nextType) {
    return node;
  }

  return {
    ...node,
    type: nextType,
    ...getVisualNodeDimensions(nextType),
    data: {
      catalogType: nextType,
      config: createDefaultConfig(nextType),
      runStatus: "idle",
      lastOutput: null,
      lastError: null,
    },
  };
}

export function removeVisualWorkflowNode(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
  nodeId: string,
): { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[] } {
  return {
    nodes: nodes.filter((node) => node.id !== nodeId),
    edges: edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
  };
}

export function isVisualTriggerCatalogType(type: string): type is VisualCatalogType {
  return VISUAL_TRIGGER_TYPES.includes(type as VisualCatalogType) && isTriggerType(type);
}
