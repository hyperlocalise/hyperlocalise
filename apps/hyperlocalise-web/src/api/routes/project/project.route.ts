import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { Project } from "@/lib/database/types";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";
import { createTranslationJobEventQueue } from "@/workflows/adapters";

import {
  createProjectBodySchema,
  projectIdParamsSchema,
  updateProjectBodySchema,
  type CreateProjectBody,
  type UpdateProjectBody,
} from "./project.schema";
import {
  forbiddenResponse,
  getOwnedProject,
  invalidProjectPayloadResponse,
  isProjectMutationAllowed,
  ownedProjectWhere,
  projectNotFoundResponse,
} from "./project.shared";
import { createJobRoutes } from "./job.route";

type ProjectStore = {
  list(auth: ApiAuthContext): Promise<Project[]>;
  create(auth: ApiAuthContext, payload: CreateProjectBody): Promise<Project>;
  getById(auth: ApiAuthContext, projectId: string): Promise<Project | null>;
  update(
    auth: ApiAuthContext,
    projectId: string,
    payload: UpdateProjectBody,
  ): Promise<Project | null>;
  delete(auth: ApiAuthContext, projectId: string): Promise<boolean>;
};

const projectStore: ProjectStore = {
  async list(auth) {
    return db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, auth.organization.localOrganizationId))
      .orderBy(desc(schema.projects.createdAt));
  },
  async create(auth, payload) {
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: auth.organization.localOrganizationId,
        createdByUserId: auth.user.localUserId,
        name: payload.name,
        description: payload.description ?? "",
        translationContext: payload.translationContext ?? "",
      })
      .returning();

    return project;
  },
  async getById(auth, projectId) {
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(ownedProjectWhere(auth, projectId))
      .limit(1);

    return project ?? null;
  },
  async update(auth, projectId, payload) {
    const [project] = await db
      .update(schema.projects)
      .set(payload)
      .where(ownedProjectWhere(auth, projectId))
      .returning();

    return project ?? null;
  },
  async delete(auth, projectId) {
    const deletedProjects = await db
      .delete(schema.projects)
      .where(ownedProjectWhere(auth, projectId))
      .returning({ id: schema.projects.id });

    return deletedProjects.length > 0;
  },
};

const validateProjectParams = validator("param", (value, c) => {
  const parsed = projectIdParamsSchema.safeParse(value);

  if (!parsed.success) {
    return projectNotFoundResponse(c);
  }

  return parsed.data;
});

const validateCreateProjectBody = validator("json", (value, c) => {
  const parsed = createProjectBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

const validateUpdateProjectBody = validator("json", (value, c) => {
  const parsed = updateProjectBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

type CreateProjectRoutesOptions = {
  jobQueue?: JobQueue<TranslationJobEventData>;
};

export function createProjectRoutes(options: CreateProjectRoutesOptions = {}) {
  const jobQueue = options.jobQueue ?? createTranslationJobEventQueue();

  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const projects = await projectStore.list(c.var.auth);
      return c.json({ projects }, 200);
    })
    .post("/", validateCreateProjectBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const project = await projectStore.create(c.var.auth, payload);
      return c.json({ project }, 201);
    })
    .route("/:projectId/jobs", createJobRoutes({ jobQueue }))
    .get("/:projectId/files", validateProjectParams, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      const versions = await db
        .select({
          versionId: schema.repositorySourceFileVersions.id,
          sourcePath: schema.repositorySourceFileVersions.sourcePath,
          sourceHash: schema.repositorySourceFileVersions.sourceHash,
          commitSha: schema.repositorySourceFileVersions.commitSha,
          workflowRunId: schema.repositorySourceFileVersions.workflowRunId,
          uploadedAt: schema.repositorySourceFileVersions.createdAt,
          storedFileId: schema.repositorySourceFileVersions.storedFileId,
          metadata: schema.storedFiles.metadata,
          filename: schema.storedFiles.filename,
          byteSize: schema.storedFiles.byteSize,
        })
        .from(schema.repositorySourceFileVersions)
        .innerJoin(
          schema.storedFiles,
          eq(schema.storedFiles.id, schema.repositorySourceFileVersions.storedFileId),
        )
        .where(
          and(
            eq(schema.storedFiles.projectId, params.projectId),
            eq(schema.storedFiles.role, "source"),
            eq(schema.storedFiles.sourceKind, "repository_file"),
            eq(schema.storedFiles.organizationId, c.var.auth.organization.localOrganizationId),
          ),
        )
        .orderBy(
          schema.repositorySourceFileVersions.sourcePath,
          desc(schema.repositorySourceFileVersions.createdAt),
        );

      const latestByPath = new Map<string, (typeof versions)[number]>();
      for (const v of versions) {
        if (!latestByPath.has(v.sourcePath)) {
          latestByPath.set(v.sourcePath, v);
        }
      }

      const versionIds = Array.from(latestByPath.values()).map((v) => v.versionId);

      const latestJobs = new Map<
        string,
        {
          jobId: string;
          jobStatus: string;
          jobCreatedAt: Date;
          jobType: string;
        }
      >();

      if (versionIds.length > 0) {
        const jobs = await db
          .select({
            versionId: schema.translationJobDetails.sourceFileVersionId,
            jobId: schema.jobs.id,
            jobStatus: schema.jobs.status,
            jobCreatedAt: schema.jobs.createdAt,
            jobType: schema.translationJobDetails.type,
          })
          .from(schema.jobs)
          .innerJoin(
            schema.translationJobDetails,
            eq(schema.translationJobDetails.jobId, schema.jobs.id),
          )
          .where(
            and(
              eq(schema.jobs.projectId, params.projectId),
              inArray(schema.translationJobDetails.sourceFileVersionId, versionIds),
            ),
          )
          .orderBy(desc(schema.jobs.createdAt));

        for (const j of jobs) {
          if (j.versionId && !latestJobs.has(j.versionId)) {
            latestJobs.set(j.versionId, j);
          }
        }
      }

      const files = Array.from(latestByPath.values()).map((v) => {
        const job = latestJobs.get(v.versionId);
        return {
          sourcePath: v.sourcePath,
          sourceHash: v.sourceHash,
          commitSha: v.commitSha,
          workflowRunId: v.workflowRunId,
          uploadedAt: v.uploadedAt.toISOString(),
          storedFileId: v.storedFileId,
          metadata: v.metadata as Record<string, unknown>,
          filename: v.filename,
          byteSize: v.byteSize,
          latestJob: job
            ? {
                id: job.jobId,
                status: job.jobStatus,
                createdAt: job.jobCreatedAt.toISOString(),
                type: job.jobType,
              }
            : null,
        };
      });

      return c.json({ files }, 200);
    })
    .get("/:projectId", validateProjectParams, async (c) => {
      const params = c.req.valid("param");
      const project = await projectStore.getById(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      return c.json({ project }, 200);
    })
    .patch("/:projectId", validateProjectParams, validateUpdateProjectBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");
      const project = await projectStore.update(c.var.auth, params.projectId, payload);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      return c.json({ project }, 200);
    })
    .delete("/:projectId", validateProjectParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const deleted = await projectStore.delete(c.var.auth, params.projectId);

      if (!deleted) {
        return projectNotFoundResponse(c);
      }

      return c.body(null, 204);
    });
}

export const projectRoutes = createProjectRoutes();
