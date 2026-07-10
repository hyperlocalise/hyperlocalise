import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const DRIZZLE_DIR = join(import.meta.dirname, "..", "drizzle");
const JOURNAL_PATH = join(DRIZZLE_DIR, "meta", "_journal.json");
const MIGRATION_PREFIX_RE = /^(\d+)_/;

type Journal = {
  entries: Array<{ idx: number; tag: string }>;
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

function checkFilenamePrefixes(): string[] {
  const files = readdirSync(DRIZZLE_DIR).filter((name) => name.endsWith(".sql"));
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

  if (unrecognized.length > 0) {
    console.error("Migration SQL files must use a numeric prefix (for example 0061_name.sql):");
    for (const file of unrecognized.toSorted()) {
      console.error(`  - ${file}`);
    }
    process.exit(1);
  }

  return findDuplicateKeys(prefixes);
}

function checkJournalIndices(): string[] {
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as Journal;
  return findDuplicateKeys(journal.entries.map((entry) => String(entry.idx)));
}

function main() {
  let failed = false;

  const duplicatePrefixes = checkFilenamePrefixes();
  if (duplicatePrefixes.length > 0) {
    failed = true;
    console.error(
      "Duplicate migration index prefix in drizzle/ (likely a merge from parallel branches):",
    );
    for (const prefix of duplicatePrefixes) {
      const files = readdirSync(DRIZZLE_DIR)
        .filter((name) => name.startsWith(`${prefix}_`) && name.endsWith(".sql"))
        .toSorted();
      console.error(`  - ${prefix}_ (${files.join(", ")})`);
    }
    console.error(
      "Resolve by deleting your migration files, rebasing onto main, and rerunning 'vp run db:generate'.",
    );
  }

  const duplicateIndices = checkJournalIndices();
  if (duplicateIndices.length > 0) {
    failed = true;
    console.error(
      "Duplicate idx in drizzle/meta/_journal.json (likely a merge from parallel branches that each generated the same migration number):",
    );
    for (const idx of duplicateIndices) {
      console.error(`  - idx: ${idx}`);
    }
    console.error(
      "Resolve by deleting your migration files, rebasing onto main, and rerunning 'vp run db:generate'.",
    );
  }

  if (failed) {
    process.exit(1);
  }
}

main();
