/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

import { schema } from "@/lib/database";
import {
  TMX_DEFAULT_MAX_UNITS,
  TMX_MAX_IMPORT_CONTENT_CHARS,
} from "@/lib/memory/tmx/tmx-constants";
import { projectIdSchema } from "@/lib/projects/identity/project-id";

export const memoryIdParamsSchema = z.object({
  memoryId: z.string().trim().min(1).max(128),
});

export const memoryEntryIdParamsSchema = memoryIdParamsSchema.extend({
  entryId: z.string().trim().min(1).max(128),
});

export const memoryProjectParamsSchema = memoryIdParamsSchema.extend({
  projectId: projectIdSchema,
});

export const listMemoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .optional();

export const createMemoryBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional(),
});

export const updateMemoryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: "at least one field must be provided",
  });

const isoDateTimeQuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "must be an ISO-8601 datetime",
  });

export const memoryEntryReviewStatusSchema = z.enum(["approved", "pending", "rejected"]);
export const memoryEntryListSortSchema = z.enum(["created_at", "updated_at"]);
export const memoryEntryListSortDirSchema = z.enum(["asc", "desc"]);

export const listMemoryEntriesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).optional(),
    cursor: z.string().trim().min(1).max(2048).optional(),
    search: z.string().trim().max(200).optional(),
    sourceLocale: z.string().trim().max(50).optional(),
    targetLocale: z.string().trim().max(50).optional(),
    reviewStatus: memoryEntryReviewStatusSchema.optional(),
    origin: z.string().trim().min(1).max(100).optional(),
    provider: z.string().trim().min(1).max(100).optional(),
    createdByUserId: z.string().uuid().optional(),
    modifiedFrom: isoDateTimeQuerySchema.optional(),
    modifiedTo: isoDateTimeQuerySchema.optional(),
    importBatchId: z.string().uuid().optional(),
    sort: memoryEntryListSortSchema.optional(),
    sortDir: memoryEntryListSortDirSchema.optional(),
  })
  .superRefine((query, ctx) => {
    if (
      query.modifiedFrom &&
      query.modifiedTo &&
      Date.parse(query.modifiedFrom) > Date.parse(query.modifiedTo)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["modifiedFrom"],
        message: "modifiedFrom must be before or equal to modifiedTo",
      });
    }
  })
  .optional();

export const createMemoryEntryBodySchema = z.object({
  sourceLocale: z.string().trim().min(1).max(50),
  targetLocale: z.string().trim().min(1).max(50),
  sourceText: z.string().trim().min(1).max(100_000),
  targetText: z.string().trim().min(1).max(100_000),
  matchScore: z.number().int().min(0).max(100).optional().default(100),
});

export const updateMemoryEntryBodySchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    sourceLocale: z.string().trim().min(1).max(50).optional(),
    targetLocale: z.string().trim().min(1).max(50).optional(),
    sourceText: z.string().trim().min(1).max(100_000).optional(),
    targetText: z.string().trim().min(1).max(100_000).optional(),
    matchScore: z.number().int().min(0).max(100).optional(),
    reviewStatus: memoryEntryReviewStatusSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (value) =>
      value.sourceLocale !== undefined ||
      value.targetLocale !== undefined ||
      value.sourceText !== undefined ||
      value.targetText !== undefined ||
      value.matchScore !== undefined ||
      value.reviewStatus !== undefined ||
      value.metadata !== undefined,
    { message: "at least one field must be provided" },
  );

export const promoteMemoryFromProjectBodySchema = z.object({
  projectId: projectIdSchema,
  sourceLocale: z.string().trim().min(1).max(50),
  targetLocale: z.string().trim().max(50).optional(),
  sourcePath: z.string().trim().min(1).max(2048).optional(),
});

export const importMemoryEntriesBodySchema = z.object({
  format: z.enum(["csv", "tmx"]),
  content: z.string().min(1).max(TMX_MAX_IMPORT_CONTENT_CHARS),
  dryRun: z.boolean().optional(),
  maxUnits: z.number().int().min(1).max(TMX_DEFAULT_MAX_UNITS).optional(),
});

