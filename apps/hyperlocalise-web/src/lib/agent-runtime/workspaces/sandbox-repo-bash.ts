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
import {
  REPO_BASH_TIMEOUT_EXIT_CODE,
  type RepoToolContext,
} from "@/lib/agent-runtime/tools/workspace/types";
import { getVercelSandboxWorkspace } from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";

/** Default per-command limit for repo read/search tools (git, cat, grep, yq, ...). */
export const REPO_BASH_COMMAND_TIMEOUT_MS = 2 * 60 * 1000;
/** `hl check` / `hl extract` can scan large repos, so they get a longer limit. */
export const REPO_BASH_HL_COMMAND_TIMEOUT_MS = 4 * 60 * 1000;

function timeoutForCommand(command: string): number {
  return command === "hl" ? REPO_BASH_HL_COMMAND_TIMEOUT_MS : REPO_BASH_COMMAND_TIMEOUT_MS;
}

function timedOutResult(command: string, timeoutMs: number, output = "") {
  return {
    exitCode: REPO_BASH_TIMEOUT_EXIT_CODE,
    stdout: output,
    stderr: `${command} timed out after ${Math.round(timeoutMs / 1000)}s and was stopped.`,
    env: {},
  };
}

/**
 * Minimal Bash adapter backed by a Vercel sandbox for repo read/search tools.
 */
export function createSandboxRepoBash(sandboxId: string): RepoToolContext["bash"] {
  const workspace = getVercelSandboxWorkspace(sandboxId);

  return {
    async exec(command, options) {
      const args = options?.args ?? [];
      const execArgs = command === "git" ? hardenGitArgs(args) : args;
      const timeoutMs = timeoutForCommand(command);
      const startedAt = Date.now();
      let result;
      try {
        result = await workspace.runCommand(command, execArgs, {
          timeoutMs,
          signal: options?.signal,
        });
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs && !options?.signal?.aborted) {
          return timedOutResult(command, timeoutMs);
        }
        throw error;
      }
      if (result.exitCode !== 0 && Date.now() - startedAt >= timeoutMs) {
        return timedOutResult(command, timeoutMs, result.output);
      }
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
