import { randomUUID } from "node:crypto";

import { and, desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { buildAccessibleJobsWhere } from "@/api/auth/team-access";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  conflictResponse,
  internalErrorResponse,
  notFoundResponse,
  serviceUnavailableResponse,
  validationErrorResponse,
} from "@/api/errors";
import { db, schema } from "@/lib/database";
import {
  ensureRepositorySourceFileVersionForStoredFile,
  getStoredFileForJobScope,
} from "@/lib/file-storage/records";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";
import type {
  JobQueue,
  ProviderAgentCommentQueue,
  ProviderAgentQaQueue,
  ProviderAgentTranslationQueue,
  ProviderAgentWritebackQueue,
  TranslationJobEventData,
} from "@/lib/workflow/types";

import {
  forbiddenResponse,
  getOwnedProject,
  isProjectMutationAllowed,
  projectNotFoundResponse,
} from "./project.shared";
import {
  applyAgentRunProposalReviewUpdates,
  applyBulkAgentRunProposalReview,
  parseAgentRunProposalItems,
} from "@/lib/providers/agent-run-proposals";
import {
  createAgentRun,
  failAgentRun,
  getAgentRun,
  listAgentRuns,
  updateAgentRunChangedItems,
} from "@/lib/providers/agent-runs";
import {
  getJobProviderActionAvailability,
  getJobProviderActionDefinition,
  isJobProviderActionAvailable,
} from "@/lib/providers/job-provider-actions";
import { resolveProviderSourceFiles } from "@/lib/providers/job-provider-source-files";
import { mapProviderQaErrorToHttpStatus } from "@/lib/providers/map-provider-qa-http-error";
import { runProviderJobQaForJob } from "@/lib/providers/provider-agent-qa";
import { getProviderContentPuller } from "@/lib/providers/provider-content-pullers";

import {
  createJobAgentRunBodySchema,
  updateAgentRunProposalReviewBodySchema,
  workspaceAgentRunParamsSchema,
} from "./agent-run.schema";
import { providerQaReportResponseSchema } from "./job-qa.schema";
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
  providerAgentTranslationQueue: ProviderAgentTranslationQueue;
  providerAgentQaQueue: ProviderAgentQaQueue;
  providerAgentCommentQueue: ProviderAgentCommentQueue;
  providerAgentWritebackQueue: ProviderAgentWritebackQueue;
};

const providerQaAgentActions = new Set(["review_with_agent", "run_qa_checks"]);

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
  externalProviderKind: schema.externalJobDetails.providerKind,
  externalJobId: schema.externalJobDetails.externalJobId,
  externalTaskId: schema.externalJobDetails.externalTaskId,
  externalStatus: schema.externalJobDetails.externalStatus,
  externalTitle: schema.externalJobDetails.title,
  externalDueDate: schema.externalJobDetails.dueDate,
  externalTargetLocales: schema.externalJobDetails.targetLocales,
  externalAssignedUsers: schema.externalJobDetails.assignedUsers,
  externalUrl: schema.externalJobDetails.externalUrl,
  externalSyncState: schema.externalJobDetails.syncState,
  externalProviderPayload: schema.externalJobDetails.providerPayload,
  linkedJobId: schema.externalJobDetails.linkedJobId,
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
    .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
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

const validateCreateJobAgentRunBody = validator("json", (value, c) => {
  const parsed = createJobAgentRunBodySchema.safeParse(value);

  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_agent_run_payload",
      "Invalid agent run payload",
      parsed.error.issues,
    );
  }

  return parsed.data;
});

const validateWorkspaceAgentRunParams = validator("param", (value, c) => {
  const parsed = workspaceAgentRunParamsSchema.safeParse(value);

  if (!parsed.success) {
    return notFoundResponse(c, "agent_run_not_found", "Agent run not found");
  }

  return parsed.data;
});

const validateUpdateAgentRunProposalReviewBody = validator("json", (value, c) => {
  const parsed = updateAgentRunProposalReviewBodySchema.safeParse(value);

  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_agent_run_review_payload",
      "Invalid agent run review payload",
      parsed.error.issues,
    );
  }

  return parsed.data;
});

