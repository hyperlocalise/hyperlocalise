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

import { getVisualWorkflowTriggerNode } from "./trigger-matching";
import type { VisualWorkflowDefinition } from "../schema/types";
import type { VisualWorkflowStatus } from "../visual-workflow-types";

export function resolveNextRunAtForVisualWorkflow(
  input: {
    status: VisualWorkflowStatus;
    definition: VisualWorkflowDefinition;
  },
  from: Date = new Date(),
): Date | null {
  if (input.status !== "active") {
    return null;
  }

  const trigger = getVisualWorkflowTriggerNode(input.definition);
  if (!trigger || trigger.config.kind !== "trigger.scheduled") {
    return null;
  }

  return computeNextScheduledRunAt(
    {
      mode: "scheduled",
      ...trigger.config.schedule,
      hourUtc: trigger.config.schedule.hourUtc ?? 0,
      timezone: trigger.config.schedule.timezone ?? "UTC",
    },
    from,
  );
}
