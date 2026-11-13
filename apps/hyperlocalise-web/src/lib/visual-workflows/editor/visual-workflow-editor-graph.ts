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
import type { Connection } from "@xyflow/react";

import {
  createDefaultConfig,
  getVisualNodeDimensions,
  VISUAL_NODE_CATALOG,
} from "../catalog/node-catalog";
import { getWorkflowInputFields } from "../catalog/node-contracts";
import type {
  VisualCatalogType,
  VisualNodeConfig,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "../schema/types";
import { getAllowedExecutionSourceHandles } from "../validation/execution-handles";
import { validateVisualWorkflowConnection } from "../validation/validate-connection";
import {
  computeForEachBodyNodeIds,
  computeRetryBodyNodeIds,
  computeTryCatchBodyNodeIds,
} from "./for-each-body-membership";
import { getVisualWorkflowDataPorts } from "./visual-workflow-data-ports";

export {
  computeForEachBodyNodeIds,
  computeRetryBodyNodeIds,
  computeTryCatchBodyNodeIds,
} from "./for-each-body-membership";

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

  const config = createDefaultConfig(nextType);

  return {
    ...node,
    type: nextType,
    ...getVisualNodeDimensions(nextType, config),
    data: {
      catalogType: nextType,
      config,
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
  const nextNodes = nodes.filter((node) => node.id !== nodeId);
  const nextEdges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);

  return {
    nodes: reconcileFlowBodyMembership(nextNodes, nextEdges),
    edges: nextEdges,
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
  catalogType: "logic.for_each" | "logic.array_transform" | "logic.retry" | "logic.try_catch",
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

export function reconcileArrayTransformBodyMembership(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): VisualWorkflowRfNode[] {
  return reconcileBodyMembershipForType(
    nodes,
    edges,
    "logic.array_transform",
    computeForEachBodyNodeIds,
  );
}

export function reconcileRetryBodyMembership(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): VisualWorkflowRfNode[] {
  return reconcileBodyMembershipForType(nodes, edges, "logic.retry", computeRetryBodyNodeIds);
}

export function reconcileTryCatchBodyMembership(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): VisualWorkflowRfNode[] {
  return reconcileBodyMembershipForType(
    nodes,
    edges,
    "logic.try_catch",
    computeTryCatchBodyNodeIds,
  );
}

export function reconcileFlowBodyMembership(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): VisualWorkflowRfNode[] {
  return reconcileTryCatchBodyMembership(
    reconcileRetryBodyMembership(
      reconcileArrayTransformBodyMembership(reconcileForEachBodyMembership(nodes, edges), edges),
      edges,
    ),
    edges,
  );
}

/** A key for each handle a step offers, by kind and side, as the card draws them. */
function listNodeHandleKeys(node: VisualWorkflowRfNode, withDataPorts: boolean): Set<string> {
  const { config } = node.data;
  const ports = withDataPorts
    ? getVisualWorkflowDataPorts({ node, edges: [] })
    : { inputs: [], outputs: [] };
  return new Set([
    ...getAllowedExecutionSourceHandles({ type: node.data.catalogType, config }).map((handle) =>
      handleKey("execution", "source", handle),
    ),
    ...(config.kind === "logic.merge"
      ? config.inputs.map((input) => handleKey("execution", "target", input.id))
      : [handleKey("execution", "target", "input"), handleKey("execution", "target", null)]),
    ...ports.inputs.map((port) => handleKey("data", "target", port.id)),
    ...ports.outputs.map((port) => handleKey("data", "source", port.id)),
  ]);
}

function handleKey(
  kind: "execution" | "data",
  side: "source" | "target",
  handle: string | null | undefined,
): string {
  return `${kind}:${side}:${handle ?? ""}`;
}

/**
 * Changes a step's settings. A wire attached to a handle the step had before the change and no
 * longer has (a removed case or field, the error branch once On error stops the workflow) goes
 * with it.
 */
export function applyNodeConfigUpdate(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
  nodeId: string,
  nextConfig: VisualNodeConfig,
): { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[] } {
  const current = nodes.find((node) => node.id === nodeId);
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }
    const next = {
      ...node,
      ...getVisualNodeDimensions(node.data.catalogType, nextConfig),
      data: { ...node.data, config: nextConfig },
    };
    return nextConfig.kind === "logic.array_transform" ? withoutStaleInputs(next) : next;
  });
  const next = nextNodes.find((node) => node.id === nodeId);
  if (!current || !next) {
    return { nodes: nextNodes, edges: [...edges] };
  }

  // A Set step's data ports are named by its field names, which change a keystroke at a time.
  // Their wires stay through a rename, so a name typed back finds them again, and go only when a
  // field is removed.
  const currentConfig = current.data.config;
  const withDataPorts =
    currentConfig.kind !== "logic.set" ||
    nextConfig.kind !== "logic.set" ||
    nextConfig.assignments.length < currentConfig.assignments.length;
  const before = listNodeHandleKeys(current, withDataPorts);
  const after = listNodeHandleKeys(next, withDataPorts);
  const isGone = (key: string) => before.has(key) && !after.has(key);
  return {
    nodes: nextNodes,
    edges: edges.filter((edge) => {
      const kind = edge.data?.kind === "data" ? "data" : "execution";
      return !(
        (edge.source === nodeId && isGone(handleKey(kind, "source", edge.sourceHandle))) ||
        (edge.target === nodeId && isGone(handleKey(kind, "target", edge.targetHandle)))
      );
    }),
  };
}

