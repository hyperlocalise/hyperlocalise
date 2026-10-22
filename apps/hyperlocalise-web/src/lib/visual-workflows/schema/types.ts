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

import type { EmailProviderSlug } from "@/lib/email/constants";

export const VISUAL_WORKFLOW_SCHEMA_VERSION = 2 as const;
export const VISUAL_WORKFLOW_SCHEMA_V3_VERSION = 3 as const;

export type VisualCatalogType =
  | "trigger.manual"
  | "trigger.scheduled"
  | "trigger.github"
  | "trigger.source_upload"
  | "trigger.webhook"
  | "action.http"
  | "action.content_sync"
  | "action.notify_slack"
  | "action.notify_email"
  | "action.machine_translate"
  | "action.create_task"
  | "action.check_progress"
  | "action.run_qa"
  | "action.list_source_files"
  | "action.update_job"
  | "action.pick_assignee"
  | "action.crowdin_pre_translate"
  | "action.crowdin_create_task"
  | "action.crowdin_check_progress"
  | "logic.if"
  | "logic.switch"
  | "logic.set"
  | "logic.create_object"
  | "logic.merge_objects"
  | "logic.select_path"
  | "ai.agent"
  | "logic.for_each"
  | "logic.retry"
  | "flow.wait"
  | "flow.stop"
  | "flow.return"
  | "flow.fail"
  | "logic.merge"
  | "logic.sequence"
  | "logic.try_catch"
  | "flow.call_workflow";

export type VisualCatalogCategory = "trigger" | "action" | "localization" | "logic" | "ai" | "flow";

/** Who works on a human task: translating from scratch, post-editing a draft, or proofreading. */
export type VisualTaskStep = "translate" | "edit" | "proofread";

export type VisualCrowdinTaskType = "translate" | "proofread";

/**
 * How Pick assignee chooses among the people of the matched rule: the first one listed, each in
 * turn across runs, or whoever has the fewest open jobs.
 */
export type VisualAssignmentStrategy = "first" | "round_robin" | "least_busy";

export type VisualAssigneeSource = "workspace" | "crowdin";

/** One row of Pick assignee's rule table. An empty condition matches any value. */
export type VisualAssignmentRule = {
  id: string;
  name: string;
  /** Comma-separated locales; a language alone ("fr") also matches its regions ("fr-CA"). */
  locales: string;
  jobTypes: VisualTaskStep[];
  minSize?: number;
  maxSize?: number;
  /** Matches work due within this many hours from the run, or already overdue. */
  dueWithinHours?: number;
  /** WorkOS ids of workspace members, or Crowdin user ids when the step routes to Crowdin people. */
  assigneeIds: string[];
};

/** Pre-translates with translation memory, a machine translation engine, or an AI prompt. */
export type VisualCrowdinPreTranslateMethod = "tm" | "mt" | "ai";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HttpBodyType = "none" | "json" | "text";

export type HttpAuthType = "none" | "bearer" | "api_key";

export type VisualNodeErrorBehavior = "stop" | "continue" | "branch";

export type VisualKeyValuePair = {
  key: string;
  value: string;
};

export type VisualWorkflowScheduleCadence = "hourly" | "daily" | "weekly";

export type VisualWorkflowGithubTriggerEvent = "push" | "pull_request";

export type VisualWorkflowScheduleConfig = {
  cadence: VisualWorkflowScheduleCadence;
  hourUtc?: number;
  dayOfWeek?: number;
  timezone?: string;
};

export type MockNodeRunStatus =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "blocked"
  | "cancelled"
  | "handled_error"
  | "needs_attention";
