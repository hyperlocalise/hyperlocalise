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
import type { LocalisationAuditCrawledPage, LocalisationAuditProgressSnapshot } from "./types";

const SNAPSHOT_LOCALE_LIMIT = 12;
const SNAPSHOT_PATH_LIMIT = 8;

function pagePath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

/**
 * Summarise a crawl for the running page. Keeps only locale codes and paths so the
 * public progress payload never carries page text.
 */
export function buildLocalisationAuditProgressSnapshot(
  pages: Pick<LocalisationAuditCrawledPage, "url" | "htmlLang" | "hreflang">[],
): LocalisationAuditProgressSnapshot {
  const locales = new Map<string, string>();
  const addLocale = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed || trimmed.toLowerCase() === "x-default") return;
    const key = trimmed.toLowerCase();
    if (!locales.has(key)) locales.set(key, trimmed);
  };

  for (const page of pages) {
    addLocale(page.htmlLang);
    for (const alternate of page.hreflang) addLocale(alternate.locale);
  }

  return {
    pagesCrawled: pages.length,
    locales: [...locales.values()].slice(0, SNAPSHOT_LOCALE_LIMIT),
    pagePaths: [...new Set(pages.map((page) => pagePath(page.url)))].slice(0, SNAPSHOT_PATH_LIMIT),
  };
}
