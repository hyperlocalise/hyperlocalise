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
import { inferSupportedSegmentedSpreadsheetTranslationFileFormat } from "@/lib/translation/file-formats";

/** Pinned hyperlocalise CLI release installed into every sandbox. */
export const sandboxHyperlocaliseReleaseVersion = "1.13.3";

/** First CLI release whose `hl entries` and `hl run` read and write `.xlsx` workbooks. */
export const hyperlocaliseCliXlsxReleaseVersion = "1.14.0";

function parseReleaseVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^v/, "")
    .split("-")[0]!
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function isReleaseVersionAtLeast(version: string, minimum: string): boolean {
  const actual = parseReleaseVersion(version);
  const required = parseReleaseVersion(minimum);
  for (let index = 0; index < Math.max(actual.length, required.length); index += 1) {
    const difference = (actual[index] ?? 0) - (required[index] ?? 0);
    if (difference !== 0) {
      return difference > 0;
    }
  }
  return true;
}

/**
 * Whether the sandbox CLI parses `.xlsx` into segments. Until the pin reaches
 * {@link hyperlocaliseCliXlsxReleaseVersion}, workbooks are read in-process instead.
 */
export function sandboxCliParsesXlsx(version: string = sandboxHyperlocaliseReleaseVersion): boolean {
  return isReleaseVersionAtLeast(version, hyperlocaliseCliXlsxReleaseVersion);
}

/**
 * `hl entries` locale options for `path`. Workbooks keep locales in columns, so the
 * source column must be named; without `locale` the source column itself is read.
 * Other formats keep their existing flags.
 */
export function sandboxEntriesLocaleOptions(
  path: string,
  sourceLocale: string | null | undefined,
  locale?: string,
): { sourceLocale?: string; locale?: string } {
  const source = sourceLocale?.trim();
  if (!source || !inferSupportedSegmentedSpreadsheetTranslationFileFormat(path)) {
    return {};
  }
  return { sourceLocale: source, locale: locale?.trim() || source };
}
