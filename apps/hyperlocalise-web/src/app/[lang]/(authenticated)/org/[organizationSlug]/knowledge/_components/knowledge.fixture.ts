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
import type { KnowledgeMemoryRecord } from "@/api/routes/knowledge-memory/knowledge-memory.schema";
import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";

import type { KnowledgeMemoryEditorViewProps } from "./knowledge-memory-editor-view";

export const knowledgeMemoryFixture: KnowledgeMemoryRecord = {
  revisionId: "11111111-1111-4111-8111-111111111111",
  version: 3,
  content: `## Tone
- Keep product copy practical and direct.
- Keep Hyperlocalise untranslated.

## Glossary notes
- Prefer "workspace" over "organization" in product UI.
`,
  summary: "Clarify tone and glossary notes",
  updatedAt: "2026-07-20T10:15:00.000Z",
  updatedByUserId: "user_fixture",
};

export function createKnowledgeEditorViewFixture(
  overrides: Partial<KnowledgeMemoryEditorViewProps> = {},
): KnowledgeMemoryEditorViewProps {
  const content = overrides.content ?? knowledgeMemoryFixture.content;

  return {
    content,
    onContentChange: () => undefined,
    summary: "",
    onSummaryChange: () => undefined,
    savedKnowledgeMemory: knowledgeMemoryFixture,
    characterCount: content.length,
    characterLimit: KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH,
    isOverLimit: content.length > KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH,
    hasChanges: false,
    canSave: false,
    canUpdateKnowledgeMemory: true,
    isLoading: false,
    isSaving: false,
    onOpenHistory: () => undefined,
    onSubmit: async () => undefined,
    ...overrides,
  };
}
