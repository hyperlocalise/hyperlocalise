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
import { computeNextScheduledRunAt } from "@/lib/agents/github/github-repository-automation-settings";

import type { WorkspaceAutomationRecord } from "./workspace-automation-types";

export function resolveNextRunAtForWorkspaceAutomation(
  automation: WorkspaceAutomationRecord,
  from: Date = new Date(),
): Date | null {
  if (automation.status !== "active") {
    return null;
  }

  if (automation.triggerConfig.mode !== "scheduled" || !automation.triggerConfig.schedule) {
    return null;
  }

  return computeNextScheduledRunAt(
    {
      mode: "scheduled",
      ...automation.triggerConfig.schedule,
      hourUtc: automation.triggerConfig.schedule.hourUtc ?? 0,
    },
    from,
  );
}
