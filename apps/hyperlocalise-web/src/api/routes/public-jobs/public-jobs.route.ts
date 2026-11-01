/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { validator } from "hono/validator";

import {
  publicApiActivityActor,
  requireApiKeyPermission,
  storedOrganizationApiKeyId,
  type ApiKeyAuthVariables,
} from "@/api/auth/api-key";
import { publicApiAuthMiddleware } from "@/api/auth/workos-agent";
import type { ApiAuthContext } from "@/api/auth/workos";
import { getAccessibleProjectIds, hasOrganizationWideProjectAccess } from "@/api/auth/team-access";
import { badRequestResponse } from "@/api/response.schema";
import { rejectIfAiFeaturesUnavailable } from "@/api/billing/ai-features-response";
import { db, schema } from "@/lib/database/client";
import {
  formatUsageControlError,
  reserveUsageEvent,
  usageFeatureIds,
} from "@/lib/billing/usage-control";
import { validateJobLocalesAgainstProject } from "@/lib/i18n/project-job-locales";
import {
  ensureRepositorySourceFileVersionForStoredFile,
  getStoredFileForJobScope,
} from "@/lib/file-storage/records";
import { isErr } from "@/lib/primitives/result/results";
import {
  enqueueJobCreatedActivity,
  enqueueJobFailedActivity,
} from "@/lib/activity-log/job-automation-events";
import {
  assertOrganizationCanEnqueueTranslationJobInTransaction,
  OrganizationJobBudgetExceededError,
} from "@/lib/security/organization-operation-budget";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

import {
  canAccessStoredFileWithProjectScope,
  type ApiKeyProjectAccessScope,
} from "./public-jobs.access";
import {
  createPublicJobBodySchema,
  hashPublicJobRequest,
  publicJobIdempotencyKeySchema,
  type CreatePublicJobBody,
} from "./public-jobs.schema";
import {
  invalidJobPayloadResponse,
  sourceFileNotFoundResponse,
  unsupportedSourceFileFormatResponse,
  sourceFileFormatMismatchResponse,
  jobQueueUnavailableResponse,
  projectNotFoundResponse,
  ownerNotFoundResponse,
  invalidIdempotencyKeyResponse,
  idempotencyKeyReusedResponse,
  publicJobQueueUnavailableError,
} from "./public-jobs.shared";

const validateCreateJobBody = validator("json", (value, c) => {
  const parsed = createPublicJobBodySchema.safeParse(value);
  if (!parsed.success) {
    return invalidJobPayloadResponse(c);
  }
  return parsed.data;
});

type CreatePublicJobRoutesOptions = {
  jobQueue?: JobQueue<TranslationJobEventData>;
};

async function resolveApiKeyProjectAccessScope(
  teamAccess: ApiAuthContext,
): Promise<ApiKeyProjectAccessScope> {
  const organizationId = teamAccess.organization.localOrganizationId;
  return {
    organizationId,
    accessibleProjectIds: hasOrganizationWideProjectAccess(teamAccess)
      ? null
      : await getAccessibleProjectIds(teamAccess),
  };
}

async function getProjectForAccessScope(scope: ApiKeyProjectAccessScope, projectId: string) {
  if (scope.accessibleProjectIds && !scope.accessibleProjectIds.includes(projectId)) {
    return null;
  }

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.organizationId, scope.organizationId),
      ),
    )
    .limit(1);

  return project ?? null;
}

/** Thrown inside the create transaction when another request already holds the idempotency key. */
class PublicJobIdempotencyConflictError extends Error {}

type PublicJobIdempotency = { key: string; requestHash: string };

type ReplayedPublicJob = {
  id: string;
  type: "string" | "file";
  status: string;
  lastError: string | null;
  outcomeKind: string | null;
};

function publicJobCreateResult(job: { id: string; type: "string" | "file"; status: string }) {
  return { id: job.id, type: job.type, status: job.status };
}

