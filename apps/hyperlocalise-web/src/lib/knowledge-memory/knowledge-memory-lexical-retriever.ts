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
import type {
  KnowledgeMemoryRetriever,
  KnowledgeMemorySegment,
  SelectKnowledgeMemoryContextInput,
} from "./knowledge-memory-selection.types";

const minSelectiveScore = 3;
const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "be",
  "copy",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "not",
  "of",
  "or",
  "please",
  "text",
  "the",
  "to",
  "translate",
  "translated",
  "translating",
  "translation",
  "using",
  "with",
  "your",
]);

const tokenVariantMap: Record<string, string[]> = {
  basket: ["cart"],
  cart: ["basket"],
  checkout: ["purchase"],
  color: ["colour"],
  colors: ["colours"],
  colorful: ["colourful"],
  colored: ["coloured"],
  customize: ["customise"],
  customized: ["customised"],
  customizes: ["customises"],
  customizing: ["customising"],
  localize: ["localise"],
  localized: ["localised"],
  localizes: ["localises"],
  localizing: ["localising"],
  localization: ["localisation"],
  flow: ["funnel"],
  funnel: ["flow"],
  label: ["labels"],
  labels: ["label"],
  organize: ["organise"],
  organized: ["organised"],
  organizes: ["organises"],
  organizing: ["organising"],
  purchase: ["checkout"],
};

