import { z } from "zod";

import { optionalProjectIdSchema } from "@/lib/projects/project-id";

export const chatRequestBodySchema = z.object({
  text: z.string().trim().min(1).max(10000),
  projectId: optionalProjectIdSchema,
});

export const multipartChatRequestSchema = z.object({
  text: z.string().trim().max(10000).default(""),
  projectId: optionalProjectIdSchema,
});
