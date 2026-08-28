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
import type { Edge, Node } from "@xyflow/react";

export const VISUAL_WORKFLOW_SCHEMA_VERSION = 1 as const;

export type VisualCatalogType =
  | "trigger.manual"
  | "action.http"
  | "logic.if"
  | "ai.agent"
  | "logic.for_each";

export type VisualCatalogCategory = "trigger" | "action" | "logic" | "ai" | "flow";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type MockNodeRunStatus = "idle" | "running" | "succeeded" | "failed";

export type VisualNodeConfig =
  | { kind: "trigger.manual" }
  | { kind: "action.http"; method: HttpMethod; url: string }
  | { kind: "logic.if"; condition: string }
  | { kind: "ai.agent"; prompt: string }
  | { kind: "logic.for_each"; collection: string };

export type VisualWorkflowNodeData = {
  catalogType: VisualCatalogType;
  config: VisualNodeConfig;
  runStatus: MockNodeRunStatus;
};

export type VisualWorkflowRfNode = Node<VisualWorkflowNodeData, VisualCatalogType>;
export type VisualWorkflowRfEdge = Edge;

export type CanonicalVisualWorkflowNode = {
  id: string;
  type: VisualCatalogType;
  config: VisualNodeConfig;
};

export type CanonicalVisualWorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
};

export type CanonicalVisualWorkflowDraft = {
  schemaVersion: typeof VISUAL_WORKFLOW_SCHEMA_VERSION;
  name: string;
  nodes: CanonicalVisualWorkflowNode[];
  edges: CanonicalVisualWorkflowEdge[];
  editor: {
    positions: Record<string, { x: number; y: number }>;
  };
};

export type MockValidationIssue = {
  code: "missing_trigger" | "multiple_triggers" | "orphan_node";
  nodeId?: string;
};

export type VisualWorkflowEditorState = {
  name: string;
  nodes: VisualWorkflowRfNode[];
  edges: VisualWorkflowRfEdge[];
};
