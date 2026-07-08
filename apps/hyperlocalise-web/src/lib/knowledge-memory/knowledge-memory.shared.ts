export const KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH = 8000;

export function normalizeKnowledgeMemoryContent(content: string) {
  return content.replace(/\s+$/u, "");
}
