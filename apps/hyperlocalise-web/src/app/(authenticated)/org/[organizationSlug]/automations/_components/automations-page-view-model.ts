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

export function resolveSortedAutomationTemplates() {
  const categoryOrder = WORKSPACE_AUTOMATION_TEMPLATE_CATEGORIES.map((category) => category.id);

  return listWorkspaceAutomationTemplates().toSorted((left, right) => {
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

export function formatAutomationRelativeTimestamp(value: string, now = Date.now()) {
  const date = new Date(value);
  const diffMs = now - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) {
    return `${Math.max(diffHours, 1)}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

export function resolveAutomationTriggerLabel(triggerConfig: WorkspaceAutomationTriggerConfig) {
  if (triggerConfig.mode === "scheduled") {
    return "Scheduled";
  }
  if (triggerConfig.mode === "github") {
    return "GitHub push";
  }
  return "Manual";
}

export function resolveAutomationTools(automation: WorkspaceAutomationRecord) {
  const tools: string[] = [];
  if (automation.toolConfig.github?.enabled) {
    tools.push("GitHub");
  }
  if (automation.toolConfig.slack?.enabled) {
    tools.push("Slack");
  }
  if (automation.toolConfig.email?.enabled) {
    tools.push("Email");
  }
  return tools;
}
