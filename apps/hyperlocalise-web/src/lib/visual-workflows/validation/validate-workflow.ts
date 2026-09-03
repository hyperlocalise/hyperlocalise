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
  VisualWorkflowDefinition,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
  VisualWorkflowValidationIssue,
} from "../schema/types";

export function validateVisualWorkflowGraph(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): VisualWorkflowValidationIssue[] {
  const issues: VisualWorkflowValidationIssue[] = [];
  const nodeIds = new Set(nodes.map((node) => node.id));

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({ code: "invalid_edge", edgeId: edge.id });
    }
  }

  const triggers = nodes.filter((node) => isTriggerType(node.data.catalogType));

  if (triggers.length === 0) {
    issues.push({ code: "missing_trigger" });
  } else if (triggers.length > 1) {
    issues.push({ code: "multiple_triggers" });
  }

  const reachable = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    outgoing.set(node.id, []);
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    outgoing.get(edge.source)?.push(edge.target);
  }

  const queue = triggers.map((node) => node.id);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    for (const next of outgoing.get(current) ?? []) {
      queue.push(next);
    }
  }

  for (const node of nodes) {
    if (isTriggerType(node.data.catalogType)) {
      continue;
    }
    if (!reachable.has(node.id)) {
      issues.push({ code: "orphan_node", nodeId: node.id });
    }
  }

  return issues;
}

export function validateVisualWorkflowDefinition(
  definition: VisualWorkflowDefinition,
): VisualWorkflowValidationIssue[] {
  const nodes: VisualWorkflowRfNode[] = definition.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: definition.editor.positions[node.id] ?? { x: 0, y: 0 },
    data: {
      catalogType: node.type,
      config: node.config,
      runStatus: "idle",
    },
  }));

  const edges: VisualWorkflowRfEdge[] = definition.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  }));

  return validateVisualWorkflowGraph(nodes, edges);
}

/** @deprecated Use validateVisualWorkflowGraph */
export const validateMockWorkflow = validateVisualWorkflowGraph;
