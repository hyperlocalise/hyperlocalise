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
import { and, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { db, schema } from "@/lib/database/client";
import {
  ensureDefaultNativeProjectMemoryForProject,
  listAttachedProjectMemoryIds,
} from "@/lib/memory/ensure-default-native-project-memory";
import { incrementMemoryEntryVersionSql } from "@/lib/memory/memory-entry-lifecycle";
import type { AgentRunTranslationMemoryMatchUsage } from "@/lib/providers/contracts/translation-memory-match";
import {
  normalizeSyncedDatabaseTranslationMemoryMatch,
  toAgentRunTranslationMemoryMatchUsage,
} from "@/lib/providers/contracts/translation-memory-match";
import { listHiddenProjectTranslationKeysForSourcePath } from "@/lib/projects/translations/project-translation-service";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

export type FileTranslationMemoryReuseResult = {
  prefilled: Record<string, string>;
  matchesByKey: Record<string, AgentRunTranslationMemoryMatchUsage[]>;
};

const emptyFileTranslationMemoryReuseResult = (): FileTranslationMemoryReuseResult => ({
  prefilled: {},
  matchesByKey: {},
});

function sourceTextHash(sourceText: string) {
  return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

export class FileTranslationMemoryStore {
  async reuseEntries(input: {
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
      }))
      .filter((unit) => unit.sourceText.trim().length > 0);
    if (units.length === 0) {
      return emptyFileTranslationMemoryReuseResult();
    }

    const memoryIds = await listAttachedProjectMemoryIds(input.projectId);
    if (memoryIds.length === 0) {
      return emptyFileTranslationMemoryReuseResult();
    }

    const normalizedSourceTexts = [...new Set(units.map((unit) => unit.normalizedSourceText))];
    const rows: Array<{
      id: string;
      memoryId: string;
      sourceText: string;
      normalizedSourceText: string;
      sourceLocale: string;
      targetLocale: string;
      targetText: string;
      provenance: string;
      matchScore: number;
      externalKey: string | null;
      metadata: Record<string, unknown>;
      memoryName: string;
      externalProviderKind: typeof schema.memories.$inferSelect.externalProviderKind;
      externalMemoryId: string | null;
    }> = [];
    const MEMORY_LOOKUP_BATCH_SIZE = 500;
    for (
      let offset = 0;
      offset < normalizedSourceTexts.length;
      offset += MEMORY_LOOKUP_BATCH_SIZE
    ) {
      const batch = await db
        .select({
          id: schema.memoryEntries.id,
          memoryId: schema.memoryEntries.memoryId,
          sourceText: schema.memoryEntries.sourceText,
          normalizedSourceText: schema.memoryEntries.normalizedSourceText,
          sourceLocale: schema.memoryEntries.sourceLocale,
          targetLocale: schema.memoryEntries.targetLocale,
          targetText: schema.memoryEntries.targetText,
          provenance: schema.memoryEntries.provenance,
          matchScore: schema.memoryEntries.matchScore,
          externalKey: schema.memoryEntries.externalKey,
          metadata: schema.memoryEntries.metadata,
          memoryName: schema.memories.name,
          externalProviderKind: schema.memories.externalProviderKind,
          externalMemoryId: schema.memories.externalMemoryId,
        })
        .from(schema.memoryEntries)
        .innerJoin(schema.memories, eq(schema.memoryEntries.memoryId, schema.memories.id))
        .where(
          and(
            eq(schema.memoryEntries.sourceLocale, input.sourceLocale),
            eq(schema.memoryEntries.targetLocale, input.targetLocale),
            eq(schema.memoryEntries.reviewStatus, "approved"),
            inArray(schema.memoryEntries.memoryId, memoryIds),
            inArray(
              schema.memoryEntries.normalizedSourceText,
              normalizedSourceTexts.slice(offset, offset + MEMORY_LOOKUP_BATCH_SIZE),
            ),
          ),
        );

      rows.push(...batch);
    }

    // Exact approved text remains reusable when a key was renamed or the TM
    // came from an import without file-job metadata. Keep raw source equality
    // so normalization cannot erase placeholder/case differences.
    const reusableByUnit = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!row.targetText?.trim()) continue;
      reusableByUnit.set([row.memoryId, row.sourceText, row.targetLocale].join("\0"), row);
    }

    const prefilled: Record<string, string> = {};
    const matchesByKey: Record<string, AgentRunTranslationMemoryMatchUsage[]> = {};
    for (const unit of units) {
      for (const memoryId of memoryIds) {
        const row = reusableByUnit.get([memoryId, unit.sourceText, input.targetLocale].join("\0"));
        if (!row) {
          continue;
        }

        prefilled[unit.key] = row.targetText;
        matchesByKey[unit.key] = [
          toAgentRunTranslationMemoryMatchUsage(
            normalizeSyncedDatabaseTranslationMemoryMatch({
              id: row.id,
              memoryId: row.memoryId,
              memoryName: row.memoryName,
              sourceText: row.sourceText,
              targetText: row.targetText,
              sourceLocale: row.sourceLocale,
              targetLocale: row.targetLocale,
              matchScore: row.matchScore,
              provenance: row.provenance,
              rank: 1,
              providerKind: row.externalProviderKind,
              externalResourceId: row.externalMemoryId,
              externalSegmentId: row.externalKey,
            }),
          ),
        ];
        break;
      }
    }

    return { prefilled, matchesByKey };
  }

  async persistEntries(input: {
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
      .map(([key, sourceText]) => ({
        key,
        sourceText,
        targetText: input.targetEntries[key] ?? "",
      }))
      .filter((unit) => unit.sourceText.trim().length > 0 && unit.targetText.trim().length > 0);
    if (units.length === 0) {
      return;
    }

    const hiddenKeys = new Set(
      await listHiddenProjectTranslationKeysForSourcePath({
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        keys: units.map((unit) => unit.key),
      }),
    );
    const persistableUnits = units.filter((unit) => !hiddenKeys.has(unit.key));
    if (persistableUnits.length === 0) {
      return;
    }

    let memoryIds = await listAttachedProjectMemoryIds(input.projectId);
    if (memoryIds.length === 0) {
      memoryIds = await ensureDefaultNativeProjectMemoryForProject(input.projectId);
    }
    if (memoryIds.length === 0) {
      return;
    }

    const valueByConflictKey = new Map<string, typeof schema.memoryEntries.$inferInsert>();
    for (const unit of persistableUnits) {
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

    await db
      .insert(schema.memoryEntries)
      .values([...valueByConflictKey.values()])
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
          version: incrementMemoryEntryVersionSql(),
          updatedAt: sql`now()`,
        },
      });
  }
}

const defaultFileMemoryStore = new FileTranslationMemoryStore();

export async function reuseFileTranslationMemoryEntries(
  input: Parameters<FileTranslationMemoryStore["reuseEntries"]>[0],
) {
  return defaultFileMemoryStore.reuseEntries(input);
}

export async function persistFileTranslationMemoryEntries(
  input: Parameters<FileTranslationMemoryStore["persistEntries"]>[0],
) {
  return defaultFileMemoryStore.persistEntries(input);
}
