import { tool } from "ai";
import { Bash } from "just-bash";
import { z } from "zod";

// Default limits before truncation.
const DEFAULT_MAX_FILE_BYTES = 500_000;
const DEFAULT_MAX_OUTPUT_BYTES = 100_000;

// Dangerous flags that are never allowed.
const DANGEROUS_FLAGS = new Set([
  "token",
  "api-token",
  "project-key",
  "api-key",
  "secret",
  "password",
  "private-key",
]);

// Sensitive environment variable prefixes to redact.
const SENSITIVE_ENV_PREFIXES = [
  "HYPERLOCALISE_API_TOKEN=",
  "HYPERLOCALISE_PROJECT_KEY=",
  "CROWDIN_API_TOKEN=",
  "CROWDIN_PROJECT_KEY=",
  "LOKALISE_API_TOKEN=",
  "PHRASE_API_TOKEN=",
  "SMARTLING_API_TOKEN=",
  "SMARTLING_API_SECRET=",
  "OPENAI_API_KEY=",
  "ANTHROPIC_API_KEY=",
  "AZURE_OPENAI_API_KEY=",
  "GEMINI_API_KEY=",
  "MISTRAL_API_KEY=",
  "GROQ_API_KEY=",
  "AWS_ACCESS_KEY_ID=",
  "AWS_SECRET_ACCESS_KEY=",
];

// Regex for token-like key=value patterns.
const TOKEN_PATTERN =
  /(\b[a-z0-9_]*(?:token|key|secret|password|api_key|apikey|auth)[a-z0-9_]*\s*[:=]\s*)([a-zA-Z0-9_\-./+]{20,})/gi;

// Regex for Bearer tokens.
const BEARER_PATTERN = /(Bearer\s+)([a-zA-Z0-9_\-./+]{20,})/gi;

export type RepoToolContext = {
  bash: Bash;
};

/**
 * Redact sensitive values from tool output.
 */
export function redact(input: string): string {
  if (!input) return "";

  let out = input;

  // Redact known environment variable lines.
  for (const prefix of SENSITIVE_ENV_PREFIXES) {
    out = out
      .split("\n")
      .map((line) => (line.startsWith(prefix) ? prefix + "***REDACTED***" : line))
      .join("\n");
  }

  // Redact token-like key=value patterns.
  out = out.replace(TOKEN_PATTERN, "$1***REDACTED***");

  // Redact Bearer tokens.
  out = out.replace(BEARER_PATTERN, "$1***REDACTED***");

  return out;
}

/**
 * Truncate a string to maxBytes length.
 */
function truncate(input: string, maxBytes: number): { text: string; truncated: boolean } {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  if (bytes.length <= maxBytes) {
    return { text: input, truncated: false };
  }
  const truncatedBytes = bytes.slice(0, maxBytes);
  // Decode safely, replacing invalid sequences.
  const text = new TextDecoder("utf-8", { fatal: false }).decode(truncatedBytes);
  return { text, truncated: true };
}

/**
 * Read a file inside the repo sandbox.
 */
export function createReadRepoFileTool(ctx: RepoToolContext) {
  return tool({
    description:
      "Read the contents of a file in the repository. Returns an error for binary files or paths outside the repo.",
    inputSchema: z.object({
      path: z.string().describe("Relative path to the file within the repo."),
      maxBytes: z.number().optional().describe("Maximum bytes to read. Defaults to 500KB."),
      offset: z.number().optional().describe("Byte offset to start reading from."),
    }),
    execute: async ({ path, maxBytes, offset }) => {
      const limit = maxBytes ?? DEFAULT_MAX_FILE_BYTES;
      const off = offset ?? 0;

      try {
        const raw = await ctx.bash.readFile(path);
        const encoder = new TextEncoder();
        const allBytes = encoder.encode(raw);

        if (off >= allBytes.length) {
          return {
            success: true,
            content: "",
            byteLen: allBytes.length,
            truncated: false,
          };
        }

        const slice = allBytes.slice(off, off + limit);
        const content = new TextDecoder("utf-8", { fatal: false }).decode(slice);
        const { text, truncated } = truncate(redact(content), limit);

        return {
          success: true,
          content: text,
          byteLen: allBytes.length,
          truncated: truncated || off + limit < allBytes.length,
        };
      } catch (err) {
        return {
          success: false,
          error: redact(String(err)),
        };
      }
    },
  });
}

export type RepoSearchMatch = {
  path: string;
  lineNum: number;
  line: string;
};

/**
 * Search for a literal text pattern in text files under the given path.
 */
