import { tool } from "ai";
import { z } from "zod";

import { normalizeWorkspacePath } from "./path";
import { DEFAULT_MAX_OUTPUT_BYTES, redact, truncate } from "./redact";
import type { RepoToolContext } from "./types";

const DISALLOWED_SUBSTRINGS = [";", "&&", "||", "|", ">", "<", "`", "$(", "${", "-exec"];

const ALLOWED_COMMAND_PATTERNS = [
  /^git\s+(status|log|diff|rev-parse|show)\b/i,
  /^ls(\s+|$)/,
  /^find\s+.+\s+-type\s+f\b/i,
  /^hl\s+(check|status|extract)\b/i,
  /^yq\s+/i,
  /^jq\s+/i,
];

export function isAllowedBashCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }

  if (DISALLOWED_SUBSTRINGS.some((token) => trimmed.includes(token))) {
    return false;
  }

  if (/\b(rm|curl|wget|chmod|chown|mv|cp|tee|dd|shred|mkfs)\b/i.test(trimmed)) {
    return false;
  }

  return ALLOWED_COMMAND_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const bashInputSchema = z.object({
  command: z.string().describe("Allowlisted bash command (git, ls, find, hl, yq, jq)."),
  cwd: z.string().optional().describe("Workspace-relative working directory. Default: repo root."),
});

function splitCommand(command: string): { bin: string; args: string[] } {
  const tokens = command.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const unquote = (token: string) => token.replace(/^['"]|['"]$/g, "");
  const [bin, ...rest] = tokens.map(unquote);
  if (!bin) {
    throw new Error("Command is empty.");
  }
  return { bin, args: rest };
}

export function createBashTool(ctx: RepoToolContext) {
  return tool({
    description: `Run an allowlisted read-only shell command in the repository sandbox.

WHEN TO USE:
- git status, git log, git diff
- ls or find for directory discovery when glob is insufficient
- hl check/status/extract for Hyperlocalise CLI read-only checks

WHEN NOT TO USE:
- Reading files (use read)
- Searching content (use grep)
- File writes, package installs, curl, or rm

IMPORTANT:
- One command per call — no chaining with ; or &&
- Do not use cat/grep in bash — use read and grep tools`,
    inputSchema: bashInputSchema,
    execute: async ({ command, cwd }) => {
      if (!isAllowedBashCommand(command)) {
        return {
          success: false as const,
          error:
            "Command is not allowlisted. Use read, grep, or glob tools instead of cat/grep/find hacks.",
        };
      }

      const workdir = cwd ? normalizeWorkspacePath(cwd) : ".";
      if (cwd && !workdir) {
        return {
          success: false as const,
          error: "Working directory must stay within the workspace.",
        };
      }

      try {
        const { bin, args } = splitCommand(command);
        let execArgs = args;
        if (workdir && workdir !== ".") {
          if (bin === "git") {
            execArgs = ["-C", workdir, ...args];
          } else if (bin === "ls") {
            execArgs = args.length > 0 ? args : [workdir];
          } else if (bin === "find" && args[0] !== workdir) {
            execArgs = [workdir, ...args];
          }
        }

        const result = await ctx.bash.exec(bin, { args: execArgs });

        const stdout = truncate(redact(result.stdout), DEFAULT_MAX_OUTPUT_BYTES);
        const stderr = truncate(redact(result.stderr), DEFAULT_MAX_OUTPUT_BYTES);

        return {
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout: stdout.text,
          stderr: stderr.text,
          truncated: stdout.truncated || stderr.truncated,
        };
      } catch (error) {
        return {
          success: false as const,
          error: redact(error instanceof Error ? error.message : String(error)),
        };
      }
    },
  });
}
