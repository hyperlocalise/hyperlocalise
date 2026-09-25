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
import { getWorkflowOutputFields, NODE_CONTRACTS } from "../catalog/node-contracts";
import type {
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
  WorkflowBinding,
  WorkflowValueType,
} from "../schema/types";

export type VisualWorkflowDataPort = {
  id: string;
  label: string;
  type: WorkflowValueType;
  optional: boolean;
  connectionCount: number;
};

export type VisualWorkflowDataPorts = {
  inputs: VisualWorkflowDataPort[];
  outputs: VisualWorkflowDataPort[];
};

function getInputFields(node: VisualWorkflowRfNode) {
  if (node.data.config.kind !== "logic.set") {
    return NODE_CONTRACTS[node.data.catalogType].inputs;
  }

  return [
    ...new Set([
      ...node.data.config.assignments.map((assignment) => assignment.key),
      ...Object.keys(node.data.inputs ?? {}),
    ]),
  ]
    .filter(Boolean)
    .map((name) => ({
      name,
      type: "unknown" as const,
      required: false,
    }));
}

export function getVisualWorkflowDataPorts({
  node,
  edges,
}: {
  node: VisualWorkflowRfNode;
  edges: readonly VisualWorkflowRfEdge[];
}): VisualWorkflowDataPorts {
  const dataEdges = edges.filter((edge) => edge.data?.kind === "data");

  const inputs = getInputFields(node).map((field) => ({
    id: field.name,
    label: field.name,
    type: field.type,
    optional: field.required !== true,
    connectionCount: dataEdges.filter(
      (edge) => edge.target === node.id && edge.targetHandle === field.name,
    ).length,
  }));

  const outputs = getWorkflowOutputFields({
    id: node.id,
    type: node.data.catalogType,
    config: node.data.config,
    inputs: node.data.inputs,
    outputFields: node.data.outputFields,
  })
    .filter((field) => field.path.trim().length > 0)
    .map((field) => ({
      id: field.path,
      label: field.path,
      type: field.type,
      optional: field.optional === true,
      connectionCount: dataEdges.filter(
        (edge) => edge.source === node.id && edge.sourceHandle === field.path,
      ).length,
    }));

  return { inputs, outputs };
}

export function getVisualWorkflowDataEdgeBinding({
  nodeId,
  portId,
  edges,
}: {
  nodeId: string;
  portId: string;
  edges: readonly VisualWorkflowRfEdge[];
}): Extract<WorkflowBinding, { kind: "reference" }> | undefined {
  const edge = edges.find(
    (candidate) =>
      candidate.data?.kind === "data" &&
      candidate.target === nodeId &&
      candidate.targetHandle === portId &&
      candidate.sourceHandle,
  );

  if (!edge?.sourceHandle) {
    return undefined;
  }

  return {
    kind: "reference",
    nodeId: edge.source,
    path: edge.sourceHandle
      .split(".")
      .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment)),
  };
}
