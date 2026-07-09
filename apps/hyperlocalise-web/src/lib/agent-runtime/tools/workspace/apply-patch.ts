import { tool } from "ai";
import { z } from "zod";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { assertRepositoryWriteAllowed } from "@/lib/agent-runtime/tools/policy";

import { normalizeWorkspacePath } from "./path";
import { DEFAULT_MAX_OUTPUT_BYTES, redact, truncate } from "./redact";
import type { RepoToolContext } from "./types";

const applyPatchInputSchema = z.object({
  patch: z.string().describe("Unified diff patch to apply with git apply."),
});

function stripDiffPathPrefix(path: string) {
  return path.replace(/^(?:a|b)\//, "");
}

function parsePatchPath(value: string) {
  const path = value.trim().split(/\s+/)[0];
  if (!path || path === "/dev/null") {
    return null;
  }
  return normalizeWorkspacePath(stripDiffPathPrefix(path));
}

function extractPatchPaths(patch: string): { paths: string[]; error?: string } {
  const paths = new Set<string>();

  for (const line of patch.split("\n")) {
    if (!line.startsWith("--- ") && !line.startsWith("+++ ")) {
      continue;
    }

    const path = parsePatchPath(line.slice(4));
    if (!path) {
      if (!line.includes("/dev/null")) {
        return { paths: [], error: "Patch contains a path outside the workspace." };
      }
      continue;
    }
    paths.add(path);
  }

  return { paths: [...paths] };
}

export function createApplyPatchTool(ctx: ToolContext, repo: RepoToolContext) {
  return tool({
    description: `Apply a unified diff patch to files in the connected repository workspace.

WHEN TO USE:
- Small or multi-file edits where a unified diff is clearer than rewriting whole files
- Temporary mock UI scaffolding that should be easy to review and revert

WHEN NOT TO USE:
- Creating a full new generated file from scratch (use write)
- Patches that touch paths outside the repository workspace

IMPORTANT:
- The patch is validated with git apply --check before it is applied
- This is a repository write action and may be denied by workspace policy`,
    inputSchema: applyPatchInputSchema,
    execute: async ({ patch }) => {
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

      if (!patch.trim()) {
        return { success: false as const, error: "Patch is empty." };
      }

      const { paths, error } = extractPatchPaths(patch);
      if (error) {
        return { success: false as const, error };
      }
      if (paths.length === 0) {
        return { success: false as const, error: "Patch does not contain any file paths." };
      }

      const patchPath = `.hyperlocalise-agent/patches/${crypto.randomUUID()}.diff`;

      try {
        await repo.bash.writeWorkspaceFile(patchPath, patch);

        const checkResult = await repo.bash.exec("git", {
          args: ["apply", "--check", patchPath],
        });
        if (checkResult.exitCode !== 0) {
          const output = truncate(
            redact([checkResult.stdout, checkResult.stderr].filter(Boolean).join("\n")),
            DEFAULT_MAX_OUTPUT_BYTES,
          );
          return {
            success: false as const,
            error: output.text || "Patch failed validation.",
            changedPaths: paths,
            truncated: output.truncated,
          };
        }

        const applyResult = await repo.bash.exec("git", {
          args: ["apply", patchPath],
        });
        const output = truncate(
          redact([applyResult.stdout, applyResult.stderr].filter(Boolean).join("\n")),
          DEFAULT_MAX_OUTPUT_BYTES,
        );

        return {
          success: applyResult.exitCode === 0,
          changedPaths: paths,
          output: output.text,
          truncated: output.truncated,
          ...(applyResult.exitCode === 0 ? {} : { error: output.text || "Patch failed." }),
        };
      } catch (caught) {
        return {
          success: false as const,
          changedPaths: paths,
          error: redact(caught instanceof Error ? caught.message : String(caught)),
        };
      } finally {
        await repo.bash.exec("rm", { args: ["-f", patchPath] }).catch(() => undefined);
      }
    },
  });
}
