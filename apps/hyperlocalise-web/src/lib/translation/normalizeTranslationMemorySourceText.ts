export function normalizeTranslationMemorySourceText(sourceText: string): string {
  return sourceText.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
