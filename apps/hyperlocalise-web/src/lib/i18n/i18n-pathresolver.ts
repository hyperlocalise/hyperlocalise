/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  isSafeRepositoryRelativePath,
  normalizeRepositoryRelativePath,
} from "./safe-repository-path";

const TOKEN_SOURCE = "{{source}}";
const TOKEN_TARGET = "{{target}}";
const TOKEN_LOCALE_DIR = "{{localeDir}}";
const LEGACY_LOCALE = "[locale]";

function resolve(pattern: string, sourceLocale: string, targetLocale: string): string {
  const localeDir = sourceLocale === targetLocale ? "" : targetLocale;

  let path = pattern.replaceAll(TOKEN_SOURCE, sourceLocale);
  path = path.replaceAll(TOKEN_TARGET, targetLocale);
  path = path.replaceAll(TOKEN_LOCALE_DIR, localeDir);
  path = path.replaceAll(LEGACY_LOCALE, targetLocale);

  path = normalizeRepositoryRelativePath(path.replace(/\/+/g, "/"));

  if (!isSafeRepositoryRelativePath(path)) {
    throw new Error(`Unsafe repository path: ${path}`);
  }

  return path;
}

export function resolveSourcePath(pattern: string, sourceLocale: string): string {
  return resolve(pattern, sourceLocale, sourceLocale);
}

export function resolveTargetPath(
  pattern: string,
  sourceLocale: string,
  targetLocale: string,
): string {
  return resolve(pattern, sourceLocale, targetLocale);
}
