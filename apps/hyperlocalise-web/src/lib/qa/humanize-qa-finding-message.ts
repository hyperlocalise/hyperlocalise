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

const INVARIANT_PREFIX = /^translation invariant violation:\s*/i;
const DEBUG_MARKER = " | source=";

export function humanizeQaFindingMessage(message: string): string {
  const debugIndex = message.indexOf(DEBUG_MARKER);
  const withoutDebug = (debugIndex === -1 ? message : message.slice(0, debugIndex)).trim();
  const unprefixed = withoutDebug.replace(INVARIANT_PREFIX, "").trim();
  const parenthetical = unprefixed.match(/\((.+?)\)\s*$/);
  const body = (parenthetical?.[1] ?? unprefixed).trim();
  if (!body) return unprefixed || message;
  return body.charAt(0).toUpperCase() + body.slice(1);
}

export function findingNeedsWhitespaceCue(finding: {
  checkType: string;
  message: string;
  sourceText: string;
  targetText: string;
}): boolean {
  if (finding.checkType === "whitespace_only" || finding.checkType === "escaped_char_mismatch") {
    return true;
  }
  if (finding.sourceText.includes("\u00a0") || finding.targetText.includes("\u00a0")) {
    return true;
  }
  return /whitespace|non-breaking space|nbsp/i.test(finding.message);
}
