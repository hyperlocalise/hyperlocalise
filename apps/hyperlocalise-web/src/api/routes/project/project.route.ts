import { randomUUID } from "node:crypto";
import path from "node:path";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import {
  badRequestResponse,
  conflictResponse,
  notFoundResponse,
  serviceUnavailableResponse,
} from "@/api/errors";
import { translationsNotFoundResponse } from "@/api/routes/public-translations/public-translations.shared";
import {
  ensureWorkspaceResourceLimitAvailable,
  workspaceResourceFeatureIds,
  workspaceResourceLimitErrorDetails,
  workspaceResourceLimitMessage,
} from "@/lib/billing/workspace-resource-limits";
import { db, schema } from "@/lib/database";
import type { Project } from "@/lib/database/types";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";
import { createLogger } from "@/lib/log";
import { createRepositorySourceFileVersion, createStoredFile } from "@/lib/file-storage/records";
import { sourceContentType } from "@/lib/file-storage/source-file-metadata";
import {
  getTmsProviderLiveCatFile,
  getTmsProviderLiveFileDetail,
  getTmsProviderLiveProject,
  listTmsProviderLiveFilesForProject,
  saveTmsProviderLiveCatTranslation,
  saveTmsProviderLiveCatComment,
} from "@/lib/providers/tms-provider-live";
import { listOrganizationProjects } from "@/lib/projects/organization/organization-project-service";
import {
  getNativeProjectCatFile,
  saveNativeProjectCatTranslation,
  updateNativeProjectTranslationStatus,
} from "@/lib/projects/cat/native-cat-service";
import { resolveProjectFileCatPagination } from "@/lib/projects/cat/project-file-cat-pagination";
import {
  getProjectFileDetail,
  listFilteredProjectFiles,
} from "@/lib/projects/files/project-file-service";
import { enqueueSourceFileIngestAfterUpload } from "@/lib/projects/files/source-file-ingest";
import { lookupProjectFileStringRepositoryContext } from "@/lib/projects/string-context/project-string-context-service";
import {
  getRepositorySourceFileByPath,
  loadProjectTranslationsAsPrefilledEntries,
} from "@/lib/projects/translations/project-translation-service";
import type { ExternalTmsFileKeyMetadata } from "@/lib/providers/tms-provider-types";
import type { JobQueue, ProviderSyncQueue, TranslationJobEventData } from "@/lib/workflow/types";
import { createProviderSyncQueue, createTranslationJobEventQueue } from "@/workflows/adapters";

