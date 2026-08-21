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

import { projectIdSchema } from "@/lib/projects/identity/project-id";
import { localeInputSchema } from "@/lib/i18n/locales";
import {
  glossaryGenderValues,
  glossaryPartOfSpeechValues,
  glossaryTermStatusValues,
  glossaryTermTypeValues,
} from "@/lib/glossary/glossary";

export const glossaryPartOfSpeechSchema = z.enum(glossaryPartOfSpeechValues);
export const glossaryGenderSchema = z.enum(glossaryGenderValues);
export const glossaryTermTypeSchema = z.enum(glossaryTermTypeValues);
export const glossaryTermStatusSchema = z.enum(glossaryTermStatusValues);

export const glossaryIdParamsSchema = z.object({
  glossaryId: z.string().trim().min(1).max(128),
});

export const glossaryTermIdParamsSchema = glossaryIdParamsSchema.extend({
  termId: z.string().trim().min(1).max(128),
});

export const glossaryConceptIdParamsSchema = glossaryIdParamsSchema.extend({
  conceptId: z.string().trim().min(1).max(128),
});

export const glossaryConceptTermIdParamsSchema = glossaryConceptIdParamsSchema.extend({
  termId: z.string().trim().min(1).max(128),
});

export const glossaryProjectParamsSchema = glossaryIdParamsSchema.extend({
  projectId: projectIdSchema,
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
  projectIds: z.array(projectIdSchema).max(100).optional(),
  // Keep accepting the original single-project payload for API compatibility.
  projectId: projectIdSchema.optional(),
});

export const updateGlossaryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
    sourceLocale: localeInputSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.sourceLocale !== undefined,
    {
      message: "at least one field must be provided",
    },
  );

export const createGlossaryTermBodySchema = z.object({
  sourceTerm: z.string().trim().min(1).max(1_000),
  targetTerm: z.string().trim().min(1).max(1_000),
  description: z.string().max(10_000).optional(),
  partOfSpeech: glossaryPartOfSpeechSchema.optional(),
  url: z.string().url().max(2_000).optional().or(z.literal("")),
  lemma: z.string().max(1_000).nullable().optional(),
  caseSensitive: z.boolean().optional().default(false),
  forbidden: z.boolean().optional().default(false),
});

