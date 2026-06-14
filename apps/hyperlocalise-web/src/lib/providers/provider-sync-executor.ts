import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ExternalTmsCredential } from "@/lib/providers/organization-external-tms-provider-credentials";
import { tmsProviderJobTaskFetchers } from "@/lib/providers/tms-provider-fetcher-registry";
import {
  getTmsProviderLiveProject,
  listTmsProviderLiveProjects,
} from "@/lib/providers/tms-provider-live";
import { resolveExternalTmsSecretMaterialForActor } from "@/lib/providers/tms-provider-content";
import {
  encodeProviderJobId,
  parseProviderProjectId,
} from "@/lib/providers/tms-provider-resource-id";
import { upsertExternalTmsJobRecords } from "@/lib/projects/upsert-external-tms-job-records";
import { upsertExternalTmsProjectRecord } from "@/lib/projects/upsert-external-tms-project-record";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { enqueueProviderProjectJobSyncIntent } from "./provider-sync-intent";
import { runTmsAgentAutomationForSyncedJob } from "./agent-runs/tms-agent-automation-runner";
import {
  createProviderAgentCommentQueue,
  createProviderAgentQaQueue,
  createProviderAgentTranslationQueue,
  createProviderAgentWritebackQueue,
} from "@/workflows/adapters";

type ProviderSyncIntentRow = typeof schema.providerSyncIntents.$inferSelect;

export type ProviderSyncExecutionError = {
  code:
    | "intent_project_missing"
    | "provider_credential_missing"
    | "provider_fetcher_unavailable"
    | "provider_project_unavailable"
    | "unsupported_sync_kind";
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

async function loadProviderSyncProjectContext(intent: ProviderSyncIntentRow): Promise<
  Result<
    {
      actorUserId: string | null;
      credential: ExternalTmsCredential;
      externalProjectId: string;
      project: typeof schema.projects.$inferSelect;
    },
    ProviderSyncExecutionError
  >
> {
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

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, intent.projectId),
        eq(schema.projects.organizationId, intent.organizationId),
        eq(schema.projects.externalProviderKind, intent.providerKind),
        eq(schema.projects.externalProjectId, encodedProject.externalProjectId),
        eq(schema.projects.source, "external_tms"),
      ),
    )
    .limit(1);

  if (!project) {
    return err({
      code: "provider_project_unavailable",
      message: "Provider project is unavailable.",
    });
  }

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.id, intent.providerCredentialId),
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, intent.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, intent.providerKind),
      ),
    )
    .limit(1);

  if (!credential) {
    return err({
      code: "provider_credential_missing",
      message: "Provider credential is unavailable.",
    });
  }

  return ok({
    actorUserId: await resolveProviderSyncActorUserId(intent),
    credential,
    externalProjectId: encodedProject.externalProjectId,
    project,
  });
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

  const projectId = await upsertExternalTmsProjectRecord({
    organizationId: intent.organizationId,
    providerCredentialId: intent.providerCredentialId,
    liveProject,
  });

  await enqueueProviderProjectJobSyncIntent({
    organizationId: intent.organizationId,
    providerCredentialId: intent.providerCredentialId,
    providerKind: intent.providerKind,
    projectId,
    cause: intent.cause,
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
    const projectId = await upsertExternalTmsProjectRecord({
      organizationId: intent.organizationId,
      providerCredentialId: intent.providerCredentialId,
      liveProject,
    });
    await enqueueProviderProjectJobSyncIntent({
      organizationId: intent.organizationId,
      providerCredentialId: intent.providerCredentialId,
      providerKind: intent.providerKind,
      projectId,
      cause: intent.cause,
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

async function syncProviderJobTasksFromLive(
  intent: ProviderSyncIntentRow,
): Promise<Result<{ runId: string }, ProviderSyncExecutionError>> {
  const context = await loadProviderSyncProjectContext(intent);
  if (context.ok === false) {
    return context;
  }

  const fetcher = tmsProviderJobTaskFetchers[intent.providerKind];
  if (!fetcher) {
    return err({
      code: "provider_fetcher_unavailable",
      message: `Job sync is not available for ${intent.providerKind}.`,
    });
  }

  const runId = await startProviderSyncRun(intent);
  const secretMaterial = await resolveExternalTmsSecretMaterialForActor({
    credential: context.value.credential,
    organizationId: intent.organizationId,
    actorUserId: context.value.actorUserId,
  });
  const tasks = await fetcher({
    organizationId: intent.organizationId,
    projectId: intent.projectId!,
    providerKind: intent.providerKind,
    externalProjectId: context.value.externalProjectId,
    credential: context.value.credential,
    project: context.value.project,
    secretMaterial,
  });
  const { upserted, newlySyncedJobIds } = await upsertExternalTmsJobRecords({
    organizationId: intent.organizationId,
    projectId: intent.projectId!,
    providerKind: intent.providerKind,
    externalProjectId: context.value.externalProjectId,
    tasks,
  });

  if (newlySyncedJobIds.length > 0) {
    const automationQueues = {
      providerAgentTranslationQueue: createProviderAgentTranslationQueue(),
      providerAgentQaQueue: createProviderAgentQaQueue(),
      providerAgentWritebackQueue: createProviderAgentWritebackQueue(),
      providerAgentCommentQueue: createProviderAgentCommentQueue(),
    };
    const tasksByJobId = new Map(
      tasks.map((task) => [
        encodeProviderJobId({
          providerKind: intent.providerKind,
          externalProjectId: context.value.externalProjectId,
          externalJobId: task.externalJobId,
        }),
        task,
      ]),
    );

    for (const hyperlocaliseJobId of newlySyncedJobIds) {
      const task = tasksByJobId.get(hyperlocaliseJobId);
      if (!task) {
        continue;
      }

      await runTmsAgentAutomationForSyncedJob({
        organizationId: intent.organizationId,
        projectId: intent.projectId!,
        providerKind: intent.providerKind,
        providerCredentialId: intent.providerCredentialId,
        hyperlocaliseJobId,
        externalJobId: task.externalJobId,
        externalTaskId: task.externalTaskId ?? null,
        targetLocales: task.targetLocales ?? [],
        isNewlySynced: true,
        queues: automationQueues,
      });
    }
  }

  await completeProviderSyncRun({
    runId,
    status: "succeeded",
    counts: { jobs: upserted },
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
      return syncProviderJobTasksFromLive(intent);
    }
    default:
      return err({
        code: "unsupported_sync_kind",
        message: `Sync kind ${intent.syncKind} is not implemented yet.`,
      });
  }
}
