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
import { and, eq } from "drizzle-orm";

import { db, schema, type DatabaseClient, type DatabaseTransaction } from "@/lib/database";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { commitVersionedDocument } from "@/lib/versioned-document/commit-versioned-document";
import type { VersionedDocumentCurrentRow } from "@/lib/versioned-document/versioned-document.types";
import { normalizeKnowledgeMemoryContent } from "./knowledge-memory.shared";
import type {
  CurrentKnowledgeMemoryRow,
  KnowledgeMemoryCommitError,
  KnowledgeMemoryCommitResult,
  KnowledgeMemoryRecord,
} from "./knowledge-memory.types";

const emptyKnowledgeMemory: KnowledgeMemoryRecord = {
  revisionId: null,
  version: 0,
  content: "",
  summary: null,
  updatedAt: null,
  updatedByUserId: null,
};

function toKnowledgeMemoryRecord(
  row: CurrentKnowledgeMemoryRow | undefined,
): KnowledgeMemoryRecord {
  if (!row) {
    return emptyKnowledgeMemory;
  }

  return {
    revisionId: row.revisionId,
    version: row.version,
    content: row.content,
    summary: row.summary,
    updatedAt: row.updatedAt.toISOString(),
    updatedByUserId: row.updatedByUserId,
  };
}

async function getCurrentKnowledgeMemoryRow(
  database: DatabaseClient,
  organizationId: string,
): Promise<CurrentKnowledgeMemoryRow | undefined> {
  const [row] = await database
    .select({
      revisionId: schema.knowledgeMemories.revisionId,
      version: schema.knowledgeMemories.version,
      content: schema.knowledgeMemories.content,
      summary: schema.knowledgeMemories.summary,
      updatedAt: schema.knowledgeMemories.updatedAt,
      updatedByUserId: schema.knowledgeMemories.updatedByUserId,
    })
    .from(schema.knowledgeMemories)
    .where(eq(schema.knowledgeMemories.organizationId, organizationId))
    .limit(1);

  return row;
}

export async function getKnowledgeMemoryForOrganization(
  organizationId: string,
): Promise<KnowledgeMemoryRecord> {
  return toKnowledgeMemoryRecord(await getCurrentKnowledgeMemoryRow(db, organizationId));
}

// A function, not a module-level constant: accessing schema.knowledgeMemories.* at import time
// breaks any test that mocks @/lib/database without a full knowledgeMemories shape, even
// transitively (vi.mock hoisting runs before this module's top-level code either way).
function knowledgeMemoryHeadColumns() {
  return {
    revisionId: schema.knowledgeMemories.revisionId,
    version: schema.knowledgeMemories.version,
    content: schema.knowledgeMemories.content,
    summary: schema.knowledgeMemories.summary,
    updatedAt: schema.knowledgeMemories.updatedAt,
    updatedByUserId: schema.knowledgeMemories.updatedByUserId,
  };
}

export async function commitKnowledgeMemoryForOrganization(input: {
  organizationId: string;
  content: string;
  summary?: string;
  // Nullable: agent-authored commits via the save_memory tool have no human actor. Provenance
  // for those goes in `summary` instead (see save_memory.ts).
  updatedByUserId: string | null;
  expectedRevisionId: string | null;
  forceNewRevision?: boolean;
}): Promise<Result<KnowledgeMemoryCommitResult, KnowledgeMemoryCommitError>> {
  const result = await commitVersionedDocument({
    db,
    content: input.content,
    normalizeContent: normalizeKnowledgeMemoryContent,
    summary: input.summary,
    initialSummaryFallback: "Initial version",
    updatedSummaryFallback: "Updated memory",
    updatedByUserId: input.updatedByUserId,
    expectedRevisionId: input.expectedRevisionId,
    forceNewRevision: input.forceNewRevision,
    emptyRecord: emptyKnowledgeMemory,
    readCurrent: (tx: DatabaseTransaction) =>
      getCurrentKnowledgeMemoryRow(tx, input.organizationId),
    insertHead: async (
      tx: DatabaseTransaction,
      values,
    ): Promise<VersionedDocumentCurrentRow | undefined> => {
      const [inserted] = await tx
        .insert(schema.knowledgeMemories)
        .values({
          organizationId: input.organizationId,
          revisionId: values.revisionId,
          version: values.version,
          content: values.content,
          summary: values.summary,
          updatedByUserId: values.updatedByUserId,
          createdAt: values.now,
          updatedAt: values.now,
        })
        .onConflictDoNothing({ target: schema.knowledgeMemories.organizationId })
        .returning(knowledgeMemoryHeadColumns());
      return inserted;
    },
    updateHead: async (
      tx: DatabaseTransaction,
      expectedRevisionId,
      values,
    ): Promise<VersionedDocumentCurrentRow | undefined> => {
      const [updated] = await tx
        .update(schema.knowledgeMemories)
        .set({
          revisionId: values.revisionId,
          version: values.version,
          content: values.content,
          summary: values.summary,
          updatedByUserId: values.updatedByUserId,
          updatedAt: values.now,
        })
        .where(
          and(
            eq(schema.knowledgeMemories.organizationId, input.organizationId),
            eq(schema.knowledgeMemories.revisionId, expectedRevisionId),
          ),
        )
        .returning(knowledgeMemoryHeadColumns());
      return updated;
    },
    archivePrevious: async (tx: DatabaseTransaction, previous) => {
      await tx.insert(schema.knowledgeMemoryRevisions).values({
        id: previous.revisionId,
        organizationId: input.organizationId,
        version: previous.version,
        content: previous.content,
        summary: previous.summary,
        createdByUserId: previous.updatedByUserId,
        createdAt: previous.updatedAt,
      });
    },
  });

  if (isErr(result)) {
    return err(result.error);
  }

  return ok({ knowledgeMemory: result.value.record, changed: result.value.changed });
}
