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
const PARITY_MISMATCH = /^(.+ parity mismatch) \((expected .+?, got .+)\)\s*$/i;
const DESCRIPTIVE_PARENTHETICAL = /\((.+?)\)\s*$/;

export function humanizeQaFindingMessage(message: string): string {
  if (!INVARIANT_PREFIX.test(message)) return message;

  const debugIndex = message.indexOf(DEBUG_MARKER);
  const withoutDebug = (debugIndex === -1 ? message : message.slice(0, debugIndex)).trim();
  const unprefixed = withoutDebug.replace(INVARIANT_PREFIX, "").trim();

  const parity = unprefixed.match(PARITY_MISMATCH);
  if (parity?.[1] && parity[2]) {
    return capitalize(`${parity[1]}: ${parity[2]}`);
  }

  const parenthetical = unprefixed.match(DESCRIPTIVE_PARENTHETICAL);
  const detail = parenthetical?.[1]?.trim() ?? "";
  const body = detail && !/^(expected|got)\b/i.test(detail) ? detail : unprefixed;
  if (!body) return unprefixed || message;
  return capitalize(body);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
