import { Hono } from "hono";
import { serve } from "inngest/hono";

import { inngest } from "@/lib/inngest";
import type { TranslationJobQueue } from "@/lib/inngest";
import { translationJobQueuedFunction } from "@/lib/translation/translation-job-queued-function";
import { authRoutes } from "./routes/auth";
import { githubWebhookRoutes } from "./routes/github-webhook";
import { healthRoutes } from "./routes/health";
import { createGlossaryRoutes } from "./routes/glossary/glossary.route";
import { createProjectRoutes } from "./routes/project/project.route";
import { workosWebhookRoutes } from "./routes/workos-webhook";

type CreateAppOptions = {
  translationJobQueue?: TranslationJobQueue;
};

export function createApp(options: CreateAppOptions = {}) {
  const functions = [translationJobQueuedFunction];

  return new Hono()
    .basePath("/api")
    .on(
      ["GET", "PUT", "POST"],
      "/inngest",
      serve({
        client: inngest,
        functions,
      }),
    )
    .route("/health", healthRoutes)
    .route("/auth", authRoutes)
    .route("/webhooks/github", githubWebhookRoutes)
    .route("/glossary", createGlossaryRoutes())
    .route("/webhooks/workos", workosWebhookRoutes)
    .route("/project", createProjectRoutes(options));
}

export const app = createApp();

export type AppType = typeof app;
