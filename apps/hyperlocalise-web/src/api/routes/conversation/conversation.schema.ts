import { z } from "zod";

import { optionalProjectIdSchema } from "@/lib/projects/identity/project-id";

export const conversationIdParamsSchema = z.object({
  conversationId: z.uuid(),
});

export const createConversationRequestSchema = z.object({
  text: z.string().trim().max(10000).default(""),
  projectId: optionalProjectIdSchema,
});

export const listConversationsQuerySchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
