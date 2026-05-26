import { tool } from "ai";
import { z } from "zod";

import { parseGrepLine } from "./parse-grep-line";
import { normalizeWorkspacePath } from "./path";
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

const grepInputSchema = z.object({
  pattern: z.string().describe("Text or regex pattern to search for."),
  path: z
    .string()
    .optional()
    .describe("Workspace-relative file or directory to search in. Default: repo root."),
  glob: z
    .string()
    .optional()
    .describe("Optional glob to filter files (e.g., '*.json', 'locales/**')."),
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
- Use glob to narrow to locales or config files
- Results capped at ${MAX_GREP_MATCHES} matches (${MAX_GREP_MATCHES_PER_FILE} per file)
- Skips node_modules and .git

IMPORTANT:
- Always use this tool instead of running grep via bash`,
    inputSchema: grepInputSchema,
    execute: async ({
      pattern,
      path: searchPathInput,
      glob,
      caseSensitive = true,
      regex = false,
      maxResults,
    }) => {
      const searchPath = normalizeWorkspacePath(searchPathInput ?? ".") ?? ".";
      const limit = maxResults ?? MAX_GREP_MATCHES;

      const args = ["-r", "-n", "-m", String(MAX_GREP_MATCHES_PER_FILE)];
      if (!caseSensitive) {
        args.push("-i");
      }
      args.push(regex ? "-E" : "-F");
      args.push("--exclude-dir=node_modules", "--exclude-dir=.git");

      const includes = glob ? [glob] : TEXT_FILE_INCLUDES;
      for (const include of includes) {
        args.push(`--include=${include}`);
      }

      args.push(pattern, searchPath === "." ? "." : searchPath);

      const result = await ctx.bash.exec("grep", { args });

      if (result.exitCode >= 2) {
        return {
          success: false as const,
          error: redact(result.stderr || "Search command failed"),
          pattern,
          matches: [],
          filesWithMatches: 0,
        };
      }

      if (result.exitCode !== 0 && !result.stdout.trim()) {
        return {
          success: true as const,
          pattern,
          matchCount: 0,
          filesWithMatches: 0,
          matches: [],
        };
      }

      const matches: Array<{ path: string; line: number; content: string }> = [];
      const filesSet = new Set<string>();
      const fileMatchCounts = new Map<string, number>();

      for (const line of result.stdout.split("\n").filter(Boolean)) {
        if (matches.length >= limit) {
          break;
        }

        const parsed = parseGrepLine(line);
        if (!parsed) {
          continue;
        }

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

      return {
        success: true as const,
        pattern,
        matchCount: matches.length,
        filesWithMatches: filesSet.size,
        matches,
        truncated: result.stdout.split("\n").filter(Boolean).length > limit,
      };
    },
  });
}
