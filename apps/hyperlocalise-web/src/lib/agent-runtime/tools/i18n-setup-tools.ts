import { tool } from "ai";
import { z } from "zod";

import { getVercelSandboxWorkspace } from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";
import { assertRepositoryWriteAllowed } from "@/lib/agent-runtime/tools/policy";
import type { ToolContext } from "@/lib/tools/types";

async function runSandboxCommand(
  sandboxId: string,
  command: string,
  args: string[],
): Promise<{ exitCode: number; output: string }> {
  const workspace = getVercelSandboxWorkspace(sandboxId);
  return workspace.runCommand(command, args, { output: "both" });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Write i18n.yml in the repository sandbox during the i18n setup wizard.
 */
export function createWriteI18nConfigTool(ctx: ToolContext) {
  return tool({
    description:
      "Write i18n.yml in the checked-out repository sandbox. Only allowed during the i18n setup wizard.",
    inputSchema: z.object({
      content: z.string().min(1).describe("Full i18n.yml file contents."),
    }),
    execute: async (input) => {
      const gate = assertRepositoryWriteAllowed(ctx, "commit_changes");
      if (!gate.allowed) {
        return { success: false, error: gate.reason };
      }

      if (!ctx.sandboxId) {
        return {
          success: false,
          error: "No repository sandbox is available. Cannot write i18n.yml.",
        };
      }

      for (const candidate of ["i18n.yml", "i18n.jsonc"]) {
        const exists = await runSandboxCommand(ctx.sandboxId, "test", ["-f", candidate]);
        if (exists.exitCode === 0) {
          return {
            success: false,
            error: `${candidate} already exists in the repository.`,
          };
        }
      }

      const writeResult = await runSandboxCommand(ctx.sandboxId, "bash", [
        "-lc",
        `cat > i18n.yml <<'EOF'\n${input.content.replaceAll("EOF", "EO_F")}\nEOF`,
      ]);

      if (writeResult.exitCode !== 0) {
        return { success: false, error: `Failed to write i18n.yml: ${writeResult.output}` };
      }

      const validateResult = await runSandboxCommand(ctx.sandboxId, "bash", [
        "-lc",
        `export PATH="$HOME/.local/bin:$PATH"; command -v hl >/dev/null 2>&1 && hl status --config ${shellQuote("i18n.yml")} >/dev/null 2>&1 || test -f i18n.yml`,
      ]);

      if (validateResult.exitCode !== 0) {
        return {
          success: false,
          error: `Wrote i18n.yml but validation failed: ${validateResult.output}`,
        };
      }

      return { success: true, configPath: "i18n.yml" };
    },
  });
}
