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
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

/**
 * Job change events are recorded by `insertJobs` and `updateJobs`, in the same transaction as the
 * write. A job written any other way changes without telling outbound webhooks or Job changed
 * workflows, so this test fails on every other write to `jobs` in the app's source.
 */
const SRC_ROOT = path.resolve(import.meta.dirname, "../..");
const ALLOWED = new Set([
  path.join("lib", "job-change-events", "job-writes.ts"),
  // Test-only stand-in for job-writes.ts, for unit tests with a fake database.
  path.join("test", "mocks", "job-writes-passthrough.ts"),
]);
const SKIPPED_SUFFIXES = [".test.ts", ".test.tsx", ".fixture.ts", ".stories.tsx", ".d.ts"];
const DIRECT_WRITE_PATTERNS = [
  /\.(?:update|insert)\(\s*(?:schema\.)?jobs\s*\)/,
  /\b(?:UPDATE|INSERT\s+INTO)\s+"?jobs"?\s/i,
];

function listSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listSourceFiles(fullPath));
    } else if (
      /\.(?:ts|tsx)$/.test(entry.name) &&
      !SKIPPED_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("job writes", () => {
  it("go through insertJobs and updateJobs", () => {
    const offenders = listSourceFiles(SRC_ROOT).flatMap((file) => {
      const relative = path.relative(SRC_ROOT, file);
      if (ALLOWED.has(relative)) {
        return [];
      }
      return readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          DIRECT_WRITE_PATTERNS.some((pattern) => pattern.test(line))
            ? [`${relative}:${index + 1}: ${line.trim()}`]
            : [],
        );
    });

    expect(offenders).toEqual([]);
  });
});
