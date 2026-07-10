import { tool } from "ai";
import type { Bash } from "just-bash";
import { z } from "zod";

import { DEFAULT_MAX_OUTPUT_BYTES, redact, truncate, type RepoToolContext } from "./workspace";
import { normalizeWorkspacePath } from "./workspace/path";
import { normalizeJsonc } from "@/lib/i18n/parse-jsonc-config";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

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

const GIT_HISTORY_MODES = ["changedFiles", "fileDiff", "entryLog", "blame"] as const;
const DEFAULT_GIT_HISTORY_MAX_RESULTS = 20;
const MAX_GIT_HISTORY_RESULTS = 100;
const CONFIG_CANDIDATES = [
  { kind: "hyperlocalise", path: "i18n.yml", parser: "yaml" },
  { kind: "hyperlocalise", path: "i18n.jsonc", parser: "jsonc" },
  { kind: "crowdin", path: "crowdin.yml", parser: "yaml" },
  { kind: "crowdin", path: "crowdin.yaml", parser: "yaml" },
  { kind: "phrase", path: ".phrase.yml", parser: "yaml" },
  { kind: "phrase", path: "phrase.yml", parser: "yaml" },
  { kind: "phrase", path: "phrase.yaml", parser: "yaml" },
] as const;

type GitHistoryMode = (typeof GIT_HISTORY_MODES)[number];
type ConfigCandidate = (typeof CONFIG_CANDIDATES)[number];
type SourceFileDiscovery = {
  configKind: ConfigCandidate["kind"];
  configPath: string;
  files: string[];
  skippedPatterns: Array<{ pattern: string; reason: string }>;
};

type GitHistoryInput = {
  mode: GitHistoryMode;
  paths?: string[];
  since?: string;
  until?: string;
  range?: string;
  query?: string;
  maxResults?: number;
};

export function createGitHistoryTool(ctx: RepoToolContext) {
  return tool({
    description:
      "Inspect read-only git history for repository localization context. Use changedFiles for time-window discovery, fileDiff for bounded patches, entryLog for commits touching a key/source string, and blame only for current-line provenance.",
    inputSchema: z.object({
      mode: z.enum(GIT_HISTORY_MODES).describe("Git history lookup mode."),
      paths: z
        .array(z.string())
        .optional()
        .describe(
          "Workspace-relative paths. If omitted for changedFiles, source files are discovered from localization config.",
        ),
      since: z.string().optional().describe('Git --since value, for example "1 week ago".'),
      until: z.string().optional().describe("Git --until value."),
      range: z.string().optional().describe("Explicit git revision range, for example main..HEAD."),
      query: z.string().optional().describe("Source string or key for entryLog/blame."),
      maxResults: z.number().int().positive().max(MAX_GIT_HISTORY_RESULTS).optional(),
    }),
    execute: async (input) => executeGitHistory(ctx, input),
  });
}

async function executeGitHistory(ctx: RepoToolContext, input: GitHistoryInput) {
  const maxResults = clampMaxResults(input.maxResults);
  const rangeResult = normalizeGitRevisionRange(input.range);
  if (isErr(rangeResult)) {
    return {
      success: false as const,
      error: rangeResult.error,
    };
  }

  const normalizedInput = { ...input, range: rangeResult.value };
  const normalizedPathsResult = normalizeGitHistoryPaths(input.paths);
  if (isErr(normalizedPathsResult)) {
    return {
      success: false as const,
      error: normalizedPathsResult.error,
    };
  }

  try {
    switch (normalizedInput.mode) {
      case "changedFiles":
        return await changedFilesHistory(
          ctx,
          normalizedInput,
          normalizedPathsResult.value,
          maxResults,
        );
      case "fileDiff":
        return await fileDiffHistory(ctx, normalizedInput, normalizedPathsResult.value, maxResults);
      case "entryLog":
        return await entryLogHistory(ctx, normalizedInput, normalizedPathsResult.value, maxResults);
      case "blame":
        return await blameHistory(ctx, normalizedInput, normalizedPathsResult.value, maxResults);
    }
  } catch (error) {
    return {
      success: false as const,
      error: redact(error instanceof Error ? error.message : String(error)),
    };
  }
}

function clampMaxResults(value: number | undefined): number {
  if (!value) return DEFAULT_GIT_HISTORY_MAX_RESULTS;
  return Math.min(Math.max(value, 1), MAX_GIT_HISTORY_RESULTS);
}

