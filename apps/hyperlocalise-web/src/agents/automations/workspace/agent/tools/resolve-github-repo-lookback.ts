import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automations";

export function resolveGithubRepoLookbackHours(input: {
  automation: WorkspaceAutomationRecord;
  triggerSource: string;
}): number {
  if (
    input.triggerSource === "scheduled" &&
    input.automation.triggerConfig.mode === "scheduled" &&
    input.automation.triggerConfig.schedule
  ) {
    switch (input.automation.triggerConfig.schedule.cadence) {
      case "hourly":
        return 1;
      case "weekly":
        return 24 * 7;
      default:
        return 24;
    }
  }

  return 24;
}

export function formatGithubRepoLookbackLabel(hours: number): string {
  if (hours >= 24 * 7) {
    return "7 days";
  }
  if (hours >= 24) {
    return "24 hours";
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
