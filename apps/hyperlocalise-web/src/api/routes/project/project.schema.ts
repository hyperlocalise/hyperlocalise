import { z } from "zod";

import { optionalProjectIdSchema, projectIdSchema } from "@/lib/projects/identity/project-id";
import {
  localeInputSchema,
  maxProjectTargetLocales,
  projectTargetLocalesSchema,
} from "@/lib/i18n/locales";

export const projectIdParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const externalTmsContentSyncBodySchema = z.object({
  externalJobId: z.string().trim().min(1).max(128),
});

export const externalTmsTranslationPushBodySchema = z.object({
  externalJobId: z.string().trim().min(1).max(128),
  translations: z
    .array(
      z
        .object({
          externalStringId: z.string().trim().min(1).max(128).optional(),
          key: z.string().trim().min(1).max(512).optional(),
          locale: z.string().trim().min(1).max(32),
          text: z.string().max(100_000),
          fileId: z.string().trim().min(1).max(128).optional(),
          fileName: z.string().trim().min(1).max(256).optional(),
          format: z.string().trim().min(1).max(64).optional(),
        })
        .refine((data) => data.key != null || data.externalStringId != null, {
          message: "Either key or externalStringId must be provided",
          path: ["key"],
        }),
    )
    .min(1)
    .max(1000),
});

export const createProjectBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(10_000).optional(),
    translationContext: z.string().max(20_000).optional(),
    teamId: z.string().uuid().optional(),
    sourceLocale: localeInputSchema,
    targetLocales: projectTargetLocalesSchema,
  })
  .superRefine((value, ctx) => {
    const sourceKey = value.sourceLocale.toLowerCase();
    if (value.targetLocales.some((locale) => locale.toLowerCase() === sourceKey)) {
      ctx.addIssue({
        code: "custom",
        message: "source locale cannot appear in target locales",
        path: ["targetLocales"],
      });
    }
  });

export const updateProjectBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
    translationContext: z.string().max(20_000).optional(),
    teamId: z.string().uuid().optional(),
    sourceLocale: localeInputSchema.optional(),
    targetLocales: projectTargetLocalesSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.translationContext !== undefined ||
      value.teamId !== undefined ||
      value.sourceLocale !== undefined ||
      value.targetLocales !== undefined,
    {
      message: "at least one field must be provided",
    },
  )
  .superRefine((value, ctx) => {
    if (value.sourceLocale === undefined || value.targetLocales === undefined) {
      return;
    }

    if (
      value.targetLocales.some(
        (locale) => locale.toLowerCase() === value.sourceLocale!.toLowerCase(),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "source locale cannot appear in target locales",
        path: ["targetLocales"],
      });
    }
  });

export { maxProjectTargetLocales };

export const projectRecordSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  teamId: z.string().uuid().nullable(),
  createdByUserId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  translationContext: z.string(),
  source: z.enum(["native", "external_tms"]),
  externalProviderKind: z.enum(["crowdin", "smartling", "phrase", "lokalise"]).nullable(),
  externalProjectId: z.string().nullable(),
  sourceLocale: z.string().nullable(),
  targetLocales: z.array(z.string()),
  externalProjectUrl: z.string().nullable(),
  isActive: z.boolean(),
  lastSyncedAt: z.string().nullable(),
  lastSyncErrorAt: z.string().nullable(),
  lastSyncErrorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  openJobCount: z.number().int(),
});

export const projectResponseSchema = z.object({
  project: projectRecordSchema,
});

export const projectsResponseSchema = z.object({
  projects: z.array(projectRecordSchema),
});

