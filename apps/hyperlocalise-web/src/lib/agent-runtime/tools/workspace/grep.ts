import { tool } from "ai";
import { z } from "zod";

import { parseGrepLine } from "./parse-grep-line";
import { normalizeWorkspacePath, toShellRelativePath } from "./path";
import { MAX_GREP_LINE_CHARS, MAX_GREP_MATCHES, MAX_GREP_MATCHES_PER_FILE, redact } from "./redact";
import type { RepoToolContext } from "./types";

const TEXT_FILE_INCLUDES = [
  "*.go",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.json",
  "*.jsonc",
  "*.yaml",
  "*.yml",
  "*.md",
  "*.mdx",
  "*.html",
  "*.css",
  "*.po",
  "*.xml",
  "*.csv",
  "*.vue",
  "*.svelte",
  "*.arb",
  "*.xliff",
  "*.strings",
];

type GrepToolResult =
  | {
      success: true;
      pattern: string;
      matchCount: number;
      filesWithMatches: number;
      matches: Array<{ path: string; line: number; content: string }>;
      truncated?: boolean;
    }
  | {
      success: false;
      error: string;
      pattern: string;
      matches: [];
      filesWithMatches: 0;
    };

const grepInputSchema = z.object({
  pattern: z.string().describe("Text or regex pattern to search for."),
  path: z
    .string()
    .optional()
    .describe("Workspace-relative file or directory to search in. Default: repo root."),
  include: z
    .string()
    .optional()
    .describe('Optional file pattern to include in the search (e.g., "*.json", "*.{ts,tsx}").'),
  glob: z.string().optional().describe("Legacy alias for include. Prefer include."),
  caseSensitive: z.boolean().optional().describe("Case-sensitive search. Default: true."),
  regex: z
    .boolean()
    .optional()
    .describe("Use POSIX extended regex (grep -E). Default: false (literal fixed-string search)."),
  maxResults: z
    .number()
    .optional()
    .describe(`Maximum total matches. Default: ${MAX_GREP_MATCHES}.`),
});

export function createGrepTool(ctx: RepoToolContext) {
  return tool({
    description: `Search for patterns in repository files.

WHEN TO USE:
- Finding where a string, key, or message appears
- Locating localized copy before reading files with read

WHEN NOT TO USE:
- Filename-only discovery (use glob instead)
- Reading full files (use read instead)
- Arbitrary shell (use bash only for allowlisted git/ls/hl)

USAGE:
- Prefer literal search (regex: false) for user-quoted UI copy
- Use include to narrow to locale, component, route, or config files
- Results capped at ${MAX_GREP_MATCHES} matches (${MAX_GREP_MATCHES_PER_FILE} per file)
- Skips node_modules and .git

IMPORTANT:
- Always use this tool instead of running grep via bash`,
    inputSchema: grepInputSchema,
    execute: async ({
      pattern,
      path: searchPathInput,
      include,
      glob,
      caseSensitive = true,
      regex = false,
      maxResults,
    }) => {
      const searchPath = normalizeWorkspacePath(searchPathInput ?? ".") ?? ".";
      const limit = maxResults ?? MAX_GREP_MATCHES;
      const includePattern = include ?? glob;
      const includes = includePattern ? [includePattern] : TEXT_FILE_INCLUDES;

      const rgResult = await grepWithRipgrep({
        ctx,
        pattern,
        searchPath,
        includes,
        caseSensitive,
        regex,
        limit,
      });

      if (rgResult) {
        return rgResult;
      }

      return grepWithPosixGrep({
        ctx,
        pattern,
        searchPath,
        includes,
        caseSensitive,
        regex,
        limit,
      });
    },
  });
}

function hasPathGlobMetacharacter(path: string): boolean {
  return path !== "." && /[*?]/.test(path);
}

