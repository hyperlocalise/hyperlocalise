import { z } from "zod";

export const projectIdParamsSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
});

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional(),
  translationContext: z.string().max(20_000).optional(),
});

export const updateProjectBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
    translationContext: z.string().max(20_000).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.translationContext !== undefined,
    {
      message: "at least one field must be provided",
    },
  );

export const projectRecordSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
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
  openJobCount: z.number().int().optional(),
});

export const projectResponseSchema = z.object({
  project: projectRecordSchema,
});

export const projectsResponseSchema = z.object({
  projects: z.array(projectRecordSchema),
});

export const projectFileRecordSchema = z.object({
  origin: z.enum(["repository", "provider"]).default("repository"),
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

export const projectFilesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1_000).optional().default(500),
});

export const projectFileDetailQuerySchema = z.object({
  sourcePath: z.string().trim().min(1).max(2048),
});

export const projectFileContentSchema = z.object({
  text: z.string(),
});

export const projectFileVersionRecordSchema = z.object({
  id: z.string(),
  sourcePath: z.string(),
  sourceHash: z.string().nullable(),
  commitSha: z.string().nullable(),
  workflowRunId: z.string().nullable(),
  uploadedAt: z.string(),
  storedFileId: z.string(),
  filename: z.string(),
  contentType: z.string(),
  byteSize: z.number(),
  sha256: z.string(),
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

export const projectFileDetailResponseSchema = z.object({
  file: z.object({
    sourcePath: z.string(),
    filename: z.string(),
    versions: z.array(projectFileVersionRecordSchema),
    jobsByLocale: z.array(
      z.object({
        locale: z.string(),
        jobs: z.array(projectFileJobRecordSchema),
      }),
    ),
  }),
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
export type ProjectFileContent = z.infer<typeof projectFileContentSchema>;
export type ProjectFileVersionRecord = z.infer<typeof projectFileVersionRecordSchema>;
export type ProjectFileOutputRecord = z.infer<typeof projectFileOutputRecordSchema>;
export type ProjectFileJobRecord = z.infer<typeof projectFileJobRecordSchema>;
export type ProjectFileDetailResponse = z.infer<typeof projectFileDetailResponseSchema>;
