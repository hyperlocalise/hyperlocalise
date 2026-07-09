import { getVercelSandboxWorkspace } from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";
import type { RepoToolContext } from "@/lib/agent-runtime/tools/workspace/types";

/**
 * Minimal Bash adapter backed by a Vercel sandbox for repo read/search tools.
 */
export function createSandboxRepoBash(sandboxId: string): RepoToolContext["bash"] {
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
    async writeWorkspaceFile(path, content) {
      await workspace.writeFile(path, content);
    },
  };
}
