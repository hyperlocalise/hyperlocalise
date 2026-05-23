import type { ExternalTmsTaskContent } from "@/lib/providers/external-tms-content-sync";
import type { HlCheckReport } from "@/lib/providers/provider-job-qa/hl-check-types";
import type { HlCheckKeyManifest } from "@/lib/providers/provider-job-qa/materialize-hl-check-workspace";
import {
  runHlCheckCommandInSandbox,
  runHlCheckOnProviderContentInSandbox,
  writeHlCheckWorkspaceToSandbox,
} from "@/lib/providers/provider-job-qa/sandbox-hl-check";
import { buildHlCheckWorkspaceBundle } from "@/lib/providers/provider-job-qa/materialize-hl-check-workspace";
import {
  createTranslationSandbox,
  prepareSandbox,
  stopTranslationSandbox,
} from "@/lib/translation/sandbox-translation";

export async function createProviderQaSandboxStep() {
  "use step";
  return createTranslationSandbox();
}

export async function prepareProviderQaSandboxStep(sandboxId: string) {
  "use step";
  return prepareSandbox(sandboxId);
}

export async function stopProviderQaSandboxStep(sandboxId: string) {
  "use step";
  return stopTranslationSandbox(sandboxId);
}

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

export async function runProviderHlCheckInExistingSandboxStep(input: {
  sandboxId: string;
  content: ExternalTmsTaskContent;
  targetLocales: string[];
}): Promise<{
  report: HlCheckReport;
  keyManifest: HlCheckKeyManifest;
  workspaceRoot: string;
}> {
  "use step";

  const targetLocales =
    input.targetLocales.length > 0 ? input.targetLocales : input.content.targetLocales;
  const bundle = buildHlCheckWorkspaceBundle(input.content, targetLocales);
  await writeHlCheckWorkspaceToSandbox(input.sandboxId, bundle);
  const report = await runHlCheckCommandInSandbox(input.sandboxId, bundle);

  return {
    report,
    keyManifest: bundle.keyManifest,
    workspaceRoot: bundle.workspaceRoot,
  };
}