/** Drops the values set for inputs an Array Transform's operation no longer takes. */
function withoutStaleInputs(node: VisualWorkflowRfNode): VisualWorkflowRfNode {
  if (!node.data.inputs) {
    return node;
  }
  const allowedInputs = new Set(
    getWorkflowInputFields({
      id: node.id,
      type: node.data.catalogType,
      config: node.data.config,
    }).map((field) => field.name),
  );
  const nextInputs = Object.fromEntries(
    Object.entries(node.data.inputs).filter(([name]) => allowedInputs.has(name)),
  );
  return Object.keys(nextInputs).length === Object.keys(node.data.inputs).length
    ? node
    : { ...node, data: { ...node.data, inputs: nextInputs } };
}

/**
 * Adds an edge for a connection unless the same one is there, as React Flow's `addEdge` does and
 * with the same id. Kept here because `@xyflow/react` is a client module: the assistant applies
 * connections on the server with this file.
 */
function addEdge(
  connection: Connection & Omit<Partial<VisualWorkflowRfEdge>, keyof Connection>,
  edges: VisualWorkflowRfEdge[],
): VisualWorkflowRfEdge[] {
  const exists = edges.some(
    (edge) =>
      edge.source === connection.source &&
      edge.target === connection.target &&
      (edge.sourceHandle === connection.sourceHandle ||
        (!edge.sourceHandle && !connection.sourceHandle)) &&
      (edge.targetHandle === connection.targetHandle ||
        (!edge.targetHandle && !connection.targetHandle)),
  );
  if (exists) {
    return edges;
  }
  const { sourceHandle, targetHandle, ...rest } = connection;
  const edge = {
    ...rest,
    id: `xy-edge__${connection.source}${sourceHandle || ""}-${connection.target}${targetHandle || ""}`,
    ...(sourceHandle === null ? {} : { sourceHandle }),
    ...(targetHandle === null ? {} : { targetHandle }),
  } as VisualWorkflowRfEdge;
  return [...edges, edge];
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

  const nextEdges = addEdge(
    {
      ...nextConnection,
      data: {
        kind: "execution",
      },
      label: validation.sourcePortId,
    },
    [...edges],
  );

  return {
    nodes: reconcileFlowBodyMembership(nodes, nextEdges),
    edges: nextEdges,
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
    nodes: reconcileFlowBodyMembership(nodes, nextEdges),
    edges: nextEdges,
  };
}
