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

const GIT_VALUE_GLOBAL_FLAGS = new Set(["-C", "-c"]);
const GIT_VALUE_LONG_GLOBAL_FLAGS = ["--git-dir", "--work-tree", "--namespace", "--config-env"];

function skipGitGlobalFlag(token: string): number {
  if (GIT_VALUE_GLOBAL_FLAGS.has(token)) {
    return 1;
  }
  // git accepts `-ckey=value` as a single token.
  if (token.startsWith("-c") && token.length > 2 && !token.startsWith("--")) {
    return 0;
  }
  if (GIT_VALUE_LONG_GLOBAL_FLAGS.includes(token)) {
    return 1;
  }
  if (GIT_VALUE_LONG_GLOBAL_FLAGS.some((flag) => token.startsWith(`${flag}=`))) {
    return 0;
  }
  return -1;
}

/**
 * Index of the git subcommand, skipping global options such as `-C` and `-c`.
 * `-c core.fsmonitor=` must not be treated as the subcommand.
 */
export function gitSubcommandIndex(args: string[]): number {
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token) {
      continue;
    }
    const skipValues = skipGitGlobalFlag(token);
    if (skipValues >= 0) {
      i += skipValues;
      continue;
    }
    if (token.startsWith("-")) {
      continue;
    }
    return i;
  }
  return -1;
}

/**
 * Git porcelain `diff` uses exit 1 to mean "differences found". That is success
 * for a read-only reviewer that needs the patch.
 */
export function gitSubcommand(args: string[]): string | undefined {
  const index = gitSubcommandIndex(args);
  return index === -1 ? undefined : args[index];
}

export function isGitDiffCommand(args: string[]): boolean {
  return gitSubcommand(args) === "diff";
}

export function isSuccessfulAllowlistedExit(input: {
  bin: string;
  args: string[];
  exitCode: number;
}): boolean {
  if (input.exitCode === 0) {
    return true;
  }
  return input.bin === "git" && isGitDiffCommand(input.args) && input.exitCode === 1;
}
