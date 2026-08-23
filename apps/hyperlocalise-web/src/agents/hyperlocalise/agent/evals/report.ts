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
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { evalModel } from "./harness";

export type EvalReportRow = {
  case: string;
  pass: boolean;
  /** Judge score (1-5) or accuracy (0-1) depending on the suite. */
  score?: number;
  detail?: unknown;
};

export type EvalReport = {
  record: (row: EvalReportRow) => void;
  /** Write the collected rows to artifacts/evals/<suite>.json. Call from afterAll. */
  flush: () => void;
};

/**
 * Per-suite JSON report, mirroring the Go eval harness convention
 * (artifacts/*_report.json) so a future `eval compare` works across both.
 */
export function createEvalReport(suite: string): EvalReport {
  const rows: EvalReportRow[] = [];

  return {
    record: (row) => {
      rows.push(row);
    },
    flush: () => {
      const outputDir = path.join(process.cwd(), "artifacts", "evals");
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(
        path.join(outputDir, `${suite}.json`),
        `${JSON.stringify(
          {
            suite,
            model: evalModel,
            gitSha: process.env.GITHUB_SHA ?? "local",
            generatedAt: new Date().toISOString(),
            passed: rows.filter((row) => row.pass).length,
            total: rows.length,
            rows,
          },
          null,
          2,
        )}\n`,
      );
    },
  };
}
