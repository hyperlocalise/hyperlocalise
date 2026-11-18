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
  hasWorkspaceAutomationCustomerIoTool,
  hasWorkspaceAutomationHubspotTool,
  hasWorkspaceAutomationMailchimpTool,
  hasWorkspaceAutomationIterableTool,
  hasWorkspaceAutomationIntercomTool,
  hasWorkspaceAutomationSanityTool,
  hasWorkspaceAutomationSemrushTool,
  hasWorkspaceAutomationWebSearchTool,
  hasWorkspaceAutomationZernioTool,
  isContentSyncAutomation,
  type WorkspaceAutomationRecord,
  type WorkspaceAutomationTriggerConfig,
} from "@/lib/agents/workspace-automation-types";

import type { VisualCatalogType } from "@/lib/visual-workflows/schema/types";
import type { VisualWorkflowRecord } from "@/lib/visual-workflows/visual-workflow-types";

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

/** The two ways to build an automation: an agent that works out the steps, or drawn steps. */
export type AutomationListType = "agent" | "workflow";

export type AutomationListStatus = "draft" | "active" | "paused";

export type AutomationListItem =
  | {
      type: "agent";
      id: string;
      name: string;
      status: AutomationListStatus;
      updatedAt: string;
      automation: WorkspaceAutomationRecord;
    }
  | {
      type: "workflow";
      id: string;
      name: string;
      status: AutomationListStatus;
      updatedAt: string;
      workflow: VisualWorkflowRecord;
    };

export type AutomationListFilters = {
  status: AutomationListStatus | "all";
  type: AutomationListType | "all";
  query: string;
};

/**
 * Agents and workflows as one list, most recently changed first. Content syncs and archived
 * records are left out, and so are workflows on a project's page, since workflows belong to the
 * workspace.
 */