function normalizeGitHistoryPaths(
  paths: string[] | undefined,
): Result<string[] | undefined, string> {
  if (!paths) return ok(undefined);
  const normalized: string[] = [];
  for (const path of paths) {
    const value = normalizeSourcePath(path);
    if (!value) {
      return err(`Path "${path}" must stay within the workspace.`);
    }
    normalized.push(value);
  }
  return ok(Array.from(new Set(normalized)));
}

function normalizeGitRevisionRange(range: string | undefined): Result<string | undefined, string> {
  if (!range) return ok(undefined);
  const normalized = range.trim();
  if (!normalized) return ok(undefined);
  if (normalized.startsWith("-")) {
    return err(`Range "${range}" must be a revision range, not a git option.`);
  }
  return ok(normalized);
}

async function changedFilesHistory(
  ctx: RepoToolContext,
  input: GitHistoryInput,
  providedPaths: string[] | undefined,
  maxResults: number,
) {
  const discovery = providedPaths ? null : await discoverSourceFiles(ctx);
  if (!providedPaths && !discovery) {
    return {
      success: false as const,
      error:
        "No localization config found. Looked for i18n.yml, i18n.jsonc, crowdin.yml, crowdin.yaml, .phrase.yml, phrase.yml, and phrase.yaml.",
    };
  }

  const paths = providedPaths ?? discovery?.files ?? [];
  if (paths.length === 0) {
    return {
      success: true as const,
      mode: "changedFiles" as const,
      files: [],
      discovery,
      truncated: false,
      diagnostics: ["No source files were resolved from localization config."],
    };
  }

  const args = buildGitLogArgs(input, {
    nameOnly: true,
    maxCount: maxResults + 1,
    paths,
  });
  const result = await ctx.bash.exec("git", { args });
  if (result.exitCode !== 0) {
    return {
      success: false as const,
      error: redact(result.stderr || "Failed to read git changed files."),
      discovery,
    };
  }

  const pathSet = new Set(paths);
  const parsedCommits = parseGitNameOnlyCommits(result.stdout);
  const commitLimited = parsedCommits.length > maxResults;
  const changedFileLines =
    parsedCommits.length > 0
      ? parsedCommits.slice(0, maxResults).flatMap((commit) => commit.files)
      : uniqueLines(result.stdout);
  const changedFiles = uniqueLines(changedFileLines.join("\n"))
    .map((line) => normalizeSourcePath(line))
    .filter((line): line is string => Boolean(line))
    .filter((line) => pathSet.has(line));
  const files = changedFiles.slice(0, maxResults);

  return {
    success: true as const,
    mode: "changedFiles" as const,
    files,
    discovery,
    truncated: commitLimited || files.length < changedFiles.length,
  };
}

async function fileDiffHistory(
  ctx: RepoToolContext,
  input: GitHistoryInput,
  paths: string[] | undefined,
  maxResults: number,
) {
  if (!paths || paths.length === 0) {
    return { success: false as const, error: "fileDiff requires at least one path." };
  }

  const args = input.range
    ? ["diff", input.range, "--", ...paths]
    : buildGitLogArgs(input, {
        patch: true,
        maxCount: maxResults,
        paths,
      });
  const result = await ctx.bash.exec("git", { args });
  if (result.exitCode !== 0) {
    return { success: false as const, error: redact(result.stderr || "Failed to read git diff.") };
  }

  const output = truncate(redact(result.stdout), DEFAULT_MAX_OUTPUT_BYTES);
  return {
    success: true as const,
    mode: "fileDiff" as const,
    paths,
    diff: output.text,
    truncated: output.truncated,
  };
}

async function entryLogHistory(
  ctx: RepoToolContext,
  input: GitHistoryInput,
  paths: string[] | undefined,
  maxResults: number,
) {
  const query = input.query?.trim();
  if (!query) {
    return { success: false as const, error: "entryLog requires query." };
  }

  const args = buildGitLogArgs(input, {
    patch: true,
    maxCount: maxResults,
    pickaxe: query,
    paths,
  });
  const result = await ctx.bash.exec("git", { args });
  if (result.exitCode !== 0) {
    return {
      success: false as const,
      error: redact(result.stderr || "Failed to read git entry log."),
    };
  }

  const output = truncate(redact(result.stdout), DEFAULT_MAX_OUTPUT_BYTES);
  return {
    success: true as const,
    mode: "entryLog" as const,
    query,
    paths: paths ?? [],
    log: output.text,
    truncated: output.truncated,
  };
}

