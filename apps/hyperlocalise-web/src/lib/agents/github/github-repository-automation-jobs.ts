import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import type { GithubRepoAutomationDispatchPayload } from "./github-repository-automation-settings";

export type GithubRepositoryAutomationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export type GithubRepositoryAutomationJobRecord = {
  id: string;
  idempotencyKey: string;
  organizationId: string;
  githubInstallationRepositoryId: string;
  githubInstallationId: string;
  githubRepositoryId: string;
  configVersion: number;
  triggerMode: "push" | "scheduled";
  status: GithubRepositoryAutomationJobStatus;
  skipReason: string | null;
  triggerBranch: string | null;
  commitBefore: string | null;
  commitAfter: string | null;
  workflows: GithubRepoAutomationDispatchPayload["workflows"];
  githubDeliveryId: string | null;
  scheduledRunAt: string | null;
  workflowRunId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type JobRow = typeof schema.githubRepositoryAutomationJobs.$inferSelect;

function serializeJob(row: JobRow): GithubRepositoryAutomationJobRecord {
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    organizationId: row.organizationId,
    githubInstallationRepositoryId: row.githubInstallationRepositoryId,
    githubInstallationId: row.githubInstallationId,
    githubRepositoryId: row.githubRepositoryId,
    configVersion: row.configVersion,
    triggerMode: row.triggerMode,
    status: row.status as GithubRepositoryAutomationJobStatus,
    skipReason: row.skipReason,
    triggerBranch: row.triggerBranch,
    commitBefore: row.commitBefore,
    commitAfter: row.commitAfter,
    workflows: row.workflows,
    githubDeliveryId: row.githubDeliveryId,
    scheduledRunAt: row.scheduledRunAt?.toISOString() ?? null,
    workflowRunId: row.workflowRunId,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export type GithubRepositoryAutomationJobClaim =
  | {
      inserted: true;
      job: GithubRepositoryAutomationJobRecord;
    }
  | {
      inserted: false;
      job: GithubRepositoryAutomationJobRecord;
    };

export async function claimGithubRepositoryAutomationJob(input: {
  idempotencyKey: string;
  organizationId: string;
  githubInstallationRepositoryId: string;
  githubInstallationId: string;
  githubRepositoryId: string;
  configVersion: number;
  triggerMode: "push" | "scheduled";
  status?: GithubRepositoryAutomationJobStatus;
  skipReason?: string | null;
  triggerBranch?: string | null;
  commitBefore?: string | null;
  commitAfter?: string | null;
  workflows?: GithubRepoAutomationDispatchPayload["workflows"];
  githubDeliveryId?: string | null;
  scheduledRunAt?: Date | null;
}): Promise<GithubRepositoryAutomationJobClaim> {
  const status = input.status ?? "queued";
  const completedAt = status === "skipped" ? new Date() : null;

  const [created] = await db
    .insert(schema.githubRepositoryAutomationJobs)
    .values({
      idempotencyKey: input.idempotencyKey,
      organizationId: input.organizationId,
      githubInstallationRepositoryId: input.githubInstallationRepositoryId,
      githubInstallationId: input.githubInstallationId,
      githubRepositoryId: input.githubRepositoryId,
      configVersion: input.configVersion,
      triggerMode: input.triggerMode,
      status,
      skipReason: input.skipReason ?? null,
      triggerBranch: input.triggerBranch ?? null,
      commitBefore: input.commitBefore ?? null,
      commitAfter: input.commitAfter ?? null,
      workflows: input.workflows ?? {
        pushSource: false,
        pullTranslations: false,
        validation: false,
      },
      githubDeliveryId: input.githubDeliveryId ?? null,
      scheduledRunAt: input.scheduledRunAt ?? null,
      completedAt,
    })
    .onConflictDoNothing({
      target: schema.githubRepositoryAutomationJobs.idempotencyKey,
    })
    .returning();

  if (created) {
    return { inserted: true, job: serializeJob(created) };
  }

  const [existing] = await db
    .select()
    .from(schema.githubRepositoryAutomationJobs)
    .where(eq(schema.githubRepositoryAutomationJobs.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (!existing) {
    throw new Error("failed to read claimed github repository automation job");
  }

  return { inserted: false, job: serializeJob(existing) };
}

export async function updateGithubRepositoryAutomationJobStatus(input: {
  jobId: string;
  status: GithubRepositoryAutomationJobStatus;
  workflowRunId?: string | null;
  lastError?: string | null;
}) {
  const isTerminal =
    input.status === "succeeded" || input.status === "failed" || input.status === "skipped";

  await db
    .update(schema.githubRepositoryAutomationJobs)
    .set({
      status: input.status,
      workflowRunId: input.workflowRunId,
      lastError: input.lastError,
      completedAt: isTerminal ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.githubRepositoryAutomationJobs.id, input.jobId));
}
