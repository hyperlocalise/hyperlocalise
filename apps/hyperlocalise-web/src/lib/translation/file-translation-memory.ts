import { eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

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
