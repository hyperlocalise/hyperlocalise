import type { Bash } from "just-bash";

import { runSandboxCommand } from "@/lib/translation/sandbox-translation";

/**
 * Minimal Bash adapter backed by a Vercel sandbox for repo read/search tools.
 */
export function createSandboxRepoBash(sandboxId: string): Pick<Bash, "exec" | "readFile"> {
  return {
    async exec(command, options) {
      const args = options?.args ?? [];
      const result = await runSandboxCommand(sandboxId, command, args);
      return {
        exitCode: result.exitCode,
        stdout: result.output,
        stderr: "",
        env: {},
      };
    },
    async readFile(path) {
      const result = await runSandboxCommand(sandboxId, "cat", [path], { output: "stdout" });
      if (result.exitCode !== 0) {
        throw new Error(result.output || `Failed to read ${path}`);
      }
      return result.output;
    },
  };
}
