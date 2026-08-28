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
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { resolveWorkspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";
import { createTranslationJobEventQueue } from "@/lib/workflow/queues";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

// Delegates to resolveWorkspaceKnowledgeFlag (which takes an internal organizationId directly)
// instead of re-running its own org lookup + workspaceKnowledgeFlag.run() — this call site only
// has a projectId, so it resolves that to an organizationId first.
async function resolveKnowledgeMemoryEnabled(projectId: string) {
  const [project] = await db
    .select({ organizationId: schema.projects.organizationId })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  if (!project) {
    return false;
  }

  return resolveWorkspaceKnowledgeFlag({ organizationId: project.organizationId });
}

export function createApiTranslationJobQueue(): JobQueue<TranslationJobEventData> {
  const workflowQueue = createTranslationJobEventQueue();

  return {
    async enqueue(event) {
      if (event.type === "file") {
        return workflowQueue.enqueue(event);
      }

      let knowledgeMemoryEnabled = false;
      try {
        knowledgeMemoryEnabled = await resolveKnowledgeMemoryEnabled(event.projectId);
      } catch {
        knowledgeMemoryEnabled = false;
      }

      return workflowQueue.enqueue({
        ...event,
        knowledgeMemoryEnabled,
      });
    },
  };
}
