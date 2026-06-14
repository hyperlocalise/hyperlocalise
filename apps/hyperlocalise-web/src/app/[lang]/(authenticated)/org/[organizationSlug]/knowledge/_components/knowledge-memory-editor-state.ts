import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";

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
