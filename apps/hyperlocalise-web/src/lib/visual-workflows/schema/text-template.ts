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

export type ParsedTextTemplate =
  | { valid: true; placeholderNames: string[] }
  | { valid: false; placeholderNames: string[]; offset: number };

function validPlaceholderName(name: string): boolean {
  if (!name || !/[A-Za-z_]/.test(name[0]!)) return false;
  for (const character of name.slice(1)) {
    if (!/[A-Za-z0-9_.-]/.test(character)) return false;
  }
  return true;
}

export function parseTextTemplate(template: string): ParsedTextTemplate {
  const placeholderNames: string[] = [];
  let offset = 0;

  while (offset < template.length) {
    const opening = template.indexOf("{{", offset);
    if (opening < 0) break;
    if (opening > 0 && template[opening - 1] === "\\") {
      offset = opening + 2;
      continue;
    }
    const closing = template.indexOf("}}", opening + 2);
    if (closing < 0) return { valid: false, placeholderNames, offset: opening };
    const name = template.slice(opening + 2, closing).trim();
    if (!validPlaceholderName(name)) {
      return { valid: false, placeholderNames, offset: opening };
    }
    placeholderNames.push(name);
    offset = closing + 2;
  }

  return { valid: true, placeholderNames };
}
