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

/**
 * Git porcelain `diff` uses exit 1 to mean "differences found". That is success
 * for a read-only reviewer that needs the patch.
 */
export function gitSubcommand(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token) {
      continue;
    }
    if (token === "-C") {
      i += 1;
      continue;
    }
    if (token.startsWith("-")) {
      continue;
    }
    return token;
  }
  return undefined;
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
