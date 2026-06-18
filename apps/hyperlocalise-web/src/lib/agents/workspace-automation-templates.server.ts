import "server-only";

import { mergeWorkspaceTemplateSkills } from "@/agents/automations/workspace/agent/workspace-template-manifest";

import { WORKSPACE_AUTOMATION_TEMPLATES_BASE } from "./workspace-automation-templates";

export function getMergedWorkspaceAutomationTemplates() {
  return mergeWorkspaceTemplateSkills(WORKSPACE_AUTOMATION_TEMPLATES_BASE);
}
