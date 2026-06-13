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
import {
  getTmsProviderLiveCatFile,
  getTmsProviderLiveFileDetail,
  getTmsProviderLiveProject,
  listTmsProviderLiveFilesForProject,
  saveTmsProviderLiveCatTranslation,
} from "@/lib/providers/tms-provider-live";
import { listOrganizationProjects } from "@/lib/projects/list-organization-projects";
import { getProjectFileDetail } from "@/lib/projects/project-file-detail";
import { lookupProjectFileStringRepositoryContext } from "@/lib/projects/project-file-string-context";
import { listFilteredProjectFiles } from "@/lib/projects/project-files";
import {
  getNativeProjectCatFile,
  saveNativeProjectCatTranslation,
  updateNativeProjectTranslationStatus,
} from "@/lib/projects/native-project-cat";
import { parseTranslationFileEntries } from "@/lib/projects/parse-translation-file-entries";
import {
  getRepositorySourceFileByPath,
  upsertProjectTranslationKeysFromEntries,
} from "@/lib/projects/project-translation-keys";
import type { ExternalTmsFileKeyMetadata } from "@/lib/providers/tms-provider-types";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";
import { createTranslationJobEventQueue } from "@/workflows/adapters";

import {
  createProjectBodySchema,
  maxProjectFileUploadBytes,
  projectFileCatQuerySchema,
  projectFileCatStatusBodySchema,
  projectFileCatTranslationBodySchema,
  projectFileDetailQuerySchema,
  projectFileStringContextBodySchema,
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

import { isAiActionAllowed, isWriteBackTranslationAllowed } from "@/api/auth/capability-guards";
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

const validateProjectFileCatQuery = validator("query", (value, c) => {
  const parsed = projectFileCatQuerySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

const validateProjectFileCatTranslationBody = validator("json", (value, c) => {
  const parsed = projectFileCatTranslationBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

const validateProjectFileCatStatusBody = validator("json", (value, c) => {
  const parsed = projectFileCatStatusBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

const validateProjectFileStringContextBody = validator("json", (value, c) => {
  const parsed = projectFileStringContextBodySchema.safeParse(value);

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

type CreateProjectRoutesOptions = {
  jobQueue?: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
};

export function createProjectRoutes(options: CreateProjectRoutesOptions = {}) {
  const jobQueue = options.jobQueue ?? createTranslationJobEventQueue();

  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const projects = await listOrganizationProjects(c.var.auth);
      return c.json({ projects }, 200);
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
      "/:projectId/files/detail/cat",
      validateProjectParams,
      validateProjectFileCatQuery,
      async (c) => {
        const params = c.req.valid("param");
        const query = c.req.valid("query");
        const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
        if (target.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, target);
        }

        if (target.kind !== "provider") {
          const project = await getOwnedProject(c.var.auth, params.projectId);
          if (!project) {
            return projectNotFoundResponse(c);
          }

          const catFile = await getNativeProjectCatFile({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            sourcePath: query.sourcePath,
            targetLocale: query.targetLocale,
            canEditTranslations: isWriteBackTranslationAllowed(c.var.auth.membership.role),
          });

          if (!catFile) {
            return badRequestResponse(
              c,
              "source_file_not_found",
              "Source file not found for the given path",
            );
          }

          return c.json({ catFile }, 200);
        }

        try {
          const catFile = await getTmsProviderLiveCatFile(
            c.var.auth.organization.localOrganizationId,
            target.externalProjectId,
            query.sourcePath,
            query.targetLocale,
            {
              actorUserId: c.var.auth.user.localUserId,
              canEditTranslations: isWriteBackTranslationAllowed(c.var.auth.membership.role),
            },
          );
          if (!catFile) {
            return projectNotFoundResponse(c);
          }

          return c.json({ catFile }, 200);
        } catch (error) {
          return tmsProviderLiveErrorResponse(c, error);
        }
      },
    )
    .post(
      "/:projectId/files/detail/cat/translations",
      validateProjectParams,
      validateProjectFileCatTranslationBody,
      async (c) => {
        if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const body = c.req.valid("json");
        const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
        if (target.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, target);
        }

        if (target.kind !== "provider") {
          const project = await getOwnedProject(c.var.auth, params.projectId);
          if (!project) {
            return projectNotFoundResponse(c);
          }

          const sourceFile = await getRepositorySourceFileByPath({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            sourcePath: body.sourcePath,
          });

          if (!sourceFile) {
            return badRequestResponse(
              c,
              "source_file_not_found",
              "Source file not found for the given path",
            );
          }

          const translation = await saveNativeProjectCatTranslation({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            sourcePath: body.sourcePath,
            targetLocale: body.targetLocale,
            translationKeyId: body.externalStringId,
            text: body.text,
            approve: body.approve,
            actorUserId: c.var.auth.user.localUserId,
          });

          if (!translation) {
            return badRequestResponse(c, "translation_key_not_found", "Translation key not found");
          }

          return c.json({ translation }, 200);
        }

        try {
          const translation = await saveTmsProviderLiveCatTranslation(
            c.var.auth.organization.localOrganizationId,
            target.externalProjectId,
            body.sourcePath,
            {
              targetLocale: body.targetLocale,
              externalStringId: body.externalStringId,
              externalResourceId: body.externalResourceId,
              text: body.text,
            },
            { actorUserId: c.var.auth.user.localUserId },
          );
          if (!translation) {
            return projectNotFoundResponse(c);
          }

          return c.json({ translation }, 200);
        } catch (error) {
          return tmsProviderLiveErrorResponse(c, error);
        }
      },
    )
    .post(
      "/:projectId/files/detail/cat/translations/status",
      validateProjectParams,
      validateProjectFileCatStatusBody,
      async (c) => {
        if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const body = c.req.valid("json");
        const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
        if (target.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, target);
        }

        if (target.kind === "provider") {
          return badRequestResponse(
            c,
            "provider_cat_unsupported",
            "Native translation status updates are only available for workspace files.",
          );
        }

        const project = await getOwnedProject(c.var.auth, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const translation = await updateNativeProjectTranslationStatus({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: params.projectId,
          translationKeyId: body.externalStringId,
          targetLocale: body.targetLocale,
          status: body.status,
          actorUserId: c.var.auth.user.localUserId,
        });

        if (!translation) {
          return badRequestResponse(c, "translation_not_found", "Translation not found");
        }

        return c.json({ translation }, 200);
      },
    )
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
              { actorUserId: c.var.auth.user.localUserId },
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
    .post(
      "/:projectId/files/string-context",
      validateProjectParams,
      validateProjectFileStringContextBody,
      async (c) => {
        const params = c.req.valid("param");
        const body = c.req.valid("json");

        if (!isAiActionAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
        if (target.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, target);
        }

        const result = await lookupProjectFileStringRepositoryContext({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: params.projectId,
          repositoryFullName: body.repositoryFullName ?? null,
          sourcePath: body.sourcePath,
          key: body.key,
          text: body.text,
          context: body.context ?? null,
          localUserId: c.var.auth.user.localUserId,
          membershipRole: c.var.auth.membership.role,
          displayName: null,
          email: c.var.auth.user.email,
        });

        if (isErr(result)) {
          return badRequestResponse(c, result.error.code, result.error.message);
        }

        return c.json({ stringContext: result.value }, 200);
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
            { limit: query.limit, actorUserId: c.var.auth.user.localUserId },
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
          ? ([query.resourceType] as ExternalTmsFileKeyMetadata["resourceType"][])
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
        const fileText = await file.text();

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

        const parseResult = parseTranslationFileEntries({
          filename: parsed.data.sourcePath,
          text: fileText,
        });

        if (isErr(parseResult)) {
          console.warn("[file-upload] translation key parse failed, skipping import", {
            projectId: params.projectId,
            code: parseResult.error.code,
          });
        }

        const entries = isErr(parseResult) ? [] : parseResult.value;

        if (entries.length > 0) {
          try {
            const [sourceFile] = await db
              .select({ id: schema.repositorySourceFiles.id })
              .from(schema.repositorySourceFiles)
              .where(
                and(
                  eq(
                    schema.repositorySourceFiles.organizationId,
                    c.var.auth.organization.localOrganizationId,
                  ),
                  eq(schema.repositorySourceFiles.projectId, params.projectId),
                  eq(schema.repositorySourceFiles.sourcePath, parsed.data.sourcePath),
                ),
              )
              .limit(1);

            if (sourceFile) {
              await upsertProjectTranslationKeysFromEntries({
                organizationId: c.var.auth.organization.localOrganizationId,
                projectId: params.projectId,
                repositorySourceFileId: sourceFile.id,
                sourceFileVersionId: version.id,
                entries,
              });
            }
          } catch (keyImportError) {
            console.warn("[file-upload] key import failed, continuing", {
              projectId: params.projectId,
              error: keyImportError instanceof Error ? keyImportError.message : "unknown",
            });
          }
        }

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
            { actorUserId: c.var.auth.user.localUserId },
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
