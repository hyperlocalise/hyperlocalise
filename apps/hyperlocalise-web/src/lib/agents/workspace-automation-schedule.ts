import {
  computeNextScheduledRunAt,
  resolveNextRunAtForSettings,
} from "@/lib/agents/github/github-repository-automation-settings";

import { workspaceAutomationToGithubSettings } from "./workspace-automation-github-mapping";
import {
  hasWorkspaceAutomationContentfulWorkflow,
  type WorkspaceAutomationRecord,
} from "./workspace-automations";

export function resolveNextRunAtForWorkspaceAutomation(
  automation: WorkspaceAutomationRecord,
  from: Date = new Date(),
): Date | null {
  if (automation.status !== "active") {
    return null;
  }

  const githubSettings = workspaceAutomationToGithubSettings(automation);
  if (githubSettings) {
    return resolveNextRunAtForSettings(githubSettings, from);
  }

  if (
    automation.triggerConfig.mode === "scheduled" &&
    automation.triggerConfig.schedule &&
    hasWorkspaceAutomationContentfulWorkflow(automation.toolConfig)
  ) {
    return computeNextScheduledRunAt(
      {
        mode: "scheduled",
        ...automation.triggerConfig.schedule,
        hourUtc: automation.triggerConfig.schedule.hourUtc ?? 0,
      },
      from,
    );
  }

  return null;
}
