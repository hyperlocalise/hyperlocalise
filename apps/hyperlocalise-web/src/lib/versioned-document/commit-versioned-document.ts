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
import { randomUUID } from "node:crypto";

import type { DatabaseClient, DatabaseTransaction } from "@/lib/database";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import type {
  VersionedDocumentCommitError,
  VersionedDocumentCommitResult,
  VersionedDocumentCurrentRow,
  VersionedDocumentRecord,
} from "./versioned-document.types";

function normalizeSummary(summary: string | undefined, fallback: string) {
  return summary?.trim() || fallback;
}

function toVersionedDocumentRecord(
  row: VersionedDocumentCurrentRow | undefined,
  emptyRecord: VersionedDocumentRecord,
): VersionedDocumentRecord {
  if (!row) {
    return emptyRecord;
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

type HeadWriteValues = {
  revisionId: string;
  version: number;
  content: string;
  summary: string;
  updatedByUserId: string | null;
  now: Date;
};

/**
 * Shared commit orchestration for "one head row + immutable revision archive" documents
 * (org Knowledge Memory, per-automation Memory). Owns the transaction, optimistic-concurrency
 * check, no-op detection, and archive-before-update ordering. Each resource supplies small
 * closures over its own concrete Drizzle tables rather than this module trying to genericize
 * over Drizzle table types directly.
 */
export async function commitVersionedDocument(input: {
  db: DatabaseClient;
  content: string;
  normalizeContent: (content: string) => string;
  summary?: string;
  initialSummaryFallback: string;
  updatedSummaryFallback: string;
  updatedByUserId: string | null;
  expectedRevisionId: string | null;
  forceNewRevision?: boolean;
  emptyRecord: VersionedDocumentRecord;
  readCurrent: (tx: DatabaseTransaction) => Promise<VersionedDocumentCurrentRow | undefined>;
  insertHead: (
    tx: DatabaseTransaction,
    values: HeadWriteValues,
  ) => Promise<VersionedDocumentCurrentRow | undefined>;
  updateHead: (
    tx: DatabaseTransaction,
    expectedRevisionId: string,
    values: HeadWriteValues,
  ) => Promise<VersionedDocumentCurrentRow | undefined>;
  archivePrevious: (
    tx: DatabaseTransaction,
    previous: VersionedDocumentCurrentRow,
  ) => Promise<void>;
}): Promise<Result<VersionedDocumentCommitResult, VersionedDocumentCommitError>> {
  const content = input.normalizeContent(input.content);

  return input.db.transaction(async (tx) => {
    const current = await input.readCurrent(tx);

    if (!current) {
      if (input.expectedRevisionId !== null) {
        return err({ code: "precondition_failed", current: input.emptyRecord });
      }

      if (content === "") {
        return ok({ record: input.emptyRecord, changed: false });
      }

      const now = new Date();
      const inserted = await input.insertHead(tx, {
        revisionId: randomUUID(),
        version: 1,
        content,
        summary: normalizeSummary(input.summary, input.initialSummaryFallback),
        updatedByUserId: input.updatedByUserId,
        now,
      });

      if (!inserted) {
        const latest = await input.readCurrent(tx);
        return err({
          code: "precondition_failed",
          current: toVersionedDocumentRecord(latest, input.emptyRecord),
        });
      }

      return ok({ record: toVersionedDocumentRecord(inserted, input.emptyRecord), changed: true });
    }

    if (current.revisionId !== input.expectedRevisionId) {
      return err({
        code: "precondition_failed",
        current: toVersionedDocumentRecord(current, input.emptyRecord),
      });
    }

    if (current.content === content && input.forceNewRevision !== true) {
      return ok({ record: toVersionedDocumentRecord(current, input.emptyRecord), changed: false });
    }

    const now = new Date();
    const updated = await input.updateHead(tx, current.revisionId, {
      revisionId: randomUUID(),
      version: current.version + 1,
      content,
      summary: normalizeSummary(input.summary, input.updatedSummaryFallback),
      updatedByUserId: input.updatedByUserId,
      now,
    });

    if (!updated) {
      const latest = await input.readCurrent(tx);
      return err({
        code: "precondition_failed",
        current: toVersionedDocumentRecord(latest, input.emptyRecord),
      });
    }

    await input.archivePrevious(tx, current);

    return ok({ record: toVersionedDocumentRecord(updated, input.emptyRecord), changed: true });
  });
}
