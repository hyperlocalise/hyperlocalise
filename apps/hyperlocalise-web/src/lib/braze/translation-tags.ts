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

const TRANSLATION_TAG =
  /\{%\s*translation\s+([A-Za-z0-9_-]+)\s*%\}([\s\S]*?)\{%\s*endtranslation\s*%\}/g;

export function parseBrazeTranslationTags(value: string): Record<string, string> {
  const map: Record<string, string> = {};
  TRANSLATION_TAG.lastIndex = 0;
  for (const match of value.matchAll(TRANSLATION_TAG)) {
    const id = match[1]?.trim();
    if (!id || id in map) {
      continue;
    }
    map[id] = match[2] ?? "";
  }
  return map;
}
