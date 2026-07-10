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
  withWorkspaceResourceLimit,
  workspaceResourceFeatureIds,
  workspaceResourceLimitErrorDetails,
  workspaceResourceLimitMessage,
} from "@/lib/billing/workspace-resource-limits";
import { db, schema, type DatabaseClient } from "@/lib/database";
import type { Project } from "@/lib/database/types";
import { getFileStorageAdapter, type FileStorageAdapter } from "@/lib/file-storage";
import { createLogger } from "@/lib/log";
import {
  createRepositorySourceFileVersion,
  createStoredFile,
  getLatestRepositorySourceFileVersion,
} from "@/lib/file-storage/records";
import { sourceContentType } from "@/lib/file-storage/source-file-metadata";
import {
  countTmsProviderLiveOpenJobsForProject,
  getTmsProviderLiveCatFile,
  getTmsProviderLiveCatSegmentComments,
  getTmsProviderLiveCatSegmentTarget,
  getTmsProviderLiveFileDetail,
  getTmsProviderLiveProject,
  listTmsProviderLiveFilesForProject,
  listTmsProviderLiveProjectBranches,
  saveTmsProviderLiveCatTranslation,
  saveTmsProviderLiveCatComment,
  resolveTmsProviderLiveCatComment,
} from "@/lib/providers/jobs/tms-provider-live";
import { listOrganizationProjects } from "@/lib/projects/organization/organization-project-service";
import {
  getNativeProjectCatFile,
  getNativeProjectCatSegmentComments,
  getNativeProjectCatSegmentTarget,
  resolveNativeProjectCatComment,
  saveNativeProjectCatComment,
  saveNativeProjectCatTranslation,
  updateNativeProjectTranslationStatus,
} from "@/lib/projects/cat/native-cat-service";
import {
  enrichExternalCatFileImageFields,
  enrichExternalCatTranslationImageFields,
  getExternalCatStringOverlay,
  setExternalCatStringTreatAsImage,
  storeExternalCatImageUpload,
  cleanupFailedExternalCatImageUpload,
} from "@/lib/projects/cat/external-cat-string-overlay-service";
import { resolveProjectFileCatPagination } from "@/lib/projects/cat/project-file-cat-pagination";
import {
  getProjectFileDetail,
  listFilteredProjectFiles,
} from "@/lib/projects/files/project-file-service";
import { enqueueSourceFileIngestAfterUpload } from "@/lib/projects/files/source-file-ingest";
import {
  localizeAndStoreImageVariant,
  projectImageAssetPath,
  replaceImageVariantBytes,
  updateImageVariantStatus,
} from "@/lib/projects/files/image-variant-service";
import {
  isImageUrlContentKind,
  localizeImageUrlTranslation,
  replaceImageUrlTranslationBytes,
  setTranslationKeyTreatAsImage,
} from "@/lib/projects/files/image-url-translation-service";
import {
  lookupCachedProjectFileStringRepositoryContext,
  lookupProjectFileStringRepositoryContext,
} from "@/lib/projects/string-context/project-string-context-service";
import {
  getRepositorySourceFileByPath,
  loadProjectTranslationsAsPrefilledEntries,
} from "@/lib/projects/translations/project-translation-service";
import type { ExternalTmsFileKeyMetadata } from "@/lib/providers/jobs/tms-provider-types";
import type {
  JobQueue,
  TranslationFileImportQueue,
  TranslationJobEventData,
} from "@/lib/workflow/types";
import {
  createTranslationFileImportQueue,
  createTranslationJobEventQueue,
} from "@/workflows/adapters";

