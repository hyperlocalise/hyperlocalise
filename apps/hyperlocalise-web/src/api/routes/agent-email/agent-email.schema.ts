import { z } from "zod";

export const updateEmailAgentBodySchema = z.object({
  enabled: z.boolean(),
});
