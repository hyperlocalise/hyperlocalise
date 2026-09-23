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
import type { CanonicalVisualWorkflowNode, VisualCatalogType } from "../schema/types";

const EXTERNAL_TYPES: ReadonlySet<VisualCatalogType> = new Set([
  "action.http",
  "action.notify_slack",
  "action.notify_email",
  "ai.agent",
]);

export function isExternalVisualWorkflowNode(type: VisualCatalogType): boolean {
  return EXTERNAL_TYPES.has(type);
}

export function isSafeIdempotentHttpNode(node: CanonicalVisualWorkflowNode): boolean {
  if (node.type !== "action.http" || node.config.kind !== "action.http") {
    return false;
  }
  return node.config.method === "GET" || Boolean(node.config.idempotencyHeader);
}

/** Outbound Idempotency-Key for durable HTTP; stable across retry attempts when a header is configured. */
export function buildVisualWorkflowNodeIdempotencyKey(input: {
  runId: string;
  nodeId: string;
  iteration?: number;
  inRetryBody: boolean;
  node: CanonicalVisualWorkflowNode;
}): string {
  const httpWithHeader =
    input.node.type === "action.http" &&
    input.node.config.kind === "action.http" &&
    Boolean(input.node.config.idempotencyHeader);
  if (input.inRetryBody && httpWithHeader) {
    return `${input.runId}/${input.nodeId}`;
  }
  return `${input.runId}/${input.nodeId}/${input.iteration ?? -1}`;
}

export function retryBodyRequiresDuplicateAcknowledgement(
  nodes: readonly CanonicalVisualWorkflowNode[],
  bodyNodeIds: readonly string[],
): boolean {
  const body = new Set(bodyNodeIds);
  for (const node of nodes) {
    if (!body.has(node.id)) {
      continue;
    }
    if (!isExternalVisualWorkflowNode(node.type)) {
      continue;
    }
    if (node.type === "action.http" && isSafeIdempotentHttpNode(node)) {
      continue;
    }
    return true;
  }
  return false;
}

export function findRetryNodeForBodyNodeId(
  definition: { nodes: readonly CanonicalVisualWorkflowNode[] },
  bodyNodeId: string,
): CanonicalVisualWorkflowNode | null {
  for (const node of definition.nodes) {
    if (node.type !== "logic.retry") {
      continue;
    }
    if ((node.bodyNodeIds ?? []).includes(bodyNodeId)) {
      return node;
    }
  }
  return null;
}

export function collectRetryBodyNodeIds(definition: {
  nodes: readonly CanonicalVisualWorkflowNode[];
}): Set<string> {
  const ids = new Set<string>();
  for (const node of definition.nodes) {
    if (node.type !== "logic.retry") {
      continue;
    }
    for (const bodyId of node.bodyNodeIds ?? []) {
      ids.add(bodyId);
    }
  }
  return ids;
}

/**
 * Whether a persisted node run may short-circuit execution in a durable slice.
 *
 * `logic.retry` clears body outputs and re-runs the region on each attempt. After a
 * durable `retry_backoff` wake, earlier succeeded/handled_error body runs must not
 * be reused — otherwise side effects never re-fire and handled_error nodes never
 * actually retry across the durable boundary.
 *
 * Same-attempt resumes (mid-body `yield_execution`) keep short-circuiting so a
 * completed body node is not duplicated within one attempt.
 */
export function shouldReuseCompletedNodeRun(input: {
  nodeId: string;
  attempt: number;
  retryBodyNodeIds: ReadonlySet<string>;
  resumeAttempt: number | null;
}): boolean {
  if (
    input.resumeAttempt != null &&
    input.retryBodyNodeIds.has(input.nodeId) &&
    input.attempt < input.resumeAttempt
  ) {
    return false;
  }
  return true;
}