export const projectFileRecordSchema = z.object({
  origin: z.enum(["repository", "provider", "combined"]).default("repository"),
  sourcePath: z.string(),
  sourceHash: z.string().nullable(),
  commitSha: z.string().nullable(),
  workflowRunId: z.string().nullable(),
  uploadedAt: z.string(),
  storedFileId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  filename: z.string(),
  byteSize: z.number().nullable(),
  provider: z
    .object({
      kind: z.string(),
      resourceType: z.enum(["file", "key"]),
      externalProjectId: z.string(),
      externalResourceId: z.string(),
      externalUrl: z.string().nullable(),
      syncState: z.string(),
      sourceLocale: z.string().nullable(),
      targetLocales: z.array(z.string()),
      localeReadiness: z.record(z.string(), z.unknown()),
      revision: z.string().nullable(),
      format: z.string().nullable(),
      lastSyncedAt: z.string().nullable(),
    })
    .nullable()
    .default(null),
  latestJob: z
    .object({
      id: z.string(),
      status: z.enum([
        "queued",
        "running",
        "succeeded",
        "failed",
        "waiting_for_review",
        "cancelled",
      ]),
      createdAt: z.string(),
      type: z.enum(["string", "file"]),
    })
    .nullable(),
});

export const projectFilesResponseSchema = z.object({
  files: z.array(projectFileRecordSchema),
});

const projectFilesFilterOriginSchema = z.enum(["all", "repository", "provider"]).default("all");
const projectFilesFilterResourceTypeSchema = z.enum(["all", "file", "key"]).default("all");
const projectFilesFilterProviderKindSchema = z
  .enum(["all", "crowdin", "smartling", "phrase", "lokalise"])
  .default("all");

export const projectFilesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1_000).optional().default(500),
  search: z.string().trim().max(256).optional(),
  origin: projectFilesFilterOriginSchema.optional(),
  resourceType: projectFilesFilterResourceTypeSchema.optional(),
  providerKind: projectFilesFilterProviderKindSchema.optional(),
  locale: z.string().trim().max(32).optional(),
  syncState: z.string().trim().max(64).optional(),
  projectId: optionalProjectIdSchema,
});

export const workspaceFileRecordSchema = projectFileRecordSchema.extend({
  projectId: z.string(),
  projectName: z.string(),
});

export const workspaceFilesResponseSchema = z.object({
  files: z.array(workspaceFileRecordSchema),
});

export const projectFileDetailQuerySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
});

export const projectFileCatQueueFilterSchema = z.enum([
  "all",
  "untranslated",
  "needs_review",
  "reviewed",
  "has_issues",
]);

export const projectFileCatQuerySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  targetLocale: z.string().trim().min(1).max(32),
  repositoryFullName: z.string().trim().min(1).max(256).optional(),
  search: z.string().trim().max(256).optional(),
  queueFilter: projectFileCatQueueFilterSchema.optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const projectFileCatPaginationSchema = z.object({
  offset: z.number().int().min(0),
  limit: z.number().int().min(1),
  returnedCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
  hasMore: z.boolean(),
});

export const projectFileCatQueueSummarySchema = z.object({
  total: z.number().int().min(0),
  reviewed: z.number().int().min(0),
  untranslated: z.number().int().min(0),
  needsReview: z.number().int().min(0),
  hasIssues: z.number().int().min(0),
});

export const defaultProjectFileCatPageLimit = 50;
export const maxProjectFileCatPageLimit = 100;
export const maxCrowdinSourceStringCountCeiling = 5_000;
export const legacyNativeCatSegmentLimit = 500;
export const legacyProviderCatSegmentLimit = 1_000;

export const projectFileCatTranslationBodySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  targetLocale: z.string().trim().min(1).max(32),
  externalStringId: z.string().trim().min(1).max(128),
  externalResourceId: z.string().trim().min(1).max(128).optional(),
  text: z.string().max(100_000),
  approve: z.boolean().optional(),
});

export const projectFileCatStatusBodySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  targetLocale: z.string().trim().min(1).max(32),
  externalStringId: z.string().trim().min(1).max(128),
  status: z.enum(["needs_review", "approved", "rejected"]),
});

