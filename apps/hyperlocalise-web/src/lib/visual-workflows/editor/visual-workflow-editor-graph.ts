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
import { addEdge, type Connection } from "@xyflow/react";

import {
  createDefaultConfig,
  getVisualNodeDimensions,
  VISUAL_NODE_CATALOG,
} from "../catalog/node-catalog";
import type {
  VisualCatalogType,
  VisualNodeConfig,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "../schema/types";
import { collectRemovedSwitchCaseIds, pruneSwitchCaseEdges } from "../schema/switch-cases";
import { validateVisualWorkflowConnection } from "../validation/validate-connection";
import { computeForEachBodyNodeIds } from "./for-each-body-membership";

export { computeForEachBodyNodeIds } from "./for-each-body-membership";

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
    nodes: nodes
      .filter((node) => node.id !== nodeId)
      .map((node) =>
        node.data.bodyNodeIds
          ? {
              ...node,
              data: {
                ...node.data,
                bodyNodeIds: node.data.bodyNodeIds.filter((id) => id !== nodeId),
              },
            }
          : node,
      ),
    edges: edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
  };
}

export function isVisualTriggerCatalogType(type: string): type is VisualCatalogType {
  return (VISUAL_TRIGGER_TYPES as readonly string[]).includes(type);
}

function asMutableGraph(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[] } {
  return {
    nodes: nodes as VisualWorkflowRfNode[],
    edges: edges as VisualWorkflowRfEdge[],
  };
}

function forEachBodyIdsEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = [...left].toSorted();
  const sortedRight = [...right].toSorted();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}

function reconcileBodyMembershipForType(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
  catalogType: "logic.for_each" | "logic.retry",
  compute: (ownerId: string, edges: readonly VisualWorkflowRfEdge[]) => string[],
): VisualWorkflowRfNode[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.data.catalogType !== catalogType) {
      return node;
    }
    const computed = compute(node.id, edges);
    const current = node.data.bodyNodeIds ?? [];
    if (forEachBodyIdsEqual(current, computed)) {
      return node;
    }
    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        bodyNodeIds: computed,
      },
    };
  });
  return changed ? next : (nodes as VisualWorkflowRfNode[]);
}

export function reconcileForEachBodyMembership(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): VisualWorkflowRfNode[] {
  return reconcileBodyMembershipForType(nodes, edges, "logic.for_each", computeForEachBodyNodeIds);
}

export function reconcileRetryBodyMembership(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): VisualWorkflowRfNode[] {
  return reconcileBodyMembershipForType(nodes, edges, "logic.retry", computeRetryBodyNodeIds);
}

export function reconcileFlowBodyMembership(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): VisualWorkflowRfNode[] {
  return reconcileRetryBodyMembership(reconcileForEachBodyMembership(nodes, edges), edges);
}

export function syncForEachBodyMembership(
  nodes: readonly VisualWorkflowRfNode[],
  connection: Pick<Connection, "source" | "target" | "sourceHandle">,
): VisualWorkflowRfNode[] {
  const sourceId = connection.source;
  const targetId = connection.target;
  if (!sourceId || !targetId || sourceId === targetId) {
    return nodes as VisualWorkflowRfNode[];
  }

  const sourceHandle = connection.sourceHandle ?? null;
  const sourceNode = nodes.find((node) => node.id === sourceId);
  let ownerId: string | null = null;

  if (sourceNode?.data.catalogType === "logic.for_each" && sourceHandle === "each") {
    ownerId = sourceId;
  } else if (sourceNode?.data.catalogType === "logic.retry" && sourceHandle === "attempt") {
    ownerId = sourceId;
  } else {
    const bodyOwners = nodes.filter(
      (node) =>
        (node.data.catalogType === "logic.for_each" || node.data.catalogType === "logic.retry") &&
        node.data.bodyNodeIds?.includes(sourceId),
    );
    if (bodyOwners.length === 1) {
      ownerId = bodyOwners[0]?.id ?? null;
    }
  }

  if (!ownerId || targetId === ownerId) {
    return nodes as VisualWorkflowRfNode[];
  }

  return nodes.map((node) => {
    if (node.id !== ownerId) {
      return node;
    }
    const current = node.data.bodyNodeIds ?? [];
    if (current.includes(targetId)) {
      return node;
    }
    return {
      ...node,
      data: {
        ...node.data,
        bodyNodeIds: [...current, targetId],
      },
    };
  });
}

