import type { ExternalTmsTaskContent } from "@/lib/providers/sync/external-tms-content-sync";

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
