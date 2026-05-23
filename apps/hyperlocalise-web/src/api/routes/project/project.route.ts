import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { Project } from "@/lib/database/types";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";
import { normalizeSourcePath } from "@/lib/file-storage/records";
import { fetchCrowdinFileKeys } from "@/lib/providers/crowdin/crowdin-file-fetcher";
import { fetchCrowdinJobTasks } from "@/lib/providers/crowdin/crowdin-job-task-fetcher";
import {
  syncExternalTmsFileKeys,
  type ExternalTmsFileKeyFetcher,
} from "@/lib/providers/external-tms-file-sync";
import {
  syncExternalTmsJobTasks,
  type ExternalTmsJobTaskFetcher,
} from "@/lib/providers/external-tms-job-sync";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { getProviderContentPuller } from "@/lib/providers/provider-content-pullers";
import { getProviderTranslationPusher } from "@/lib/providers/provider-translation-pushers";
import { fetchPhraseFileKeys } from "@/lib/providers/phrase/phrase-file-fetcher";
import { fetchSmartlingFileKeys } from "@/lib/providers/smartling/smartling-file-fetcher";
import { fetchSmartlingJobTasks } from "@/lib/providers/smartling/smartling-job-fetcher";
import {
  pullExternalTmsTaskContent,
  pushExternalTmsTranslations,
} from "@/lib/providers/external-tms-content-sync";
import { listFilteredProjectFiles } from "@/lib/projects/project-files";
import type { ExternalTmsResourceType } from "@/lib/providers/organization-external-tms-files";
import { bufferFromStream } from "@/lib/streams";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";
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
  type ProjectFileContent,
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

const maxInlineTextBytes = 512 * 1024;

type PublicJobOutputFile = {
  fileId: string;
  locale: string;
  filename: string;
};

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPublicJobOutputFile(value: unknown): value is PublicJobOutputFile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return hasValue(candidate.fileId) && hasValue(candidate.locale) && hasValue(candidate.filename);
}

function fileJobOutputFiles(input: { outcomeKind: string | null; outcomePayload: unknown }) {
  if (input.outcomeKind !== "file_result") {
    return [];
  }

  if (!input.outcomePayload || typeof input.outcomePayload !== "object") {
    return [];
  }

  const outputFiles = (input.outcomePayload as Record<string, unknown>).outputFiles;
  if (!Array.isArray(outputFiles) || !outputFiles.every(isPublicJobOutputFile)) {
    return [];
  }

  return outputFiles.map((outputFile) => ({
    fileId: outputFile.fileId,
    locale: outputFile.locale,
    filename: outputFile.filename,
  }));
}

function fileJobLocales(inputPayload: unknown) {
  if (!inputPayload || typeof inputPayload !== "object") {
    return [];
  }

  const targetLocales = (inputPayload as Record<string, unknown>).targetLocales;
  if (!Array.isArray(targetLocales)) {
    return [];
  }

  return targetLocales.filter((locale): locale is string => hasValue(locale));
}

function sourceLocale(inputPayload: unknown) {
  if (!inputPayload || typeof inputPayload !== "object") {
    return null;
  }

  const value = (inputPayload as Record<string, unknown>).sourceLocale;
  return hasValue(value) ? value : null;
}

async function inlineTextContent(input: {
  adapter: FileStorageAdapter;
  file: { storageKey: string; filename: string; byteSize: number };
}): Promise<ProjectFileContent | null> {
  if (input.file.byteSize > maxInlineTextBytes) {
    return null;
  }

  if (!inferSupportedFileTranslationFileFormat(input.file.filename)) {
    return null;
  }

  const object = await input.adapter.get({ keyOrUrl: input.file.storageKey });
  if (!object) {
    return null;
  }

  const buffer = await bufferFromStream(object.body);
  return {
    text: new TextDecoder("utf-8", { fatal: false }).decode(buffer),
  };
}

