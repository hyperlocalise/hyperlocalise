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
import { describe, expect, it } from "vite-plus/test";

import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";

import {
  getKnowledgeMemoryEditorState,
  parseKnowledgeMemoryPreconditionFailure,
  shouldApplyKnowledgeMemoryRefresh,
} from "./knowledge-memory-editor-state";

const knowledgeMemory = {
  revisionId: "11111111-1111-4111-8111-111111111111",
  version: 2,
  content: "Use sentence case.",
  summary: "Clarify voice",
  updatedAt: "2026-07-18T06:00:00.000Z",
  updatedByUserId: "user-1",
};

describe("parseKnowledgeMemoryPreconditionFailure", () => {
  it("returns the latest Knowledge Memory from a valid conflict response", () => {
    expect(
      parseKnowledgeMemoryPreconditionFailure({
        details: { knowledgeMemory },
      }),
    ).toEqual(knowledgeMemory);
  });

  it("rejects missing or malformed conflict details", () => {
    expect(parseKnowledgeMemoryPreconditionFailure({})).toBeNull();
    expect(
      parseKnowledgeMemoryPreconditionFailure({
        details: { knowledgeMemory: { ...knowledgeMemory, version: "2" } },
      }),
    ).toBeNull();
  });
});

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

  it("does not replace an unsaved draft during a background refresh", () => {
    expect(
      shouldApplyKnowledgeMemoryRefresh({
        content: "Unsaved local guidance",
        savedContent: "Previously loaded guidance",
      }),
    ).toBe(false);
    expect(
      shouldApplyKnowledgeMemoryRefresh({
        content: "Previously loaded guidance",
        savedContent: "Previously loaded guidance",
      }),
    ).toBe(true);
  });
});
