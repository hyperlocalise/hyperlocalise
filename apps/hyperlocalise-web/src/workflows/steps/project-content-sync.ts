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
import type { ProjectContentSyncEventData } from "@/lib/workflow/types";

/*
 * Statically imported by a `"use workflow"` module: runtime modules are imported inside the step.
 */

export async function runProjectContentSyncStep(event: ProjectContentSyncEventData) {
  "use step";

  const { executeProjectContentSyncRun } =
    await import("@/lib/projects/content-sync/project-content-sync");
  await executeProjectContentSyncRun(event);
}

// A retry would repeat the pull and the pull request; the run records its own failure instead.
runProjectContentSyncStep.maxRetries = 0;
