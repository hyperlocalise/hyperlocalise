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

const LIQUID_PATTERN = /(\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\})/g;
const LIQUID_PLACEHOLDER = /<!--HL_BRAZE_LIQUID_(\d+)-->/g;

export function protectBrazeLiquid(value: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const text = value.replace(LIQUID_PATTERN, (match) => {
    const index = tokens.length;
    tokens.push(match);
    return `<!--HL_BRAZE_LIQUID_${index}-->`;
  });
  return { text, tokens };
}

export function restoreBrazeLiquid(text: string, tokens: string[]): string {
  return text.replace(LIQUID_PLACEHOLDER, (_match, index) => {
    const token = tokens[Number(index)];
    return token ?? "";
  });
}

export function protectBrazeLiquidFields<T extends Record<string, string | undefined>>(
  fields: T,
): { fields: T; tokensByField: Partial<Record<keyof T, string[]>> } {
  const next = { ...fields };
  const tokensByField: Partial<Record<keyof T, string[]>> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }
    const protectedField = protectBrazeLiquid(value);
    (next as Record<string, string>)[key] = protectedField.text;
    tokensByField[key as keyof T] = protectedField.tokens;
  }
  return { fields: next, tokensByField };
}

export function restoreBrazeLiquidFields<T extends Record<string, string | undefined>>(
  fields: T,
  tokensByField: Partial<Record<keyof T, string[]>>,
): T {
  const next = { ...fields };
  for (const [key, tokens] of Object.entries(tokensByField)) {
    const value = next[key as keyof T];
    if (typeof value !== "string" || !tokens) {
      continue;
    }
    (next as Record<string, string>)[key] = restoreBrazeLiquid(value, tokens);
  }
  return next;
}
