import { openai } from "@ai-sdk/openai";
import { eq, and } from "drizzle-orm";
import { Hono } from "hono";
import { streamText } from "ai";
import { z } from "zod";

import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { addInteractionMessage } from "@/lib/interactions";

import { buildTools } from "./tools/registry";

const conversationIdParamsSchema = z.object({
  conversationId: z.uuid(),
});

function getChatModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return openai("gpt-5.4-mini");
}

function buildSystemPrompt(projectId: string | null) {
  const lines = [
    "You are Hyperlocalise, an expert localization and translation assistant.",
    "You help teams translate content, manage glossaries, review translations, and organize localization projects.",
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
    "- Be concise but thorough in your responses",
    "- When suggesting translations, consider context, tone, and target audience",
    "- If you need more information to provide a good answer, ask clarifying questions",
    "- You can help create translation jobs, suggest glossary terms, or review existing translations",
    "- Always maintain a professional, helpful tone",
  );

  return lines.join("\n");
}

export function createChatStreamRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .post("/", async (c) => {
      const paramResult = conversationIdParamsSchema.safeParse(c.req.param());
      if (!paramResult.success) {
        return c.json({ error: "not_found" }, 404);
      }

      const { conversationId } = paramResult.data;
      const orgId = c.var.auth.activeOrganization.localOrganizationId;

      // Verify conversation exists and belongs to the org
      const [conversation] = await db
        .select({
          id: schema.interactions.id,
          source: schema.interactions.source,
          projectId: schema.interactions.projectId,
        })
        .from(schema.interactions)
        .where(
          and(
            eq(schema.interactions.id, conversationId),
            eq(schema.interactions.organizationId, orgId),
          ),
        )
        .limit(1);

      if (!conversation) {
        return c.json({ error: "not_found" }, 404);
      }

      if (conversation.source !== "chat_ui") {
        return c.json({ error: "conversation_not_replyable" }, 400);
      }

      // Load conversation history for context
      const messages = await db
        .select({
          senderType: schema.interactionMessages.senderType,
          text: schema.interactionMessages.text,
        })
        .from(schema.interactionMessages)
        .where(eq(schema.interactionMessages.interactionId, conversationId))
        .orderBy(schema.interactionMessages.createdAt)
        .limit(50);

      // Convert to AI SDK message format
      const chatMessages = messages.map((msg) => ({
        role: msg.senderType === "user" ? ("user" as const) : ("assistant" as const),
        content: msg.text,
      }));

      const tools = buildTools({
        conversationId,
        organizationId: orgId,
        projectId: conversation.projectId ?? null,
        db,
      });

      const result = streamText({
        model: getChatModel(),
        system: buildSystemPrompt(conversation.projectId),
        messages: chatMessages,
        tools,
        onFinish: async ({ text }) => {
          // Persist the AI response to the database
          try {
            await addInteractionMessage({
              interactionId: conversationId,
              senderType: "agent",
              text,
            });
          } catch (error) {
            // Log but don't fail the stream if persistence fails
            console.error("Failed to persist agent message:", error);
          }
        },
      });

      return result.toUIMessageStreamResponse({ sendReasoning: true, sendSources: true });
    });
}
