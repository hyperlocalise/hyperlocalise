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
