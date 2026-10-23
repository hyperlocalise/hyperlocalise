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
import type { Icon } from "@phosphor-icons/react";
import {
  BrainIcon,
  ClockIcon,
  LightningIcon,
  GitBranchIcon,
  FolderIcon,
  GlobeIcon,
  EnvelopeIcon,
  ArrowClockwiseIcon,
  PathIcon,
  CheckSquareIcon,
  UploadSimpleIcon,
  BracketsCurlyIcon,
  GitMergeIcon,
  TranslateIcon,
  UserCheckIcon,
  ChartBarIcon,
  SealCheckIcon,
  WebhooksLogoIcon,
  FilesIcon,
  UserSwitchIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/ssr";

import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import type {
  VisualAssignmentRule,
  VisualCatalogCategory,
  VisualCatalogType,
  VisualNodeConfig,
} from "../schema/types";
import { createSwitchCaseId } from "../schema/switch-cases";

export type CatalogIcon = Icon;

export type VisualNodeCatalogItem = {
  type: VisualCatalogType;
  category: VisualCatalogCategory;
  enabled: boolean;
  icon: CatalogIcon;
};

export const VISUAL_NODE_CATALOG: readonly VisualNodeCatalogItem[] = [
  {
    type: "trigger.manual",
    category: "trigger",
    enabled: true,
    icon: ClockIcon,
  },
  {
    type: "trigger.scheduled",
    category: "trigger",
    enabled: true,
    icon: ClockIcon,
  },
  {
    type: "trigger.github",
    category: "trigger",
    enabled: true,
    icon: GitBranchIcon,
  },
  {
    type: "trigger.source_upload",
    category: "trigger",
    enabled: true,
    icon: UploadSimpleIcon,
  },
  {
    type: "trigger.webhook",
    category: "trigger",
    enabled: true,
    icon: WebhooksLogoIcon,
  },
  {
    type: "action.http",
    category: "action",
    enabled: true,
    icon: GlobeIcon,
  },
  {
    type: "action.content_sync",
    category: "action",
    enabled: true,
    icon: FolderIcon,
  },
  {
    type: "action.notify_slack",
    category: "action",
    enabled: true,
    icon: EnvelopeIcon,
  },
  {
    type: "action.notify_email",
    category: "action",
    enabled: true,
    icon: EnvelopeIcon,
  },
  {
    type: "action.machine_translate",
    category: "localization",
    enabled: true,
    icon: TranslateIcon,
  },
  {
    type: "action.create_task",
    category: "localization",
    enabled: true,
    icon: UserCheckIcon,
  },
  {
    type: "action.check_progress",
    category: "localization",
    enabled: true,
    icon: ChartBarIcon,
  },
  {
    type: "action.run_qa",
    category: "localization",
    enabled: true,
    icon: SealCheckIcon,
  },
  {
    type: "action.list_source_files",
    category: "localization",
    enabled: true,
    icon: FilesIcon,
  },
  {
    type: "action.update_job",
    category: "localization",
    enabled: true,
    icon: UserSwitchIcon,
  },
  {
    type: "action.pick_assignee",
    category: "localization",
    enabled: true,
    icon: UsersThreeIcon,
  },
  {
    type: "action.crowdin_pre_translate",
    category: "localization",
    enabled: true,
    icon: TranslateIcon,
  },
  {
    type: "action.crowdin_create_task",
    category: "localization",
    enabled: true,
    icon: UserCheckIcon,
  },
  {
    type: "action.crowdin_check_progress",
    category: "localization",
    enabled: true,
    icon: ChartBarIcon,
  },
  {
    type: "logic.if",
    category: "logic",
    enabled: true,
    icon: GitBranchIcon,
  },
  {
    type: "logic.switch",
    category: "logic",
    enabled: true,
    icon: PathIcon,
  },
  {
    type: "logic.set",
    category: "logic",
    enabled: true,
    icon: BracketsCurlyIcon,
  },
  {
    type: "logic.create_object",
    category: "logic",
    enabled: true,
    icon: BracketsCurlyIcon,
  },
  {
    type: "logic.merge_objects",
    category: "logic",
    enabled: true,
    icon: GitMergeIcon,
  },
  {
    type: "logic.select_path",
    category: "logic",
    enabled: true,
    icon: PathIcon,
  },
  {
    type: "logic.coalesce",
    category: "logic",
    enabled: true,
    icon: GitMergeIcon,
  },
  {
    type: "ai.agent",
    category: "ai",
    enabled: true,
    icon: BrainIcon,
  },
  {
    type: "logic.for_each",
    category: "flow",
    enabled: true,
    icon: CheckSquareIcon,
  },
  {
    type: "logic.retry",
    category: "flow",
    enabled: true,
    icon: ArrowClockwiseIcon,
  },
  {
    type: "flow.wait",
    category: "flow",
    enabled: true,
    icon: ClockIcon,
  },
  {
    type: "flow.stop",
    category: "flow",
    enabled: true,
    icon: CheckSquareIcon,
  },
  {
    type: "flow.return",
    category: "flow",
    enabled: true,
    icon: PathIcon,
  },
  {
    type: "flow.fail",
    category: "flow",
    enabled: true,
    icon: LightningIcon,
  },
  {
    type: "logic.merge",
    category: "logic",
    enabled: true,
    icon: GitMergeIcon,
  },
  {
    type: "logic.sequence",
    category: "flow",
    enabled: true,
    icon: PathIcon,
  },
  {
    type: "logic.try_catch",
    category: "flow",
    enabled: true,
    icon: GitBranchIcon,
  },
  {
    type: "flow.call_workflow",
    category: "flow",
    enabled: true,
    icon: PathIcon,
  },
];

export const VISUAL_CATALOG_CATEGORY_ORDER: readonly VisualCatalogCategory[] = [
  "trigger",
  "action",
  "localization",
  "logic",
  "ai",
  "flow",
];

export const TRIGGER_BADGE_ICON = LightningIcon;

export function createDefaultConfig(type: VisualCatalogType): VisualNodeConfig {
  switch (type) {
    case "trigger.manual":
      return { kind: "trigger.manual" };
    case "trigger.scheduled":
      return {
        kind: "trigger.scheduled",
        schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
      };
    case "trigger.github":
      return {
        kind: "trigger.github",
        githubInstallationRepositoryId: "",
        branches: ["main"],
        events: ["push"],
      };
    case "trigger.source_upload":
      return { kind: "trigger.source_upload" };
    case "trigger.webhook":
      return { kind: "trigger.webhook", tokenVersion: 1 };
    case "action.http":
      return {
        kind: "action.http",
        method: "GET",
        url: "",
        headers: [],
        queryParams: [],
        bodyType: "none",
        auth: { type: "none" },
        parseJsonBody: true,
        failOnHttpError: true,
        onError: "stop",
      };
    case "action.content_sync":
      return {
        kind: "action.content_sync",
        projectId: "",
        provider: "github",
        connectionId: "",
        resourceKey: "",
        providerFolder: "locales",
        projectFolder: "",
        onError: "stop",
      };
    case "action.notify_slack":
      return { kind: "action.notify_slack", channelId: "", message: "", onError: "stop" };
    case "action.notify_email":
      return {
        kind: "action.notify_email",
        provider: "resend",
        from: "",
        recipients: "",
        subject: "",
        message: "",
        onError: "stop",
      };
    case "action.machine_translate":
      return {
        kind: "action.machine_translate",
        projectId: "",
        sourceFileId: "",
        targetLocales: "",
        useTranslationMemory: true,
        onError: "stop",
      };
    case "action.create_task":
      return {
        kind: "action.create_task",
        projectId: "",
        sourceFileId: "",
        targetLocales: "",
        step: "edit",
        assigneeWorkosUserId: "",
        title: "",
        dueAt: "",
        onError: "stop",
      };
    case "action.check_progress":
      return {
        kind: "action.check_progress",
        projectId: "",
        sourceFileId: "",
        targetLocales: "",
        jobId: "",
        onError: "stop",
      };
    case "action.run_qa":
      return { kind: "action.run_qa", projectId: "", onError: "stop" };
    case "action.list_source_files":
      return { kind: "action.list_source_files", projectId: "", pathPrefix: "", onError: "stop" };
    case "action.update_job":
      return {
        kind: "action.update_job",
        jobId: "",
        assigneeWorkosUserId: "",
        title: "",
        dueAt: "",
        onError: "stop",
      };
    case "action.pick_assignee":
      return {
        kind: "action.pick_assignee",
        locale: "",
        jobType: "",
        size: "",
        dueAt: "",
        rules: [createAssignmentRule()],
        fallbackAssigneeIds: [],
        strategy: "least_busy",
        peopleSource: "workspace",
        crowdinProjectId: "",
        onError: "stop",
      };
    case "action.crowdin_pre_translate":
      return {
        kind: "action.crowdin_pre_translate",
        crowdinProjectId: "",
        fileIds: "",
        languageIds: "",
        method: "mt",
        engineId: "",
        aiPromptId: "",
        onError: "stop",
      };
    case "action.crowdin_create_task":
      return {
        kind: "action.crowdin_create_task",
        crowdinProjectId: "",
        fileIds: "",
        languageIds: "",
        taskType: "proofread",
        assigneeIds: "",
        title: "",
        description: "",
        dueAt: "",
        onError: "stop",
      };
    case "action.crowdin_check_progress":
      return {
        kind: "action.crowdin_check_progress",
        crowdinProjectId: "",
        fileIds: "",
        languageIds: "",
        taskIds: "",
        preTranslationId: "",
        onError: "stop",
      };
    case "logic.if":
      return { kind: "logic.if", condition: "" };
    case "logic.switch":
      return {
        kind: "logic.switch",
        expression: "",
        cases: [
          { id: createSwitchCaseId(), value: "" },
          { id: createSwitchCaseId(), value: "" },
        ],
      };
    case "logic.set":
      return { kind: "logic.set", assignments: [{ key: "", value: "" }] };
    case "logic.create_object":
      return { kind: "logic.create_object", fields: [] };
    case "logic.merge_objects":
      return {
        kind: "logic.merge_objects",
        inputs: [
          { id: createObjectPortId(), name: "Object 1" },
          { id: createObjectPortId(), name: "Object 2" },
        ],
        conflictPolicy: "reject",
      };
    case "logic.select_path":
      return {
        kind: "logic.select_path",
        path: [],
        outputType: "unknown",
        missingBehavior: "error",
      };
    case "logic.coalesce":
      return {
        kind: "logic.coalesce",
        inputs: [
          { id: createCoalesceInputId(), name: "Value 1", type: "unknown" },
          { id: createCoalesceInputId(), name: "Value 2", type: "unknown" },
        ],
        treatNullAsMissing: true,
        treatEmptyStringAsMissing: false,
        treatEmptyArrayAsMissing: false,
        treatEmptyObjectAsMissing: false,
      };
    case "ai.agent":
      return { kind: "ai.agent", prompt: "", onError: "stop" };
    case "logic.for_each":
      return { kind: "logic.for_each", collection: "[]" };
    case "logic.retry":
      return {
        kind: "logic.retry",
        maxAttempts: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        jitter: true,
        acknowledgeDuplicateRisk: false,
      };
    case "flow.wait":
      return {
        kind: "flow.wait",
        mode: "duration",
        durationMs: 60_000,
      };
    case "flow.stop":
      return { kind: "flow.stop", outcome: "completed" };
    case "flow.return":
      return { kind: "flow.return", outputs: [] };
    case "flow.fail":
      return {
        kind: "flow.fail",
        errorCode: "WORKFLOW_FAILED",
        message: "Workflow failed",
      };
    case "logic.merge":
      return {
        kind: "logic.merge",
        mode: "all",
        inputs: [
          { id: createMergeInputId(), name: "Input 1" },
          { id: createMergeInputId(), name: "Input 2" },
        ],
      };
    case "logic.sequence":
      return {
        kind: "logic.sequence",
        outputs: [
          { id: createSequenceOutputId(), label: "Output 1" },
          { id: createSequenceOutputId(), label: "Output 2" },
        ],
      };
    case "logic.try_catch":
      return { kind: "logic.try_catch" };
    case "flow.call_workflow":
      return {
        kind: "flow.call_workflow",
        workflowId: "",
        version: 1,
        inputFields: [],
        outputFields: [],
        onError: "stop",
      };
    default:
      return assertNever(type);
  }
}

export function getVisualNodeDimensions(
  type: VisualCatalogType,
  config?: VisualNodeConfig,
): {
  width: number;
  height: number;
} {
  if (type === "ai.agent") {
    return { width: 280, height: 156 };
  }
  if (type === "logic.if") {
    return { width: 280, height: 120 };
  }
  if (type === "logic.switch") {
    return { width: 280, height: 140 };
  }
  if (type === "logic.retry") {
    return { width: 280, height: 140 };
  }
  if (type.startsWith("trigger.")) {
    return { width: 280, height: 120 };
  }
  if (type === "flow.wait") {
    return { width: 280, height: 140 };
  }
  if (["flow.stop", "flow.return", "flow.fail"].includes(type)) {
    return { width: 280, height: 120 };
  }
  if (type === "logic.merge") {
    return { width: 280, height: 140 };
  }
  if (type === "logic.sequence") {
    const outputCount = config?.kind === "logic.sequence" ? config.outputs.length : 2;
    return { width: 280, height: Math.max(140, 56 + outputCount * 32) };
  }
  if (type === "logic.try_catch") {
    return { width: 280, height: 156 };
  }
  if (type === "flow.call_workflow") {
    return { width: 280, height: 140 };
  }
  return { width: 280, height: 104 };
}

export function isTriggerType(type: VisualCatalogType): boolean {
  return type.startsWith("trigger.");
}

export function catalogItemByType(type: VisualCatalogType): VisualNodeCatalogItem {
  const item = VISUAL_NODE_CATALOG.find((entry) => entry.type === type);
  if (!item) {
    throw new Error(`Unknown visual catalog type: ${type}`);
  }
  return item;
}

export function resolveNodeSubtitle(config: VisualNodeConfig): string {
  switch (config.kind) {
    case "trigger.manual":
      return "On demand";
    case "trigger.scheduled":
      return config.schedule.cadence;
    case "trigger.github":
      return config.branches[0] ?? "GitHub";
    case "trigger.source_upload":
      return config.projectId ? "Project upload" : "Any project";
    case "trigger.webhook":
      return "Incoming HTTP POST";
    case "action.http":
      return config.method;
    case "action.content_sync":
      return config.resourceKey.trim() || config.provider;
    case "action.notify_slack":
      return config.channelId ? "Slack" : "Slack channel";
    case "action.notify_email":
      return config.from ? config.provider : "Email";
    case "action.machine_translate":
      return config.targetLocales.trim() || "All target locales";
    case "action.create_task":
      return config.step === "translate"
        ? "Translate"
        : config.step === "edit"
          ? "Post-edit"
          : "Proofread";
    case "action.check_progress":
      return config.jobId.trim() ? "Job and strings" : "Strings";
    case "action.run_qa":
      return config.projectId ? "Project QA" : "Select project";
    case "action.list_source_files":
      return config.pathPrefix.trim() || "All source files";
    case "action.update_job":
      return config.assigneeWorkosUserId.trim() ? "Reassign job" : "Update job";
    case "action.pick_assignee":
      return `${config.rules.length === 1 ? "1 rule" : `${config.rules.length} rules`} · ${
        config.strategy === "first"
          ? "first listed"
          : config.strategy === "round_robin"
            ? "round-robin"
            : "least busy"
      }${config.peopleSource === "crowdin" ? " · Crowdin" : ""}`;
    case "action.crowdin_pre_translate":
      return config.method === "tm" ? "Translation memory" : config.method === "mt" ? "MT" : "AI";
    case "action.crowdin_create_task":
      return config.taskType === "translate" ? "Translate" : "Proofread";
    case "action.crowdin_check_progress":
      return config.taskIds.trim() ? "Tasks and strings" : "Strings";
    case "logic.if":
      return config.condition.trim() ? "1 condition" : "No condition";
    case "logic.switch":
      return config.cases.length > 0 ? `${config.cases.length} cases` : "No cases";
    case "logic.set":
      return config.assignments.length > 0
        ? `${config.assignments.length} fields`
        : "No assignments";
    case "logic.create_object":
      return config.fields.length === 1 ? "1 field" : `${config.fields.length} fields`;
    case "logic.merge_objects":
      return `${config.inputs.length} objects · ${config.conflictPolicy.replace("_", " ")}`;
    case "logic.select_path":
      return config.path.length > 0
        ? config.path.map((segment) => String(segment)).join(" › ")
        : "No path selected";
    case "logic.coalesce":
      return `${config.inputs.length} ordered values`;
    case "ai.agent":
      return "Tools agent";
    case "logic.for_each":
      return "For each item";
    case "logic.retry":
      return config.maxAttempts ? `${config.maxAttempts} attempts` : "Retry policy";
    case "flow.wait":
      if (config.mode === "duration") {
        return formatWaitDuration(config.durationMs ?? 0);
      }

      if (config.mode === "timestamp") {
        return config.timestamp ?? "Wait until timestamp";
      }

      return "Wait until condition";
    case "flow.stop":
      return config.outcome === "completed" ? "Complete workflow" : "Cancel workflow";
    case "flow.return":
      return config.outputs.length === 1 ? "1 returned output" : `${config.outputs.length} outputs`;
    case "flow.fail":
      return config.errorCode;
    case "logic.merge":
      return `${config.inputs.length} inputs · ${config.mode.replace("_", " ")}`;
    case "logic.sequence":
      return config.outputs.length === 1 ? "1 output" : `${config.outputs.length} outputs`;
    case "logic.try_catch":
      return "Try / Catch boundary";
    case "flow.call_workflow":
      return config.workflowId ? `Version ${config.version}` : "Select workflow";
    default:
      return assertNever(config);
  }
}

const WAIT_DURATION_UNITS: readonly (readonly [ms: number, unit: string])[] = [
  [86_400_000, "d"],
  [3_600_000, "h"],
  [60_000, "min"],
  [1000, "s"],
];

export function formatWaitDuration(durationMs: number): string {
  for (const [unitMs, unit] of WAIT_DURATION_UNITS) {
    if (durationMs >= unitMs && durationMs % unitMs === 0) {
      return `Wait ${durationMs / unitMs} ${unit}`;
    }
  }
  return `Wait ${durationMs} ms`;
}

export function createMergeInputId(): string {
  return crypto.randomUUID();
}

export function createSequenceOutputId(): string {
  return crypto.randomUUID();
}

export function createReturnOutputId(): string {
  return crypto.randomUUID();
}

export function createObjectPortId(): string {
  return crypto.randomUUID();
}

export function createCoalesceInputId(): string {
  return crypto.randomUUID();
}

export function createAssignmentRule(): VisualAssignmentRule {
  return {
    id: crypto.randomUUID(),
    name: "",
    locales: "",
    jobTypes: [],
    assigneeIds: [],
  };
}
