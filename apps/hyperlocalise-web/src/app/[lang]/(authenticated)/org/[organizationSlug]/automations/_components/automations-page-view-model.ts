/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { IntlShape } from "react-intl";

import {
  WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES,
  listWorkspaceAutomationTemplates,
  type WorkspaceAutomationTemplate,
  type WorkspaceAutomationTemplateCategory,
} from "@/lib/agents/workspace-automation-templates";
import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationTriggerConfig,
} from "@/lib/agents/workspace-automations";

import { automationsPageViewModelMessages } from "./automations-page-view-model.messages";

export function resolveVisibleAutomations(automations: WorkspaceAutomationRecord[]) {
  return automations.filter((automation) => automation.status !== "archived");
}

export function resolveAutomationPageStats(automations: WorkspaceAutomationRecord[]) {
  const active = automations.filter((automation) => automation.status === "active").length;
  const paused = automations.filter((automation) => automation.status === "paused").length;

  return {
    total: automations.length,
    active,
    paused,
  };
}

export function resolveSortedAutomationTemplates(templates: WorkspaceAutomationTemplate[]) {
  const categoryOrder = WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES.map((category) => category.id);

  return listWorkspaceAutomationTemplates(undefined, templates).toSorted((left, right) => {
    const leftIndex = categoryOrder.indexOf(left.category);
    const rightIndex = categoryOrder.indexOf(right.category);
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.name.localeCompare(right.name);
  });
}

export function resolveTemplateCategoryTabs(templates: WorkspaceAutomationTemplate[]) {
  const counts = new Map<WorkspaceAutomationTemplateCategory, number>();
  for (const template of templates) {
    counts.set(template.category, (counts.get(template.category) ?? 0) + 1);
  }

  return WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES.filter((category) => counts.has(category.id));
}

export function formatAutomationRelativeTimestamp(
  intl: IntlShape,
  value: string,
  now = Date.now(),
) {
  const date = new Date(value);
  const diffMs = now - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) {
    return intl.formatMessage(automationsPageViewModelMessages.relativeHours, {
      hours: Math.max(diffHours, 1),
    });
  }

  const diffDays = Math.floor(diffHours / 24);
  return intl.formatMessage(automationsPageViewModelMessages.relativeDays, {
    days: diffDays,
  });
}

export function resolveAutomationTriggerLabel(
  intl: IntlShape,
  triggerConfig: WorkspaceAutomationTriggerConfig,
) {
  if (triggerConfig.mode === "scheduled") {
    return intl.formatMessage(automationsPageViewModelMessages.triggerScheduled);
  }
  if (triggerConfig.mode === "github") {
    return intl.formatMessage(automationsPageViewModelMessages.triggerGithub);
  }
  return intl.formatMessage(automationsPageViewModelMessages.triggerManual);
}

export function resolveAutomationTools(intl: IntlShape, automation: WorkspaceAutomationRecord) {
  const tools: string[] = [];
  if (automation.toolConfig.github?.enabled) {
    tools.push(intl.formatMessage(automationsPageViewModelMessages.toolGithub));
  }
  if (automation.toolConfig.slack?.enabled) {
    tools.push(intl.formatMessage(automationsPageViewModelMessages.toolSlack));
  }
  if (automation.toolConfig.email?.enabled) {
    tools.push(intl.formatMessage(automationsPageViewModelMessages.toolEmail));
  }
  if (automation.toolConfig.mcp?.enabled) {
    tools.push(intl.formatMessage(automationsPageViewModelMessages.toolMcpServer));
  }
  return tools;
}
