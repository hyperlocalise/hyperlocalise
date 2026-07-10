import { z } from "zod";

import {
  KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH,
  KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
  normalizeKnowledgeMemoryContent,
} from "@/lib/knowledge-memory/knowledge-memory.shared";

const localeSchema = z.string().trim().min(1).max(32);

export const updateKnowledgeMemoryBodySchema = z.object({
  content: z
    .string()
    .transform(normalizeKnowledgeMemoryContent)
    .pipe(z.string().max(KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH)),
});

export const previewKnowledgeMemoryBodySchema = z.object({
  targetLocale: localeSchema.optional(),
  targetLocales: z.array(localeSchema).min(1).max(20).optional(),
  sourceLocale: localeSchema.optional(),
  sourceText: z.string().trim().max(100_000).optional(),
  context: z.string().max(20_000).optional(),
  key: z.string().trim().max(256).optional(),
  path: z.string().trim().max(1024).optional(),
  metadata: z.record(z.string().max(100), z.string().max(1000)).optional(),
  maxChars: z.coerce
    .number()
    .int()
    .min(256)
    .max(KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH)
    .optional(),
});

export const knowledgeMemoryRecordSchema = z.object({
  content: z.string(),
  updatedAt: z.string().datetime().nullable(),
  updatedByUserId: z.string().nullable(),
});

export const knowledgeMemoryResponseSchema = z.object({
  knowledgeMemory: knowledgeMemoryRecordSchema,
});

export const knowledgeMemoryPreviewSegmentSchema = z.object({
  id: z.string(),
  headingPath: z.array(z.string()),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  preview: z.string(),
});

export const knowledgeMemoryPreviewSchema = z.object({
  compactText: z.string(),
  segments: z.array(knowledgeMemoryPreviewSegmentSchema),
  metrics: z.object({
    selectedMemoryCount: z.number().int().nonnegative(),
    selectedMemoryChars: z.number().int().nonnegative(),
    wholeMemoryChars: z.number().int().nonnegative(),
    reductionPercent: z.number(),
    matchedHeadingPaths: z.array(z.string()),
    fallbackMode: z.enum(["empty", "whole_small", "selective", "general", "fallback", "none"]),
  }),
});

export const knowledgeMemoryPreviewResponseSchema = z.object({
  memoryPreview: knowledgeMemoryPreviewSchema,
});

export type UpdateKnowledgeMemoryBody = z.infer<typeof updateKnowledgeMemoryBodySchema>;
export type PreviewKnowledgeMemoryBody = z.infer<typeof previewKnowledgeMemoryBodySchema>;
export type KnowledgeMemoryRecord = z.infer<typeof knowledgeMemoryRecordSchema>;
export type KnowledgeMemoryResponse = z.infer<typeof knowledgeMemoryResponseSchema>;
export type KnowledgeMemoryPreviewResponse = z.infer<typeof knowledgeMemoryPreviewResponseSchema>;
