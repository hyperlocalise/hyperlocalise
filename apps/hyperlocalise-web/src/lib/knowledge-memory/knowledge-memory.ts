import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database";
import { err, ok, type Result } from "@/lib/primitives/result/results";
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

function normalizeSummary(summary: string | undefined, fallback: string) {
  return summary?.trim() || fallback;
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

export async function commitKnowledgeMemoryForOrganization(input: {
  organizationId: string;
  content: string;
  summary?: string;
  updatedByUserId: string;
  expectedRevisionId: string | null;
  forceNewRevision?: boolean;
}): Promise<Result<KnowledgeMemoryCommitResult, KnowledgeMemoryCommitError>> {
  const content = normalizeKnowledgeMemoryContent(input.content);

  return db.transaction(async (tx) => {
    const current = await getCurrentKnowledgeMemoryRow(tx, input.organizationId);

    if (!current) {
      if (input.expectedRevisionId !== null) {
        return err({ code: "precondition_failed", current: emptyKnowledgeMemory });
      }

      if (content === "") {
        return ok({ knowledgeMemory: emptyKnowledgeMemory, changed: false });
      }

      const now = new Date();
      const [inserted] = await tx
        .insert(schema.knowledgeMemories)
        .values({
          organizationId: input.organizationId,
          revisionId: randomUUID(),
          version: 1,
          content,
          summary: normalizeSummary(input.summary, "Initial version"),
          updatedByUserId: input.updatedByUserId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: schema.knowledgeMemories.organizationId })
        .returning({
          revisionId: schema.knowledgeMemories.revisionId,
          version: schema.knowledgeMemories.version,
          content: schema.knowledgeMemories.content,
          summary: schema.knowledgeMemories.summary,
          updatedAt: schema.knowledgeMemories.updatedAt,
          updatedByUserId: schema.knowledgeMemories.updatedByUserId,
        });

      if (!inserted) {
        const latest = await getCurrentKnowledgeMemoryRow(tx, input.organizationId);
        return err({ code: "precondition_failed", current: toKnowledgeMemoryRecord(latest) });
      }

      return ok({ knowledgeMemory: toKnowledgeMemoryRecord(inserted), changed: true });
    }

    if (current.revisionId !== input.expectedRevisionId) {
      return err({ code: "precondition_failed", current: toKnowledgeMemoryRecord(current) });
    }

    if (current.content === content && input.forceNewRevision !== true) {
      return ok({ knowledgeMemory: toKnowledgeMemoryRecord(current), changed: false });
    }

    const now = new Date();
    const [updated] = await tx
      .update(schema.knowledgeMemories)
      .set({
        revisionId: randomUUID(),
        version: current.version + 1,
        content,
        summary: normalizeSummary(input.summary, "Updated memory"),
        updatedByUserId: input.updatedByUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.knowledgeMemories.organizationId, input.organizationId),
          eq(schema.knowledgeMemories.revisionId, input.expectedRevisionId),
        ),
      )
      .returning({
        revisionId: schema.knowledgeMemories.revisionId,
        version: schema.knowledgeMemories.version,
        content: schema.knowledgeMemories.content,
        summary: schema.knowledgeMemories.summary,
        updatedAt: schema.knowledgeMemories.updatedAt,
        updatedByUserId: schema.knowledgeMemories.updatedByUserId,
      });

    if (!updated) {
      const latest = await getCurrentKnowledgeMemoryRow(tx, input.organizationId);
      return err({ code: "precondition_failed", current: toKnowledgeMemoryRecord(latest) });
    }

    await tx.insert(schema.knowledgeMemoryRevisions).values({
      id: current.revisionId,
      organizationId: input.organizationId,
      version: current.version,
      content: current.content,
      summary: current.summary,
      createdByUserId: current.updatedByUserId,
      createdAt: current.updatedAt,
    });

    return ok({ knowledgeMemory: toKnowledgeMemoryRecord(updated), changed: true });
  });
}
