import { tool } from "ai";
import { z } from "zod";

import { parseGrepLine } from "./parse-grep-line";
import { normalizeWorkspacePath, toShellRelativePath } from "./path";
import { MAX_GREP_LINE_CHARS, redact } from "./redact";
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

const DEFAULT_MAX_FUZZY_RESULTS = 25;
const DEFAULT_MAX_FUZZY_FILES = 1_000;

const fuzzySearchInputSchema = z.object({
  query: z.string().describe("Short source text, UI label, key, or token to fuzzy-match."),
  path: z
    .string()
    .optional()
    .describe("Workspace-relative directory to search in. Default: repo root."),
  maxResults: z
    .number()
    .optional()
    .describe(`Maximum total fuzzy matches. Default: ${DEFAULT_MAX_FUZZY_RESULTS}.`),
  maxFiles: z
    .number()
    .optional()
    .describe(`Maximum text-like files to scan. Default: ${DEFAULT_MAX_FUZZY_FILES}.`),
});

type FuzzyMatch = {
  path: string;
  line: number;
  content: string;
  matchedText: string;
  reason: string;
  score: number;
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokenize(value: string): string[] {
  return value.match(/[A-Za-z0-9]+/g) ?? [];
}

function queryVariants(query: string): string[] {
  const normalized = normalizeToken(query);
  const variants = new Set([normalized]);

  if (normalized.endsWith("e") && normalized.length > 4) {
    variants.add(normalized.slice(0, -1));
  }
  if (normalized.endsWith("ing") && normalized.length > 6) {
    variants.add(normalized.slice(0, -3));
  }
  if (normalized.endsWith("ed") && normalized.length > 5) {
    variants.add(normalized.slice(0, -2));
  }

  return [...variants].filter((variant) => variant.length >= 3);
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from<number>({ length: b.length + 1 });

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length] ?? 0;
}

function scoreToken(
  query: string,
  token: string,
): Omit<FuzzyMatch, "path" | "line" | "content"> | null {
  const normalizedQuery = normalizeToken(query);
  const normalizedToken = normalizeToken(token);
  if (normalizedQuery.length < 3 || normalizedToken.length < 3) {
    return null;
  }

  if (normalizedToken.includes(normalizedQuery)) {
    return { matchedText: token, reason: "contains query", score: 1 };
  }

  const variants = queryVariants(query);
  for (const variant of variants) {
    if (
      (normalizedToken.startsWith(variant) || variant.startsWith(normalizedToken)) &&
      Math.min(variant.length, normalizedToken.length) >= 4
    ) {
      return { matchedText: token, reason: "shared stem/prefix", score: 0.9 };
    }
  }

  const lengthDelta = Math.abs(normalizedQuery.length - normalizedToken.length);
  if (lengthDelta <= 2) {
    const distance = levenshteinDistance(normalizedQuery, normalizedToken);
    const maxDistance = Math.max(1, Math.floor(normalizedQuery.length * 0.25));
    if (distance <= maxDistance) {
      return { matchedText: token, reason: `edit distance ${distance}`, score: 0.75 };
    }
  }

  return null;
}

function bestLineMatch(query: string, line: string) {
  const compactLine = normalizeToken(line);
  const normalizedQuery = normalizeToken(query);
  if (normalizedQuery.length >= 3 && compactLine.includes(normalizedQuery)) {
    return { matchedText: query, reason: "line contains compact query", score: 1 };
  }

  return (
    tokenize(line)
      .map((token) => scoreToken(query, token))
      .filter((match): match is Omit<FuzzyMatch, "path" | "line" | "content"> => match !== null)
      .sort((a, b) => b.score - a.score)[0] ?? null
  );
}

function findArgs(searchPath: string) {
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

  TEXT_FILE_INCLUDES.forEach((include, index) => {
    if (index > 0) {
      args.push("-o");
    }
    args.push("-name", include);
  });

  args.push(")");
  return args;
}

function displayPath(path: string): string {
  return path.startsWith("./") ? path.slice(2) : path;
}

export function createFuzzySearchTool(ctx: RepoToolContext) {
  return tool({
    description: `Fuzzy-match short UI labels, keys, and source text in repository files.

WHEN TO USE:
- Exact grep and case-insensitive grep did not find a short UI label
- Looking for nearby variants such as Configure/configuration/configured/config
- Finding likely route, navigation, component, locale, or config context before reading files

WHEN NOT TO USE:
- Exact matches are available (use grep first)
- Reading full files (use read)

USAGE:
- Results are heuristic and must be verified by reading surrounding files
- Scans text-like files only, skipping node_modules and hidden paths`,
    inputSchema: fuzzySearchInputSchema,
    execute: async ({
      query,
      path: searchPathInput,
      maxResults = DEFAULT_MAX_FUZZY_RESULTS,
      maxFiles = DEFAULT_MAX_FUZZY_FILES,
    }) => {
      const searchPath = normalizeWorkspacePath(searchPathInput ?? ".") ?? ".";
      const listResult = await ctx.bash.exec("find", { args: findArgs(searchPath) });
      if (listResult.exitCode !== 0 && !listResult.stdout.trim()) {
        return {
          success: false as const,
          error: redact(listResult.stderr || "Fuzzy search file discovery failed"),
          query,
          matches: [],
        };
      }

      const files = listResult.stdout.split("\n").filter(Boolean).slice(0, maxFiles);
      const matches: FuzzyMatch[] = [];

      for (const filePath of files) {
        if (matches.length >= maxResults) {
          break;
        }

        const file = await ctx.bash.readFile(filePath).catch(() => null);
        if (file === null) {
          continue;
        }

        const lines = file.split("\n");
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index] ?? "";
          const match = bestLineMatch(query, line);
          if (!match) {
            continue;
          }

          const parsed = parseGrepLine(`${filePath}:${index + 1}:${line}`);
          if (!parsed) {
            continue;
          }

          matches.push({
            path: displayPath(parsed.path),
            line: parsed.line,
            content: redact(parsed.content).slice(0, MAX_GREP_LINE_CHARS),
            matchedText: match.matchedText,
            reason: match.reason,
            score: match.score,
          });

          if (matches.length >= maxResults) {
            break;
          }
        }
      }

      return {
        success: true as const,
        query,
        scannedFiles: files.length,
        matches: matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)),
        truncated: listResult.stdout.split("\n").filter(Boolean).length > files.length,
      };
    },
  });
}
