import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse } from "@/api/errors";
import { db, schema } from "@/lib/database";
import type { Project } from "@/lib/database/types";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";
import { createRepositorySourceFileVersion, createStoredFile } from "@/lib/file-storage/records";
import { sourceContentType } from "@/lib/file-storage/source-file-metadata";
import { fetchCrowdinFileKeys } from "@/lib/providers/adapters/crowdin/crowdin-file-fetcher";
import { fetchCrowdinGlossaries } from "@/lib/providers/adapters/crowdin/crowdin-glossary-fetcher";
import { fetchCrowdinJobTasks } from "@/lib/providers/adapters/crowdin/crowdin-job-task-fetcher";
import { fetchCrowdinTranslationMemories } from "@/lib/providers/adapters/crowdin/crowdin-tm-fetcher";
import {
  syncExternalTmsFileKeys,
  type ExternalTmsFileKeyFetcher,
} from "@/lib/providers/sync/external-tms-file-sync";
import {
  syncExternalTmsGlossaries,
  type ExternalTmsGlossaryFetcher,
} from "@/lib/providers/sync/external-tms-glossary-sync";
import {
  syncExternalTmsJobTasks,
  type ExternalTmsJobTaskFetcher,
} from "@/lib/providers/sync/external-tms-job-sync";
import {
  syncExternalTmsTranslationMemories,
  type ExternalTmsTranslationMemoryFetcher,
} from "@/lib/providers/sync/external-tms-tm-sync";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { getProviderContentPuller } from "@/lib/providers/provider-content-pullers";
import { getProviderTranslationPusher } from "@/lib/providers/provider-translation-pushers";
import { fetchLokaliseFileKeys } from "@/lib/providers/adapters/lokalise/lokalise-file-fetcher";
import { fetchLokaliseGlossaries } from "@/lib/providers/adapters/lokalise/lokalise-glossary-fetcher";
import { fetchLokaliseJobTasks } from "@/lib/providers/adapters/lokalise/lokalise-job-task-fetcher";
import { fetchLokaliseTranslationMemories } from "@/lib/providers/adapters/lokalise/lokalise-translation-memory-fetcher";
import { fetchPhraseGlossaries } from "@/lib/providers/adapters/phrase/phrase-glossary-fetcher";
import { fetchPhraseFileKeys } from "@/lib/providers/adapters/phrase/phrase-file-fetcher";
import { fetchPhraseJobTasks } from "@/lib/providers/adapters/phrase/phrase-job-task-fetcher";
import { fetchPhraseTranslationMemories } from "@/lib/providers/adapters/phrase/phrase-translation-memory-fetcher";
import { fetchSmartlingFileKeys } from "@/lib/providers/adapters/smartling/smartling-file-fetcher";
import { fetchSmartlingGlossaries } from "@/lib/providers/adapters/smartling/smartling-glossary-fetcher";
import { fetchSmartlingJobTasks } from "@/lib/providers/adapters/smartling/smartling-job-fetcher";
import { fetchSmartlingTranslationMemories } from "@/lib/providers/adapters/smartling/smartling-translation-memory-fetcher";
import {
  pullExternalTmsTaskContent,
  pushExternalTmsTranslations,
} from "@/lib/providers/sync/external-tms-content-sync";
import {
  getTmsProviderConnection,
  getTmsProviderLiveFileDetail,
  getTmsProviderLiveProject,
  listTmsProviderLiveFilesForProject,
  listTmsProviderLiveProjects,
} from "@/lib/providers/tms-provider-live";
import { getProjectFileDetail } from "@/lib/projects/project-file-detail";
import { listFilteredProjectFiles } from "@/lib/projects/project-files";
import type { ExternalTmsResourceType } from "@/lib/providers/sync/organization-external-tms-files";
import type {
  JobQueue,
  ProviderAgentQaQueue,
  ProviderAgentTranslationQueue,
  TranslationJobEventData,
} from "@/lib/workflow/types";
import { createTranslationJobEventQueue } from "@/workflows/adapters";

