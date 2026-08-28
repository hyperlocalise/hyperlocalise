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
import { createDefaultConfig, getVisualNodeDimensions } from "./node-catalog";
import type {
  CanonicalVisualWorkflowDraft,
  VisualCatalogType,
  VisualWorkflowEditorState,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
} from "./types";
import { VISUAL_WORKFLOW_SCHEMA_VERSION } from "./types";

const ENABLED_TYPES = new Set<VisualCatalogType>([
  "trigger.manual",
  "action.http",
  "logic.if",
  "ai.agent",
  "logic.for_each",
]);

export function toCanonicalDraft(state: VisualWorkflowEditorState): CanonicalVisualWorkflowDraft {
  const positions: CanonicalVisualWorkflowDraft["editor"]["positions"] = {};

  for (const node of state.nodes) {
    positions[node.id] = { x: node.position.x, y: node.position.y };
  }

  return {
    schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
    name: state.name,
    nodes: state.nodes.map((node) => ({
      id: node.id,
      type: node.data.catalogType,
      config: node.data.config,
    })),
    edges: state.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    })),
    editor: { positions },
  };
}

export function fromCanonicalDraft(draft: CanonicalVisualWorkflowDraft): VisualWorkflowEditorState {
  const nodes: VisualWorkflowRfNode[] = draft.nodes.map((node) => {
    const type = ENABLED_TYPES.has(node.type) ? node.type : "action.http";
    const position = draft.editor.positions[node.id] ?? { x: 80, y: 160 };
    const config = node.config.kind === type ? node.config : createDefaultConfig(type);

    const dimensions = getVisualNodeDimensions(type);
    return {
      id: node.id,
      type,
      position,
      ...dimensions,
      data: {
        catalogType: type,
        config,
        runStatus: "idle",
      },
    };
  });

  const edges: VisualWorkflowRfEdge[] = draft.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle:
      edge.sourceHandle === "true" || edge.sourceHandle === "false" ? edge.sourceHandle : null,
    targetHandle: null,
    label:
      edge.sourceHandle === "true" || edge.sourceHandle === "false" ? edge.sourceHandle : undefined,
  }));

  return {
    name: draft.name,
    nodes,
    edges,
  };
}
