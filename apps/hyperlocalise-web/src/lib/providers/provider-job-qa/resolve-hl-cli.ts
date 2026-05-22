import { access, constants } from "node:fs/promises";
import path from "node:path";

import { findMonorepoRoot } from "./find-repo-root";

export type HlCliInvocation = {
  command: string;
  prefixArgs: string[];
  cwd: string;
};

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveHlCliInvocation(): Promise<HlCliInvocation> {
  const envPath = process.env.HL_CLI_PATH?.trim();
  if (envPath && (await isExecutable(envPath))) {
    return { command: envPath, prefixArgs: [], cwd: process.cwd() };
  }

  const repoRoot = await findMonorepoRoot();
  const builtBinary = path.join(repoRoot, "bin", "hl");
  if (await isExecutable(builtBinary)) {
    return { command: builtBinary, prefixArgs: [], cwd: repoRoot };
  }

  return {
    command: "go",
    prefixArgs: ["run", "./apps/cli"],
    cwd: repoRoot,
  };
}
