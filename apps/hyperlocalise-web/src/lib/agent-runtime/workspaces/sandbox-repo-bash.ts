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
import { hardenGitArgs } from "@/lib/agent-runtime/tools/workspace/git-harden";
import {
  GIT_METADATA_WRITE_ERROR,
  isGitMetadataPath,
} from "@/lib/agent-runtime/tools/workspace/path";
import type { RepoToolContext } from "@/lib/agent-runtime/tools/workspace/types";
import { getVercelSandboxWorkspace } from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";

/**
 * Minimal Bash adapter backed by a Vercel sandbox for repo read/search tools.
 */
export function createSandboxRepoBash(sandboxId: string): RepoToolContext["bash"] {
  const workspace = getVercelSandboxWorkspace(sandboxId);

  return {
    async exec(command, options) {
      const args = options?.args ?? [];
      const execArgs = command === "git" ? hardenGitArgs(args) : args;
      const result = await workspace.runCommand(command, execArgs);
      return {
        exitCode: result.exitCode,
        stdout: result.output,
        stderr: "",
        env: {},
      };
    },
    async readFile(path) {
      return workspace.readFile(path);
    },
    async writeWorkspaceFile(path, content) {
      if (isGitMetadataPath(path)) {
        throw new Error(GIT_METADATA_WRITE_ERROR);
      }
      await workspace.writeFile(path, content);
    },
  };
}
