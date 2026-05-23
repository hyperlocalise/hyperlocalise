const maxContextSearchTerms = 50;

export function buildTranslationMemoryTsQuery(input: string): string {
  return input
    .replace(/[&|!():*<>'"-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxContextSearchTerms)
    .map((word) => `${word}:*`)
    .join(" & ");
}
