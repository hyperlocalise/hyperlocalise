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
import {
  BrainCircuitIcon,
  Clock01Icon,
  FlashIcon,
  GitBranchIcon,
  Globe02Icon,
  Mail01Icon,
  Route01Icon,
  Task01Icon,
  Upload04Icon,
  VariableIcon,
} from "@hugeicons/core-free-icons";
import type { ComponentProps } from "react";
import type { HugeiconsIcon } from "@hugeicons/react";

import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import type { VisualCatalogCategory, VisualCatalogType, VisualNodeConfig } from "../schema/types";

export type CatalogIcon = ComponentProps<typeof HugeiconsIcon>["icon"];

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
    icon: Clock01Icon,
  },
  {
    type: "trigger.scheduled",
    category: "trigger",
    enabled: true,
    icon: Clock01Icon,
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
    icon: Upload04Icon,
  },
  {
    type: "action.http",
    category: "action",
    enabled: true,
    icon: Globe02Icon,
  },
  {
    type: "action.notify_slack",
    category: "action",
    enabled: true,
    icon: Mail01Icon,
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
    icon: Route01Icon,
  },
  {
    type: "logic.set",
    category: "logic",
    enabled: true,
    icon: VariableIcon,
  },
  {
    type: "ai.agent",
    category: "ai",
    enabled: true,
    icon: BrainCircuitIcon,
  },
  {
    type: "logic.for_each",
    category: "flow",
    enabled: true,
    icon: Task01Icon,
  },
];

export const VISUAL_CATALOG_CATEGORY_ORDER: readonly VisualCatalogCategory[] = [
  "trigger",
  "action",
  "logic",
  "ai",
  "flow",
];

export const TRIGGER_BADGE_ICON = FlashIcon;

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
    case "action.notify_slack":
      return { kind: "action.notify_slack", channelId: "", message: "", onError: "stop" };
    case "logic.if":
      return { kind: "logic.if", condition: "" };
    case "logic.switch":
      return {
        kind: "logic.switch",
        expression: "",
        cases: [{ value: "" }, { value: "" }],
      };
    case "logic.set":
      return { kind: "logic.set", assignments: [{ key: "", value: "" }] };
    case "ai.agent":
      return { kind: "ai.agent", prompt: "", onError: "stop" };
    case "logic.for_each":
      return { kind: "logic.for_each", collection: "" };
    default:
      return assertNever(type);
  }
}

export function getVisualNodeDimensions(type: VisualCatalogType): {
  width: number;
  height: number;
} {
  if (type === "ai.agent") {
    return { width: 200, height: 156 };
  }
  if (type === "logic.if") {
    return { width: 200, height: 120 };
  }
  if (type === "logic.switch") {
    return { width: 200, height: 140 };
  }
  if (type.startsWith("trigger.")) {
    return { width: 200, height: 120 };
  }
  return { width: 200, height: 104 };
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
    case "action.notify_slack":
      return config.channelId ? "Slack" : "Slack channel";
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
    default:
      return assertNever(config);
  }
}
