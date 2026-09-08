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
import { createHash } from "node:crypto";

import { and, count, desc, eq, inArray, lt, or } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import type {
  MemoryImportAttemptCounts,
  MemoryImportAttemptStatus,
} from "@/lib/database/schema/translation-memory";
import type { MemoryImportReport, TmxIssue } from "@/lib/memory/tmx/tmx-types";

const DIAGNOSTIC_INSERT_BATCH_SIZE = 200;

export type MemoryImportAttemptCursor = {
  createdAt: Date;
  id: string;
};

export type MemoryImportAttemptRecord = typeof schema.memoryImportAttempts.$inferSelect & {
  actorDisplayName: string | null;
};

function actorDisplayName(firstName: string | null, lastName: string | null): string | null {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

export function hashMemoryImportContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function sanitizeImportFilename(filename: string | undefined): string | null {
  if (!filename) return null;
  const basename = filename.replaceAll("\\", "/").split("/").at(-1)?.trim() ?? "";
  return basename.slice(0, 255) || null;
}

export async function createMemoryImportAttempt(input: {
  id: string;
  organizationId: string;
  memoryId: string;
  createdByUserId: string;
  format: "csv" | "tmx";
  content: string;
  sourceFilename?: string;
  sourceByteSize?: number;
  maxUnits?: number;
}) {
  const [attempt] = await db
    .insert(schema.memoryImportAttempts)
    .values({
      id: input.id,
      organizationId: input.organizationId,
      memoryId: input.memoryId,
      createdByUserId: input.createdByUserId,
      format: input.format,
      sourceFilename: sanitizeImportFilename(input.sourceFilename),
      sourceByteSize: input.sourceByteSize ?? null,
      sourceSha256: hashMemoryImportContent(input.content),
      options: input.maxUnits === undefined ? {} : { maxUnits: input.maxUnits },
    })
    .returning();
  if (!attempt) throw new Error("memory_import_attempt_create_failed");
  return attempt;
}

function countsFromReport(report: MemoryImportReport): MemoryImportAttemptCounts {
  return {
    totalRead: report.totalRead,
    created: report.created,
    updated: report.updated,
    variantCreated: report.variantCreated,
    skipped: report.skipped,
    warned: report.warned,
    failed: report.failed,
  };
}

export function statusFromMemoryImportReport(
  report: MemoryImportReport,
): Exclude<MemoryImportAttemptStatus, "running"> {
  const applied = report.created + report.updated + report.variantCreated;
  if (report.failed === 0) return "completed";
  return applied > 0 ? "partially_successful" : "failed";
}

export async function finalizeMemoryImportAttempt(input: {
  attemptId: string;
  status: Exclude<MemoryImportAttemptStatus, "running">;
  report?: MemoryImportReport;
  failureCode?: string;
}) {
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .update(schema.memoryImportAttempts)
      .set({
        status: input.status,
        counts: input.report ? countsFromReport(input.report) : null,
        headerSrclang: input.report?.headerSrclang ?? null,
        diagnosticsTruncated: input.report?.truncatedIssues ?? false,
        failureCode: input.failureCode ?? null,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(schema.memoryImportAttempts.id, input.attemptId),
          eq(schema.memoryImportAttempts.status, "running"),
        ),
      )
      .returning();
    if (!attempt) throw new Error("memory_import_attempt_already_finalized");

    const diagnostics = input.report?.issues ?? [];
    for (let offset = 0; offset < diagnostics.length; offset += DIAGNOSTIC_INSERT_BATCH_SIZE) {
      await tx.insert(schema.memoryImportAttemptDiagnostics).values(
        diagnostics.slice(offset, offset + DIAGNOSTIC_INSERT_BATCH_SIZE).map((issue) => ({
          attemptId: input.attemptId,
          severity: issue.severity,
          code: issue.code,
          message: issue.message,
          unitIndex: issue.unitIndex ?? null,
          tuid: issue.tuid ?? null,
        })),
      );
    }
    return attempt;
  });
}

export async function listMemoryImportAttempts(input: {
  organizationId: string;
  memoryId: string;
  limit: number;
  cursor?: MemoryImportAttemptCursor;
}) {
  const scope = and(
    eq(schema.memoryImportAttempts.organizationId, input.organizationId),
    eq(schema.memoryImportAttempts.memoryId, input.memoryId),
  );
  const cursorWhere = input.cursor
    ? or(
        lt(schema.memoryImportAttempts.createdAt, input.cursor.createdAt),
        and(
          eq(schema.memoryImportAttempts.createdAt, input.cursor.createdAt),
          lt(schema.memoryImportAttempts.id, input.cursor.id),
        ),
      )
    : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        attempt: schema.memoryImportAttempts,
        actorFirstName: schema.users.firstName,
        actorLastName: schema.users.lastName,
      })
      .from(schema.memoryImportAttempts)
      .leftJoin(schema.users, eq(schema.users.id, schema.memoryImportAttempts.createdByUserId))
      .where(and(scope, cursorWhere))
      .orderBy(desc(schema.memoryImportAttempts.createdAt), desc(schema.memoryImportAttempts.id))
      .limit(input.limit + 1),
    db.select({ value: count() }).from(schema.memoryImportAttempts).where(scope),
  ]);

  return {
    attempts: rows.slice(0, input.limit).map((row) => ({
      ...row.attempt,
      actorDisplayName: actorDisplayName(row.actorFirstName, row.actorLastName),
    })),
    hasMore: rows.length > input.limit,
    total: totalRows[0]?.value ?? 0,
  };
}

export async function getMemoryImportAttempt(input: {
  organizationId: string;
  memoryId: string;
  attemptId: string;
}): Promise<{ attempt: MemoryImportAttemptRecord; diagnostics: TmxIssue[] } | null> {
  const [row] = await db
    .select({
      attempt: schema.memoryImportAttempts,
      actorFirstName: schema.users.firstName,
      actorLastName: schema.users.lastName,
    })
    .from(schema.memoryImportAttempts)
    .leftJoin(schema.users, eq(schema.users.id, schema.memoryImportAttempts.createdByUserId))
    .where(
      and(
        eq(schema.memoryImportAttempts.id, input.attemptId),
        eq(schema.memoryImportAttempts.organizationId, input.organizationId),
        eq(schema.memoryImportAttempts.memoryId, input.memoryId),
      ),
    )
    .limit(1);
  if (!row) return null;

  const diagnostics =
    row.attempt.diagnosticsAvailability === "available"
      ? await db
          .select()
          .from(schema.memoryImportAttemptDiagnostics)
          .where(inArray(schema.memoryImportAttemptDiagnostics.attemptId, [input.attemptId]))
          .orderBy(
            schema.memoryImportAttemptDiagnostics.createdAt,
            schema.memoryImportAttemptDiagnostics.id,
          )
      : [];

  return {
    attempt: {
      ...row.attempt,
      actorDisplayName: actorDisplayName(row.actorFirstName, row.actorLastName),
    },
    diagnostics: diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.unitIndex === null ? {} : { unitIndex: diagnostic.unitIndex }),
      ...(diagnostic.tuid === null ? {} : { tuid: diagnostic.tuid }),
    })),
  };
}
