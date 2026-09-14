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
  checkDrizzleJournalMonotonic,
  runDrizzleJournalMonotonicCheck,
} from "../../../scripts/check-drizzle-journal-monotonic";

const tempRoots: string[] = [];

async function createJournalFixture(
  entries: Array<{ idx: number; tag: string; when: number }>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "drizzle-journal-monotonic-"));
  tempRoots.push(root);

  const drizzleDir = join(root, "drizzle");
  await mkdir(join(drizzleDir, "meta"), { recursive: true });
  await writeFile(join(drizzleDir, "meta", "_journal.json"), JSON.stringify({ entries }, null, 2));

  return drizzleDir;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("checkDrizzleJournalMonotonic", () => {
  it("passes when `when` increases with idx", async () => {
    const drizzleDir = await createJournalFixture([
      { idx: 1, tag: "0001_a", when: 100 },
      { idx: 2, tag: "0002_b", when: 200 },
    ]);

    expect(checkDrizzleJournalMonotonic(drizzleDir)).toEqual([]);
    expect(runDrizzleJournalMonotonicCheck({ drizzleDir, stderr: { error: vi.fn() } })).toBe(true);
  });

  it("reports when a later idx has an earlier `when` timestamp", async () => {
    const drizzleDir = await createJournalFixture([
      { idx: 123, tag: "0123_late", when: 200 },
      { idx: 124, tag: "0124_early", when: 100 },
    ]);

    const violations = checkDrizzleJournalMonotonic(drizzleDir);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.laterTag).toBe("0124_early");

    const stderr = { error: vi.fn() };
    expect(runDrizzleJournalMonotonicCheck({ drizzleDir, stderr })).toBe(false);
    expect(stderr.error.mock.calls.map(([message]) => String(message)).join("\n")).toContain(
      "0124_early",
    );
  });
});
