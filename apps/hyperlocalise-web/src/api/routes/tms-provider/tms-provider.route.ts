import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import { isJobProviderActionAllowed } from "@/api/auth/capability-guards";
import { hasCapability } from "@/api/auth/policy";
import { ownedProjectWhere } from "@/api/auth/team-access";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  conflictResponse,
  notFoundResponse,
  serviceUnavailableResponse,
} from "@/api/errors";
import { db, schema } from "@/lib/database";
import { createAgentRun, failAgentRun } from "@/lib/providers/agent-runs/agent-runs";
import {
  getJobProviderActionDefinition,
  isJobProviderActionAvailable,
} from "@/lib/providers/job-provider-actions";
import { parseProviderJobId } from "@/lib/providers/tms-provider-resource-id";
import type { ProviderAgentTranslationQueue } from "@/lib/workflow/types";
import {
  getTmsProviderConnection,
  getTmsProviderLiveJobFileDetail,
  listTmsProviderLiveJobComments,
  listTmsProviderLiveJobFiles,
  getTmsProviderLiveJobDetail,
  getTmsProviderLiveProjectLocaleReadiness,
  updateTmsProviderLiveJobDescription,
  getTmsProviderLiveProject,
  listTmsProviderLiveFilesForProject,
  listTmsProviderLiveGlossaries,
  listTmsProviderLiveJobs,
  listTmsProviderLiveJobsForProject,
  listTmsProviderLiveProjects,
  listTmsProviderLiveTranslationMemories,
} from "@/lib/providers/tms-provider-live";
import { tmsProviderLiveErrorResponse } from "@/lib/providers/tms-provider-live-error-response";
import { getCurrentUserProviderAssigneeCandidates } from "@/lib/providers/tms-provider-assignee-candidates";
import { projectIdSchema } from "@/lib/projects/identity/project-id";

const mineQuerySchema = z.object({
  mine: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const externalProjectIdQuerySchema = z.object({
  externalProjectId: z.string().min(1).optional(),
});

const projectFilesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1_000).optional().default(500),
});

const localeReadinessQuerySchema = z.object({
  languageId: z.string().min(1).optional(),
});

const updateJobDescriptionBodySchema = z.object({
  description: z.string().max(2_048),
});

const createTmsProviderJobAgentRunBodySchema = z.object({
  projectId: projectIdSchema,
  action: z.literal("translate_with_agent"),
});

function serializeAgentRun(run: typeof schema.agentRuns.$inferSelect) {
  return {
    ...run,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

const jobFileDetailQuerySchema = z.object({
  sourcePath: z.string().min(1),
});

const validateMineQuery = validator("query", (value, c) => {
  const parsed = mineQuerySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_query" }, 400);
  }

  return parsed.data;
});

const validateExternalProjectIdQuery = validator("query", (value, c) => {
  const parsed = externalProjectIdQuerySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_query" }, 400);
  }

  return parsed.data;
});

const validateProjectFilesQuery = validator("query", (value, c) => {
  const parsed = projectFilesQuerySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_query" }, 400);
  }

  return parsed.data;
});

const validateLocaleReadinessQuery = validator("query", (value, c) => {
  const parsed = localeReadinessQuerySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_query" }, 400);
  }

  return parsed.data;
});

const validateJobFileDetailQuery = validator("query", (value, c) => {
  const parsed = jobFileDetailQuerySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_query" }, 400);
  }

  return parsed.data;
});

const validateUpdateJobDescriptionBody = validator("json", (value, c) => {
  const parsed = updateJobDescriptionBodySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_request_body" }, 400);
  }

  return parsed.data;
});

const validateCreateTmsProviderJobAgentRunBody = validator("json", (value, c) => {
  const parsed = createTmsProviderJobAgentRunBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_request_body", "Invalid provider agent run payload");
  }

  return parsed.data;
});

function canEditTmsProviderJobDescription(auth: AuthVariables["auth"]) {
  const role = auth.membership.role;
  return role === "admin" || (role === "localization_manager" && hasCapability(role, "jobs:write"));
}

type CreateTmsProviderRoutesOptions = {
  providerAgentTranslationQueue?: ProviderAgentTranslationQueue;
};