import {
  createProjectBodySchema,
  externalTmsContentSyncBodySchema,
  externalTmsTranslationPushBodySchema,
  maxProjectFileUploadBytes,
  projectFileDetailQuerySchema,
  projectFileUploadBodySchema,
  projectFilesQuerySchema,
  projectIdParamsSchema,
  updateProjectBodySchema,
  type CreateProjectBody,
  type UpdateProjectBody,
} from "./project.schema";
import { getVisibleTeamIds, hasOrganizationWideProjectAccess } from "@/api/auth/team-access";
import { normalizeProjectLocalePatch, type ProjectLocalePatchError } from "@/lib/i18n/locales";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import {
  buildAccessibleProjectsWhere,
  forbiddenResponse,
  getOwnedProject,
  invalidProjectPayloadResponse,
  isProjectCreateAllowed,
  isProjectMutationAllowed,
  ownedProjectWhere,
  projectNotFoundResponse,
  providerProjectUnavailableResponse,
  resolveProjectResourceTarget,
  scheduleProjectNotFoundDiagnostics,
  tmsProviderLiveErrorResponse,
  unsupportedProjectFileResponse,
} from "./project.shared";
import { createJobRoutes } from "./job.route";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";

type ProjectUpdateErrorCode =
  | "invalid_project_team"
  | "external_project_locales_readonly"
  | ProjectLocalePatchError;

type ProjectUpdateError = {
  code: ProjectUpdateErrorCode;
  message?: string;
};

type ProjectUpdateResult = Result<Project | null, ProjectUpdateError>;

const projectLocalePatchErrorMessages: Record<
  Exclude<ProjectUpdateErrorCode, "invalid_project_team">,
  string
> = {
  external_project_locales_readonly: "External TMS project locales are read-only",
  invalid_source_locale: "Invalid source locale",
  invalid_target_locales: "Invalid target locales",
  source_in_targets: "Source locale cannot also be a target locale",
};

type ProjectStore = {
  list(auth: ApiAuthContext): Promise<Project[]>;
  create(auth: ApiAuthContext, payload: CreateProjectBody): Promise<Project>;
  getById(auth: ApiAuthContext, projectId: string): Promise<Project | null>;
  update(
    auth: ApiAuthContext,
    projectId: string,
    payload: UpdateProjectBody,
  ): Promise<ProjectUpdateResult>;
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

async function resolveProjectTeamId(auth: ApiAuthContext, requestedTeamId?: string) {
  if (requestedTeamId) {
    if (!hasOrganizationWideProjectAccess(auth)) {
      const visibleTeamIds = await getVisibleTeamIds(auth);
      if (!visibleTeamIds.includes(requestedTeamId)) {
        return null;
      }
    }

    const [team] = await db
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(
        and(
          eq(schema.teams.id, requestedTeamId),
          eq(schema.teams.organizationId, auth.organization.localOrganizationId),
        ),
      )
      .limit(1);

    return team?.id ?? null;
  }

  if (auth.activeTeam) {
    return auth.activeTeam.id;
  }

  const defaultTeam = await ensureDefaultWorkspaceTeam(auth.organization.localOrganizationId);
  return defaultTeam.id;
}

const projectStore: ProjectStore = {
  async list(auth) {
    return db
      .select()
      .from(schema.projects)
      .where(await buildAccessibleProjectsWhere(auth))
      .orderBy(desc(schema.projects.createdAt));
  },
  async create(auth, payload) {
    const teamId = await resolveProjectTeamId(auth, payload.teamId);
    if (!teamId) {
      throw new Error("invalid_project_team");
    }

    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: auth.organization.localOrganizationId,
        teamId,
        createdByUserId: auth.user.localUserId,
        name: payload.name,
        description: payload.description ?? "",
        translationContext: payload.translationContext ?? "",
        source: "native",
        sourceLocale: payload.sourceLocale,
        targetLocales: payload.targetLocales,
      })
      .returning();

    return project;
  },
  async getById(auth, projectId) {
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(await ownedProjectWhere(auth, projectId))
      .limit(1);

    return project ?? null;
  },
  async update(auth, projectId, payload): Promise<ProjectUpdateResult> {
    const existing = await this.getById(auth, projectId);
    if (!existing) {
      return ok(null);
    }

    const { teamId, sourceLocale, targetLocales, ...updates } = payload;
    const updateValues: typeof updates & {
      teamId?: string;
      sourceLocale?: string;
      targetLocales?: string[];
    } = { ...updates };

    if (teamId !== undefined) {
      const resolvedTeamId = await resolveProjectTeamId(auth, teamId);
      if (!resolvedTeamId) {
        return err({ code: "invalid_project_team" });
      }

      updateValues.teamId = resolvedTeamId;
    }

    if (
      existing.source === "external_tms" &&
      (sourceLocale !== undefined || targetLocales !== undefined)
    ) {
      return err({
        code: "external_project_locales_readonly",
        message: projectLocalePatchErrorMessages.external_project_locales_readonly,
      });
    }

    if (sourceLocale !== undefined || targetLocales !== undefined) {
      const normalized = normalizeProjectLocalePatch({
        existingSourceLocale: existing.sourceLocale,
        existingTargetLocales: existing.targetLocales,
        sourceLocale,
        targetLocales,
      });

      if ("error" in normalized) {
        return err({
          code: normalized.error,
          message: projectLocalePatchErrorMessages[normalized.error],
        });
      }

      if (normalized.sourceLocale !== undefined) {
        updateValues.sourceLocale = normalized.sourceLocale;
      }
      if (normalized.targetLocales !== undefined) {
        updateValues.targetLocales = normalized.targetLocales;
      }
    }

    const [project] = await db
      .update(schema.projects)
      .set(updateValues)
      .where(await ownedProjectWhere(auth, projectId))
      .returning();

    return ok(project ?? null);
  },
  async delete(auth, projectId) {
    const deletedProjects = await db
      .delete(schema.projects)
      .where(await ownedProjectWhere(auth, projectId))
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

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asFile(value: unknown) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.find((item): item is File => item instanceof File && item.size > 0) ?? null;
}

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
  providerAgentTranslationQueue?: ProviderAgentTranslationQueue;
  providerAgentQaQueue?: ProviderAgentQaQueue;
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
  lokalise: fetchLokaliseGlossaries,
  crowdin: fetchCrowdinGlossaries,
  phrase: fetchPhraseGlossaries,
  smartling: fetchSmartlingGlossaries,
};

