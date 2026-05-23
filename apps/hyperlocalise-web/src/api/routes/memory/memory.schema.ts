import { z } from "zod";

import { schema } from "@/lib/database";

export const memoryIdParamsSchema = z.object({
  memoryId: z.string().trim().min(1).max(128),
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

export const memoriesResponseSchema = z.object({
  memories: z.array(memoryRecordSchema),
  total: z.number().int().nonnegative(),
});

export type MemoryIdParams = z.infer<typeof memoryIdParamsSchema>;
export type ListMemoryQuery = z.infer<typeof listMemoryQuerySchema>;
export type CreateMemoryBody = z.infer<typeof createMemoryBodySchema>;
export type UpdateMemoryBody = z.infer<typeof updateMemoryBodySchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;
export type MemoryResponse = z.infer<typeof memoryResponseSchema>;
export type MemoriesResponse = z.infer<typeof memoriesResponseSchema>;
