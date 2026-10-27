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

import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
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
import { createPublicJobBodySchema } from "./public-jobs.schema";
import {
  invalidJobPayloadResponse,
  sourceFileNotFoundResponse,
  unsupportedSourceFileFormatResponse,
  sourceFileFormatMismatchResponse,
  jobQueueUnavailableResponse,
  projectNotFoundResponse,
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

export function createPublicJobRoutes(options: CreatePublicJobRoutesOptions = {}) {
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
      const projectAccessScope = await resolveApiKeyProjectAccessScope(c.var.auth.teamAccess);

      const project = await getProjectForAccessScope(projectAccessScope, payload.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      const inputPayload = payload.type === "string" ? payload.stringInput : payload.fileInput;

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
            })
            .returning();

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

      if (options.jobQueue) {
        try {
          await options.jobQueue.enqueue({
            kind: "translation",
            jobId: job.id,
            projectId: payload.projectId,
            type: payload.type,
          });
        } catch (error) {
          await db
            .update(schema.jobs)
            .set({
              status: "failed",
              lastError:
                error instanceof Error ? error.message : "translation job queue unavailable",
            })
            .where(eq(schema.jobs.id, job.id));

          await enqueueJobFailedActivity({
            ...publicApiActivityActor(c.var.auth),
            errorCode: "queue_unavailable",
            jobId: job.id,
            kind: job.kind,
            organizationId,
            projectId: job.projectId,
            status: "failed",
          });

          return jobQueueUnavailableResponse(c);
        }
      }

      return c.json({ job: { id: job.id, type: payload.type, status: "queued" } }, 201);
    },
  );
}
