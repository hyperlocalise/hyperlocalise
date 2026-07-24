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
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  checkDrizzleMigrationCollisions,
  runDrizzleMigrationCollisionCheck,
} from "./check-drizzle-migration-collisions";

const tempRoots: string[] = [];

async function createDrizzleFixture(input: {
  journalEntries: Array<{ idx: number; tag: string }>;
  sqlFiles: string[];
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "drizzle-collision-check-"));
  tempRoots.push(root);

  const drizzleDir = join(root, "drizzle");
  await mkdir(join(drizzleDir, "meta"), { recursive: true });

  await Promise.all(
    input.sqlFiles.map((file) => writeFile(join(drizzleDir, file), "-- test migration\n")),
  );
  await writeFile(
    join(drizzleDir, "meta", "_journal.json"),
    JSON.stringify({ entries: input.journalEntries }, null, 2),
  );

  return drizzleDir;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("checkDrizzleMigrationCollisions", () => {
  it("passes when migration filenames and journal indices are unique", async () => {
    const drizzleDir = await createDrizzleFixture({
      journalEntries: [
        { idx: 67, tag: "0067_previous" },
        { idx: 68, tag: "0068_next" },
      ],
      sqlFiles: ["0067_previous.sql", "0068_next.sql"],
    });

    expect(checkDrizzleMigrationCollisions(drizzleDir)).toEqual({
      duplicateIndices: [],
      duplicatePrefixes: [],
      unrecognizedFiles: [],
    });

    const stderr = { error: vi.fn() };
    expect(runDrizzleMigrationCollisionCheck({ drizzleDir, stderr })).toBe(true);
    expect(stderr.error).not.toHaveBeenCalled();
  });

  it("reports duplicate SQL prefixes and duplicate journal indices", async () => {
    const drizzleDir = await createDrizzleFixture({
      journalEntries: [
        { idx: 68, tag: "0068_dark_leper_queen" },
        { idx: 68, tag: "0068_parallel_branch" },
        { idx: 69, tag: "0069_followup" },
      ],
      sqlFiles: ["0068_dark_leper_queen.sql", "0068_parallel_branch.sql", "0069_followup.sql"],
    });

    expect(checkDrizzleMigrationCollisions(drizzleDir)).toEqual({
      duplicateIndices: ["68"],
      duplicatePrefixes: [
        {
          files: ["0068_dark_leper_queen.sql", "0068_parallel_branch.sql"],
          prefix: "0068",
        },
      ],
      unrecognizedFiles: [],
    });

    const stderr = { error: vi.fn() };
    expect(runDrizzleMigrationCollisionCheck({ drizzleDir, stderr })).toBe(false);

    const output = stderr.error.mock.calls.map(([message]) => String(message)).join("\n");
    expect(output).toContain("Duplicate migration index prefix in drizzle/");
    expect(output).toContain("0068_ (0068_dark_leper_queen.sql, 0068_parallel_branch.sql)");
    expect(output).toContain("Duplicate idx in drizzle/meta/_journal.json");
    expect(output).toContain("idx: 68");
    expect(output).toContain("vp run db:generate");
  });

  it("rejects SQL migration files without numeric prefixes", async () => {
    const drizzleDir = await createDrizzleFixture({
      journalEntries: [{ idx: 68, tag: "0068_valid" }],
      sqlFiles: ["0068_valid.sql", "missing_prefix.sql"],
    });

    expect(checkDrizzleMigrationCollisions(drizzleDir)).toEqual({
      duplicateIndices: [],
      duplicatePrefixes: [],
      unrecognizedFiles: ["missing_prefix.sql"],
    });

    const stderr = { error: vi.fn() };
    expect(runDrizzleMigrationCollisionCheck({ drizzleDir, stderr })).toBe(false);

    const output = stderr.error.mock.calls.map(([message]) => String(message)).join("\n");
    expect(output).toContain("Migration SQL files must use a numeric prefix");
    expect(output).toContain("missing_prefix.sql");
  });
});
