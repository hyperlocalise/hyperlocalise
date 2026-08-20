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
import { normalizeWorkspacePath } from "./path";
import type { RepoToolContext } from "./types";

export type GitCloneRoot = {
  /** Directory to pass to `git -C`. `.` means the sandbox cwd is already the clone. */
  gitRoot: string;
  /** Last path segment of the clone, used to strip `repo/src/...` prefixes. */
  repoDirName: string | null;
};

function basenamePath(path: string): string | null {
  const trimmed = path.replace(/\\/g, "/").replace(/\/+$/, "").trim();
  if (!trimmed) {
    return null;
  }
  const parts = trimmed.split("/").filter(Boolean);
  return parts.at(-1) ?? null;
}

export function withGitRootArgs(gitRoot: string, args: string[]): string[] {
  if (!gitRoot || gitRoot === "." || args[0] === "-C") {
    return args;
  }
  return ["-C", gitRoot, ...args];
}

/**
 * Convert a workspace path that may be prefixed with the clone directory name
 * into a git-root-relative path.
 */
export function toGitPath(path: string, clone: GitCloneRoot): string {
  const prefixes = new Set(
    [clone.gitRoot, clone.repoDirName].filter(
      (value): value is string => Boolean(value) && value !== ".",
    ),
  );
  let current = path;
  for (const prefix of prefixes) {
    if (current === prefix) {
      current = ".";
      continue;
    }
    if (current.startsWith(`${prefix}/`)) {
      current = current.slice(prefix.length + 1);
    }
  }
  return current;
}

export function toWorkspacePath(gitPath: string, clone: GitCloneRoot): string {
  if (!clone.gitRoot || clone.gitRoot === "." || gitPath === clone.gitRoot) {
    return gitPath;
  }
  if (gitPath === ".") {
    return clone.gitRoot;
  }
  return `${clone.gitRoot}/${gitPath}`;
}

export async function resolveGitCloneRoot(ctx: RepoToolContext): Promise<GitCloneRoot> {
  const atCwd = await ctx.bash.exec("git", {
    args: ["rev-parse", "--is-inside-work-tree"],
  });
  if (atCwd.exitCode === 0) {
    const toplevel = await ctx.bash.exec("git", { args: ["rev-parse", "--show-toplevel"] });
    const repoDirName =
      toplevel.exitCode === 0 ? basenamePath(toplevel.stdout.split("\n")[0] ?? "") : null;
    return { gitRoot: ".", repoDirName };
  }

  const listed = await ctx.bash.exec("ls", { args: ["-1"] });
  if (listed.exitCode !== 0) {
    return { gitRoot: ".", repoDirName: null };
  }

  const gitRoots: string[] = [];
  for (const rawName of listed.stdout.split("\n")) {
    const candidate = normalizeWorkspacePath(rawName.replace(/\/+$/, ""));
    if (!candidate || candidate.includes("/")) {
      continue;
    }

    const isDir = await ctx.bash.exec("test", { args: ["-d", candidate] });
    if (isDir.exitCode !== 0) {
      continue;
    }

    const probe = await ctx.bash.exec("git", {
      args: ["-C", candidate, "rev-parse", "--is-inside-work-tree"],
    });
    if (probe.exitCode === 0) {
      gitRoots.push(candidate);
    }
  }

  if (gitRoots.length === 1) {
    const gitRoot = gitRoots[0]!;
    return { gitRoot, repoDirName: gitRoot };
  }

  return { gitRoot: ".", repoDirName: null };
}

export function bindGitClone(ctx: RepoToolContext, clone: GitCloneRoot): RepoToolContext {
  const rewriteFsPath = (path: string) => toWorkspacePath(toGitPath(path, clone), clone);

  return {
    bash: {
      exec: async (command, options) => {
        if (command === "git") {
          return ctx.bash.exec("git", {
            ...options,
            args: withGitRootArgs(clone.gitRoot, options?.args ?? []),
          });
        }
        if (command === "yq") {
          const args = [...(options?.args ?? [])];
          const last = args.at(-1);
          if (last && !last.startsWith("-")) {
            args[args.length - 1] = rewriteFsPath(last);
          }
          return ctx.bash.exec("yq", { ...options, args });
        }
        return ctx.bash.exec(command, options);
      },
      readFile: async (path) => ctx.bash.readFile(rewriteFsPath(path)),
      writeWorkspaceFile: ctx.bash.writeWorkspaceFile
        ? (path, content) => ctx.bash.writeWorkspaceFile!(rewriteFsPath(path), content)
        : undefined,
    },
  };
}
