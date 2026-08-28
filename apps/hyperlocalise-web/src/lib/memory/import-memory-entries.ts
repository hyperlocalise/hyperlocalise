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
import { and, eq, inArray } from "drizzle-orm";

import { parseCsvRows } from "@/lib/csv/parse-csv-rows";
import { db, schema } from "@/lib/database";
import type { Memory } from "@/lib/database/types";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr, ok, type Result } from "@/lib/primitives/result/results";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

import {
  TMX_DEFAULT_BATCH_SIZE,
  TMX_DEFAULT_MAX_UNITS,
  TMX_LOOKUP_BATCH_SIZE,
  TMX_LOOKUP_CONCURRENCY,
  TMX_MAX_PREVIEW_ENTRIES,
  TMX_MAX_RESPONSE_ENTRIES,
} from "./tmx/tmx-constants";
import { parseTmxDocument } from "./tmx/parse-tmx";
import {
  documentToImportCandidates,
  emptyImportReport,
  finalizeImportReport,
} from "./tmx/tmx-import";
import type {
  MemoryImportCandidate,
  MemoryImportPreviewEntry,
  MemoryImportReport,
  TmxFatalError,
  TmxIssue,
} from "./tmx/tmx-types";

type MemoryEntryRow = typeof schema.memoryEntries.$inferSelect;
type MemoryEntryInsert = typeof schema.memoryEntries.$inferInsert;

function importedReviewStatus(candidate: MemoryImportCandidate) {
  return typeof candidate.metadata.reviewStatus === "string"
    ? candidate.metadata.reviewStatus
    : undefined;
}

export type ParsedMemoryImport = {
  format: "csv" | "tmx";
  candidates: MemoryImportCandidate[];
  issues: TmxIssue[];
  totalRead: number;
  headerSrclang?: string;
};

