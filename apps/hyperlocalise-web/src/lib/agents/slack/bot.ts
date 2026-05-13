import { openai } from "@ai-sdk/openai";
import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { eq } from "drizzle-orm";
import { generateText, stepCountIs } from "ai";
import type { Message, Thread } from "chat";

import { createChatStateAdapter } from "@/lib/agents/runtime/state";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { createChatLogger } from "@/lib/log";
import {
  addInteractionMessage,
  createInteraction,
  findInteractionBySourceThreadId,
} from "@/lib/interactions";
import { buildTools } from "@/lib/tools/registry";

import { findSlackConnector, lookupMembership } from "./helpers";

type SlackBotState = Record<string, unknown>;

let botInstance: Chat<{ slack: ReturnType<typeof createSlackAdapter> }, SlackBotState> | null =
  null;

const wrappedThreads = new WeakSet<Thread<SlackBotState>>();

export function extractTeamId(message: Message): string | null {
  const raw = message.raw as { team_id?: string; team?: string } | undefined;
  return raw?.team_id ?? raw?.team ?? null;
}

export async function wrapThreadPost(thread: Thread<SlackBotState>, interactionId: string) {
  if (wrappedThreads.has(thread)) {
    return;
  }
  wrappedThreads.add(thread);

  const originalPost = thread.post.bind(thread);
  thread.post = async (...args: Parameters<typeof originalPost>) => {
    const result = await originalPost(...args);
    try {
      const content = args[0];
      const text = typeof content === "string" ? content : "";
      if (text) {
        await addInteractionMessage({
          interactionId,
          senderType: "agent",
          text,
        });
      }
    } catch {
      // Best-effort tracking
    }
    return result;
  };
}

export async function getOrCreateInteraction(
  organizationId: string,
  threadId: string,
  title: string,
): Promise<{
  interaction: { id: string; title: string; projectId: string | null };
  isNew: boolean;
}> {
  const existing = await findInteractionBySourceThreadId({
    organizationId,
    source: "slack_agent",
    sourceThreadId: threadId,
  });
  if (existing) {
    return {
      interaction: existing as { id: string; title: string; projectId: string | null },
      isNew: false,
    };
  }
  const interaction = await createInteraction({
    organizationId,
    source: "slack_agent",
    title,
    sourceThreadId: threadId,
  });
  return {
    interaction: interaction as { id: string; title: string; projectId: string | null },
    isNew: true,
  };
}

function getChatModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return openai("gpt-5.4-mini");
}

