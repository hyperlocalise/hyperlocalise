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
import { createDefaultConfig, isTriggerType, VISUAL_NODE_CATALOG } from "../catalog/node-catalog";
import type {
  VisualCatalogType,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "../schema/types";
import {
  getAllowedExecutionSourceHandles,
  getPrimaryExecutionSourceHandle,
  type VisualWorkflowHandleSource,
} from "../validation/execution-handles";
import { validateVisualWorkflowConnection } from "../validation/validate-connection";
import { canvasDataHandleId, readConnectionHandle } from "./canvas-handle-ids";
import { getVisualWorkflowDataPorts } from "./visual-workflow-data-ports";

const PROBE_ID = "__compatible_probe__";
const PROBE_EXEC_ID = "__compatible_probe_exec__";

export type VisualWorkflowCompatibleFrom = {
  nodeId: string;
  handleId?: string | null;
  handleType?: "source" | "target";
};

function handleSource(node: VisualWorkflowRfNode): VisualWorkflowHandleSource {
  return { type: node.data.catalogType, config: node.data.config };
}

function probeNode(type: VisualCatalogType): VisualWorkflowRfNode {
  const config = createDefaultConfig(type);
  return {
    id: PROBE_ID,
    type,
    position: { x: 0, y: 0 },
    data: { catalogType: type, config, runStatus: "idle" },
  };
}

function firstDataHandle(node: VisualWorkflowRfNode, side: "input" | "output"): string | null {
  const ports = getVisualWorkflowDataPorts({ node, edges: [] });
  const port = side === "input" ? ports.inputs[0] : ports.outputs[0];
  return port ? canvasDataHandleId(port.id) : null;
}

function helperExecutionEdge(input: {
  source: string;
  target: string;
  sourceHandle: string | null;
}): VisualWorkflowRfEdge {
  return {
    id: PROBE_EXEC_ID,
    source: input.source,
    target: input.target,
    sourceHandle: input.sourceHandle,
    targetHandle: "input",
    data: { kind: "execution" },
  };
}

function canConnectProbe(input: {
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  from: VisualWorkflowCompatibleFrom;
  type: VisualCatalogType;
}): boolean {
  if (isTriggerType(input.type)) {
    return false;
  }
  const fromNode = input.nodes.find((node) => node.id === input.from.nodeId);
  if (!fromNode) {
    return false;
  }
  const probe = probeNode(input.type);
  const nodes = [...input.nodes, probe];
  const handle = readConnectionHandle(input.from.handleId);
  const handleType = input.from.handleType ?? "source";

  if (handleType === "source") {
    if (handle.isData) {
      const dataTarget = firstDataHandle(probe, "input");
      if (!dataTarget) {
        return false;
      }
      const execSource = getPrimaryExecutionSourceHandle(handleSource(fromNode)) ?? "success";
      const withExec = [
        ...input.edges,
        helperExecutionEdge({
          source: fromNode.id,
          target: PROBE_ID,
          sourceHandle: execSource,
        }),
      ];
      return validateVisualWorkflowConnection({
        nodes,
        edges: withExec,
        connection: {
          source: fromNode.id,
          target: PROBE_ID,
          sourceHandle: input.from.handleId ?? null,
          targetHandle: dataTarget,
        },
      }).valid;
    }
    return validateVisualWorkflowConnection({
      nodes,
      edges: input.edges,
      connection: {
        source: fromNode.id,
        target: PROBE_ID,
        sourceHandle: input.from.handleId ?? null,
        targetHandle: null,
      },
    }).valid;
  }

  if (handle.isData) {
    const dataSource = firstDataHandle(probe, "output");
    if (!dataSource) {
      return false;
    }
    const execSource = getPrimaryExecutionSourceHandle(handleSource(probe)) ?? "success";
    const withExec = [
      ...input.edges,
      helperExecutionEdge({
        source: PROBE_ID,
        target: fromNode.id,
        sourceHandle: execSource,
      }),
    ];
    return validateVisualWorkflowConnection({
      nodes,
      edges: withExec,
      connection: {
        source: PROBE_ID,
        target: fromNode.id,
        sourceHandle: dataSource,
        targetHandle: input.from.handleId ?? null,
      },
    }).valid;
  }

  return validateVisualWorkflowConnection({
    nodes,
    edges: input.edges,
    connection: {
      source: PROBE_ID,
      target: fromNode.id,
      sourceHandle: getPrimaryExecutionSourceHandle(handleSource(probe)),
      targetHandle: input.from.handleId ?? null,
    },
  }).valid;
}

/** Catalog types that can be spawned from a pin and still form a valid wire. */
export function listCompatibleVisualWorkflowNodeTypes(input: {
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  from: VisualWorkflowCompatibleFrom;
}): VisualCatalogType[] {
  return VISUAL_NODE_CATALOG.filter(
    (item) => item.enabled && canConnectProbe({ ...input, type: item.type }),
  ).map((item) => item.type);
}

/** Catalog types that can sit on an existing wire: they take an input and still have an output. */
export function listSpliceCompatibleVisualWorkflowNodeTypes(): VisualCatalogType[] {
  return VISUAL_NODE_CATALOG.filter((item) => {
    if (!item.enabled || isTriggerType(item.type)) {
      return false;
    }
    const probe = probeNode(item.type);
    return getAllowedExecutionSourceHandles(handleSource(probe)).length > 0;
  }).map((item) => item.type);
}
