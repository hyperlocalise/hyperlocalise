import { tool } from "ai";
import { z } from "zod";

import { normalizeWorkspacePath } from "./path";
import { DEFAULT_READ_LINE_LIMIT, redact } from "./redact";
import type { RepoToolContext } from "./types";

const readInputSchema = z.object({
  filePath: z
    .string()
    .describe("Workspace-relative path to the file to read (e.g., locales/en.json)."),
  offset: z
    .number()
    .optional()
    .describe("Line number to start reading from (1-indexed). Default: 1."),
  limit: z
    .number()
    .optional()
    .describe(`Maximum number of lines to read. Default: ${DEFAULT_READ_LINE_LIMIT}.`),
});

export function createReadTool(ctx: RepoToolContext) {
  return tool({
    description: `Read a file from the connected repository workspace.

WHEN TO USE:
- Inspecting file contents after grep or glob finds candidates
- Reading surrounding context for localized strings

WHEN NOT TO USE:
- Searching across files (use grep instead)
- Listing files by pattern (use glob instead)
- Shell commands (use bash for allowlisted git/ls only)

USAGE:
- Use workspace-relative paths (e.g., "locales/en.json")
- Results use "N: content" line numbers (1-indexed)
- Default reads up to ${DEFAULT_READ_LINE_LIMIT} lines

IMPORTANT:
- Read a file before assuming its contents
- Cannot read directories — use glob instead`,
    inputSchema: readInputSchema,
    execute: async ({ filePath, offset = 1, limit = DEFAULT_READ_LINE_LIMIT }) => {
      const path = normalizeWorkspacePath(filePath);
      if (!path) {
        return { success: false as const, error: "Path must stay within the workspace." };
      }

      try {
        const raw = await ctx.bash.readFile(path);
        const lines = raw.split("\n");
        const startLine = Math.max(1, offset) - 1;
        const endLine = Math.min(lines.length, startLine + limit);
        const selectedLines = lines.slice(startLine, endLine);
        const numberedLines = selectedLines.map(
          (line, index) => `${startLine + index + 1}: ${redact(line)}`,
        );

        return {
          success: true as const,
          path,
          totalLines: lines.length,
          startLine: startLine + 1,
          endLine,
          content: numberedLines.join("\n"),
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
