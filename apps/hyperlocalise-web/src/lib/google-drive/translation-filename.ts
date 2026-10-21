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

import { canonicalizeLocale } from "@/lib/i18n/locales";

const TRANSLATION_PREFIX_PATTERN = /^\[([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)\]\s+(.+)$/;

export function parseTranslationPrefix(name: string): { locale: string; baseName: string } | null {
  const trimmed = name.trim();
  const match = TRANSLATION_PREFIX_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const locale = canonicalizeLocale(match[1]!.replace(/_/g, "-"));
  if (!locale) {
    return null;
  }
  return { locale, baseName: match[2]!.trim() };
}

export function isLocaleFolderName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  const canonical = canonicalizeLocale(trimmed.replace(/_/g, "-"));
  if (!canonical) {
    return false;
  }
  if (typeof Intl === "undefined" || typeof Intl.Locale !== "function") {
    return true;
  }
  try {
    const parsed = new Intl.Locale(canonical);
    if (parsed.region || parsed.script) {
      return true;
    }
    return parsed.language.length === 2;
  } catch {
    return false;
  }
}

export function buildTranslatedName(locale: string, baseName: string): string {
  const canonical = canonicalizeLocale(locale) ?? locale;
  return `[${canonical}] ${baseName}`;
}

export function stripExtension(filename: string): { base: string; ext: string } {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0) {
    return { base: filename, ext: "" };
  }
  return {
    base: filename.slice(0, lastDot),
    ext: filename.slice(lastDot),
  };
}
