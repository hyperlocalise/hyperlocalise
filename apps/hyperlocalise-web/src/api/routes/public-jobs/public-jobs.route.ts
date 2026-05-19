import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import {
  apiKeyAuthMiddleware,
  requireApiKeyPermission,
  type ApiKeyAuthVariables,
} from "@/api/auth/api-key";
import { db, schema } from "@/lib/database";
import {
  ensureRepositorySourceFileVersionForStoredFile,
  getStoredFileForJobScope,
} from "@/lib/file-storage/records";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

import { createPublicJobBodySchema, jobIdParamsSchema } from "./public-jobs.schema";
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

export function createPublicJobRoutes(options: CreatePublicJobRoutesOptions = {}) {
  return new Hono<{ Variables: ApiKeyAuthVariables }>()
    .use("*", apiKeyAuthMiddleware)
    .post("/", requireApiKeyPermission("jobs:write"), validateCreateJobBody, async (c) => {
      const payload = c.req.valid("json");
      const organizationId = c.var.auth.organization.localOrganizationId;

      // Verify project belongs to the authenticated organization
      const [project] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.id, payload.projectId),
            eq(schema.projects.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      const inputPayload = payload.type === "string" ? payload.stringInput : payload.fileInput;

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
    })
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
