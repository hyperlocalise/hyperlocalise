export type HyperlocaliseFixCommand = {
  command: "fix";
  locale: string | null;
};

export type HyperlocaliseRepoTmsCommand = {
  command: "repo_tms";
  instructions: string;
};

export type HyperlocaliseCommand = HyperlocaliseFixCommand | HyperlocaliseRepoTmsCommand;

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

  return {
    command: "repo_tms",
    instructions: parts.join(" "),
  };
}
