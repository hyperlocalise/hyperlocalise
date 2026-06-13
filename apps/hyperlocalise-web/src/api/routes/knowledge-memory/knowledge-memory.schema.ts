import { z } from "zod";

import {
  KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH,
  normalizeKnowledgeMemoryContent,
} from "@/lib/knowledge-memory/knowledge-memory.shared";

export const updateKnowledgeMemoryBodySchema = z.object({
  content: z
    .string()
    .transform(normalizeKnowledgeMemoryContent)
    .pipe(z.string().max(KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH)),
});

export const knowledgeMemoryRecordSchema = z.object({
  content: z.string(),
  updatedAt: z.string().datetime().nullable(),
  updatedByUserId: z.string().nullable(),
});

export const knowledgeMemoryResponseSchema = z.object({
  knowledgeMemory: knowledgeMemoryRecordSchema,
});

export type UpdateKnowledgeMemoryBody = z.infer<typeof updateKnowledgeMemoryBodySchema>;
export type KnowledgeMemoryRecord = z.infer<typeof knowledgeMemoryRecordSchema>;
export type KnowledgeMemoryResponse = z.infer<typeof knowledgeMemoryResponseSchema>;
