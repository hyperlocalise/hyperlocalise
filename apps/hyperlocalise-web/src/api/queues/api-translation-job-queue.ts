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
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { workspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";
import { createTranslationJobEventQueue } from "@/lib/workflow/queues";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

async function resolveKnowledgeMemoryEnabled(projectId: string) {
  const [project] = await db
    .select({
      workosOrganizationId: schema.organizations.workosOrganizationId,
    })
    .from(schema.projects)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.projects.organizationId))
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  if (!project) {
    return false;
  }

  return (
    (await workspaceKnowledgeFlag.run({
      identify: () => ({
        organization: { id: project.workosOrganizationId },
      }),
    })) === true
  );
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
