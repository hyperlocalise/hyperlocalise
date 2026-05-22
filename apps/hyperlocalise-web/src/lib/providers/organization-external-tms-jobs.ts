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
  const jobId = `job_${randomUUID()}`;

  const jobValues = {
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
  };

  const detailsValues = {
    organizationId: input.organizationId,
    externalTaskId: input.externalTaskId ?? null,
    externalStatus: input.externalStatus,
    title: input.title ?? "",
    dueDate: input.dueDate ?? null,
    targetLocales: input.targetLocales ?? [],
    assignedUsers: input.assignedUsers ?? [],
    externalUrl: input.externalUrl ?? null,
    syncState: "synced",
    providerPayload: input.providerPayload ?? {},
  };

  return await db.transaction(async (tx) => {
    const [createdJob] = await tx
      .insert(schema.jobs)
      .values({ id: jobId, ...jobValues })
      .returning();

    const [details] = await tx
      .insert(schema.externalJobDetails)
      .values({
        jobId,
        providerKind: input.providerKind,
        externalJobId: input.externalJobId,
        ...detailsValues,
      })
      .onConflictDoUpdate({
        target: [
          schema.externalJobDetails.organizationId,
          schema.externalJobDetails.externalJobId,
          schema.externalJobDetails.providerKind,
        ],
        set: {
          ...detailsValues,
          updatedAt: now,
        },
      })
      .returning();

    if (details.jobId !== jobId) {
      await tx.delete(schema.jobs).where(eq(schema.jobs.id, jobId));

      const [updatedJob] = await tx
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
        .where(eq(schema.jobs.id, details.jobId))
        .returning();

      return { ...updatedJob, externalDetails: details };
    }

    return { ...createdJob, externalDetails: details };
  });
}

export async function linkExternalJobToNativeJob(input: { jobId: string; nativeJobId: string }) {
  const [updated] = await db
    .update(schema.externalJobDetails)
    .set({
      linkedJobId: input.nativeJobId,
      updatedAt: new Date(),
    })
    .where(eq(schema.externalJobDetails.jobId, input.jobId))
    .returning();

  return updated ?? null;
}

export async function unlinkExternalJobFromNativeJob(input: { jobId: string }) {
  const [updated] = await db
    .update(schema.externalJobDetails)
    .set({
      linkedJobId: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.externalJobDetails.jobId, input.jobId))
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