export const maxProjectFileUploadBytes = 25 * 1024 * 1024;

export const projectFileUploadBodySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  sourceHash: z.string().trim().min(1).max(256).optional(),
  commitSha: z.string().trim().min(1).max(256).optional(),
  workflowRunId: z.string().trim().min(1).max(256).optional(),
});

export const projectSourceStringEntrySchema = z.object({
  key: z.string(),
  text: z.string(),
  context: z.string().nullable(),
  type: z.string().optional(),
  id: z.number().optional(),
});

export const projectSourceStringsPreviewSchema = z.object({
  truncated: z.boolean(),
  note: z.string().optional(),
  entries: z.array(projectSourceStringEntrySchema),
});

export const projectFileContentSchema = z.object({
  text: z.string().optional(),
  sourceStrings: projectSourceStringsPreviewSchema.optional(),
});

export const projectFileStringContextBodySchema = z.object({
  repositoryFullName: z.string().trim().min(1).max(256).optional(),
  sourcePath: z.string().trim().min(1).max(2048),
  key: z.string().trim().min(1).max(2048),
  text: z.string().trim().max(16_384),
  context: z.string().trim().max(16_384).nullable().optional(),
  forceRefresh: z.boolean().optional(),
});

export const projectFileStringContextResponseSchema = z.object({
  stringContext: z.object({
    summary: z.string(),
    cached: z.boolean(),
  }),
});

export const projectFileVersionRecordSchema = z.object({
  id: z.string(),
  origin: z.enum(["repository", "provider"]).default("repository"),
  sourcePath: z.string(),
  sourceHash: z.string().nullable(),
  revision: z.string().nullable(),
  commitSha: z.string().nullable(),
  workflowRunId: z.string().nullable(),
  uploadedAt: z.string(),
  storedFileId: z.string().nullable(),
  filename: z.string(),
  contentType: z.string().nullable(),
  byteSize: z.number().nullable(),
  sha256: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  content: projectFileContentSchema.nullable(),
});

export const projectFileOutputRecordSchema = z.object({
  fileId: z.string(),
  locale: z.string(),
  filename: z.string(),
  byteSize: z.number().nullable(),
  sha256: z.string().nullable(),
  contentType: z.string().nullable(),
  downloadPath: z.string(),
  content: projectFileContentSchema.nullable(),
});

export const projectFileJobRecordSchema = z.object({
  id: z.string(),
  sourceFileVersionId: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed", "waiting_for_review", "cancelled"]),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  workflowRunId: z.string().nullable(),
  sourceLocale: z.string().nullable(),
  targetLocales: z.array(z.string()),
  outputs: z.array(projectFileOutputRecordSchema),
});

