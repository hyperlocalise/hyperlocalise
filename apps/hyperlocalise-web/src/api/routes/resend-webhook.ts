import { Hono } from "hono";
import { after } from "next/server";

import { getEmailBot } from "@/lib/agents/email/bot";
import { createLogger } from "@/lib/log";
import type { EmailAgentTaskQueue } from "@/lib/workflow/types";
import { createEmailAgentTaskQueue } from "@/workflows/adapters";

const logger = createLogger("resend-webhook");

type CreateResendWebhookRoutesOptions = {
  emailAgentTaskQueue?: EmailAgentTaskQueue;
};

export function createResendWebhookRoutes(options: CreateResendWebhookRoutesOptions = {}) {
  return new Hono().post("/", async (c) => {
    logger.info({ method: c.req.method, path: c.req.path }, "webhook received");

    try {
      const bot = await getEmailBot({
        emailAgentTaskQueue: options.emailAgentTaskQueue ?? createEmailAgentTaskQueue(),
      });

      const response = await bot.webhooks.resend(c.req.raw, {
        waitUntil: (task) => {
          after(() => task);
        },
      });
      logger.info({ status: response.status }, "webhook processed");
      return response;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "webhook processing failed",
      );
      throw error;
    }
  });
}
