/** Agent intents the conversation router can activate (one or more per turn). */
export type HyperlocaliseConversationIntent = "translation" | "repository" | "general";

/** Primary routing label derived from intents (orchestrator hint when a single intent dominates). */
export type HyperlocaliseConversationMode = HyperlocaliseConversationIntent;

export function buildConversationModeInstructions(
  mode: HyperlocaliseConversationMode,
): string | null {
  if (mode === "repository") {
    return [
      "Mode: find localization context in a connected repository (read-only).",
      "Use grep with the user's quoted string as the pattern, then read for surrounding lines when needed.",
      "Return context for translation decisions: product surface, user intent, tone/register, placeholders, nearby copy, existing translations, and ambiguities.",
      "Strings in owner/repository format (for example acme/web) are GitHub repositories, not Hyperlocalise projects.",
      "Do not infer repository paths, pull requests, or file contents without tool results.",
      "If repository search tools are unavailable, say the GitHub context is missing.",
    ].join("\n");
  }

  if (mode === "translation") {
    return [
      "Mode: file translation.",
      'Use createTranslationJob with type "file" when sourceFileId values are present in the message.',
      "Ask for targetLocales (and sourceLocale when missing) before creating a translation job.",
      "Do not invent sourceFileId values; use only IDs provided in the conversation.",
    ].join("\n");
  }

  return null;
}
