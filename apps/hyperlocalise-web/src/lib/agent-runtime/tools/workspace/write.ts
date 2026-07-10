import { tool } from "ai";
import { z } from "zod";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { assertRepositoryWriteAllowed } from "@/lib/agent-runtime/tools/policy";

import { normalizeWorkspacePath, toShellRelativePath } from "./path";
import { DEFAULT_MAX_OUTPUT_BYTES, redact, truncate } from "./redact";
import type { RepoToolContext } from "./types";

const writeInputSchema = z.object({
  filePath: z
    .string()
    .describe("Workspace-relative path to create or overwrite, e.g. src/app/mock/page.tsx."),
  content: z.string().describe("Complete file contents to write."),
});

export function createWriteTool(ctx: ToolContext, repo: RepoToolContext) {
  return tool({
    description: `Create or overwrite a file in the connected repository workspace.

WHEN TO USE:
- Creating temporary preview files, fixtures, or small mock UI scaffolding
- Replacing a whole generated file where a patch would be noisier

WHEN NOT TO USE:
- Small edits to an existing file (use applyPatch)
- Reading files (use read)
- Writing outside the repository workspace

IMPORTANT:
- This writes the complete file contents
- Read existing files first before overwriting them
- This is a repository write action and may be denied by workspace policy`,
    inputSchema: writeInputSchema,
    execute: async ({ filePath, content }) => {
      const gate = assertRepositoryWriteAllowed(ctx, "apply_fixes");
      if (!gate.allowed) {
        return { success: false as const, error: gate.reason };
      }
      if (!repo.bash.writeWorkspaceFile) {
        return {
          success: false as const,
          error: "Workspace write support is not available for this tool.",
        };
      }

      const path = normalizeWorkspacePath(filePath);
      if (!path) {
        return { success: false as const, error: "Path must stay within the workspace." };
      }

      try {
        await repo.bash.writeWorkspaceFile(toShellRelativePath(path), content);
        const preview = truncate(redact(content), DEFAULT_MAX_OUTPUT_BYTES);
        return {
          success: true as const,
          path,
          byteSize: Buffer.byteLength(content, "utf8"),
          preview: preview.text,
          truncated: preview.truncated,
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
