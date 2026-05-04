import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { getStoredFileForJobScope } from "@/lib/file-storage/records";
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";
import type { TranslationJobQueue } from "@/lib/workflow/types";

import {
  forbiddenResponse,
  getOwnedProject,
  isProjectMutationAllowed,
  projectNotFoundResponse,
} from "./project.shared";
import {
  createJobBodySchema,
  jobListQuerySchema,
  jobParamsSchema,
  jobProjectParamsSchema,
} from "./job.schema";

type CreateJobRoutesOptions = {
  jobQueue: TranslationJobQueue;
};

const jobSelect = {
  id: schema.jobs.id,
  organizationId: schema.jobs.organizationId,
  projectId: schema.jobs.projectId,
  createdByUserId: schema.jobs.createdByUserId,
  type: schema.translationJobDetails.type,
  status: schema.jobs.status,
  inputPayload: schema.jobs.inputPayload,
  outcomeKind: schema.translationJobDetails.outcomeKind,
  outcomePayload: schema.jobs.outcomePayload,
  lastError: schema.jobs.lastError,
  workflowRunId: schema.jobs.workflowRunId,
  interactionId: schema.jobs.interactionId,
  createdAt: schema.jobs.createdAt,
  updatedAt: schema.jobs.updatedAt,
  completedAt: schema.jobs.completedAt,
};

const jobWithProjectSelect = {
  ...jobSelect,
  projectName: schema.projects.name,
};

function invalidJobPayloadResponse(c: { json(body: { error: string }, status: 400): Response }) {
  return c.json({ error: "invalid_job_payload" }, 400);
}

function invalidJobQueryResponse(c: { json(body: { error: string }, status: 400): Response }) {
  return c.json({ error: "invalid_job_query" }, 400);
}

function jobNotFoundResponse(c: { json(body: { error: string }, status: 404): Response }) {
  return c.json({ error: "job_not_found" }, 404);
}

function jobQueueUnavailableResponse(c: { json(body: { error: string }, status: 503): Response }) {
  return c.json({ error: "job_queue_unavailable" }, 503);
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

async function getOwnedJob(projectId: string, jobId: string) {
  const [job] = await db
    .select(jobSelect)
    .from(schema.jobs)
    .innerJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(
      and(
        eq(schema.jobs.kind, "translation"),
        eq(schema.jobs.projectId, projectId),
        eq(schema.jobs.id, jobId),
      ),
    )
    .limit(1);

  return job ?? null;
}

function jobListFilters(input: {
  organizationId?: string;
  projectId?: string;
  type?: "string" | "file";
  status?: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  mine?: boolean;
  userId?: string;
}) {
  const filters = [eq(schema.jobs.kind, "translation")];

  if (input.organizationId) {
    filters.push(eq(schema.jobs.organizationId, input.organizationId));
  }

  if (input.projectId) {
    filters.push(eq(schema.jobs.projectId, input.projectId));
  }

  if (input.type) {
    filters.push(eq(schema.translationJobDetails.type, input.type));
  }

  if (input.status) {
    filters.push(eq(schema.jobs.status, input.status));
  }

  if (input.mine && input.userId) {
    filters.push(eq(schema.jobs.createdByUserId, input.userId));
  }

  return filters;
}

const validateProjectParams = validator("param", (value, c) => {
  const parsed = jobProjectParamsSchema.safeParse(value);

  if (!parsed.success) {
    return projectNotFoundResponse(c);
  }

  return parsed.data;
});

const validateJobParams = validator("param", (value, c) => {
  const parsed = jobParamsSchema.safeParse(value);

  if (!parsed.success) {
    return jobNotFoundResponse(c);
  }

  return parsed.data;
});

const validateCreateJobBody = validator("json", (value, c) => {
  const parsed = createJobBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidJobPayloadResponse(c);
  }

  return parsed.data;
});

const validateJobListQuery = validator("query", (value, c) => {
  const parsed = jobListQuerySchema.safeParse(value);

  if (!parsed.success) {
    return invalidJobQueryResponse(c);
  }

  return parsed.data;
});

export function createJobRoutes(options: CreateJobRoutesOptions) {
  return new Hono<{ Variables: AuthVariables }>()
    .get("/", validateProjectParams, validateJobListQuery, async (c) => {
      const params = c.req.valid("param");
      const query = c.req.valid("query");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      const filters = jobListFilters({
        projectId: params.projectId,
        type: query.type,
        status: query.status,
        mine: query.mine,
        userId: c.var.auth.user.localUserId,
      });

      const jobs = await db
        .select(jobSelect)
        .from(schema.jobs)
        .innerJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(and(...filters))
        .orderBy(desc(schema.jobs.createdAt))
        .limit(query.limit);

      return c.json({ jobs }, 200);
    })
    .post("/", validateProjectParams, validateCreateJobBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      const inputPayload = payload.type === "string" ? payload.stringInput : payload.fileInput;

      if (payload.type === "file") {
        const sourceFile = await getStoredFileForJobScope({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: params.projectId,
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
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            createdByUserId: c.var.auth.user.localUserId,
            kind: "translation",
            status: "queued",
            inputPayload,
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

      try {
        await options.jobQueue.enqueue({
          jobId: job.id,
          projectId: job.projectId ?? params.projectId,
          type: job.type,
        });
      } catch (error) {
        await db
          .update(schema.jobs)
          .set({
            status: "failed",
            lastError: error instanceof Error ? error.message : "translation job queue unavailable",
          })
          .where(and(eq(schema.jobs.projectId, params.projectId), eq(schema.jobs.id, job.id)));

        return jobQueueUnavailableResponse(c);
      }

      const createdJob = await getOwnedJob(params.projectId, job.id);
      if (!createdJob) {
        throw new Error(`created translation job ${job.id} was not found after insert`);
      }

      return c.json({ job: createdJob }, 201);
    })
    .get("/:jobId", validateJobParams, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      const job = await getOwnedJob(params.projectId, params.jobId);

      if (!job) {
        return jobNotFoundResponse(c);
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
            eq(schema.jobs.projectId, params.projectId),
            eq(schema.jobs.id, params.jobId),
          ),
        )
        .limit(1);

      if (!job) {
        return jobNotFoundResponse(c);
      }

      return c.json({ job }, 200);
    });
}

export function createWorkspaceJobRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateJobListQuery, async (c) => {
      const query = c.req.valid("query");
      const filters = jobListFilters({
        organizationId: c.var.auth.organization.localOrganizationId,
        type: query.type,
        status: query.status,
        mine: query.mine,
        userId: c.var.auth.user.localUserId,
      });

      const jobs = await db
        .select(jobWithProjectSelect)
        .from(schema.jobs)
        .innerJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .innerJoin(
          schema.projects,
          and(
            eq(schema.projects.id, schema.jobs.projectId),
            eq(schema.projects.organizationId, schema.jobs.organizationId),
          ),
        )
        .where(and(...filters))
        .orderBy(desc(schema.jobs.updatedAt))
        .limit(query.limit);

      return c.json({ jobs }, 200);
    });
}
