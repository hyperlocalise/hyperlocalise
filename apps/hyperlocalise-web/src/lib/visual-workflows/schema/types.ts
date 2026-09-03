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
  | "trigger.scheduled"
  | "trigger.github"
  | "trigger.source_upload"
  | "action.http"
  | "action.notify_slack"
  | "logic.if"
  | "ai.agent"
  | "logic.for_each";

export type VisualCatalogCategory = "trigger" | "action" | "logic" | "ai" | "flow";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type VisualWorkflowScheduleCadence = "hourly" | "daily" | "weekly";

export type VisualWorkflowGithubTriggerEvent = "push" | "pull_request";

export type VisualWorkflowScheduleConfig = {
  cadence: VisualWorkflowScheduleCadence;
  hourUtc?: number;
  dayOfWeek?: number;
  timezone?: string;
};

export type MockNodeRunStatus = "idle" | "running" | "succeeded" | "failed";

export type VisualNodeConfig =
  | { kind: "trigger.manual" }
  | { kind: "trigger.scheduled"; schedule: VisualWorkflowScheduleConfig }
  | {
      kind: "trigger.github";
      githubInstallationRepositoryId: string;
      branches: string[];
      events?: VisualWorkflowGithubTriggerEvent[];
    }
  | { kind: "trigger.source_upload"; projectId?: string }
  | { kind: "action.http"; method: HttpMethod; url: string }
  | { kind: "action.notify_slack"; channelId: string; message: string }
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

export type VisualWorkflowDefinition = {
  schemaVersion: typeof VISUAL_WORKFLOW_SCHEMA_VERSION;
  name: string;
  nodes: CanonicalVisualWorkflowNode[];
  edges: CanonicalVisualWorkflowEdge[];
  editor: {
    positions: Record<string, { x: number; y: number }>;
  };
};

/** @deprecated Use VisualWorkflowDefinition */
export type CanonicalVisualWorkflowDraft = VisualWorkflowDefinition;

export type VisualWorkflowValidationIssue = {
  code:
    | "missing_trigger"
    | "multiple_triggers"
    | "orphan_node"
    | "invalid_edge"
    | "invalid_trigger_config"
    | "invalid_node_config"
    | "nested_for_each";
  nodeId?: string;
  edgeId?: string;
};

/** @deprecated Use VisualWorkflowValidationIssue */
export type MockValidationIssue = VisualWorkflowValidationIssue;

export type VisualWorkflowEditorState = {
  name: string;
  nodes: VisualWorkflowRfNode[];
  edges: VisualWorkflowRfEdge[];
};