export function createSearchRepoFilesTool(ctx: RepoToolContext) {
  return tool({
    description:
      "Search for a literal text pattern in text files within the repository. Skips binary files, node_modules, and .git.",
    inputSchema: z.object({
      pattern: z.string().describe("The literal text pattern to search for."),
      path: z.string().optional().describe("Directory to search in. Defaults to repo root."),
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of matches to return. Defaults to 100."),
    }),
    execute: async ({ pattern, path, maxResults }) => {
      const searchPath = path || ".";
      const limit = maxResults ?? 100;

      const result = await ctx.bash.exec("grep", {
        args: [
          "-r",
          "-n",
          "-F",
          "--exclude-dir=node_modules",
          "--exclude-dir=.git",
          "--include=*.go",
          "--include=*.ts",
          "--include=*.tsx",
          "--include=*.js",
          "--include=*.jsx",
          "--include=*.json",
          "--include=*.jsonc",
          "--include=*.yaml",
          "--include=*.yml",
          "--include=*.md",
          "--include=*.mdx",
          "--include=*.html",
          "--include=*.css",
          "--include=*.po",
          "--include=*.xml",
          "--include=*.csv",
          "--include=*.vue",
          "--include=*.svelte",
          pattern,
          searchPath,
        ],
      });

      if (result.exitCode >= 2) {
        return {
          success: false,
          error: redact(result.stderr || "Search command failed"),
          matches: [],
          truncated: false,
        };
      }
      if (result.exitCode !== 0 && result.stdout === "") {
        return {
          success: true,
          matches: [],
          truncated: false,
        };
      }

      const lines = result.stdout.split("\n").filter(Boolean);
      const matches: RepoSearchMatch[] = [];
      let truncated = false;

      for (const line of lines.slice(0, limit)) {
        const colonIdx = line.indexOf(":");
        const colonIdx2 = line.indexOf(":", colonIdx + 1);
        if (colonIdx === -1 || colonIdx2 === -1) continue;

        const filePath = line.slice(0, colonIdx);
        const lineNum = Number(line.slice(colonIdx + 1, colonIdx2));
        const content = redact(line.slice(colonIdx2 + 1));

        matches.push({ path: filePath, lineNum, line: content });
      }

      if (lines.length > limit) {
        truncated = true;
      }

      return {
        success: true,
        matches,
        truncated,
      };
    },
  });
}

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
          // Try to parse the config file.
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
  bash: Bash,
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
      // Convert YAML to JSON using yq.
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

function normalizeJsonc(input: string): string {
  return stripTrailingJsonCommas(stripJsoncComments(input));
}

function stripJsoncComments(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const next = input[i + 1];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      while (i < input.length && input[i] !== "\n") {
        i++;
      }
      if (i < input.length) {
        output += "\n";
      }
      continue;
    }

    if (char === "/" && next === "*") {
      i += 2;
      while (i < input.length - 1 && !(input[i] === "*" && input[i + 1] === "/")) {
        if (input[i] === "\n") {
          output += "\n";
        }
        i++;
      }
      i++;
      continue;
    }

    output += char;
  }

  return output;
}

function stripTrailingJsonCommas(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) {
        j++;
      }
      if (input[j] === "}" || input[j] === "]") {
        continue;
      }
    }

    output += char;
  }

  return output;
}

export type RepoGitStateOutput = {
  branch: string;
  commit: string;
  isDirty: boolean;
  changedFiles: string[];
};

/**
 * Inspect the git state of the repository.
 */
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
  truncated: boolean;
};

const HL_SUBCOMMANDS = ["check", "status", "extract", "crowdin", "lokalise", "phrase"] as const;
const READ_ONLY_TMS_ACTIONS = new Set([
  "config",
  "check",
  "translations:download",
  "glossary:download",
  "tm:download",
]);

/**
 * Run an allowlisted hyperlocalise CLI subcommand with structured inputs.
 */
export function createRunHyperlocaliseCliTool(ctx: RepoToolContext) {
  return tool({
    description:
      "Run an allowlisted hyperlocalise CLI subcommand for read-only repo/TMS checks. Does not expose arbitrary shell execution.",
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

  const actionKey = [args?.[0], args?.[1]].filter(Boolean).join(":");
  if (!READ_ONLY_TMS_ACTIONS.has(actionKey)) {
    throw new Error(
      `Only read-only TMS actions are allowed. Received "${subcommand} ${args?.join(" ") ?? ""}".`,
    );
  }
}

function summarizeArtifactHint(subcommand: string, commandArgs: string[], stdout: string) {
  const outputFlag = commandArgs.find((arg) => arg.startsWith("--output="));
  if (outputFlag) {
    return {
      kind: "file",
      path: outputFlag.slice("--output=".length),
      note: "Use readRepoFile or readStoredFile to inspect this artifact.",
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