export type WorkflowValueType = "string" | "number" | "boolean" | "object" | "array" | "unknown";
export type VisualSelectPathSegment = string | number;
export type VisualSelectPathMissingBehavior = "error" | "optional" | "default";
export type WorkflowBinding = (
  | { kind: "literal"; value: unknown }
  | { kind: "reference"; nodeId: string; path: (string | number)[] }
  | { kind: "template"; template: string }
  | { kind: "secret"; credentialId: string }
) & { optional?: boolean; fallback?: unknown };
export type WorkflowOutputField = { path: string; type: WorkflowValueType; optional?: boolean };
export type WorkflowNodeContract = {
  inputs?: Record<string, WorkflowBinding>;
  outputFields?: WorkflowOutputField[];
  bodyNodeIds?: string[];
  collect?: Record<string, WorkflowBinding>;
};

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
  | {
      kind: "trigger.webhook";
      /** Part of the signed webhook token; raising it invalidates every URL handed out before. */
      tokenVersion: number;
    }
  | {
      kind: "action.http";
      method: HttpMethod;
      idempotencyHeader?: string;
      url: string;
      headers?: VisualKeyValuePair[];
      queryParams?: VisualKeyValuePair[];
      body?: string;
      bodyType?: HttpBodyType;
      auth?: {
        type: HttpAuthType;
        token?: string;
        credentialId?: string;
        headerName?: string;
      };
      parseJsonBody?: boolean;
      failOnHttpError?: boolean;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.content_sync";
      projectId: string;
      provider: "github" | "gitlab" | "contentful" | "intercom";
      connectionId: string;
      resourceKey: string;
      providerFolder: string;
      projectFolder: string;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.notify_slack";
      channelId: string;
      message: string;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.notify_email";
      provider: EmailProviderSlug;
      workosUserId?: string;
      from: string;
      recipients: string;
      subject: string;
      message: string;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.machine_translate";
      projectId: string;
      sourceFileId: string;
      /** Comma-separated locales; empty means every target locale of the project. */
      targetLocales: string;
      useTranslationMemory?: boolean;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.create_task";
      projectId: string;
      sourceFileId: string;
      /** Comma-separated locales; empty means every target locale of the project. */
      targetLocales: string;
      step: VisualTaskStep;
      assigneeWorkosUserId: string;
      title: string;
      /** ISO date or a template; empty means no due date. */
      dueAt?: string;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.check_progress";
      projectId: string;
      /** Limits the counts to the strings of one source file; empty counts the whole project. */
      sourceFileId: string;
      /** Comma-separated locales; empty means every target locale of the project. */
      targetLocales: string;
      /** A job whose status is reported alongside the counts. */
      jobId: string;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.run_qa";
      projectId: string;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.list_source_files";
      projectId: string;
      /** Keeps only files whose path starts with this; empty lists every source file. */
      pathPrefix: string;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.update_job";
      jobId: string;
      /** Empty leaves the owner unchanged. */
      assigneeWorkosUserId: string;
      /** Empty leaves the title unchanged. */
      title: string;
      /** Empty leaves the due date unchanged. */
      dueAt?: string;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.pick_assignee";
      /** The work being routed, usually wired from earlier steps. */
      locale: string;
      jobType: string;
      size: string;
      dueAt: string;
      /** Checked top to bottom; the first rule whose conditions all hold supplies the people. */
      rules: VisualAssignmentRule[];
      /** The people when no rule matches; empty fails the step. */
      fallbackAssigneeIds: string[];
      strategy: VisualAssignmentStrategy;
      /** Whose ids the rules list: workspace members (the default) or Crowdin project members. */
      peopleSource?: VisualAssigneeSource;
      crowdinProjectId?: string;
      /** Whose Crowdin connection the step uses; set by the server when the workflow is saved. */
      workosUserId?: string;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.crowdin_pre_translate";
      crowdinProjectId: string;
      /** Comma-separated Crowdin file ids. */
      fileIds: string;
      /** Comma-separated Crowdin language ids; empty means every target language of the project. */
      languageIds: string;
      method: VisualCrowdinPreTranslateMethod;
      /** The machine translation engine, when the method is mt. */
      engineId: string;
      /** The AI prompt, when the method is ai. */
      aiPromptId: string;
      /** Whose Crowdin connection the step uses; set by the server when the workflow is saved. */
      workosUserId?: string;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.crowdin_create_task";
      crowdinProjectId: string;
      /** Comma-separated Crowdin file ids. */
      fileIds: string;
      /** Comma-separated Crowdin language ids; empty means every target language of the project. */
      languageIds: string;
      taskType: VisualCrowdinTaskType;
      /** Comma-separated Crowdin user ids. */
      assigneeIds: string;
      title: string;
      description: string;
      /** ISO date or a template; empty means no due date. */
      dueAt?: string;
      /** Whose Crowdin connection the step uses; set by the server when the workflow is saved. */
      workosUserId?: string;
      onError?: VisualNodeErrorBehavior;
    }
  | {
      kind: "action.crowdin_check_progress";
      crowdinProjectId: string;
      /** Comma-separated Crowdin file ids; empty checks the whole project. */
      fileIds: string;
      /** Comma-separated Crowdin language ids; empty means every target language of the project. */
      languageIds: string;
      /** Comma-separated Crowdin task ids whose status is reported alongside the progress. */
      taskIds: string;
      /** A pre-translation whose status is reported alongside the progress. */
      preTranslationId: string;
      /** Whose Crowdin connection the step uses; set by the server when the workflow is saved. */
      workosUserId?: string;
      onError?: VisualNodeErrorBehavior;
    }
  | { kind: "logic.if"; condition: string }
  | {
      kind: "logic.switch";
      expression: string;
      cases: { id: string; value: string }[];
    }
  | {
      kind: "logic.set";
      assignments: VisualKeyValuePair[];
    }
  | {
      kind: "logic.create_object";
      fields: VisualObjectField[];
    }
  | {
      kind: "logic.merge_objects";
      inputs: VisualObjectMergeInput[];
      conflictPolicy: VisualObjectConflictPolicy;
    }
  | {
      kind: "logic.select_path";
      path: VisualSelectPathSegment[];
      outputType: WorkflowValueType;
      missingBehavior: VisualSelectPathMissingBehavior;
      defaultValue?: unknown;
    }
  | { kind: "ai.agent"; prompt: string; onError?: VisualNodeErrorBehavior }
  | { kind: "logic.for_each"; collection: string }
  | {
      kind: "logic.retry";
      maxAttempts?: number;
      initialDelayMs?: number;
      backoffMultiplier?: number;
      jitter?: boolean;
      retryableErrorCodes?: string[];
      acknowledgeDuplicateRisk?: boolean;
    }
  | {
      kind: "flow.wait";
      mode: "duration" | "timestamp" | "condition";
      durationMs?: number;
      timestamp?: string;
      condition?: string;
      pollingIntervalMs?: number;
      timeoutMs?: number;
    }
  | {
      kind: "flow.stop";
      outcome: "completed" | "cancelled";
      reason?: string;
    }
  | {
      kind: "flow.return";
      outputs: VisualReturnOutput[];
    }
  | {
      kind: "flow.fail";
      errorCode: string;
      message: string;
    }
  | {
      kind: "logic.merge";
      mode: VisualMergeMode;
      inputs: VisualMergeInput[];
      timeoutMs?: number;
    }
  | {
      kind: "logic.sequence";
      outputs: VisualSequenceOutput[];
    }
  | { kind: "logic.try_catch" }
  | {
      kind: "flow.call_workflow";
      workflowId: string;
      version: number;
      inputFields: VisualSubworkflowField[];
      outputFields: VisualSubworkflowField[];
      onError?: VisualNodeErrorBehavior;
    };