const fileKeyFetchersByProvider: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsFileKeyFetcher>
> = {
  crowdin: fetchCrowdinFileKeys,
  phrase: fetchPhraseFileKeys,
  smartling: fetchSmartlingFileKeys,
};

const jobTaskFetchersByProvider: Partial<
  Record<ExternalTmsProviderKind, ExternalTmsJobTaskFetcher>
> = {
  crowdin: fetchCrowdinJobTasks,
  smartling: fetchSmartlingJobTasks,
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

        const sourcePath = normalizeSourcePath(query.sourcePath);
        const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();

        const versions = await db
          .select({
            id: schema.repositorySourceFileVersions.id,
            sourcePath: schema.repositorySourceFileVersions.sourcePath,
            sourceHash: schema.repositorySourceFileVersions.sourceHash,
            commitSha: schema.repositorySourceFileVersions.commitSha,
            workflowRunId: schema.repositorySourceFileVersions.workflowRunId,
            uploadedAt: schema.repositorySourceFileVersions.createdAt,
            storedFileId: schema.repositorySourceFileVersions.storedFileId,
            filename: schema.storedFiles.filename,
            contentType: schema.storedFiles.contentType,
            byteSize: schema.storedFiles.byteSize,
            sha256: schema.storedFiles.sha256,
            storageKey: schema.storedFiles.storageKey,
            metadata: schema.storedFiles.metadata,
          })
          .from(schema.repositorySourceFileVersions)
          .innerJoin(
            schema.storedFiles,
            eq(schema.storedFiles.id, schema.repositorySourceFileVersions.storedFileId),
          )
          .where(
            and(
              eq(schema.repositorySourceFileVersions.projectId, params.projectId),
              eq(
                schema.repositorySourceFileVersions.organizationId,
                c.var.auth.organization.localOrganizationId,
              ),
              eq(schema.repositorySourceFileVersions.sourcePath, sourcePath),
              eq(schema.storedFiles.role, "source"),
              eq(schema.storedFiles.sourceKind, "repository_file"),
            ),
          )
          .orderBy(
            desc(schema.repositorySourceFileVersions.createdAt),
            desc(schema.repositorySourceFileVersions.id),
          )
          .limit(50);

        if (versions.length === 0) {
          const [providerFile] = await db
            .select()
            .from(schema.externalTmsFiles)
            .where(
              and(
                eq(schema.externalTmsFiles.projectId, params.projectId),
                eq(
                  schema.externalTmsFiles.organizationId,
                  c.var.auth.organization.localOrganizationId,
                ),
                eq(schema.externalTmsFiles.sourcePath, sourcePath),
              ),
            )
            .limit(1);

          if (!providerFile) {
            return projectNotFoundResponse(c);
          }

          return c.json(
            {
              file: {
                sourcePath,
                filename: providerFile.displayName,
                versions: [],
                jobsByLocale: [],
              },
            },
            200,
          );
        }

        const versionIds = versions.map((version) => version.id);
        const jobRows = await db
          .select({
            sourceFileVersionId: schema.translationJobDetails.sourceFileVersionId,
            id: schema.jobs.id,
            status: schema.jobs.status,
            createdAt: schema.jobs.createdAt,
            completedAt: schema.jobs.completedAt,
            workflowRunId: schema.jobs.workflowRunId,
            inputPayload: schema.jobs.inputPayload,
            outcomePayload: schema.jobs.outcomePayload,
            outcomeKind: schema.translationJobDetails.outcomeKind,
          })
          .from(schema.jobs)
          .innerJoin(
            schema.translationJobDetails,
            eq(schema.translationJobDetails.jobId, schema.jobs.id),
          )
          .where(
            and(
              eq(schema.jobs.projectId, params.projectId),
              eq(schema.jobs.organizationId, c.var.auth.organization.localOrganizationId),
              eq(schema.translationJobDetails.type, "file"),
              inArray(schema.translationJobDetails.sourceFileVersionId, versionIds),
            ),
          )
          .orderBy(desc(schema.jobs.createdAt), desc(schema.jobs.id))
          .limit(100);

        const outputFileIds = Array.from(
          new Set(jobRows.flatMap((job) => fileJobOutputFiles(job).map((file) => file.fileId))),
        );
        const outputFiles =
          outputFileIds.length > 0
            ? await db
                .select({
                  id: schema.storedFiles.id,
                  filename: schema.storedFiles.filename,
                  contentType: schema.storedFiles.contentType,
                  byteSize: schema.storedFiles.byteSize,
                  sha256: schema.storedFiles.sha256,
                  storageKey: schema.storedFiles.storageKey,
                })
                .from(schema.storedFiles)
                .where(
                  and(
                    eq(
                      schema.storedFiles.organizationId,
                      c.var.auth.organization.localOrganizationId,
                    ),
                    eq(schema.storedFiles.projectId, params.projectId),
                    eq(schema.storedFiles.role, "output"),
                    inArray(schema.storedFiles.id, outputFileIds),
                  ),
                )
            : [];
        const outputFileById = new Map(outputFiles.map((file) => [file.id, file]));

        const versionRecords = await Promise.all(
          versions.map(async (version, _index) => ({
            id: version.id,
            sourcePath: version.sourcePath,
            sourceHash: version.sourceHash,
            commitSha: version.commitSha,
            workflowRunId: version.workflowRunId,
            uploadedAt: version.uploadedAt.toISOString(),
            storedFileId: version.storedFileId,
            filename: version.filename,
            contentType: version.contentType,
            byteSize: version.byteSize,
            sha256: version.sha256,
            metadata: version.metadata as Record<string, unknown>,
            content: await inlineTextContent({ adapter, file: version }),
          })),
        );

        const jobRecords = await Promise.all(
          jobRows.map(async (job) => {
            const outputs = await Promise.all(
              fileJobOutputFiles(job).map(async (output) => {
                const file = outputFileById.get(output.fileId);
                const organizationSlug =
                  c.var.auth.organization.slug ?? c.var.auth.organization.localOrganizationId;
                return {
                  fileId: output.fileId,
                  locale: output.locale,
                  filename: file?.filename ?? output.filename,
                  byteSize: file?.byteSize ?? null,
                  sha256: file?.sha256 ?? null,
                  contentType: file?.contentType ?? null,
                  downloadPath: `/api/orgs/${organizationSlug}/files/${output.fileId}`,
                  content: file ? await inlineTextContent({ adapter, file }) : null,
                };
              }),
            );

            return {
              id: job.id,
              sourceFileVersionId: job.sourceFileVersionId ?? "",
              status: job.status,
              createdAt: job.createdAt.toISOString(),
              completedAt: job.completedAt?.toISOString() ?? null,
              workflowRunId: job.workflowRunId,
              sourceLocale: sourceLocale(job.inputPayload),
              targetLocales: fileJobLocales(job.inputPayload),
              outputs,
            };
          }),
        );

        const jobsByLocaleMap = new Map<string, typeof jobRecords>();
        for (const job of jobRecords) {
          const locales =
            job.outputs.length > 0 ? job.outputs.map((output) => output.locale) : job.targetLocales;
          for (const locale of locales.length > 0 ? locales : ["unassigned"]) {
            const jobs = jobsByLocaleMap.get(locale) ?? [];
            if (!jobs.some((existing) => existing.id === job.id)) {
              jobs.push(job);
            }
            jobsByLocaleMap.set(locale, jobs);
          }
        }

        const jobsByLocale = Array.from(jobsByLocaleMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([locale, jobs]) => ({ locale, jobs }));

        return c.json(
          {
            file: {
              sourcePath,
              filename: versionRecords[0]?.filename ?? sourcePath.split("/").at(-1) ?? sourcePath,
              versions: versionRecords,
              jobsByLocale,
            },
          },
          200,
        );
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
