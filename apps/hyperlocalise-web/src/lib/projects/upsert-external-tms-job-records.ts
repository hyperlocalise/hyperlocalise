import { and, eq, inArray, ne, notInArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { encodeProviderJobId } from "@/lib/providers/tms-provider-resource-id";
import {
  mapProviderStatusToNormalized,
  type ExternalTmsJobTaskMetadata,
} from "@/lib/providers/tms-provider-types";

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildJobInputPayload(input: {
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  task: ExternalTmsJobTaskMetadata;
}) {
  return {
    source: "external_tms",
    providerKind: input.providerKind,
    externalProjectId: input.externalProjectId,
    externalJobId: input.task.externalJobId,
    externalTaskId: input.task.externalTaskId ?? null,
  };
}

export async function upsertExternalTmsJobRecords(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalProjectId: string;
  tasks: ExternalTmsJobTaskMetadata[];
}) {
  const now = new Date();
  let upserted = 0;
  const newlySyncedJobIds: string[] = [];

  const candidateJobIds = input.tasks.map((task) =>
    encodeProviderJobId({
      providerKind: input.providerKind,
      externalProjectId: input.externalProjectId,
      externalJobId: task.externalJobId,
    }),
  );
  const existingJobRows =
    candidateJobIds.length > 0
      ? await db
          .select({ id: schema.jobs.id })
          .from(schema.jobs)
          .where(inArray(schema.jobs.id, candidateJobIds))
      : [];
  const existingJobIds = new Set(existingJobRows.map((row) => row.id));

  for (const task of input.tasks) {
    const jobId = encodeProviderJobId({
      providerKind: input.providerKind,
      externalProjectId: input.externalProjectId,
      externalJobId: task.externalJobId,
    });
    const isNewlySynced = !existingJobIds.has(jobId);
    const status = mapProviderStatusToNormalized(input.providerKind, task.externalStatus);
    const completedAt =
      status === "succeeded" || status === "failed" ? normalizeDate(task.completedAt) : null;
    const dueDate = normalizeDate(task.dueDate);
    const inputPayload = buildJobInputPayload({
      providerKind: input.providerKind,
      externalProjectId: input.externalProjectId,
      task,
    });

    await db.transaction(async (tx) => {
      await tx
        .insert(schema.jobs)
        .values({
          id: jobId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          createdByUserId: null,
          ownerUserId: null,
          kind: task.kind ?? "translation",
          status,
          inputPayload,
          completedAt,
        })
        .onConflictDoUpdate({
          target: schema.jobs.id,
          set: {
            projectId: input.projectId,
            kind: task.kind ?? "translation",
            status,
            inputPayload,
            completedAt,
            updatedAt: now,
          },
        });

      await tx
        .insert(schema.externalJobDetails)
        .values({
          jobId,
          organizationId: input.organizationId,
          providerKind: input.providerKind,
          externalJobId: task.externalJobId,
          externalTaskId: task.externalTaskId ?? null,
          externalStatus: task.externalStatus,
          title: task.title ?? "Untitled task",
          dueDate,
          targetLocales: task.targetLocales ?? [],
          assignedUsers: task.assignedUsers ?? [],
          externalUrl: task.externalUrl ?? null,
          syncState: "synced",
          providerPayload: task.providerPayload ?? {},
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            schema.externalJobDetails.organizationId,
            schema.externalJobDetails.externalJobId,
            schema.externalJobDetails.providerKind,
          ],
          set: {
            externalTaskId: task.externalTaskId ?? null,
            externalStatus: task.externalStatus,
            title: task.title ?? "Untitled task",
            dueDate,
            targetLocales: task.targetLocales ?? [],
            assignedUsers: task.assignedUsers ?? [],
            externalUrl: task.externalUrl ?? null,
            syncState: "synced",
            providerPayload: task.providerPayload ?? {},
            updatedAt: now,
          },
        });
    });

    upserted += 1;
    if (isNewlySynced) {
      newlySyncedJobIds.push(jobId);
    }
  }

  const removed = await reconcileMissingExternalTmsJobs({
    organizationId: input.organizationId,
    projectId: input.projectId,
    providerKind: input.providerKind,
    syncedJobIds: candidateJobIds,
  });

  if (upserted > 0 || removed > 0) {
    await db
      .update(schema.projects)
      .set({
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, input.organizationId),
        ),
      );
  }

  return { upserted, newlySyncedJobIds, removed };
}

function externalTmsJobsScope(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
}) {
  return and(
    eq(schema.jobs.organizationId, input.organizationId),
    eq(schema.jobs.projectId, input.projectId),
    eq(schema.externalJobDetails.providerKind, input.providerKind),
    ne(schema.externalJobDetails.syncState, "removed"),
  );
}

async function cancelExternalTmsJobs(jobIds: string[]) {
  if (jobIds.length === 0) {
    return 0;
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(schema.jobs)
      .set({
        status: "cancelled",
        completedAt: now,
        updatedAt: now,
      })
      .where(inArray(schema.jobs.id, jobIds));

    await tx
      .update(schema.externalJobDetails)
      .set({
        externalStatus: "removed_from_provider",
        syncState: "removed",
        updatedAt: now,
      })
      .where(inArray(schema.externalJobDetails.jobId, jobIds));
  });

  return jobIds.length;
}

export async function removeAllExternalTmsJobsForProject(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
}) {
  const staleJobs = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .innerJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
    .where(externalTmsJobsScope(input));

  return cancelExternalTmsJobs(staleJobs.map((job) => job.id));
}

export async function reconcileMissingExternalTmsJobs(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  syncedJobIds: string[];
}) {
  if (input.syncedJobIds.length === 0) {
    return 0;
  }

  const staleJobs = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .innerJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
    .where(and(externalTmsJobsScope(input), notInArray(schema.jobs.id, input.syncedJobIds)));

  return cancelExternalTmsJobs(staleJobs.map((job) => job.id));
}