function buildSlackSystemPrompt(projectId: string | null) {
  const lines = [
    "You are Hyperlocalise, an expert localization and translation assistant in Slack.",
    "You help teams translate content, manage glossaries, review translations, and organize localization projects.",
    "Keep responses concise and Slack-friendly. Use markdown formatting when it improves readability.",
    "",
    "You can answer questions about:",
    "- Translation strategies and best practices",
    "- Locale-specific formatting, cultural adaptation, and regional conventions",
    "- Managing translation workflows, jobs, and project organization",
    "- Using glossaries and translation memories effectively",
    "- Quality assurance and review processes for localized content",
    "",
    "Project context:",
  ];

  if (projectId) {
    lines.push(
      `- This conversation is attached to project ${projectId}.`,
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
    "- Be concise but thorough. Slack messages should be scannable.",
    "- When suggesting translations, consider context, tone, and target audience",
    "- If you need more information to provide a good answer, ask clarifying questions",
    "- You can create translation jobs, suggest glossary terms, and inspect existing jobs",
    "- Review, research, sync, and asset-management jobs are not runnable yet; use the matching unavailable-job tool if a user asks to queue one",
    "- Always maintain a professional, helpful tone",
    "- If a request is outside your capabilities, give a clear fallback response explaining what you can do instead",
  );

  return lines.join("\n");
}

async function loadConversationHistory(interactionId: string) {
  const messages = await db
    .select({
      senderType: schema.interactionMessages.senderType,
      text: schema.interactionMessages.text,
    })
    .from(schema.interactionMessages)
    .where(eq(schema.interactionMessages.interactionId, interactionId))
    .orderBy(schema.interactionMessages.createdAt)
    .limit(50);

  return messages.map((msg) => ({
    role: msg.senderType === "user" ? ("user" as const) : ("assistant" as const),
    content: msg.text,
  }));
}

async function processSlackMessage(
  thread: Thread<SlackBotState>,
  message: Message,
  interactionId: string,
  organizationId: string,
  projectId: string | null,
) {
  try {
    const chatMessages = await loadConversationHistory(interactionId);

    // Replace the last user message with the current one (it was just persisted)
    // to ensure we have the freshest text
    const lastUserIndex = chatMessages.findLastIndex((m) => m.role === "user");
    if (lastUserIndex >= 0) {
      chatMessages[lastUserIndex] = { role: "user", content: message.text };
    } else {
      chatMessages.push({ role: "user", content: message.text });
    }

    const slackUser = await thread.adapter.getUser(message.author.userId);
    const membership = slackUser?.email
      ? await lookupMembership({ email: slackUser.email, organizationId })
      : null;

    if (!membership) {
      await wrapThreadPost(thread, interactionId);
      await thread.post(
        "I couldn't verify your account in this Hyperlocalise workspace. Please make sure your Slack email matches your Hyperlocalise account email.",
      );
      return;
    }

    const tools = buildTools({
      conversationId: interactionId,
      organizationId,
      membershipRole: membership.role,
      projectId,
      db,
    });

    const result = await generateText({
      model: getChatModel(),
      system: buildSlackSystemPrompt(projectId),
      messages: chatMessages,
      tools,
      stopWhen: stepCountIs(5),
    });

    await wrapThreadPost(thread, interactionId);
    if (result.text.trim()) {
      await thread.post(result.text);
    }
  } catch {
    await wrapThreadPost(thread, interactionId);
    await thread.post(
      "I'm having trouble processing that right now. I can help with translation jobs, project questions, glossary lookups, and job status checks. How can I assist you?",
    );
  }
}

export async function handleNewConversation(thread: Thread<SlackBotState>, message: Message) {
  if (message.author.isBot) {
    return;
  }

  const teamId = extractTeamId(message);
  if (!teamId) {
    return;
  }

  const connector = await findSlackConnector(teamId);
  if (!connector) {
    return;
  }

  const { interaction, isNew } = await getOrCreateInteraction(
    connector.organizationId,
    thread.id,
    message.text.slice(0, 100) || "Slack conversation",
  );

  const slackUser = await thread.adapter.getUser(message.author.userId);

  await addInteractionMessage({
    interactionId: interaction.id,
    senderType: "user",
    text: message.text,
    senderEmail: slackUser?.email,
  });

  if (isNew) {
    await wrapThreadPost(thread, interaction.id);
    await thread.subscribe();
  }

  await processSlackMessage(
    thread,
    message,
    interaction.id,
    connector.organizationId,
    interaction.projectId,
  );
}

export async function handleSubscribedMessage(thread: Thread<SlackBotState>, message: Message) {
  if (message.author.isBot) {
    return;
  }

  const teamId = extractTeamId(message);
  if (!teamId) {
    return;
  }

  const connector = await findSlackConnector(teamId);
  if (!connector) {
    return;
  }

  const { interaction } = await getOrCreateInteraction(
    connector.organizationId,
    thread.id,
    message.text.slice(0, 100) || "Slack conversation",
  );

  const slackUser = await thread.adapter.getUser(message.author.userId);

  await addInteractionMessage({
    interactionId: interaction.id,
    senderType: "user",
    text: message.text,
    senderEmail: slackUser?.email,
  });

  await processSlackMessage(
    thread,
    message,
    interaction.id,
    connector.organizationId,
    interaction.projectId,
  );
}

export async function getSlackBot() {
  if (botInstance) {
    return botInstance;
  }

  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_SIGNING_SECRET) {
    throw new Error("missing Slack bot configuration");
  }

  botInstance = new Chat({
    adapters: {
      slack: createSlackAdapter({
        clientId: env.SLACK_CLIENT_ID,
        clientSecret: env.SLACK_CLIENT_SECRET,
        signingSecret: env.SLACK_SIGNING_SECRET,
        userName: "hyperlocalise",
        logger: createChatLogger("slack"),
      }),
    },
    logger: createChatLogger("chat"),
    state: createChatStateAdapter(),
    userName: "hyperlocalise",
  });

  botInstance.onNewMention(handleNewConversation);
  botInstance.onDirectMessage(handleNewConversation);
  botInstance.onSubscribedMessage(handleSubscribedMessage);

  return botInstance;
}