export type VisualWorkflowNodeData = WorkflowNodeContract & {
  catalogType: VisualCatalogType;
  config: VisualNodeConfig;
  runStatus: MockNodeRunStatus;
  lastInput?: Record<string, unknown> | null;
  lastOutput?: Record<string, unknown> | null;
  lastError?: Record<string, unknown> | null;
  previewSubtitle?: string;
  hideAddAction?: boolean;
};

export type VisualWorkflowRfNode = Node<VisualWorkflowNodeData, VisualCatalogType>;
export type VisualWorkflowRfEdgeData = {
  kind?: "execution" | "data";
};

export type VisualWorkflowRfEdge = Edge<VisualWorkflowRfEdgeData>;

/**
 * An edge as the canvas draws it: a stored edge, or a `reference` line for a field read inside a
 * setting's text, which is only ever drawn and never stored with the workflow.
 */
export type VisualWorkflowCanvasEdge = Edge<{ kind?: "execution" | "data" | "reference" }>;

export type CanonicalVisualWorkflowNode = WorkflowNodeContract & {
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

type VisualWorkflowV3EdgeBase = {
  id: string;
  source: string;
  target: string;
  sourcePortId: string;
  targetPortId: string;
};

export type VisualWorkflowV3Edge =
  | (VisualWorkflowV3EdgeBase & { kind: "execution" })
  | (VisualWorkflowV3EdgeBase & { kind: "data" });

export type VisualWorkflowDefinition = {
  schemaVersion: typeof VISUAL_WORKFLOW_SCHEMA_VERSION;
  name: string;
  nodes: CanonicalVisualWorkflowNode[];
  edges: CanonicalVisualWorkflowEdge[];
  editor: {
    positions: Record<string, { x: number; y: number }>;
  };
};

export type VisualWorkflowV3Definition = Omit<
  VisualWorkflowDefinition,
  "schemaVersion" | "edges"
> & {
  schemaVersion: typeof VISUAL_WORKFLOW_SCHEMA_V3_VERSION;
  edges: VisualWorkflowV3Edge[];
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
    | "nested_for_each"
    | "nested_retry"
    | "invalid_retry"
    | "retry_foreach_nesting"
    | "non_idempotent_retry"
    | "invalid_retry_policy"
    | "duplicate_id"
    | "cycle"
    | "invalid_handle"
    | "invalid_binding"
    | "invalid_loop"
    | "invalid_try_catch_region"
    | "overlapping_try_catch_region"
    | "subworkflow_not_found"
    | "subworkflow_version_not_found"
    | "subworkflow_contract_mismatch"
    | "recursive_subworkflow"
    | "subworkflow_depth_exceeded";
  nodeId?: string;
  edgeId?: string;
  /** The setting or input of the step that is at fault, by its key, when the issue is about one. */
  field?: string;
  reason?: VisualWorkflowIssueReason;
};

/** What is wrong with a step, where the issue's code alone does not say. */
export type VisualWorkflowIssueReason = "required" | "invalid" | "literal_credential";

/** @deprecated Use VisualWorkflowValidationIssue */
export type MockValidationIssue = VisualWorkflowValidationIssue;

export type VisualWorkflowEditorState = {
  name: string;
  nodes: VisualWorkflowRfNode[];
  edges: VisualWorkflowRfEdge[];
};

export type VisualMergeMode = "all" | "any" | "first_success";

export type VisualMergeInput = {
  id: string;
  name: string;
};

export type VisualSequenceOutput = {
  id: string;
  label: string;
};

export type VisualReturnOutput = {
  id: string;
  name: string;
  type: WorkflowValueType;
};

export type VisualSubworkflowField = {
  id: string;
  name: string;
  type: WorkflowValueType;
  required?: boolean;
};

export type VisualObjectField = {
  id: string;
  name: string;
  type: WorkflowValueType;
  defaultValue?: unknown;
};

export type VisualObjectMergeInput = {
  id: string;
  name: string;
};

export type VisualObjectConflictPolicy = "reject" | "first_wins" | "last_wins";
