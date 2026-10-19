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

const SANITY_HELPER_DOCUMENT_TYPES = new Set(["locale", "translation.metadata"]);

export function isSanityHelperDocumentType(typeName: string): boolean {
  const name = typeName.trim();
  if (!name || SANITY_HELPER_DOCUMENT_TYPES.has(name)) {
    return true;
  }
  return name.startsWith("sanity.") || name.startsWith("assist.") || name.startsWith("media.");
}

/** Studio-style label for a schema type name (`post` → `Post`, `landingPage` → `Landing Page`). */
export function sanityDocumentTypeTitle(typeName: string): string {
  const spaced = typeName
    .trim()
    .replace(/[_.]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) {
    return typeName;
  }
  return spaced
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

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

export function filterTranslatableSanityDocumentTypes<
  T extends { name: string; i18nMode: SanityI18nMode },
>(types: readonly T[]): T[] {
  return types.filter(
    (type) =>
      !isSanityHelperDocumentType(type.name) && isSanityDocumentTypeLocalizable(type.i18nMode),
  );
}

export function sanityDocumentI18nModeLabel(mode: SanityI18nMode): string {
  switch (mode) {
    case "document":
      return "Document-level i18n";
    case "field":
      return "Field-level i18n";
    default:
      return "Not localizable";
  }
}