export function applyNodeConfigUpdate(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
  nodeId: string,
  nextConfig: VisualNodeConfig,
): { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[] } {
  const current = nodes.find((node) => node.id === nodeId);
  const nextNodes = nodes.map((node) =>
    node.id === nodeId ? { ...node, data: { ...node.data, config: nextConfig } } : node,
  );
  if (current?.data.config.kind === "logic.switch" && nextConfig.kind === "logic.switch") {
    return {
      nodes: nextNodes,
      edges: pruneSwitchCaseEdges(
        edges,
        nodeId,
        collectRemovedSwitchCaseIds(current.data.config.cases, nextConfig.cases),
      ),
    };
  }
  return { nodes: nextNodes, edges: [...edges] };
}

export function applyVisualWorkflowGraphConnection(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
  connection: Connection,
): { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[] } {
  const validation = validateVisualWorkflowConnection({
    nodes,
    edges,
    connection,
  });

  if (!validation.valid) {
    return asMutableGraph(nodes, edges);
  }

  const nextConnection: Connection = {
    ...connection,
    sourceHandle: validation.sourcePortId,
    targetHandle: validation.targetPortId,
  };

  if (validation.edgeKind === "data") {
    return {
      nodes: nodes as VisualWorkflowRfNode[],
      edges: addEdge(
        {
          ...nextConnection,
          data: {
            kind: "data",
          },
          label: `${validation.sourcePortId} → ${validation.targetPortId}`,
          style: {
            strokeDasharray: "5 4",
          },
        },
        [...edges],
      ),
    };
  }

  return {
    nodes: syncForEachBodyMembership(nodes, nextConnection),
    edges: addEdge(
      {
        ...nextConnection,
        data: {
          kind: "execution",
        },
        label: validation.sourcePortId,
      },
      [...edges],
    ),
  };
}

export function reconnectVisualWorkflowGraphConnection(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
  edgeId: string,
  connection: Connection,
): { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[] } {
  const currentEdge = edges.find((edge) => edge.id === edgeId);

  if (!currentEdge) {
    return asMutableGraph(nodes, edges);
  }

  const validation = validateVisualWorkflowConnection({
    nodes,
    edges,
    connection,
    replacingEdgeId: edgeId,
  });

  if (!validation.valid) {
    return asMutableGraph(nodes, edges);
  }

  const { strokeDasharray: _, ...baseStyle } = currentEdge.style ?? {};
  const isDataEdge = validation.edgeKind === "data";

  const nextEdge: VisualWorkflowRfEdge = {
    ...currentEdge,
    source: connection.source,
    target: connection.target,
    sourceHandle: validation.sourcePortId,
    targetHandle: validation.targetPortId,
    data: {
      ...currentEdge.data,
      kind: validation.edgeKind,
    },
    label: isDataEdge
      ? `${validation.sourcePortId} → ${validation.targetPortId}`
      : validation.sourcePortId,
    style: isDataEdge
      ? {
          ...baseStyle,
          strokeDasharray: "5 4",
        }
      : Object.keys(baseStyle).length > 0
        ? baseStyle
        : undefined,
  };

  const nextEdges = edges.map((edge) => (edge.id === edgeId ? nextEdge : edge));

  return {
    nodes: reconcileForEachBodyMembership(nodes, nextEdges),
    edges: nextEdges,
  };
}
