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
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automations";

function readSnapshotString(snapshot: Record<string, unknown>, key: string): string | null {
  const value = snapshot[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isGithubNullOid(sha: string | null | undefined): boolean {
  return !sha || /^0+$/.test(sha);
}

export type GithubPushInspectionRange = {
  branch: string;
  commitBefore: string | null;
  commitAfter: string;
};

export function resolveGithubPushRange(input: {
  triggerSource: string;
  inputSnapshot: Record<string, unknown>;
}): GithubPushInspectionRange | null {
  if (input.triggerSource !== "github") {
    return null;
  }

  const branch = readSnapshotString(input.inputSnapshot, "pushBranch");
  const commitAfter = readSnapshotString(input.inputSnapshot, "commitAfter");
  if (!branch || !commitAfter || isGithubNullOid(commitAfter)) {
    return null;
  }

  const commitBeforeRaw = readSnapshotString(input.inputSnapshot, "commitBefore");
  return {
    branch,
    commitBefore: commitBeforeRaw && !isGithubNullOid(commitBeforeRaw) ? commitBeforeRaw : null,
    commitAfter,
  };
}

export function formatGithubPushRangeLabel(range: GithubPushInspectionRange): string {
  if (!range.commitBefore) {
    return `new branch ${range.branch} at ${range.commitAfter}`;
  }

  return `${range.commitBefore}..${range.commitAfter} on ${range.branch}`;
}

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
