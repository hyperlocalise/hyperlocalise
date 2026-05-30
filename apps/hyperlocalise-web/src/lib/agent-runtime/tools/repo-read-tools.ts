import { tool } from "ai";
import type { Bash } from "just-bash";
import { z } from "zod";

import { DEFAULT_MAX_OUTPUT_BYTES, redact, truncate, type RepoToolContext } from "./workspace";
import { normalizeJsonc } from "@/lib/i18n/parse-jsonc-config";

export type { RepoToolContext } from "./workspace";
export { redact, truncate, DEFAULT_MAX_OUTPUT_BYTES } from "./workspace";

const DANGEROUS_FLAGS = new Set([
  "token",
  "api-token",
  "project-key",
  "api-key",
  "secret",
  "password",
  "private-key",
]);

export type I18NConfigSummary = {
  sourceLocale: string;
  targetLocales: string[];
  buckets: string[];
  storageAdapter?: string;
};

/**
 * Detect whether a Hyperlocalise i18n config exists and return a safe summary.
 */
export function createDetectRepoConfigTool(ctx: RepoToolContext) {
  return tool({
    description:
      "Detect whether a Hyperlocalise i18n configuration file (i18n.yml or i18n.jsonc) exists in the repository and return a secret-free summary.",
    inputSchema: z.object({
      path: z.string().optional().describe("Directory to check. Defaults to repo root."),
    }),
    execute: async ({ path }) => {
      const checkPath = path || ".";
      const candidates = ["i18n.yml", "i18n.jsonc"];

      for (const name of candidates) {
        const filePath = checkPath === "." ? name : `${checkPath}/${name}`;
        const result = await ctx.bash.exec("test", { args: ["-f", filePath] });
        if (result.exitCode === 0) {
          const summary = await extractConfigSummary(ctx.bash, filePath, name);

          return {
            success: true,
            found: true,
            configPath: filePath,
            config: summary,
          };
        }
      }

      return {
        success: true,
        found: false,
      };
    },
  });
}

async function extractConfigSummary(
  bash: Pick<Bash, "exec">,
  filePath: string,
  filename: string,
): Promise<I18NConfigSummary | undefined> {
  try {
    let jsonText: string;

    if (filename.endsWith(".jsonc")) {
      const result = await bash.exec("cat", { args: [filePath] });
      if (result.exitCode !== 0) return undefined;
      jsonText = normalizeJsonc(result.stdout);
    } else {
      const result = await bash.exec("yq", { args: ["-o", "json", ".", filePath] });
      if (result.exitCode !== 0) return undefined;
      jsonText = result.stdout;
    }

    const json = JSON.parse(jsonText) as Record<string, unknown>;
    const locales = json.locales as Record<string, unknown> | undefined;
    const buckets = json.buckets as Record<string, unknown> | undefined;
    const storage = json.storage as Record<string, unknown> | undefined;

    return {
      sourceLocale: (locales?.source as string) || "",
      targetLocales: Array.isArray(locales?.targets) ? (locales.targets as string[]) : [],
      buckets: buckets ? Object.keys(buckets) : [],
      storageAdapter: (storage?.adapter as string) || undefined,
    };
  } catch {
    return undefined;
  }
}

export type RepoGitStateOutput = {
  branch: string;
  commit: string;
  isDirty: boolean;
  changedFiles: string[];
};

export function createRepoGitStateTool(ctx: RepoToolContext) {
  return tool({
    description:
      "Inspect the git state of the repository: current branch, commit SHA, and whether the working tree is dirty.",
    inputSchema: z.object({
      path: z.string().optional().describe("Directory to inspect. Defaults to repo root."),
    }),
    execute: async ({ path }) => {
      const dir = path || ".";

      const branchResult = await ctx.bash.exec("git", {
        args: ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"],
      });
      if (branchResult.exitCode !== 0) {
        return {
          success: false,
          error: redact(branchResult.stderr || "Failed to get git branch"),
        };
      }

      const commitResult = await ctx.bash.exec("git", { args: ["-C", dir, "rev-parse", "HEAD"] });
      if (commitResult.exitCode !== 0) {
        return {
          success: false,
          error: redact(commitResult.stderr || "Failed to get git commit"),
        };
      }

      const statusResult = await ctx.bash.exec("git", {
        args: ["-C", dir, "status", "--porcelain"],
      });
      if (statusResult.exitCode !== 0) {
        return {
          success: false,
          error: redact(statusResult.stderr || "Failed to get git status"),
        };
      }

      const branch = branchResult.stdout.trim();
      const commit = commitResult.stdout.trim();
      const statusLines = statusResult.stdout
        .split("\n")
        .map((l) => l.trimEnd())
        .filter(Boolean);
      const isDirty = statusLines.length > 0;
      const changedFiles = statusLines.map((line) => line.slice(3).trim()).filter(Boolean);

      return {
        success: true,
        branch,
        commit,
        isDirty,
        changedFiles,
      };
    },
  });
}

export type RunHyperlocaliseCliOutput = {
  exitCode: number;
  stdout: string;
  stderr: string;
  changedPaths: string[];
  report?: unknown;
  artifact?: { kind: "file"; path: string; note: string } | { kind: "inline"; note: string };
  truncated: boolean;
};

