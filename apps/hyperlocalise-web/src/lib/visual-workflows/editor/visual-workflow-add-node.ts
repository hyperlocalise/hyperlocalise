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
import type {
  VisualCatalogType,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "../schema/types";
import {
  getPrimaryExecutionSourceHandle,
  type VisualWorkflowHandleSource,
} from "../validation/execution-handles";
import { canvasDataHandleId, readConnectionHandle } from "./canvas-handle-ids";
import type { VisualWorkflowAddIntent } from "./visual-workflow-add-from";
import { applyVisualWorkflowGraphConnection } from "./visual-workflow-editor-graph";
import { getVisualWorkflowDataPorts } from "./visual-workflow-data-ports";

function handleSource(node: VisualWorkflowRfNode): VisualWorkflowHandleSource {
  return { type: node.data.catalogType, config: node.data.config };
}

function firstDataHandle(node: VisualWorkflowRfNode, side: "input" | "output"): string | null {
  const ports = getVisualWorkflowDataPorts({ node, edges: [] });
  const port = side === "input" ? ports.inputs[0] : ports.outputs[0];
  return port ? canvasDataHandleId(port.id) : null;
}

function asCanvasHandle(handleId: string | null | undefined, isData: boolean): string | null {
  if (!handleId) {
    return null;
  }
  return isData && !readConnectionHandle(handleId).isData ? canvasDataHandleId(handleId) : handleId;
}

function connectExecutionThenData(input: {
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  execution: {
    source: string;
    target: string;
    sourceHandle: string | null;
    targetHandle: string | null;
  };
  data: {
    source: string;
    target: string;
    sourceHandle: string | null;
    targetHandle: string | null;
  };
}): { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[] } {
  const withExec = applyVisualWorkflowGraphConnection(input.nodes, input.edges, input.execution);
  return applyVisualWorkflowGraphConnection(withExec.nodes, withExec.edges, input.data);
}

function insertOnEdge(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
  newNodeId: string,
  spliceEdgeId: string,
): { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[] } {
  const edge = edges.find((item) => item.id === spliceEdgeId);
  const newNode = nodes.find((node) => node.id === newNodeId);
  if (!edge || !newNode) {
    return { nodes: [...nodes], edges: [...edges] };
  }
  const rest = edges.filter((item) => item.id !== spliceEdgeId);
  const isData = edge.data?.kind === "data";
  const incoming = applyVisualWorkflowGraphConnection(nodes, rest, {
    source: edge.source,
    target: newNodeId,
    sourceHandle: asCanvasHandle(edge.sourceHandle, isData),
    targetHandle: isData ? firstDataHandle(newNode, "input") : null,
  });
  const outgoingSource = isData
    ? firstDataHandle(newNode, "output")
    : (getPrimaryExecutionSourceHandle(handleSource(newNode)) ?? "success");
  return applyVisualWorkflowGraphConnection(incoming.nodes, incoming.edges, {
    source: newNodeId,
    target: edge.target,
    sourceHandle: outgoingSource,
    targetHandle: asCanvasHandle(edge.targetHandle, isData),
  });
}

/** Wires a newly added step from a pin, or splices it onto an existing wire. */
export function connectNewVisualWorkflowNode(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
  newNodeId: string,
  intent: VisualWorkflowAddIntent,
): { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[] } {
  if (intent.spliceEdgeId) {
    return insertOnEdge(nodes, edges, newNodeId, intent.spliceEdgeId);
  }
  const from = intent.from;
  const newNode = nodes.find((node) => node.id === newNodeId);
  const fromNode = from ? nodes.find((node) => node.id === from.nodeId) : undefined;
  if (!from || !newNode || !fromNode) {
    return { nodes: [...nodes], edges: [...edges] };
  }

  const handle = readConnectionHandle(from.handleId);
  const handleType = from.handleType ?? "source";

  if (handleType === "source") {
    if (handle.isData) {
      const dataTarget = firstDataHandle(newNode, "input");
      if (!dataTarget) {
        return { nodes: [...nodes], edges: [...edges] };
      }
      return connectExecutionThenData({
        nodes,
        edges,
        execution: {
          source: fromNode.id,
          target: newNodeId,
          sourceHandle: getPrimaryExecutionSourceHandle(handleSource(fromNode)) ?? "success",
          targetHandle: null,
        },
        data: {
          source: fromNode.id,
          target: newNodeId,
          sourceHandle: from.handleId ?? null,
          targetHandle: dataTarget,
        },
      });
    }
    return applyVisualWorkflowGraphConnection(nodes, edges, {
      source: fromNode.id,
      target: newNodeId,
      sourceHandle: from.handleId ?? null,
      targetHandle: null,
    });
  }

  if (handle.isData) {
    const dataSource = firstDataHandle(newNode, "output");
    if (!dataSource) {
      return { nodes: [...nodes], edges: [...edges] };
    }
    return connectExecutionThenData({
      nodes,
      edges,
      execution: {
        source: newNodeId,
        target: fromNode.id,
        sourceHandle: getPrimaryExecutionSourceHandle(handleSource(newNode)) ?? "success",
        targetHandle: null,
      },
      data: {
        source: newNodeId,
        target: fromNode.id,
        sourceHandle: dataSource,
        targetHandle: from.handleId ?? null,
      },
    });
  }

  return applyVisualWorkflowGraphConnection(nodes, edges, {
    source: newNodeId,
    target: fromNode.id,
    sourceHandle: getPrimaryExecutionSourceHandle(handleSource(newNode)),
    targetHandle: from.handleId ?? null,
  });
}

const PASTE_OFFSET = { x: 48, y: 48 };

/** Copies the selected subgraph, remapping ids so the paste can sit beside the original. */
export function duplicateVisualWorkflowSelection(input: {
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  selectedIds: ReadonlySet<string>;
  offset?: { x: number; y: number };
  nextId: (type: VisualCatalogType, taken: readonly Pick<VisualWorkflowRfNode, "id">[]) => string;
}): { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[]; pastedIds: string[] } {
  const selected = input.nodes.filter((node) => input.selectedIds.has(node.id));
  if (selected.length === 0) {
    return { nodes: [...input.nodes], edges: [...input.edges], pastedIds: [] };
  }
  const offset = input.offset ?? PASTE_OFFSET;
  const idMap = new Map<string, string>();
  const taken: Pick<VisualWorkflowRfNode, "id">[] = [...input.nodes];
  for (const node of selected) {
    const id = input.nextId(node.data.catalogType, taken);
    idMap.set(node.id, id);
    taken.push({ id });
  }
  const pastedNodes: VisualWorkflowRfNode[] = selected.map((node) => {
    const id = idMap.get(node.id)!;
    return {
      ...node,
      id,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      selected: true,
      data: { ...node.data, runStatus: "idle", lastOutput: null, lastError: null },
    };
  });
  const pastedEdges = input.edges.flatMap((edge) => {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    if (!source || !target) {
      return [];
    }
    return [
      {
        ...edge,
        id: `xy-edge__${source}${edge.sourceHandle || ""}-${target}${edge.targetHandle || ""}`,
        source,
        target,
        selected: false,
      },
    ];
  });
  const otherNodes = input.nodes.map((node) =>
    node.selected ? { ...node, selected: false } : node,
  );
  const otherEdges = input.edges.map((edge) =>
    edge.selected ? { ...edge, selected: false } : edge,
  );
  return {
    nodes: [...otherNodes, ...pastedNodes],
    edges: [...otherEdges, ...pastedEdges],
    pastedIds: pastedNodes.map((node) => node.id),
  };
}

function remapSubgraph(
  subgraph: {
    nodes: readonly VisualWorkflowRfNode[];
    edges: readonly VisualWorkflowRfEdge[];
  },
  taken: Pick<VisualWorkflowRfNode, "id">[],
  offset: { x: number; y: number },
  nextId: (type: VisualCatalogType, taken: readonly Pick<VisualWorkflowRfNode, "id">[]) => string,
): { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[]; pastedIds: string[] } {
  const idMap = new Map<string, string>();
  const nextTaken = [...taken];
  for (const node of subgraph.nodes) {
    const id = nextId(node.data.catalogType, nextTaken);
    idMap.set(node.id, id);
    nextTaken.push({ id });
  }
  const pastedNodes: VisualWorkflowRfNode[] = subgraph.nodes.map((node) => {
    const id = idMap.get(node.id)!;
    return {
      ...node,
      id,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      selected: true,
      data: { ...node.data, runStatus: "idle", lastOutput: null, lastError: null },
    };
  });
  const pastedEdges = subgraph.edges.flatMap((edge) => {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    if (!source || !target) {
      return [];
    }
    return [
      {
        ...edge,
        id: `xy-edge__${source}${edge.sourceHandle || ""}-${target}${edge.targetHandle || ""}`,
        source,
        target,
        selected: false,
      },
    ];
  });
  return {
    nodes: pastedNodes,
    edges: pastedEdges,
    pastedIds: pastedNodes.map((node) => node.id),
  };
}

/** Pastes a copied subgraph onto the current graph with new ids. */
export function pasteVisualWorkflowClipboard(input: {
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  clipboard: {
    nodes: readonly VisualWorkflowRfNode[];
    edges: readonly VisualWorkflowRfEdge[];
  };
  offset?: { x: number; y: number };
  nextId: (type: VisualCatalogType, taken: readonly Pick<VisualWorkflowRfNode, "id">[]) => string;
}): { nodes: VisualWorkflowRfNode[]; edges: VisualWorkflowRfEdge[]; pastedIds: string[] } {
  if (input.clipboard.nodes.length === 0) {
    return { nodes: [...input.nodes], edges: [...input.edges], pastedIds: [] };
  }
  const pasted = remapSubgraph(
    input.clipboard,
    [...input.nodes],
    input.offset ?? PASTE_OFFSET,
    input.nextId,
  );
  return {
    nodes: [
      ...input.nodes.map((node) => (node.selected ? { ...node, selected: false } : node)),
      ...pasted.nodes,
    ],
    edges: [
      ...input.edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
      ...pasted.edges,
    ],
    pastedIds: pasted.pastedIds,
  };
}
