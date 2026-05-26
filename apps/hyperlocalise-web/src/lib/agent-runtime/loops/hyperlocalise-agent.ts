import { openai } from "@ai-sdk/openai";
import { eq } from "drizzle-orm";
import {
  stepCountIs,
  ToolLoopAgent,
  type LanguageModel,
  type ModelMessage,
  type ToolLoopAgentSettings,
  type ToolSet,
} from "ai";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { escapeRegExp } from "@/lib/primitives/escapeRegExp/escapeRegExp";
import { buildTools } from "@/lib/agent-runtime/tools/registry";
import { getConversationActiveTools } from "@/lib/tools/conversation-tools";
import type { ToolContext } from "@/lib/tools/types";

import {
  extractGitHubRepositoryFullNameReferences,
  githubPullRequestUrlPatternSource,
} from "@/lib/agents/repository-context";

export const hyperlocaliseAgentModelId = "gpt-5.4-mini";
export const hyperlocaliseAgentStepLimit = 5;
export const hyperlocaliseAgentMaxOutputTokens = 4_000;

export type HyperlocaliseAgentSurface = "web" | "slack" | "github";

export type HyperlocaliseAgentIntentKind =
  | "translation"
  | "repository"
  | "job_status"
  | "glossary_memory"
  | "project"
  | "general";

export type HyperlocaliseAgentGitHubContextRequirement = "repository" | "pull_request";

export type HyperlocaliseAgentIntent = {
  kind: HyperlocaliseAgentIntentKind;
  githubContextRequirement?: HyperlocaliseAgentGitHubContextRequirement;
};

type InteractionHistoryRow = {
  senderType: "user" | "agent";
  text: string;
};

type CreateHyperlocaliseAgentInput<TOOLS extends ToolSet> = {
  surface: HyperlocaliseAgentSurface;
  projectId: string | null;
  tools: TOOLS;
  model?: LanguageModel;
  additionalInstructions?: string;
  activeTools?: ToolLoopAgentSettings<never, TOOLS>["activeTools"];
  prepareStep?: ToolLoopAgentSettings<never, TOOLS>["prepareStep"];
  toolChoice?: ToolLoopAgentSettings<never, TOOLS>["toolChoice"];
  onFinish?: ToolLoopAgentSettings<never, TOOLS>["onFinish"];
};

type CreateConversationAgentInput = {
  surface: HyperlocaliseAgentSurface;
  toolContext: ToolContext;
  additionalInstructions?: string;
  intent?: HyperlocaliseAgentIntent;
  onFinish?: ToolLoopAgentSettings<never, ToolSet>["onFinish"];
};

const intentToolsets = {
  translation: ["createTranslationJob"],
  repository: ["searchRepoFiles", "readRepoFile"],
  job_status: [],
  glossary_memory: [],
  project: [],
  general: [],
} satisfies Record<HyperlocaliseAgentIntentKind, string[]>;

const githubPullRequestUrlPattern = new RegExp(githubPullRequestUrlPatternSource, "i");

export function classifyHyperlocaliseAgentIntent(input: {
  text: string;
  surface: HyperlocaliseAgentSurface;
}): HyperlocaliseAgentIntent {
  const text = input.text.trim();

  if (isRepositoryPullRequestIntent(text)) {
    return { kind: "repository", githubContextRequirement: "pull_request" };
  }

  if (isRepositoryRepositoryIntent(text)) {
    return { kind: "repository", githubContextRequirement: "repository" };
  }

  if (
    /\b(job|jobs|workflow|workflows)\b/i.test(text) &&
    /\b(status|list|show|check)\b/i.test(text)
  ) {
    return { kind: "job_status" };
  }

  if (/\b(glossar(?:y|ies)|term(?:s)?|translation memor(?:y|ies)|tmx|tm)\b/i.test(text)) {
    return { kind: "glossary_memory" };
  }

  if (/\b(project|workspace)\b/i.test(text)) {
    return { kind: "project" };
  }

  if (
    /\b(translat(?:e|ion|ing)|locali[sz](?:e|ation|ing)|source locale|target locale)\b/i.test(text)
  ) {
    return { kind: "translation" };
  }

  return { kind: "general" };
}

export function getActiveToolsForHyperlocaliseAgentIntent(
  intent: HyperlocaliseAgentIntent,
): ToolLoopAgentSettings<never, ToolSet>["activeTools"] {
  return intentToolsets[intent.kind];
}

export function buildTranslationAttachmentRequiredMessage(surface: HyperlocaliseAgentSurface) {
  const lines = [
    "I can translate supported localization files.",
    "Attach a file with a target language to create a translation job.",
  ];

  if (surface === "slack") {
    lines.push("Supported file types include JSON, CSV, XLIFF, and other localization formats.");
  }

  return lines.join(" ");
}

export function buildHyperlocaliseAgentIntentInstructions(intent: HyperlocaliseAgentIntent) {
  if (intent.kind === "repository") {
    return [
      "Intent: repository context lookup.",
      "Use only the repository context provided by the source adapter.",
      "Strings in owner/repository format (for example hyperlocalise/hyperlocalise) are GitHub repositories, not Hyperlocalise projects. Do not call listProjects to resolve them.",
      "Use searchRepoFiles with the localized string as the literal pattern, then readRepoFile for surrounding context when needed.",
      "Only explain where localized messages or strings appear and what nearby code implies. Do not modify files, upload sources, commit, push, or create jobs.",
      "Do not infer or invent a GitHub repository, pull request, branch, or installation ID.",
      "If repository execution is unavailable, say that clearly and keep the response tied to the resolved context.",
    ].join("\n");
  }

  return null;
}

