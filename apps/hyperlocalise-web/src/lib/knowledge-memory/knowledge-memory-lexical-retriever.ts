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

function inputLocalesFromParts(queryParts: string[]) {
  return uniqueValues(
    queryParts
      .filter((part) => /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?$/i.test(part))
      .map(normalizeLocaleForSearch),
  );
}

function scoreSegment(segment: KnowledgeMemorySegment, queryParts: string[]) {
  const queryTokens = expandTokens(tokenize(queryParts.join(" ")));
  if (queryTokens.size === 0) {
    return 0;
  }

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

  for (const normalizedLocale of inputLocalesFromParts(queryParts)) {
    const headingText = normalizeLocaleForSearch(segment.headingPath.join(" "));
    const searchText = normalizeLocaleForSearch(segment.searchText);
    if (headingText.includes(normalizedLocale)) {
      score += 12;
    } else if (searchText.includes(normalizedLocale)) {
      score += 6;
    }
  }

  return score;
}

export const retrieveKnowledgeMemorySegmentsLexically: KnowledgeMemoryRetriever = ({
  segments,
  query,
}) => {
  const queryParts = buildQueryParts(query);

  return segments
    .map((segment) => ({
      segment,
      score: scoreSegment(segment, queryParts),
    }))
    .filter((item) => item.score >= minSelectiveScore)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.segment.startOffset - b.segment.startOffset;
    });
};