async function blameHistory(
  ctx: RepoToolContext,
  input: GitHistoryInput,
  paths: string[] | undefined,
  maxResults: number,
) {
  if (paths && paths.length > 1) {
    return { success: false as const, error: "blame accepts exactly one path." };
  }

  const path = paths?.[0];
  if (!path) {
    return { success: false as const, error: "blame requires a path." };
  }

  const query = input.query?.trim();
  const lineRange = query ? await findLineRangeForQuery(ctx, path, query) : null;
  if (query && !lineRange) {
    return {
      success: true as const,
      mode: "blame" as const,
      path,
      query,
      entries: [],
      truncated: false,
      diagnostics: ["Query was not found in the current file, so blame cannot resolve it."],
    };
  }

  const args = ["blame", "--line-porcelain"];
  if (lineRange) {
    args.push(`-L${lineRange.start},${lineRange.end}`);
  }
  args.push("--", path);

  const result = await ctx.bash.exec("git", { args });
  if (result.exitCode !== 0) {
    return { success: false as const, error: redact(result.stderr || "Failed to read git blame.") };
  }

  const allEntries = parseBlamePorcelain(result.stdout);
  const entries = allEntries.slice(0, maxResults);
  return {
    success: true as const,
    mode: "blame" as const,
    path,
    query,
    entries,
    truncated: entries.length < allEntries.length,
  };
}

function buildGitLogArgs(
  input: Pick<GitHistoryInput, "since" | "until" | "range">,
  options: {
    paths?: string[];
    maxCount?: number;
    nameOnly?: boolean;
    patch?: boolean;
    pickaxe?: string;
  },
): string[] {
  const args = ["log", "--date=iso-strict", "--format=%H%x09%ad%x09%an%x09%s"];
  if (options.maxCount) {
    args.push(`--max-count=${options.maxCount}`);
  }
  if (input.since) {
    args.push(`--since=${input.since}`);
  }
  if (input.until) {
    args.push(`--until=${input.until}`);
  }
  if (options.nameOnly) {
    args.push("--name-only");
  }
  if (options.patch) {
    args.push("--patch", "--unified=3");
  }
  if (options.pickaxe) {
    args.push(`-S${options.pickaxe}`);
  }
  if (input.range) {
    args.push(input.range);
  }
  if (options.paths && options.paths.length > 0) {
    args.push("--", ...options.paths);
  }
  return args;
}

async function discoverSourceFiles(ctx: RepoToolContext): Promise<SourceFileDiscovery | null> {
  for (const candidate of CONFIG_CANDIDATES) {
    const exists = await ctx.bash.exec("test", { args: ["-f", candidate.path] });
    if (exists.exitCode !== 0) {
      continue;
    }

    const json = await readConfigAsJson(ctx, candidate);
    if (!json) {
      return {
        configKind: candidate.kind,
        configPath: candidate.path,
        files: [],
        skippedPatterns: [{ pattern: candidate.path, reason: "Config could not be parsed." }],
      };
    }

    const patterns = extractSourcePatterns(candidate.kind, json);
    const skippedPatterns: Array<{ pattern: string; reason: string }> = [];
    const files: string[] = [];
    for (const pattern of patterns) {
      const expanded = await expandSourcePattern(ctx, pattern);
      files.push(...expanded.files);
      skippedPatterns.push(...expanded.skippedPatterns);
    }

    return {
      configKind: candidate.kind,
      configPath: candidate.path,
      files: Array.from(new Set(files)).sort(),
      skippedPatterns,
    };
  }

  return null;
}

