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
import { and, count, desc, eq, inArray, lt, or } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import type { TmxIssue } from "@/lib/memory/tmx/tmx-types";

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

export async function listMemoryImportAttempts(input: {
  organizationId: string;
  memoryId: string;
  limit: number;
  cursor?: MemoryImportAttemptCursor;
}) {
  // Imports and exports share this table. History lists both so a queued export
  // stays reachable after the user leaves its report.
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
  /** Restrict the lookup. The JSON report download stays import-only. */
  operation?: "import";
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
        input.operation ? eq(schema.memoryImportAttempts.operation, input.operation) : undefined,
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
