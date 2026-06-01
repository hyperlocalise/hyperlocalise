import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";

import type { RepositoryAgentGitHubContext } from "@/lib/agent-contracts/repository-task";

import { getHyperlocaliseAgentModel } from "./model";
import type {
  HyperlocaliseConversationIntent,
  HyperlocaliseConversationMode,
} from "./conversation-mode";

export const conversationIntentSchema = z.enum(["translation", "repository", "general"]);

export const conversationClassificationSchema = z.object({
  intents: z.array(conversationIntentSchema).min(1),
  needsRepositoryTools: z.boolean(),
  requiresPullRequest: z.boolean(),
  shouldAskForRepositoryClarification: z.boolean(),
  continuesRepositoryThread: z.boolean(),
  currentMessageSpecifiesRepository: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type ConversationClassification = z.infer<typeof conversationClassificationSchema>;

type ConversationClassifierSurface = "slack" | "web" | "github";

type ClassifyConversationInput = {
  currentMessage: string;
  conversationText: string;
  hasFileAttachments: boolean;
  hasStoredRepositoryContext: boolean;
  surface: ConversationClassifierSurface;
};

type CreateConversationClassifierOptions = {
  model: LanguageModel;
};

const maxConversationClassificationChars = 12_000;

function truncateForClassification(value: string) {
  if (value.length <= maxConversationClassificationChars) {
    return value;
  }

  return `${value.slice(0, maxConversationClassificationChars)}\n[truncated]`;
}

function buildConversationClassificationPrompt(input: ClassifyConversationInput) {
  return [
    "Classify this Hyperlocalise agent conversation for routing and GitHub repository tooling.",
    "",
    "Intent rules (return one or more in `intents`):",
    '- "translation": translate or localize uploaded files/images, create translation jobs, or set locales for attached sources.',
    '- "repository": read-only localization context from a connected GitHub repo (where a string/key/copy appears, surrounding text, product context, nearby words).',
    '- "general": greetings, product questions, job status, glossary, or requests outside translation/repo lookup.',
    "",
    "Multi-intent:",
    "- Include every intent the user needs in this turn. Translation and repository can both appear when the user wants file jobs and repo context in the same request.",
    "- When both translation and repository apply, include both intents (do not collapse to one).",
    '- Use "general" only when no translation or repository work is needed. Do not combine "general" with other intents.',
    "",
    "Repository tooling flags:",
    "- needsRepositoryTools: true when the assistant should connect to GitHub and use read-only repo search tools for this turn.",
    "- continuesRepositoryThread: true when the latest message continues an in-thread repo lookup (for example nearby words, surrounding copy, which file, show more) even if the latest message is short.",
    "- currentMessageSpecifiesRepository: true only when the latest user message explicitly names a repo (owner/name), GitHub URL, or pull request.",
    "- requiresPullRequest: true only when the user is asking for PR-scoped work such as fixing, reviewing, or checking a specific pull request.",
    "- shouldAskForRepositoryClarification: true when the user clearly wants repo-based localization context but the conversation does not yet identify which repository or PR to use.",
    "",
    "Use the full recent conversation, not only the latest message.",
    "If a repository was already established earlier in the thread, treat short follow-ups as continuesRepositoryThread and keep needsRepositoryTools true when repository intent applies.",
    "",
    `Surface: ${input.surface}`,
    `Has file attachments in this turn: ${input.hasFileAttachments ? "yes" : "no"}`,
    `Thread already has resolved repository context: ${input.hasStoredRepositoryContext ? "yes" : "no"}`,
    "",
    "Recent conversation:",
    truncateForClassification(input.conversationText.trim() || "(none)"),
    "",
    "Latest user message:",
    truncateForClassification(input.currentMessage.trim() || "(none)"),
  ].join("\n");
}

export function normalizeConversationIntents(
  intents: HyperlocaliseConversationIntent[],
): HyperlocaliseConversationIntent[] {
  const unique = [...new Set(intents)];
  const specific = unique.filter((intent) => intent !== "general");

  if (specific.length > 0) {
    return specific;
  }

  return ["general"];
}

export function normalizeConversationClassification(
  classification: ConversationClassification,
): ConversationClassification {
  const intents = normalizeConversationIntents(classification.intents ?? ["general"]);

  return {
    intents,
    needsRepositoryTools: classification.needsRepositoryTools || intents.includes("repository"),
    requiresPullRequest: classification.requiresPullRequest,
    shouldAskForRepositoryClarification: classification.shouldAskForRepositoryClarification,
    continuesRepositoryThread: classification.continuesRepositoryThread,
    currentMessageSpecifiesRepository: classification.currentMessageSpecifiesRepository,
    confidence: classification.confidence,
  };
}

export function classificationHasIntent(
  classification: ConversationClassification,
  intent: HyperlocaliseConversationIntent,
): boolean {
  return classification.intents.includes(intent);
}

export function getPrimarySuggestedMode(
  intents: HyperlocaliseConversationIntent[],
): HyperlocaliseConversationMode {
  const normalized = normalizeConversationIntents(intents);

  if (normalized.includes("translation") && normalized.includes("repository")) {
    return "general";
  }

  if (normalized.includes("repository")) {
    return "repository";
  }

  if (normalized.includes("translation")) {
    return "translation";
  }

  return "general";
}

export function createConversationClassifier({ model }: CreateConversationClassifierOptions) {
  return async (input: ClassifyConversationInput): Promise<ConversationClassification> => {
    const { output } = await generateText({
      model,
      output: Output.object({
        schema: conversationClassificationSchema,
      }),
      system:
        "You are a precise conversation router for a localization agent. Return only structured classification data.",
      prompt: buildConversationClassificationPrompt(input),
      temperature: 0,
    });

    return normalizeConversationClassification(output);
  };
}

export async function classifyConversation(
  input: ClassifyConversationInput,
): Promise<ConversationClassification> {
  const classify = createConversationClassifier({
    model: getHyperlocaliseAgentModel(),
  });

  return classify(input);
}

export function getRecentUserConversationText(
  messages: ModelMessage[],
  latestText: string,
  limit = 5,
): string {
  const userLines = messages.flatMap((chatMessage) => {
    if (chatMessage.role !== "user" || typeof chatMessage.content !== "string") {
      return [];
    }

    const text = chatMessage.content.trim();
    return text ? [text] : [];
  });

  const trimmedLatest = latestText.trim();
  if (trimmedLatest && userLines.at(-1) !== trimmedLatest) {
    userLines.push(trimmedLatest);
  }

  return userLines.slice(-limit).join("\n");
}

export function shouldAttemptRepositoryContextResolution(input: {
  classification: ConversationClassification;
  storedRepositoryContext?: RepositoryAgentGitHubContext | null;
}): boolean {
  if (
    input.classification.needsRepositoryTools ||
    classificationHasIntent(input.classification, "repository")
  ) {
    return true;
  }

  if (!input.storedRepositoryContext) {
    return false;
  }

  return (
    input.classification.continuesRepositoryThread ||
    classificationHasIntent(input.classification, "repository")
  );
}

export function shouldRequireRepositoryContextClarification(
  classification: ConversationClassification,
): boolean {
  return classification.shouldAskForRepositoryClarification;
}

/** @deprecated Use classification.intents or getPrimarySuggestedMode instead. */
export function getClassificationMode(
  classification: ConversationClassification,
): HyperlocaliseConversationMode {
  return getPrimarySuggestedMode(classification.intents);
}
