import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { Project } from "@/lib/database/types";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";
import { fetchCrowdinFileKeys } from "@/lib/providers/crowdin/crowdin-file-fetcher";
import { fetchCrowdinJobTasks } from "@/lib/providers/crowdin/crowdin-job-task-fetcher";
import {
  syncExternalTmsFileKeys,
  type ExternalTmsFileKeyFetcher,
} from "@/lib/providers/external-tms-file-sync";
import {
  syncExternalTmsGlossaries,
  type ExternalTmsGlossaryFetcher,
} from "@/lib/providers/external-tms-glossary-sync";
import {
  syncExternalTmsJobTasks,
  type ExternalTmsJobTaskFetcher,
} from "@/lib/providers/external-tms-job-sync";
import {
  syncExternalTmsTranslationMemories,
  type ExternalTmsTranslationMemoryFetcher,
} from "@/lib/providers/external-tms-tm-sync";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { getProviderContentPuller } from "@/lib/providers/provider-content-pullers";
import { getProviderTranslationPusher } from "@/lib/providers/provider-translation-pushers";
import { fetchLokaliseFileKeys } from "@/lib/providers/lokalise/lokalise-file-fetcher";
import { fetchLokaliseJobTasks } from "@/lib/providers/lokalise/lokalise-job-task-fetcher";
import { fetchPhraseGlossaries } from "@/lib/providers/phrase/phrase-glossary-fetcher";
import { fetchPhraseFileKeys } from "@/lib/providers/phrase/phrase-file-fetcher";
import { fetchPhraseJobTasks } from "@/lib/providers/phrase/phrase-job-task-fetcher";
import { fetchPhraseTranslationMemories } from "@/lib/providers/phrase/phrase-translation-memory-fetcher";
import { fetchSmartlingFileKeys } from "@/lib/providers/smartling/smartling-file-fetcher";
import { fetchSmartlingJobTasks } from "@/lib/providers/smartling/smartling-job-fetcher";
import {
  pullExternalTmsTaskContent,
  pushExternalTmsTranslations,
} from "@/lib/providers/external-tms-content-sync";
import { getProjectFileDetail } from "@/lib/projects/project-file-detail";
import { listFilteredProjectFiles } from "@/lib/projects/project-files";
import type { ExternalTmsResourceType } from "@/lib/providers/organization-external-tms-files";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";
import { createTranslationJobEventQueue } from "@/workflows/adapters";

import {
  createProjectBodySchema,
  externalTmsContentSyncBodySchema,
  externalTmsTranslationPushBodySchema,
  projectFileDetailQuerySchema,
  projectFilesQuerySchema,
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

async function countOpenJobs(auth: ApiAuthContext, projectId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.organizationId, auth.organization.localOrganizationId),
        eq(schema.jobs.projectId, projectId),
        inArray(schema.jobs.status, ["queued", "running", "waiting_for_review"]),
      ),
    );
  return row?.count ?? 0;
}

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
        source: "native",
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

