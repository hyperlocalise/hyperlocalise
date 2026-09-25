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
  CanonicalVisualWorkflowNode,
  VisualWorkflowV3Definition,
  VisualWorkflowV3Edge,
  WorkflowBinding,
  VisualWorkflowDefinition,
} from "../schema/types";
import { isTriggerType } from "../catalog/node-catalog";
import { computeForEachBodyNodeIdsFromV3Edges } from "../editor/for-each-body-membership";

export type VisualWorkflowV3CompilationIssue = {
  code:
    | "invalid_edge"
    | "invalid_source_port"
    | "invalid_target_port"
    | "conflicting_data_input"
    | "incompatible_data_types"
    | "execution_cycle";
  edgeId?: string;
  nodeId?: string;
};

export type CompiledVisualWorkflowV3Definition = {
  definition: VisualWorkflowV3Definition;
  executionEdges: Extract<VisualWorkflowV3Edge, { kind: "execution" }>[];
  issues: VisualWorkflowV3CompilationIssue[];
};

function hasDataSourcePort(node: CanonicalVisualWorkflowNode, portId: string): boolean {
  const fields = getWorkflowOutputFields(node);

  return fields.some(
    (field) =>
      field.path === portId ||
      (["unknown", "object", "array"].includes(field.type) && portId.startsWith(`${field.path}.`)),
  );
}

function hasDataTargetPort(node: CanonicalVisualWorkflowNode, portId: string): boolean {
  if (portId === "input") {
    return false;
  }

  if (NODE_CONTRACTS[node.type].inputs.some((field) => field.name === portId)) {
    return true;
  }

  if (node.type === "logic.set") {
    return true;
  }

  return node.type === "action.http" && /^(headers|body)\./.test(portId);
}

function executionSourcePortIds(node: CanonicalVisualWorkflowNode): Set<string> {
  if (node.type === "logic.if") {
    return new Set(["true", "false"]);
  }

  if (node.config.kind === "logic.switch") {
    return new Set(["default", ...node.config.cases.map((caseEntry) => caseEntry.id)]);
  }

  if (node.type === "logic.for_each") {
    return new Set(["each", "done"]);
  }

  const portIds = new Set(["success"]);

  if ("onError" in node.config && node.config.onError === "branch") {
    portIds.add("error");
  }

  return portIds;
}

function hasExecutionCycle(
  definition: VisualWorkflowV3Definition,
  executionEdges: readonly Extract<VisualWorkflowV3Edge, { kind: "execution" }>[],
): boolean {
  const incomingCountByNodeId = new Map(definition.nodes.map((node) => [node.id, 0]));

  const outgoingByNodeId = new Map(
    definition.nodes.map((node) => [
      node.id,
      [] as Extract<VisualWorkflowV3Edge, { kind: "execution" }>[],
    ]),
  );

  for (const edge of executionEdges) {
    outgoingByNodeId.get(edge.source)?.push(edge);

    incomingCountByNodeId.set(edge.target, (incomingCountByNodeId.get(edge.target) ?? 0) + 1);
  }

  const queue = [...incomingCountByNodeId]
    .filter(([, incomingCount]) => incomingCount === 0)
    .map(([nodeId]) => nodeId);

  let visitedNodeCount = 0;

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    visitedNodeCount += 1;

    for (const edge of outgoingByNodeId.get(nodeId) ?? []) {
      const incomingCount = (incomingCountByNodeId.get(edge.target) ?? 0) - 1;

      incomingCountByNodeId.set(edge.target, incomingCount);

      if (incomingCount === 0) {
        queue.push(edge.target);
      }
    }
  }

  return visitedNodeCount !== definition.nodes.length;
}