function chunk<T>(items: readonly T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function sourceKey(sourceLocale: string, targetLocale: string, sourceText: string) {
  return `${sourceLocale}\u0000${targetLocale}\u0000${normalizeTranslationMemorySourceText(sourceText)}`;
}

function parseCsvImport(content: string): ParsedMemoryImport {
  const rows = parseCsvRows(content);
  const [first, ...rest] = rows;
  const hasHeader = first?.some((cell) => /source|target|locale|text/i.test(cell)) ?? false;
  const dataRows = hasHeader ? rest : rows;
  const issues: TmxIssue[] = [];
  const candidates: MemoryImportCandidate[] = [];

  dataRows.forEach((row, index) => {
    const unitIndex = index + 1;
    const [sourceLocale, targetLocale, sourceText, targetText, score] = row;
    if (!sourceLocale || !targetLocale || !sourceText || !targetText) {
      issues.push({
        severity: "error",
        code: "invalid_csv_row",
        message: "Row is missing a source locale, target locale, source text, or target text",
        unitIndex,
      });
      return;
    }
    const rawScore = score ? Number.parseInt(score, 10) : 100;
    const matchScore = Number.isFinite(rawScore) ? Math.min(100, Math.max(0, rawScore)) : 100;
    candidates.push({
      sourceLocale: sourceLocale.trim(),
      targetLocale: targetLocale.trim(),
      sourceText,
      targetText,
      matchScore,
      externalKey: null,
      metadata: {},
      unitIndex,
      isVariant: false,
    });
  });

  return {
    format: "csv",
    candidates,
    issues,
    totalRead: dataRows.length,
  };
}

export function parseMemoryImportContent(payload: {
  format: "csv" | "tmx";
  content: string;
  maxUnits?: number;
}): Result<ParsedMemoryImport, TmxFatalError> {
  if (payload.format === "csv") {
    return ok(parseCsvImport(payload.content));
  }

  const parsed = parseTmxDocument(payload.content, {
    maxUnits: payload.maxUnits ?? TMX_DEFAULT_MAX_UNITS,
  });
  if (isErr(parsed)) {
    return parsed;
  }

  const mapped = documentToImportCandidates(parsed.value);
  return ok({
    format: "tmx",
    candidates: mapped.candidates,
    issues: mapped.issues,
    totalRead: parsed.value.totalUnits,
    headerSrclang: parsed.value.header.srclang,
  });
}

type PlannedAction = {
  candidate: MemoryImportCandidate;
  action: "create" | "update" | "variant" | "skip";
  existingId?: string;
};

function planImportActions(
  candidates: MemoryImportCandidate[],
  existingByExternalKey: Map<string, MemoryEntryRow>,
  existingBySourceKey: Map<string, MemoryEntryRow>,
): PlannedAction[] {
  const planned: PlannedAction[] = [];
  const reservedExternal = new Set(existingByExternalKey.keys());
  const reservedSource = new Set(existingBySourceKey.keys());

  for (const candidate of candidates) {
    const nextSourceKey = sourceKey(
      candidate.sourceLocale,
      candidate.targetLocale,
      candidate.sourceText,
    );
    if (candidate.externalKey && reservedExternal.has(candidate.externalKey)) {
      const existing = existingByExternalKey.get(candidate.externalKey);
      planned.push({ candidate, action: "update", existingId: existing?.id });
      reservedSource.add(nextSourceKey);
      continue;
    }
    if (reservedSource.has(nextSourceKey)) {
      const existing = existingBySourceKey.get(nextSourceKey);
      if (candidate.externalKey && existing && !existing.externalKey) {
        planned.push({ candidate, action: "update", existingId: existing.id });
        reservedExternal.add(candidate.externalKey);
        continue;
      }
      planned.push({ candidate, action: "skip" });
      continue;
    }
    reservedSource.add(nextSourceKey);
    if (candidate.externalKey) {
      reservedExternal.add(candidate.externalKey);
    }
    planned.push({
      candidate,
      action: candidate.isVariant ? "variant" : "create",
    });
  }

  return planned;
}

async function loadExistingEntries(memoryId: string, candidates: MemoryImportCandidate[]) {
  const existingByExternalKey = new Map<string, MemoryEntryRow>();
  const existingBySourceKey = new Map<string, MemoryEntryRow>();
  const externalKeys = [
    ...new Set(
      candidates
        .map((candidate) => candidate.externalKey)
        .filter((key): key is string => Boolean(key)),
    ),
  ];

  await mapWithConcurrency(
    chunk(externalKeys, TMX_LOOKUP_BATCH_SIZE),
    TMX_LOOKUP_CONCURRENCY,
    async (keys) => {
      const rows = await db
        .select()
        .from(schema.memoryEntries)
        .where(
          and(
            eq(schema.memoryEntries.memoryId, memoryId),
            inArray(schema.memoryEntries.externalKey, keys),
          ),
        );
      for (const row of rows) {
        if (row.externalKey) {
          existingByExternalKey.set(row.externalKey, row);
        }
      }
    },
  );

  const unresolvedCandidates = candidates.filter(
    (candidate) => !candidate.externalKey || !existingByExternalKey.has(candidate.externalKey),
  );

  await mapWithConcurrency(
    chunk(unresolvedCandidates, TMX_LOOKUP_BATCH_SIZE),
    TMX_LOOKUP_CONCURRENCY,
    async (batch) => {
      const localePairs = batch.map((candidate) => ({
        sourceLocale: candidate.sourceLocale,
        targetLocale: candidate.targetLocale,
        normalizedSourceText: normalizeTranslationMemorySourceText(candidate.sourceText),
      }));
      const sourceLocales = [...new Set(localePairs.map((pair) => pair.sourceLocale))];
      const targetLocales = [...new Set(localePairs.map((pair) => pair.targetLocale))];
      const normalized = [...new Set(localePairs.map((pair) => pair.normalizedSourceText))];
      if (sourceLocales.length === 0) {
        return;
      }
      const rows = await db
        .select()
        .from(schema.memoryEntries)
        .where(
          and(
            eq(schema.memoryEntries.memoryId, memoryId),
            inArray(schema.memoryEntries.sourceLocale, sourceLocales),
            inArray(schema.memoryEntries.targetLocale, targetLocales),
            inArray(schema.memoryEntries.normalizedSourceText, normalized),
          ),
        );
      const wanted = new Set(
        localePairs.map(
          (pair) =>
            `${pair.sourceLocale}\u0000${pair.targetLocale}\u0000${pair.normalizedSourceText}`,
        ),
      );
      for (const row of rows) {
        const key = `${row.sourceLocale}\u0000${row.targetLocale}\u0000${row.normalizedSourceText}`;
        if (wanted.has(key)) {
          existingBySourceKey.set(key, row);
        }
      }
    },
  );

  return { existingByExternalKey, existingBySourceKey };
}

function toInsertValues(
  memory: Memory,
  candidate: MemoryImportCandidate,
  options: { createdByUserId?: string; importBatchId?: string },
): MemoryEntryInsert {
  const reviewStatus = importedReviewStatus(candidate) ?? "approved";
  return {
    memoryId: memory.id,
    sourceLocale: candidate.sourceLocale,
    targetLocale: candidate.targetLocale,
    sourceText: candidate.sourceText,
    normalizedSourceText: normalizeTranslationMemorySourceText(candidate.sourceText),
    targetText: candidate.targetText,
    matchScore: candidate.matchScore,
    provenance: "import",
    reviewStatus,
    externalKey: candidate.externalKey,
    createdByUserId: options.createdByUserId,
    importBatchId: options.importBatchId,
    metadata: candidate.metadata,
  };
}

export type AppliedMemoryImport = {
  report: MemoryImportReport;
  preview: MemoryImportPreviewEntry[];
  createdEntries: MemoryEntryRow[];
  importBatchId: string | null;
};

export async function applyMemoryImport(input: {
  memory: Memory;
  parsed: ParsedMemoryImport;
  dryRun?: boolean;
  createdByUserId?: string;
  importBatchId?: string;
}): Promise<AppliedMemoryImport> {
  const { existingByExternalKey, existingBySourceKey } = await loadExistingEntries(
    input.memory.id,
    input.parsed.candidates,
  );
  const planned = planImportActions(
    input.parsed.candidates,
    existingByExternalKey,
    existingBySourceKey,
  );
  const preview = planned.slice(0, TMX_MAX_PREVIEW_ENTRIES).map((item) => ({
    sourceLocale: item.candidate.sourceLocale,
    targetLocale: item.candidate.targetLocale,
    sourceText: item.candidate.sourceText,
    targetText: item.candidate.targetText,
    externalKey: item.candidate.externalKey,
    tuid: item.candidate.tuid,
    action: item.action,
  }));

  let created = 0;
  let updated = 0;
  let variantCreated = 0;
  let skipped = planned.filter((item) => item.action === "skip").length;
  const issues = [...input.parsed.issues];

  if (input.dryRun) {
    created = planned.filter((item) => item.action === "create").length;
    variantCreated = planned.filter((item) => item.action === "variant").length;
    updated = planned.filter((item) => item.action === "update").length;
    return {
      report: finalizeImportReport({
        totalRead: input.parsed.totalRead,
        created,
        updated,
        variantCreated,
        skipped,
        issues,
        headerSrclang: input.parsed.headerSrclang,
      }),
      preview,
      createdEntries: [],
      importBatchId: null,
    };
  }

  const createdEntries: MemoryEntryRow[] = [];
  const inserts = planned.filter((item) => item.action === "create" || item.action === "variant");
  const updates = planned.filter((item) => item.action === "update" && item.existingId);

  for (const batch of chunk(inserts, TMX_DEFAULT_BATCH_SIZE)) {
    const values = batch.map((item) =>
      toInsertValues(input.memory, item.candidate, {
        createdByUserId: input.createdByUserId,
        importBatchId: input.importBatchId,
      }),
    );
    const inserted = await db
      .insert(schema.memoryEntries)
      .values(values)
      .onConflictDoNothing()
      .returning();
    createdEntries.push(...inserted);
    const insertedKeys = new Set(
      inserted.map((row) => sourceKey(row.sourceLocale, row.targetLocale, row.sourceText)),
    );
    for (const item of batch) {
      const key = sourceKey(
        item.candidate.sourceLocale,
        item.candidate.targetLocale,
        item.candidate.sourceText,
      );
      if (!insertedKeys.has(key)) {
        skipped += 1;
        continue;
      }
      if (item.action === "variant") {
        variantCreated += 1;
      } else {
        created += 1;
      }
    }
  }

  for (const batch of chunk(updates, TMX_DEFAULT_BATCH_SIZE)) {
    for (const item of batch) {
      if (!item.existingId) {
        skipped += 1;
        continue;
      }
      try {
        const [row] = await db
          .update(schema.memoryEntries)
          .set({
            sourceLocale: item.candidate.sourceLocale,
            targetLocale: item.candidate.targetLocale,
            sourceText: item.candidate.sourceText,
            normalizedSourceText: normalizeTranslationMemorySourceText(item.candidate.sourceText),
            targetText: item.candidate.targetText,
            matchScore: item.candidate.matchScore,
            provenance: "import",
            reviewStatus: importedReviewStatus(item.candidate) ?? "approved",
            externalKey: item.candidate.externalKey,
            importBatchId: input.importBatchId,
            metadata: item.candidate.metadata,
          })
          .where(
            and(
              eq(schema.memoryEntries.id, item.existingId),
              eq(schema.memoryEntries.memoryId, input.memory.id),
            ),
          )
          .returning();
        if (row) {
          updated += 1;
        } else {
          skipped += 1;
        }
      } catch {
        issues.push({
          severity: "error",
          code: "update_conflict",
          message: "Could not update an existing entry without creating a duplicate locale pair",
          unitIndex: item.candidate.unitIndex,
          tuid: item.candidate.tuid,
        });
      }
    }
  }

  return {
    report: finalizeImportReport({
      totalRead: input.parsed.totalRead,
      created,
      updated,
      variantCreated,
      skipped,
      issues,
      headerSrclang: input.parsed.headerSrclang,
    }),
    preview,
    createdEntries: createdEntries.slice(0, TMX_MAX_RESPONSE_ENTRIES),
    importBatchId: input.importBatchId ?? null,
  };
}

export function emptyParsedImport(): ParsedMemoryImport {
  return {
    format: "tmx",
    candidates: [],
    issues: [],
    totalRead: 0,
  };
}

export function fatalImportReport(error: TmxFatalError): MemoryImportReport {
  return emptyImportReport([
    {
      severity: "error",
      code: error.code,
      message: error.message,
    },
  ]);
}
