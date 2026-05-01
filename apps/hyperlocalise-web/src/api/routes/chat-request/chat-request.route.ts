import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";

import type { AuthVariables } from "@/api/auth/workos";
import { workosAuthMiddleware } from "@/api/auth/workos";
import { addConversationMessage, createConversation } from "@/lib/conversations";

const chatRequestBodySchema = z.object({
  text: z.string().trim().min(1).max(10000),
  projectId: z.string().optional(),
});

const validateChatRequestBody = validator("json", (value, c) => {
  const parsed = chatRequestBodySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_chat_request" }, 400);
  }
  return parsed.data;
});

export function createChatRequestRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .post("/", validateChatRequestBody, async (c) => {
      const body = c.req.valid("json");
      const orgId = c.var.auth.activeOrganization.localOrganizationId;

      const title = body.text.slice(0, 120);
      const conversation = await createConversation({
        organizationId: orgId,
        source: "chat_ui",
        title,
        projectId: body.projectId,
      });

      await addConversationMessage({
        conversationId: conversation.id,
        senderType: "user",
        text: body.text,
      });

      // TODO: trigger agent processing here

      return c.json({ conversation }, 201);
    });
}