export function resolveAutomationListItems(
  automations: WorkspaceAutomationRecord[],
  visualWorkflows: VisualWorkflowRecord[],
  projectId?: string,
): AutomationListItem[] {
  const agents: AutomationListItem[] = resolveVisibleAutomations(automations, projectId)
    .filter((automation) => !isContentSyncAutomation(automation))
    .map((automation) => ({
      type: "agent",
      id: automation.id,
      name: automation.name,
      status: automation.status === "active" ? "active" : "paused",
      updatedAt: automation.updatedAt,
      automation,
    }));
  const workflows: AutomationListItem[] = projectId
    ? []
    : visualWorkflows.flatMap((workflow) =>
        workflow.status === "archived"
          ? []
          : [
              {
                type: "workflow" as const,
                id: workflow.id,
                name: workflow.name,
                status: workflow.status,
                updatedAt: workflow.updatedAt,
                workflow,
              },
            ],
      );

  return [...agents, ...workflows].toSorted(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}

export function resolveAutomationListCounts(items: AutomationListItem[]) {
  return {
    all: items.length,
    active: items.filter((item) => item.status === "active").length,
    paused: items.filter((item) => item.status === "paused").length,
    draft: items.filter((item) => item.status === "draft").length,
  };
}

export function filterAutomationListItems(
  items: AutomationListItem[],
  filters: AutomationListFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase();

  return items.filter(
    (item) =>
      (filters.status === "all" || item.status === filters.status) &&
      (filters.type === "all" || item.type === filters.type) &&
      (!query || item.name.toLocaleLowerCase().includes(query)),
  );
}

/** The templates that can be used today, in the order the template picker shows them. */
export function resolveUsableAutomationTemplates(templates: WorkspaceAutomationTemplate[]) {
  return resolveSortedAutomationTemplates(templates).filter((template) => template.activatable);
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
  "sanity",
  "braze",
  "iterable",
  "customerIo",
  "hubspot",
  "mailchimp",
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
  if (hasWorkspaceAutomationSanityTool(toolConfig)) {
    addTool(tools, "sanity", intl.formatMessage(automationsPageViewModelMessages.toolSanity));
  }
  if (
    hasWorkspaceAutomationBrazeTool(toolConfig) ||
    hasWorkspaceAutomationBrazeCampaignsTool(toolConfig)
  ) {
    addTool(tools, "braze", intl.formatMessage(automationsPageViewModelMessages.toolBraze));
  }
  if (hasWorkspaceAutomationIterableTool(toolConfig)) {
    addTool(tools, "iterable", intl.formatMessage(automationsPageViewModelMessages.toolIterable));
  }
  if (hasWorkspaceAutomationCustomerIoTool(toolConfig)) {
    addTool(
      tools,
      "customerIo",
      intl.formatMessage(automationsPageViewModelMessages.toolCustomerIo),
    );
  }
  if (hasWorkspaceAutomationHubspotTool(toolConfig)) {
    addTool(tools, "hubspot", intl.formatMessage(automationsPageViewModelMessages.toolHubspot));
  }
  if (hasWorkspaceAutomationMailchimpTool(toolConfig)) {
    addTool(tools, "mailchimp", intl.formatMessage(automationsPageViewModelMessages.toolMailchimp));
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

/** "When this happens → using these tools", read off an agent automation. */
export function resolveAgentAutomationSummary(
  intl: IntlShape,
  automation: WorkspaceAutomationRecord,
) {
  const trigger = resolveAutomationTriggerLabel(intl, automation.triggerConfig, automation);
  const tools = resolveAutomationTools(intl, automation).map((tool) => tool.label);
  if (tools.length === 0) {
    return trigger;
  }

  return intl.formatMessage(automationsPageViewModelMessages.agentSummary, {
    trigger,
    tools: intl.formatList(tools, { type: "conjunction", style: "narrow" }),
  });
}

export type VisualWorkflowTriggerKind = Extract<VisualCatalogType, `trigger.${string}`>;

/** The trigger step of a workflow as it was last published, or as drafted when never published. */
export function resolveVisualWorkflowTriggerKind(
  workflow: VisualWorkflowRecord,
): VisualWorkflowTriggerKind | null {
  const definition = workflow.publishedDefinition ?? workflow.definition;
  const trigger = definition.nodes.find((node) => node.type.startsWith("trigger."));

  return (trigger?.type as VisualWorkflowTriggerKind | undefined) ?? null;
}

function resolveVisualWorkflowTriggerLabel(
  intl: IntlShape,
  triggerKind: VisualWorkflowTriggerKind | null,
) {
  switch (triggerKind) {
    case "trigger.manual":
      return intl.formatMessage(automationsPageViewModelMessages.triggerManual);
    case "trigger.scheduled":
      return intl.formatMessage(automationsPageViewModelMessages.triggerScheduled);
    case "trigger.github":
      return intl.formatMessage(automationsPageViewModelMessages.workflowTriggerGithub);
    case "trigger.source_upload":
      return intl.formatMessage(automationsPageViewModelMessages.triggerSourceUpload);
    case "trigger.webhook":
      return intl.formatMessage(automationsPageViewModelMessages.workflowTriggerWebhook);
    case "trigger.job_changed":
      return intl.formatMessage(automationsPageViewModelMessages.workflowTriggerJobChanged);
    case null:
      return intl.formatMessage(automationsPageViewModelMessages.workflowNoTrigger);
  }
}

/** "When this happens → N steps", read off a workflow's canvas. */
export function resolveVisualWorkflowSummary(intl: IntlShape, workflow: VisualWorkflowRecord) {
  const definition = workflow.publishedDefinition ?? workflow.definition;
  const triggerKind = resolveVisualWorkflowTriggerKind(workflow);
  const steps = definition.nodes.filter((node) => !node.type.startsWith("trigger.")).length;

  return intl.formatMessage(automationsPageViewModelMessages.workflowSummary, {
    trigger: resolveVisualWorkflowTriggerLabel(intl, triggerKind),
    count: steps,
  });
}
