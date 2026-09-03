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
import { isTriggerType } from "../catalog/node-catalog";
import type {
  CanonicalVisualWorkflowEdge,
  CanonicalVisualWorkflowNode,
  VisualCatalogType,
  VisualWorkflowDefinition,
} from "../schema/types";

export type VisualWorkflowGraphIndex = {
  nodesById: Map<string, CanonicalVisualWorkflowNode>;
  outgoingByNodeId: Map<string, CanonicalVisualWorkflowEdge[]>;
  incomingCountByNodeId: Map<string, number>;
  triggerNodeId: string;
};

export function buildVisualWorkflowGraphIndex(
  definition: VisualWorkflowDefinition,
): VisualWorkflowGraphIndex | null {
  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
  const outgoingByNodeId = new Map<string, CanonicalVisualWorkflowEdge[]>();
  const incomingCountByNodeId = new Map<string, number>();

  for (const node of definition.nodes) {
    outgoingByNodeId.set(node.id, []);
    incomingCountByNodeId.set(node.id, 0);
  }

  for (const edge of definition.edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
      continue;
    }
    outgoingByNodeId.get(edge.source)?.push(edge);
    incomingCountByNodeId.set(edge.target, (incomingCountByNodeId.get(edge.target) ?? 0) + 1);
  }

  const triggers = definition.nodes.filter((node) => isTriggerType(node.type));
  if (triggers.length !== 1) {
    return null;
  }

  return {
    nodesById,
    outgoingByNodeId,
    incomingCountByNodeId,
    triggerNodeId: triggers[0]!.id,
  };
}

export function selectNextEdges(input: {
  nodeType: VisualCatalogType;
  branchResult: boolean | null;
  outgoing: readonly CanonicalVisualWorkflowEdge[];
}): CanonicalVisualWorkflowEdge[] {
  if (input.nodeType === "logic.if") {
    const handle = input.branchResult ? "true" : "false";
    return input.outgoing.filter((edge) => edge.sourceHandle === handle);
  }

  if (input.outgoing.length <= 1) {
    return [...input.outgoing];
  }

  return [...input.outgoing].toSorted((left, right) => left.target.localeCompare(right.target));
}
