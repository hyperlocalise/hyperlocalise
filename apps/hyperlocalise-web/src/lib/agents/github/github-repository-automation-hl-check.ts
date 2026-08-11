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
import type { HlCheckReport } from "@/lib/providers/provider-job-qa/hl-check-types";
import { prepareSandbox, runSandboxCommand, writeFileToSandbox } from "@/lib/translation/sandbox";
import { isErr } from "@/lib/primitives/result/results";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";
import { shellQuote } from "@/lib/primitives/shell-quote/shell-quote";

const DEFAULT_REPORT_PATH = "/tmp/hl-automation-check-report.json";

export async function runHlCheckDiffInSandbox(input: {
  sandboxId: string;
  configPath: string;
  diffPatch: string;
  reportPath?: string;
}): Promise<HlCheckReport> {
  const reportPath = input.reportPath ?? DEFAULT_REPORT_PATH;
  await prepareSandbox(input.sandboxId);

  const diffFile = "/tmp/hl-automation-check.diff";
  await writeFileToSandbox(input.sandboxId, diffFile, Buffer.from(input.diffPatch, "utf8"));

  const check = await runSandboxCommand(input.sandboxId, "bash", [
    "-lc",
    [
      'export PATH="$HOME/.local/bin:$PATH"',
      `hl check --config ${shellQuote(input.configPath)} --diff-stdin --no-fail --format json --json-report ${shellQuote(reportPath)} < ${shellQuote(diffFile)}`,
    ].join("; "),
  ]);

  if (check.exitCode !== 0) {
    throw new Error(`hl check failed (exit ${check.exitCode})`);
  }

  const report = await runSandboxCommand(input.sandboxId, "cat", [reportPath], {
    output: "stdout",
  });
  if (report.exitCode !== 0) {
    throw new Error("failed to read hl check report from sandbox");
  }

  const parsed = safeJsonParse(report.output);
  if (isErr(parsed)) {
    throw new Error("hl check report is not valid JSON");
  }

  return parsed.value as HlCheckReport;
}
