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

import { db, schema } from "@/lib/database/client";
import type {
  GlossaryImportMode,
  GlossaryImportReportCounts,
  InterchangeDiagnostic,
} from "./glossary-interchange";

const REPORT_ENTRY_BATCH_SIZE = 500;

export type GlossaryImportReportInput = {
  organizationId: string;
  glossaryId: string;
  createdByUserId: string;
  format: string;
  mode: GlossaryImportMode;
  sourceSha256?: string;
  sourceFilename?: string;
  options: Record<string, unknown>;
  sourceTotals: Record<string, number>;
  counts: GlossaryImportReportCounts;
  diagnostics: InterchangeDiagnostic[];
  status?: "preview" | "completed" | "failed";
};

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function reportCountsFromDiagnostics(
  counts: GlossaryImportReportCounts,
  diagnostics: InterchangeDiagnostic[],
) {
  for (const entry of diagnostics) {
    if (entry.severity === "warning") counts.warned++;
    else if (entry.counted) continue;
    else if (entry.outcome === "skipped") {
      counts.skipped++;
      counts[entry.termId ? "termsSkipped" : "conceptsSkipped"]++;
    } else counts.failed++;
  }
  return counts;
}

export async function insertGlossaryImportReport(
  tx: DatabaseTransaction,
  input: GlossaryImportReportInput,
) {
  const status = input.status ?? (input.mode === "preview" ? "preview" : "completed");
  const [run] = await tx
    .insert(schema.glossaryImportRuns)
    .values({
      organizationId: input.organizationId,
      glossaryId: input.glossaryId,
      createdByUserId: input.createdByUserId,
      format: input.format,
      mode: input.mode,
      status,
      sourceSha256: input.sourceSha256 ?? null,
      sourceFilename: input.sourceFilename ?? null,
      options: input.options,
      sourceTotals: input.sourceTotals,
      counts: input.counts,
      completedAt: status === "preview" ? null : new Date(),
    })
    .returning();
  if (!run) throw new Error("glossary_import_report_create_failed");
  for (let offset = 0; offset < input.diagnostics.length; offset += REPORT_ENTRY_BATCH_SIZE) {
    const entries = input.diagnostics.slice(offset, offset + REPORT_ENTRY_BATCH_SIZE);
    await tx.insert(schema.glossaryImportReportEntries).values(
      entries.map((entry) => ({
        runId: run.id,
        severity: entry.severity,
        code: entry.code,
        message: entry.message,
        sourceRow: entry.sourceRow ?? null,
        conceptId: entry.conceptId ?? null,
        termId: entry.termId ?? null,
        field: entry.field ?? null,
      })),
    );
  }
  return run;
}

export async function createGlossaryImportReport(input: GlossaryImportReportInput) {
  return db.transaction((tx) => insertGlossaryImportReport(tx, input));
}

export async function getGlossaryImportReport(input: {
  organizationId: string;
  glossaryId: string;
  reportId: string;
}) {
  const [run] = await db
    .select()
    .from(schema.glossaryImportRuns)
    .where(
      and(
        eq(schema.glossaryImportRuns.id, input.reportId),
        eq(schema.glossaryImportRuns.organizationId, input.organizationId),
        eq(schema.glossaryImportRuns.glossaryId, input.glossaryId),
      ),
    )
    .limit(1);
  if (!run) return null;
  const entries = await db
    .select()
    .from(schema.glossaryImportReportEntries)
    .where(inArray(schema.glossaryImportReportEntries.runId, [run.id]));
  return { run, entries };
}

export async function attachGlossaryImportBackup(reportId: string, backupFileId: string) {
  await db
    .update(schema.glossaryImportRuns)
    .set({ backupFileId })
    .where(eq(schema.glossaryImportRuns.id, reportId));
}
