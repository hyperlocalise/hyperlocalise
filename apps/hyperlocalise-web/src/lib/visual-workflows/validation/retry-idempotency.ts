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
  "action.content_sync",
  "action.notify_slack",
  "action.notify_email",
  "action.machine_translate",
  "action.create_task",
  "action.run_qa",
  "action.update_job",
  "action.crowdin_pre_translate",
  "action.crowdin_create_task",
  "ai.agent",
]);

/**
 * Actions that may run again with the same idempotency key without a duplicate effect: they only
 * read, set the same values again, or find the job an earlier attempt created under that key.
 * `action.run_qa` is not here: each call claims a new scan and sends notifications.
 */
const REPEATABLE_ACTION_TYPES: ReadonlySet<VisualCatalogType> = new Set([
  "action.machine_translate",
  "action.create_task",
  "action.check_progress",
  "action.list_source_files",
  "action.update_job",
  "action.pick_assignee",
  "action.crowdin_check_progress",
]);

export function isExternalVisualWorkflowNode(type: VisualCatalogType): boolean {
  return EXTERNAL_TYPES.has(type);
}

export function isRepeatableVisualWorkflowAction(type: VisualCatalogType): boolean {
  return REPEATABLE_ACTION_TYPES.has(type);
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

export function collectRetryBodyNodeIdsForRetryNode(
  definition: { nodes: readonly CanonicalVisualWorkflowNode[] },
  retryNodeId: string,
): Set<string> {
  const retryNode = definition.nodes.find((node) => node.id === retryNodeId);
  if (!retryNode || retryNode.type !== "logic.retry") {
    return new Set();
  }
  return new Set(retryNode.bodyNodeIds ?? []);
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
  /** Interpreter iteration for retry-body nodes is the enclosing retry attempt (not the node-run attempt counter). */
  retryRegionAttempt: number;
  resumedRetryBodyNodeIds: ReadonlySet<string>;
  resumeAttempt: number | null;
}): boolean {
  if (
    input.resumeAttempt != null &&
    input.resumedRetryBodyNodeIds.has(input.nodeId) &&
    input.retryRegionAttempt < input.resumeAttempt
  ) {
    return false;
  }
  return true;
}
