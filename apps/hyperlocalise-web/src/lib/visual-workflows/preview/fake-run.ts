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
  MockNodeRunStatus,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "../schema/types";

export function nodeFailsInFakeRun(node: VisualWorkflowRfNode): boolean {
  const { config } = node.data;
  if (config.kind === "action.http") {
    return config.url.trim().length === 0;
  }
  if (config.kind === "logic.if") {
    return config.condition.trim().length === 0;
  }
  return false;
}

export function orderNodesForFakeRun(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): string[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of nodes) {
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = nodes
    .filter((node) => isTriggerType(node.data.catalogType) || (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);

  const seen = new Set<string>();
  const ordered: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);
    ordered.push(current);
    for (const next of outgoing.get(current) ?? []) {
      if (!seen.has(next)) {
        queue.push(next);
      }
    }
  }

  for (const node of nodes) {
    if (!seen.has(node.id)) {
      ordered.push(node.id);
    }
  }

  return ordered;
}

export async function runFakeWorkflow(options: {
  nodes: readonly VisualWorkflowRfNode[];
  edges: readonly VisualWorkflowRfEdge[];
  delayMs?: number;
  signal?: AbortSignal;
  onStatus: (nodeId: string, status: MockNodeRunStatus) => void;
}): Promise<"completed" | "aborted"> {
  const delayMs = options.delayMs ?? 550;
  const ordered = orderNodesForFakeRun(options.nodes, options.edges);
  const byId = new Map(options.nodes.map((node) => [node.id, node]));

  for (const nodeId of ordered) {
    if (options.signal?.aborted) {
      return "aborted";
    }
    const node = byId.get(nodeId);
    if (!node) {
      continue;
    }
    options.onStatus(nodeId, "running");
    await sleep(delayMs, options.signal);
    if (options.signal?.aborted) {
      options.onStatus(nodeId, "idle");
      return "aborted";
    }
    options.onStatus(nodeId, nodeFailsInFakeRun(node) ? "failed" : "succeeded");
  }

  return "completed";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
