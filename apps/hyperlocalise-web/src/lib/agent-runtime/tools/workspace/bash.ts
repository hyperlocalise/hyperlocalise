/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { tool } from "ai";
import { z } from "zod";

import { flagBasename, HL_WRITE_FLAG_NAMES } from "@/lib/agent-runtime/tools/hl-write-flags";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { isSuccessfulAllowlistedExit } from "./git-exit";
import { normalizeWorkspacePath } from "./path";
import { DEFAULT_MAX_OUTPUT_BYTES, redact, truncate } from "./redact";
import type { RepoToolContext } from "./types";

const DISALLOWED_SUBSTRINGS = [";", "&&", "||", "|", ">", "<", "`", "$(", "${", "-exec"];

// GNU find file-writing actions plus other mutating flags. Tokenized so
// quoted forms like `"-fprintf"` cannot bypass the deny list. `-fprint`
// is not a prefix match for `-fprintf`/`-fprint0`; each is listed.
const DISALLOWED_FLAG_NAMES = new Set([
  "no-index",
  "in-place",
  "delete",
  "fprint",
  "fprint0",
  "fprintf",
  "printf",
  "fls",
  "exec",
  "execdir",
  "okdir",
  "ok",
  "i",
  ...HL_WRITE_FLAG_NAMES,
]);

const ALLOWED_COMMAND_PATTERNS = [
  /^git\s+(status|log|diff|rev-parse|show)\b/i,
  /^ls(\s+|$)/,
  /^find\s+.+\s+-type\s+f\b/i,
  /^hl\s+(check|status|extract)\b/i,
];

const ABSOLUTE_PATH_PATTERN = /(^|\s)\/(?!\.)(?!\s|$)/;
const PARENT_TRAVERSAL_PATTERN = /(^|\s)\.\.(\/|\s|$)/;

function isDisallowedFlagToken(token: string): boolean {
  return token.startsWith("-") && DISALLOWED_FLAG_NAMES.has(flagBasename(token));
}

export function isAllowedBashCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }

  if (DISALLOWED_SUBSTRINGS.some((token) => trimmed.includes(token))) {
    return false;
  }

  if (/\b(rm|curl|wget|chmod|chown|mv|cp|tee|dd|shred|mkfs|jq|yq|env|printenv)\b/i.test(trimmed)) {
    return false;
  }

  if (ABSOLUTE_PATH_PATTERN.test(trimmed) || PARENT_TRAVERSAL_PATTERN.test(trimmed)) {
    return false;
  }

  const splitResult = splitCommand(trimmed);
  if (isErr(splitResult)) {
    return false;
  }

  const tokens = [splitResult.value.bin, ...splitResult.value.args];
  if (tokens.some(isDisallowedFlagToken)) {
    return false;
  }

  return ALLOWED_COMMAND_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const bashInputSchema = z.object({
  command: z.string().describe("Allowlisted bash command (git, ls, find, hl)."),
  cwd: z.string().optional().describe("Workspace-relative working directory. Default: repo root."),
});

type SplitCommandError = { code: "empty_command" };

function formatSplitCommandError(error: SplitCommandError): string {
  switch (error.code) {
    case "empty_command":
      return "Command is empty.";
  }
}

function splitCommand(command: string): Result<{ bin: string; args: string[] }, SplitCommandError> {
  const tokens = command.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const unquote = (token: string) => token.replace(/^['"]|['"]$/g, "");
  const [bin, ...rest] = tokens.map(unquote);
  if (!bin) {
    return err({ code: "empty_command" });
  }
  return ok({ bin, args: rest });
}

export function createBashTool(ctx: RepoToolContext) {
  return tool({
    description: `Run an allowlisted read-only shell command in the repository sandbox.

WHEN TO USE:
- git status, git log, git diff
- ls or find for directory discovery when glob is insufficient
- hl check/status/extract for Hyperlocalise CLI read-only checks against i18n.yml

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
        const splitResult = splitCommand(command);
        if (isErr(splitResult)) {
          return {
            success: false as const,
            error: formatSplitCommandError(splitResult.error),
          };
        }

        const { bin, args } = splitResult.value;
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
          success: isSuccessfulAllowlistedExit({
            bin,
            args: execArgs,
            exitCode: result.exitCode,
          }),
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