for (const [token, variants] of Object.entries(tokenVariantMap)) {
  for (const variant of variants) {
    tokenVariantMap[variant] = [...(tokenVariantMap[variant] ?? []), token];
  }
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/\u2019/g, "")
    .split(/[^\p{L}\p{N}-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

/**
 * Stable representative for a token's spelling-variant family (e.g. color/colour both resolve to
 * "color"), used to avoid double-counting a single literal word as independent evidence when
 * expandTokens has added its variant to the same unit's token set alongside it. Sorting the
 * family and taking the first entry needs no extra state and is stable regardless of which
 * variant happens to be the literal one.
 */
export function canonicalizeSpellingVariant(token: string): string {
  const family = tokenVariantMap[token];
  if (!family || family.length === 0) {
    return token;
  }
  return [token, ...family].sort()[0]!;
}

function expandTokens(tokens: string[]) {
  const expanded = new Set<string>();
  for (const token of tokens) {
    expanded.add(token);
    for (const variant of tokenVariantMap[token] ?? []) {
      expanded.add(variant);
    }
  }
  return expanded;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

/**
 * Shared tokenizer (stopwords + spelling-variant expansion) used both to score segments during
 * retrieval and to score sentences/bullets during excerpt selection, so scoring stays consistent
 * across the two stages instead of duplicating tokenisation rules.
 */
export function expandKnowledgeMemoryTokens(value: string): Set<string> {
  return expandTokens(tokenize(value));
}

function buildQueryParts(input: SelectKnowledgeMemoryContextInput) {
  const metadata = Object.values(input.metadata ?? {}).filter(Boolean) as string[];
  return uniqueValues([
    input.targetLocale ?? null,
    ...(input.targetLocales ?? []),
    input.sourceLocale ?? null,
    input.sourceText ?? null,
    input.context ?? null,
    input.key ?? null,
    input.path ?? null,
    input.projectName ?? null,
    input.projectTranslationContext ?? null,
    ...metadata,
  ]);
}

function normalizeLocaleForSearch(locale: string) {
  return locale.toLowerCase().replace(/_/g, "-");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function localeSearchCandidates(normalizedLocale: string) {
  const language = normalizedLocale.split("-")[0];
  return language && language !== normalizedLocale
    ? [normalizedLocale, language]
    : [normalizedLocale];
}

function includesLocaleMarker(text: string, locale: string) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(locale)}([^a-z0-9]|$)`).test(text);
}

function includesLanguageMarker(text: string, language: string) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(language)}([^a-z0-9-]|$)`).test(text);
}

function includesAnyLocaleMarker(text: string, normalizedLocale: string) {
  const [fullLocale, language] = localeSearchCandidates(normalizedLocale);
  if (!fullLocale) {
    return false;
  }

  return (
    includesLocaleMarker(text, fullLocale) ||
    (language ? includesLanguageMarker(text, language) : false)
  );
}

function inputLocalesFromParts(queryParts: string[]) {
  return uniqueValues(
    queryParts
      .filter((part) => /^[a-z]{2,3}(?:[-_][a-z0-9]{1,8})*$/i.test(part))
      .map(normalizeLocaleForSearch),
  );
}

function scoreSegment(
  segment: KnowledgeMemorySegment,
  queryTokens: Set<string>,
  inputLocales: string[],
) {
  const headingTokens = expandTokens(tokenize(segment.headingPath.join(" ")));
  const searchTokens = expandTokens(tokenize(segment.searchText));
  let score = 0;

  for (const token of queryTokens) {
    if (headingTokens.has(token)) {
      score += 4;
    }
    if (searchTokens.has(token)) {
      score += 3;
      if (/[-\d]/.test(token)) {
        score += 6;
      }
    }
  }

  for (const normalizedLocale of inputLocales) {
    const headingText = normalizeLocaleForSearch(segment.headingPath.join(" "));
    const searchText = normalizeLocaleForSearch(segment.searchText);
    if (includesAnyLocaleMarker(headingText, normalizedLocale)) {
      score += 12;
      continue;
    }
    // Body text: only score explicit regional tags (e.g. "de-DE"). Bare language codes like
    // Spanish "es", French/Spanish "de", or French "et" are ordinary words and must not pull
    // unrelated sections into selective retrieval.
    const [fullLocale, language] = localeSearchCandidates(normalizedLocale);
    if (
      fullLocale &&
      language &&
      fullLocale !== language &&
      includesLocaleMarker(searchText, fullLocale)
    ) {
      score += 6;
    }
  }

  return score;
}

function isLocaleShapedQueryPart(part: string) {
  return /^[a-z]{2,3}(?:[-_][a-z0-9]{1,8})*$/i.test(part);
}

/**
 * Literal query tokens for retrieval body scoring and excerpt unit ranking.
 *
 * Locale-shaped query parts (`es`, `et`, `de-DE`, …) are excluded: bare language codes are ordinary
 * words in many languages, and a single body hit scores +3 (`minSelectiveScore`), which can select
 * or excerpt unrelated Memory sections. Locale affinity stays on the dedicated marker path in
 * `scoreSegment` / `knowledgeMemoryHeadingMatchesLocales` (+12/+6, heading-forced openers).
 */
export function buildKnowledgeMemoryQueryTokens(
  query: SelectKnowledgeMemoryContextInput,
): Set<string> {
  const nonLocaleParts = buildQueryParts(query).filter((part) => !isLocaleShapedQueryPart(part));
  return expandKnowledgeMemoryTokens(nonLocaleParts.join(" "));
}

/** Target locales from the query, used for heading locale-marker matching (not body tokens). */
export function buildKnowledgeMemoryInputLocales(
  query: SelectKnowledgeMemoryContextInput,
): string[] {
  return inputLocalesFromParts(buildQueryParts(query));
}

/**
 * True when a segment heading is a locale/language marker for any of the query's target locales
 * (e.g. `### fr` for `fr-FR`). Used by excerpt packing to keep the opening rule when retrieval
 * selected the segment for its heading rather than an incidental body token.
 */
export function knowledgeMemoryHeadingMatchesLocales(
  headingPath: string[],
  inputLocales: string[],
): boolean {
  if (inputLocales.length === 0) {
    return false;
  }
  const headingText = normalizeLocaleForSearch(headingPath.join(" "));
  return inputLocales.some((locale) => includesAnyLocaleMarker(headingText, locale));
}

/**
 * Split out from retrieveKnowledgeMemorySegmentsLexically so a caller that already has queryTokens
 * (knowledge-memory-selection.ts, which also needs them separately for excerpt selection) can reuse
 * them here instead of paying for buildKnowledgeMemoryQueryTokens's tokenize + spelling-variant
 * expansion a second time for the same query.
 */
export function retrieveKnowledgeMemorySegmentsLexicallyWithTokens(
  segments: KnowledgeMemorySegment[],
  query: SelectKnowledgeMemoryContextInput,
  queryTokens: Set<string>,
) {
  if (queryTokens.size === 0) {
    return [];
  }
  const inputLocales = inputLocalesFromParts(buildQueryParts(query));

  return segments
    .map((segment) => ({
      segment,
      score: scoreSegment(segment, queryTokens, inputLocales),
    }))
    .filter((item) => item.score >= minSelectiveScore)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.segment.startOffset - b.segment.startOffset;
    });
}

export const retrieveKnowledgeMemorySegmentsLexically: KnowledgeMemoryRetriever = ({
  segments,
  query,
}) =>
  retrieveKnowledgeMemorySegmentsLexicallyWithTokens(
    segments,
    query,
    buildKnowledgeMemoryQueryTokens(query),
  );