export const exportMemoryEntriesQuerySchema = z.object({
  format: z.enum(["tmx"]).optional().default("tmx"),
  sourceLocale: z.string().trim().min(1).max(50).optional(),
  targetLocale: z.string().trim().min(1).max(50).optional(),
});

export const attachMemoryProjectBodySchema = z.object({
  projectId: projectIdSchema,
  priority: z.number().int().min(0).max(10_000).optional().default(0),
});

export const memoryRecordSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  createdByUserId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  status: z.string(),
  source: z.enum(["native", "external_tms"]),
  externalProviderKind: z.enum(schema.externalTmsProviderKindEnum.enumValues).nullable(),
  externalProjectId: z.string().nullable(),
  externalMemoryId: z.string().nullable(),
  localeCoverage: z.array(z.string()),
  segmentCount: z.number().int().nullable(),
  syncState: z.string().nullable(),
  capabilityMode: z.enum(["live_search", "synced_import", "reference_only"]).nullable(),
  segmentCapabilities: z.record(z.string(), z.unknown()),
  externalUrl: z.string().nullable(),
  lastSyncedAt: z.string().datetime().nullable(),
  lastSyncErrorAt: z.string().datetime().nullable(),
  lastSyncErrorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const memoryResponseSchema = z.object({
  memory: memoryRecordSchema,
});

export const memoryEntryRecordSchema = z.object({
  id: z.string(),
  memoryId: z.string(),
  sourceLocale: z.string(),
  targetLocale: z.string(),
  sourceText: z.string(),
  targetText: z.string(),
  matchScore: z.number().int(),
  provenance: z.string(),
  reviewStatus: z.string(),
  version: z.number().int(),
  externalKey: z.string().nullable(),
  createdByUserId: z.string().nullable(),
  modifiedByUserId: z.string().nullable(),
  reviewedByUserId: z.string().nullable(),
  importBatchId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable(),
});

export const memoryEntryActorSchema = z.object({
  userId: z.string().nullable(),
  displayName: z.string().nullable(),
  at: z.string().datetime().nullable(),
  source: z.enum(["created", "modified", "reviewed", "imported", "provider"]),
});

export const memoryEntryProvenanceSchema = z.object({
  origin: z.string(),
  provider: z.string().nullable(),
  importBatchId: z.string().nullable(),
  context: z.string().nullable(),
  created: memoryEntryActorSchema,
  modified: memoryEntryActorSchema,
  reviewed: memoryEntryActorSchema,
  imported: memoryEntryActorSchema,
  providerSupplied: memoryEntryActorSchema,
});

export const memoryEntryVariantRecordSchema = z.object({
  id: z.string(),
  sourceLocale: z.string(),
  targetLocale: z.string(),
  sourceText: z.string(),
  targetText: z.string(),
  context: z.string().nullable(),
  reviewStatus: z.string(),
});

export const memoryEntryAuditEventRecordSchema = z.object({
  id: z.string(),
  eventType: z.enum(["created", "updated", "reviewed", "imported", "synced"]),
  actorKind: z.enum(["user", "import", "provider", "system"]),
  actorUserId: z.string().nullable(),
  actorDisplayName: z.string().nullable(),
  version: z.number().int(),
  changedFields: z.array(z.string()),
  attributes: z.record(z.string(), z.unknown()),
  occurredAt: z.string().datetime(),
});

export const memoryEntryCapabilitiesSchema = z.object({
  canEdit: z.boolean(),
  readOnlyReason: z.enum(["external_tms", "reference_only"]).nullable(),
});

export const memoryEntryResponseSchema = z.object({
  memoryEntry: memoryEntryRecordSchema,
});

export const memoryEntryDetailResponseSchema = z.object({
  memoryEntry: memoryEntryRecordSchema,
  provenance: memoryEntryProvenanceSchema,
  variants: z.array(memoryEntryVariantRecordSchema),
  auditEvents: z.array(memoryEntryAuditEventRecordSchema),
  capabilities: memoryEntryCapabilitiesSchema,
});

export const memoryProjectRecordSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  priority: z.number().int(),
  sourceLocale: z.string().nullable(),
  targetLocales: z.array(z.string()),
});