function serializeAgentRun(run: typeof schema.agentRuns.$inferSelect): Record<string, unknown> {
  return {
    ...run,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

async function enrichProviderBackedJob(job: Record<string, unknown>) {
  if (!job.externalProviderKind || !job.externalJobId || !job.projectId || !job.organizationId) {
    return job;
  }

  const providerKind =
    job.externalProviderKind as (typeof schema.externalTmsProviderKindEnum.enumValues)[number];

  const [providerSourceFiles, providerActions] = await Promise.all([
    resolveProviderSourceFiles({
      organizationId: job.organizationId as string,
      projectId: job.projectId as string,
      providerKind,
      providerPayload: (job.externalProviderPayload as Record<string, unknown> | null) ?? null,
    }),
    Promise.resolve(getJobProviderActionAvailability(providerKind)),
  ]);

  return {
    ...job,
    providerSourceFiles,
    providerActions,
  };
}

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
        .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
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
      }

      const jobId = `job_${randomUUID()}`;
      const [job] = await db.transaction(async (tx) => {
        const sourceFileVersion =
          payload.type === "file"
            ? await ensureRepositorySourceFileVersionForStoredFile({
                db: tx,
                organizationId: c.var.auth.organization.localOrganizationId,
                projectId: params.projectId,
                fileId: payload.fileInput.sourceFileId,
              })
            : null;

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
            sourceFileVersionId: sourceFileVersion?.id ?? null,
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
      const filters = [
        await buildAccessibleJobsWhere(c.var.auth),
        ...jobListFilters({
          kind: query.kind,
          type: query.type,
          status: query.status,
          mine: query.mine,
          userId: c.var.auth.user.localUserId,
        }),
      ];

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
        .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
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
        .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
        .leftJoin(
          schema.projects,
          and(
            eq(schema.projects.id, schema.jobs.projectId),
            eq(schema.projects.organizationId, schema.jobs.organizationId),
          ),
        )
        .where(and(await buildAccessibleJobsWhere(c.var.auth), eq(schema.jobs.id, params.jobId)))
        .limit(1);

      if (!job) {
        return notFoundResponse(c, "job_not_found", "Job not found");
      }

      return c.json({ job: await enrichProviderBackedJob(job) }, 200);
    })
    .get("/:jobId/agent-runs", validateWorkspaceJobParams, async (c) => {
      const params = c.req.valid("param");
      const organizationId = c.var.auth.organization.localOrganizationId;

      const [job] = await db
        .select({
          externalProviderKind: schema.externalJobDetails.providerKind,
          externalJobId: schema.externalJobDetails.externalJobId,
          externalTaskId: schema.externalJobDetails.externalTaskId,
        })
        .from(schema.jobs)
        .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
        .where(
          and(eq(schema.jobs.id, params.jobId), eq(schema.jobs.organizationId, organizationId)),
        )
        .limit(1);

      if (!job) {
        return notFoundResponse(c, "job_not_found", "Job not found");
      }

      if (!job.externalProviderKind || !job.externalJobId) {
        return c.json({ agentRuns: [] }, 200);
      }

      const agentRuns = await listAgentRuns({
        organizationId,
        providerKind: job.externalProviderKind,
        externalJobId: job.externalJobId,
        externalTaskId: job.externalTaskId ?? undefined,
      });

      return c.json({ agentRuns: agentRuns.map(serializeAgentRun) }, 200);
    })
    .patch(
      "/:jobId/agent-runs/:agentRunId/review",
      validateWorkspaceAgentRunParams,
      validateUpdateAgentRunProposalReviewBody,
      async (c) => {
        if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload = c.req.valid("json");
        const organizationId = c.var.auth.organization.localOrganizationId;

        const [job] = await db
          .select({
            id: schema.jobs.id,
            externalProviderKind: schema.externalJobDetails.providerKind,
            externalJobId: schema.externalJobDetails.externalJobId,
          })
          .from(schema.jobs)
          .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
          .where(
            and(eq(schema.jobs.id, params.jobId), eq(schema.jobs.organizationId, organizationId)),
          )
          .limit(1);

        if (!job) {
          return notFoundResponse(c, "job_not_found", "Job not found");
        }

        if (!job.externalProviderKind || !job.externalJobId) {
          return conflictResponse(
            c,
            "provider_job_required",
            "Agent run review is only available for provider-backed jobs",
          );
        }

        const agentRun = await getAgentRun({
          runId: params.agentRunId,
          organizationId,
        });

        if (!agentRun || agentRun.hyperlocaliseJobId !== job.id) {
          return notFoundResponse(c, "agent_run_not_found", "Agent run not found");
        }

        if (agentRun.status !== "succeeded") {
          return conflictResponse(
            c,
            "agent_run_not_reviewable",
            "Only completed agent runs can be reviewed",
          );
        }

        if (agentRun.kind !== "translate" && agentRun.kind !== "qa_fix") {
          return conflictResponse(
            c,
            "agent_run_not_reviewable",
            "This agent run does not contain reviewable proposals",
          );
        }

        if (parseAgentRunProposalItems(agentRun.changedItems).length === 0) {
          return conflictResponse(
            c,
            "agent_run_not_reviewable",
            "This agent run does not contain proposals to review",
          );
        }

        const updatedRun = await updateAgentRunChangedItems({
          runId: agentRun.id,
          organizationId,
          changedItems: (currentRun) => {
            if (payload.updates && payload.updates.length > 0) {
              return applyAgentRunProposalReviewUpdates({
                changedItems: currentRun.changedItems,
                updates: payload.updates,
              });
            }

            if (payload.bulk) {
              const scope = payload.bulk.scope ?? "pending";
              const itemIds =
                scope === "filtered"
                  ? (payload.bulk.itemIdsFilter ?? [])
                  : scope === "all"
                    ? undefined
                    : payload.bulk.itemIds;

              return applyBulkAgentRunProposalReview({
                changedItems: currentRun.changedItems,
                reviewState: payload.bulk.reviewState,
                itemIds,
                filter: scope === "all" ? "all" : "pending",
              });
            }

            return currentRun.changedItems;
          },
        });

        return c.json({ agentRun: serializeAgentRun(updatedRun) }, 200);
      },
    )
    .get("/:jobId/provider-actions", validateWorkspaceJobParams, async (c) => {
      const params = c.req.valid("param");
      const organizationId = c.var.auth.organization.localOrganizationId;

      const [job] = await db
        .select({
          externalProviderKind: schema.externalJobDetails.providerKind,
        })
        .from(schema.jobs)
        .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
        .where(
          and(eq(schema.jobs.id, params.jobId), eq(schema.jobs.organizationId, organizationId)),
        )
        .limit(1);

      if (!job) {
        return notFoundResponse(c, "job_not_found", "Job not found");
      }

      if (!job.externalProviderKind) {
        return c.json({ actions: [] }, 200);
      }

      return c.json({ actions: getJobProviderActionAvailability(job.externalProviderKind) }, 200);
    })
    .post(
      "/:jobId/agent-runs",
      validateWorkspaceJobParams,
      validateCreateJobAgentRunBody,
      async (c) => {
        if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload = c.req.valid("json");
        const organizationId = c.var.auth.organization.localOrganizationId;

        const [job] = await db
          .select({
            id: schema.jobs.id,
            projectId: schema.jobs.projectId,
            externalProviderKind: schema.externalJobDetails.providerKind,
            externalJobId: schema.externalJobDetails.externalJobId,
            externalTaskId: schema.externalJobDetails.externalTaskId,
          })
          .from(schema.jobs)
          .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
          .where(
            and(eq(schema.jobs.id, params.jobId), eq(schema.jobs.organizationId, organizationId)),
          )
          .limit(1);

        if (!job) {
          return notFoundResponse(c, "job_not_found", "Job not found");
        }

        if (!job.externalProviderKind || !job.externalJobId) {
          return conflictResponse(
            c,
            "provider_job_required",
            "Agent runs are only available for provider-backed jobs",
          );
        }

        if (!isJobProviderActionAvailable(job.externalProviderKind, payload.action)) {
          return conflictResponse(
            c,
            "provider_action_unavailable",
            "This provider action is not available for the connected TMS",
          );
        }

        const actionDefinition = getJobProviderActionDefinition(payload.action);
        if (!actionDefinition) {
          return badRequestResponse(c, "invalid_provider_action", "Unknown provider action");
        }

        const agentRun = await createAgentRun({
          organizationId,
          providerKind: job.externalProviderKind,
          externalJobId: job.externalJobId,
          externalTaskId: job.externalTaskId,
          kind: actionDefinition.agentRunKind,
          actorUserId: c.var.auth.user.localUserId,
          inputSnapshot: {
            ...actionDefinition.inputSnapshot,
            action: payload.action,
            hyperlocaliseJobId: job.id,
            projectId: job.projectId,
            ...(payload.selectedFindings && payload.selectedFindings.length > 0
              ? { selectedFindings: payload.selectedFindings }
              : {}),
          },
          hyperlocaliseJobId: job.id,
        });

        if (payload.action === "translate_with_agent") {
          try {
            await options.providerAgentTranslationQueue.enqueue({
              agentRunId: agentRun.id,
              organizationId,
            });
          } catch (error) {
            await failAgentRun({
              runId: agentRun.id,
              organizationId,
              outputSummary: { code: "agent_run_queue_unavailable" },
              warnings: [
                error instanceof Error ? error.message : "agent translation queue unavailable",
              ],
            });

            return serviceUnavailableResponse(
              c,
              "agent_run_queue_unavailable",
              "Agent translation queue is unavailable",
            );
          }
        }

        if (providerQaAgentActions.has(payload.action)) {
          try {
            await options.providerAgentQaQueue.enqueue({
              agentRunId: agentRun.id,
              organizationId,
            });
          } catch (error) {
            await failAgentRun({
              runId: agentRun.id,
              organizationId,
              outputSummary: { code: "agent_run_queue_unavailable" },
              warnings: [error instanceof Error ? error.message : "agent QA queue unavailable"],
            });

            return serviceUnavailableResponse(
              c,
              "agent_run_queue_unavailable",
              "Agent QA queue is unavailable",
            );
          }
        }

        if (payload.action === "leave_provider_comment") {
          try {
            await options.providerAgentCommentQueue.enqueue({
              agentRunId: agentRun.id,
              organizationId,
            });
          } catch (error) {
            await failAgentRun({
              runId: agentRun.id,
              organizationId,
              outputSummary: { code: "agent_run_queue_unavailable" },
              warnings: [
                error instanceof Error ? error.message : "agent comment queue unavailable",
              ],
            });

            return serviceUnavailableResponse(
              c,
              "agent_run_queue_unavailable",
              "Agent comment queue is unavailable",
            );
          }
        }

        if (payload.action === "push_approved_changes") {
          try {
            await options.providerAgentWritebackQueue.enqueue({
              agentRunId: agentRun.id,
              organizationId,
            });
          } catch (error) {
            await failAgentRun({
              runId: agentRun.id,
              organizationId,
              outputSummary: { code: "agent_run_queue_unavailable" },
              warnings: [
                error instanceof Error ? error.message : "agent write-back queue unavailable",
              ],
            });

            return serviceUnavailableResponse(
              c,
              "agent_run_queue_unavailable",
              "Agent write-back queue is unavailable",
            );
          }
        }

        return c.json({ agentRun: serializeAgentRun(agentRun) }, 201);
      },
    )
    .post("/:jobId/qa", validateWorkspaceJobParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const organizationId = c.var.auth.organization.localOrganizationId;

      const [job] = await db
        .select({
          projectId: schema.jobs.projectId,
          externalProviderKind: schema.externalJobDetails.providerKind,
          externalJobId: schema.externalJobDetails.externalJobId,
        })
        .from(schema.jobs)
        .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
        .where(
          and(eq(schema.jobs.id, params.jobId), eq(schema.jobs.organizationId, organizationId)),
        )
        .limit(1);

      if (!job) {
        return notFoundResponse(c, "job_not_found", "Job not found");
      }

      if (!job.externalProviderKind || !job.externalJobId) {
        return conflictResponse(
          c,
          "provider_job_required",
          "QA checks are only available for provider-backed jobs",
        );
      }

      if (!isJobProviderActionAvailable(job.externalProviderKind, "run_qa_checks")) {
        return conflictResponse(
          c,
          "provider_action_unavailable",
          "QA checks are not available for the connected TMS",
        );
      }

      if (!getProviderContentPuller(job.externalProviderKind)) {
        return conflictResponse(
          c,
          "unsupported_provider_pull",
          `Provider ${job.externalProviderKind} does not support content pull yet`,
        );
      }

      if (!job.projectId) {
        return badRequestResponse(c, "invalid_job_project", "Job is missing project context");
      }

      try {
        const result = await runProviderJobQaForJob({
          organizationId,
          projectId: job.projectId,
          providerKind: job.externalProviderKind,
          externalJobId: job.externalJobId,
        });

        const qaReport = {
          pullRunId: result.pullRunId,
          findings: result.report.findings,
          summary: result.report.summary,
        };
        const parsed = providerQaReportResponseSchema.safeParse({ qaReport });

        if (!parsed.success) {
          return internalErrorResponse(c, "invalid_qa_report", "QA report failed validation");
        }

        return c.json(parsed.data, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Provider QA failed";
        const status = mapProviderQaErrorToHttpStatus(error);

        if (status === 503) {
          return serviceUnavailableResponse(c, "provider_qa_unavailable", message);
        }

        if (status === 500) {
          return internalErrorResponse(c, "provider_qa_failed", message);
        }

        return badRequestResponse(c, "provider_qa_failed", message);
      }
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
        .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
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
        .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
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
