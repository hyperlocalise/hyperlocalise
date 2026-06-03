import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { validator } from "hono/validator";

import {
  apiKeyAuthMiddleware,
  requireApiKeyPermission,
  type ApiKeyAuthVariables,
} from "@/api/auth/api-key";
import { badRequestResponse } from "@/api/errors";
import { db, schema } from "@/lib/database";
import {
  formatUsageControlError,
  reserveUsageEvent,
  usageFeatureIds,
} from "@/lib/billing/usage-control";
import { validateJobLocalesAgainstProject } from "@/lib/i18n/project-job-locales";
import {
  ensureRepositorySourceFileVersionForStoredFile,
  getStoredFileForJobScope,
  normalizeSourcePath,
} from "@/lib/file-storage/records";
import { isErr } from "@/lib/primitives/result/results";
import { assertOrganizationCanEnqueueTranslationJob } from "@/lib/security/organization-operation-budget";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

import {
  createPublicJobBodySchema,
  jobIdParamsSchema,
  latestPublicJobQuerySchema,
} from "./public-jobs.schema";
import {
  invalidJobPayloadResponse,
  jobNotFoundResponse,
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

const validateJobIdParams = validator("param", (value, c) => {
  const parsed = jobIdParamsSchema.safeParse(value);
  if (!parsed.success) {
    return jobNotFoundResponse(c);
  }
  return parsed.data;
});

const validateLatestPublicJobQuery = validator("query", (value, c) => {
  const parsed = latestPublicJobQuerySchema.safeParse(value);
  if (!parsed.success) {
    return invalidJobPayloadResponse(c);
  }
  return parsed.data;
});

type CreatePublicJobRoutesOptions = {
  jobQueue?: JobQueue<TranslationJobEventData>;
};

type PublicJobOutputFile = {
  fileId: string;
  locale: string;
  filename: string;
};

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPublicJobOutputFile(value: unknown): value is PublicJobOutputFile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return hasValue(candidate.fileId) && hasValue(candidate.locale) && hasValue(candidate.filename);
}

function publicJobOutputFiles(input: {
  type: string | null;
  outcomeKind: string | null;
  outcomePayload: unknown;
}) {
  if (input.type !== "file" || input.outcomeKind !== "file_result") {
    return null;
  }

  if (!input.outcomePayload || typeof input.outcomePayload !== "object") {
    return null;
  }

  const outputFiles = (input.outcomePayload as Record<string, unknown>).outputFiles;
  if (!Array.isArray(outputFiles) || !outputFiles.every(isPublicJobOutputFile)) {
    return null;
  }

  return outputFiles.map((outputFile) => ({
    fileId: outputFile.fileId,
    locale: outputFile.locale,
    filename: outputFile.filename,
  }));
}

async function getProjectForOrganization(organizationId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)),
    )
    .limit(1);

  return project ?? null;
}

