/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";

import { getKnowledgeMemoryEditorState } from "./knowledge-memory-editor-state";

describe("getKnowledgeMemoryEditorState", () => {
  it("tracks the character counter and allows saving changed content", () => {
    expect(
      getKnowledgeMemoryEditorState({
        content: "Use sentence case.",
        savedContent: "",
        canUpdateKnowledgeMemory: true,
        isSaving: false,
      }),
    ).toMatchObject({
      characterCount: 18,
      characterLimit: KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH,
      isOverLimit: false,
      hasChanges: true,
      canSave: true,
    });
  });

  it("blocks saving when content is over the limit", () => {
    expect(
      getKnowledgeMemoryEditorState({
        content: "a".repeat(KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH + 1),
        savedContent: "",
        canUpdateKnowledgeMemory: true,
        isSaving: false,
      }),
    ).toMatchObject({
      isOverLimit: true,
      canSave: false,
    });
  });
});
