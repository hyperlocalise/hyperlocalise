import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { JobKind, ProviderSyncRunStatus } from "@/lib/database/types";
import { decryptProviderCredential } from "@/lib/security/provider-credential-crypto";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import { upsertExternalJob } from "./organization-external-tms-jobs";
import {
  completeProviderSyncRun,
  failProviderSyncRun,
  startProviderSyncRun,
} from "./provider-sync-runs";

type ExternalTmsCredential = typeof schema.organizationExternalTmsProviderCredentials.$inferSelect;
type ExternalTmsProject = typeof schema.projects.$inferSelect;

export type ExternalTmsJobTaskMetadata = {
  externalJobId: string;
  externalTaskId?: string | null;
  externalStatus: string;
  title?: string | null;
  dueDate?: Date | string | null;
  targetLocales?: string[];
  assignedUsers?: string[];
  externalUrl?: string | null;
  providerPayload?: Record<string, unknown>;
  kind?: JobKind;
};

export type ExternalTmsJobTaskFetcher = (input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  credential: ExternalTmsCredential;
  project: ExternalTmsProject;
  secretMaterial: string;
}) => Promise<ExternalTmsJobTaskMetadata[]>;

export type ExternalTmsJobTaskSyncFailure = {
  externalJobId: string | null;
  externalTaskId: string | null;
  title: string | null;
  message: string;
};

export type ExternalTmsJobTaskSyncResult = {
  runId: string;
  status: Extract<ProviderSyncRunStatus, "succeeded" | "failed">;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId: string;
  counts: {
    jobTasksDiscovered: number;
    jobTasksSynced: number;
    jobTasksFailed: number;
    statusesChanged: number;
  };
  failures: ExternalTmsJobTaskSyncFailure[];
};

export async function syncExternalTmsJobTasks(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  fetchJobTasks: ExternalTmsJobTaskFetcher;
}): Promise<ExternalTmsJobTaskSyncResult> {
  const project = await getExternalTmsProject(input);

  if (!project?.externalProjectId) {
    throw new Error("external_tms_project_not_found");
  }

  const credential = await getExternalTmsCredential({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    credentialId: project.externalProviderCredentialId,
  });

  if (!credential) {
    throw new Error("provider_credential_not_found");
  }

  const run = await startProviderSyncRun({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    providerCredentialId: credential.id,
    kind: "job_task_scan",
    projectId: project.id,
    externalProjectId: project.externalProjectId,
    resourceType: "job_task",
    providerMetadata: { credentialId: credential.id },
  });

  const counts: ExternalTmsJobTaskSyncResult["counts"] = {
    jobTasksDiscovered: 0,
    jobTasksSynced: 0,
    jobTasksFailed: 0,
    statusesChanged: 0,
  };
  const failures: ExternalTmsJobTaskSyncFailure[] = [];

  try {
    const secretMaterial = decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    });
    const jobTasks = await input.fetchJobTasks({
      organizationId: input.organizationId,
      projectId: project.id,
      providerKind: input.providerKind,
      externalProjectId: project.externalProjectId,
      credential,
      project,
      secretMaterial,
    });

    counts.jobTasksDiscovered = jobTasks.length;

    for (const jobTask of jobTasks) {
      try {
        const previous = await getExistingExternalJobStatus({
          organizationId: input.organizationId,
          providerKind: input.providerKind,
          externalJobId: jobTask.externalJobId,
        });
        const synced = await upsertExternalJob({
          organizationId: input.organizationId,
          projectId: project.id,
          providerKind: input.providerKind,
          externalJobId: jobTask.externalJobId,
          externalTaskId: jobTask.externalTaskId ?? null,
          externalStatus: jobTask.externalStatus,
          title: jobTask.title ?? undefined,
          dueDate: normalizeDueDate(jobTask.dueDate),
          targetLocales: jobTask.targetLocales,
          assignedUsers: jobTask.assignedUsers,
          externalUrl: jobTask.externalUrl ?? null,
          providerPayload: jobTask.providerPayload,
          kind: jobTask.kind,
        });

        counts.jobTasksSynced += 1;
        if (previous && previous !== synced.status) {
          counts.statusesChanged += 1;
        }
      } catch (error) {
        counts.jobTasksFailed += 1;
        failures.push({
          externalJobId: jobTask.externalJobId ?? null,
          externalTaskId: jobTask.externalTaskId ?? null,
          title: jobTask.title ?? null,
          message: error instanceof Error ? error.message : "job task sync failed",
        });
      }
    }

    const status = failures.length > 0 ? "failed" : "succeeded";
    const finishInput = {
      runId: run.id,
      organizationId: run.organizationId,
      counts,
      providerMetadata: {
        credentialId: credential.id,
        failures,
      },
    };

    if (status === "failed") {
      await failProviderSyncRun({
        ...finishInput,
        errorMessage: "One or more provider jobs/tasks failed to sync",
        errorDetails: { failures },
      });
    } else {
      await completeProviderSyncRun(finishInput);
    }

    return {
      runId: run.id,
      status,
      providerKind: input.providerKind,
      providerCredentialId: credential.id,
      projectId: project.id,
      counts,
      failures,
    };
  } catch (error) {
    await failProviderSyncRun({
      runId: run.id,
      organizationId: run.organizationId,
      errorMessage: error instanceof Error ? error.message : "provider job/task sync failed",
      errorDetails: {
        name: error instanceof Error ? error.name : "UnknownError",
        stack: error instanceof Error ? error.stack : undefined,
      },
      counts,
      providerMetadata: { credentialId: credential.id },
    });
    throw error;
  }
}

async function getExternalTmsProject(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
}) {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.externalProviderKind, input.providerKind),
        eq(schema.projects.source, "external_tms"),
      ),
    )
    .limit(1);

  return project ?? null;
}

async function getExternalTmsCredential(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  credentialId: string | null;
}) {
  const filters = [
    eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
    eq(schema.organizationExternalTmsProviderCredentials.providerKind, input.providerKind),
  ];

  if (input.credentialId) {
    filters.push(eq(schema.organizationExternalTmsProviderCredentials.id, input.credentialId));
  }

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(and(...filters))
    .limit(1);

  return credential ?? null;
}

async function getExistingExternalJobStatus(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
}) {
  const [row] = await db
    .select({ status: schema.jobs.status })
    .from(schema.externalJobDetails)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.externalJobDetails.jobId))
    .where(
      and(
        eq(schema.externalJobDetails.organizationId, input.organizationId),
        eq(schema.externalJobDetails.providerKind, input.providerKind),
        eq(schema.externalJobDetails.externalJobId, input.externalJobId),
      ),
    )
    .limit(1);

  return row?.status ?? null;
}

function normalizeDueDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
