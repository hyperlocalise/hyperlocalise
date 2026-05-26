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
import { getConversationActiveTools } from "@/lib/tools/conversation-tools";
import { buildTools } from "@/lib/tools/registry";
import type { ToolContext } from "@/lib/tools/types";

import {
  extractGitHubRepositoryFullNameReferences,
  githubPullRequestUrlPatternSource,
} from "./repo-tms-context";

export const hyperlocaliseAgentModelId = "gpt-5.4-mini";
export const hyperlocaliseAgentStepLimit = 5;
export const hyperlocaliseAgentMaxOutputTokens = 4_000;

export type HyperlocaliseAgentSurface = "web" | "slack" | "github";

export type HyperlocaliseAgentIntentKind =
  | "translation"
  | "repo_tms"
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
  translation: ["createTranslationJob", "searchRepoFiles", "readRepoFile"],
  repo_tms: [
    "searchRepoFiles",
    "readRepoFile",
    "detectRepoConfig",
    "applyHyperlocaliseFixes",
    "commitChanges",
    "pushToBranch",
    "uploadSources",
  ],
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

  if (isRepoTmsPullRequestIntent(text)) {
    return { kind: "repo_tms", githubContextRequirement: "pull_request" };
  }

  if (isRepoTmsRepositoryIntent(text)) {
    return { kind: "repo_tms", githubContextRequirement: "repository" };
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
    "I can translate supported files, localize images, or search your connected GitHub repository.",
    "Attach a file or image with a target language, or ask me to find text in a repo you have enabled in Agent → GitHub.",
  ];

  if (surface === "slack") {
    lines.push("Supported file types include JSON, CSV, XLIFF, and other localization formats.");
  }

  return lines.join(" ");
}

export function buildHyperlocaliseAgentIntentInstructions(intent: HyperlocaliseAgentIntent) {
  if (intent.kind === "repo_tms") {
    return [
      "Intent: repository/TMS work.",
      "Use only the repository context provided by the source adapter.",
      "Strings in owner/repository format (for example hyperlocalise/hyperlocalise) are GitHub repositories, not Hyperlocalise projects. Do not call listProjects to resolve them.",
      "When the user asks to find or locate text in GitHub, use searchRepoFiles with the quoted string as the pattern, then readRepoFile for surrounding context when needed.",
      "Do not infer or invent a GitHub repository, pull request, branch, or installation ID.",
      "If repository/TMS execution is unavailable, say that clearly and keep the response tied to the resolved context.",
    ].join("\n");
  }

  return null;
}

function isRepoTmsPullRequestIntent(text: string) {
  return (
    githubPullRequestUrlPattern.test(text) ||
    /\b(?:pull request|pr)\s*#?\d+\b/i.test(text) ||
    /\bgithub\s+#?\d+\b/i.test(text)
  );
}

function isRepoTmsRepositoryIntent(text: string) {
  if (isExplicitGitHubRepositoryMessage(text)) {
    return true;
  }

  const repoSubject = /\b(?:repo|repository|github|hl|hyperlocalise)\b/i.test(text);
  const repoAction =
    /\b(?:checks?|fix|review|scan|inspect|sync|extract|analy[sz]e|search|find(?:ing)?|locate|lookup)\b/i.test(
      text,
    );
  const repoRunAction = /\brun\s+(?:the\s+)?(?:repo|repository|github|hl|hyperlocalise)\b/i.test(
    text,
  );
  return repoSubject && (repoAction || repoRunAction);
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

  return remainder.length <= 40;
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
    "You are Hyperlocalise, a localization assistant focused on file translation and GitHub repository lookup.",
    "Use the tools you are given; do not guess repository paths or file contents.",
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
    "- Use searchRepoFiles with the user's quoted string as the pattern, then readRepoFile for surrounding context.",
    "- Ask for targetLocales (and sourceLocale when missing) before creating a translation job.",
    "- Do not invent sourceFileId values; use only IDs provided in the conversation.",
    "- If the user asks to find copy in GitHub but repo search tools are unavailable, say the repository context is missing.",
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
