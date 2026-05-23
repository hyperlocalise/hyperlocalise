import { z } from "zod";

export const listTranslationMemoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .optional();

export const translationMemoryRecordSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  createdByUserId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  status: z.string(),
  source: z.enum(["native", "external_tms"]),
  externalProviderKind: z.enum(["crowdin", "smartling", "phrase", "lokalise"]).nullable(),
  externalProjectId: z.string().nullable(),
  externalMemoryId: z.string().nullable(),
  localeCoverage: z.array(z.string()),
  segmentCount: z.number().int().nullable(),
  syncState: z.string().nullable(),
  externalUrl: z.string().nullable(),
  lastSyncedAt: z.string().datetime().nullable(),
  lastSyncErrorAt: z.string().datetime().nullable(),
  lastSyncErrorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const translationMemoriesResponseSchema = z.object({
  translationMemories: z.array(translationMemoryRecordSchema),
});

export type ListTranslationMemoryQuery = z.infer<typeof listTranslationMemoryQuerySchema>;
export type TranslationMemoryRecord = z.infer<typeof translationMemoryRecordSchema>;
export type TranslationMemoriesResponse = z.infer<typeof translationMemoriesResponseSchema>;
