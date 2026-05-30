import { and, asc, desc, eq, isNotNull } from "drizzle-orm";

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
  resultSummary: Record<string, unknown> | null;
  githubDeliveryId: string | null;
  scheduledRunAt: string | null;
  workflowRunId: string | null;
  githubCheckRunId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type GithubRepositoryAutomationJobWithRepository = GithubRepositoryAutomationJobRecord & {
  organizationSlug: string | null;
  repositoryFullName: string;
  defaultBranch: string | null;
};

type JobRow = typeof schema.githubRepositoryAutomationJobs.$inferSelect;

function normalizeJobWorkflows(
  workflows: JobRow["workflows"],
): GithubRepoAutomationDispatchPayload["workflows"] {
  return {
    pushSource: workflows.pushSource,
    pullTranslations: workflows.pullTranslations,
    validation: workflows.validation,
    validationBlockOnFailure: workflows.validationBlockOnFailure ?? true,
  };
}

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
    workflows: normalizeJobWorkflows(row.workflows),
    resultSummary: (row.resultSummary as Record<string, unknown> | null) ?? null,
    githubDeliveryId: row.githubDeliveryId,
    scheduledRunAt: row.scheduledRunAt?.toISOString() ?? null,
    workflowRunId: row.workflowRunId,
    githubCheckRunId: row.githubCheckRunId,
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

export async function getGithubRepositoryAutomationJobById(
  jobId: string,
): Promise<GithubRepositoryAutomationJobWithRepository | null> {
  const [row] = await db
    .select({
      job: schema.githubRepositoryAutomationJobs,
      repository: schema.githubInstallationRepositories,
      organizationSlug: schema.organizations.slug,
    })
    .from(schema.githubRepositoryAutomationJobs)
    .innerJoin(
      schema.githubInstallationRepositories,
      eq(
        schema.githubRepositoryAutomationJobs.githubInstallationRepositoryId,
        schema.githubInstallationRepositories.id,
      ),
    )
    .innerJoin(
      schema.organizations,
      eq(schema.githubRepositoryAutomationJobs.organizationId, schema.organizations.id),
    )
    .where(eq(schema.githubRepositoryAutomationJobs.id, jobId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    ...serializeJob(row.job),
    organizationSlug: row.organizationSlug,
    repositoryFullName: row.repository.fullName,
    defaultBranch: row.repository.defaultBranch,
  };
}

export async function listQueuedGithubRepositoryAutomationJobs(input: {
  limit?: number;
}): Promise<GithubRepositoryAutomationJobRecord[]> {
  const rows = await db
    .select()
    .from(schema.githubRepositoryAutomationJobs)
    .where(eq(schema.githubRepositoryAutomationJobs.status, "queued"))
    .orderBy(asc(schema.githubRepositoryAutomationJobs.createdAt))
    .limit(input.limit ?? 20);

  return rows.map(serializeJob);
}

export async function claimGithubRepositoryAutomationJobForRunning(input: {
  jobId: string;
  workflowRunId?: string | null;
}): Promise<GithubRepositoryAutomationJobRecord | null> {
  const [row] = await db
    .update(schema.githubRepositoryAutomationJobs)
    .set({
      status: "running",
      workflowRunId: input.workflowRunId ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.githubRepositoryAutomationJobs.id, input.jobId),
        eq(schema.githubRepositoryAutomationJobs.status, "queued"),
      ),
    )
    .returning();

  return row ? serializeJob(row) : null;
}

export async function updateGithubRepositoryAutomationJobStatus(input: {
  jobId: string;
  status: GithubRepositoryAutomationJobStatus;
  workflowRunId?: string | null;
  skipReason?: string | null;
  lastError?: string | null;
  resultSummary?: Record<string, unknown> | null;
  githubCheckRunId?: string | null;
}) {
  const isTerminal =
    input.status === "succeeded" || input.status === "failed" || input.status === "skipped";

  await db
    .update(schema.githubRepositoryAutomationJobs)
    .set({
      status: input.status,
      workflowRunId: input.workflowRunId,
      skipReason: input.skipReason,
      lastError: input.lastError ?? null,
      resultSummary: input.resultSummary ?? null,
      githubCheckRunId: input.githubCheckRunId,
      completedAt: isTerminal ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.githubRepositoryAutomationJobs.id, input.jobId));
}

export async function findLatestSucceededCommitAfter(input: {
  githubInstallationRepositoryId: string;
}): Promise<string | null> {
  const [row] = await db
    .select({ commitAfter: schema.githubRepositoryAutomationJobs.commitAfter })
    .from(schema.githubRepositoryAutomationJobs)
    .where(
      and(
        eq(
          schema.githubRepositoryAutomationJobs.githubInstallationRepositoryId,
          input.githubInstallationRepositoryId,
        ),
        eq(schema.githubRepositoryAutomationJobs.status, "succeeded"),
        isNotNull(schema.githubRepositoryAutomationJobs.commitAfter),
      ),
    )
    .orderBy(desc(schema.githubRepositoryAutomationJobs.createdAt))
    .limit(1);

  return row?.commitAfter ?? null;
}
