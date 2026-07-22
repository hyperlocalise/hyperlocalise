/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export type HyperlocaliseUnsupportedFixCommand = {
  command: "unsupported_fix";
};

export type HyperlocaliseRepositoryCommand = {
  command: "repository";
  instructions: string;
};

export type HyperlocaliseCommand =
  | HyperlocaliseRepositoryCommand
  | HyperlocaliseUnsupportedFixCommand;

export function parseHyperlocaliseCommand(text: string): HyperlocaliseCommand | null {
  const mentionIndex = text.toLowerCase().indexOf("@hyperlocalise");
  if (mentionIndex < 0) {
    return null;
  }
  const parts = text
    .slice(mentionIndex + "@hyperlocalise".length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts[0]?.toLowerCase() === "fix") {
    return { command: "unsupported_fix" };
  }

  if (parts.length === 0) {
    return null;
  }

  return {
    command: "repository",
    instructions: parts.join(" "),
  };
}