function hasShellGlobMetacharacter(path: string): boolean {
  return path !== "." && /[*?[]/.test(path);
}

function parseRipgrepLine(line: string) {
  const match = /^(.*?):(\d+):(\d+):(.*)$/.exec(line);
  if (!match) {
    return null;
  }

  const [, path, lineNumber, , content] = match;
  if (!path || !lineNumber || content === undefined) {
    return null;
  }

  return {
    path,
    line: Number.parseInt(lineNumber, 10),
    content,
  };
}

function pathConstrainedRipgrepGlobs(searchPath: string, includes: string[]): string[] {
  if (!hasPathGlobMetacharacter(searchPath)) {
    return includes;
  }

  return includes.map((include) => `${searchPath}/**/${include}`);
}

async function grepWithRipgrep({
  ctx,
  pattern,
  searchPath,
  includes,
  caseSensitive,
  regex,
  limit,
}: {
  ctx: RepoToolContext;
  pattern: string;
  searchPath: string;
  includes: string[];
  caseSensitive: boolean;
  regex: boolean;
  limit: number;
}): Promise<GrepToolResult | null> {
  const args = [
    "--vimgrep",
    "--color",
    "never",
    "--no-follow",
    "--max-count",
    String(MAX_GREP_MATCHES_PER_FILE),
  ];

  if (!caseSensitive) {
    args.push("--ignore-case");
  }
  if (!regex) {
    args.push("--fixed-strings");
  }

  for (const include of pathConstrainedRipgrepGlobs(searchPath, includes)) {
    args.push("--glob", include);
  }
  args.push("--glob", "!node_modules/**", "--glob", "!.git/**");

  args.push(pattern, hasPathGlobMetacharacter(searchPath) ? "." : toShellRelativePath(searchPath));

  const result = await ctx.bash.exec("rg", { args });

  if (result.exitCode >= 2) {
    return null;
  }

  if (result.exitCode === 0 && !result.stdout.trim()) {
    return {
      success: true,
      pattern,
      matchCount: 0,
      filesWithMatches: 0,
      matches: [],
    };
  }

  if (result.exitCode !== 0 && !result.stdout.trim()) {
    return {
      success: true,
      pattern,
      matchCount: 0,
      filesWithMatches: 0,
      matches: [],
    };
  }

  const matches: Array<{ path: string; line: number; content: string }> = [];
  const filesSet = new Set<string>();
  const outputLines = result.stdout.split("\n").filter(Boolean);
  let parsedLineCount = 0;

  for (const line of outputLines) {
    if (matches.length >= limit) {
      break;
    }

    const parsed = parseRipgrepLine(line);
    if (!parsed) {
      continue;
    }

    parsedLineCount += 1;
    filesSet.add(parsed.path);
    matches.push({
      path: parsed.path,
      line: parsed.line,
      content: redact(parsed.content).slice(0, MAX_GREP_LINE_CHARS),
    });
  }

  if (outputLines.length > 0 && parsedLineCount === 0 && limit > 0) {
    return {
      success: false,
      error: "Search returned output, but no match lines could be parsed",
      pattern,
      matches: [],
      filesWithMatches: 0,
    };
  }

  return {
    success: true,
    pattern,
    matchCount: matches.length,
    filesWithMatches: filesSet.size,
    matches,
    truncated: outputLines.length > limit,
  };
}

function findArgs(searchPath: string, includes: string[]): string[] {
  const args = [
    toShellRelativePath(searchPath),
    "-type",
    "f",
    "-not",
    "-path",
    "*/.*",
    "-not",
    "-path",
    "*/node_modules/*",
    "(",
  ];

  includes.forEach((include, index) => {
    if (index > 0) {
      args.push("-o");
    }
    args.push("-name", include.split("/").at(-1) ?? include);
  });

  args.push(")");
  return args;
}

async function grepExactDiscoveredFiles({
  ctx,
  pattern,
  searchPath,
  includes,
  caseSensitive,
  regex,
  limit,
}: {
  ctx: RepoToolContext;
  pattern: string;
  searchPath: string;
  includes: string[];
  caseSensitive: boolean;
  regex: boolean;
  limit: number;
}): Promise<GrepToolResult> {
  const listResult = await ctx.bash.exec("find", { args: findArgs(searchPath, includes) });
  if (listResult.exitCode !== 0 && !listResult.stdout.trim()) {
    return {
      success: false,
      error: redact(listResult.stderr || "Search file discovery failed"),
      pattern,
      matches: [],
      filesWithMatches: 0,
    };
  }

  const files = listResult.stdout.split("\n").filter(Boolean);
  if (files.length === 0) {
    return {
      success: true,
      pattern,
      matchCount: 0,
      filesWithMatches: 0,
      matches: [],
      truncated: false,
    };
  }

  const matches: Array<{ path: string; line: number; content: string }> = [];
  const filesSet = new Set<string>();
  let outputLineCount = 0;
  let parsedLineCount = 0;
  let truncated = false;

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex]!;
    const args = ["-n", "-m", String(MAX_GREP_MATCHES_PER_FILE)];
    if (!caseSensitive) {
      args.push("-i");
    }
    args.push(regex ? "-E" : "-F", pattern, file);

    const result = await ctx.bash.exec("grep", { args });
    if (result.exitCode >= 2) {
      return {
        success: false,
        error: redact(result.stderr || "Search command failed"),
        pattern,
        matches: [],
        filesWithMatches: 0,
      };
    }

    if (result.exitCode !== 0 && !result.stdout.trim()) {
      continue;
    }

    const outputLines = result.stdout.split("\n").filter(Boolean);
    outputLineCount += outputLines.length;

    for (const line of outputLines) {
      if (matches.length >= limit) {
        truncated = true;
        break;
      }

      const parsed = parseGrepLine(line, file);
      if (!parsed) {
        continue;
      }

      parsedLineCount += 1;
      filesSet.add(parsed.path);
      matches.push({
        path: parsed.path,
        line: parsed.line,
        content: redact(parsed.content).slice(0, MAX_GREP_LINE_CHARS),
      });
    }

    if (matches.length >= limit && (outputLineCount > limit || fileIndex < files.length - 1)) {
      truncated = true;
      break;
    }
  }

  if (outputLineCount > 0 && parsedLineCount === 0 && limit > 0) {
    return {
      success: false,
      error: "Search returned output, but no match lines could be parsed",
      pattern,
      matches: [],
      filesWithMatches: 0,
    };
  }

  return {
    success: true,
    pattern,
    matchCount: matches.length,
    filesWithMatches: filesSet.size,
    matches,
    truncated: truncated || outputLineCount > limit,
  };
}

