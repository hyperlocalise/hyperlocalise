import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { TranslationJobQueue } from "@/lib/workflow/types";

import {
  forbiddenResponse,
  getOwnedProject,
  isProjectMutationAllowed,
  projectNotFoundResponse,
} from "./project.shared";
import {
  createTranslationJobBodySchema,
  translationJobListQuerySchema,
  translationJobParamsSchema,
  translationJobProjectParamsSchema,
} from "./translation-job.schema";

type CreateTranslationJobRoutesOptions = {
  translationJobQueue: TranslationJobQueue;
};

function invalidTranslationJobPayloadResponse(c: {
  json(body: { error: string }, status: 400): Response;
}) {
  return c.json({ error: "invalid_translation_job_payload" }, 400);
}

function invalidTranslationJobQueryResponse(c: {
  json(body: { error: string }, status: 400): Response;
}) {
  return c.json({ error: "invalid_translation_job_query" }, 400);
}

function translationJobNotFoundResponse(c: {
  json(body: { error: string }, status: 404): Response;
}) {
  return c.json({ error: "translation_job_not_found" }, 404);
}

function translationJobQueueUnavailableResponse(c: {
  json(body: { error: string }, status: 503): Response;
}) {
  return c.json({ error: "translation_job_queue_unavailable" }, 503);
}

function fileTranslationJobsNotSupportedResponse(c: {
  json(body: { error: string }, status: 501): Response;
}) {
  return c.json({ error: "file_translation_jobs_not_supported" }, 501);
}

async function getOwnedJob(projectId: string, jobId: string) {
  const [job] = await db
    .select()
    .from(schema.translationJobs)
    .where(
      and(eq(schema.translationJobs.projectId, projectId), eq(schema.translationJobs.id, jobId)),
    )
    .limit(1);

  return job ?? null;
}

const validateProjectParams = validator("param", (value, c) => {
  const parsed = translationJobProjectParamsSchema.safeParse(value);

  if (!parsed.success) {
    return projectNotFoundResponse(c);
  }

  return parsed.data;
});

const validateJobParams = validator("param", (value, c) => {
  const parsed = translationJobParamsSchema.safeParse(value);

  if (!parsed.success) {
    return translationJobNotFoundResponse(c);
  }

  return parsed.data;
});

const validateCreateTranslationJobBody = validator("json", (value, c) => {
  const parsed = createTranslationJobBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidTranslationJobPayloadResponse(c);
  }

  return parsed.data;
});

const validateTranslationJobListQuery = validator("query", (value, c) => {
  const parsed = translationJobListQuerySchema.safeParse(value);

  if (!parsed.success) {
    return invalidTranslationJobQueryResponse(c);
  }

  return parsed.data;
});

export function createTranslationJobRoutes(options: CreateTranslationJobRoutesOptions) {
  return new Hono<{ Variables: AuthVariables }>()
    .get("/", validateProjectParams, validateTranslationJobListQuery, async (c) => {
      const params = c.req.valid("param");
      const query = c.req.valid("query");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      const filters = [eq(schema.translationJobs.projectId, params.projectId)];

      if (query.type) {
        filters.push(eq(schema.translationJobs.type, query.type));
      }

      if (query.status) {
        filters.push(eq(schema.translationJobs.status, query.status));
      }

      if (query.mine) {
        filters.push(eq(schema.translationJobs.createdByUserId, c.var.auth.user.localUserId));
      }

      const jobs = await db
        .select()
        .from(schema.translationJobs)
        .where(and(...filters))
        .orderBy(desc(schema.translationJobs.createdAt))
        .limit(query.limit);

      return c.json({ jobs }, 200);
    })
    .post("/", validateProjectParams, validateCreateTranslationJobBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      if (payload.type === "file") {
        return fileTranslationJobsNotSupportedResponse(c);
      }

      const inputPayload = payload.stringInput;

      const [job] = await db
        .insert(schema.translationJobs)
        .values({
          id: `job_${randomUUID()}`,
          projectId: params.projectId,
          createdByUserId: c.var.auth.user.localUserId,
          type: payload.type,
          status: "queued",
          inputPayload,
        })
        .returning();

      try {
        await options.translationJobQueue.enqueue({
          jobId: job.id,
          projectId: job.projectId,
          type: job.type,
        });
      } catch (error) {
        await db
          .update(schema.translationJobs)
          .set({
            status: "failed",
            lastError: error instanceof Error ? error.message : "translation job queue unavailable",
          })
          .where(
            and(
              eq(schema.translationJobs.projectId, params.projectId),
              eq(schema.translationJobs.id, job.id),
            ),
          );

        return translationJobQueueUnavailableResponse(c);
      }

      const createdJob = await getOwnedJob(params.projectId, job.id);
      return c.json({ job: createdJob ?? job }, 201);
    })
    .get("/:jobId", validateJobParams, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      const job = await getOwnedJob(params.projectId, params.jobId);

      if (!job) {
        return translationJobNotFoundResponse(c);
      }

      return c.json({ job }, 200);
    })
    .get("/:jobId/status", validateJobParams, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      const [job] = await db
        .select({
          id: schema.translationJobs.id,
          projectId: schema.translationJobs.projectId,
          type: schema.translationJobs.type,
          status: schema.translationJobs.status,
          createdAt: schema.translationJobs.createdAt,
          updatedAt: schema.translationJobs.updatedAt,
          completedAt: schema.translationJobs.completedAt,
          lastError: schema.translationJobs.lastError,
        })
        .from(schema.translationJobs)
        .where(
          and(
            eq(schema.translationJobs.projectId, params.projectId),
            eq(schema.translationJobs.id, params.jobId),
          ),
        )
        .limit(1);

      if (!job) {
        return translationJobNotFoundResponse(c);
      }

      return c.json({ job }, 200);
    });
}