export const updateGlossaryTermBodySchema = z
  .object({
    sourceTerm: z.string().trim().min(1).max(1_000).optional(),
    targetTerm: z.string().trim().min(1).max(1_000).optional(),
    description: z.string().max(10_000).optional(),
    partOfSpeech: glossaryPartOfSpeechSchema.optional(),
    url: z.string().url().max(2_000).optional().or(z.literal("")),
    lemma: z.string().max(1_000).nullable().optional(),
    caseSensitive: z.boolean().optional(),
    forbidden: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.sourceTerm !== undefined ||
      value.targetTerm !== undefined ||
      value.description !== undefined ||
      value.partOfSpeech !== undefined ||
      value.url !== undefined ||
      value.lemma !== undefined ||
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

export const createGlossaryConceptTermBodySchema = z.object({
  locale: localeInputSchema,
  term: z.string().trim().min(1).max(1_000),
  partOfSpeech: glossaryPartOfSpeechSchema.optional(),
  note: z.string().max(10_000).optional(),
  gender: glossaryGenderSchema.nullable().optional(),
  termType: glossaryTermTypeSchema.nullable().optional(),
  url: z.string().url().max(2_000).nullable().optional().or(z.literal("")),
  lemma: z.string().max(1_000).nullable().optional(),
  status: glossaryTermStatusSchema.optional().default("draft"),
  description: z.string().max(10_000).optional(),
  caseSensitive: z.boolean().optional().default(false),
  forbidden: z.boolean().optional().default(false),
});

export const createGlossaryConceptBodySchema = z.object({
  primaryTerm: z.string().trim().min(1).max(1_000),
  subject: z.string().max(200).optional(),
  definition: z.string().max(10_000).optional(),
  translatable: z.boolean().optional().default(true),
  note: z.string().max(10_000).optional(),
  figure: z.string().url().max(2_000).optional().or(z.literal("")),
  url: z.string().url().max(2_000).optional().or(z.literal("")),
  terms: z.array(createGlossaryConceptTermBodySchema).max(1_000).optional(),
});

export const upsertGlossaryConceptTermBodySchema = z.object({
  id: z.string().trim().min(1).max(128).optional(),
  locale: localeInputSchema,
  term: z.string().trim().min(1).max(1_000),
  partOfSpeech: glossaryPartOfSpeechSchema.optional(),
  note: z.string().max(10_000).optional(),
  gender: glossaryGenderSchema.nullable().optional(),
  termType: glossaryTermTypeSchema.nullable().optional(),
  url: z.string().url().max(2_000).nullable().optional().or(z.literal("")),
  lemma: z.string().max(1_000).nullable().optional(),
  status: glossaryTermStatusSchema.optional(),
  description: z.string().max(10_000).optional(),
  caseSensitive: z.boolean().optional(),
  forbidden: z.boolean().optional(),
});

export const updateGlossaryConceptBodySchema = z
  .object({
    primaryTerm: z.string().trim().min(1).max(1_000).optional(),
    subject: z.string().max(200).optional(),
    definition: z.string().max(10_000).optional(),
    translatable: z.boolean().optional(),
    note: z.string().max(10_000).optional(),
    figure: z.string().url().max(2_000).optional().or(z.literal("")),
    url: z.string().url().max(2_000).optional().or(z.literal("")),
    terms: z.array(upsertGlossaryConceptTermBodySchema).max(1_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const updateGlossaryConceptTermBodySchema = z
  .object({
    locale: localeInputSchema.optional(),
    term: z.string().trim().min(1).max(1_000).optional(),
    partOfSpeech: glossaryPartOfSpeechSchema.optional(),
    note: z.string().max(10_000).optional(),
    gender: glossaryGenderSchema.nullable().optional(),
    termType: glossaryTermTypeSchema.nullable().optional(),
    url: z.string().url().max(2_000).nullable().optional().or(z.literal("")),
    lemma: z.string().max(1_000).nullable().optional(),
    status: glossaryTermStatusSchema.optional(),
    description: z.string().max(10_000).optional(),
    caseSensitive: z.boolean().optional(),
    forbidden: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const attachGlossaryProjectBodySchema = z.object({
  projectId: projectIdSchema,
  priority: z.number().int().min(0).max(10_000).optional().default(0),
});

export const glossaryRecordSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  createdByUserId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  sourceLocale: z.string(),
  targetLocale: z.string().nullable(),
  status: z.string(),
  source: z.enum(["native", "external_tms"]),
  externalProviderKind: z.enum(["crowdin", "smartling", "phrase", "lokalise"]).nullable(),
  externalProjectId: z.string().nullable(),
  externalResourceType: z.enum(["glossary", "term_base"]).nullable(),
  externalGlossaryId: z.string().nullable(),
  localeCoverage: z.array(z.string()),
  languages: z.array(
    z.object({
      locale: z.string(),
      name: z.string(),
      isSource: z.boolean(),
    }),
  ),
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
  targetLocale: z.string().nullable(),
  description: z.string(),
  partOfSpeech: z.string().optional(),
  url: z.string().nullable().optional(),
  lemma: z.string().nullable().optional(),
  forbidden: z.boolean(),
  caseSensitive: z.boolean(),
  provenance: z.string(),
  externalKey: z.string().nullable(),
  reviewStatus: z.string(),
});

export const glossaryConceptTermRecordSchema = z.object({
  id: z.string(),
  glossaryId: z.string(),
  conceptId: z.string(),
  locale: z.string(),
  term: z.string(),
  isPrimary: z.boolean(),
  description: z.string(),
  note: z.string(),
  partOfSpeech: z.string(),
  gender: glossaryGenderSchema.nullable(),
  termType: glossaryTermTypeSchema.nullable(),
  url: z.string().nullable().optional(),
  lemma: z.string().nullable().optional(),
  status: glossaryTermStatusSchema,
  caseSensitive: z.boolean(),
  forbidden: z.boolean(),
  provenance: z.string(),
  externalKey: z.string().nullable(),
  reviewStatus: z.string(),
  externalUserId: z.string().nullable().optional(),
  externalCreatedAt: z.string().datetime().nullable().optional(),
  externalUpdatedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const glossaryConceptRecordSchema = z.object({
  id: z.string(),
  glossaryId: z.string(),
  primaryTerm: z.string(),
  subject: z.string(),
  definition: z.string(),
  translatable: z.boolean(),
  note: z.string(),
  url: z.string().nullable(),
  figure: z.string().nullable().optional(),
  externalKey: z.string().nullable().optional(),
  externalUserId: z.string().nullable().optional(),
  languageDetails: z
    .array(
      z.object({
        locale: z.string(),
        userId: z.number().int().nullable(),
        definition: z.string(),
        note: z.string(),
        createdAt: z.string().datetime().nullable(),
        updatedAt: z.string().datetime().nullable(),
      }),
    )
    .optional(),
  externalCreatedAt: z.string().datetime().nullable().optional(),
  externalUpdatedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  terms: z.array(glossaryConceptTermRecordSchema),
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

export const glossaryConceptResponseSchema = z.object({
  concept: glossaryConceptRecordSchema,
});

export const glossaryConceptsResponseSchema = z.object({
  concepts: z.array(glossaryConceptRecordSchema),
  total: z.number().int().nonnegative(),
});

export const glossaryConceptTermResponseSchema = z.object({
  term: glossaryConceptTermRecordSchema,
});

export const glossaryConceptTermsResponseSchema = z.object({
  terms: z.array(glossaryConceptTermRecordSchema),
  total: z.number().int().nonnegative(),
});

export type GlossaryIdParams = z.infer<typeof glossaryIdParamsSchema>;
export type GlossaryTermIdParams = z.infer<typeof glossaryTermIdParamsSchema>;
export type GlossaryConceptIdParams = z.infer<typeof glossaryConceptIdParamsSchema>;
export type GlossaryConceptTermIdParams = z.infer<typeof glossaryConceptTermIdParamsSchema>;
export type GlossaryProjectParams = z.infer<typeof glossaryProjectParamsSchema>;
export type ListGlossaryQuery = z.infer<typeof listGlossaryQuerySchema>;
export type CreateGlossaryBody = z.infer<typeof createGlossaryBodySchema>;
export type UpdateGlossaryBody = z.infer<typeof updateGlossaryBodySchema>;
export type CreateGlossaryTermBody = z.infer<typeof createGlossaryTermBodySchema>;
export type UpdateGlossaryTermBody = z.infer<typeof updateGlossaryTermBodySchema>;
export type ImportGlossaryTermsBody = z.infer<typeof importGlossaryTermsBodySchema>;
export type AttachGlossaryProjectBody = z.infer<typeof attachGlossaryProjectBodySchema>;
export type CreateGlossaryConceptBody = z.infer<typeof createGlossaryConceptBodySchema>;
export type UpdateGlossaryConceptBody = z.infer<typeof updateGlossaryConceptBodySchema>;
export type CreateGlossaryConceptTermBody = z.infer<typeof createGlossaryConceptTermBodySchema>;
export type UpsertGlossaryConceptTermBody = z.infer<typeof upsertGlossaryConceptTermBodySchema>;
export type UpdateGlossaryConceptTermBody = z.infer<typeof updateGlossaryConceptTermBodySchema>;
export type GlossaryRecord = z.infer<typeof glossaryRecordSchema>;
export type GlossaryResponse = z.infer<typeof glossaryResponseSchema>;
export type GlossaryTermResponse = z.infer<typeof glossaryTermResponseSchema>;
export type GlossariesResponse = z.infer<typeof glossariesResponseSchema>;
export type GlossaryTermRecord = z.infer<typeof glossaryTermRecordSchema>;
export type GlossaryTermsResponse = z.infer<typeof glossaryTermsResponseSchema>;
export type GlossaryProjectRecord = z.infer<typeof glossaryProjectRecordSchema>;
export type GlossaryProjectsResponse = z.infer<typeof glossaryProjectsResponseSchema>;
export type GlossaryConceptTermRecord = z.infer<typeof glossaryConceptTermRecordSchema>;
export type GlossaryConceptRecord = z.infer<typeof glossaryConceptRecordSchema>;
export type GlossaryConceptResponse = z.infer<typeof glossaryConceptResponseSchema>;
export type GlossaryConceptsResponse = z.infer<typeof glossaryConceptsResponseSchema>;
export type GlossaryConceptTermResponse = z.infer<typeof glossaryConceptTermResponseSchema>;
export type GlossaryConceptTermsResponse = z.infer<typeof glossaryConceptTermsResponseSchema>;