function isRecoverableQueueFailure(job: ReplayedPublicJob) {
  return (
    job.status === "failed" &&
    job.lastError === publicJobQueueUnavailableError &&
    job.outcomeKind == null
  );
}

/**
 * The job an earlier request with this idempotency key created: `replayed` when the body matches,
 * `reused` when the key came with a different body, null when the key is new.
 */
async function findIdempotentPublicJob(organizationId: string, idempotency: PublicJobIdempotency) {
  const [existing] = await db
    .select({
      requestHash: schema.publicJobIdempotencyKeys.requestHash,
      id: schema.jobs.id,
      status: schema.jobs.status,
      type: schema.translationJobDetails.type,
      lastError: schema.jobs.lastError,
      outcomeKind: schema.translationJobDetails.outcomeKind,
    })
    .from(schema.publicJobIdempotencyKeys)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.publicJobIdempotencyKeys.jobId))
    .innerJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(
      and(
        eq(schema.publicJobIdempotencyKeys.organizationId, organizationId),
        eq(schema.publicJobIdempotencyKeys.key, idempotency.key),
      ),
    )
    .limit(1);

  if (!existing) {
    return null;
  }
  if (existing.requestHash !== idempotency.requestHash) {
    return { kind: "reused" as const };
  }
  return {
    kind: "replayed" as const,
    job: {
      id: existing.id,
      type: existing.type,
      status: existing.status,
      lastError: existing.lastError,
      outcomeKind: existing.outcomeKind,
    },
  };
}

/** Claims a failed create-time enqueue so only one retry re-queues the job. */
async function reclaimPublicJobAfterQueueFailure(jobId: string) {
  const [updated] = await db
    .update(schema.jobs)
    .set({
      status: "queued",
      lastError: null,
    })
    .where(
      and(
        eq(schema.jobs.id, jobId),
        eq(schema.jobs.status, "failed"),
        eq(schema.jobs.lastError, publicJobQueueUnavailableError),
      ),
    )
    .returning({ id: schema.jobs.id });
  return updated ?? null;
}

/** Finds the workspace member a client names as the job's owner, matching email without case. */
async function findPublicJobOwner(organizationId: string, email: string) {
  const [owner] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(
      schema.organizationMemberships,
      eq(schema.organizationMemberships.userId, schema.users.id),
    )
    .where(
      and(
        sql`lower(${schema.users.email}) = lower(${email})`,
        eq(schema.organizationMemberships.organizationId, organizationId),
      ),
    )
    .limit(1);
  return owner ?? null;
}

