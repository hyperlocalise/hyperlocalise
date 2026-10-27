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
import {
  inferSupportedSegmentedSpreadsheetTranslationFileFormat,
  isOfficeTranslationFileFormat,
  isSupportedFileTranslationFileFormat,
  type SupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";
import { sandboxCliParsesOffice } from "@/lib/translation/sandbox-cli-version";

/** Whether file translation jobs can run `format` through the sandbox CLI. */
export function isSandboxFileTranslationFormat(
  format: string,
  cliParsesOffice: boolean = sandboxCliParsesOffice(),
): boolean {
  const supported = format as SupportedTranslationFileFormat;
  if (!isSupportedFileTranslationFileFormat(supported)) {
    return false;
  }
  return cliParsesOffice || !isOfficeTranslationFileFormat(supported);
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
