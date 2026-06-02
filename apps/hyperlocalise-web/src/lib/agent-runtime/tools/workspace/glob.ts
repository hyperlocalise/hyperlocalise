import { tool } from "ai";
import { z } from "zod";

import { normalizeWorkspacePath, toShellRelativePath } from "./path";
import { DEFAULT_GLOB_LIMIT } from "./redact";
import type { RepoToolContext } from "./types";

const globInputSchema = z.object({
  pattern: z.string().describe("Glob pattern for the file name (e.g., '*.json', '*.po')."),
  path: z
    .string()
    .optional()
    .describe("Workspace-relative directory to search from. Default: repo root."),
  limit: z
    .number()
    .optional()
    .describe(`Maximum number of files to return. Default: ${DEFAULT_GLOB_LIMIT}.`),
});

function namePatternFromGlob(pattern: string): { searchDirSuffix: string[]; namePattern: string } {
  const parts = pattern.split("/").filter(Boolean);
  const namePattern = parts.at(-1) ?? "*";
  const literalPrefix: string[] = [];

  for (let index = 0; index < parts.length - 1; index++) {
    const part = parts[index]!;
    if (part.includes("*") || part.includes("?") || part.includes("[")) {
      break;
    }
    literalPrefix.push(part);
  }

  return { searchDirSuffix: literalPrefix, namePattern };
}

export function createGlobTool(ctx: RepoToolContext) {
  return tool({
    description: `Find files matching a glob pattern in the repository.

WHEN TO USE:
- Discover locale files, configs, or assets by extension
- Narrow down paths before grep or read

WHEN NOT TO USE:
- Searching inside file contents (use grep)
- Reading file contents (use read)

USAGE:
- pattern uses ripgrep-style glob syntax (e.g., "**/*.json", "locales/*.json")
- Skips hidden paths and node_modules
- Results limited by limit (default ${DEFAULT_GLOB_LIMIT})`,
    inputSchema: globInputSchema,
    execute: async ({ pattern, path: basePathInput, limit = DEFAULT_GLOB_LIMIT }) => {
      const basePath = normalizeWorkspacePath(basePathInput ?? ".") ?? ".";

      const rgResult = await listWithRipgrep(ctx, {
        pattern,
        basePath,
        limit,
      });

      if (rgResult) {
        return rgResult;
      }

      const findResult = await listWithFind(ctx, {
        pattern,
        basePath,
        limit,
      });

      if (!findResult) {
        return {
          success: false as const,
          error: "Glob search failed",
          pattern,
          files: [],
        };
      }

      return findResult;
    },
  });
}

async function listWithRipgrep(
  ctx: RepoToolContext,
  input: { pattern: string; basePath: string; limit: number },
) {
  const args = [
    "--files",
    "--glob",
    input.pattern,
    "--glob",
    "!node_modules/**",
    "--glob",
    "!.git/**",
    toShellRelativePath(input.basePath),
  ];
  const result = await ctx.bash.exec("rg", { args });
  if (result.exitCode >= 2) {
    return null;
  }

  const lines = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const files = lines.slice(0, input.limit).map((filePath) => ({ path: filePath }));

  return {
    success: true as const,
    pattern: input.pattern,
    baseDir: input.basePath,
    count: files.length,
    files,
    truncated: lines.length > input.limit,
  };
}

async function listWithFind(
  ctx: RepoToolContext,
  input: { pattern: string; basePath: string; limit: number },
) {
  const { searchDirSuffix, namePattern } = namePatternFromGlob(input.pattern);
  const searchDir =
    searchDirSuffix.length === 0
      ? input.basePath
      : input.basePath === "."
        ? searchDirSuffix.join("/")
        : `${input.basePath}/${searchDirSuffix.join("/")}`;

  const hasRecursive = input.pattern.includes("**");
  const findArgs = [toShellRelativePath(searchDir)];
  if (!hasRecursive) {
    const dirWildcards = input.pattern
      .split("/")
      .filter(Boolean)
      .slice(0, -1)
      .filter((segment) => segment.includes("*")).length;
    if (dirWildcards === 0 && !input.pattern.includes("/")) {
      findArgs.unshift("-maxdepth", "1");
    }
  }

  findArgs.push(
    "-type",
    "f",
    "-not",
    "-path",
    "*/.*",
    "-not",
    "-path",
    "*/node_modules/*",
    "-name",
    namePattern,
  );

  const result = await ctx.bash.exec("find", { args: findArgs });
  if (result.exitCode !== 0 && !result.stdout.trim()) {
    return null;
  }

  const lines = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const files = lines.slice(0, input.limit).map((filePath) => ({ path: filePath }));

  return {
    success: true as const,
    pattern: input.pattern,
    baseDir: input.basePath,
    count: files.length,
    files,
    truncated: lines.length > input.limit,
  };
}