export function createPublicJobRoutes(options: CreatePublicJobRoutesOptions = {}) {
  async function enqueueCreatedPublicJob(input: {
    actor: ReturnType<typeof publicApiActivityActor>;
    jobId: string;
    kind: string;
    organizationId: string;
    projectId: string;
    type: CreatePublicJobBody["type"];
  }) {
    if (!options.jobQueue) {
      return true;
    }
    try {
      await options.jobQueue.enqueue({
        kind: "translation",
        jobId: input.jobId,
        projectId: input.projectId,
        type: input.type,
      });
      return true;
    } catch {
      await db
        .update(schema.jobs)
        .set({
          status: "failed",
          lastError: publicJobQueueUnavailableError,
        })
        .where(eq(schema.jobs.id, input.jobId));

      await enqueueJobFailedActivity({
        ...input.actor,
        errorCode: "queue_unavailable",
        jobId: input.jobId,
        kind: input.kind,
        organizationId: input.organizationId,
        projectId: input.projectId,
        status: "failed",
      });
      return false;
    }
  }

  async function replayIdempotentPublicJob(
    c: Context<{ Variables: ApiKeyAuthVariables }>,
    earlier: ReplayedPublicJob,
    payload: CreatePublicJobBody,
    organizationId: string,
    idempotency: PublicJobIdempotency,
  ) {
    if (isRecoverableQueueFailure(earlier)) {
      const claimed = await reclaimPublicJobAfterQueueFailure(earlier.id);
      if (claimed) {
        const enqueued = await enqueueCreatedPublicJob({
          actor: publicApiActivityActor(c.var.auth),
          jobId: earlier.id,
          kind: "translation",
          organizationId,
          projectId: payload.projectId,
          type: payload.type,
        });
        if (!enqueued) {
          return jobQueueUnavailableResponse(c);
        }
        c.header("Idempotent-Replayed", "true");
        return c.json(
          { job: publicJobCreateResult({ id: earlier.id, type: earlier.type, status: "queued" }) },
          200,
        );
      }
      const current = await findIdempotentPublicJob(organizationId, idempotency);
      if (current?.kind === "replayed") {
        c.header("Idempotent-Replayed", "true");
        return c.json({ job: publicJobCreateResult(current.job) }, 200);
      }
    }

    c.header("Idempotent-Replayed", "true");
    return c.json({ job: publicJobCreateResult(earlier) }, 200);
  }

  return new Hono<{ Variables: ApiKeyAuthVariables }>().use("*", publicApiAuthMiddleware).post(
    "/",
    requireApiKeyPermission("jobs:write"),
    bodyLimit({
      maxSize: 1024 * 1024, // 1MB
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
    validateCreateJobBody,
    async (c) => {
      const payload = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;

      let idempotency: PublicJobIdempotency | null = null;
      const idempotencyKeyHeader = c.req.header("idempotency-key");
      if (idempotencyKeyHeader !== undefined) {
        const parsedKey = publicJobIdempotencyKeySchema.safeParse(idempotencyKeyHeader);
        if (!parsedKey.success) {
          return invalidIdempotencyKeyResponse(c);
        }
        idempotency = { key: parsedKey.data, requestHash: hashPublicJobRequest(payload) };
      }
      const projectAccessScope = await resolveApiKeyProjectAccessScope(c.var.auth.teamAccess);

      const project = await getProjectForAccessScope(projectAccessScope, payload.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      // A matching body names the same project, so the access check above covers a replay too.
      if (idempotency) {
        const earlier = await findIdempotentPublicJob(organizationId, idempotency);
        if (earlier?.kind === "reused") {
          return idempotencyKeyReusedResponse(c);
        }
        if (earlier?.kind === "replayed") {
          return replayIdempotentPublicJob(c, earlier.job, payload, organizationId, idempotency);
        }
      }

      const baseInputPayload = payload.type === "string" ? payload.stringInput : payload.fileInput;
      const title = payload.title?.trim();
      const description = payload.description?.trim();
      // Title and description live in metadata, where the in-app job editor keeps them.
      const inputPayload =
        title || description
          ? {
              ...baseInputPayload,
              metadata: {
                ...baseInputPayload.metadata,
                ...(title ? { title } : {}),
                ...(description ? { description } : {}),
              },
            }
          : baseInputPayload;

      const localeValidation = validateJobLocalesAgainstProject(project, {
        sourceLocale: inputPayload.sourceLocale,
        targetLocales: inputPayload.targetLocales,
      });
      if (isErr(localeValidation)) {
        return badRequestResponse(c, localeValidation.error.code, localeValidation.error.message);
      }

      const aiFeaturesDenied = await rejectIfAiFeaturesUnavailable(c, organizationId);
      if (aiFeaturesDenied) {
        return aiFeaturesDenied;
      }

      let ownerUserId: string | null = null;
      if (payload.ownerEmail) {
        const owner = await findPublicJobOwner(organizationId, payload.ownerEmail);
        if (!owner) {
          return ownerNotFoundResponse(c);
        }
        ownerUserId = owner.id;
      }

      if (payload.type === "file") {
        const sourceFile = await getStoredFileForJobScope({
          organizationId,
          projectId: payload.projectId,
          fileId: payload.fileInput.sourceFileId,
        });

        if (
          !sourceFile ||
          !canAccessStoredFileWithProjectScope(c.var.auth.teamAccess, projectAccessScope, {
            organizationId: sourceFile.organizationId,
            projectId: sourceFile.projectId,
            createdByUserId: sourceFile.createdByUserId,
          })
        ) {
          return sourceFileNotFoundResponse(c);
        }

        const inferredFileFormat = inferSupportedFileTranslationFileFormat(sourceFile.filename);
        if (!inferredFileFormat) {
          return unsupportedSourceFileFormatResponse(c);
        }

        if (inferredFileFormat !== payload.fileInput.fileFormat) {
          return sourceFileFormatMismatchResponse(c, inferredFileFormat);
        }
      }

      const jobId = `job_${randomUUID()}`;
      let job;
      try {
        [job] = await db.transaction(async (tx) => {
          const jobBudget = await assertOrganizationCanEnqueueTranslationJobInTransaction(
            tx,
            organizationId,
          );
          if (isErr(jobBudget)) {
            throw new OrganizationJobBudgetExceededError(jobBudget.error);
          }

          const sourceFileVersion =
            payload.type === "file"
              ? await ensureRepositorySourceFileVersionForStoredFile({
                  db: tx,
                  organizationId,
                  projectId: payload.projectId,
                  fileId: payload.fileInput.sourceFileId,
                })
              : null;

          const [createdJob] = await tx
            .insert(schema.jobs)
            .values({
              id: jobId,
              organizationId,
              projectId: payload.projectId,
              kind: "translation",
              status: "queued",
              inputPayload,
              apiKeyId: storedOrganizationApiKeyId(c.var.auth),
              ownerUserId,
              assigneeType: ownerUserId ? "user" : null,
              dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
            })
            .returning();

          if (idempotency) {
            // A concurrent request with the same key waits here until the first commits, then
            // finds the key taken and rolls back its own job.
            const [claimed] = await tx
              .insert(schema.publicJobIdempotencyKeys)
              .values({
                organizationId,
                key: idempotency.key,
                requestHash: idempotency.requestHash,
                jobId,
              })
              .onConflictDoNothing()
              .returning({ jobId: schema.publicJobIdempotencyKeys.jobId });
            if (!claimed) {
              throw new PublicJobIdempotencyConflictError();
            }
          }

          const [details] = await tx
            .insert(schema.translationJobDetails)
            .values({
              jobId,
              type: payload.type,
              sourceFileVersionId: sourceFileVersion?.id ?? null,
            })
            .returning();

          const usageEventResult = await reserveUsageEvent({
            db: tx,
            organizationId,
            featureId: usageFeatureIds.translationJobs,
            operationKey: `job:${jobId}:translation_jobs`,
            source: "translation_job_create",
            jobId,
            quantity: 1,
          });
          if (isErr(usageEventResult)) {
            throw new Error(formatUsageControlError(usageEventResult.error));
          }

          return [{ ...createdJob, type: details.type }];
        });
      } catch (error) {
        if (error instanceof OrganizationJobBudgetExceededError) {
          return c.json({ error: error.budgetError.code, message: error.budgetError.message }, 429);
        }
        if (error instanceof PublicJobIdempotencyConflictError && idempotency) {
          const earlier = await findIdempotentPublicJob(organizationId, idempotency);
          if (earlier?.kind === "replayed") {
            return replayIdempotentPublicJob(c, earlier.job, payload, organizationId, idempotency);
          }
          return idempotencyKeyReusedResponse(c);
        }
        throw error;
      }

      await enqueueJobCreatedActivity({
        ...publicApiActivityActor(c.var.auth),
        jobId: job.id,
        kind: job.kind,
        organizationId,
        projectId: job.projectId,
        status: job.status,
      });

      const enqueued = await enqueueCreatedPublicJob({
        actor: publicApiActivityActor(c.var.auth),
        jobId: job.id,
        kind: job.kind,
        organizationId,
        projectId: payload.projectId,
        type: payload.type,
      });
      if (!enqueued) {
        return jobQueueUnavailableResponse(c);
      }

      return c.json({ job: { id: job.id, type: payload.type, status: "queued" } }, 201);
    },
  );
}
