import { Sandbox } from "@vercel/sandbox";

import {
  createTranslationSandbox,
  prepareSandbox,
  runSandboxCommand,
  stopTranslationSandbox,
} from "@/lib/translation/sandbox-translation";

import type { HlCheckReport } from "./hl-check-types";
import {
  buildHlCheckWorkspaceBundle,
  type HlCheckWorkspaceBundle,
} from "./materialize-hl-check-workspace";
import type { ExternalTmsTaskContent } from "@/lib/providers/external-tms-content-sync";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function writeHlCheckWorkspaceToSandbox(
  sandboxId: string,
  bundle: HlCheckWorkspaceBundle,
): Promise<void> {
  const sandbox = await Sandbox.get({ sandboxId });
  await sandbox.writeFiles(
    bundle.files.map((file) => ({
      path: file.path,
      content: file.content,
    })),
  );
}

export async function runHlCheckCommandInSandbox(
  sandboxId: string,
  bundle: HlCheckWorkspaceBundle,
): Promise<HlCheckReport> {
  const check = await runSandboxCommand(sandboxId, "bash", [
    "-lc",
    [
      'export PATH="$HOME/.local/bin:$PATH"',
      `hl check --config ${shellQuote(bundle.configPath)} --no-fail --format json --json-report ${shellQuote(bundle.reportPath)} --exclude-check orphaned_key --exclude-check missing_target_file >/dev/null`,
    ].join("; "),
  ]);

  if (check.exitCode !== 0) {
    throw new Error(`hl check failed (exit ${check.exitCode}): ${check.output}`.trim());
  }

  const report = await runSandboxCommand(sandboxId, "cat", [bundle.reportPath], {
    output: "stdout",
  });
  if (report.exitCode !== 0) {
    throw new Error(`read hl check report failed: ${report.output}`.trim());
  }

  return JSON.parse(report.output) as HlCheckReport;
}

export async function runHlCheckOnProviderContentInSandbox(input: {
  content: ExternalTmsTaskContent;
  targetLocales: string[];
}): Promise<{
  report: HlCheckReport;
  bundle: HlCheckWorkspaceBundle;
}> {
  const targetLocales =
    input.targetLocales.length > 0 ? input.targetLocales : input.content.targetLocales;
  const bundle = buildHlCheckWorkspaceBundle(input.content, targetLocales);
  const { sandboxId } = await createTranslationSandbox();

  try {
    await prepareSandbox(sandboxId);
    await writeHlCheckWorkspaceToSandbox(sandboxId, bundle);
    const report = await runHlCheckCommandInSandbox(sandboxId, bundle);
    return { report, bundle };
  } finally {
    await stopTranslationSandbox(sandboxId);
  }
}
