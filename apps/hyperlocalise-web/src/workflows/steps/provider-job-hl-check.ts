import type { ExternalTmsTaskContent } from "@/lib/providers/external-tms-content-sync";
import type { HlCheckReport } from "@/lib/providers/provider-job-qa/hl-check-types";
import type { HlCheckKeyManifest } from "@/lib/providers/provider-job-qa/materialize-hl-check-workspace";
import { runHlCheckOnProviderContentInSandbox } from "@/lib/providers/provider-job-qa/sandbox-hl-check";

export async function runProviderHlCheckSandboxStep(input: {
  content: ExternalTmsTaskContent;
  targetLocales: string[];
}): Promise<{
  report: HlCheckReport;
  keyManifest: HlCheckKeyManifest;
  workspaceRoot: string;
}> {
  "use step";

  const result = await runHlCheckOnProviderContentInSandbox(input);
  return {
    report: result.report,
    keyManifest: result.bundle.keyManifest,
    workspaceRoot: result.bundle.workspaceRoot,
  };
}
