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

import type { SanityI18nMode } from "./types";

export function resolveSanityDocumentI18nMode(input: {
  typeName: string;
  detectedMode: SanityI18nMode;
  override?: "document" | "field" | null;
}): SanityI18nMode {
  if (input.override === "document" || input.override === "field") {
    return input.override;
  }
  return input.detectedMode;
}

export function isSanityDocumentTypeLocalizable(
  mode: SanityI18nMode,
): mode is "document" | "field" {
  return mode === "document" || mode === "field";
}
