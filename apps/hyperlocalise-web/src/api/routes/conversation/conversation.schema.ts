import { z } from "zod";

export const conversationIdParamsSchema = z.object({
  conversationId: z.uuid(),
});

export const listConversationsQuerySchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
