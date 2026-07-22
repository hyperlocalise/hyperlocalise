/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ExternalTmsTaskContent } from "@/lib/providers/jobs/tms-provider-types";
import type { HlCheckReport } from "@/lib/providers/provider-job-qa/hl-check-types";
import type { HlCheckKeyManifest } from "@/lib/providers/provider-job-qa/materialize-hl-check-workspace";

export async function runProviderHlCheckSandboxStep(input: {
  content: ExternalTmsTaskContent;
  targetLocales: string[];
}): Promise<{
  report: HlCheckReport;
  keyManifest: HlCheckKeyManifest;
  workspaceRoot: string;
}> {
  "use step";
  const { runHlCheckOnProviderContentInSandbox } =
    await import("@/lib/providers/provider-job-qa/sandbox-hl-check");

  const result = await runHlCheckOnProviderContentInSandbox(input);
  return {
    report: result.report,
    keyManifest: result.bundle.keyManifest,
    workspaceRoot: result.bundle.workspaceRoot,
  };
}
