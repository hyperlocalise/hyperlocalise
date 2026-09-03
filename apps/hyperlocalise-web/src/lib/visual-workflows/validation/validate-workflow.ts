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
import {
  getVisualWorkflowTriggerNode,
  validateVisualWorkflowTriggerConfig,
} from "../dispatch/trigger-matching";
import { buildVisualWorkflowGraphIndex } from "../runtime/graph-index";
import { findForEachLoopRegion } from "../runtime/loop-region";
import { visualWorkflowDefinitionSchema } from "../schema/definition-schema";
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

function collectSchemaConfigIssues(
  definition: VisualWorkflowDefinition,
): VisualWorkflowValidationIssue[] {
  const parsed = visualWorkflowDefinitionSchema.safeParse(definition);
  if (parsed.success) {
    return [];
  }

  const issues: VisualWorkflowValidationIssue[] = [];
  const seenNodeIds = new Set<string>();

  for (const issue of parsed.error.issues) {
    const nodeIndex =
      issue.path[0] === "nodes" && typeof issue.path[1] === "number" ? issue.path[1] : null;
    const node = nodeIndex !== null ? definition.nodes[nodeIndex] : undefined;
    const nodeId = node?.id;
    if (nodeId && seenNodeIds.has(nodeId)) {
      continue;
    }
    if (nodeId) {
      seenNodeIds.add(nodeId);
    }

    issues.push({
      code: node && isTriggerType(node.type) ? "invalid_trigger_config" : "invalid_node_config",
      nodeId,
    });
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

  const issues = validateVisualWorkflowGraph(nodes, edges);
  const graph = buildVisualWorkflowGraphIndex(definition);
  if (graph) {
    for (const node of definition.nodes) {
      if (node.type !== "logic.for_each") {
        continue;
      }

      const { bodyNodeIds } = findForEachLoopRegion({
        graph,
        forEachNodeId: node.id,
      });
      for (const bodyNodeId of bodyNodeIds) {
        const bodyNode = graph.nodesById.get(bodyNodeId);
        if (bodyNode?.type === "logic.for_each") {
          issues.push({ code: "nested_for_each", nodeId: bodyNodeId });
        }
      }
    }
  }

  issues.push(...collectSchemaConfigIssues(definition));

  const trigger = getVisualWorkflowTriggerNode(definition);
  if (trigger) {
    const triggerValidation = validateVisualWorkflowTriggerConfig(trigger.config);
    const hasTriggerConfigIssue = issues.some(
      (issue) => issue.nodeId === trigger.id && issue.code === "invalid_trigger_config",
    );
    if (!triggerValidation.ok && !hasTriggerConfigIssue) {
      issues.push({ code: "invalid_trigger_config", nodeId: trigger.id });
    }
  }

  return issues;
}

/** @deprecated Use validateVisualWorkflowGraph */
export const validateMockWorkflow = validateVisualWorkflowGraph;
