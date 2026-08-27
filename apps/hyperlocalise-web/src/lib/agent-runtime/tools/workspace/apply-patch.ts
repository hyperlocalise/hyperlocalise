/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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

const DISALLOWED_GIT_FILE_MODE = "120000|160000";
const GIT_MODE_HEADER = new RegExp(
  `^(?:old mode|new mode|new file mode|deleted file mode)\\s+0*(?:${DISALLOWED_GIT_FILE_MODE})\\s*$`,
);
const GIT_INDEX_MODE = new RegExp(
  `^index\\s+[0-9a-f]+\\.\\.[0-9a-f]+\\s+0*(?:${DISALLOWED_GIT_FILE_MODE})\\s*$`,
  "i",
);

/** Reject git symlink (120000) and submodule/gitlink (160000) modes before `git apply`. */
export function disallowedGitFileModeError(patch: string): string | undefined {
  for (const rawLine of patch.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (GIT_MODE_HEADER.test(line) || GIT_INDEX_MODE.test(line)) {
      return "Patch must not create or modify symbolic links or git submodules.";
    }
  }
  return undefined;
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
- Symbolic links and git submodules (modes 120000 and 160000) are rejected
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

      const modeError = disallowedGitFileModeError(patch);
      if (modeError) {
        return { success: false as const, error: modeError };
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