async function readConfigAsJson(
  ctx: RepoToolContext,
  candidate: ConfigCandidate,
): Promise<Record<string, unknown> | null> {
  try {
    let jsonText: string;
    if (candidate.parser === "jsonc") {
      jsonText = normalizeJsonc(await ctx.bash.readFile(candidate.path));
    } else {
      const result = await ctx.bash.exec("yq", { args: ["-o", "json", ".", candidate.path] });
      if (result.exitCode !== 0) return null;
      jsonText = result.stdout;
    }
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractSourcePatterns(
  kind: ConfigCandidate["kind"],
  json: Record<string, unknown>,
): string[] {
  switch (kind) {
    case "hyperlocalise":
      return extractHyperlocaliseSourcePatterns(json);
    case "crowdin":
      return extractCrowdinSourcePatterns(json);
    case "phrase":
      return extractPhraseSourcePatterns(json);
  }
}

function extractHyperlocaliseSourcePatterns(json: Record<string, unknown>): string[] {
  const sourceLocale = readNestedString(json, ["locales", "source"]);
  const buckets = json.buckets;
  if (!buckets || typeof buckets !== "object" || Array.isArray(buckets)) return [];

  const patterns: string[] = [];
  for (const bucket of Object.values(buckets)) {
    if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
    const files = (bucket as { files?: unknown }).files;
    if (!Array.isArray(files)) continue;
    for (const file of files) {
      if (!file || typeof file !== "object" || Array.isArray(file)) continue;
      const from = (file as { from?: unknown }).from;
      if (typeof from === "string") {
        patterns.push(expandHyperlocaliseSourcePattern(from, sourceLocale));
      }
    }
  }
  return patterns;
}

function expandHyperlocaliseSourcePattern(pattern: string, sourceLocale: string | null): string {
  if (!sourceLocale) return pattern;
  return pattern
    .replaceAll("{{source}}", sourceLocale)
    .replaceAll("{{locale}}", sourceLocale)
    .replaceAll("[locale]", sourceLocale);
}

function extractCrowdinSourcePatterns(json: Record<string, unknown>): string[] {
  const basePath = readString(json.base_path);
  const files = json.files;
  if (!Array.isArray(files)) return [];
  return files
    .map((file) =>
      file && typeof file === "object" && !Array.isArray(file)
        ? readString((file as { source?: unknown }).source)
        : null,
    )
    .filter((source): source is string => Boolean(source))
    .map((source) => joinConfigPath(basePath, source.replace(/^\/+/, "")));
}

function extractPhraseSourcePatterns(json: Record<string, unknown>): string[] {
  const phrase = json.phrase;
  if (!phrase || typeof phrase !== "object" || Array.isArray(phrase)) return [];
  const sources = ((phrase as { push?: { sources?: unknown } }).push?.sources ?? []) as unknown;
  if (!Array.isArray(sources)) return [];
  return sources
    .map((source) =>
      source && typeof source === "object" && !Array.isArray(source)
        ? readString((source as { file?: unknown }).file)
        : null,
    )
    .filter((file): file is string => Boolean(file));
}

async function expandSourcePattern(
  ctx: RepoToolContext,
  pattern: string,
): Promise<{
  files: string[];
  skippedPatterns: Array<{ pattern: string; reason: string }>;
}> {
  if (/<[^>]+>/.test(pattern)) {
    return {
      files: [],
      skippedPatterns: [{ pattern, reason: "Pattern contains unresolved Phrase placeholder." }],
    };
  }

  const normalizedPattern = normalizeSourcePath(pattern);
  if (!normalizedPattern) {
    return {
      files: [],
      skippedPatterns: [{ pattern, reason: "Pattern escapes the workspace." }],
    };
  }

  const result = await ctx.bash.exec("git", { args: ["ls-files", "--", normalizedPattern] });
  if (result.exitCode !== 0) {
    return {
      files: [],
      skippedPatterns: [{ pattern, reason: redact(result.stderr || "git ls-files failed.") }],
    };
  }

  const files = uniqueLines(result.stdout)
    .map((line) => normalizeSourcePath(line))
    .filter((line): line is string => Boolean(line));
  if (files.length > 0) {
    return { files, skippedPatterns: [] };
  }

  if (hasGlobCharacters(normalizedPattern)) {
    return {
      files: [],
      skippedPatterns: [{ pattern, reason: "Glob did not match any git-tracked source files." }],
    };
  }

  return { files: [normalizedPattern], skippedPatterns: [] };
}

function normalizeSourcePath(path: string): string | null {
  const normalized = path.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  return normalizeWorkspacePath(normalized);
}

function joinConfigPath(basePath: string | null, path: string): string {
  if (!basePath) return path;
  return `${basePath.replace(/^\/+|\/+$/g, "")}/${path}`;
}

function hasGlobCharacters(pattern: string): boolean {
  return /[*?[\]{}]/.test(pattern);
}

function uniqueLines(output: string): string[] {
  return Array.from(
    new Set(
      output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  );
}

function parseGitNameOnlyCommits(output: string): Array<{ files: string[] }> {
  const commits: Array<{ files: string[] }> = [];
  let current: { files: string[] } | null = null;

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^[0-9a-f]{40}\t/i.test(line)) {
      current = { files: [] };
      commits.push(current);
      continue;
    }
    current?.files.push(line);
  }

  return commits;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNestedString(json: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = json;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return readString(current);
}

async function findLineRangeForQuery(
  ctx: RepoToolContext,
  path: string,
  query: string,
): Promise<{ start: number; end: number } | null> {
  const content = await ctx.bash.readFile(path);
  const lines = content.split("\n");
  const index = lines.findIndex((line) => line.includes(query));
  if (index < 0) return null;
  const line = index + 1;
  return { start: line, end: line };
}

type BlameEntry = {
  commit: string;
  author?: string;
  authorTime?: string;
  summary?: string;
  line?: string;
};

function parseBlamePorcelain(output: string): BlameEntry[] {
  const entries: BlameEntry[] = [];
  let current: BlameEntry | null = null;

  for (const line of output.split("\n")) {
    const header = line.match(/^([0-9a-f]{7,40})\s+\d+\s+\d+/i);
    if (header) {
      if (current) entries.push(current);
      current = { commit: header[1] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("author ")) {
      current.author = line.slice("author ".length);
    } else if (line.startsWith("author-time ")) {
      current.authorTime = line.slice("author-time ".length);
    } else if (line.startsWith("summary ")) {
      current.summary = line.slice("summary ".length);
    } else if (line.startsWith("\t")) {
      current.line = redact(line.slice(1));
    }
  }

  if (current) entries.push(current);
  return entries;
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
      const commandArgsResult = buildHlArgs({ subcommand, args, flags, boolFlags });
      if (isErr(commandArgsResult)) {
        return {
          success: false,
          error: formatHyperlocaliseCliArgsError(commandArgsResult.error),
        };
      }

      const commandArgs = commandArgsResult.value;
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

export type HyperlocaliseCliArgsError =
  | { code: "invalid_subcommand"; subcommand: string; args?: string[] }
  | { code: "positional_arg_looks_like_flag"; value: string }
  | { code: "flag_not_allowed"; name: string }
  | { code: "flag_contains_invalid_characters"; name: string }
  | { code: "flag_value_contains_invalid_characters" };

export function formatHyperlocaliseCliArgsError(error: HyperlocaliseCliArgsError): string {
  switch (error.code) {
    case "invalid_subcommand":
      return `Only read-only TMS actions are allowed. Received "${error.subcommand} ${error.args?.join(" ") ?? ""}".`;
    case "positional_arg_looks_like_flag":
      return `Positional arg "${error.value}" looks like a flag`;
    case "flag_not_allowed":
      return `Flag "${error.name}" is not allowed`;
    case "flag_contains_invalid_characters":
      return `Flag "${error.name}" contains invalid characters`;
    case "flag_value_contains_invalid_characters":
      return "Flag value contains invalid characters";
  }
}

export function buildHlArgs(input: {
  subcommand: string;
  args?: string[];
  flags?: Record<string, string> | undefined;
  boolFlags?: string[] | undefined;
}): Result<string[], HyperlocaliseCliArgsError> {
  const readOnlyActionResult = validateReadOnlyAction(input.subcommand, input.args);
  if (isErr(readOnlyActionResult)) {
    return err(readOnlyActionResult.error);
  }

  const args: string[] = [input.subcommand];

  for (const a of input.args ?? []) {
    if (a.startsWith("-")) {
      return err({ code: "positional_arg_looks_like_flag", value: a });
    }
    const valueResult = validateValue(a);
    if (isErr(valueResult)) {
      return err(valueResult.error);
    }
    args.push(a);
  }

  for (const f of input.boolFlags ?? []) {
    const flagResult = validateFlag(f);
    if (isErr(flagResult)) {
      return err(flagResult.error);
    }
    args.push("--" + f);
  }

  const flagKeys = Object.keys(input.flags ?? {}).sort();
  for (const k of flagKeys) {
    const flagResult = validateFlag(k);
    if (isErr(flagResult)) {
      return err(flagResult.error);
    }
    const v = input.flags![k];
    const valueResult = validateValue(v);
    if (isErr(valueResult)) {
      return err(valueResult.error);
    }
    args.push("--" + k + "=" + v);
  }

  return ok(args);
}

function validateFlag(name: string): Result<void, HyperlocaliseCliArgsError> {
  if (DANGEROUS_FLAGS.has(name)) {
    return err({ code: "flag_not_allowed", name });
  }
  if (name.includes("$") || name.includes("`")) {
    return err({ code: "flag_contains_invalid_characters", name });
  }
  return ok(undefined);
}

function validateValue(value: string): Result<void, HyperlocaliseCliArgsError> {
  if (value.includes("$") || value.includes("`")) {
    return err({ code: "flag_value_contains_invalid_characters" });
  }
  return ok(undefined);
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

function validateReadOnlyAction(
  subcommand: string,
  args?: string[],
): Result<void, HyperlocaliseCliArgsError> {
  if (subcommand === "check" || subcommand === "status" || subcommand === "extract") {
    return ok(undefined);
  }

  return err({ code: "invalid_subcommand", subcommand, args });
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
