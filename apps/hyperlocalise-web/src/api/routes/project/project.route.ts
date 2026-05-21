import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { Project } from "@/lib/database/types";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";
import { normalizeSourcePath } from "@/lib/file-storage/records";
import { bufferFromStream } from "@/lib/streams";
import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";
import { createTranslationJobEventQueue } from "@/workflows/adapters";

import {
  createProjectBodySchema,
  projectFileDetailQuerySchema,
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
          return projectNotFoundResponse(c);
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
    .get("/:projectId/files", validateProjectParams, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);

      if (!project) {
        return projectNotFoundResponse(c);
      }

      const versionsSubquery = db
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
          rowNumber:
            sql<number>`ROW_NUMBER() OVER (PARTITION BY ${schema.repositorySourceFileVersions.sourcePath} ORDER BY ${schema.repositorySourceFileVersions.createdAt} DESC)`.as(
              "rn",
            ),
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
        .as("versions_sq");

      const versions = await db
        .select({
          versionId: versionsSubquery.versionId,
          sourcePath: versionsSubquery.sourcePath,
          sourceHash: versionsSubquery.sourceHash,
          commitSha: versionsSubquery.commitSha,
          workflowRunId: versionsSubquery.workflowRunId,
          uploadedAt: versionsSubquery.uploadedAt,
          storedFileId: versionsSubquery.storedFileId,
          metadata: versionsSubquery.metadata,
          filename: versionsSubquery.filename,
          byteSize: versionsSubquery.byteSize,
        })
        .from(versionsSubquery)
        .where(eq(versionsSubquery.rowNumber, 1));

      const versionIds = versions.map((v) => v.versionId);

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
        const jobsSubquery = db
          .select({
            versionId: schema.translationJobDetails.sourceFileVersionId,
            jobId: schema.jobs.id,
            jobStatus: schema.jobs.status,
            jobCreatedAt: schema.jobs.createdAt,
            jobType: schema.translationJobDetails.type,
            rowNumber:
              sql<number>`ROW_NUMBER() OVER (PARTITION BY ${schema.translationJobDetails.sourceFileVersionId} ORDER BY ${schema.jobs.createdAt} DESC)`.as(
                "rn",
              ),
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
          .as("jobs_sq");

        const jobs = await db
          .select({
            versionId: jobsSubquery.versionId,
            jobId: jobsSubquery.jobId,
            jobStatus: jobsSubquery.jobStatus,
            jobCreatedAt: jobsSubquery.jobCreatedAt,
            jobType: jobsSubquery.jobType,
          })
          .from(jobsSubquery)
          .where(eq(jobsSubquery.rowNumber, 1));

        for (const j of jobs) {
          if (j.versionId) {
            latestJobs.set(j.versionId, j);
          }
        }
      }

      const files = versions.map((v) => {
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
