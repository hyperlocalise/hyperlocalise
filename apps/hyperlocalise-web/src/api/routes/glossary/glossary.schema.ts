import { z } from "zod";

import { localeInputSchema } from "@/lib/i18n/locales";

export const glossaryIdParamsSchema = z.object({
  glossaryId: z.string().trim().min(1).max(128),
});

export const glossaryTermIdParamsSchema = glossaryIdParamsSchema.extend({
  termId: z.string().trim().min(1).max(128),
});

export const glossaryProjectParamsSchema = glossaryIdParamsSchema.extend({
  projectId: z.string().trim().min(1).max(128),
});

export const listGlossaryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    search: z.string().trim().max(200).optional(),
    source: z.enum(["native", "external_tms"]).optional(),
    provider: z.enum(["crowdin", "smartling", "phrase", "lokalise"]).optional(),
    resourceType: z.enum(["glossary", "term_base"]).optional(),
    sync: z.enum(["synced", "stale", "syncing", "error"]).optional(),
  })
  .optional();

export const createGlossaryBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional(),
  sourceLocale: localeInputSchema,
  targetLocale: localeInputSchema,
});

export const updateGlossaryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
    sourceLocale: localeInputSchema.optional(),
    targetLocale: localeInputSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.sourceLocale !== undefined ||
      value.targetLocale !== undefined,
    {
      message: "at least one field must be provided",
    },
  );

export const createGlossaryTermBodySchema = z.object({
  sourceTerm: z.string().trim().min(1).max(1_000),
  targetTerm: z.string().trim().min(1).max(1_000),
  description: z.string().max(10_000).optional(),
  partOfSpeech: z.string().max(200).optional(),
  caseSensitive: z.boolean().optional().default(false),
  forbidden: z.boolean().optional().default(false),
});

export const updateGlossaryTermBodySchema = z
  .object({
    sourceTerm: z.string().trim().min(1).max(1_000).optional(),
    targetTerm: z.string().trim().min(1).max(1_000).optional(),
    description: z.string().max(10_000).optional(),
    partOfSpeech: z.string().max(200).optional(),
    caseSensitive: z.boolean().optional(),
    forbidden: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.sourceTerm !== undefined ||
      value.targetTerm !== undefined ||
      value.description !== undefined ||
      value.partOfSpeech !== undefined ||
      value.caseSensitive !== undefined ||
      value.forbidden !== undefined,
    {
      message: "at least one field must be provided",
    },
  );

export const importGlossaryTermsBodySchema = z.object({
  format: z.enum(["csv", "tbx"]),
  content: z.string().min(1).max(5_000_000),
});

export const attachGlossaryProjectBodySchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  priority: z.number().int().min(0).max(10_000).optional().default(0),
});

export const glossaryRecordSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  createdByUserId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  sourceLocale: z.string(),
  targetLocale: z.string(),
  status: z.string(),
  source: z.enum(["native", "external_tms"]),
  externalProviderKind: z.enum(["crowdin", "smartling", "phrase", "lokalise"]).nullable(),
  externalProjectId: z.string().nullable(),
  externalResourceType: z.enum(["glossary", "term_base"]).nullable(),
  externalGlossaryId: z.string().nullable(),
  localeCoverage: z.array(z.string()),
  termCount: z.number().int().nullable(),
  syncState: z.string().nullable(),
  termCapabilities: z.record(z.string(), z.unknown()),
  externalUrl: z.string().nullable(),
  lastSyncedAt: z.string().datetime().nullable(),
  lastSyncErrorAt: z.string().datetime().nullable(),
  lastSyncErrorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const glossaryTermRecordSchema = z.object({
  id: z.string(),
  glossaryId: z.string(),
  glossaryName: z.string(),
  sourceTerm: z.string(),
  targetTerm: z.string(),
  targetLocale: z.string(),
  description: z.string(),
  partOfSpeech: z.string().optional(),
  forbidden: z.boolean(),
  caseSensitive: z.boolean(),
  provenance: z.string(),
  externalKey: z.string().nullable(),
  reviewStatus: z.string(),
});

export const glossaryProjectRecordSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  priority: z.number().int(),
  sourceLocale: z.string().nullable(),
  targetLocales: z.array(z.string()),
});

export const glossaryResponseSchema = z.object({
  glossary: glossaryRecordSchema,
});

export const glossaryTermResponseSchema = z.object({
  glossaryTerm: glossaryTermRecordSchema,
});

export const glossariesResponseSchema = z.object({
  glossaries: z.array(glossaryRecordSchema),
  total: z.number().int().nonnegative(),
});

export const glossaryTermsResponseSchema = z.object({
  glossaryTerms: z.array(glossaryTermRecordSchema),
  total: z.number().int().nonnegative().optional(),
});

export const glossaryProjectsResponseSchema = z.object({
  projects: z.array(glossaryProjectRecordSchema),
});

export type GlossaryIdParams = z.infer<typeof glossaryIdParamsSchema>;
export type GlossaryTermIdParams = z.infer<typeof glossaryTermIdParamsSchema>;
export type GlossaryProjectParams = z.infer<typeof glossaryProjectParamsSchema>;
export type ListGlossaryQuery = z.infer<typeof listGlossaryQuerySchema>;
export type CreateGlossaryBody = z.infer<typeof createGlossaryBodySchema>;
export type UpdateGlossaryBody = z.infer<typeof updateGlossaryBodySchema>;
export type CreateGlossaryTermBody = z.infer<typeof createGlossaryTermBodySchema>;
export type UpdateGlossaryTermBody = z.infer<typeof updateGlossaryTermBodySchema>;
export type ImportGlossaryTermsBody = z.infer<typeof importGlossaryTermsBodySchema>;
export type AttachGlossaryProjectBody = z.infer<typeof attachGlossaryProjectBodySchema>;
export type GlossaryRecord = z.infer<typeof glossaryRecordSchema>;
export type GlossaryResponse = z.infer<typeof glossaryResponseSchema>;
export type GlossaryTermResponse = z.infer<typeof glossaryTermResponseSchema>;
export type GlossariesResponse = z.infer<typeof glossariesResponseSchema>;
export type GlossaryTermRecord = z.infer<typeof glossaryTermRecordSchema>;
export type GlossaryTermsResponse = z.infer<typeof glossaryTermsResponseSchema>;
export type GlossaryProjectRecord = z.infer<typeof glossaryProjectRecordSchema>;
export type GlossaryProjectsResponse = z.infer<typeof glossaryProjectsResponseSchema>;
