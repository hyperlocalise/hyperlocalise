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

import { knowledgeMemoryQueryKey } from "./knowledge-memory-api";

export { knowledgeMemoryQueryKey };

/** Read-only preview caches (e.g. CAT guideline sheet) must not share keys with the editor query. */
export function knowledgeMemoryPreviewQueryKey(organizationSlug: string, projectId?: string) {
  return projectId
    ? (["knowledge-memory-preview", organizationSlug, projectId] as const)
    : (["knowledge-memory-preview", organizationSlug] as const);
}

export type LoadedKnowledgeMemory = {
  knowledgeMemory: KnowledgeMemoryRecord;
  etag: string;
};