import {
  createProjectBodySchema,
  maxProjectFileUploadBytes,
  projectFileCatSegmentParamsSchema,
  projectFileCatSegmentQuerySchema,
  projectFileCatQuerySchema,
  projectFileCatConcordanceBodySchema,
  projectFileCatCommentBodySchema,
  projectFileCatCommentResolveBodySchema,
  projectFileCatImageRegenerateBodySchema,
  projectFileCatImageStatusBodySchema,
  projectFileCatRecommendationBodySchema,
  projectFileCatStatusBodySchema,
  projectFileCatTreatAsImageBodySchema,
  projectFileCatTranslationBodySchema,
  projectFileCatVisualContextBodySchema,
  projectFileDetailQuerySchema,
  projectFileStringContextBodySchema,
  projectFileUploadBodySchema,
  projectFileTranslationImportBodySchema,
  projectFileTranslationDownloadQuerySchema,
  projectFilesQuerySchema,
  projectIdParamsSchema,
  projectFileCatCommentIdParamsSchema,
  updateProjectBodySchema,
  type CreateProjectBody,
  type ProjectFileCatQuery,
  type UpdateProjectBody,
} from "./project.schema";
import { getVisibleTeamIds, hasOrganizationWideProjectAccess } from "@/api/auth/team-access";
import { normalizeProjectLocalePatch, type ProjectLocalePatchError } from "@/lib/i18n/locales";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import { ensureOrganizationProjectRecord } from "@/lib/projects/organization/organization-project-service";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import {
  isAiActionAllowed,
  isReviewApproveAllowed,
  isWriteBackTranslationAllowed,
} from "@/api/auth/capability-guards";
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
import { createIssueSheetRoutes } from "./issue-sheet.route";
import { createProjectAssetRoutes } from "./project-assets.route";
import {
  generateCatAiRecommendation,
  loadCatSegmentConcordance,
  loadCatSegmentVisualContext,
} from "@/lib/translation/cat";
import {
  inferSupportedFileTranslationFileFormat,
  inferSupportedImageTranslationFileFormat,
  inferSupportedSourceUploadFormat,
  looksLikeImageUrl,
} from "@/lib/translation/file-formats";

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
  create(
    auth: ApiAuthContext,
    payload: CreateProjectBody,
    database?: DatabaseClient,
  ): Promise<Project>;
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
  async create(auth, payload, database = db) {
    const teamId = await resolveProjectTeamId(auth, payload.teamId);
    if (!teamId) {
      throw new Error("invalid_project_team");
    }

    const [project] = await database
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

const validateProjectFileCatCommentIdParams = validator("param", (value, c) => {
  const parsed = projectFileCatCommentIdParamsSchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
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

const validateProjectFileCatSegmentParams = validator("param", (value, c) => {
  const parsed = projectFileCatSegmentParamsSchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

const validateProjectFileCatSegmentQuery = validator("query", (value, c) => {
  const parsed = projectFileCatSegmentQuerySchema.safeParse(value);

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

const validateProjectFileCatCommentResolveBody = validator("json", (value, c) => {
  const parsed = projectFileCatCommentResolveBodySchema.safeParse(value);

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

const validateProjectFileCatImageRegenerateBody = validator("json", (value, c) => {
  const parsed = projectFileCatImageRegenerateBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

const validateProjectFileCatImageStatusBody = validator("json", (value, c) => {
  const parsed = projectFileCatImageStatusBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidProjectPayloadResponse(c);
  }

  return parsed.data;
});

const validateProjectFileCatTreatAsImageBody = validator("json", (value, c) => {
  const parsed = projectFileCatTreatAsImageBodySchema.safeParse(value);

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
  fileStorageAdapter?: FileStorageAdapter;
  translationFileImportQueue?: TranslationFileImportQueue;
};

async function loadProjectFileCatQueue(
  auth: AuthVariables["auth"],
  projectId: string,
  query: ProjectFileCatQuery,
) {
  const pagination = resolveProjectFileCatPagination(query);
  const target = await resolveProjectResourceTarget(auth, projectId);
  const organizationSlug = auth.organization.slug ?? auth.organization.localOrganizationId;

  if (target.kind === "provider_unavailable") {
    return { kind: "provider_unavailable" as const, target };
  }

  if (target.kind !== "provider") {
    const project = await getOwnedProject(auth, projectId);
    if (!project) {
      return { kind: "project_not_found" as const };
    }

    const catQueue = await getNativeProjectCatFile({
      organizationId: auth.organization.localOrganizationId,
      projectId,
      sourcePath: query.sourcePath,
      targetLocale: query.targetLocale,
      canEditTranslations: isWriteBackTranslationAllowed(auth.membership.role),
      organizationSlug,
      pagination,
    });

    if (!catQueue) {
      return { kind: "source_file_not_found" as const };
    }

    return { kind: "ok" as const, catQueue };
  }

  try {
    const catQueue = await getTmsProviderLiveCatFile(
      auth.organization.localOrganizationId,
      target.externalProjectId,
      query.sourcePath,
      query.targetLocale,
      {
        actorUserId: auth.user.localUserId,
        canEditTranslations: isWriteBackTranslationAllowed(auth.membership.role),
        externalResourceId: query.externalResourceId,
        resourceType: query.resourceType,
        pagination,
      },
    );

    if (!catQueue) {
      return { kind: "project_not_found" as const };
    }

    const enrichedCatQueue = await enrichExternalCatFileImageFields({
      organizationId: auth.organization.localOrganizationId,
      projectId,
      catFile: catQueue,
    });

    return { kind: "ok" as const, catQueue: enrichedCatQueue };
  } catch (error) {
    return { kind: "provider_error" as const, error };
  }
}

export function createProjectRoutes(options: CreateProjectRoutesOptions = {}) {
  const jobQueue = options.jobQueue ?? createTranslationJobEventQueue();
  const translationFileImportQueue =
    options.translationFileImportQueue ?? createTranslationFileImportQueue();

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
        const limitResult = await withWorkspaceResourceLimit(
          {
            organizationId: c.var.auth.organization.localOrganizationId,
            featureId: workspaceResourceFeatureIds.projects,
          },
          async (tx) => projectStore.create(c.var.auth, payload, tx),
        );
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

        const project = limitResult.value;
        return c.json({ project: { ...project, openJobCount: 0 } }, 201);
      } catch (error) {
        if (error instanceof Error && error.message === "invalid_project_team") {
          return invalidProjectPayloadResponse(c);
        }

        throw error;
      }
    })
    .route("/:projectId/jobs", createJobRoutes({ jobQueue }))
    .route("/:projectId/issue-sheet", createIssueSheetRoutes())
    .route(
      "/:projectId/assets",
      createProjectAssetRoutes({ fileStorageAdapter: options.fileStorageAdapter }),
    )
    .get(
      "/:projectId/files/detail/cat/queue",
      validateProjectParams,
      validateProjectFileCatQuery,
      async (c) => {
        const params = c.req.valid("param");
        const query = c.req.valid("query");
        const result = await loadProjectFileCatQueue(c.var.auth, params.projectId, query);

        if (result.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, result.target);
        }
        if (result.kind === "project_not_found") {
          return projectNotFoundResponse(c);
        }
        if (result.kind === "source_file_not_found") {
          return badRequestResponse(
            c,
            "source_file_not_found",
            "Source file not found for the given path",
          );
        }
        if (result.kind === "provider_error") {
          return tmsProviderLiveErrorResponse(c, result.error);
        }

        return c.json({ catQueue: result.catQueue }, 200);
      },
    )
    .get(
      "/:projectId/files/detail/cat",
      validateProjectParams,
      validateProjectFileCatQuery,
      async (c) => {
        const params = c.req.valid("param");
        const query = c.req.valid("query");
        const result = await loadProjectFileCatQueue(c.var.auth, params.projectId, query);

        if (result.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, result.target);
        }
        if (result.kind === "project_not_found") {
          return projectNotFoundResponse(c);
        }
        if (result.kind === "source_file_not_found") {
          return badRequestResponse(
            c,
            "source_file_not_found",
            "Source file not found for the given path",
          );
        }
        if (result.kind === "provider_error") {
          return tmsProviderLiveErrorResponse(c, result.error);
        }

        return c.json({ catFile: result.catQueue }, 200);
      },
    )
    .get(
      "/:projectId/files/detail/cat/segments/:externalStringId/target",
      validateProjectParams,
      validateProjectFileCatSegmentParams,
      validateProjectFileCatSegmentQuery,
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

          const segmentTarget = await getNativeProjectCatSegmentTarget({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            sourcePath: query.sourcePath,
            targetLocale: query.targetLocale,
            externalStringId: params.externalStringId,
            organizationSlug:
              c.var.auth.organization.slug ?? c.var.auth.organization.localOrganizationId,
          });

          if (segmentTarget === "not_found") {
            return notFoundResponse(c, "cat_segment_not_found");
          }

          return c.json({ target: segmentTarget }, 200);
        }

        try {
          const segmentTarget = await getTmsProviderLiveCatSegmentTarget(
            c.var.auth.organization.localOrganizationId,
            target.externalProjectId,
            query.sourcePath,
            query.targetLocale,
            params.externalStringId,
            {
              actorUserId: c.var.auth.user.localUserId,
              externalResourceId: query.externalResourceId,
              resourceType: query.resourceType,
            },
          );
          if (segmentTarget === "not_found") {
            return notFoundResponse(c, "cat_segment_not_found");
          }

          if (!query.externalResourceId) {
            return c.json({ target: segmentTarget }, 200);
          }

          const overlay = await getExternalCatStringOverlay({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            sourcePath: query.sourcePath,
            externalResourceId: query.externalResourceId,
            externalStringId: params.externalStringId,
          });

          return c.json(
            {
              target: segmentTarget
                ? enrichExternalCatTranslationImageFields(segmentTarget, overlay)
                : segmentTarget,
            },
            200,
          );
        } catch (error) {
          return tmsProviderLiveErrorResponse(c, error);
        }
      },
    )
    .get(
      "/:projectId/files/detail/cat/segments/:externalStringId/comments",
      validateProjectParams,
      validateProjectFileCatSegmentParams,
      validateProjectFileCatSegmentQuery,
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

          const comments = await getNativeProjectCatSegmentComments({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            sourcePath: query.sourcePath,
            targetLocale: query.targetLocale,
            externalStringId: params.externalStringId,
          });

          return c.json({ comments }, 200);
        }

        try {
          const comments = await getTmsProviderLiveCatSegmentComments(
            c.var.auth.organization.localOrganizationId,
            target.externalProjectId,
            query.sourcePath,
            query.targetLocale,
            params.externalStringId,
            {
              actorUserId: c.var.auth.user.localUserId,
              externalResourceId: query.externalResourceId,
              resourceType: query.resourceType,
            },
          );

          return c.json({ comments }, 200);
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
          const project = await getOwnedProject(c.var.auth, params.projectId);
          if (!project) {
            return projectNotFoundResponse(c);
          }

          const comment = await saveNativeProjectCatComment({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            sourcePath: body.sourcePath,
            targetLocale: body.targetLocale,
            translationKeyId: body.externalStringId,
            text: body.text,
            type: body.type,
            issueType: body.issueType,
            actorUserId: c.var.auth.user.localUserId,
          });

          if (!comment) {
            return badRequestResponse(
              c,
              "translation_key_not_found",
              "Translation key not found for the given file.",
            );
          }

          return c.json({ comment }, 200);
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
              issueType: body.issueType,
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
    .patch(
      "/:projectId/files/detail/cat/comments/:commentId/resolve",
      validateProjectFileCatCommentIdParams,
      validateProjectFileCatCommentResolveBody,
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

          const comment = await resolveNativeProjectCatComment({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            commentId: params.commentId,
            actorUserId: c.var.auth.user.localUserId,
            canResolveOthersIssues: isReviewApproveAllowed(c.var.auth.membership.role),
          });

          if (!comment) {
            return badRequestResponse(
              c,
              "comment_not_found",
              "Comment not found or not resolvable.",
            );
          }

          return c.json({ comment }, 200);
        }

        try {
          const comment = await resolveTmsProviderLiveCatComment(
            c.var.auth.organization.localOrganizationId,
            target.externalProjectId,
            body.sourcePath,
            {
              externalCommentId: params.commentId,
              externalResourceId: body.externalResourceId,
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
            actorUserId: c.var.auth.user.localUserId,
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
            "Visual Context is only available for connected TMS provider projects.",
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
    .post(
      "/:projectId/files/detail/cat/images/regenerate",
      validateProjectParams,
      validateProjectFileCatImageRegenerateBody,
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
        if (target.kind === "provider") {
          return badRequestResponse(
            c,
            "provider_cat_unsupported",
            "Image regeneration is only available for workspace files.",
          );
        }

        const project = await getOwnedProjectRecord(c.var.auth, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const organizationSlug =
          c.var.auth.organization.slug ?? c.var.auth.organization.localOrganizationId;
        const organizationId = c.var.auth.organization.localOrganizationId;

        if (inferSupportedImageTranslationFileFormat(body.sourcePath)) {
          const sourceFile = await getRepositorySourceFileByPath({
            organizationId,
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

          const latestVersion = await getLatestRepositorySourceFileVersion({
            organizationId,
            projectId: params.projectId,
            sourcePath: body.sourcePath,
          });
          if (!latestVersion?.storedFileId) {
            return badRequestResponse(c, "source_bytes_missing", "Source image bytes are missing");
          }

          const result = await localizeAndStoreImageVariant({
            organizationId,
            projectId: params.projectId,
            sourcePath: body.sourcePath,
            targetLocale: body.targetLocale,
            sourceLocale: project.sourceLocale,
            sourceStoredFileId: latestVersion.storedFileId,
            repositorySourceFileId: sourceFile.id,
            instructions: body.instructions,
            provenance: "agent",
            createdByUserId: c.var.auth.user.localUserId,
            force: body.force,
          });

          if (!result.ok) {
            return badRequestResponse(c, result.error.code, "Image regeneration failed");
          }

          const targetAssetUrl = result.value.storedFileId
            ? projectImageAssetPath({
                organizationSlug,
                projectId: params.projectId,
                fileId: result.value.storedFileId,
              })
            : null;

          return c.json(
            {
              imageVariant: {
                id: result.value.id,
                status: result.value.status,
                targetAssetUrl,
                storedFileId: result.value.storedFileId,
              },
            },
            200,
          );
        }

        if (!body.externalStringId) {
          return badRequestResponse(
            c,
            "external_string_id_required",
            "externalStringId is required for URL-backed image regeneration",
          );
        }

        const result = await localizeImageUrlTranslation({
          organizationId,
          projectId: params.projectId,
          translationKeyId: body.externalStringId,
          targetLocale: body.targetLocale,
          sourceLocale: project.sourceLocale,
          instructions: body.instructions,
          actorUserId: c.var.auth.user.localUserId,
          force: body.force,
        });

        if (!result.ok) {
          return badRequestResponse(c, result.error.code, "Image URL regeneration failed");
        }

        return c.json(
          {
            translation: {
              text: result.value.translation.text,
              externalTranslationId: result.value.translation.id,
              isApproved: result.value.translation.status === "approved",
              contentKind: "image_url" as const,
              targetAssetUrl: result.value.assetUrl,
              status: result.value.translation.status,
            },
          },
          200,
        );
      },
    )
    .post(
      "/:projectId/files/detail/cat/images/upload",
      validateProjectParams,
      bodyLimit({
        maxSize: maxProjectFileUploadBytes,
        onError: (c) => badRequestResponse(c, "file_upload_too_large", "File upload is too large"),
      }),
      async (c) => {
        if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
        if (target.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, target);
        }

        const form = await c.req.parseBody({ all: true });
        const sourcePath = asString(form.sourcePath);
        const targetLocale = asString(form.targetLocale);
        const externalStringId = asString(form.externalStringId);
        const externalResourceId = asString(form.externalResourceId);
        const forceRaw = asString(form.force);
        const force = forceRaw === "true" || forceRaw === "1";
        const file = asFile(form.file);

        if (!sourcePath || !targetLocale || !file) {
          return invalidProjectPayloadResponse(c);
        }

        const organizationSlug =
          c.var.auth.organization.slug ?? c.var.auth.organization.localOrganizationId;
        const organizationId = c.var.auth.organization.localOrganizationId;
        const content = Buffer.from(await file.arrayBuffer());
        const contentType = file.type || sourceContentType(file.name || sourcePath);

        if (target.kind === "provider") {
          if (!externalStringId) {
            return badRequestResponse(
              c,
              "external_string_id_required",
              "externalStringId is required for URL-backed image upload",
            );
          }

          if (!externalResourceId) {
            return badRequestResponse(
              c,
              "external_resource_id_required",
              "externalResourceId is required for provider image upload",
            );
          }

          if (inferSupportedImageTranslationFileFormat(sourcePath)) {
            return badRequestResponse(
              c,
              "provider_cat_unsupported",
              "File-backed image upload is only available for workspace files.",
            );
          }

          const ensured = await ensureOrganizationProjectRecord({
            organizationId,
            projectId: params.projectId,
            userId: c.var.auth.user.localUserId,
          });
          if (isErr(ensured)) {
            return projectNotFoundResponse(c);
          }

          const stored = await storeExternalCatImageUpload({
            organizationId,
            projectId: ensured.value,
            externalStringId,
            externalResourceId,
            sourcePath,
            targetLocale,
            content,
            contentType,
            filename: file.name || "image.png",
            actorUserId: c.var.auth.user.localUserId,
          });

          try {
            const translation = await saveTmsProviderLiveCatTranslation(
              organizationId,
              target.externalProjectId,
              sourcePath,
              {
                targetLocale,
                externalStringId,
                text: stored.assetUrl,
                externalResourceId,
              },
              { actorUserId: c.var.auth.user.localUserId },
            );

            if (!translation) {
              await cleanupFailedExternalCatImageUpload({
                organizationId,
                projectId: ensured.value,
                storedFileId: stored.storedFileId,
              });
              return projectNotFoundResponse(c);
            }

            await setExternalCatStringTreatAsImage({
              organizationId,
              projectId: params.projectId,
              sourcePath,
              externalResourceId,
              externalStringId,
              treatAsImage: true,
              actorUserId: c.var.auth.user.localUserId,
            });

            return c.json(
              {
                translation: {
                  text: translation.text,
                  externalTranslationId: translation.externalTranslationId,
                  isApproved: translation.isApproved,
                  contentKind: "image_url" as const,
                  targetAssetUrl: stored.assetUrl,
                },
              },
              200,
            );
          } catch (error) {
            await cleanupFailedExternalCatImageUpload({
              organizationId,
              projectId: ensured.value,
              storedFileId: stored.storedFileId,
            });
            return tmsProviderLiveErrorResponse(c, error);
          }
        }

        const project = await getOwnedProject(c.var.auth, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        if (inferSupportedImageTranslationFileFormat(sourcePath)) {
          const sourceFile = await getRepositorySourceFileByPath({
            organizationId,
            projectId: params.projectId,
            sourcePath,
          });
          if (!sourceFile) {
            return badRequestResponse(
              c,
              "source_file_not_found",
              "Source file not found for the given path",
            );
          }

          const result = await replaceImageVariantBytes({
            organizationId,
            projectId: params.projectId,
            sourcePath,
            targetLocale,
            content,
            contentType,
            filename: file.name || path.basename(sourcePath),
            repositorySourceFileId: sourceFile.id,
            createdByUserId: c.var.auth.user.localUserId,
            force,
          });

          if (!result.ok) {
            return badRequestResponse(c, result.error.code, "Image upload failed");
          }

          const targetAssetUrl = result.value.storedFileId
            ? projectImageAssetPath({
                organizationSlug,
                projectId: params.projectId,
                fileId: result.value.storedFileId,
              })
            : null;

          return c.json(
            {
              imageVariant: {
                id: result.value.id,
                status: result.value.status,
                targetAssetUrl,
                storedFileId: result.value.storedFileId,
              },
            },
            200,
          );
        }

        if (!externalStringId) {
          return badRequestResponse(
            c,
            "external_string_id_required",
            "externalStringId is required for URL-backed image upload",
          );
        }

        const result = await replaceImageUrlTranslationBytes({
          organizationId,
          projectId: params.projectId,
          translationKeyId: externalStringId,
          targetLocale,
          content,
          contentType,
          filename: file.name || "image.png",
          actorUserId: c.var.auth.user.localUserId,
          force,
        });

        if (!result.ok) {
          return badRequestResponse(c, result.error.code, "Image URL upload failed");
        }

        return c.json(
          {
            translation: {
              text: result.value.translation.text,
              externalTranslationId: result.value.translation.id,
              isApproved: result.value.translation.status === "approved",
              contentKind: "image_url" as const,
              targetAssetUrl: result.value.assetUrl,
              status: result.value.translation.status,
            },
          },
          200,
        );
      },
    )
    .patch(
      "/:projectId/files/detail/cat/images/status",
      validateProjectParams,
      validateProjectFileCatImageStatusBody,
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
            "Image status updates are only available for workspace files.",
          );
        }

        const project = await getOwnedProject(c.var.auth, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const organizationId = c.var.auth.organization.localOrganizationId;
        const organizationSlug =
          c.var.auth.organization.slug ?? c.var.auth.organization.localOrganizationId;

        if (inferSupportedImageTranslationFileFormat(body.sourcePath)) {
          const result = await updateImageVariantStatus({
            organizationId,
            projectId: params.projectId,
            sourcePath: body.sourcePath,
            targetLocale: body.targetLocale,
            status: body.status,
            actorUserId: c.var.auth.user.localUserId,
          });

          if (!result.ok) {
            return badRequestResponse(c, result.error.code, "Image variant not found");
          }

          const targetAssetUrl = result.value.storedFileId
            ? projectImageAssetPath({
                organizationSlug,
                projectId: params.projectId,
                fileId: result.value.storedFileId,
              })
            : null;

          return c.json(
            {
              imageVariant: {
                id: result.value.id,
                status: result.value.status,
                targetAssetUrl,
                storedFileId: result.value.storedFileId,
              },
            },
            200,
          );
        }

        return badRequestResponse(
          c,
          "image_status_unsupported",
          "Use translations/status for URL-backed image keys.",
        );
      },
    )
    .post(
      "/:projectId/files/detail/cat/segments/:externalStringId/treat-as-image",
      validateProjectParams,
      validateProjectFileCatSegmentParams,
      validateProjectFileCatTreatAsImageBody,
      async (c) => {
        if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const body = c.req.valid("json");
        if (params.externalStringId !== body.externalStringId) {
          return invalidProjectPayloadResponse(c);
        }

        const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
        if (target.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, target);
        }

        if (target.kind === "provider") {
          if (!body.externalResourceId) {
            return badRequestResponse(
              c,
              "external_resource_id_required",
              "externalResourceId is required for provider treat-as-image",
            );
          }

          const result = await setExternalCatStringTreatAsImage({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            sourcePath: body.sourcePath,
            externalResourceId: body.externalResourceId,
            externalStringId: body.externalStringId,
            treatAsImage: body.treatAsImage,
            actorUserId: c.var.auth.user.localUserId,
          });

          if (!result.ok) {
            return badRequestResponse(c, result.error.code, "Failed to update image mode");
          }

          // Source text is not stored on the overlay; the client already has it.
          // Prefer looksLikeImageUrl true when treating as image so the editor stays in image mode.
          return c.json(
            {
              segment: {
                externalStringId: body.externalStringId,
                contentKind: body.treatAsImage ? ("image_url" as const) : ("text" as const),
                looksLikeImageUrl: body.treatAsImage,
                ...(body.treatAsImage ? { sourceAssetUrl: null as string | null } : {}),
              },
            },
            200,
          );
        }

        const project = await getOwnedProject(c.var.auth, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const result = await setTranslationKeyTreatAsImage({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: params.projectId,
          translationKeyId: body.externalStringId,
          treatAsImage: body.treatAsImage,
        });

        if (!result.ok) {
          return badRequestResponse(c, result.error.code, "Translation key not found");
        }

        return c.json(
          {
            segment: {
              externalStringId: result.value.id,
              key: result.value.key,
              sourceText: result.value.sourceText,
              contentKind: isImageUrlContentKind(result.value.metadata)
                ? ("image_url" as const)
                : ("text" as const),
              looksLikeImageUrl: looksLikeImageUrl(result.value.sourceText),
              ...(isImageUrlContentKind(result.value.metadata)
                ? { sourceAssetUrl: result.value.sourceText }
                : {}),
            },
          },
          200,
        );
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
              {
                actorUserId: c.var.auth.user.localUserId,
                externalResourceId: query.externalResourceId,
              },
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

        if (body.cachedOnly) {
          const result = await lookupCachedProjectFileStringRepositoryContext({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            repositoryFullName: body.repositoryFullName ?? null,
            sourcePath: body.sourcePath,
            key: body.key,
            text: body.text,
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
              summaryLength: result.value.summary?.length ?? 0,
            },
            "project file string context lookup served",
          );

          return c.json({ stringContext: result.value }, 200);
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
            summaryLength: result.value.summary?.length ?? 0,
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

        if (result.loadedKeyCount === 0) {
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
    .get("/:projectId/files/branches", validateProjectParams, async (c) => {
      const params = c.req.valid("param");
      const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
      if (target.kind === "provider_unavailable") {
        return providerProjectUnavailableResponse(c, target);
      }

      if (target.kind !== "provider") {
        return c.json({ branches: [] }, 200);
      }

      try {
        const branches = await listTmsProviderLiveProjectBranches(
          c.var.auth.organization.localOrganizationId,
          target.externalProjectId,
          { actorUserId: c.var.auth.user.localUserId },
        );
        return c.json({ branches }, 200);
      } catch (error) {
        return tmsProviderLiveErrorResponse(c, error);
      }
    })
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
            { limit: query.limit, branch: query.branch, actorUserId: c.var.auth.user.localUserId },
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

        if (!inferSupportedSourceUploadFormat(parsed.data.sourcePath)) {
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
    .post(
      "/:projectId/files/translations/import",
      validateProjectParams,
      bodyLimit({
        maxSize: maxProjectFileUploadBytes,
        onError: (c) => badRequestResponse(c, "file_upload_too_large", "File upload is too large"),
      }),
      async (c) => {
        if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);
        if (target.kind === "provider_unavailable") {
          return providerProjectUnavailableResponse(c, target);
        }

        if (target.kind === "provider") {
          return badRequestResponse(
            c,
            "provider_import_unsupported",
            "Translation imports are only available for workspace files.",
          );
        }

        const project = await getOwnedProjectRecord(c.var.auth, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const body = await c.req.parseBody({ all: true });
        const parsed = projectFileTranslationImportBodySchema.safeParse({
          sourcePath: asString(body.sourcePath),
          locale: asString(body.locale),
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

        if (!project.targetLocales.includes(parsed.data.locale)) {
          return badRequestResponse(
            c,
            "invalid_target_locale",
            "Locale is not a target locale of this project.",
          );
        }

        const sourceFile = await getRepositorySourceFileByPath({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: params.projectId,
          sourcePath: parsed.data.sourcePath,
        });
        if (!sourceFile) {
          return notFoundResponse(c, "source_file_not_found", "Source file not found");
        }

        const adapter = options.fileStorageAdapter ?? getFileStorageAdapter();
        const storedFile = await createStoredFile({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: params.projectId,
          createdByUserId: c.var.auth.user.localUserId,
          role: "reference",
          sourceKind: "tms_file",
          filename: file.name,
          contentType: file.type || sourceContentType(parsed.data.sourcePath),
          content: await file.arrayBuffer(),
          metadata: {
            sourcePath: parsed.data.sourcePath,
            targetLocale: parsed.data.locale,
            uploadSurface: "files_page_translation_import",
          },
          adapter,
        });

        try {
          await translationFileImportQueue.enqueue({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: params.projectId,
            storedFileId: storedFile.id,
            sourcePath: parsed.data.sourcePath,
            targetLocale: parsed.data.locale,
            actorUserId: c.var.auth.user.localUserId,
          });
        } catch (error) {
          await db
            .delete(schema.storedFiles)
            .where(eq(schema.storedFiles.id, storedFile.id))
            .catch(() => undefined);
          await adapter.delete({ keyOrUrl: storedFile.storageKey }).catch(() => undefined);
          throw error;
        }

        return c.json(
          {
            import: {
              status: "queued" as const,
              sourcePath: parsed.data.sourcePath,
              locale: parsed.data.locale,
            },
          },
          200,
        );
      },
    )
    .get("/:projectId/open-job-count", validateProjectParams, async (c) => {
      const params = c.req.valid("param");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const target = await resolveProjectResourceTarget(c.var.auth, params.projectId);

      if (target.kind === "provider_unavailable") {
        return providerProjectUnavailableResponse(c, target);
      }

      if (target.kind === "provider") {
        try {
          const openJobCount = await countTmsProviderLiveOpenJobsForProject(
            organizationId,
            target.externalProjectId,
            { actorUserId: c.var.auth.user.localUserId },
          );
          return c.json({ openJobCount }, 200);
        } catch (error) {
          return tmsProviderLiveErrorResponse(c, error);
        }
      }

      const project = await getOwnedProject(c.var.auth, params.projectId);
      if (!project) {
        scheduleProjectNotFoundDiagnostics({
          auth: c.var.auth,
          projectId: params.projectId,
          route: "project.open_job_count",
        });
        return projectNotFoundResponse(c);
      }

      const openJobCount = await countOpenJobs(c.var.auth, project.id);
      return c.json({ openJobCount }, 200);
    })
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
