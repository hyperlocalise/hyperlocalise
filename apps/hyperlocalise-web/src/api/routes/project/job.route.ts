import { randomUUID } from "node:crypto";

import { and, desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  conflictResponse,
  notFoundResponse,
  serviceUnavailableResponse,
  validationErrorResponse,
} from "@/api/errors";
import { db, schema } from "@/lib/database";
import {
  getRepositorySourceFileVersionForStoredFile,
  getStoredFileForJobScope,
} from "@/lib/file-storage/records";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

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
  workspaceJobParamsSchema,
} from "./job.schema";

type CreateJobRoutesOptions = {
  jobQueue: JobQueue<TranslationJobEventData>;
};

type CreateWorkspaceJobRoutesOptions = {
  jobQueue: JobQueue<TranslationJobEventData>;
};

const jobSelect = {
  id: schema.jobs.id,
  organizationId: schema.jobs.organizationId,
  projectId: schema.jobs.projectId,
  createdByUserId: schema.jobs.createdByUserId,
  ownerUserId: schema.jobs.ownerUserId,
  kind: schema.jobs.kind,
  type: schema.translationJobDetails.type,
  status: schema.jobs.status,
  inputPayload: schema.jobs.inputPayload,
  outcomeKind: schema.translationJobDetails.outcomeKind,
  outcomePayload: schema.jobs.outcomePayload,
  lastError: schema.jobs.lastError,
  workflowRunId: schema.jobs.workflowRunId,
  interactionId: schema.jobs.interactionId,
  contextSnapshot: schema.jobs.contextSnapshot,
  reviewCriteria: schema.reviewJobDetails.criteria,
  reviewTargetLocale: schema.reviewJobDetails.targetLocale,
  reviewConfig: schema.reviewJobDetails.config,
  syncConnectorKind: schema.syncJobDetails.connectorKind,
  syncDirection: schema.syncJobDetails.direction,
  syncExternalIdentifiers: schema.syncJobDetails.externalIdentifiers,
  assetType: schema.assetManagementJobDetails.assetType,
  assetOperation: schema.assetManagementJobDetails.operation,
  assetConfig: schema.assetManagementJobDetails.config,
  createdAt: schema.jobs.createdAt,
  updatedAt: schema.jobs.updatedAt,
  completedAt: schema.jobs.completedAt,
};

const jobWithProjectSelect = {
  ...jobSelect,
  projectName: schema.projects.name,
};

async function getOwnedJob(projectId: string, jobId: string) {
  const [job] = await db
    .select(jobSelect)
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .leftJoin(schema.reviewJobDetails, eq(schema.reviewJobDetails.jobId, schema.jobs.id))
    .leftJoin(schema.syncJobDetails, eq(schema.syncJobDetails.jobId, schema.jobs.id))
    .leftJoin(
      schema.assetManagementJobDetails,
      eq(schema.assetManagementJobDetails.jobId, schema.jobs.id),
    )
    .where(and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.id, jobId)))
    .limit(1);

  return job ?? null;
}

function jobListFilters(input: {
  organizationId?: string;
  projectId?: string;
  kind?: "translation" | "research" | "review" | "sync" | "asset_management";
  type?: "string" | "file";
  status?: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  mine?: boolean;
  userId?: string;
}) {
  const filters = [];

  if (input.organizationId) {
    filters.push(eq(schema.jobs.organizationId, input.organizationId));
  }

  if (input.projectId) {
    filters.push(eq(schema.jobs.projectId, input.projectId));
  }

  if (input.kind) {
    filters.push(eq(schema.jobs.kind, input.kind));
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

function retryableJobWhere(input: { organizationId: string; jobId: string }) {
  return and(
    eq(schema.jobs.id, input.jobId),
    eq(schema.jobs.organizationId, input.organizationId),
    eq(schema.jobs.kind, "translation"),
    or(eq(schema.jobs.status, "queued"), eq(schema.jobs.status, "failed")),
  );
}

function activeJobWhere(input: { organizationId: string; jobId: string }) {
  return and(
    eq(schema.jobs.id, input.jobId),
    eq(schema.jobs.organizationId, input.organizationId),
    or(eq(schema.jobs.status, "queued"), eq(schema.jobs.status, "running")),
  );
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
    return notFoundResponse(c, "job_not_found", "Job not found");
  }

  return parsed.data;
});

