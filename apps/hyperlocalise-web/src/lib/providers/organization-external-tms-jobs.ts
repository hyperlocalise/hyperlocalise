import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db, schema } from "@/lib/database";

import { mapProviderStatusToNormalized } from "./external-tms-status-mapper";
import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export async function upsertExternalJob(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
  externalTaskId?: string | null;
  externalStatus: string;
  title?: string;
  dueDate?: Date | null;
  targetLocales?: string[];
  assignedUsers?: string[];
  externalUrl?: string | null;
  providerPayload?: Record<string, unknown>;
  kind?: "translation" | "research" | "review" | "sync" | "asset_management";
}) {
  const normalizedStatus = mapProviderStatusToNormalized(input.providerKind, input.externalStatus);

  const now = new Date();

  // Try to find an existing external job for this provider + external job id
  // within the same organization and project.
  const [existing] = await db
    .select({ jobId: schema.externalJobDetails.jobId })
    .from(schema.externalJobDetails)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.externalJobDetails.jobId))
    .where(
      and(
        eq(schema.jobs.organizationId, input.organizationId),
        eq(schema.jobs.projectId, input.projectId),
        eq(schema.externalJobDetails.providerKind, input.providerKind),
        eq(schema.externalJobDetails.externalJobId, input.externalJobId),
      ),
    )
    .limit(1);

  if (existing) {
    const [updatedJob] = await db
      .update(schema.jobs)
      .set({
        status: normalizedStatus,
        updatedAt: now,
        completedAt:
          normalizedStatus === "succeeded" ||
          normalizedStatus === "failed" ||
          normalizedStatus === "cancelled"
            ? now
            : null,
      })
      .where(eq(schema.jobs.id, existing.jobId))
      .returning();

    const [updatedDetails] = await db
      .update(schema.externalJobDetails)
      .set({
        externalStatus: input.externalStatus,
        title: input.title ?? "",
        dueDate: input.dueDate ?? null,
        targetLocales: input.targetLocales ?? [],
        assignedUsers: input.assignedUsers ?? [],
        externalUrl: input.externalUrl ?? null,
        providerPayload: input.providerPayload ?? {},
        syncState: "synced",
        updatedAt: now,
      })
      .where(eq(schema.externalJobDetails.jobId, existing.jobId))
      .returning();

    return { ...updatedJob, externalDetails: updatedDetails };
  }

  // Create a new job + external details in a transaction.
  const jobId = `job_${randomUUID()}`;

  const result = await db.transaction(async (tx) => {
    const [createdJob] = await tx
      .insert(schema.jobs)
      .values({
        id: jobId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        createdByUserId: null,
        kind: input.kind ?? "translation",
        status: normalizedStatus,
        inputPayload: {},
        completedAt:
          normalizedStatus === "succeeded" ||
          normalizedStatus === "failed" ||
          normalizedStatus === "cancelled"
            ? now
            : null,
      })
      .returning();

    const [details] = await tx
      .insert(schema.externalJobDetails)
      .values({
        jobId,
        providerKind: input.providerKind,
        externalJobId: input.externalJobId,
        externalTaskId: input.externalTaskId ?? null,
        externalStatus: input.externalStatus,
        title: input.title ?? "",
        dueDate: input.dueDate ?? null,
        targetLocales: input.targetLocales ?? [],
        assignedUsers: input.assignedUsers ?? [],
        externalUrl: input.externalUrl ?? null,
        syncState: "synced",
        providerPayload: input.providerPayload ?? {},
      })
      .returning();

    return { ...createdJob, externalDetails: details };
  });

  return result;
}

export async function linkExternalJobToNativeJob(input: {
  externalJobId: string;
  nativeJobId: string;
}) {
  const [updated] = await db
    .update(schema.externalJobDetails)
    .set({
      linkedJobId: input.nativeJobId,
      updatedAt: new Date(),
    })
    .where(eq(schema.externalJobDetails.jobId, input.externalJobId))
    .returning();

  return updated ?? null;
}

export async function unlinkExternalJobFromNativeJob(input: { externalJobId: string }) {
  const [updated] = await db
    .update(schema.externalJobDetails)
    .set({
      linkedJobId: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.externalJobDetails.jobId, input.externalJobId))
    .returning();

  return updated ?? null;
}

export async function getExternalJobByProviderJobId(input: {
  organizationId: string;
  projectId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
}) {
  const [row] = await db
    .select()
    .from(schema.externalJobDetails)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.externalJobDetails.jobId))
    .where(
      and(
        eq(schema.jobs.organizationId, input.organizationId),
        eq(schema.jobs.projectId, input.projectId),
        eq(schema.externalJobDetails.providerKind, input.providerKind),
        eq(schema.externalJobDetails.externalJobId, input.externalJobId),
      ),
    )
    .limit(1);

  return row ?? null;
}
