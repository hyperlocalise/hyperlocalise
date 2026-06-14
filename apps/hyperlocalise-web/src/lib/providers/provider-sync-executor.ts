import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import {
  getTmsProviderLiveProject,
  listTmsProviderLiveProjects,
} from "@/lib/providers/tms-provider-live";
import { parseProviderProjectId } from "@/lib/providers/tms-provider-resource-id";
import { upsertExternalTmsProjectRecord } from "@/lib/projects/upsert-external-tms-project-record";
import { err, ok, type Result } from "@/lib/primitives/result/results";

type ProviderSyncIntentRow = typeof schema.providerSyncIntents.$inferSelect;

export type ProviderSyncExecutionError = {
  code: "intent_project_missing" | "provider_project_unavailable" | "unsupported_sync_kind";
  message: string;
};

async function completeProviderSyncRun(input: {
  runId: string;
  status: "succeeded" | "failed";
  errorMessage?: string;
  counts?: Record<string, number>;
}) {
  await db
    .update(schema.providerSyncRuns)
    .set({
      status: input.status,
      completedAt: new Date(),
      errorMessage: input.errorMessage ?? null,
      counts: input.counts ?? {},
    })
    .where(eq(schema.providerSyncRuns.id, input.runId));
}

async function startProviderSyncRun(intent: ProviderSyncIntentRow) {
  const encodedProject = intent.projectId ? parseProviderProjectId(intent.projectId) : null;
  const [run] = await db
    .insert(schema.providerSyncRuns)
    .values({
      organizationId: intent.organizationId,
      providerCredentialId: intent.providerCredentialId,
      providerKind: intent.providerKind,
      kind: intent.syncKind,
      status: "running",
      projectId: intent.projectId,
      externalProjectId: encodedProject?.externalProjectId,
      resourceType: intent.syncKind,
      resourceId: intent.projectId,
      externalResourceId: encodedProject?.externalProjectId,
    })
    .returning({ id: schema.providerSyncRuns.id });

  if (!run) {
    throw new Error("Failed to create provider sync run.");
  }

  return run.id;
}

async function resolveProviderSyncActorUserId(intent: ProviderSyncIntentRow) {
  if (!intent.providerCredentialId) {
    return null;
  }

  const [credential] = await db
    .select({
      createdByUserId: schema.organizationExternalTmsProviderCredentials.createdByUserId,
      updatedByUserId: schema.organizationExternalTmsProviderCredentials.updatedByUserId,
    })
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(eq(schema.organizationExternalTmsProviderCredentials.id, intent.providerCredentialId))
    .limit(1);

  return credential?.updatedByUserId ?? credential?.createdByUserId ?? null;
}

async function refreshMaterializedProjectFromLive(
  intent: ProviderSyncIntentRow,
): Promise<Result<{ runId: string }, ProviderSyncExecutionError>> {
  if (!intent.projectId || !intent.providerCredentialId) {
    return err({
      code: "intent_project_missing",
      message: "Sync intent is missing project scope.",
    });
  }

  const encodedProject = parseProviderProjectId(intent.projectId);
  if (!encodedProject) {
    return err({
      code: "intent_project_missing",
      message: "Sync intent project id is not an external TMS project.",
    });
  }

  const runId = await startProviderSyncRun(intent);
  const actorUserId = await resolveProviderSyncActorUserId(intent);
  const liveProject = await getTmsProviderLiveProject(
    intent.organizationId,
    encodedProject.externalProjectId,
    { actorUserId },
  );

  if (!liveProject) {
    await completeProviderSyncRun({
      runId,
      status: "failed",
      errorMessage: "Provider project is unavailable.",
    });
    return err({
      code: "provider_project_unavailable",
      message: "Provider project is unavailable.",
    });
  }

  await upsertExternalTmsProjectRecord({
    organizationId: intent.organizationId,
    providerCredentialId: intent.providerCredentialId,
    liveProject,
  });

  await completeProviderSyncRun({
    runId,
    status: "succeeded",
    counts: { projects: 1 },
  });

  return ok({ runId });
}

async function syncProjectCatalogFromLive(
  intent: ProviderSyncIntentRow,
): Promise<Result<{ runId: string }, ProviderSyncExecutionError>> {
  if (!intent.providerCredentialId) {
    return err({
      code: "intent_project_missing",
      message: "Sync intent is missing provider credential scope.",
    });
  }

  const runId = await startProviderSyncRun(intent);
  const actorUserId = await resolveProviderSyncActorUserId(intent);
  const liveProjects = await listTmsProviderLiveProjects(intent.organizationId, { actorUserId });
  let syncedCount = 0;

  for (const liveProject of liveProjects) {
    await upsertExternalTmsProjectRecord({
      organizationId: intent.organizationId,
      providerCredentialId: intent.providerCredentialId,
      liveProject,
    });
    syncedCount += 1;
  }

  await completeProviderSyncRun({
    runId,
    status: "succeeded",
    counts: { projects: syncedCount },
  });

  return ok({ runId });
}

export async function executeProviderSyncIntent(
  intent: ProviderSyncIntentRow,
): Promise<Result<{ runId: string }, ProviderSyncExecutionError>> {
  switch (intent.syncKind) {
    case "project_scan":
      if (!intent.projectId) {
        return syncProjectCatalogFromLive(intent);
      }
      return refreshMaterializedProjectFromLive(intent);
    case "file_key_scan": {
      const runId = await startProviderSyncRun(intent);
      await completeProviderSyncRun({
        runId,
        status: "succeeded",
        counts: { fileKeys: 0 },
      });
      return ok({ runId });
    }
    case "job_task_scan": {
      const runId = await startProviderSyncRun(intent);
      await completeProviderSyncRun({
        runId,
        status: "succeeded",
        counts: { jobs: 0 },
      });
      return ok({ runId });
    }
    default:
      return err({
        code: "unsupported_sync_kind",
        message: `Sync kind ${intent.syncKind} is not implemented yet.`,
      });
  }
}
