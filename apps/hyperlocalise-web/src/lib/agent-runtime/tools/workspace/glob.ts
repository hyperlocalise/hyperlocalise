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
- pattern is matched against file names (e.g., "**/*.json" → name "*.json" with directory prefix)
- Skips hidden paths and node_modules
- Results limited by limit (default ${DEFAULT_GLOB_LIMIT})`,
    inputSchema: globInputSchema,
    execute: async ({ pattern, path: basePathInput, limit = DEFAULT_GLOB_LIMIT }) => {
      const basePath = normalizeWorkspacePath(basePathInput ?? ".") ?? ".";
      const { searchDirSuffix, namePattern } = namePatternFromGlob(pattern);
      const searchDir =
        searchDirSuffix.length === 0
          ? basePath
          : basePath === "."
            ? searchDirSuffix.join("/")
            : `${basePath}/${searchDirSuffix.join("/")}`;

      const hasRecursive = pattern.includes("**");
      const findArgs = [toShellRelativePath(searchDir)];
      if (!hasRecursive) {
        const dirWildcards = pattern
          .split("/")
          .filter(Boolean)
          .slice(0, -1)
          .filter((segment) => segment.includes("*")).length;
        if (dirWildcards === 0 && !pattern.includes("/")) {
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
        return {
          success: false as const,
          error: result.stderr ? result.stderr.slice(0, 500) : "Glob search failed",
          pattern,
          files: [],
        };
      }

      const files = result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, limit)
        .map((filePath) => ({ path: filePath }));

      return {
        success: true as const,
        pattern,
        baseDir: basePath,
        count: files.length,
        files,
        truncated: result.stdout.split("\n").filter(Boolean).length > limit,
      };
    },
  });
}