const translationMemoryFetchersByProvider: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsTranslationMemoryFetcher>
> = {
  lokalise: fetchLokaliseTranslationMemories,
  crowdin: fetchCrowdinTranslationMemories,
  phrase: fetchPhraseTranslationMemories,
  smartling: fetchSmartlingTranslationMemories,
};

export function createProjectRoutes(options: CreateProjectRoutesOptions = {}) {
  const jobQueue = options.jobQueue ?? createTranslationJobEventQueue();

  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const connection = await getTmsProviderConnection(
        c.var.auth.organization.localOrganizationId,
      );
      if (connection) {
        try {
          const projects = await listTmsProviderLiveProjects(
            c.var.auth.organization.localOrganizationId,
          );
          return c.json({ projects }, 200);
        } catch (error) {
          return tmsProviderLiveErrorResponse(c, error);
        }
      }

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
      if (!isProjectCreateAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      try {
        const project = await projectStore.create(c.var.auth, payload);
        return c.json({ project: { ...project, openJobCount: 0 } }, 201);
      } catch (error) {
        if (error instanceof Error && error.message === "invalid_project_team") {
          return invalidProjectPayloadResponse(c);
        }

        throw error;
      }
    })
    .route("/:projectId/jobs", createJobRoutes({ jobQueue }))
    .get(
      "/:projectId/files/detail",
      validateProjectParams,
      validateProjectFileDetailQuery,
      async (c) => {
        const params = c.req.valid("param");
        const query = c.req.valid("query");
        const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
        if (target.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, target);
        }

        if (target.kind === "provider") {
          try {
            const file = await getTmsProviderLiveFileDetail(
              c.var.auth.organization.localOrganizationId,
              target.externalProjectId,
              query.sourcePath,
            );
            if (!file) {
              return projectNotFoundResponse(c);
            }

            return c.json({ file }, 200);
          } catch (error) {
            return tmsProviderLiveErrorResponse(c, error);
          }
        }

        const project = await getOwnedProject(c.var.auth, params.projectId);
        if (!project) {
          scheduleProjectNotFoundDiagnostics({
            auth: c.var.auth,
            projectId: params.projectId,
            route: "project.files.detail",
          });
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
      const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
      if (target.kind === "provider_unavailable") {
        return providerProjectUnavailableResponse(c, target);
      }

      if (target.kind === "provider") {
        try {
          const files = await listTmsProviderLiveFilesForProject(
            c.var.auth.organization.localOrganizationId,
            target.externalProjectId,
            { limit: query.limit },
          );
          return c.json({ files }, 200);
        } catch (error) {
          return tmsProviderLiveErrorResponse(c, error);
        }
      }

      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        scheduleProjectNotFoundDiagnostics({
          auth: c.var.auth,
          projectId: params.projectId,
          route: "project.files.list",
        });
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
    .post(
      "/:projectId/files",
      validateProjectParams,
      bodyLimit({
        maxSize: maxProjectFileUploadBytes,
        onError: (c) => badRequestResponse(c, "file_upload_too_large", "File upload is too large"),
      }),
      async (c) => {
        if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const project = await getOwnedProject(c.var.auth, params.projectId);

        if (!project) {
          scheduleProjectNotFoundDiagnostics({
            auth: c.var.auth,
            projectId: params.projectId,
            route: "project.files.upload",
          });
          return projectNotFoundResponse(c);
        }

        const body = await c.req.parseBody({ all: true });
        const parsed = projectFileUploadBodySchema.safeParse({
          sourcePath: asString(body.sourcePath),
          sourceHash: asString(body.sourceHash),
          commitSha: asString(body.commitSha),
          workflowRunId: asString(body.workflowRunId),
        });

        if (!parsed.success) {
          return invalidProjectPayloadResponse(c);
        }

        const file = asFile(body.file);
        if (!file) {
          return invalidProjectPayloadResponse(c);
        }

        if (!inferSupportedFileTranslationFileFormat(parsed.data.sourcePath)) {
          return unsupportedProjectFileResponse(c, parsed.data.sourcePath);
        }

        const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
        let uploadedFile: typeof schema.storedFiles.$inferSelect | null = null;

        const { storedFile, version } = await db
          .transaction(async (tx) => {
            uploadedFile = await createStoredFile({
              organizationId: c.var.auth.organization.localOrganizationId,
              projectId: params.projectId,
              createdByUserId: c.var.auth.user.localUserId,
              role: "source",
              sourceKind: "repository_file",
              filename: file.name,
              contentType: file.type || sourceContentType(parsed.data.sourcePath),
              content: await file.arrayBuffer(),
              metadata: {
                sourcePath: parsed.data.sourcePath,
                sourceHash: parsed.data.sourceHash ?? null,
                commitSha: parsed.data.commitSha ?? null,
                workflowRunId: parsed.data.workflowRunId ?? null,
                uploadSurface: "files_page",
              },
              adapter,
              db: tx,
            });

            const version = await createRepositorySourceFileVersion({
              storedFile: uploadedFile,
              sourcePath: parsed.data.sourcePath,
              sourceHash: parsed.data.sourceHash,
              commitSha: parsed.data.commitSha,
              workflowRunId: parsed.data.workflowRunId,
              uploadedByUserId: c.var.auth.user.localUserId,
              uploadSurface: "files_page",
              db: tx,
            });

            return { storedFile: uploadedFile, version };
          })
          .catch(async (error) => {
            if (uploadedFile) {
              await adapter.delete({ keyOrUrl: uploadedFile.storageKey }).catch(() => undefined);
            }
            throw error;
          });

        return c.json(
          {
            file: {
              id: storedFile.id,
              sourceFileVersionId: version.id,
              filename: storedFile.filename,
              contentType: storedFile.contentType,
              byteSize: storedFile.byteSize,
              sha256: storedFile.sha256,
            },
          },
          201,
        );
      },
    )
    .get("/:projectId", validateProjectParams, async (c) => {
      const params = c.req.valid("param");
      const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
      if (target.kind === "provider_unavailable") {
        return providerProjectUnavailableResponse(c, target);
      }

      if (target.kind === "provider") {
        try {
          const project = await getTmsProviderLiveProject(
            c.var.auth.organization.localOrganizationId,
            target.externalProjectId,
          );
          if (!project) {
            return projectNotFoundResponse(c);
          }

          return c.json({ project: { ...project, openJobCount: 0 } }, 200);
        } catch (error) {
          return tmsProviderLiveErrorResponse(c, error);
        }
      }

      const project = await projectStore.getById(c.var.auth, params.projectId);

      if (!project) {
        scheduleProjectNotFoundDiagnostics({
          auth: c.var.auth,
          projectId: params.projectId,
          route: "project.detail",
        });
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
      const updateResult = await projectStore.update(c.var.auth, params.projectId, payload);
      if (isErr(updateResult)) {
        if (updateResult.error.code === "invalid_project_team") {
          return invalidProjectPayloadResponse(c);
        }

        return badRequestResponse(c, updateResult.error.code, updateResult.error.message);
      }

      const project = updateResult.value;
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
        automationQueues:
          options.providerAgentTranslationQueue && options.providerAgentQaQueue
            ? {
                providerAgentTranslationQueue: options.providerAgentTranslationQueue,
                providerAgentQaQueue: options.providerAgentQaQueue,
              }
            : undefined,
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
