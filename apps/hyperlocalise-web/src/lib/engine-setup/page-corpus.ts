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
import type { LocalisationAuditCrawledPage } from "@/lib/localisation-audit/types";

const MAX_PAGE_HEADINGS = 20;
const MAX_PAGE_BUTTONS = 20;

/** The page text the model sees, and the text its cited snippets must come from. */
export type EnginePageCorpus = {
  index: number;
  url: string;
  title: string | null;
  description: string | null;
  headings: string[];
  buttons: string[];
  text: string;
};

export function normalizeForMatch(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

export function buildPageCorpora(pages: LocalisationAuditCrawledPage[]): EnginePageCorpus[] {
  return pages
    .filter((page) => page.status >= 200 && page.status < 400)
    .map((page, index) => ({
      index,
      url: page.finalUrl ?? page.url,
      title: page.ogTitle ?? page.title,
      description: page.ogDescription ?? page.metaDescription,
      headings: page.headings.slice(0, MAX_PAGE_HEADINGS),
      buttons: page.buttons.slice(0, MAX_PAGE_BUTTONS),
      text: page.textSample,
    }));
}

function corpusSearchText(corpus: EnginePageCorpus): string {
  return normalizeForMatch(
    [
      corpus.title ?? "",
      corpus.description ?? "",
      ...corpus.headings,
      ...corpus.buttons,
      corpus.text,
    ]
      .filter(Boolean)
      .join(" \n "),
  );
}

/** Lazily normalized page text so evidence checks do not re-normalize per lookup. */
export class PageCorpusIndex {
  private readonly searchTextByIndex = new Map<number, string>();

  constructor(readonly corpora: EnginePageCorpus[]) {}

  get(index: number): EnginePageCorpus | undefined {
    return this.corpora[index];
  }

  private searchText(index: number): string {
    const cached = this.searchTextByIndex.get(index);
    if (cached !== undefined) return cached;
    const corpus = this.corpora[index];
    const text = corpus ? corpusSearchText(corpus) : "";
    this.searchTextByIndex.set(index, text);
    return text;
  }

  /** True when `snippet` is literally on page `index` (ignoring case and whitespace). */
  pageContains(index: number, snippet: string): boolean {
    const needle = normalizeForMatch(snippet);
    return needle.length > 0 && this.searchText(index).includes(needle);
  }

  /** Indexes of pages that contain `value`. */
  pagesContaining(value: string): number[] {
    return this.corpora
      .map((corpus) => corpus.index)
      .filter((index) => this.pageContains(index, value));
  }
}