export function createPublicJobRoutes(options: CreatePublicJobRoutesOptions = {}) {
  return new Hono<{ Variables: ApiKeyAuthVariables }>()
    .use("*", apiKeyAuthMiddleware)
    .post(
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

        const project = await getProjectForOrganization(organizationId, payload.projectId);

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

        const jobBudget = await assertOrganizationCanEnqueueTranslationJob(organizationId);
        if (isErr(jobBudget)) {
          return c.json({ error: jobBudget.error.code, message: jobBudget.error.message }, 429);
        }

        if (payload.type === "file") {
          const sourceFile = await getStoredFileForJobScope({
            organizationId,
            projectId: payload.projectId,
            fileId: payload.fileInput.sourceFileId,
          });

          if (!sourceFile) {
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
        const [job] = await db.transaction(async (tx) => {
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
              apiKeyId: c.var.auth.apiKey.id,
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

            return jobQueueUnavailableResponse(c);
          }
        }

        return c.json({ job: { id: job.id, type: payload.type, status: "queued" } }, 201);
      },
    )
    .get(
      "/latest",
      requireApiKeyPermission("jobs:read"),
      validateLatestPublicJobQuery,
      async (c) => {
        const query = c.req.valid("query");
        const organizationId = c.var.auth.organization.localOrganizationId;
        const sourcePath = normalizeSourcePath(query.sourcePath);
        const project = await getProjectForOrganization(organizationId, query.projectId);

        if (!project) {
          return projectNotFoundResponse(c);
        }

        const [job] = await db
          .select({
            id: schema.jobs.id,
            projectId: schema.jobs.projectId,
            type: schema.translationJobDetails.type,
            status: schema.jobs.status,
            outcomeKind: schema.translationJobDetails.outcomeKind,
            outcomePayload: schema.jobs.outcomePayload,
            lastError: schema.jobs.lastError,
            createdAt: schema.jobs.createdAt,
            updatedAt: schema.jobs.updatedAt,
            completedAt: schema.jobs.completedAt,
          })
          .from(schema.repositorySourceFileVersions)
          .innerJoin(
            schema.translationJobDetails,
            eq(
              schema.translationJobDetails.sourceFileVersionId,
              schema.repositorySourceFileVersions.id,
            ),
          )
          .innerJoin(schema.jobs, eq(schema.jobs.id, schema.translationJobDetails.jobId))
          .where(
            and(
              eq(schema.repositorySourceFileVersions.organizationId, organizationId),
              eq(schema.repositorySourceFileVersions.projectId, project.id),
              eq(schema.repositorySourceFileVersions.sourcePath, sourcePath),
              eq(schema.jobs.organizationId, organizationId),
              eq(schema.jobs.projectId, project.id),
              eq(schema.jobs.kind, "translation"),
              eq(schema.jobs.status, "succeeded"),
              eq(schema.translationJobDetails.type, "file"),
              eq(schema.translationJobDetails.outcomeKind, "file_result"),
            ),
          )
          .orderBy(desc(schema.repositorySourceFileVersions.createdAt), desc(schema.jobs.createdAt))
          .limit(1);

        if (!job) {
          return jobNotFoundResponse(c);
        }

        return c.json(
          {
            job: {
              id: job.id,
              projectId: job.projectId,
              type: job.type,
              status: job.status,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
              completedAt: job.completedAt,
              lastError: job.lastError,
              outputFiles: publicJobOutputFiles(job),
            },
          },
          200,
        );
      },
    )
    .get("/:jobId", requireApiKeyPermission("jobs:read"), validateJobIdParams, async (c) => {
      const params = c.req.valid("param");
      const organizationId = c.var.auth.organization.localOrganizationId;

      const [job] = await db
        .select({
          id: schema.jobs.id,
          organizationId: schema.jobs.organizationId,
          projectId: schema.jobs.projectId,
          kind: schema.jobs.kind,
          status: schema.jobs.status,
          type: schema.translationJobDetails.type,
          inputPayload: schema.jobs.inputPayload,
          outcomeKind: schema.translationJobDetails.outcomeKind,
          outcomePayload: schema.jobs.outcomePayload,
          lastError: schema.jobs.lastError,
          workflowRunId: schema.jobs.workflowRunId,
          createdAt: schema.jobs.createdAt,
          updatedAt: schema.jobs.updatedAt,
          completedAt: schema.jobs.completedAt,
        })
        .from(schema.jobs)
        .leftJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(
          and(eq(schema.jobs.id, params.jobId), eq(schema.jobs.organizationId, organizationId)),
        )
        .limit(1);

      if (!job) {
        return jobNotFoundResponse(c);
      }

      return c.json(
        {
          job: {
            id: job.id,
            projectId: job.projectId,
            type: job.type,
            status: job.status,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            completedAt: job.completedAt,
            lastError: job.lastError,
            outputFiles: publicJobOutputFiles(job),
          },
        },
        200,
      );
    })
    .get("/:jobId/status", requireApiKeyPermission("jobs:read"), validateJobIdParams, async (c) => {
      const params = c.req.valid("param");
      const organizationId = c.var.auth.organization.localOrganizationId;

      const [job] = await db
        .select({
          id: schema.jobs.id,
          projectId: schema.jobs.projectId,
          kind: schema.jobs.kind,
          type: schema.translationJobDetails.type,
          status: schema.jobs.status,
          createdAt: schema.jobs.createdAt,
          updatedAt: schema.jobs.updatedAt,
          completedAt: schema.jobs.completedAt,
          lastError: schema.jobs.lastError,
        })
        .from(schema.jobs)
        .leftJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(
          and(eq(schema.jobs.id, params.jobId), eq(schema.jobs.organizationId, organizationId)),
        )
        .limit(1);

      if (!job) {
        return jobNotFoundResponse(c);
      }

      return c.json({ job }, 200);
    });
}
