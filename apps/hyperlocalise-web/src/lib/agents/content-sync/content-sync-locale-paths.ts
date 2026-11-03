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
import { normalizeRepositoryRelativePath } from "@/lib/i18n/safe-repository-path";

import { normalizeContentSyncFolder } from "./content-sync-paths";
import { CONTENT_SYNC_LOCALE_PLACEHOLDER } from "./content-sync-types";

/**
 * Turns a path template such as `{{locale}}.json` or `{{locale}}/pages/*.html` into a matcher.
 * `*` matches within one path segment, `**` across segments, and `{{locale}}` one language
 * code; a template that uses the placeholder more than once needs the same code each time.
 */
export function compileContentSyncPathTemplate(template: string): {
  match: (relativePath: string) => string | null;
  usesLocale: boolean;
} {
  const normalized = normalizeContentSyncFolder(template);
  const placeholder = CONTENT_SYNC_LOCALE_PLACEHOLDER;
  let pattern = "";
  let localeGroups = 0;
  let index = 0;
  while (index < normalized.length) {
    if (normalized.startsWith(placeholder, index)) {
      pattern += "([A-Za-z0-9_-]+)";
      localeGroups += 1;
      index += placeholder.length;
    } else if (normalized.startsWith("**/", index)) {
      // Zero or more folders, so `{{locale}}/**/*.html` also matches a file at the top.
      pattern += "(?:.*/)?";
      index += 3;
    } else if (normalized.startsWith("**", index)) {
      pattern += ".*";
      index += 2;
    } else if (normalized[index] === "*") {
      pattern += "[^/]*";
      index += 1;
    } else {
      pattern += normalized[index]!.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      index += 1;
    }
  }
  const regex = new RegExp(`^${pattern}$`);
  return {
    usesLocale: localeGroups > 0,
    match: (relativePath) => {
      const found = regex.exec(normalizeRepositoryRelativePath(relativePath));
      if (!found) {
        return null;
      }
      const codes = found.slice(1, 1 + localeGroups);
      if (codes.length === 0) {
        return "";
      }
      return codes.every((code) => code === codes[0]) ? codes[0]! : null;
    },
  };
}

/**
 * Which project locale a repository's language code stands for, through the configured codes
 * first and the locale itself otherwise. Case-insensitive, since `pt-br` and `pt-BR` are one.
 */
export function resolveContentSyncLocale(input: {
  code: string;
  locales: string[];
  localeCodes?: Record<string, string>;
}): string | null {
  const wanted = input.code.toLowerCase();
  for (const locale of input.locales) {
    const code = input.localeCodes?.[locale] ?? locale;
    if (code.toLowerCase() === wanted) {
      return locale;
    }
  }
  return null;
}

export type ContentSyncPathClassification =
  | { kind: "source"; locale: string }
  | { kind: "translation"; locale: string }
  | { kind: "unmatched" };

/**
 * Sorts a repository path under the provider folder into the source locale's file, a
 * translation file, or neither. A file whose language code matches no project locale is
 * never imported, so a translated file can't be taken for source text.
 */
export function classifyContentSyncPath(input: {
  relativePath: string;
  template: ReturnType<typeof compileContentSyncPathTemplate>;
  sourceLocale: string;
  targetLocales: string[];
  localeCodes?: Record<string, string>;
}): ContentSyncPathClassification {
  const code = input.template.match(input.relativePath);
  if (code === null) {
    return { kind: "unmatched" };
  }
  if (code === "") {
    // A template without the placeholder names source files only.
    return { kind: "source", locale: input.sourceLocale };
  }
  const locale = resolveContentSyncLocale({
    code,
    locales: [input.sourceLocale, ...input.targetLocales],
    localeCodes: input.localeCodes,
  });
  if (locale === null) {
    return { kind: "unmatched" };
  }
  return locale === input.sourceLocale
    ? { kind: "source", locale }
    : { kind: "translation", locale };
}
