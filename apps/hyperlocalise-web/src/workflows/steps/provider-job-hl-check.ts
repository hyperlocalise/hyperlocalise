import type { ExternalTmsTaskContent } from "@/lib/providers/tms-provider-types";
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
