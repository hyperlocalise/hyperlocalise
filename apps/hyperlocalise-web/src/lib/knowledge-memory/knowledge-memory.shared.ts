export const KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH = 50_000;
export const KNOWLEDGE_MEMORY_SMALL_CONTENT_MAX_LENGTH = 2_000;
export const KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH = 4_000;
export const KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS = 5;

export function normalizeKnowledgeMemoryContent(content: string) {
  return content.replace(/\s+$/u, "");
}
