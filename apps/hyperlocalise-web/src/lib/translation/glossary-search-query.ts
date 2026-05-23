const maxContextSearchTerms = 50;

export function buildGlossaryTsQuery(input: string): string | null {
  const tsQuery = input
    .replace(/[&|!():*<>'"-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxContextSearchTerms)
    .map((word) => `${word}:*`)
    .join(" & ");

  return tsQuery.length > 0 ? tsQuery : null;
}
