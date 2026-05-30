import { tool } from "ai";
import { Sandbox } from "@vercel/sandbox";
import { z } from "zod";

import { assertRepositoryWriteAllowed } from "@/lib/agent-runtime/tools/policy";
import type { ToolContext } from "@/lib/tools/types";

type WriteI18nConfigToolOptions = {
  allowUpdate?: boolean;
  allowJsoncConversion?: boolean;
};

async function runSandboxCommand(
  sandboxId: string,
  command: string,
  args: string[],
  options?: { env?: Record<string, string> },
): Promise<{ exitCode: number; output: string }> {
  const sandbox = await Sandbox.get({ name: sandboxId });
  const result = await sandbox.runCommand({
    cmd: command,
    args,
    env: options?.env,
  });
  return {
    exitCode: result.exitCode,
    output: await result.output("both"),
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Write i18n.yml in the repository sandbox during the i18n setup wizard.
 */
export function createWriteI18nConfigTool(
  ctx: ToolContext,
  options: WriteI18nConfigToolOptions = {},
) {
  const allowUpdate = options.allowUpdate ?? false;
  const allowJsoncConversion = options.allowJsoncConversion ?? false;

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

      const jsoncExists = await runSandboxCommand(ctx.sandboxId, "test", ["-f", "i18n.jsonc"]);
      const ymlExists = await runSandboxCommand(ctx.sandboxId, "test", ["-f", "i18n.yml"]);

      if (jsoncExists.exitCode === 0 && !allowJsoncConversion) {
        return {
          success: false,
          error: "i18n.jsonc already exists. Convert it to i18n.yml instead of blocking on it.",
        };
      }

      if (ymlExists.exitCode === 0 && !allowUpdate) {
        return {
          success: false,
          error: "i18n.yml already exists in the repository.",
        };
      }

      const writeResult = await runSandboxCommand(
        ctx.sandboxId,
        "bash",
        ["-lc", `printf '%s\\n' "$I18N_CONTENT" > i18n.yml`],
        { env: { I18N_CONTENT: input.content } },
      );

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

      return {
        success: true,
        configPath: "i18n.yml",
        updated: allowUpdate && ymlExists.exitCode === 0,
        convertedFromJsonc: allowJsoncConversion && jsoncExists.exitCode === 0,
      };
    },
  });
}
