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
import { isTriggerType } from "./node-catalog";
import type { MockValidationIssue, VisualWorkflowRfEdge, VisualWorkflowRfNode } from "./types";

export function validateMockWorkflow(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): MockValidationIssue[] {
  const issues: MockValidationIssue[] = [];
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
