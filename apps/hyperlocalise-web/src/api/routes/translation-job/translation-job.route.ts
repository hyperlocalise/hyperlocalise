import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { inngestClient } from "@/lib/inngest/client";

import {
  createTranslationJobBodySchema,
  listTranslationJobsQuerySchema,
  translationJobIdParamsSchema,
} from "./translation-job.schema";

const allowedMutationRoles = new Set<string>(["owner", "admin"]);

type QueuePublisher = {
  send(event: {
    name: "translation/job.queued";
    data: {
      jobId: string;
      projectId: string;
      organizationId: string;
      createdByUserId: string;
      type: "string" | "file";
      inputPayload: unknown;
    };
  }): Promise<{ ids: string[] }>;
};

async function enqueueTranslationJob(publisher: QueuePublisher, payload: Parameters<QueuePublisher["send"]>[0]) {
  const queued = await publisher.send(payload);
  return queued.ids.at(0) ?? null;
}

function isMutationAllowed(role: string) {
  return allowedMutationRoles.has(role);
}

function invalidTranslationJobPayloadResponse(c: {
  json(body: { error: string }, status: 400): Response;
}) {
  return c.json({ error: "invalid_translation_job_payload" }, 400);
}

function translationJobNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "translation_job_not_found" }, 404);
}

function projectNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "project_not_found" }, 404);
}

function forbiddenResponse(c: { json(body: { error: string }, status: 403): Response }) {
  return c.json({ error: "forbidden" }, 403);
}

function conflictResponse(c: { json(body: { error: string }, status: 409): Response }) {
  return c.json({ error: "translation_job_conflict" }, 409);
}

const validateTranslationJobParams = validator("param", (value, c) => {
  const parsed = translationJobIdParamsSchema.safeParse(value);

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

const validateListTranslationJobsQuery = validator("query", (value, c) => {
  const parsed = listTranslationJobsQuerySchema.safeParse(value);

  if (!parsed.success) {
    return invalidTranslationJobPayloadResponse(c);
  }

  return parsed.data;
});

export const translationJobRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", workosAuthMiddleware)
  .post("/jobs", validateCreateTranslationJobBody, async (c) => {
    if (!isMutationAllowed(c.var.auth.membership.role)) {
      return forbiddenResponse(c);
    }

    const payload = c.req.valid("json");
    const [project] = await db
      .select({ id: schema.translationProjects.id })
      .from(schema.translationProjects)
      .where(
        and(
          eq(schema.translationProjects.id, payload.projectId),
          eq(schema.translationProjects.organizationId, c.var.auth.organization.localOrganizationId),
        ),
      )
      .limit(1);

    if (!project) {
      return projectNotFoundResponse(c);
    }

    const jobId = `job_${randomUUID()}`;
    const [createdJob] = await db
      .insert(schema.translationJobs)
      .values({
        id: jobId,
        projectId: project.id,
        createdByUserId: c.var.auth.user.localUserId,
        type: payload.type,
        status: "queued",
        inputPayload: payload.inputPayload,
      })
      .returning();

    const workflowRunId = await enqueueTranslationJob(inngestClient, {
      name: "translation/job.queued",
      data: {
        jobId: createdJob.id,
        projectId: createdJob.projectId,
        organizationId: c.var.auth.organization.localOrganizationId,
        createdByUserId: c.var.auth.user.localUserId,
        type: createdJob.type,
        inputPayload: createdJob.inputPayload,
      },
    });

    const [job] = await db
      .update(schema.translationJobs)
      .set({ workflowRunId })
      .where(eq(schema.translationJobs.id, createdJob.id))
      .returning();

    return c.json({ job: job ?? createdJob }, 201);
  })
  .get("/jobs", validateListTranslationJobsQuery, async (c) => {
    const query = c.req.valid("query");

    const projectFilter = query.projectId
      ? [eq(schema.translationJobs.projectId, query.projectId)]
      : [];

    const statusFilter = query.status ? [eq(schema.translationJobs.status, query.status)] : [];

    const jobs = await db
      .select()
      .from(schema.translationJobs)
      .innerJoin(
        schema.translationProjects,
        eq(schema.translationProjects.id, schema.translationJobs.projectId),
      )
      .where(
        and(
          eq(schema.translationProjects.organizationId, c.var.auth.organization.localOrganizationId),
          ...projectFilter,
          ...statusFilter,
        ),
      )
      .orderBy(desc(schema.translationJobs.createdAt))
      .limit(query.limit ?? 50);

    return c.json(
      {
        jobs: jobs.map((row) => row.translation_jobs),
      },
      200,
    );
  })
  .get("/jobs/:jobId", validateTranslationJobParams, async (c) => {
    const params = c.req.valid("param");

    const [job] = await db
      .select({
        job: schema.translationJobs,
      })
      .from(schema.translationJobs)
      .innerJoin(
        schema.translationProjects,
        eq(schema.translationProjects.id, schema.translationJobs.projectId),
      )
      .where(
        and(
          eq(schema.translationJobs.id, params.jobId),
          eq(schema.translationProjects.organizationId, c.var.auth.organization.localOrganizationId),
        ),
      )
      .limit(1);

    if (!job) {
      return translationJobNotFoundResponse(c);
    }

    return c.json({ job: job.job }, 200);
  })
  .post("/jobs/:jobId/cancel", validateTranslationJobParams, async (c) => {
    if (!isMutationAllowed(c.var.auth.membership.role)) {
      return forbiddenResponse(c);
    }

    const params = c.req.valid("param");

    const [job] = await db
      .select({
        id: schema.translationJobs.id,
        status: schema.translationJobs.status,
      })
      .from(schema.translationJobs)
      .innerJoin(
        schema.translationProjects,
        eq(schema.translationProjects.id, schema.translationJobs.projectId),
      )
      .where(
        and(
          eq(schema.translationJobs.id, params.jobId),
          eq(schema.translationProjects.organizationId, c.var.auth.organization.localOrganizationId),
        ),
      )
      .limit(1);

    if (!job) {
      return translationJobNotFoundResponse(c);
    }

    if (job.status !== "queued" && job.status !== "running") {
      return conflictResponse(c);
    }

    const [updated] = await db
      .update(schema.translationJobs)
      .set({
        status: "failed",
        outcomeKind: "error",
        lastError: "canceled_by_user",
        completedAt: new Date(),
      })
      .where(eq(schema.translationJobs.id, job.id))
      .returning();

    return c.json({ job: updated }, 200);
  });
