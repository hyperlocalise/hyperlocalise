import { tool } from "ai";
import { z } from "zod";

import { normalizeWorkspacePath, toShellRelativePath } from "./path";
import {
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_READ_LINE_LIMIT,
  redact,
  truncate,
} from "./redact";
import type { RepoToolContext } from "./types";

const MAX_READ_LINE_LIMIT = DEFAULT_READ_LINE_LIMIT;

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

      const shellPath = toShellRelativePath(path);
      const boundedLimit = Math.min(Math.max(1, limit), MAX_READ_LINE_LIMIT);
      const startLine = Math.max(1, offset);
      const endLine = startLine + boundedLimit - 1;

      try {
        const rawContent = await ctx.bash.readFile(shellPath);
        const byteSize = Buffer.byteLength(rawContent, "utf8");
        if (byteSize > DEFAULT_MAX_FILE_BYTES) {
          return {
            success: false as const,
            error: `File exceeds maximum size of ${DEFAULT_MAX_FILE_BYTES} bytes.`,
          };
        }

        const lines = rawContent.split("\n");
        const totalLines =
          lines.length > 0 && lines.at(-1) === "" ? lines.length - 1 : lines.length;
        const selectedLines = lines.slice(startLine - 1, endLine);
        const numberedLines = selectedLines.map(
          (line, index) => `${startLine + index}: ${redact(line)}`,
        );
        const { text: content, truncated: outputTruncated } = truncate(
          numberedLines.join("\n"),
          DEFAULT_MAX_OUTPUT_BYTES,
        );

        const linesReadEnd = selectedLines.length > 0 ? startLine + selectedLines.length - 1 : null;

        return {
          success: true as const,
          path,
          totalLines,
          startLine,
          endLine: linesReadEnd ?? startLine,
          content,
          truncated: outputTruncated,
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
