export type HyperlocaliseFixCommand = {
  command: "fix";
  locale: string | null;
};

export function parseFixCommand(text: string): HyperlocaliseFixCommand | null {
  const mentionIndex = text.toLowerCase().indexOf("@hyperlocalise");
  if (mentionIndex < 0) {
    return null;
  }
  const parts = text
    .slice(mentionIndex + "@hyperlocalise".length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts[0]?.toLowerCase() !== "fix") {
    return null;
  }

  return {
    command: "fix",
    locale: parts[1] ?? null,
  };
}
