import { Hono } from "hono";

import { getEmailBot } from "@/lib/agents/email/bot";
import type { EmailTranslationQueue } from "@/lib/workflow/types";
import { createEmailTranslationQueue } from "@/workflows/adapters";

type CreateResendWebhookRoutesOptions = {
  emailTranslationQueue?: EmailTranslationQueue;
};

export function createResendWebhookRoutes(options: CreateResendWebhookRoutesOptions = {}) {
  return new Hono().post("/", async (c) => {
    const bot = await getEmailBot({
      emailTranslationQueue: options.emailTranslationQueue ?? createEmailTranslationQueue(),
    });

    const response = await bot.webhooks.resend(c.req.raw);
    return response;
  });
}
