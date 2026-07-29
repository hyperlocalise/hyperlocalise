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
export const KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH = 50_000;
export const KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH = 160;
export const KNOWLEDGE_MEMORY_SMALL_CONTENT_MAX_LENGTH = 2_000;
export const KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH = 4_000;
export const KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS = 5;

export function normalizeKnowledgeMemoryContent(content: string) {
  return content.replace(/\s+$/u, "");
}
