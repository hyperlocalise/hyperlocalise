/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
