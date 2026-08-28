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
  Task01Icon,
} from "@hugeicons/core-free-icons";
import type { ComponentProps } from "react";
import type { HugeiconsIcon } from "@hugeicons/react";

import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import type { VisualCatalogCategory, VisualCatalogType, VisualNodeConfig } from "./types";

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
    type: "action.http",
    category: "action",
    enabled: true,
    icon: Globe02Icon,
  },
  {
    type: "logic.if",
    category: "logic",
    enabled: true,
    icon: GitBranchIcon,
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
    enabled: false,
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
    case "action.http":
      return { kind: "action.http", method: "GET", url: "" };
    case "logic.if":
      return { kind: "logic.if", condition: "" };
    case "ai.agent":
      return { kind: "ai.agent", prompt: "" };
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
    case "action.http":
      return config.method;
    case "logic.if":
      return config.condition.trim() ? "1 condition" : "No condition";
    case "ai.agent":
      return "Tools agent";
    case "logic.for_each":
      return "For each item";
    default:
      return assertNever(config);
  }
}