const validateWorkspaceJobParams = validator("param", (value, c) => {
  const parsed = workspaceJobParamsSchema.safeParse(value);

  if (!parsed.success) {
    return notFoundResponse(c, "job_not_found", "Job not found");
  }

  return parsed.data;
});

const validateCreateJobBody = validator("json", (value, c) => {
  const parsed = createJobBodySchema.safeParse(value);

  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_job_payload",
      "Invalid job payload",
      parsed.error.issues,
    );
  }

  return parsed.data;
});

const validateJobListQuery = validator("query", (value, c) => {
  const parsed = jobListQuerySchema.safeParse(value);

  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_job_query",
      "Invalid job query parameters",
      parsed.error.issues,
    );
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
        kind: query.kind,
        type: query.type,
        status: query.status,
        mine: query.mine,
        userId: c.var.auth.user.localUserId,
      });

      const jobs = await db
        .select(jobSelect)
        .from(schema.jobs)
        .leftJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .leftJoin(schema.reviewJobDetails, eq(schema.reviewJobDetails.jobId, schema.jobs.id))
        .leftJoin(schema.syncJobDetails, eq(schema.syncJobDetails.jobId, schema.jobs.id))
        .leftJoin(
          schema.assetManagementJobDetails,
          eq(schema.assetManagementJobDetails.jobId, schema.jobs.id),
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
      let sourceFileVersionId: string | null = null;

      if (payload.type === "file") {
        const sourceFile = await getStoredFileForJobScope({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: params.projectId,
          fileId: payload.fileInput.sourceFileId,
        });

        if (!sourceFile) {
          return notFoundResponse(c, "source_file_not_found", "Source file not found");
        }

        const inferredFileFormat = inferSupportedFileTranslationFileFormat(sourceFile.filename);
        if (!inferredFileFormat) {
          return badRequestResponse(
            c,
            "unsupported_source_file_format",
            "Unsupported source file format",
          );
        }

        if (inferredFileFormat !== payload.fileInput.fileFormat) {
          return c.json(
            {
              error: "source_file_format_mismatch",
              message: "Source file format does not match the requested format",
              expectedFileFormat: inferredFileFormat,
            },
            400,
          );
        }

        const sourceFileVersion = await getRepositorySourceFileVersionForStoredFile({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: params.projectId,
          fileId: payload.fileInput.sourceFileId,
        });
        sourceFileVersionId = sourceFileVersion?.id ?? null;
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
            sourceFileVersionId,
          })
          .returning();

        return [{ ...createdJob, type: details.type }];
      });

      try {
        await options.jobQueue.enqueue({
          kind: "translation",
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

        return serviceUnavailableResponse(c, "job_queue_unavailable", "Job queue is unavailable");
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
        return notFoundResponse(c, "job_not_found", "Job not found");
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
        .where(and(eq(schema.jobs.projectId, params.projectId), eq(schema.jobs.id, params.jobId)))
        .limit(1);

      if (!job) {
        return notFoundResponse(c, "job_not_found", "Job not found");
      }

      return c.json({ job }, 200);
    });
}

