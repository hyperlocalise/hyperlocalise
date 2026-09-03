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
import { createDefaultConfig, getVisualNodeDimensions } from "../catalog/node-catalog";
import type {
  VisualCatalogType,
  VisualWorkflowDefinition,
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

export function toVisualWorkflowDefinition(
  state: VisualWorkflowEditorState,
): VisualWorkflowDefinition {
  const positions: VisualWorkflowDefinition["editor"]["positions"] = {};

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

/** @deprecated Use toVisualWorkflowDefinition */
export const toCanonicalDraft = toVisualWorkflowDefinition;

export function fromVisualWorkflowDefinition(
  definition: VisualWorkflowDefinition,
): VisualWorkflowEditorState {
  const nodes: VisualWorkflowRfNode[] = definition.nodes.map((node) => {
    const type = ENABLED_TYPES.has(node.type) ? node.type : "action.http";
    const position = definition.editor.positions[node.id] ?? { x: 80, y: 160 };
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

  const edges: VisualWorkflowRfEdge[] = definition.edges.map((edge) => ({
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
    name: definition.name,
    nodes,
    edges,
  };
}

/** @deprecated Use fromVisualWorkflowDefinition */
export const fromCanonicalDraft = fromVisualWorkflowDefinition;

export function createEmptyVisualWorkflowDefinition(
  name = "Untitled workflow",
): VisualWorkflowDefinition {
  const triggerId = "trigger";
  return {
    schemaVersion: VISUAL_WORKFLOW_SCHEMA_VERSION,
    name,
    nodes: [
      {
        id: triggerId,
        type: "trigger.manual",
        config: { kind: "trigger.manual" },
      },
    ],
    edges: [],
    editor: {
      positions: {
        [triggerId]: { x: 40, y: 160 },
      },
    },
  };
}
