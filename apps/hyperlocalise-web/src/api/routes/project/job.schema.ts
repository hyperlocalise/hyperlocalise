import { z } from "zod";

import { projectIdSchema } from "@/lib/projects/identity/project-id";
import * as schema from "@/lib/database/schema";
import { supportedTranslationFileFormats } from "@/lib/translation/file-formats";

export const maxTranslationTargetLocales = 20;
export const maxTranslationMetadataEntries = 50;

export const jobProjectParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const jobParamsSchema = z.object({
  projectId: projectIdSchema,
  jobId: z.string().trim().min(1).max(128),
});

export const workspaceJobParamsSchema = z.object({
  jobId: z.string().trim().min(1).max(128),
});

const metadataSchema = z
  .record(z.string().max(100), z.string().max(1000))
  .refine((metadata) => Object.keys(metadata).length <= maxTranslationMetadataEntries, {
    message: `metadata must contain at most ${maxTranslationMetadataEntries} entries`,
  })
  .optional();

export const stringTranslationJobInputSchema = z.object({
  sourceText: z.string().trim().min(1).max(100_000),
  sourceLocale: z.string().trim().min(1).max(32),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1).max(maxTranslationTargetLocales),
  metadata: metadataSchema,
  context: z.string().max(20_000).optional(),
  maxLength: z.int().positive().max(100_000).optional(),
  translationKeyId: z.string().uuid().optional(),
});

export const fileTranslationJobInputSchema = z.object({
  sourceFileId: z.string().trim().min(1).max(128),
  fileFormat: z.enum(supportedTranslationFileFormats),
  sourceLocale: z.string().trim().min(1).max(32),
  targetLocales: z.array(z.string().trim().min(1).max(32)).min(1).max(maxTranslationTargetLocales),
  metadata: metadataSchema,
});

export const createJobBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("string"),
    stringInput: stringTranslationJobInputSchema,
  }),
  z.object({
    type: z.literal("file"),
    fileInput: fileTranslationJobInputSchema,
  }),
]);

/** Statuses counted by project `openJobCount` and surfaced on overview pages. */
export const openJobStatusValues = ["queued", "running", "waiting_for_review"] as const;

export const jobListQuerySchema = z.object({
  kind: z.enum(schema.jobKindEnum.enumValues).optional(),
  type: z.enum(schema.translationJobTypeEnum.enumValues).optional(),
  status: z.enum(schema.jobStatusEnum.enumValues).optional(),
  open: z.coerce.boolean().optional(),
  relationship: z.enum(["assigned", "created"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const jobRecordSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    projectId: z.string().nullable(),
    createdByUserId: z.string().nullable(),
    ownerUserId: z.string().nullable(),
    kind: z.enum(schema.jobKindEnum.enumValues),
    type: z.enum(schema.translationJobTypeEnum.enumValues).nullable(),
    status: z.enum(schema.jobStatusEnum.enumValues),
    inputPayload: z.record(z.string(), z.unknown()),
    outcomeKind: z.enum(schema.translationJobOutcomeKindEnum.enumValues).nullable(),
    outcomePayload: z.record(z.string(), z.unknown()).nullable(),
    lastError: z.string().nullable(),
    workflowRunId: z.string().nullable(),
    interactionId: z.string().nullable(),
    contextSnapshot: z.record(z.string(), z.unknown()).nullable(),
    reviewCriteria: z.string().nullable(),
    reviewTargetLocale: z.string().nullable(),
    reviewConfig: z.record(z.string(), z.unknown()).nullable(),
    syncConnectorKind: z.string().nullable(),
    syncDirection: z.string().nullable(),
    syncExternalIdentifiers: z.record(z.string(), z.unknown()).nullable(),
    assetType: z.string().nullable(),
    assetOperation: z.string().nullable(),
    assetConfig: z.record(z.string(), z.unknown()).nullable(),
    externalProviderKind: z.enum(schema.externalTmsProviderKindEnum.enumValues).nullable(),
    externalJobId: z.string().nullable(),
    externalTaskId: z.string().nullable(),
    externalStatus: z.string().nullable(),
    externalTitle: z.string().nullable(),
    externalDueDate: z.string().nullable(),
    externalTargetLocales: z.array(z.string()).nullable(),
    externalAssignedUsers: z.array(z.string()).nullable(),
    externalUrl: z.string().nullable(),
    externalSyncState: z.string().nullable(),
    externalProviderPayload: z.record(z.string(), z.unknown()).nullable(),
    linkedJobId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .passthrough();

export const workspaceJobRecordSchema = jobRecordSchema.extend({
  projectName: z.string().nullable(),
});

export const jobStatusRecordSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  kind: z.enum(schema.jobKindEnum.enumValues),
  type: z.enum(schema.translationJobTypeEnum.enumValues).nullable(),
  status: z.enum(schema.jobStatusEnum.enumValues),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});

export const jobResponseSchema = z.object({
  job: jobRecordSchema,
});

export const jobsResponseSchema = z.object({
  jobs: z.array(jobRecordSchema),
});

export const workspaceJobResponseSchema = z.object({
  job: workspaceJobRecordSchema,
});

export const workspaceJobsResponseSchema = z.object({
  jobs: z.array(workspaceJobRecordSchema),
});

export const jobStatusResponseSchema = z.object({
  job: jobStatusRecordSchema,
});

export type CreateJobBody = z.infer<typeof createJobBodySchema>;
export type StringTranslationJobInput = z.infer<typeof stringTranslationJobInputSchema>;
export type FileTranslationJobInput = z.infer<typeof fileTranslationJobInputSchema>;
export type JobRecord = z.infer<typeof jobRecordSchema>;
export type WorkspaceJobRecord = z.infer<typeof workspaceJobRecordSchema>;
export type JobResponse = z.infer<typeof jobResponseSchema>;
export type JobsResponse = z.infer<typeof jobsResponseSchema>;
export type WorkspaceJobResponse = z.infer<typeof workspaceJobResponseSchema>;
export type WorkspaceJobsResponse = z.infer<typeof workspaceJobsResponseSchema>;
