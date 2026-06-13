import { z } from "zod";

import { projectIdSchema } from "@/lib/projects/project-id";
import { schema } from "@/lib/database";

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

export const listMemoryEntriesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    sourceLocale: z.string().trim().max(50).optional(),
    targetLocale: z.string().trim().max(50).optional(),
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
    sourceLocale: z.string().trim().min(1).max(50).optional(),
    targetLocale: z.string().trim().min(1).max(50).optional(),
    sourceText: z.string().trim().min(1).max(100_000).optional(),
    targetText: z.string().trim().min(1).max(100_000).optional(),
    matchScore: z.number().int().min(0).max(100).optional(),
  })
  .refine(
    (value) =>
      value.sourceLocale !== undefined ||
      value.targetLocale !== undefined ||
      value.sourceText !== undefined ||
      value.targetText !== undefined ||
      value.matchScore !== undefined,
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
  content: z.string().min(1).max(10_000_000),
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
  externalKey: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const memoryEntryResponseSchema = z.object({
  memoryEntry: memoryEntryRecordSchema,
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

export const memoryEntriesResponseSchema = z.object({
  memoryEntries: z.array(memoryEntryRecordSchema),
  total: z.number().int().nonnegative(),
});

export const memoryProjectsResponseSchema = z.object({
  projects: z.array(memoryProjectRecordSchema),
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
export type AttachMemoryProjectBody = z.infer<typeof attachMemoryProjectBodySchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;
export type MemoryResponse = z.infer<typeof memoryResponseSchema>;
export type MemoryEntryRecord = z.infer<typeof memoryEntryRecordSchema>;
export type MemoryEntryResponse = z.infer<typeof memoryEntryResponseSchema>;
export type MemoriesResponse = z.infer<typeof memoriesResponseSchema>;
export type MemoryEntriesResponse = z.infer<typeof memoryEntriesResponseSchema>;
export type MemoryProjectRecord = z.infer<typeof memoryProjectRecordSchema>;
export type MemoryProjectsResponse = z.infer<typeof memoryProjectsResponseSchema>;
