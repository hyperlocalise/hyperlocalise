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
import type { MemoryInterchangeAttemptStatus } from "@/lib/go-svc/go-svc-client.types";

export const ACTIVE_MEMORY_INTERCHANGE_STATUSES = new Set<MemoryInterchangeAttemptStatus>([
  "upload_pending",
  "queued",
  "running",
]);

type MemoryInterchangeHistoryAttempt = {
  operation: "import" | "export";
  sourceFilename: string | null;
  resultFilename: string | null;
  counts: Record<string, unknown> | null;
};

function countNumber(counts: Record<string, unknown>, key: string): number | null {
  const value = counts[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function memoryInterchangeHistoryFilename(
  attempt: Pick<MemoryInterchangeHistoryAttempt, "operation" | "sourceFilename" | "resultFilename">,
): string | null {
  const filename = attempt.operation === "export" ? attempt.resultFilename : attempt.sourceFilename;
  const trimmed = filename?.trim();
  return trimmed ? trimmed : null;
}

export function memoryInterchangeHistorySummary(
  attempt: Pick<MemoryInterchangeHistoryAttempt, "operation" | "counts">,
):
  | { kind: "import"; created: number; updated: number; failed: number }
  | { kind: "export"; entries: number }
  | null {
  if (!attempt.counts) return null;
  if (attempt.operation === "export") {
    const entries = countNumber(attempt.counts, "entries");
    return entries === null ? null : { kind: "export", entries };
  }
  const created = countNumber(attempt.counts, "created");
  if (created === null) return null;
  return {
    kind: "import",
    created,
    updated: countNumber(attempt.counts, "updated") ?? 0,
    failed: countNumber(attempt.counts, "failed") ?? 0,
  };
}
