import { z } from "zod";

export const updateSlackAgentBodySchema = z.object({
  enabled: z.boolean(),
});
