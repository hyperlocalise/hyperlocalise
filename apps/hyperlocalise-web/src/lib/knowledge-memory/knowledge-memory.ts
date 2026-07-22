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
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { normalizeKnowledgeMemoryContent } from "./knowledge-memory.shared";

export type KnowledgeMemoryRecord = {
  content: string;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export async function getKnowledgeMemoryForOrganization(
  organizationId: string,
): Promise<KnowledgeMemoryRecord> {
  const [row] = await db
    .select({
      content: schema.knowledgeMemories.content,
      updatedAt: schema.knowledgeMemories.updatedAt,
      updatedByUserId: schema.knowledgeMemories.updatedByUserId,
    })
    .from(schema.knowledgeMemories)
    .where(eq(schema.knowledgeMemories.organizationId, organizationId))
    .limit(1);

  return {
    content: row?.content ?? "",
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedByUserId: row?.updatedByUserId ?? null,
  };
}

export async function upsertKnowledgeMemoryForOrganization(input: {
  organizationId: string;
  content: string;
  updatedByUserId: string;
}): Promise<KnowledgeMemoryRecord> {
  const content = normalizeKnowledgeMemoryContent(input.content);
  const now = new Date();
  const [row] = await db
    .insert(schema.knowledgeMemories)
    .values({
      organizationId: input.organizationId,
      content,
      updatedByUserId: input.updatedByUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.knowledgeMemories.organizationId,
      set: {
        content,
        updatedByUserId: input.updatedByUserId,
        updatedAt: now,
      },
    })
    .returning({
      content: schema.knowledgeMemories.content,
      updatedAt: schema.knowledgeMemories.updatedAt,
      updatedByUserId: schema.knowledgeMemories.updatedByUserId,
    });

  return {
    content: row?.content ?? content,
    updatedAt: row?.updatedAt.toISOString() ?? now.toISOString(),
    updatedByUserId: row?.updatedByUserId ?? input.updatedByUserId,
  };
}
