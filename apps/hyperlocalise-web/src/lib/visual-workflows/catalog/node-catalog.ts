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
} from "@phosphor-icons/react/ssr";

import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import type { VisualCatalogCategory, VisualCatalogType, VisualNodeConfig } from "../schema/types";
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
];

export const VISUAL_CATALOG_CATEGORY_ORDER: readonly VisualCatalogCategory[] = [
  "trigger",
  "action",
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
    case "action.http":
      return config.method;
    case "action.content_sync":
      return config.resourceKey.trim() || config.provider;
    case "action.notify_slack":
      return config.channelId ? "Slack" : "Slack channel";
    case "action.notify_email":
      return config.from ? config.provider : "Email";
    case "logic.if":
      return config.condition.trim() ? "1 condition" : "No condition";
    case "logic.switch":
      return config.cases.length > 0 ? `${config.cases.length} cases` : "No cases";
    case "logic.set":
      return config.assignments.length > 0
        ? `${config.assignments.length} fields`
        : "No assignments";
    case "ai.agent":
      return "Tools agent";
    case "logic.for_each":
      return "For each item";
    case "logic.retry":
      return config.maxAttempts ? `${config.maxAttempts} attempts` : "Retry policy";
    case "flow.wait":
      if (config.mode === "duration") {
        return `${config.durationMs ?? 0} ms`;
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
    default:
      return assertNever(config);
  }
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