import {
  createProjectBodySchema,
  maxProjectFileUploadBytes,
  projectFileCatQuerySchema,
  projectFileCatConcordanceBodySchema,
  projectFileCatCommentBodySchema,
  projectFileCatRecommendationBodySchema,
  projectFileCatStatusBodySchema,
  projectFileCatTranslationBodySchema,
  projectFileCatVisualContextBodySchema,
  projectFileDetailQuerySchema,
  projectFileStringContextBodySchema,
  projectFileUploadBodySchema,
  projectFileTranslationDownloadQuerySchema,
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
import { ensureOrganizationProjectRecord } from "@/lib/projects/organization/organization-project-service";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";
import { parseProviderProjectId } from "@/lib/providers/tms-provider-resource-id";

import { isAiActionAllowed, isWriteBackTranslationAllowed } from "@/api/auth/capability-guards";
import {
  buildAccessibleProjectsWhere,
  forbiddenResponse,
  getOwnedProject,
  getOwnedProjectRecord,
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
import { generateCatAiRecommendation } from "@/lib/translation/generate-cat-ai-recommendation";
import { loadCatSegmentConcordance } from "@/lib/translation/load-cat-segment-concordance";
import { loadCatSegmentVisualContext } from "@/lib/translation/load-cat-segment-visual-context";
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
  const rawProjectId =
    typeof value === "object" && value !== null && "projectId" in value
      ? typeof (value as { projectId?: unknown }).projectId === "string"
        ? (value as { projectId: string }).projectId
        : ""
      : "";

  if (!parsed.success) {
    projectDetailRouteLogger.warn(
      {
        route: "project.detail.params",
        organizationId: c.var.auth?.organization.localOrganizationId ?? null,
        ...projectIdEncodingDiagnostics(rawProjectId, normalizeProjectId(rawProjectId) as string),
        validationIssueCodes: parsed.error.issues.map((issue) => issue.code),
      },
      "project id param validation failed",
    );
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

const validateProjectFileCatCommentBody = validator("json", (value, c) => {
  const parsed = projectFileCatCommentBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

const validateProjectFileCatConcordanceBody = validator("json", (value, c) => {
  const parsed = projectFileCatConcordanceBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

const validateProjectFileCatVisualContextBody = validator("json", (value, c) => {
  const parsed = projectFileCatVisualContextBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

const validateProjectFileCatRecommendationBody = validator("json", (value, c) => {
  const parsed = projectFileCatRecommendationBodySchema.safeParse(value);

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

const stringContextRouteLogger = createLogger("project-file-string-context-route");
const projectDetailRouteLogger = createLogger("project-detail-route");
const projectFileRouteLogger = createLogger("project-file-route");

function projectIdEncodingDiagnostics(rawProjectId: string, validatedProjectId: string) {
  let singleDecodedProjectId: string | undefined;
  try {
    const decoded = decodeURIComponent(rawProjectId);
    if (decoded !== rawProjectId) {
      singleDecodedProjectId = decoded;
    }
  } catch {
    singleDecodedProjectId = undefined;
  }

  return {
    rawPathProjectId: rawProjectId,
    validatedProjectId,
    singleDecodedProjectId,
    validatedMatchesRaw: validatedProjectId === rawProjectId,
    validatedMatchesSingleDecoded:
      singleDecodedProjectId !== undefined
        ? validatedProjectId === singleDecodedProjectId
        : undefined,
  };
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
  providerSyncQueue?: ProviderSyncQueue;
  fileStorageAdapter?: FileStorageAdapter;
};

export function createProjectRoutes(options: CreateProjectRoutesOptions = {}) {
  const jobQueue = options.jobQueue ?? createTranslationJobEventQueue();
  const providerSyncQueue = options.providerSyncQueue ?? createProviderSyncQueue();

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
      const limitResult = await ensureWorkspaceResourceLimitAvailable({
        organizationId: c.var.auth.organization.localOrganizationId,
        featureId: workspaceResourceFeatureIds.projects,
      });
      if (!limitResult.ok) {
        if (limitResult.error.code === "workspace_resource_limit_check_failed") {
          return serviceUnavailableResponse(
            c,
            limitResult.error.code,
            "Unable to verify project limits. Try again later.",
          );
        }

        return conflictResponse(
          c,
          limitResult.error.code,
          workspaceResourceLimitMessage(limitResult.error.featureId),
          workspaceResourceLimitErrorDetails(limitResult.error),
        );
      }

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
    .route("/:projectId/jobs", createJobRoutes({ jobQueue, providerSyncQueue }))
    .get(
      "/:projectId/files/detail/cat",
      validateProjectParams,
      validateProjectFileCatQuery,
      async (c) => {
        const params = c.req.valid("param");
        const query = c.req.valid("query");
        const pagination = resolveProjectFileCatPagination(query);
        const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
        if (target.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, target);
        }

        if (target.kind !== "provider") {
          const project = await getOwnedProject(c.var.auth, params.projectId);
          if (!project) {
            return projectNotFoundResponse(c);
          }

          if (query.queueFilter === "has_issues") {
            return badRequestResponse(
              c,
              "unsupported_queue_filter",
              "The has issues filter is only available for Crowdin projects.",
            );
          }

          const catFile = await getNativeProjectCatFile({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            sourcePath: query.sourcePath,
            targetLocale: query.targetLocale,
            canEditTranslations: isWriteBackTranslationAllowed(c.var.auth.membership.role),
            pagination,
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
              pagination,
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
      "/:projectId/files/detail/cat/comments",
      validateProjectParams,
      validateProjectFileCatCommentBody,
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
          return badRequestResponse(
            c,
            "provider_cat_unsupported",
            "CAT comments are only available for provider-connected projects.",
          );
        }

        try {
          const comment = await saveTmsProviderLiveCatComment(
            c.var.auth.organization.localOrganizationId,
            target.externalProjectId,
            body.sourcePath,
            {
              targetLocale: body.targetLocale,
              externalStringId: body.externalStringId,
              externalResourceId: body.externalResourceId,
              text: body.text,
              type: body.type,
            },
            { actorUserId: c.var.auth.user.localUserId },
          );
          if (!comment) {
            return projectNotFoundResponse(c);
          }

          return c.json({ comment }, 200);
        } catch (error) {
          return tmsProviderLiveErrorResponse(c, error);
        }
      },
    )
    .post(
      "/:projectId/files/detail/cat/concordance",
      validateProjectParams,
      validateProjectFileCatConcordanceBody,
      async (c) => {
        const params = c.req.valid("param");
        const body = c.req.valid("json");
        const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
        if (target.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, target);
        }

        if (target.kind === "native") {
          const project = await getOwnedProject(c.var.auth, params.projectId);
          if (!project) {
            return projectNotFoundResponse(c);
          }
        }

        try {
          const concordance = await loadCatSegmentConcordance({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            providerKind: target.kind === "provider" ? target.providerKind : null,
            sourceLocale: body.sourceLocale,
            targetLocale: body.targetLocale,
            sourceText: body.sourceText,
          });

          return c.json({ concordance }, 200);
        } catch (error) {
          return tmsProviderLiveErrorResponse(c, error);
        }
      },
    )
    .post(
      "/:projectId/files/detail/cat/visual-context",
      validateProjectParams,
      validateProjectFileCatVisualContextBody,
      async (c) => {
        const params = c.req.valid("param");
        const body = c.req.valid("json");
        const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
        if (target.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, target);
        }

        if (target.kind !== "provider") {
          return badRequestResponse(
            c,
            "visual_context_unavailable",
            "In-context preview is only available for connected TMS provider projects.",
          );
        }

        try {
          const visualContext = await loadCatSegmentVisualContext({
            organizationId: c.var.auth.organization.localOrganizationId,
            providerKind: target.providerKind,
            externalProjectId: target.externalProjectId,
            externalStringId: body.externalStringId,
            sourcePath: body.sourcePath,
            actorUserId: c.var.auth.user.localUserId,
          });

          return c.json({ visualContext }, 200);
        } catch (error) {
          return tmsProviderLiveErrorResponse(c, error);
        }
      },
    )
    .post(
      "/:projectId/files/detail/cat/recommendation",
      validateProjectParams,
      validateProjectFileCatRecommendationBody,
      async (c) => {
        if (!isAiActionAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const body = c.req.valid("json");
        const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
        if (target.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, target);
        }

        let recommendationProjectId = params.projectId;

        if (target.kind === "native") {
          const project = await getOwnedProject(c.var.auth, params.projectId);
          if (!project) {
            return projectNotFoundResponse(c);
          }
        } else {
          const ensured = await ensureOrganizationProjectRecord({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            userId: c.var.auth.user.localUserId,
          });
          if (isErr(ensured)) {
            return projectNotFoundResponse(c);
          }
          recommendationProjectId = ensured.value;
        }

        const filename = body.sourcePath.split("/").pop() ?? body.sourcePath;
        const result = await generateCatAiRecommendation({
          projectId: recommendationProjectId,
          organizationId: c.var.auth.organization.localOrganizationId,
          sourcePath: body.sourcePath,
          filename,
          sourceLocale: body.sourceLocale,
          targetLocale: body.targetLocale,
          key: body.key,
          sourceText: body.sourceText,
          targetText: body.targetText,
          context: body.context ?? null,
          agentContext: body.agentContext ?? null,
          maxLength: body.maxLength,
          glossaryTerms: body.glossaryTerms,
          translationMemoryMatches: body.translationMemoryMatches,
        });

        if (isErr(result)) {
          return badRequestResponse(c, result.error.code, result.error.message);
        }

        return c.json({ recommendation: result.value }, 200);
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
          forceRefresh: body.forceRefresh ?? false,
        });

        if (isErr(result)) {
          stringContextRouteLogger.warn(
            {
              organizationId: c.var.auth.organization.localOrganizationId,
              projectId: params.projectId,
              stringKey: body.key,
              code: result.error.code,
            },
            "project file string context lookup rejected",
          );
          return badRequestResponse(c, result.error.code, result.error.message);
        }

        stringContextRouteLogger.debug(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            stringKey: body.key,
            cached: result.value.cached,
            summaryLength: result.value.summary.length,
          },
          "project file string context lookup served",
        );

        return c.json({ stringContext: result.value }, 200);
      },
    )
    .get(
      "/:projectId/files/translations/download",
      validateProjectParams,
      validator("query", (value, c) => {
        const parsed = projectFileTranslationDownloadQuerySchema.safeParse(value);
        if (!parsed.success) {
          return invalidProjectPayloadResponse(c);
        }
        return parsed.data;
      }),
      async (c) => {
        const params = c.req.valid("param");
        const query = c.req.valid("query");
        const organizationId = c.var.auth.organization.localOrganizationId;
        const project = await getOwnedProject(c.var.auth, params.projectId);

        if (!project) {
          return projectNotFoundResponse(c);
        }

        const sourceFile = await getRepositorySourceFileByPath({
          organizationId,
          projectId: params.projectId,
          sourcePath: query.sourcePath,
        });
        if (!sourceFile) {
          return notFoundResponse(c, "source_file_not_found", "Source file not found");
        }

        const result = await loadProjectTranslationsAsPrefilledEntries({
          organizationId,
          projectId: params.projectId,
          sourcePath: query.sourcePath,
          targetLocale: query.locale,
          includeAllSourceKeys: true,
        });

        if (result.truncated) {
          return badRequestResponse(
            c,
            "source_file_too_large",
            `Translation export exceeds the ${result.maxKeyCount} key limit.`,
          );
        }

        if (result.translatedKeyCount === 0) {
          return translationsNotFoundResponse(c);
        }

        const extension = path.extname(query.sourcePath);
        const baseName = path.basename(query.sourcePath, extension);
        const suffix = baseName.endsWith(`-${query.locale}`)
          ? baseName
          : `${baseName}-${query.locale}`;
        const filename = extension ? `${suffix}${extension}` : `${suffix}.json`;
        const content = JSON.stringify(result.prefilled, null, 2) + "\n";

        return c.body(content, 200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        });
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

        void enqueueSourceFileIngestAfterUpload({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: params.projectId,
          storedFileId: storedFile.id,
          sourceFileVersionId: version.id,
          sourcePath: parsed.data.sourcePath,
          sourceHash: parsed.data.sourceHash ?? storedFile.sha256,
        }).catch((error) => {
          projectFileRouteLogger.warn(
            {
              projectId: params.projectId,
              sourceFileVersionId: version.id,
              error: error instanceof Error ? error.message : "unknown",
            },
            "file-upload source ingest enqueue failed",
          );
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
      const rawPathProjectId = c.req.param("projectId");
      const params = c.req.valid("param");
      const encodedProject = parseProviderProjectId(params.projectId);
      const organizationId = c.var.auth.organization.localOrganizationId;

      projectDetailRouteLogger.info(
        {
          route: "project.detail",
          organizationId,
          actorUserId: c.var.auth.user.localUserId,
          ...projectIdEncodingDiagnostics(rawPathProjectId, params.projectId),
          parsedProviderKind: encodedProject?.providerKind ?? null,
          parsedExternalProjectId: encodedProject?.externalProjectId ?? null,
        },
        "project detail lookup started",
      );

      const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);

      projectDetailRouteLogger.info(
        {
          route: "project.detail",
          organizationId,
          projectId: params.projectId,
          targetKind: target.kind,
          ...(target.kind === "provider_unavailable"
            ? { providerUnavailableError: target.error }
            : {}),
          ...(target.kind === "provider"
            ? {
                providerKind: target.providerKind,
                externalProjectId: target.externalProjectId,
                externalProjectIdIsNumeric: /^\d+$/.test(target.externalProjectId),
              }
            : {}),
        },
        "project resource target resolved",
      );

      if (target.kind === "provider_unavailable") {
        projectDetailRouteLogger.warn(
          {
            route: "project.detail",
            organizationId,
            projectId: params.projectId,
            providerUnavailableError: target.error,
            providerUnavailableMessage: target.message,
          },
          "provider project unavailable for detail lookup",
        );
        return providerProjectUnavailableResponse(c, target);
      }

      if (target.kind === "provider") {
        try {
          projectDetailRouteLogger.info(
            {
              route: "project.detail",
              organizationId,
              projectId: params.projectId,
              providerKind: target.providerKind,
              externalProjectId: target.externalProjectId,
            },
            "fetching live provider project",
          );

          const project = await getTmsProviderLiveProject(
            organizationId,
            target.externalProjectId,
            { actorUserId: c.var.auth.user.localUserId },
          );
          if (!project) {
            projectDetailRouteLogger.warn(
              {
                route: "project.detail",
                organizationId,
                projectId: params.projectId,
                providerKind: target.providerKind,
                externalProjectId: target.externalProjectId,
                liveLookupResult: "not_found",
              },
              "live provider project lookup returned no match",
            );

            const materializedProject = await getOwnedProjectRecord(c.var.auth, params.projectId);
            projectDetailRouteLogger.info(
              {
                route: "project.detail",
                organizationId,
                projectId: params.projectId,
                materializedFallbackAttempted: true,
                materializedFallbackResult: materializedProject ? "found" : "not_found",
                materializedProjectId: materializedProject?.id ?? null,
                materializedExternalProjectId: materializedProject?.externalProjectId ?? null,
                materializedExternalProviderKind: materializedProject?.externalProviderKind ?? null,
                paramMatchesMaterializedId: materializedProject?.id === params.projectId,
                externalIdMatchesMaterialized:
                  materializedProject?.externalProjectId === target.externalProjectId,
              },
              "materialized project fallback evaluated",
            );

            if (materializedProject?.source === "external_tms") {
              const openJobCount = await countOpenJobs(c.var.auth, materializedProject.id);
              return c.json({ project: { ...materializedProject, openJobCount } }, 200);
            }

            scheduleProjectNotFoundDiagnostics({
              auth: c.var.auth,
              projectId: params.projectId,
              route: "project.detail.provider",
            });
            return projectNotFoundResponse(c);
          }

          projectDetailRouteLogger.info(
            {
              route: "project.detail",
              organizationId,
              projectId: params.projectId,
              providerKind: target.providerKind,
              externalProjectId: target.externalProjectId,
              liveLookupResult: "found",
              liveProjectId: project.id,
              liveExternalProjectId: project.externalProjectId,
            },
            "live provider project lookup succeeded",
          );

          return c.json({ project: { ...project, openJobCount: 0 } }, 200);
        } catch (error) {
          projectDetailRouteLogger.warn(
            {
              route: "project.detail",
              organizationId,
              projectId: params.projectId,
              providerKind: target.providerKind,
              externalProjectId: target.externalProjectId,
              error: error instanceof Error ? error.message : "unknown_error",
            },
            "live provider project lookup failed",
          );
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
