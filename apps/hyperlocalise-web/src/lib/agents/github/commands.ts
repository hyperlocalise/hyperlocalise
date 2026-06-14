export type HyperlocaliseUnsupportedFixCommand = {
  command: "unsupported_fix";
};

export type HyperlocaliseRepositoryCommand = {
  command: "repository";
  instructions: string;
};

export type HyperlocaliseCommand =
  | HyperlocaliseRepositoryCommand
  | HyperlocaliseUnsupportedFixCommand;

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
    return { command: "unsupported_fix" };
  }

  if (parts.length === 0) {
    return null;
  }

  return {
    command: "repository",
    instructions: parts.join(" "),
  };
}