export const projectFileProviderJobRecordSchema = z.object({
  id: z.string(),
  externalJobId: z.string(),
  externalTaskId: z.string().nullable(),
  providerKind: z.string(),
  title: z.string(),
  externalStatus: z.string(),
  syncState: z.string(),
  targetLocales: z.array(z.string()),
  externalUrl: z.string().nullable(),
  linkedJobId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const projectFileDetailResponseSchema = z.object({
  file: z.object({
    sourcePath: z.string(),
    filename: z.string(),
    provider: projectFileRecordSchema.shape.provider,
    versions: z.array(projectFileVersionRecordSchema),
    jobsByLocale: z.array(
      z.object({
        locale: z.string(),
        jobs: z.array(projectFileJobRecordSchema),
      }),
    ),
    providerJobsByLocale: z.array(
      z.object({
        locale: z.string(),
        jobs: z.array(projectFileProviderJobRecordSchema),
      }),
    ),
  }),
});

export const projectFileCatRecommendationBodySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  targetLocale: z.string().trim().min(1).max(32),
  sourceLocale: z.string().trim().min(1).max(32),
  key: z.string().trim().min(1).max(2048),
  sourceText: z.string().min(1).max(100_000),
  targetText: z.string().max(100_000).optional(),
  context: z.string().trim().max(16_384).nullable().optional(),
  agentContext: z.string().trim().max(16_384).nullable().optional(),
  maxLength: z.number().int().positive().optional(),
  glossaryTerms: z
    .array(
      z.object({
        sourceTerm: z.string(),
        targetTerm: z.string(),
        targetLocale: z.string(),
        forbidden: z.boolean().nullable().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .optional(),
  translationMemoryMatches: z
    .array(
      z.object({
        sourceText: z.string(),
        targetText: z.string(),
        targetLocale: z.string(),
      }),
    )
    .optional(),
});

export const projectFileCatConcordanceBodySchema = z.object({
  sourceLocale: z.string().trim().min(1).max(32),
  targetLocale: z.string().trim().min(1).max(32),
  sourceText: z.string().min(1).max(100_000),
});

export const projectFileCatConcordanceGlossaryTermSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  approved: z.boolean(),
  forbidden: z.boolean(),
});

export const projectFileCatConcordanceTranslationMemoryMatchSchema = z.object({
  id: z.string(),
  sourceText: z.string(),
  targetText: z.string(),
  matchPercent: z.number(),
  contextLabel: z.string().optional(),
});

export const projectFileCatConcordanceResponseSchema = z.object({
  concordance: z.object({
    glossaryTerms: z.array(projectFileCatConcordanceGlossaryTermSchema),
    translationMemoryMatches: z.array(projectFileCatConcordanceTranslationMemoryMatchSchema),
  }),
});

export const projectFileCatVisualContextMarkerSchema = z.object({
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});

export const projectFileCatVisualContextScreenshotSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  imageUrl: z.string().min(1),
  width: z.number().nullable(),
  height: z.number().nullable(),
  markers: z.array(projectFileCatVisualContextMarkerSchema),
});

export const projectFileCatVisualContextBodySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  externalStringId: z.string().trim().min(1).max(128),
});

export const projectFileCatVisualContextResponseSchema = z.object({
  visualContext: z.object({
    screenshots: z.array(projectFileCatVisualContextScreenshotSchema),
  }),
});

export const projectFileCatRecommendationResponseSchema = z.object({
  recommendation: z.object({
    aiSuggestion: z.string(),
    aiReasoning: z.string(),
  }),
});

export const projectFileCatCommentSchema = z.object({
  externalCommentId: z.string(),
  type: z.enum(["comment", "issue"]),
  status: z.string().nullable(),
  text: z.string(),
  createdAt: z.string().nullable(),
  locale: z.string().nullable(),
  author: z.string().nullable().optional(),
});

export const projectFileCatCommentBodySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
  targetLocale: z.string().trim().min(1).max(32),
  externalStringId: z.string().trim().min(1).max(128),
  externalResourceId: z.string().trim().min(1).max(128).optional(),
  text: z.string().trim().min(1).max(16_384),
  type: z.enum(["comment", "issue"]).optional(),
});

export const projectFileCatCommentResponseSchema = z.object({
  comment: projectFileCatCommentSchema,
});

export const projectFileCatTranslationSchema = z.object({
  text: z.string(),
  externalTranslationId: z.string().nullable(),
  isApproved: z.boolean(),
});

export const projectFileCatSegmentSchema = z.object({
  externalStringId: z.string(),
  key: z.string(),
  sourceText: z.string(),
  context: z.string().nullable(),
  type: z.string().nullable(),
  target: projectFileCatTranslationSchema.nullable(),
  comments: z.array(projectFileCatCommentSchema),
  repositoryContext: z.string().nullable().optional(),
});

export const projectFileCatResponseSchema = z.object({
  catFile: z.object({
    sourcePath: z.string(),
    filename: z.string(),
    provider: projectFileRecordSchema.shape.provider,
    targetLocale: z.string(),
    canEditTranslations: z.boolean(),
    truncated: z.boolean(),
    segments: z.array(projectFileCatSegmentSchema),
    pagination: projectFileCatPaginationSchema.optional(),
    queueSummary: projectFileCatQueueSummarySchema,
  }),
});

