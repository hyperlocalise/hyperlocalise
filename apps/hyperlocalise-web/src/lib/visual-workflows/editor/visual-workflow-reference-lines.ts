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
import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "../schema/types";
import { getVisualWorkflowDataPorts } from "./visual-workflow-data-ports";
import { splitTemplate } from "./visual-workflow-upstream-fields";

/** A field read inside a setting's text, drawn from the output it reads to the setting's port. */
export type VisualWorkflowReferenceLine = {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
};

/** The longest start of a path that is one of the step's output ports. */
function outputPortFor(path: readonly string[], outputIds: ReadonlySet<string>): string | null {
  for (let length = path.length; length > 0; length -= 1) {
    const id = path.slice(0, length).join(".");
    if (outputIds.has(id)) return id;
  }
  return null;
}

/**
 * A line for every field of an earlier step that a setting's text reads, one per source port and
 * setting. A setting fed by a wire or a stored binding gets none, since the run ignores its text;
 * a field whose step is gone, or that sits under no output port, gets none either.
 */
export function listVisualWorkflowReferenceLines(
  nodes: readonly VisualWorkflowRfNode[],
  edges: readonly VisualWorkflowRfEdge[],
): VisualWorkflowReferenceLine[] {
  const outputIds = new Map(
    nodes.map((node) => [
      node.id,
      new Set(getVisualWorkflowDataPorts({ node, edges: [] }).outputs.map((port) => port.id)),
    ]),
  );
  const triggerId = nodes.find((node) => isTriggerType(node.data.catalogType))?.id;
  const lines = new Map<string, VisualWorkflowReferenceLine>();

  for (const node of nodes) {
    const config = node.data.config as Record<string, unknown>;
    for (const port of getVisualWorkflowDataPorts({ node, edges }).inputs) {
      const text = config[port.id];
      if (typeof text !== "string" || port.connectionCount > 0 || node.data.inputs?.[port.id]) {
        continue;
      }
      for (const segment of splitTemplate(text)) {
        if (segment.kind !== "reference") continue;
        const source = segment.trigger ? triggerId : segment.nodeId;
        const ports = source ? outputIds.get(source) : undefined;
        const sourceHandle = ports ? outputPortFor(segment.path, ports) : null;
        if (!source || !sourceHandle || source === node.id) continue;
        const id = `reference:${source}:${sourceHandle}->${node.id}:${port.id}`;
        lines.set(id, { id, source, sourceHandle, target: node.id, targetHandle: port.id });
      }
    }
  }
  return [...lines.values()];
}
