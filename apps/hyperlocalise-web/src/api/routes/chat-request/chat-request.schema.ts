import { z } from "zod";

export const chatRequestBodySchema = z.object({
  text: z.string().trim().min(1).max(10000),
  projectId: z.string().optional(),
});

export const multipartChatRequestSchema = z.object({
  text: z.string().trim().max(10000).default(""),
  projectId: z.string().trim().min(1).optional(),
});