export function createWorkspaceJobRoutes(options: CreateWorkspaceJobRoutesOptions) {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateJobListQuery, async (c) => {
      const query = c.req.valid("query");
      const filters = jobListFilters({
        organizationId: c.var.auth.organization.localOrganizationId,
        kind: query.kind,
        type: query.type,
        status: query.status,
        mine: query.mine,
        userId: c.var.auth.user.localUserId,
      });

      const jobs = await db
        .select(jobWithProjectSelect)
        .from(schema.jobs)
        .leftJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .leftJoin(schema.reviewJobDetails, eq(schema.reviewJobDetails.jobId, schema.jobs.id))
        .leftJoin(schema.syncJobDetails, eq(schema.syncJobDetails.jobId, schema.jobs.id))
        .leftJoin(
          schema.assetManagementJobDetails,
          eq(schema.assetManagementJobDetails.jobId, schema.jobs.id),
        )
        .leftJoin(
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
    })
    .get("/:jobId", validateWorkspaceJobParams, async (c) => {
      const params = c.req.valid("param");
      const [job] = await db
        .select(jobWithProjectSelect)
        .from(schema.jobs)
        .leftJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .leftJoin(schema.reviewJobDetails, eq(schema.reviewJobDetails.jobId, schema.jobs.id))
        .leftJoin(schema.syncJobDetails, eq(schema.syncJobDetails.jobId, schema.jobs.id))
        .leftJoin(
          schema.assetManagementJobDetails,
          eq(schema.assetManagementJobDetails.jobId, schema.jobs.id),
        )
        .leftJoin(
          schema.projects,
          and(
            eq(schema.projects.id, schema.jobs.projectId),
            eq(schema.projects.organizationId, schema.jobs.organizationId),
          ),
        )
        .where(
          and(
            eq(schema.jobs.id, params.jobId),
            eq(schema.jobs.organizationId, c.var.auth.organization.localOrganizationId),
          ),
        )
        .limit(1);

      if (!job) {
        return notFoundResponse(c, "job_not_found", "Job not found");
      }

      return c.json({ job }, 200);
    })
    .post("/:jobId/retry", validateWorkspaceJobParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const [job] = await db
        .select({
          id: schema.jobs.id,
          projectId: schema.jobs.projectId,
          type: schema.translationJobDetails.type,
        })
        .from(schema.jobs)
        .innerJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(
          retryableJobWhere({
            organizationId: c.var.auth.organization.localOrganizationId,
            jobId: params.jobId,
          }),
        )
        .limit(1);

      if (!job) {
        const [existingJob] = await db
          .select({ id: schema.jobs.id })
          .from(schema.jobs)
          .where(
            and(
              eq(schema.jobs.id, params.jobId),
              eq(schema.jobs.organizationId, c.var.auth.organization.localOrganizationId),
            ),
          )
          .limit(1);

        return existingJob
          ? conflictResponse(c, "job_action_unavailable", "Job action is not available")
          : notFoundResponse(c, "job_not_found", "Job not found");
      }

      if (!job.projectId || !job.type) {
        return conflictResponse(c, "job_action_unavailable", "Job action is not available");
      }

      const projectId = job.projectId;
      const type = job.type;

      const retriedJob = await db.transaction(async (tx) => {
        const [updatedJob] = await tx
          .update(schema.jobs)
          .set({
            status: "queued",
            workflowRunId: null,
            lastError: null,
            outcomePayload: null,
            completedAt: null,
          })
          .where(
            retryableJobWhere({
              organizationId: c.var.auth.organization.localOrganizationId,
              jobId: params.jobId,
            }),
          )
          .returning({ id: schema.jobs.id, projectId: schema.jobs.projectId });

        if (!updatedJob) {
          return null;
        }

        await tx
          .update(schema.translationJobDetails)
          .set({ outcomeKind: null })
          .where(eq(schema.translationJobDetails.jobId, params.jobId));

        return { id: updatedJob.id, projectId, type };
      });

      if (!retriedJob) {
        return conflictResponse(c, "job_action_unavailable", "Job action is not available");
      }

      try {
        await options.jobQueue.enqueue({
          kind: "translation",
          jobId: retriedJob.id,
          projectId: retriedJob.projectId,
          type: retriedJob.type,
        });
      } catch (error) {
        await db.transaction(async (tx) => {
          await tx
            .update(schema.jobs)
            .set({
              status: "failed",
              lastError:
                error instanceof Error ? error.message : "translation job queue unavailable",
              completedAt: new Date(),
            })
            .where(
              and(
                eq(schema.jobs.id, params.jobId),
                eq(schema.jobs.organizationId, c.var.auth.organization.localOrganizationId),
              ),
            );

          await tx
            .update(schema.translationJobDetails)
            .set({ outcomeKind: "error" })
            .where(eq(schema.translationJobDetails.jobId, params.jobId));
        });

        return serviceUnavailableResponse(c, "job_queue_unavailable", "Job queue is unavailable");
      }

      const [updatedJob] = await db
        .select(jobWithProjectSelect)
        .from(schema.jobs)
        .leftJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .leftJoin(schema.reviewJobDetails, eq(schema.reviewJobDetails.jobId, schema.jobs.id))
        .leftJoin(schema.syncJobDetails, eq(schema.syncJobDetails.jobId, schema.jobs.id))
        .leftJoin(
          schema.assetManagementJobDetails,
          eq(schema.assetManagementJobDetails.jobId, schema.jobs.id),
        )
        .leftJoin(
          schema.projects,
          and(
            eq(schema.projects.id, schema.jobs.projectId),
            eq(schema.projects.organizationId, schema.jobs.organizationId),
          ),
        )
        .where(
          and(
            eq(schema.jobs.id, params.jobId),
            eq(schema.jobs.organizationId, c.var.auth.organization.localOrganizationId),
          ),
        )
        .limit(1);

      return c.json({ job: updatedJob }, 200);
    })
    .post("/:jobId/mark-failed", validateWorkspaceJobParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const updatedJob = await db.transaction(async (tx) => {
        const [job] = await tx
          .update(schema.jobs)
          .set({
            status: "failed",
            workflowRunId: null,
            lastError: "Marked failed by user",
            outcomePayload: {
              code: "manual_failure",
              message: "Marked failed by user",
            },
            completedAt: new Date(),
          })
          .where(
            activeJobWhere({
              organizationId: c.var.auth.organization.localOrganizationId,
              jobId: params.jobId,
            }),
          )
          .returning({ id: schema.jobs.id, kind: schema.jobs.kind });

        if (job?.kind === "translation") {
          await tx
            .update(schema.translationJobDetails)
            .set({ outcomeKind: "error" })
            .where(eq(schema.translationJobDetails.jobId, params.jobId));
        }

        return job;
      });

      if (!updatedJob) {
        const [existingJob] = await db
          .select({ id: schema.jobs.id })
          .from(schema.jobs)
          .where(
            and(
              eq(schema.jobs.id, params.jobId),
              eq(schema.jobs.organizationId, c.var.auth.organization.localOrganizationId),
            ),
          )
          .limit(1);

        return existingJob
          ? conflictResponse(c, "job_action_unavailable", "Job action is not available")
          : notFoundResponse(c, "job_not_found", "Job not found");
      }

      const [job] = await db
        .select(jobWithProjectSelect)
        .from(schema.jobs)
        .leftJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .leftJoin(schema.reviewJobDetails, eq(schema.reviewJobDetails.jobId, schema.jobs.id))
        .leftJoin(schema.syncJobDetails, eq(schema.syncJobDetails.jobId, schema.jobs.id))
        .leftJoin(
          schema.assetManagementJobDetails,
          eq(schema.assetManagementJobDetails.jobId, schema.jobs.id),
        )
        .leftJoin(
          schema.projects,
          and(
            eq(schema.projects.id, schema.jobs.projectId),
            eq(schema.projects.organizationId, schema.jobs.organizationId),
          ),
        )
        .where(
          and(
            eq(schema.jobs.id, params.jobId),
            eq(schema.jobs.organizationId, c.var.auth.organization.localOrganizationId),
          ),
        )
        .limit(1);

      return c.json({ job }, 200);
    });
}