const HL_SUBCOMMANDS = ["check", "status", "extract"] as const;

export function createRunHyperlocaliseCliTool(ctx: RepoToolContext) {
  return tool({
    description:
      "Run an allowlisted hyperlocalise CLI subcommand for read-only repository checks. Does not expose arbitrary shell execution.",
    inputSchema: z.object({
      subcommand: z.enum(HL_SUBCOMMANDS).describe("The subcommand to run."),
      args: z.array(z.string()).optional().describe("Positional arguments."),
      flags: z.record(z.string(), z.string()).optional().describe("Key-value flags (--key=value)."),
      boolFlags: z.array(z.string()).optional().describe("Boolean flags (--flag)."),
    }),
    execute: async ({ subcommand, args, flags, boolFlags }) => {
      assertReadOnlyAction(subcommand, args);
      const commandArgs = buildHlArgs({ subcommand, args, flags, boolFlags });
      const result = await ctx.bash.exec("hl", { args: commandArgs });

      const redactedStdout = redact(result.stdout);
      const redactedStderr = redact(result.stderr);

      const report = extractReport(subcommand, redactedStdout);
      const artifact = summarizeArtifactHint(subcommand, commandArgs, redactedStdout);

      const { text: stdout, truncated: stdoutTruncated } = truncate(
        redactedStdout,
        DEFAULT_MAX_OUTPUT_BYTES,
      );
      const { text: stderr, truncated: stderrTruncated } = truncate(
        redactedStderr,
        DEFAULT_MAX_OUTPUT_BYTES,
      );

      let changedPaths: string[] = [];
      if (result.exitCode === 0 && (subcommand === "check" || subcommand === "extract")) {
        const gitStatus = await ctx.bash.exec("git", { args: ["status", "--porcelain"] });
        if (gitStatus.exitCode === 0) {
          changedPaths = gitStatus.stdout
            .split("\n")
            .map((l) => l.trimEnd())
            .filter(Boolean)
            .map((line) => line.slice(3).trim())
            .filter(Boolean);
        }
      }

      return {
        success: true,
        exitCode: result.exitCode,
        stdout,
        stderr,
        changedPaths,
        report,
        artifact,
        truncated: stdoutTruncated || stderrTruncated,
      };
    },
  });
}

export function buildHlArgs(input: {
  subcommand: string;
  args?: string[];
  flags?: Record<string, string> | undefined;
  boolFlags?: string[] | undefined;
}): string[] {
  const args: string[] = [input.subcommand];

  for (const a of input.args ?? []) {
    if (a.startsWith("-")) {
      throw new Error(`Positional arg "${a}" looks like a flag`);
    }
    validateValue(a);
    args.push(a);
  }

  for (const f of input.boolFlags ?? []) {
    validateFlag(f);
    args.push("--" + f);
  }

  const flagKeys = Object.keys(input.flags ?? {}).sort();
  for (const k of flagKeys) {
    validateFlag(k);
    const v = input.flags![k];
    validateValue(v);
    args.push("--" + k + "=" + v);
  }

  return args;
}

function validateFlag(name: string): void {
  if (DANGEROUS_FLAGS.has(name)) {
    throw new Error(`Flag "${name}" is not allowed`);
  }
  if (name.includes("$") || name.includes("`")) {
    throw new Error(`Flag "${name}" contains invalid characters`);
  }
}

function validateValue(value: string): void {
  if (value.includes("$") || value.includes("`")) {
    throw new Error(`Flag value contains invalid characters`);
  }
}

function extractReport(subcommand: string, stdout: string): unknown {
  if (subcommand !== "check" && subcommand !== "status" && subcommand !== "extract") {
    return undefined;
  }

  const idx = stdout.lastIndexOf("\n{");
  if (idx === -1) {
    const firstIdx = stdout.indexOf("{");
    if (firstIdx === -1) return undefined;
    try {
      return JSON.parse(stdout.slice(firstIdx));
    } catch {
      return undefined;
    }
  }

  try {
    return JSON.parse(stdout.slice(idx + 1));
  } catch {
    return undefined;
  }
}

function assertReadOnlyAction(subcommand: string, args?: string[]): void {
  if (subcommand === "check" || subcommand === "status" || subcommand === "extract") return;

  throw new Error(
    `Only read-only TMS actions are allowed. Received "${subcommand} ${args?.join(" ") ?? ""}".`,
  );
}

function summarizeArtifactHint(
  subcommand: string,
  commandArgs: string[],
  stdout: string,
): RunHyperlocaliseCliOutput["artifact"] {
  const outputFlag = commandArgs.find((arg) => arg.startsWith("--output="));
  if (outputFlag) {
    return {
      kind: "file",
      path: outputFlag.slice("--output=".length),
      note: "Use read to inspect this artifact.",
    };
  }

  if (stdout.length > DEFAULT_MAX_OUTPUT_BYTES / 2 || subcommand === "extract") {
    return {
      kind: "inline",
      note: "Large output detected; prefer --output=<path> for structured artifact capture.",
    };
  }

  return undefined;
}
