import { z } from "zod";

export const workosWebhookEventSchema = z.object({
  event: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

export type WorkosWebhookEvent = z.infer<typeof workosWebhookEventSchema>;