export const projectFileCatTranslationResponseSchema = z.object({
  translation: projectFileCatTranslationSchema,
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;
export type ProjectRecord = z.infer<typeof projectRecordSchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
export type ProjectsResponse = z.infer<typeof projectsResponseSchema>;
export type ProjectFileRecord = z.infer<typeof projectFileRecordSchema>;
export type ProjectFilesResponse = z.infer<typeof projectFilesResponseSchema>;
export type ProjectFilesQuery = z.infer<typeof projectFilesQuerySchema>;
export type ProjectFileDetailQuery = z.infer<typeof projectFileDetailQuerySchema>;
export type ProjectFileCatQuery = z.infer<typeof projectFileCatQuerySchema>;
export type ProjectFileCatQueueFilter = z.infer<typeof projectFileCatQueueFilterSchema>;
export type ProjectFileCatTranslationBody = z.infer<typeof projectFileCatTranslationBodySchema>;
export type ProjectFileCatRecommendationBody = z.infer<
  typeof projectFileCatRecommendationBodySchema
>;
export type ProjectFileCatConcordanceBody = z.infer<typeof projectFileCatConcordanceBodySchema>;
export type ProjectFileCatConcordanceResponse = z.infer<
  typeof projectFileCatConcordanceResponseSchema
>;
export type ProjectFileCatVisualContextBody = z.infer<typeof projectFileCatVisualContextBodySchema>;
export type ProjectFileCatVisualContextResponse = z.infer<
  typeof projectFileCatVisualContextResponseSchema
>;
export type ProjectSourceStringEntry = z.infer<typeof projectSourceStringEntrySchema>;
export type ProjectSourceStringsPreview = z.infer<typeof projectSourceStringsPreviewSchema>;
export type ProjectFileContent = z.infer<typeof projectFileContentSchema>;
export type ProjectFileStringContextBody = z.infer<typeof projectFileStringContextBodySchema>;
export type ProjectFileStringContextResponse = z.infer<
  typeof projectFileStringContextResponseSchema
>;
export type ProjectFileVersionRecord = z.infer<typeof projectFileVersionRecordSchema>;
export type ProjectFileOutputRecord = z.infer<typeof projectFileOutputRecordSchema>;
export type ProjectFileJobRecord = z.infer<typeof projectFileJobRecordSchema>;
export type ProjectFileProviderJobRecord = z.infer<typeof projectFileProviderJobRecordSchema>;
export type ProjectFileDetailResponse = z.infer<typeof projectFileDetailResponseSchema>;
export type ProjectFileCatComment = z.infer<typeof projectFileCatCommentSchema>;
export type ProjectFileCatCommentBody = z.infer<typeof projectFileCatCommentBodySchema>;
export type ProjectFileCatCommentResponse = z.infer<typeof projectFileCatCommentResponseSchema>;
export type ProjectFileCatTranslation = z.infer<typeof projectFileCatTranslationSchema>;
export type ProjectFileCatSegment = z.infer<typeof projectFileCatSegmentSchema>;
export type ProjectFileCatQueueSummary = z.infer<typeof projectFileCatQueueSummarySchema>;
export type ProjectFileCatResponse = z.infer<typeof projectFileCatResponseSchema>;
export type ProjectFileCatTranslationResponse = z.infer<
  typeof projectFileCatTranslationResponseSchema
>;
export type ProjectFileCatRecommendationResponse = z.infer<
  typeof projectFileCatRecommendationResponseSchema
>;
export type WorkspaceFileRecord = z.infer<typeof workspaceFileRecordSchema>;
export type WorkspaceFilesResponse = z.infer<typeof workspaceFilesResponseSchema>;