export function compileVisualWorkflowV3Definition(
  definition: VisualWorkflowV3Definition,
): CompiledVisualWorkflowV3Definition {
  const issues: VisualWorkflowV3CompilationIssue[] = [];

  const nodes = definition.nodes.map((node) => ({
    ...node,
    inputs: node.inputs
      ? {
          ...node.inputs,
        }
      : undefined,
  }));

  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  const executionEdgeCandidates = definition.edges.filter(
    (edge): edge is Extract<VisualWorkflowV3Edge, { kind: "execution" }> =>
      edge.kind === "execution",
  );

  const executionEdges: Extract<VisualWorkflowV3Edge, { kind: "execution" }>[] = [];

  const dataEdges = definition.edges.filter(
    (edge): edge is Extract<VisualWorkflowV3Edge, { kind: "data" }> => edge.kind === "data",
  );

  const dataTargetCounts = new Map<string, number>();

  for (const edge of dataEdges) {
    const targetKey = JSON.stringify([edge.target, edge.targetPortId]);

    dataTargetCounts.set(targetKey, (dataTargetCounts.get(targetKey) ?? 0) + 1);
  }

  for (const edge of executionEdgeCandidates) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);

    if (!source || !target) {
      issues.push({
        code: "invalid_edge",
        edgeId: edge.id,
      });
      continue;
    }

    if (!executionSourcePortIds(source).has(edge.sourcePortId)) {
      issues.push({
        code: "invalid_source_port",
        edgeId: edge.id,
        nodeId: source.id,
      });
      continue;
    }

    if (edge.targetPortId !== "input" || isTriggerType(target.type)) {
      issues.push({
        code: "invalid_target_port",
        edgeId: edge.id,
        nodeId: target.id,
      });
      continue;
    }

    executionEdges.push(edge);
  }

  if (hasExecutionCycle(definition, executionEdges)) {
    issues.push({
      code: "execution_cycle",
    });
  }

  for (const edge of dataEdges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);

    if (!source || !target) {
      issues.push({
        code: "invalid_edge",
        edgeId: edge.id,
      });
      continue;
    }

    if (!hasDataSourcePort(source, edge.sourcePortId)) {
      issues.push({
        code: "invalid_source_port",
        edgeId: edge.id,
        nodeId: source.id,
      });
      continue;
    }

    if (!hasDataTargetPort(target, edge.targetPortId)) {
      issues.push({
        code: "invalid_target_port",
        edgeId: edge.id,
        nodeId: target.id,
      });
      continue;
    }

    const sourceField = getWorkflowOutputFields(source).find(
      (field) => field.path === edge.sourcePortId,
    );

    const targetField = NODE_CONTRACTS[target.type].inputs.find(
      (field) => field.name === edge.targetPortId,
    );

    if (
      sourceField &&
      targetField &&
      sourceField.type !== "unknown" &&
      targetField.type !== "unknown" &&
      sourceField.type !== targetField.type
    ) {
      issues.push({
        code: "incompatible_data_types",
        edgeId: edge.id,
        nodeId: target.id,
      });
      continue;
    }

    const targetKey = JSON.stringify([edge.target, edge.targetPortId]);

    if ((dataTargetCounts.get(targetKey) ?? 0) > 1) {
      issues.push({
        code: "conflicting_data_input",
        edgeId: edge.id,
        nodeId: target.id,
      });
      continue;
    }

    const inputs: Record<string, WorkflowBinding> = {
      ...target.inputs,
    };

    if (Object.hasOwn(inputs, edge.targetPortId)) {
      issues.push({
        code: "conflicting_data_input",
        edgeId: edge.id,
        nodeId: target.id,
      });
      continue;
    }

    inputs[edge.targetPortId] = {
      kind: "reference",
      nodeId: source.id,
      path: edge.sourcePortId.split("."),
    };

    target.inputs = inputs;
  }

  return {
    definition: {
      ...definition,
      nodes,
    },
    executionEdges,
    issues,
  };
}

export function toVisualWorkflowExecutionDefinition(
  compiled: CompiledVisualWorkflowV3Definition,
): VisualWorkflowDefinition {
  return {
    schemaVersion: 2,
    name: compiled.definition.name,
    nodes: compiled.definition.nodes.map((node) =>
      node.type === "logic.for_each"
        ? {
            ...node,
            bodyNodeIds: computeForEachBodyNodeIdsFromV3Edges(node.id, compiled.definition.edges),
          }
        : node,
    ),
    edges: compiled.executionEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourcePortId === "success" ? null : edge.sourcePortId,
      targetHandle: edge.targetPortId === "input" ? null : edge.targetPortId,
    })),
    editor: compiled.definition.editor,
  };
}
