export type HyperlocaliseFixCommand = {
  command: "fix";
  locale: string | null;
};

export type HyperlocaliseRepositoryCommand = {
  command: "repository";
  instructions: string;
};

export type HyperlocaliseCommand = HyperlocaliseFixCommand | HyperlocaliseRepositoryCommand;

export function parseHyperlocaliseCommand(text: string): HyperlocaliseCommand | null {
  const mentionIndex = text.toLowerCase().indexOf("@hyperlocalise");
  if (mentionIndex < 0) {
    return null;
  }
  const parts = text
    .slice(mentionIndex + "@hyperlocalise".length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts[0]?.toLowerCase() === "fix") {
    return {
      command: "fix",
      locale: parts[1] ?? null,
    };
  }

  if (parts.length === 0) {
    return null;
  }

  return {
    command: "repository",
    instructions: parts.join(" "),
  };
}
