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
import { buildTools } from "@/lib/tools/registry";
import type { ToolContext } from "@/lib/tools/types";

import { githubPullRequestUrlPatternSource } from "./repo-tms-context";

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
  translation: [
    "listProjects",
    "getProjectContext",
    "updateInteractionProject",
    "queryGlossary",
    "queryTranslationMemory",
    "createTranslationJob",
    "readStoredFile",
  ],
  repo_tms: [
    "listProjects",
    "getProjectContext",
    "updateInteractionProject",
    "createSyncJob",
    "resolveInteraction",
  ],
  job_status: ["listJobs", "getJobStatus", "resolveInteraction"],
  glossary_memory: [
    "queryGlossary",
    "queryTranslationMemory",
    "listGlossaries",
    "createGlossary",
    "updateGlossary",
    "deleteGlossary",
    "listGlossaryTerms",
    "createGlossaryTerm",
    "updateGlossaryTerm",
    "deleteGlossaryTerm",
    "listTranslationMemories",
    "createTranslationMemory",
    "updateTranslationMemory",
    "deleteTranslationMemory",
    "listMemoryEntries",
    "createMemoryEntry",
    "updateMemoryEntry",
    "deleteMemoryEntry",
  ],
  project: ["listProjects", "getProjectContext", "updateInteractionProject"],
  general: undefined,
} satisfies Record<HyperlocaliseAgentIntentKind, string[] | undefined>;

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
): ToolLoopAgentSettings<never, ToolSet>["activeTools"] | undefined {
  return intentToolsets[intent.kind];
}

export function buildHyperlocaliseAgentIntentInstructions(intent: HyperlocaliseAgentIntent) {
  if (intent.kind === "repo_tms") {
    return [
      "Intent: repository/TMS work.",
      "Use only the repository context provided by the source adapter.",
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
  const repoSubject = /\b(?:repo|repository|github|hl|hyperlocalise)\b/i.test(text);
  const repoAction = /\b(?:checks?|fix|review|scan|inspect|sync|extract|analy[sz]e)\b/i.test(text);
  const repoRunAction = /\brun\s+(?:the\s+)?(?:repo|repository|github|hl|hyperlocalise)\b/i.test(
    text,
  );
  return repoSubject && (repoAction || repoRunAction);
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
    "You are Hyperlocalise, an expert localization and translation assistant.",
    "You help teams translate content, manage glossaries, review translations, and organize localization projects.",
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

  lines.push(
    "",
    "You can answer questions about:",
    "- Translation strategies and best practices",
    "- Locale-specific formatting, cultural adaptation, and regional conventions",
    "- Managing translation workflows, jobs, and project organization",
    "- Using glossaries and translation memories effectively",
    "- Quality assurance and review processes for localized content",
    "",
    "Project context:",
  );

  if (input.projectId) {
    lines.push(
      `- This conversation is attached to project ${input.projectId}.`,
      "- Call getProjectContext when you need the project's name, description, translation rules, or attached glossaries and memories.",
      "- Call updateInteractionProject only if the user explicitly says they want to switch to a different project.",
    );
  } else {
    lines.push(
      "- This conversation is NOT attached to a project yet.",
      "- If the user mentions a project by name, call listProjects to find it, then call updateInteractionProject to attach it.",
      "- If the user asks about translation without mentioning a project, you can still call queryGlossary and queryTranslationMemory org-wide.",
      "- If a project would help (e.g. the user says 'for the mobile app'), always attach it before translating.",
    );
  }

  lines.push(
    "",
    "Guidelines:",
    "- Be concise but thorough. Responses should be scannable.",
    "- When suggesting translations, consider context, tone, and target audience.",
    "- If you need more information to provide a good answer, ask clarifying questions.",
    "- You can create translation jobs, suggest glossary terms, and inspect existing jobs.",
    "- Review, research, sync, and asset-management jobs are not runnable yet; use the matching unavailable-job tool if a user asks to queue one.",
    "- Always maintain a professional, helpful tone.",
    "- If a request is outside your capabilities, give a clear fallback response explaining what you can do instead.",
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
  intent,
  onFinish,
}: CreateConversationAgentInput) {
  const tools = buildTools(toolContext);
  return createHyperlocaliseAgent({
    surface,
    projectId: toolContext.projectId,
    tools,
    additionalInstructions,
    activeTools: intent ? getActiveToolsForHyperlocaliseAgentIntent(intent) : undefined,
    onFinish,
  });
}
