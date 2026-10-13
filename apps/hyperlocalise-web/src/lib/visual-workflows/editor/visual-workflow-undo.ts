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
import type { UndoOrigin, UndoStackOptions } from "@/lib/undo-stack/undo-stack";

import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "../schema/types";

/** What the visual editor's undo stack holds: everything the workflow saves. */
export type VisualWorkflowGraph = {
  name: string;
  nodes: VisualWorkflowRfNode[];
  edges: VisualWorkflowRfEdge[];
};

export type VisualWorkflowGraphChangeKind =
  | "add"
  | "remove"
  | "connect"
  | "disconnect"
  | "move"
  | "configure"
  | "retype"
  | "rename"
  /** Several things at once, such as nodes added and removed in one go. */
  | "edit";

/** What one undo step changed on the graph, as the editor names it. */
export type VisualWorkflowGraphChange = {
  kind: VisualWorkflowGraphChangeKind;
  nodeIds: string[];
  /** Set when a burst of the same change should merge into one step: typing, nudging a node. */
  coalesceKey?: string;
};

/** JSON with the keys of every object in order, so two equal graphs print the same. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.keys(entry as Record<string, unknown>)
          .sort()
          .map((key) => [key, (entry as Record<string, unknown>)[key]]),
      );
    }
    return entry;
  });
}

/**
 * What of a node a step compares: its place and what it saves. The run markers a test run
 * writes and React Flow's own flags (selected, dragging, measured) are not part of the graph.
 */
function nodeSettings(node: VisualWorkflowRfNode): string {
  const {
    runStatus: _runStatus,
    lastInput: _in,
    lastOutput: _out,
    lastError: _err,
    ...data
  } = node.data;
  return stable({ type: node.type, width: node.width, height: node.height, data });
}

/**
 * What a person sets on a step: its type, configuration, inputs and declared outputs. Not what
 * follows from its connections, such as a loop's body steps, nor what a test run leaves.
 */
export function visualWorkflowStepSettings(node: VisualWorkflowRfNode): string {
  const { catalogType, config, inputs, outputFields, collect } = node.data;
  return stable({ catalogType, config, inputs, outputFields, collect });
}

function nodePosition(node: VisualWorkflowRfNode): string {
  return `${node.position.x},${node.position.y}`;
}

function edgeKey(edge: VisualWorkflowRfEdge): string {
  return stable({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    kind: edge.data?.kind ?? "execution",
  });
}

function nodesById(nodes: readonly VisualWorkflowRfNode[]): Map<string, VisualWorkflowRfNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

export function isVisualWorkflowGraphEqual(
  a: VisualWorkflowGraph,
  b: VisualWorkflowGraph,
): boolean {
  if (a === b) {
    return true;
  }
  if (a.name !== b.name || a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) {
    return false;
  }
  const before = nodesById(a.nodes);
  for (const node of b.nodes) {
    const other = before.get(node.id);
    if (
      !other ||
      nodePosition(other) !== nodePosition(node) ||
      nodeSettings(other) !== nodeSettings(node)
    ) {
      return false;
    }
  }
  const edges = new Set(a.edges.map(edgeKey));
  return b.edges.every((edge) => edges.has(edgeKey(edge)));
}

/**
 * Names a change from what differs. Nodes come before edges, since adding or removing a node
 * brings its edges with it; a change to one node merges with the next change to the same node
 * (typing in its settings, nudging it with the keyboard) within the stack's window.
 */
export function describeVisualWorkflowGraphChange(
  before: VisualWorkflowGraph,
  after: VisualWorkflowGraph,
): VisualWorkflowGraphChange {
  const previous = nodesById(before.nodes);
  const next = nodesById(after.nodes);
  const added = after.nodes.filter((node) => !previous.has(node.id)).map((node) => node.id);
  const removed = before.nodes.filter((node) => !next.has(node.id)).map((node) => node.id);

  if (added.length > 0 || removed.length > 0) {
    if (added.length > 0 && removed.length > 0) {
      return { kind: "edit", nodeIds: [...added, ...removed] };
    }
    return added.length > 0
      ? { kind: "add", nodeIds: added }
      : { kind: "remove", nodeIds: removed };
  }

  const moved: string[] = [];
  const configured: string[] = [];
  const retyped: string[] = [];
  for (const node of after.nodes) {
    const other = previous.get(node.id)!;
    if (other.type !== node.type) {
      retyped.push(node.id);
    } else if (nodeSettings(other) !== nodeSettings(node)) {
      configured.push(node.id);
    } else if (nodePosition(other) !== nodePosition(node)) {
      moved.push(node.id);
    }
  }
  const changedNodes = [...retyped, ...configured, ...moved];

  const previousEdges = new Set(before.edges.map(edgeKey));
  const nextEdges = new Set(after.edges.map(edgeKey));
  const connected = after.edges.some((edge) => !previousEdges.has(edgeKey(edge)));
  const disconnected = before.edges.some((edge) => !nextEdges.has(edgeKey(edge)));
  const renamed = before.name !== after.name;

  if (connected || disconnected) {
    if (changedNodes.length > 0 || renamed) {
      return { kind: "edit", nodeIds: changedNodes };
    }
    return { kind: connected ? "connect" : "disconnect", nodeIds: [] };
  }
  if (changedNodes.length === 0) {
    return renamed
      ? { kind: "rename", nodeIds: [], coalesceKey: "rename" }
      : { kind: "edit", nodeIds: [] };
  }
  if (renamed) {
    return { kind: "edit", nodeIds: changedNodes };
  }
  if (retyped.length === 1 && changedNodes.length === 1) {
    return { kind: "retype", nodeIds: retyped };
  }
  if (configured.length === 1 && changedNodes.length === 1) {
    return { kind: "configure", nodeIds: configured, coalesceKey: `configure:${configured[0]}` };
  }
  if (moved.length === changedNodes.length) {
    return { kind: "move", nodeIds: moved, coalesceKey: `move:${moved.join(",")}` };
  }
  return { kind: "edit", nodeIds: changedNodes };
}

/**
 * Whether undoing or redoing a step shows nowhere on the page: a change to the settings or the
 * type of a step whose settings panel is not the open one, or a step of the assistant, which
 * may hold many changes.
 */
export function isVisualWorkflowUndoStepOutOfSight(
  step: { origin: UndoOrigin; description: VisualWorkflowGraphChange },
  openNodeId: string | null,
): boolean {
  if (step.origin === "assistant") {
    return true;
  }
  const { kind, nodeIds } = step.description;
  if (kind !== "configure" && kind !== "retype") {
    return false;
  }
  return openNodeId === null || !nodeIds.includes(openNodeId);
}

export const visualWorkflowUndoStackOptions: UndoStackOptions<
  VisualWorkflowGraph,
  VisualWorkflowGraphChange
> = {
  isEqual: isVisualWorkflowGraphEqual,
  describe: describeVisualWorkflowGraphChange,
  coalesceKeyOf: (change) => change.coalesceKey,
};