export const memoriesResponseSchema = z.object({
  memories: z.array(memoryRecordSchema),
  total: z.number().int().nonnegative(),
});

export const memoryEntryPaginationSchema = z.object({
  limit: z.number().int().positive(),
  returned: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const memoryEntriesResponseSchema = z.object({
  memoryEntries: z.array(memoryEntryRecordSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
  pagination: memoryEntryPaginationSchema,
});

export const memoryProjectsResponseSchema = z.object({
  projects: z.array(memoryProjectRecordSchema),
});

export const memoryImportIssueSchema = z.object({
  severity: z.enum(["warning", "error"]),
  code: z.string(),
  message: z.string(),
  unitIndex: z.number().int().optional(),
  tuid: z.string().optional(),
});

export const memoryImportReportSchema = z.object({
  totalRead: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  variantCreated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  warned: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  issues: z.array(memoryImportIssueSchema),
  headerSrclang: z.string().optional(),
  truncatedIssues: z.boolean(),
});

export const memoryImportPreviewEntrySchema = z.object({
  sourceLocale: z.string(),
  targetLocale: z.string(),
  sourceText: z.string(),
  targetText: z.string(),
  externalKey: z.string().nullable(),
  tuid: z.string().optional(),
  action: z.enum(["create", "update", "variant", "skip"]),
});

export const memoryImportResponseSchema = z.object({
  memoryEntries: z.array(memoryEntryRecordSchema),
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  importBatchId: z.string().uuid().nullable(),
  dryRun: z.boolean(),
  preview: z.array(memoryImportPreviewEntrySchema),
  report: memoryImportReportSchema,
});

export type MemoryIdParams = z.infer<typeof memoryIdParamsSchema>;
export type MemoryEntryIdParams = z.infer<typeof memoryEntryIdParamsSchema>;
export type MemoryProjectParams = z.infer<typeof memoryProjectParamsSchema>;
export type ListMemoryQuery = z.infer<typeof listMemoryQuerySchema>;
export type ListMemoryEntriesQuery = z.infer<typeof listMemoryEntriesQuerySchema>;
export type CreateMemoryBody = z.infer<typeof createMemoryBodySchema>;
export type UpdateMemoryBody = z.infer<typeof updateMemoryBodySchema>;
export type CreateMemoryEntryBody = z.infer<typeof createMemoryEntryBodySchema>;
export type UpdateMemoryEntryBody = z.infer<typeof updateMemoryEntryBodySchema>;
export type PromoteMemoryFromProjectBody = z.infer<typeof promoteMemoryFromProjectBodySchema>;
export type ImportMemoryEntriesBody = z.infer<typeof importMemoryEntriesBodySchema>;
export type ExportMemoryEntriesQuery = z.infer<typeof exportMemoryEntriesQuerySchema>;
export type MemoryImportReport = z.infer<typeof memoryImportReportSchema>;
export type MemoryImportResponse = z.infer<typeof memoryImportResponseSchema>;
export type AttachMemoryProjectBody = z.infer<typeof attachMemoryProjectBodySchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;
export type MemoryResponse = z.infer<typeof memoryResponseSchema>;
export type MemoryEntryRecord = z.infer<typeof memoryEntryRecordSchema>;
export type MemoryEntryActor = z.infer<typeof memoryEntryActorSchema>;
export type MemoryEntryResponse = z.infer<typeof memoryEntryResponseSchema>;
export type MemoryEntryDetailResponse = z.infer<typeof memoryEntryDetailResponseSchema>;
export type MemoryEntryProvenance = z.infer<typeof memoryEntryProvenanceSchema>;
export type MemoryEntryVariantRecord = z.infer<typeof memoryEntryVariantRecordSchema>;
export type MemoryEntryAuditEventRecord = z.infer<typeof memoryEntryAuditEventRecordSchema>;
export type MemoriesResponse = z.infer<typeof memoriesResponseSchema>;
export type MemoryEntriesResponse = z.infer<typeof memoryEntriesResponseSchema>;
export type MemoryProjectRecord = z.infer<typeof memoryProjectRecordSchema>;
export type MemoryProjectsResponse = z.infer<typeof memoryProjectsResponseSchema>;
