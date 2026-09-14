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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DRIZZLE_DIR = join(import.meta.dirname, "..", "drizzle");

type JournalEntry = {
  idx: number;
  tag: string;
  when: number;
};

type Journal = {
  entries: JournalEntry[];
};

export type DrizzleJournalMonotonicViolation = {
  laterIdx: number;
  laterTag: string;
  laterWhen: number;
  previousIdx: number;
  previousTag: string;
  previousWhen: number;
};

export function checkDrizzleJournalMonotonic(drizzleDir = DRIZZLE_DIR): DrizzleJournalMonotonicViolation[] {
  const journalPath = join(drizzleDir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal;
  const entries = [...journal.entries].toSorted((a, b) => a.idx - b.idx);
  const violations: DrizzleJournalMonotonicViolation[] = [];

  for (let i = 1; i < entries.length; i++) {
    const previous = entries[i - 1];
    const later = entries[i];
    if (later.when <= previous.when) {
      violations.push({
        previousIdx: previous.idx,
        previousTag: previous.tag,
        previousWhen: previous.when,
        laterIdx: later.idx,
        laterTag: later.tag,
        laterWhen: later.when,
      });
    }
  }

  return violations;
}

export function formatDrizzleJournalMonotonicErrors(
  violations: DrizzleJournalMonotonicViolation[],
): string[] {
  if (violations.length === 0) {
    return [];
  }

  const messages = [
    "Drizzle journal `when` timestamps must strictly increase by idx.",
    "drizzle-kit migrate only applies migrations whose `when` is greater than the latest",
    "row in drizzle.__drizzle_migrations, so out-of-order `when` values are skipped silently.",
    "",
    "Violations:",
  ];

  for (const violation of violations) {
    messages.push(
      `  - idx ${violation.laterIdx} (${violation.laterTag}, when=${violation.laterWhen}) is not after idx ${violation.previousIdx} (${violation.previousTag}, when=${violation.previousWhen})`,
    );
  }

  messages.push(
    "",
    "Resolve by deleting your migration files, rebasing onto main, and rerunning 'vp run db:generate'.",
    "If a migration was already skipped in production, add a forward repair migration with a new `when`.",
  );

  return messages;
}

export function runDrizzleJournalMonotonicCheck(input?: {
  drizzleDir?: string;
  stderr?: Pick<typeof console, "error">;
}): boolean {
  const violations = checkDrizzleJournalMonotonic(input?.drizzleDir);
  if (violations.length === 0) {
    return true;
  }

  const stderr = input?.stderr ?? console;
  for (const message of formatDrizzleJournalMonotonicErrors(violations)) {
    stderr.error(message);
  }
  return false;
}

function main() {
  if (!runDrizzleJournalMonotonicCheck()) {
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
