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

export type TextTemplateToken =
  | { kind: "literal"; value: string }
  | { kind: "placeholder"; name: string };

export type ParsedTextTemplate =
  | { valid: true; placeholderNames: string[]; tokens: TextTemplateToken[] }
  | { valid: false; placeholderNames: string[]; offset: number };

const TEXT_PLACEHOLDER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export function isValidTextPlaceholderName(name: string): boolean {
  return TEXT_PLACEHOLDER_NAME_PATTERN.test(name);
}

export function parseTextTemplate(template: string): ParsedTextTemplate {
  const placeholderNames: string[] = [];
  const tokens: TextTemplateToken[] = [];
  let offset = 0;

  while (offset < template.length) {
    const opening = template.indexOf("{{", offset);
    if (opening < 0) {
      tokens.push({ kind: "literal", value: template.slice(offset) });
      break;
    }
    if (opening > 0 && template[opening - 1] === "\\") {
      if (opening - 1 > offset) {
        tokens.push({ kind: "literal", value: template.slice(offset, opening - 1) });
      }
      tokens.push({ kind: "literal", value: "{{" });
      offset = opening + 2;
      continue;
    }
    if (opening > offset) {
      tokens.push({ kind: "literal", value: template.slice(offset, opening) });
    }
    const closing = template.indexOf("}}", opening + 2);
    if (closing < 0) return { valid: false, placeholderNames, offset: opening };
    const name = template.slice(opening + 2, closing).trim();
    if (!isValidTextPlaceholderName(name)) {
      return { valid: false, placeholderNames, offset: opening };
    }
    placeholderNames.push(name);
    tokens.push({ kind: "placeholder", name });
    offset = closing + 2;
  }

  return { valid: true, placeholderNames, tokens };
}