function isRepositoryPullRequestIntent(text: string) {
  return (
    hasRepositoryContextLookupIntent(text) &&
    (githubPullRequestUrlPattern.test(text) ||
      /\b(?:pull request|pr)\s*#?\d+\b/i.test(text) ||
      /\bgithub\s+#?\d+\b/i.test(text))
  );
}

function isRepositoryRepositoryIntent(text: string) {
  if (isExplicitGitHubRepositoryMessage(text)) {
    return true;
  }

  const repoSubject = /\b(?:repo|repository|github)\b/i.test(text);
  return repoSubject && hasRepositoryContextLookupIntent(text);
}

function hasRepositoryContextLookupIntent(text: string) {
  const contextAction =
    /\b(?:context|search|find(?:ing)?|locate|lookup|where|usage|surrounding|nearby)\b/i.test(text);
  const localizedStringSubject =
    /\b(?:locali[sz]ed|translated|message|messages|string|strings|copy|text)\b/i.test(text) ||
    /["'`][^"'`]+["'`]/.test(text);

  return contextAction && localizedStringSubject;
}

function isExplicitGitHubRepositoryMessage(text: string) {
  const references = extractGitHubRepositoryFullNameReferences(text);
  if (references.length !== 1) {
    return false;
  }

  const repositoryFullName = references[0]!;
  const remainder = text
    .replace(new RegExp(escapeRegExp(repositoryFullName), "gi"), "")
    .replace(/https?:\/\/(?:www\.)?github\.com\/[^\s]+/gi, "")
    .trim();

  return remainder.length === 0;
}

export function getHyperlocaliseAgentModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return openai(hyperlocaliseAgentModelId);
}

export function buildHyperlocaliseAgentInstructions(input: {
  surface: HyperlocaliseAgentSurface;
  projectId: string | null;
  additionalInstructions?: string;
}) {
  const lines = [
    "You are Hyperlocalise, a localization assistant focused on translating uploaded files.",
    "Use the tools you are given; do not guess file IDs, repository paths, or file contents.",
  ];

  if (input.surface === "slack") {
    lines.push(
      "Keep responses concise and Slack-friendly. Use short Markdown with bullets, bold labels, and a small number of relevant emoji when it improves readability.",
    );
  } else if (input.surface === "github") {
    lines.push(
      "Keep GitHub replies concise, concrete, and focused on the requested repository action.",
    );
  }

  if (input.projectId) {
    lines.push(
      "",
      "Project context:",
      `- This conversation is attached to project ${input.projectId}.`,
    );
  }

  lines.push(
    "",
    "Guidelines:",
    '- Use createTranslationJob with type "file" when sourceFileId values are present in the message.',
    "- Ask for targetLocales (and sourceLocale when missing) before creating a translation job.",
    "- Do not invent sourceFileId values; use only IDs provided in the conversation.",
    "- Be concise but thorough. Responses should be scannable.",
    "- Always maintain a professional, helpful tone.",
  );

  if (input.additionalInstructions?.trim()) {
    lines.push("", "Surface-specific instructions:", input.additionalInstructions.trim());
  }

  return lines.join("\n");
}

export function toModelMessages(rows: InteractionHistoryRow[]): ModelMessage[] {
  return rows.map((row) => ({
    role: row.senderType === "user" ? "user" : "assistant",
    content: row.text,
  }));
}

export function replaceLastUserMessage(messages: ModelMessage[], text: string): ModelMessage[] {
  const nextMessages = [...messages];
  const lastUserIndex = nextMessages.findLastIndex((message) => message.role === "user");

  if (lastUserIndex >= 0) {
    nextMessages[lastUserIndex] = { role: "user", content: text };
    return nextMessages;
  }

  nextMessages.push({ role: "user", content: text });
  return nextMessages;
}

export async function loadInteractionModelMessages(interactionId: string): Promise<ModelMessage[]> {
  const messages = await db
    .select({
      senderType: schema.interactionMessages.senderType,
      text: schema.interactionMessages.text,
    })
    .from(schema.interactionMessages)
    .where(eq(schema.interactionMessages.interactionId, interactionId))
    .orderBy(schema.interactionMessages.createdAt)
    .limit(50);

  return toModelMessages(messages);
}

export function createHyperlocaliseAgent<TOOLS extends ToolSet>({
  surface,
  projectId,
  tools,
  model,
  additionalInstructions,
  activeTools,
  prepareStep,
  toolChoice,
  onFinish,
}: CreateHyperlocaliseAgentInput<TOOLS>) {
  return new ToolLoopAgent({
    model: model ?? getHyperlocaliseAgentModel(),
    instructions: buildHyperlocaliseAgentInstructions({
      surface,
      projectId,
      additionalInstructions,
    }),
    tools,
    activeTools,
    prepareStep,
    toolChoice,
    onFinish,
    maxOutputTokens: hyperlocaliseAgentMaxOutputTokens,
    stopWhen: stepCountIs(hyperlocaliseAgentStepLimit),
  });
}

export function createConversationToolLoopAgent({
  surface,
  toolContext,
  additionalInstructions,
  onFinish,
  hasFileAttachments = false,
}: Omit<CreateConversationAgentInput, "intent"> & { hasFileAttachments?: boolean }) {
  const tools = buildTools(toolContext);
  const activeTools = getConversationActiveTools(toolContext, { hasFileAttachments });
  return createHyperlocaliseAgent({
    surface,
    projectId: toolContext.projectId,
    tools,
    additionalInstructions,
    activeTools,
    onFinish,
  });
}
