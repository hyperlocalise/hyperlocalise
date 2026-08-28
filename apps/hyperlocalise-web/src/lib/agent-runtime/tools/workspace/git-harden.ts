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
import { gitSubcommandIndex } from "./git-exit";

/**
 * Empty `-c` overrides that disable helper programs from `.git/config`.
 * `core.fsmonitor` runs on `git status`; `diff.external` runs on `git diff`.
 */
export const GIT_DISABLED_CONFIG_SETTINGS = [
  "core.fsmonitor=",
  "core.fsmonitorHook=",
  "diff.external=",
] as const;

const NO_TEXTCONV_SUBCOMMANDS = new Set(["diff", "show", "log", "blame"]);
const NO_EXT_DIFF_SUBCOMMANDS = new Set(["diff", "show", "log"]);

export function gitSafeConfigArgs(): string[] {
  return GIT_DISABLED_CONFIG_SETTINGS.flatMap((setting) => ["-c", setting]);
}

/**
 * Force-disable fsmonitor, external diff, and textconv on a git argv.
 * Preserves a leading `-C <dir>` so clone-root binding stays first.
 */
export function hardenGitArgs(args: string[]): string[] {
  let prefix: string[] = [];
  let rest = args;
  if (args[0] === "-C" && typeof args[1] === "string") {
    prefix = ["-C", args[1]];
    rest = args.slice(2);
  }

  const withConfig = [...prefix, ...gitSafeConfigArgs(), ...rest];
  const subIndex = gitSubcommandIndex(withConfig);
  const subcommand = subIndex === -1 ? undefined : withConfig[subIndex];
  if (!subcommand) {
    return withConfig;
  }

  const extra: string[] = [];
  if (NO_TEXTCONV_SUBCOMMANDS.has(subcommand)) {
    extra.push("--no-textconv");
  }
  if (NO_EXT_DIFF_SUBCOMMANDS.has(subcommand)) {
    extra.push("--no-ext-diff");
  }
  if (extra.length === 0) {
    return withConfig;
  }

  return [...withConfig.slice(0, subIndex + 1), ...extra, ...withConfig.slice(subIndex + 1)];
}
