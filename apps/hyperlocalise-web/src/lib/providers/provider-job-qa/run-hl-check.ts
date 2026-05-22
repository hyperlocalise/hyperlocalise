import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

import type { ExternalTmsTaskContent } from "@/lib/providers/external-tms-content-sync";

import type { HlCheckReport } from "./hl-check-types";
import {
  materializeHlCheckWorkspace,
  type HlCheckKeyManifest,
  type MaterializedHlCheckWorkspace,
} from "./materialize-hl-check-workspace";
import { resolveHlCliInvocation, type HlCliInvocation } from "./resolve-hl-cli";

export type RunHlCheckResult = {
  report: HlCheckReport;
  keyManifest: HlCheckKeyManifest;
  workspace: MaterializedHlCheckWorkspace;
};

function runProcess(
  invocation: HlCliInvocation,
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, [...invocation.prefixArgs, ...args], {
      cwd,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

export async function runHlCheckOnProviderContent(input: {
  content: ExternalTmsTaskContent;
  targetLocales: string[];
  resolveInvocation?: () => Promise<HlCliInvocation>;
}): Promise<RunHlCheckResult> {
  const targetLocales =
    input.targetLocales.length > 0 ? input.targetLocales : input.content.targetLocales;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hl-provider-qa-"));
  const reportPath = path.join(workspaceRoot, "report.json");

  try {
    const workspace = await materializeHlCheckWorkspace(
      input.content,
      workspaceRoot,
      targetLocales,
    );
    const invocation = input.resolveInvocation
      ? await input.resolveInvocation()
      : await resolveHlCliInvocation();

    const args = [
      "check",
      "--config",
      workspace.configPath,
      "--no-fail",
      "--format",
      "json",
      "--json-report",
      reportPath,
      "--exclude-check",
      "orphaned_key",
      "--exclude-check",
      "missing_target_file",
    ];

    const result = await runProcess(invocation, args, workspace.rootDir);
    if (result.exitCode !== 0) {
      throw new Error(
        `hl check failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`.trim(),
      );
    }

    const reportRaw = await readFile(reportPath, "utf8");
    const report = JSON.parse(reportRaw) as HlCheckReport;

    return {
      report,
      keyManifest: workspace.keyManifest,
      workspace,
    };
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}
