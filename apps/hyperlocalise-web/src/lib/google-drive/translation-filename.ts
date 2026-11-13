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

export const GOOGLE_DRIVE_TRANSLATION_OUTPUTS = [
  "prefix",
  "suffix",
  "underscore",
  "folder",
] as const;

export type GoogleDriveTranslationOutput = (typeof GOOGLE_DRIVE_TRANSLATION_OUTPUTS)[number];

export const DEFAULT_GOOGLE_DRIVE_TRANSLATION_OUTPUT: GoogleDriveTranslationOutput = "folder";

const LOCALE_TAG_PATTERN = "([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)";
const TRANSLATION_PREFIX_PATTERN = new RegExp(`^\\[${LOCALE_TAG_PATTERN}\\]\\s+(.+)$`);
const TRANSLATION_SUFFIX_PATTERN = new RegExp(`^(.+?)\\s+\\[${LOCALE_TAG_PATTERN}\\](\\.[^.]+)?$`);

export function resolveGoogleDriveTranslationOutput(
  value: string | null | undefined,
): GoogleDriveTranslationOutput {
  if (value === "prefix" || value === "suffix" || value === "underscore" || value === "folder") {
    return value;
  }
  return DEFAULT_GOOGLE_DRIVE_TRANSLATION_OUTPUT;
}

export function formatDriveLocaleTag(locale: string): string {
  return canonicalizeLocale(locale) ?? locale;
}

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

export function parseTranslationSuffix(name: string): { locale: string; baseName: string } | null {
  const trimmed = name.trim();
  const match = TRANSLATION_SUFFIX_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const locale = canonicalizeLocale(match[2]!.replace(/_/g, "-"));
  if (!locale) {
    return null;
  }
  return { locale, baseName: `${match[1]!.trim()}${match[3] ?? ""}` };
}

export function parseTranslationUnderscore(
  name: string,
): { locale: string; baseName: string } | null {
  const { base, ext } = stripExtension(name.trim());
  const index = base.lastIndexOf("_");
  if (index <= 0) {
    return null;
  }
  const localePart = base.slice(index + 1);
  if (!isLocaleFolderName(localePart)) {
    return null;
  }
  const locale = canonicalizeLocale(localePart.replace(/_/g, "-"));
  if (!locale) {
    return null;
  }
  return { locale, baseName: `${base.slice(0, index)}${ext}` };
}

export function pathHasLocaleFolder(relativePath: string): boolean {
  return relativePath.split("/").some((segment) => isLocaleFolderName(segment));
}

export function buildGoogleDriveTargetLocaleKeys(locales: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (const locale of locales) {
    const tag = formatDriveLocaleTag(locale);
    keys.add(tag.toLowerCase());
  }
  return keys;
}

export function isTargetLocaleFolderName(name: string, targetLocales: readonly string[]): boolean {
  if (targetLocales.length === 0) {
    return false;
  }
  const keys = buildGoogleDriveTargetLocaleKeys(targetLocales);
  const trimmed = name.trim();
  const canonical = canonicalizeLocale(trimmed.replace(/_/g, "-"));
  if (!canonical) {
    return false;
  }
  return keys.has(canonical.toLowerCase());
}

export function pathHasTargetLocaleFolder(
  relativePath: string,
  targetLocales: readonly string[],
): boolean {
  return relativePath
    .split("/")
    .some((segment) => isTargetLocaleFolderName(segment, targetLocales));
}

/** Prefix, suffix, and underscore translation file names (not locale folder names). */
export function isNamedTranslationOutputFile(name: string): boolean {
  return (
    parseTranslationPrefix(name) !== null ||
    parseTranslationSuffix(name) !== null ||
    parseTranslationUnderscore(name) !== null
  );
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

export function buildTranslatedDriveName(input: {
  output: GoogleDriveTranslationOutput;
  locale: string;
  fileName: string;
}): string {
  const tag = formatDriveLocaleTag(input.locale);
  const { base, ext } = stripExtension(input.fileName);
  if (input.output === "prefix") {
    return `[${tag}] ${base}${ext}`;
  }
  if (input.output === "suffix") {
    return `${base} [${tag}]${ext}`;
  }
  if (input.output === "underscore") {
    return `${base}_${tag}${ext}`;
  }
  return `${base}${ext}`;
}

export function isTranslationOutputFile(input: {
  output: GoogleDriveTranslationOutput;
  name: string;
  relativePath?: string;
  targetLocales?: readonly string[];
}): boolean {
  if (input.output === "folder") {
    const targets = input.targetLocales;
    if (targets && targets.length > 0) {
      return (
        pathHasTargetLocaleFolder(input.relativePath ?? "", targets) ||
        isTargetLocaleFolderName(input.name, targets)
      );
    }
    return pathHasLocaleFolder(input.relativePath ?? "");
  }
  if (input.output === "prefix") {
    return parseTranslationPrefix(input.name) !== null;
  }
  if (input.output === "suffix") {
    return parseTranslationSuffix(input.name) !== null;
  }
  return parseTranslationUnderscore(input.name) !== null;
}

export function isAnyTranslationOutputFile(input: {
  name: string;
  relativePath?: string;
}): boolean {
  if (isNamedTranslationOutputFile(input.name)) {
    return true;
  }
  return pathHasLocaleFolder(input.relativePath ?? "");
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
