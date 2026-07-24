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
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const DRIZZLE_DIR = join(import.meta.dirname, "..", "drizzle");
const MIGRATION_PREFIX_RE = /^(\d+)_/;

type Journal = {
  entries: Array<{ idx: number; tag: string }>;
};

export type DrizzleMigrationCollisionCheck = {
  duplicateIndices: string[];
  duplicatePrefixes: Array<{ files: string[]; prefix: string }>;
  unrecognizedFiles: string[];
};

function findDuplicateKeys(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .toSorted();
}

function listMigrationSqlFiles(drizzleDir: string): string[] {
  return readdirSync(drizzleDir).filter((name) => name.endsWith(".sql"));
}

function checkFilenamePrefixes(drizzleDir: string): {
  duplicatePrefixes: Array<{ files: string[]; prefix: string }>;
  unrecognizedFiles: string[];
} {
  const files = listMigrationSqlFiles(drizzleDir);
  const prefixes: string[] = [];
  const unrecognized: string[] = [];

  for (const file of files) {
    const match = MIGRATION_PREFIX_RE.exec(basename(file));
    if (!match) {
      unrecognized.push(file);
      continue;
    }
    prefixes.push(match[1]);
  }

  return {
    duplicatePrefixes: findDuplicateKeys(prefixes).map((prefix) => ({
      files: files
        .filter((name) => name.startsWith(`${prefix}_`) && name.endsWith(".sql"))
        .toSorted(),
      prefix,
    })),
    unrecognizedFiles: unrecognized.toSorted(),
  };
}

function checkJournalIndices(drizzleDir: string): string[] {
  const journalPath = join(drizzleDir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal;
  return findDuplicateKeys(journal.entries.map((entry) => String(entry.idx)));
}

export function checkDrizzleMigrationCollisions(
  drizzleDir = DRIZZLE_DIR,
): DrizzleMigrationCollisionCheck {
  const { duplicatePrefixes, unrecognizedFiles } = checkFilenamePrefixes(drizzleDir);

  return {
    duplicateIndices: checkJournalIndices(drizzleDir),
    duplicatePrefixes,
    unrecognizedFiles,
  };
}

function hasCollisions(result: DrizzleMigrationCollisionCheck): boolean {
  return (
    result.duplicateIndices.length > 0 ||
    result.duplicatePrefixes.length > 0 ||
    result.unrecognizedFiles.length > 0
  );
}

export function formatDrizzleMigrationCollisionErrors(
  result: DrizzleMigrationCollisionCheck,
): string[] {
  const messages: string[] = [];

  if (result.unrecognizedFiles.length > 0) {
    messages.push("Migration SQL files must use a numeric prefix (for example 0061_name.sql):");
    for (const file of result.unrecognizedFiles) {
      messages.push(`  - ${file}`);
    }
  }

  if (result.duplicatePrefixes.length > 0) {
    messages.push(
      "Duplicate migration index prefix in drizzle/ (likely a merge from parallel branches):",
    );
    for (const { files, prefix } of result.duplicatePrefixes) {
      messages.push(`  - ${prefix}_ (${files.join(", ")})`);
    }
    messages.push(
      "Resolve by deleting your migration files, rebasing onto main, and rerunning 'vp run db:generate'.",
    );
  }

  if (result.duplicateIndices.length > 0) {
    messages.push(
      "Duplicate idx in drizzle/meta/_journal.json (likely a merge from parallel branches that each generated the same migration number):",
    );
    for (const idx of result.duplicateIndices) {
      messages.push(`  - idx: ${idx}`);
    }
    messages.push(
      "Resolve by deleting your migration files, rebasing onto main, and rerunning 'vp run db:generate'.",
    );
  }

  return messages;
}

export function runDrizzleMigrationCollisionCheck(input?: {
  drizzleDir?: string;
  stderr?: Pick<typeof console, "error">;
}): boolean {
  const result = checkDrizzleMigrationCollisions(input?.drizzleDir);
  if (!hasCollisions(result)) {
    return true;
  }

  const stderr = input?.stderr ?? console;
  for (const message of formatDrizzleMigrationCollisionErrors(result)) {
    stderr.error(message);
  }
  return false;
}

function main() {
  if (!runDrizzleMigrationCollisionCheck()) {
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