const validateProjectFileDetailQuery = validator("query", (value, c) => {
  const parsed = projectFileDetailQuerySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

const validateProjectFilesQuery = validator("query", (value, c) => {
  const parsed = projectFilesQuerySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
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

const validateExternalTmsContentSyncBody = validator("json", (value, c) => {
  const parsed = externalTmsContentSyncBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

const validateExternalTmsTranslationPushBody = validator("json", (value, c) => {
  const parsed = externalTmsTranslationPushBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

type CreateProjectRoutesOptions = {
  jobQueue?: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
};

const fileKeyFetchersByProvider: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsFileKeyFetcher>
> = {
  crowdin: fetchCrowdinFileKeys,
  lokalise: fetchLokaliseFileKeys,
  phrase: fetchPhraseFileKeys,
  smartling: fetchSmartlingFileKeys,
};

const jobTaskFetchersByProvider: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsJobTaskFetcher>
> = {
  crowdin: fetchCrowdinJobTasks,
  lokalise: fetchLokaliseJobTasks,
  phrase: fetchPhraseJobTasks,
  smartling: fetchSmartlingJobTasks,
};

const glossaryFetchersByProvider: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsGlossaryFetcher>
> = {
  phrase: fetchPhraseGlossaries,
};

const translationMemoryFetchersByProvider: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsTranslationMemoryFetcher>
> = {
  phrase: fetchPhraseTranslationMemories,
};

export function createProjectRoutes(options: CreateProjectRoutesOptions = {}) {
  const jobQueue = options.jobQueue ?? createTranslationJobEventQueue();

  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const projects = await projectStore.list(c.var.auth);

      const projectIds = projects.map((p) => p.id);
      const openJobCounts =
        projectIds.length > 0
          ? await db
              .select({
                projectId: schema.jobs.projectId,
                count: sql<number>`count(*)`.mapWith(Number),
              })
              .from(schema.jobs)
              .where(
                and(
                  eq(schema.jobs.organizationId, c.var.auth.organization.localOrganizationId),
                  inArray(schema.jobs.projectId, projectIds),
                  inArray(schema.jobs.status, ["queued", "running", "waiting_for_review"]),
                ),
              )
              .groupBy(schema.jobs.projectId)
          : [];

      const openJobCountByProjectId = new Map(
        openJobCounts.map((row) => [row.projectId, row.count]),
      );

      const projectsWithJobCounts = projects.map((project) => ({
        ...project,
        openJobCount: openJobCountByProjectId.get(project.id) ?? 0,
      }));

      return c.json({ projects: projectsWithJobCounts }, 200);
    })
    .post("/", validateCreateProjectBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const project = await projectStore.create(c.var.auth, payload);
      return c.json({ project: { ...project, openJobCount: 0 } }, 201);
    })
    .route("/:projectId/jobs", createJobRoutes({ jobQueue }))
    .get(
      "/:projectId/files/detail",
      validateProjectParams,
      validateProjectFileDetailQuery,
      async (c) => {
        const params = c.req.valid("param");
        const query = c.req.valid("query");
        const project = await getOwnedProject(c.var.auth, params.projectId);

        if (!project) {
          return projectNotFoundResponse(c);
        }

        const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
        const organizationSlug =
          c.var.auth.organization.slug ?? c.var.auth.organization.localOrganizationId;
        const file = await getProjectFileDetail({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: params.projectId,
          sourcePath: query.sourcePath,
          organizationSlug,
          adapter,
        });

        if (!file) {
          return projectNotFoundResponse(c);
        }

        return c.json({ file }, 200);
      },
    )
    .get("/:projectId/files", validateProjectParams, validateProjectFilesQuery, async (c) => {
      const params = c.req.valid("param");
      const query = c.req.valid("query");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      const resourceTypes =
        query.resourceType && query.resourceType !== "all"
          ? ([query.resourceType] as ExternalTmsResourceType[])
          : undefined;

      const files = await listFilteredProjectFiles({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: params.projectId,
        query: {
          ...query,
          origin: query.origin ?? "all",
          resourceType: query.resourceType ?? "all",
          providerKind: query.providerKind ?? "all",
          locale: query.locale ?? "all",
          syncState: query.syncState ?? "all",
        },
        resourceTypes,
      });

      return c.json({ files }, 200);
    })
    .get("/:projectId", validateProjectParams, async (c) => {
      const params = c.req.valid("param");
      const project = await projectStore.getById(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      const openJobCount = await countOpenJobs(c.var.auth, project.id);
      return c.json({ project: { ...project, openJobCount } }, 200);
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

      const openJobCount = await countOpenJobs(c.var.auth, project.id);
      return c.json({ project: { ...project, openJobCount } }, 200);
    })
    .post("/:projectId/sync-files", validateProjectParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const project = await projectStore.getById(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      if (!project.externalProviderKind) {
        return c.json({ error: "provider_sync_not_implemented" }, 501);
      }

      const fetchFileKeys = fileKeyFetchersByProvider[project.externalProviderKind];
      if (!fetchFileKeys) {
        return c.json({ error: "provider_sync_not_implemented" }, 501);
      }

      const result = await syncExternalTmsFileKeys({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: project.id,
        providerKind: project.externalProviderKind,
        fetchFileKeys,
      });

      return c.json({ externalTmsFileKeySync: result }, result.status === "failed" ? 207 : 200);
    })
    .post("/:projectId/sync-jobs", validateProjectParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const project = await projectStore.getById(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      if (!project.externalProviderKind) {
        return c.json({ error: "provider_sync_not_implemented" }, 501);
      }

      const fetchJobTasks = jobTaskFetchersByProvider[project.externalProviderKind];
      if (!fetchJobTasks) {
        return c.json({ error: "provider_sync_not_implemented" }, 501);
      }

      const result = await syncExternalTmsJobTasks({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: project.id,
        providerKind: project.externalProviderKind,
        fetchJobTasks,
      });

      return c.json({ externalTmsJobTaskSync: result }, result.status === "failed" ? 207 : 200);
    })
    .post("/:projectId/sync-glossaries", validateProjectParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const project = await projectStore.getById(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      if (!project.externalProviderKind) {
        return c.json({ error: "provider_sync_not_implemented" }, 501);
      }

      const fetchGlossaries = glossaryFetchersByProvider[project.externalProviderKind];
      if (!fetchGlossaries) {
        return c.json({ error: "provider_sync_not_implemented" }, 501);
      }

      const result = await syncExternalTmsGlossaries({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: project.id,
        providerKind: project.externalProviderKind,
        fetchGlossaries,
      });

      return c.json({ externalTmsGlossarySync: result }, result.status === "failed" ? 207 : 200);
    })
    .post("/:projectId/sync-translation-memories", validateProjectParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const project = await projectStore.getById(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      if (!project.externalProviderKind) {
        return c.json({ error: "provider_sync_not_implemented" }, 501);
      }

      const fetchTranslationMemories =
        translationMemoryFetchersByProvider[project.externalProviderKind];
      if (!fetchTranslationMemories) {
        return c.json({ error: "provider_sync_not_implemented" }, 501);
      }

      const result = await syncExternalTmsTranslationMemories({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: project.id,
        providerKind: project.externalProviderKind,
        fetchTranslationMemories,
      });

      return c.json(
        { externalTmsTranslationMemorySync: result },
        result.status === "failed" ? 207 : 200,
      );
    })
    .post(
      "/:projectId/sync-pull-content",
      validateProjectParams,
      validateExternalTmsContentSyncBody,
      async (c) => {
        if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload = c.req.valid("json");
        const project = await projectStore.getById(c.var.auth, params.projectId);

        if (!project) {
          return projectNotFoundResponse(c);
        }

        if (!project.externalProviderKind) {
          return c.json({ error: "provider_sync_not_implemented" }, 501);
        }

        const pullContent = getProviderContentPuller(project.externalProviderKind);
        if (!pullContent) {
          return c.json({ error: "provider_sync_not_implemented" }, 501);
        }

        const result = await pullExternalTmsTaskContent({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: project.id,
          providerKind: project.externalProviderKind,
          externalJobId: payload.externalJobId,
          pullContent,
        });

        return c.json({ externalTmsContentPull: result }, result.status === "failed" ? 207 : 200);
      },
    )
    .post(
      "/:projectId/sync-push-translations",
      validateProjectParams,
      validateExternalTmsTranslationPushBody,
      async (c) => {
        if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload = c.req.valid("json");
        const project = await projectStore.getById(c.var.auth, params.projectId);

        if (!project) {
          return projectNotFoundResponse(c);
        }

        if (!project.externalProviderKind) {
          return c.json({ error: "provider_sync_not_implemented" }, 501);
        }

        const pushTranslations = getProviderTranslationPusher(project.externalProviderKind);
        if (!pushTranslations) {
          return c.json({ error: "provider_sync_not_implemented" }, 501);
        }

        const result = await pushExternalTmsTranslations({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: project.id,
          providerKind: project.externalProviderKind,
          externalJobId: payload.externalJobId,
          translations: payload.translations,
          pushTranslations,
        });

        return c.json(
          { externalTmsTranslationPush: result },
          result.status === "failed" ? 207 : 200,
        );
      },
    )
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
