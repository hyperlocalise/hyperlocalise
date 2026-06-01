import { resolveNextRunAtForSettings } from "@/lib/agents/github/github-repository-automation-settings";

import { workspaceAutomationToGithubSettings } from "./workspace-automation-github-mapping";
import type { WorkspaceAutomationRecord } from "./workspace-automations";

export function resolveNextRunAtForWorkspaceAutomation(
  automation: WorkspaceAutomationRecord,
  from: Date = new Date(),
): Date | null {
  if (automation.status !== "active") {
    return null;
  }

  const githubSettings = workspaceAutomationToGithubSettings(automation);
  if (!githubSettings) {
    return null;
  }

  return resolveNextRunAtForSettings(githubSettings, from);
}