export function createTmsProviderRoutes(options: CreateTmsProviderRoutesOptions = {}) {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/connection", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "provider_credentials:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      try {
        const connection = await getTmsProviderConnection(
          c.var.auth.organization.localOrganizationId,
        );
        if (!connection) {
          return c.json({ error: "no_active_tms_provider" }, 404);
        }

        return c.json({ connection }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
    .get("/projects", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      try {
        const projects = await listTmsProviderLiveProjects(
          c.var.auth.organization.localOrganizationId,
          { actorUserId: c.var.auth.user.localUserId },
        );
        return c.json({ projects }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
    .get("/projects/:externalProjectId", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      try {
        const project = await getTmsProviderLiveProject(
          c.var.auth.organization.localOrganizationId,
          c.req.param("externalProjectId"),
          { actorUserId: c.var.auth.user.localUserId },
        );
        if (!project) {
          return c.json({ error: "project_not_found" }, 404);
        }

        return c.json({ project }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
    .get("/projects/:externalProjectId/jobs", validateMineQuery, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const query = c.req.valid("query");

      try {
        const assigneeCandidates = query.mine
          ? await getCurrentUserProviderAssigneeCandidates(c.var.auth)
          : undefined;
        const jobs = await listTmsProviderLiveJobsForProject(
          c.var.auth.organization.localOrganizationId,
          c.req.param("externalProjectId"),
          {
            mine: query.mine,
            assigneeCandidates,
            actorUserId: c.var.auth.user.localUserId,
          },
        );
        return c.json({ jobs }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
    .get("/projects/:externalProjectId/files", validateProjectFilesQuery, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const query = c.req.valid("query");

      try {
        const files = await listTmsProviderLiveFilesForProject(
          c.var.auth.organization.localOrganizationId,
          c.req.param("externalProjectId"),
          { limit: query.limit, actorUserId: c.var.auth.user.localUserId },
        );
        return c.json({ files }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
    .get(
      "/projects/:externalProjectId/locale-readiness",
      validateLocaleReadinessQuery,
      async (c) => {
        if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
          return c.json({ error: "forbidden" }, 403);
        }

        const query = c.req.valid("query");

        try {
          const localeReadiness = await getTmsProviderLiveProjectLocaleReadiness(
            c.var.auth.organization.localOrganizationId,
            c.req.param("externalProjectId"),
            {
              languageId: query.languageId,
              actorUserId: c.var.auth.user.localUserId,
            },
          );
          return c.json({ localeReadiness }, 200);
        } catch (error) {
          return tmsProviderLiveErrorResponse(c, error);
        }
      },
    )
    .get("/jobs", validateMineQuery, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const query = c.req.valid("query");

      try {
        const assigneeCandidates = query.mine
          ? await getCurrentUserProviderAssigneeCandidates(c.var.auth)
          : undefined;
        const jobs = await listTmsProviderLiveJobs(c.var.auth.organization.localOrganizationId, {
          mine: query.mine,
          assigneeCandidates,
          actorUserId: c.var.auth.user.localUserId,
        });
        return c.json({ jobs }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
    .get("/jobs/:encodedJobId", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      try {
        const job = await getTmsProviderLiveJobDetail(
          c.var.auth.organization.localOrganizationId,
          c.req.param("encodedJobId"),
          { actorUserId: c.var.auth.user.localUserId },
        );
        if (!job) {
          return c.json({ error: "job_not_found" }, 404);
        }

        return c.json({ job }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
    .get("/jobs/:encodedJobId/files", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      try {
        const files = await listTmsProviderLiveJobFiles(
          c.var.auth.organization.localOrganizationId,
          c.req.param("encodedJobId"),
          { actorUserId: c.var.auth.user.localUserId },
        );
        if (!files) {
          return c.json({ error: "job_not_found" }, 404);
        }

        return c.json({ files }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
    .get("/jobs/:encodedJobId/files/detail", validateJobFileDetailQuery, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const query = c.req.valid("query");

      try {
        const file = await getTmsProviderLiveJobFileDetail(
          c.var.auth.organization.localOrganizationId,
          c.req.param("encodedJobId"),
          query.sourcePath,
          { actorUserId: c.var.auth.user.localUserId },
        );
        if (!file) {
          return c.json({ error: "file_not_found" }, 404);
        }

        return c.json({ file }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
    .get("/jobs/:encodedJobId/comments", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      try {
        const comments = await listTmsProviderLiveJobComments(
          c.var.auth.organization.localOrganizationId,
          c.req.param("encodedJobId"),
          { actorUserId: c.var.auth.user.localUserId },
        );
        if (!comments) {
          return c.json({ error: "job_not_found" }, 404);
        }

        return c.json({ comments }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
    .patch("/jobs/:encodedJobId/description", validateUpdateJobDescriptionBody, async (c) => {
      if (!canEditTmsProviderJobDescription(c.var.auth)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const body = c.req.valid("json");

      try {
        const job = await updateTmsProviderLiveJobDescription(
          c.var.auth.organization.localOrganizationId,
          c.req.param("encodedJobId"),
          body.description,
          c.var.auth.user.localUserId,
        );
        if (!job) {
          return c.json({ error: "job_not_found" }, 404);
        }

        return c.json({ job }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
    .post("/jobs/:encodedJobId/agent-runs", validateCreateTmsProviderJobAgentRunBody, async (c) => {
      const payload = c.req.valid("json");
      const encodedJobId = c.req.param("encodedJobId");

      if (!isJobProviderActionAllowed(c.var.auth.membership.role, payload.action)) {
        return c.json({ error: "forbidden" }, 403);
      }

      const organizationId = c.var.auth.organization.localOrganizationId;
      const parsedJobId = parseProviderJobId(encodedJobId);
      if (!parsedJobId) {
        return badRequestResponse(c, "invalid_encoded_job_id", "Job id is not a provider job id");
      }

      const [project] = await db
        .select({
          id: schema.projects.id,
          externalProjectId: schema.projects.externalProjectId,
          externalProviderKind: schema.projects.externalProviderKind,
        })
        .from(schema.projects)
        .where(await ownedProjectWhere(c.var.auth, payload.projectId))
        .limit(1);

      if (!project) {
        return notFoundResponse(c, "project_not_found", "Project not found");
      }

      if (
        project.externalProjectId &&
        project.externalProjectId !== parsedJobId.externalProjectId
      ) {
        return conflictResponse(
          c,
          "project_job_mismatch",
          "Provider job does not belong to this project",
        );
      }

      if (
        project.externalProviderKind &&
        project.externalProviderKind !== parsedJobId.providerKind
      ) {
        return conflictResponse(
          c,
          "project_provider_mismatch",
          "Provider job does not match the connected TMS for this project",
        );
      }

      if (!isJobProviderActionAvailable(parsedJobId.providerKind, payload.action)) {
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

      let job;
      try {
        job = await getTmsProviderLiveJobDetail(organizationId, encodedJobId, {
          actorUserId: c.var.auth.user.localUserId,
        });
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }

      if (!job) {
        return notFoundResponse(c, "job_not_found", "Provider job not found");
      }

      let liveFiles;
      try {
        liveFiles = await listTmsProviderLiveJobFiles(organizationId, encodedJobId, {
          actorUserId: c.var.auth.user.localUserId,
        });
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
      const sourceFiles = (liveFiles ?? []).map((file) => ({
        id: file.provider.externalResourceId,
        displayName: file.filename,
        sourcePath: file.sourcePath,
        resourceType: file.provider.resourceType,
        externalUrl: file.provider.externalUrl,
      }));

      const agentRun = await createAgentRun({
        organizationId,
        providerKind: parsedJobId.providerKind,
        externalJobId: job.externalJobId,
        externalTaskId: job.externalTaskId,
        kind: actionDefinition.agentRunKind,
        actorUserId: c.var.auth.user.localUserId,
        inputSnapshot: {
          ...actionDefinition.inputSnapshot,
          action: payload.action,
          projectId: payload.projectId,
          encodedJobId,
          providerPayload: job.externalProviderPayload,
          sourceFiles,
        },
      });

      if (!options.providerAgentTranslationQueue) {
        await failAgentRun({
          runId: agentRun.id,
          organizationId,
          outputSummary: { code: "agent_run_queue_unavailable" },
          warnings: ["agent translation queue unavailable"],
        });

        return serviceUnavailableResponse(
          c,
          "agent_run_queue_unavailable",
          "Agent translation queue is unavailable",
        );
      }

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

      return c.json({ agentRun: serializeAgentRun(agentRun) }, 201);
    })
    .get("/glossaries", validateExternalProjectIdQuery, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "glossaries:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const query = c.req.valid("query");

      try {
        const glossaries = await listTmsProviderLiveGlossaries(
          c.var.auth.organization.localOrganizationId,
          {
            externalProjectId: query.externalProjectId,
            actorUserId: c.var.auth.user.localUserId,
          },
        );
        return c.json({ glossaries }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
    .get("/translation-memories", validateExternalProjectIdQuery, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "memories:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const query = c.req.valid("query");

      try {
        const translationMemories = await listTmsProviderLiveTranslationMemories(
          c.var.auth.organization.localOrganizationId,
          {
            externalProjectId: query.externalProjectId,
            actorUserId: c.var.auth.user.localUserId,
          },
        );
        return c.json({ translationMemories }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    });
}
