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
import { getStoredFileForJobScope } from "@/lib/file-storage/records";
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";
import type { TranslationJobQueue } from "@/lib/workflow/types";
import { supportedTranslationFileFormats } from "@/lib/translation/file-formats";
import { z } from "zod";

const createPublicJobBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("string"),
    projectId: z.string().trim().min(1),
    stringInput: z.object({
      sourceText: z.string().trim().min(1).max(100_000),
      sourceLocale: z.string().trim().min(1).max(32),
      targetLocales: z.array(z.string().trim().min(1).max(32)).min(1),
      metadata: z.record(z.string(), z.string()).optional(),
      context: z.string().max(20_000).optional(),
      maxLength: z.number().int().positive().max(100_000).optional(),
    }),
  }),
  z.object({
    type: z.literal("file"),
    projectId: z.string().trim().min(1),
    fileInput: z.object({
      sourceFileId: z.string().trim().min(1),
      fileFormat: z.enum(supportedTranslationFileFormats),
      sourceLocale: z.string().trim().min(1).max(32),
      targetLocales: z.array(z.string().trim().min(1).max(32)).min(1),
      metadata: z.record(z.string(), z.string()).optional(),
    }),
  }),
]);

const jobIdParamsSchema = z.object({
  jobId: z.string().trim().min(1),
});

function invalidJobPayloadResponse(c: { json(body: { error: string }, status: 400): Response }) {
  return c.json({ error: "invalid_job_payload" }, 400);
}

function jobNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "job_not_found" }, 404);
}

function sourceFileNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "source_file_not_found" }, 404);
}

function unsupportedSourceFileFormatResponse(c: {
  json(body: { error: string }, status: 400): Response;
}) {
  return c.json({ error: "unsupported_source_file_format" }, 400);
}

function sourceFileFormatMismatchResponse(
  c: { json(body: { error: string; expectedFileFormat: string }, status: 400): Response },
  expectedFileFormat: string,
) {
  return c.json({ error: "source_file_format_mismatch", expectedFileFormat }, 400);
}

function jobQueueUnavailableResponse(c: { json(body: { error: string }, status: 503): Response }) {
  return c.json({ error: "job_queue_unavailable" }, 503);
}

function projectNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "project_not_found" }, 404);
}

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
  jobQueue?: TranslationJobQueue;
};

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

        const inferredFileFormat = inferSupportedTranslationFileFormat(sourceFile.filename);
        if (!inferredFileFormat) {
          return unsupportedSourceFileFormatResponse(c);
        }

        if (inferredFileFormat !== payload.fileInput.fileFormat) {
          return sourceFileFormatMismatchResponse(c, inferredFileFormat);
        }
      }

      const jobId = `job_${randomUUID()}`;
      const [job] = await db.transaction(async (tx) => {
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
          })
          .returning();

        return [{ ...createdJob, type: details.type }];
      });

      if (options.jobQueue) {
        try {
          await options.jobQueue.enqueue({
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
        .innerJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(
          and(
            eq(schema.jobs.kind, "translation"),
            eq(schema.jobs.id, params.jobId),
            eq(schema.jobs.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!job) {
        return jobNotFoundResponse(c);
      }

      return c.json({ job }, 200);
    })
    .get("/:jobId/status", requireApiKeyPermission("jobs:read"), validateJobIdParams, async (c) => {
      const params = c.req.valid("param");
      const organizationId = c.var.auth.organization.localOrganizationId;

      const [job] = await db
        .select({
          id: schema.jobs.id,
          projectId: schema.jobs.projectId,
          type: schema.translationJobDetails.type,
          status: schema.jobs.status,
          createdAt: schema.jobs.createdAt,
          updatedAt: schema.jobs.updatedAt,
          completedAt: schema.jobs.completedAt,
          lastError: schema.jobs.lastError,
        })
        .from(schema.jobs)
        .innerJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(
          and(
            eq(schema.jobs.kind, "translation"),
            eq(schema.jobs.id, params.jobId),
            eq(schema.jobs.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!job) {
        return jobNotFoundResponse(c);
      }

      return c.json({ job }, 200);
    });
}

export const publicJobRoutes = createPublicJobRoutes();