async function grepWithPosixGrep({
  ctx,
  pattern,
  searchPath,
  includes,
  caseSensitive,
  regex,
  limit,
}: {
  ctx: RepoToolContext;
  pattern: string;
  searchPath: string;
  includes: string[];
  caseSensitive: boolean;
  regex: boolean;
  limit: number;
}): Promise<GrepToolResult> {
  if (hasShellGlobMetacharacter(searchPath)) {
    return grepExactDiscoveredFiles({
      ctx,
      pattern,
      searchPath,
      includes,
      caseSensitive,
      regex,
      limit,
    });
  }

  const args = ["-r", "-n", "-m", String(MAX_GREP_MATCHES_PER_FILE)];
  if (!caseSensitive) {
    args.push("-i");
  }
  args.push(regex ? "-E" : "-F");
  args.push("--exclude-dir=node_modules", "--exclude-dir=.git");

  for (const include of includes) {
    args.push(`--include=${include}`);
  }

  args.push(pattern, searchPath === "." ? "." : searchPath);

  const result = await ctx.bash.exec("grep", { args });

  if (result.exitCode >= 2) {
    return {
      success: false,
      error: redact(result.stderr || "Search command failed"),
      pattern,
      matches: [],
      filesWithMatches: 0,
    };
  }

  if (result.exitCode !== 0 && !result.stdout.trim()) {
    return {
      success: true,
      pattern,
      matchCount: 0,
      filesWithMatches: 0,
      matches: [],
    };
  }

  const matches: Array<{ path: string; line: number; content: string }> = [];
  const filesSet = new Set<string>();
  const fileMatchCounts = new Map<string, number>();

  const outputLines = result.stdout.split("\n").filter(Boolean);
  let parsedLineCount = 0;

  for (const line of outputLines) {
    if (matches.length >= limit) {
      break;
    }

    const parsed = parseGrepLine(line, searchPath === "." ? undefined : searchPath);
    if (!parsed) {
      continue;
    }

    parsedLineCount += 1;
    const displayPath = parsed.path;
    const currentFileCount = fileMatchCounts.get(displayPath) ?? 0;
    if (currentFileCount >= MAX_GREP_MATCHES_PER_FILE) {
      continue;
    }

    fileMatchCounts.set(displayPath, currentFileCount + 1);
    filesSet.add(displayPath);
    matches.push({
      path: displayPath,
      line: parsed.line,
      content: redact(parsed.content).slice(0, MAX_GREP_LINE_CHARS),
    });
  }

  if (outputLines.length > 0 && parsedLineCount === 0 && limit > 0) {
    return {
      success: false,
      error: "Search returned output, but no match lines could be parsed",
      pattern,
      matches: [],
      filesWithMatches: 0,
    };
  }

  return {
    success: true,
    pattern,
    matchCount: matches.length,
    filesWithMatches: filesSet.size,
    matches,
    truncated: outputLines.length > limit,
  };
}
