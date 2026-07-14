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
