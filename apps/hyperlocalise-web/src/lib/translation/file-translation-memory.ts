import { and, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { db, schema } from "@/lib/database";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

function sourceTextHash(sourceText: string) {
  return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

export async function reuseFileTranslationMemoryEntries(input: {
  projectId: string;
  sourceLocale: string;
  targetLocale: string;
  sourceEntries: Record<string, string>;
}) {
  const units = Object.entries(input.sourceEntries)
    .map(([key, sourceText]) => ({
      key,
      sourceText,
      normalizedSourceText: normalizeTranslationMemorySourceText(sourceText),
      sourceTextHash: sourceTextHash(sourceText),
    }))
    .filter((unit) => unit.sourceText.trim().length > 0);
  if (units.length === 0) return {} as Record<string, string>;

  const attached = await db
    .select({ memoryId: schema.projectMemories.memoryId })
    .from(schema.projectMemories)
    .where(eq(schema.projectMemories.projectId, input.projectId));
  const memoryIds = attached.map((x) => x.memoryId);
  if (memoryIds.length === 0) return {} as Record<string, string>;

  const rows = await db
    .select({
      memoryId: schema.memoryEntries.memoryId,
      normalizedSourceText: schema.memoryEntries.normalizedSourceText,
      targetText: schema.memoryEntries.targetText,
      metadata: schema.memoryEntries.metadata,
    })
    .from(schema.memoryEntries)
    .where(
      and(
        eq(schema.memoryEntries.sourceLocale, input.sourceLocale),
        inArray(schema.memoryEntries.memoryId, memoryIds),
      ),
    );

  const reusable: Record<string, string> = {};
  for (const unit of units) {
    const match = rows.find((row) => {
      if (!memoryIds.includes(row.memoryId)) return false;
      if (row.normalizedSourceText !== unit.normalizedSourceText) return false;
      const metadata = row.metadata as {
        segmentKey?: string;
        sourceTextHash?: string;
        targetLocale?: string;
      } | null;
      return (
        metadata?.segmentKey === unit.key &&
        metadata?.sourceTextHash === unit.sourceTextHash &&
        metadata?.targetLocale === input.targetLocale
      );
    });
    if (match?.targetText?.trim()) {
      reusable[unit.key] = match.targetText;
    }
  }

  return reusable;
}

export async function persistFileTranslationMemoryEntries(input: {
  projectId: string;
  jobId: string;
  sourceLocale: string;
  targetLocale: string;
  sourcePath: string;
  sourceFileHash: string;
  sourceEntries: Record<string, string>;
  targetEntries: Record<string, string>;
}) {
  const units = Object.entries(input.sourceEntries)
    .map(([key, sourceText]) => ({ key, sourceText, targetText: input.targetEntries[key] ?? "" }))
    .filter((unit) => unit.sourceText.trim().length > 0 && unit.targetText.trim().length > 0);
  if (units.length === 0) {
    return;
  }

  const attached = await db
    .select({ memoryId: schema.projectMemories.memoryId })
    .from(schema.projectMemories)
    .where(eq(schema.projectMemories.projectId, input.projectId));
  const memoryIds = attached.map((x) => x.memoryId);
  if (memoryIds.length === 0) return;

  const valueByConflictKey = new Map<string, typeof schema.memoryEntries.$inferInsert>();
  for (const unit of units) {
    const normalized = normalizeTranslationMemorySourceText(unit.sourceText);
    for (const memoryId of memoryIds) {
      valueByConflictKey.set(
        `${memoryId}:${input.sourceLocale}:${input.targetLocale}:${normalized}`,
        {
          memoryId,
          sourceLocale: input.sourceLocale,
          targetLocale: input.targetLocale,
          sourceText: unit.sourceText,
          normalizedSourceText: normalized,
          targetText: unit.targetText,
          provenance: "file_job",
          externalKey: `${input.jobId}:${input.targetLocale}:${unit.key}`,
          metadata: {
            projectId: input.projectId,
            sourcePath: input.sourcePath,
            sourceFileHash: input.sourceFileHash,
            jobId: input.jobId,
            segmentKey: unit.key,
            sourceTextHash: sourceTextHash(unit.sourceText),
            targetLocale: input.targetLocale,
          },
        },
      );
    }
  }
  const values = [...valueByConflictKey.values()];

  await db
    .insert(schema.memoryEntries)
    .values(values)
    .onConflictDoUpdate({
      target: [
        schema.memoryEntries.memoryId,
        schema.memoryEntries.sourceLocale,
        schema.memoryEntries.targetLocale,
        schema.memoryEntries.normalizedSourceText,
      ],
      set: {
        targetText: sql`excluded.target_text`,
        provenance: sql`excluded.provenance`,
        externalKey: sql`excluded.external_key`,
        metadata: sql`excluded.metadata`,
        updatedAt: sql`now()`,
      },
    });
}
