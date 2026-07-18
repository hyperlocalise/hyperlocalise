import {
  knowledgeMemoryRecordSchema,
  type KnowledgeMemoryRecord,
} from "@/api/routes/knowledge-memory/knowledge-memory.schema";
import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";

export function parseKnowledgeMemoryPreconditionFailure(
  body: unknown,
): KnowledgeMemoryRecord | null {
  if (
    typeof body !== "object" ||
    body === null ||
    !("details" in body) ||
    typeof body.details !== "object" ||
    body.details === null ||
    !("knowledgeMemory" in body.details)
  ) {
    return null;
  }

  const result = knowledgeMemoryRecordSchema.safeParse(body.details.knowledgeMemory);
  return result.success ? result.data : null;
}

export function getKnowledgeMemoryEditorState(input: {
  content: string;
  savedContent: string;
  canUpdateKnowledgeMemory: boolean;
  isSaving: boolean;
}) {
  const characterCount = input.content.length;
  const isOverLimit = characterCount > KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH;
  const hasChanges = input.content !== input.savedContent;

  return {
    characterCount,
    characterLimit: KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH,
    isOverLimit,
    hasChanges,
    canSave: input.canUpdateKnowledgeMemory && hasChanges && !isOverLimit && !input.isSaving,
  };
}

export function shouldApplyKnowledgeMemoryRefresh(input: {
  content: string;
  savedContent: string;
}) {
  return input.content === input.savedContent;
}
