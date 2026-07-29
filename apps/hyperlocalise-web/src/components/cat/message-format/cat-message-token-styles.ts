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
export type CatMessageTokenVisualKind = "icu" | "placeholder" | "pound" | "tag" | "error";

export function catMessageTokenToneClass(kind: CatMessageTokenVisualKind) {
  switch (kind) {
    case "icu":
      return "border-bud-500/25 bg-bud-500/10 text-bud-900 dark:text-bud-300";
    case "placeholder":
      return "border-dew-500/25 bg-dew-500/10 text-dew-900 dark:text-dew-100";
    case "pound":
      return "border-grove-500/25 bg-grove-500/10 text-grove-900 dark:text-grove-300";
    case "tag":
      return "border-border bg-skeleton text-foreground";
    case "error":
      return "rounded-md bg-flame-700/20 text-flame-900 dark:text-flame-100";
  }
}

export const catMessageTokenMissingClass =
  "border-bud-500/40 bg-bud-500/10 text-bud-900 dark:text-bud-300";
