import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import {
  getTmsProviderConnection,
  getTmsProviderLiveJobFileDetail,
  listTmsProviderLiveJobComments,
  listTmsProviderLiveJobFiles,
  getTmsProviderLiveJobDetail,
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
import { getCrowdinUserConnectionSummary } from "@/lib/providers/adapters/crowdin/crowdin-user-connections";
import { getPhraseUserConnectionSummary } from "@/lib/providers/adapters/phrase/phrase-user-connections";

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

const updateJobDescriptionBodySchema = z.object({
  description: z.string().max(2_048),
});

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

function canEditTmsProviderJobDescription(auth: AuthVariables["auth"]) {
  const role = auth.membership.role;
  return role === "admin" || (role === "localization_manager" && hasCapability(role, "jobs:write"));
}

async function getCurrentUserProviderAssigneeCandidates(auth: AuthVariables["auth"]) {
  const candidates = [auth.user.email];
  const crowdinUserConnection = await getCrowdinUserConnectionSummary({
    organizationId: auth.organization.localOrganizationId,
    userId: auth.user.localUserId,
  });
  const phraseUserConnection = await getPhraseUserConnectionSummary({
    organizationId: auth.organization.localOrganizationId,
    userId: auth.user.localUserId,
  });

  if (crowdinUserConnection) {
    candidates.push(
      crowdinUserConnection.username,
      crowdinUserConnection.email ?? "",
      crowdinUserConnection.fullName ?? "",
    );
  }
  if (phraseUserConnection) {
    candidates.push(
      phraseUserConnection.username,
      phraseUserConnection.email ?? "",
      phraseUserConnection.fullName ?? "",
    );
  }

  return candidates.filter((candidate) => candidate.trim().length > 0);
}

export function createTmsProviderRoutes() {
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
