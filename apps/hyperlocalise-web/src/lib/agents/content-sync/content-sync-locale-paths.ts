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
import { normalizeRepositoryRelativePath } from "@/lib/i18n/safe-repository-path";

import { normalizeContentSyncFolder } from "./content-sync-paths";
import { CONTENT_SYNC_LOCALE_PLACEHOLDER } from "./content-sync-types";

/**
 * Whether a template's wildcards are ones that match quickly: `**` only as a whole folder
 * segment and at most twice, at most two `*` or `{{locale}}` in any one name, and at most
 * eight in all.
 * Anything looser can make the compiled pattern backtrack for seconds on a long path.
 */
export function hasSafeContentSyncTemplateWildcards(template: string): boolean {
  const segments = template.split("/");
  let wildcards = 0;
  let folders = 0;
  for (const segment of segments) {
    if (segment === "**") {
      wildcards += 1;
      folders += 1;
      if (folders > 2) {
        return false;
      }
      continue;
    }
    if (segment.includes("**")) {
      return false;
    }
    const open =
      (segment.match(/\*/g) ?? []).length +
      segment.split(CONTENT_SYNC_LOCALE_PLACEHOLDER).length -
      1;
    if (open > 2) {
      return false;
    }
    wildcards += open;
  }
  return wildcards <= 8;
}

/**
 * Turns a path template such as `{{locale}}.json` or `{{locale}}/pages/*.html` into a matcher.
 * `*` matches within one path segment, `**` across segments, and `{{locale}}` one language
 * code; a template that uses the placeholder more than once needs the same code each time.
 */
export function compileContentSyncPathTemplate(template: string): {
  match: (relativePath: string) => string | null;
  /** The same path with another language code in the placeholder's place, for a delivery. */
  rewriteLocale: (relativePath: string, code: string) => string | null;
} {
  // Runs of wildcards mean the same as one, and nested optional groups backtrack badly.
  const normalized = normalizeContentSyncFolder(template)
    .replace(/(\*\*\/)+/g, "**/")
    .replace(/\*{3,}/g, "**")
    .replace(/(\*\*\/)+\*\*/g, "**");
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
  const regex = new RegExp(`^${pattern}$`, "d");
  return {
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
    rewriteLocale: (relativePath, code) => {
      const path = normalizeRepositoryRelativePath(relativePath);
      const found = regex.exec(path);
      if (!found?.indices || localeGroups === 0) {
        return null;
      }
      // From the end, so earlier spans keep their positions.
      let rewritten = path;
      for (let group = localeGroups; group >= 1; group -= 1) {
        const span = found.indices[group];
        if (!span) {
          return null;
        }
        rewritten = `${rewritten.slice(0, span[0])}${code}${rewritten.slice(span[1])}`;
      }
      return rewritten;
    },
  };
}

/** `pt_br`, `pt-br` and `pt-BR` are one tag. */
function localeKey(value: string): string {
  const tag = value.trim().replace(/_/g, "-");
  return (canonicalizeLocale(tag) ?? tag).toLowerCase();
}

function localeLanguage(key: string): string {
  return key.split("-")[0] ?? key;
}

/**
 * Which project locale a repository's language code stands for, matched the way the other
 * integrations match locales: the same tag (case and `_` aside), else the one project locale
 * of that language (`fr` for `fr-FR`, `en-US` for `en`). Two of the language would be a guess,
 * so neither is taken.
 */
export function resolveContentSyncLocale(input: {
  code: string;
  locales: string[];
}): string | null {
  const wanted = localeKey(input.code);
  const exact = input.locales.find((locale) => localeKey(locale) === wanted);
  if (exact) {
    return exact;
  }
  const language = localeLanguage(wanted);
  const sameLanguage = input.locales.filter(
    (locale) => localeLanguage(localeKey(locale)) === language,
  );
  return sameLanguage.length === 1 ? sameLanguage[0]! : null;
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
}): ContentSyncPathClassification {
  const code = input.template.match(input.relativePath);
  if (!code) {
    // Without the placeholder nothing says which language a file is, so nothing is imported.
    return { kind: "unmatched" };
  }
  const locale = resolveContentSyncLocale({
    code,
    locales: [input.sourceLocale, ...input.targetLocales],
  });
  if (locale === null) {
    return { kind: "unmatched" };
  }
  return locale === input.sourceLocale
    ? { kind: "source", locale }
    : { kind: "translation", locale };
}
