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
import type { MemoryImportAttemptRecord } from "@/api/routes/memory/memory.schema";

export const ACTIVE_MEMORY_INTERCHANGE_STATUSES = new Set<MemoryImportAttemptRecord["status"]>([
  "upload_pending",
  "queued",
  "running",
]);

export function memoryInterchangeHistoryFilename(
  attempt: Pick<MemoryImportAttemptRecord, "operation" | "sourceFilename" | "resultFilename">,
): string | null {
  const filename = attempt.operation === "export" ? attempt.resultFilename : attempt.sourceFilename;
  const trimmed = filename?.trim();
  return trimmed ? trimmed : null;
}

export function memoryInterchangeHistorySummary(
  attempt: Pick<MemoryImportAttemptRecord, "operation" | "counts">,
):
  | { kind: "import"; created: number; updated: number; failed: number }
  | { kind: "export"; entries: number }
  | null {
  if (!attempt.counts) return null;
  if (attempt.operation === "export") {
    return "entries" in attempt.counts && typeof attempt.counts.entries === "number"
      ? { kind: "export", entries: attempt.counts.entries }
      : null;
  }
  if (!("created" in attempt.counts)) return null;
  return {
    kind: "import",
    created: attempt.counts.created ?? 0,
    updated: attempt.counts.updated ?? 0,
    failed: attempt.counts.failed ?? 0,
  };
}
