import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import {
  getTmsProviderConnection,
  getTmsProviderLiveJobDetail,
  updateTmsProviderLiveJobDescription,
  getTmsProviderLiveProject,
  listTmsProviderLiveFilesForProject,
  listTmsProviderLiveGlossaries,
  listTmsProviderLiveJobs,
  listTmsProviderLiveJobsForProject,
  listTmsProviderLiveProjects,
  listTmsProviderLiveTranslationMemories,
  TmsProviderLiveError,
} from "@/lib/providers/tms-provider-live";
import { getCrowdinUserConnectionSummary } from "@/lib/providers/adapters/crowdin/crowdin-user-connections";

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

const validateUpdateJobDescriptionBody = validator("json", (value, c) => {
  const parsed = updateJobDescriptionBodySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_request_body" }, 400);
  }

  return parsed.data;
});

function mapTmsProviderLiveError(
  c: { json: (body: unknown, status: number) => Response },
  error: unknown,
) {
  if (error instanceof TmsProviderLiveError) {
    switch (error.code) {
      case "no_active_tms_provider":
        return c.json({ error: error.code, message: error.message }, 404);
      case "crowdin_auth_invalid":
        return c.json({ error: error.code, message: error.message }, 401);
      case "crowdin_user_auth_invalid":
      case "crowdin_user_connection_required":
        return c.json({ error: error.code, message: error.message }, 401);
      case "invalid_encoded_job_id":
        return c.json({ error: error.code, message: error.message }, 400);
      case "provider_fetcher_unavailable":
        return c.json({ error: error.code, message: error.message }, 501);
      case "provider_description_edit_unsupported":
        return c.json({ error: error.code, message: error.message }, 501);
      default:
        return c.json({ error: error.code, message: error.message }, 500);
    }
  }

  throw error;
}

async function getCurrentUserProviderAssigneeCandidates(auth: AuthVariables["auth"]) {
  const candidates = [auth.user.email];
  const crowdinUserConnection = await getCrowdinUserConnectionSummary({
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
        return mapTmsProviderLiveError(c, error);
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
        return mapTmsProviderLiveError(c, error);
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
        return mapTmsProviderLiveError(c, error);
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
        return mapTmsProviderLiveError(c, error);
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
        return mapTmsProviderLiveError(c, error);
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
        return mapTmsProviderLiveError(c, error);
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
        return mapTmsProviderLiveError(c, error);
      }
    })
    .patch("/jobs/:encodedJobId/description", validateUpdateJobDescriptionBody, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "jobs:write")) {
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
        return mapTmsProviderLiveError(c, error);
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
        return mapTmsProviderLiveError(c, error);
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
        return mapTmsProviderLiveError(c, error);
      }
    });
}
