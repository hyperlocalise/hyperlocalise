import type { Bash } from "just-bash";

import { getVercelSandboxWorkspace } from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";

/**
 * Minimal Bash adapter backed by a Vercel sandbox for repo read/search tools.
 */
export function createSandboxRepoBash(sandboxId: string): Pick<Bash, "exec" | "readFile"> {
  const workspace = getVercelSandboxWorkspace(sandboxId);

  return {
    async exec(command, options) {
      const args = options?.args ?? [];
      const result = await workspace.runCommand(command, args);
      return {
        exitCode: result.exitCode,
        stdout: result.output,
        stderr: "",
        env: {},
      };
    },
    async readFile(path) {
      return workspace.readFile(path);
    },
  };
}
