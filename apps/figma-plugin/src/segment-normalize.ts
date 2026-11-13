export function normalizeSegmentText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}
