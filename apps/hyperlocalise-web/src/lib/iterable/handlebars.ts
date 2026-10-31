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

const HANDLEBARS_PATTERN = /(\{\{\{[\s\S]*?\}\}\}|\{\{[\s\S]*?\}\})/g;
const HANDLEBARS_PLACEHOLDER = /<!--HL_ITERABLE_HANDLEBARS_(\d+)-->/g;

export function protectIterableHandlebars(value: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const text = value.replace(HANDLEBARS_PATTERN, (match) => {
    const index = tokens.length;
    tokens.push(match);
    return `<!--HL_ITERABLE_HANDLEBARS_${index}-->`;
  });
  return { text, tokens };
}

export function restoreIterableHandlebars(text: string, tokens: string[]): string {
  return text.replace(HANDLEBARS_PLACEHOLDER, (_match, index) => {
    const token = tokens[Number(index)];
    return token ?? "";
  });
}

export function protectIterableHandlebarsFields<T extends Record<string, string | undefined>>(
  fields: T,
): { fields: T; tokensByField: Partial<Record<keyof T, string[]>> } {
  const next = { ...fields };
  const tokensByField: Partial<Record<keyof T, string[]>> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }
    const protectedField = protectIterableHandlebars(value);
    (next as Record<string, string>)[key] = protectedField.text;
    tokensByField[key as keyof T] = protectedField.tokens;
  }
  return { fields: next, tokensByField };
}

export function restoreIterableHandlebarsFields<T extends Record<string, string | undefined>>(
  fields: T,
  tokensByField: Partial<Record<keyof T, string[]>>,
): T {
  const next = { ...fields };
  for (const [key, tokens] of Object.entries(tokensByField)) {
    const value = next[key as keyof T];
    if (typeof value !== "string" || !tokens) {
      continue;
    }
    (next as Record<string, string>)[key] = restoreIterableHandlebars(value, tokens);
  }
  return next;
}
