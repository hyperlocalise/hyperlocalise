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
import type { IntlShape } from "react-intl";

import {
  WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES,
  listWorkspaceAutomationTemplateCategories,
  listWorkspaceAutomationTemplates,
  type WorkspaceAutomationTemplate,
  type WorkspaceAutomationTemplateCategory,
} from "@/lib/agents/workspace-automation-templates";
import {
  hasWorkspaceAutomationAhrefsTool,
  hasWorkspaceAutomationBrazeCampaignsTool,
  hasWorkspaceAutomationBrazeTool,
  hasWorkspaceAutomationContentfulWorkflow,
  hasWorkspaceAutomationCrowdinTool,
  hasWorkspaceAutomationIntercomTool,
  hasWorkspaceAutomationSemrushTool,
  hasWorkspaceAutomationWebSearchTool,
  hasWorkspaceAutomationZernioTool,
  isContentSyncAutomation,
  type WorkspaceAutomationRecord,
  type WorkspaceAutomationTriggerConfig,
} from "@/lib/agents/workspace-automation-types";

import { automationsPageViewModelMessages } from "./automations-page-view-model.messages";

export function resolveVisibleAutomations(
  automations: WorkspaceAutomationRecord[],
  projectId?: string,
) {
  return automations.filter((automation) => {
    if (automation.status === "archived") {
      return false;
    }
    if (!projectId) {
      return true;
    }
    return automation.projectId === projectId;
  });
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

export function resolveSortedAutomationTemplates(
  templates: WorkspaceAutomationTemplate[],
  options: { usableFirst?: boolean } = {},
) {
  const categoryOrder = WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES.map((category) => category.id);

  return listWorkspaceAutomationTemplates(undefined, templates).toSorted((left, right) => {
    const leftIndex = categoryOrder.indexOf(left.category);
    const rightIndex = categoryOrder.indexOf(right.category);
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    if (options.usableFirst && left.activatable !== right.activatable) {
      return left.activatable ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export function resolveTemplateCategoryTabs(templates: WorkspaceAutomationTemplate[]) {
  const counts = new Map<WorkspaceAutomationTemplateCategory, number>();
  for (const template of templates) {
    for (const category of listWorkspaceAutomationTemplateCategories(template)) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
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
    return intl.formatNumber(Math.max(diffHours, 1), {
      style: "unit",
      unit: "hour",
      unitDisplay: "narrow",
    });
  }

  const diffDays = Math.floor(diffHours / 24);
  return intl.formatNumber(diffDays, {
    style: "unit",
    unit: "day",
    unitDisplay: "narrow",
  });
}

export function resolveAutomationCreatorName(
  intl: Pick<IntlShape, "formatMessage">,
  automation: WorkspaceAutomationRecord,
) {
  const name = automation.authorName?.trim();
  if (name) {
    return name;
  }

  return intl.formatMessage(automationsPageViewModelMessages.unknownCreator);
}

export function resolveAutomationTriggerLabel(
  intl: IntlShape,
  triggerConfig: WorkspaceAutomationTriggerConfig,
  automation?: WorkspaceAutomationRecord,
) {
  if (automation && isContentSyncAutomation(automation)) {
    const resourceKey = automation.syncConfig?.resourceKey.trim();
    if (resourceKey) {
      return resourceKey;
    }
    return intl.formatMessage(automationsPageViewModelMessages.triggerContentSync);
  }

  if (triggerConfig.mode === "scheduled") {
    return intl.formatMessage(automationsPageViewModelMessages.triggerScheduled);
  }
  if (triggerConfig.mode === "github") {
    return intl.formatMessage(automationsPageViewModelMessages.triggerGithub);
  }
  if (triggerConfig.mode === "contentful") {
    return intl.formatMessage(automationsPageViewModelMessages.triggerContentful);
  }
  if (triggerConfig.mode === "source_upload") {
    return intl.formatMessage(automationsPageViewModelMessages.triggerSourceUpload);
  }
  if (triggerConfig.mode === "web_chat") {
    return intl.formatMessage(automationsPageViewModelMessages.triggerWebChat);
  }
  return intl.formatMessage(automationsPageViewModelMessages.triggerManual);
}

export const AUTOMATION_LIST_TOOL_IDS = [
  "github",
  "gitlab",
  "slack",
  "email",
  "githubComment",
  "mcp",
  "knowledgeFiles",
  "contentful",
  "intercom",
  "braze",
  "crowdin",
  "webSearch",
  "semrush",
  "zernio",
  "ahrefs",
] as const;

export type AutomationListToolId = (typeof AUTOMATION_LIST_TOOL_IDS)[number];

export type AutomationListTool = {
  id: AutomationListToolId;
  label: string;
};

function addTool(tools: AutomationListTool[], id: AutomationListToolId, label: string) {
  if (tools.some((tool) => tool.id === id)) {
    return;
  }
  tools.push({ id, label });
}

export function resolveAutomationTools(
  intl: Pick<IntlShape, "formatMessage">,
  automation: WorkspaceAutomationRecord,
): AutomationListTool[] {
  if (isContentSyncAutomation(automation)) {
    const provider = automation.syncConfig?.provider;
    if (provider === "gitlab") {
      return [
        {
          id: "gitlab",
          label: intl.formatMessage(automationsPageViewModelMessages.toolGitlab),
        },
      ];
    }
    if (provider === "contentful") {
      return [
        {
          id: "contentful",
          label: intl.formatMessage(automationsPageViewModelMessages.toolContentful),
        },
      ];
    }
    if (provider === "intercom") {
      return [
        {
          id: "intercom",
          label: intl.formatMessage(automationsPageViewModelMessages.toolIntercom),
        },
      ];
    }
    return [
      { id: "github", label: intl.formatMessage(automationsPageViewModelMessages.toolGithub) },
    ];
  }

  const tools: AutomationListTool[] = [];
  const { toolConfig } = automation;
  if (toolConfig.github?.enabled) {
    addTool(tools, "github", intl.formatMessage(automationsPageViewModelMessages.toolGithub));
  }
  if (toolConfig.gitlab?.enabled) {
    addTool(tools, "gitlab", intl.formatMessage(automationsPageViewModelMessages.toolGitlab));
  }
  if (toolConfig.slack?.enabled) {
    addTool(tools, "slack", intl.formatMessage(automationsPageViewModelMessages.toolSlack));
  }
  if (toolConfig.email?.enabled) {
    addTool(tools, "email", intl.formatMessage(automationsPageViewModelMessages.toolEmail));
  }
  if (toolConfig.githubComment?.enabled) {
    addTool(
      tools,
      "githubComment",
      intl.formatMessage(automationsPageViewModelMessages.toolGithubComment),
    );
  }
  if (toolConfig.mcp?.enabled) {
    addTool(tools, "mcp", intl.formatMessage(automationsPageViewModelMessages.toolMcpServer));
  }
  if (toolConfig.knowledgeFiles?.enabled) {
    addTool(
      tools,
      "knowledgeFiles",
      intl.formatMessage(automationsPageViewModelMessages.toolKnowledgeFiles),
    );
  }
  if (hasWorkspaceAutomationContentfulWorkflow(toolConfig)) {
    addTool(
      tools,
      "contentful",
      intl.formatMessage(automationsPageViewModelMessages.toolContentful),
    );
  }
  if (hasWorkspaceAutomationIntercomTool(toolConfig)) {
    addTool(tools, "intercom", intl.formatMessage(automationsPageViewModelMessages.toolIntercom));
  }
  if (
    hasWorkspaceAutomationBrazeTool(toolConfig) ||
    hasWorkspaceAutomationBrazeCampaignsTool(toolConfig)
  ) {
    addTool(tools, "braze", intl.formatMessage(automationsPageViewModelMessages.toolBraze));
  }
  if (hasWorkspaceAutomationCrowdinTool(toolConfig)) {
    addTool(tools, "crowdin", intl.formatMessage(automationsPageViewModelMessages.toolCrowdin));
  }
  if (hasWorkspaceAutomationWebSearchTool(toolConfig)) {
    addTool(tools, "webSearch", intl.formatMessage(automationsPageViewModelMessages.toolWebSearch));
  }
  if (hasWorkspaceAutomationSemrushTool(toolConfig)) {
    addTool(tools, "semrush", intl.formatMessage(automationsPageViewModelMessages.toolSemrush));
  }
  if (hasWorkspaceAutomationZernioTool(toolConfig)) {
    addTool(tools, "zernio", intl.formatMessage(automationsPageViewModelMessages.toolZernio));
  }
  if (hasWorkspaceAutomationAhrefsTool(toolConfig)) {
    addTool(tools, "ahrefs", intl.formatMessage(automationsPageViewModelMessages.toolAhrefs));
  }
  return tools;
}
