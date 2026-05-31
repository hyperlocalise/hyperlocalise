import {
  classifyAgentRequestText,
  type AgentPlannerIntent,
} from "@/lib/agent-runtime/requests/planner";
import {
  extractGitHubRepositoryFullNameReferences,
  githubPullRequestUrlPatternSource,
} from "@/lib/agent-contracts/github-text-patterns";
import { escapeRegExp } from "@/lib/primitives/escapeRegExp/escapeRegExp";

/** Conversation routing modes — maps to focused tool loops, not a single translation default. */
export type HyperlocaliseConversationMode = "translation" | "repository" | "general";

const githubPullRequestUrlPattern = new RegExp(githubPullRequestUrlPatternSource, "i");

/**
 * Classifies the latest user message into a conversation mode.
 * Uses the shared planner heuristics plus GitHub-specific patterns for PR/repo lookup.
 */
export function classifyConversationMode(text: string): HyperlocaliseConversationMode {
  const plannerIntent = classifyAgentRequestText(text);
  if (plannerIntent === "translation" || plannerIntent === "repository") {
    return plannerIntent;
  }

  if (isRepositoryConversationRequest(text)) {
    return "repository";
  }

  return "general";
}

export function isRepositoryConversationRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (githubPullRequestUrlPattern.test(trimmed)) {
    return true;
  }

  if (/\b(?:pull request|pr)\s*#?\d+\b/i.test(trimmed) || /\bgithub\s+#?\d+\b/i.test(trimmed)) {
    return true;
  }

  if (isExplicitGitHubRepositoryMessage(trimmed)) {
    return true;
  }

  const repoSubject = /\b(?:repo|repository|github|hl|hyperlocalise)\b/i.test(trimmed);
  const repoAction =
    /\b(?:checks?|fix|review|scan|inspect|sync|extract|analy[sz]e|search|find(?:ing)?|locate|lookup)\b/i.test(
      trimmed,
    );
  const repoRunAction = /\brun\s+(?:the\s+)?(?:repo|repository|github|hl|hyperlocalise)\b/i.test(
    trimmed,
  );

  return repoSubject && (repoAction || repoRunAction);
}

export function conversationModeRequiresPullRequestContext(
  text: string,
  mode: HyperlocaliseConversationMode,
): boolean {
  if (mode !== "repository") {
    return false;
  }

  return (
    githubPullRequestUrlPattern.test(text) ||
    /\b(?:pull request|pr)\s*#?\d+\b/i.test(text) ||
    /\bgithub\s+#?\d+\b/i.test(text)
  );
}

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

function isExplicitGitHubRepositoryMessage(text: string): boolean {
  const references = extractGitHubRepositoryFullNameReferences(text);
  if (references.length !== 1) {
    return false;
  }

  const repositoryFullName = references[0]!;
  const remainder = text
    .replace(new RegExp(escapeRegExp(repositoryFullName), "gi"), "")
    .replace(/https?:\/\/(?:www\.)?github\.com\/[^\s]+/gi, "")
    .trim();

  return remainder.length <= 40;
}

/** @internal Exported for tests that assert planner alignment. */
export function plannerIntentToConversationMode(
  intent: AgentPlannerIntent,
): HyperlocaliseConversationMode | null {
  if (intent === "translation" || intent === "repository") {
    return intent;
  }

  return null;
}
