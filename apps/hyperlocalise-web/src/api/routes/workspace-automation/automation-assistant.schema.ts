/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { UIMessage } from "ai";
import { z } from "zod";

/** Longest message a person may send the assistant, the same as a chat message. */
export const AUTOMATION_ASSISTANT_TEXT_MAX_CHARS = 10_000;

export const automationAssistantSessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

export const automationAssistantSessionQuerySchema = z.object({
  automationId: z.string().uuid(),
});

export const createAutomationAssistantSessionBodySchema = z.object({
  automationId: z.string().uuid().nullish(),
});

export const bindAutomationAssistantSessionBodySchema = z.object({
  automationId: z.string().uuid(),
});

/**
 * What the chat transport posts: the message being sent, in the UI message shape, and the page.
 * Only the text parts of the last user message are read.
 */
export const automationAssistantTurnBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.string(),
        parts: z.array(z.object({ type: z.string(), text: z.string().optional() })),
      }),
    )
    .min(1),
  /** Checked against the editor context schema by the route; an unparseable one is refused. */
  pageContext: z.unknown(),
});

/** The text of the message being sent, or null when the transport sent none. */
export function automationAssistantTurnText(
  body: z.infer<typeof automationAssistantTurnBodySchema>,
): string | null {
  const last = body.messages.findLast((message) => message.role === "user");
  const text = (last?.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  return text.length > 0 && text.length <= AUTOMATION_ASSISTANT_TEXT_MAX_CHARS ? text : null;
}

/** A session as the page reads it. */
export type AutomationAssistantSessionResponse = {
  id: string;
  automationId: string | null;
  title: string;
  turnInProgress: boolean;
  createdAt: string;
  lastMessageAt: string;
};

/** A message as the page reads it, in the shape the inbox's message list renders. */
export type AutomationAssistantMessageResponse = {
  id: string;
  conversationId: string;
  senderType: "user" | "agent";
  senderEmail: string | null;
  text: string;
  parts: UIMessage["parts"] | null;
  attachments: null;
  createdAt: string;
};
