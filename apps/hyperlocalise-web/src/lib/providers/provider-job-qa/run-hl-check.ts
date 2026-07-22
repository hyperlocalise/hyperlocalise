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

import type { HlCheckReport } from "./hl-check-types";
import type { HlCheckKeyManifest } from "./materialize-hl-check-workspace";
import { runHlCheckOnProviderContentInSandbox } from "./sandbox-hl-check";

export type RunHlCheckResult = {
  report: HlCheckReport;
  keyManifest: HlCheckKeyManifest;
  workspaceRoot: string;
};

export async function runHlCheckOnProviderContent(input: {
  content: ExternalTmsTaskContent;
  targetLocales: string[];
}): Promise<RunHlCheckResult> {
  const { report, bundle } = await runHlCheckOnProviderContentInSandbox(input);

  return {
    report,
    keyManifest: bundle.keyManifest,
    workspaceRoot: bundle.workspaceRoot,
  };
}
