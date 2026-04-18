import { Hono } from "hono";

import type { GitHubReviewQueue, TranslationJobQueue } from "@/lib/workflow";
import { authRoutes } from "./routes/auth";
import { githubWebhookRoutes } from "./routes/github-webhook";
import { healthRoutes } from "./routes/health";
import { createGlossaryRoutes } from "./routes/glossary/glossary.route";
import { createProjectRoutes } from "./routes/project/project.route";
import { workosWebhookRoutes } from "./routes/workos-webhook";

type CreateAppOptions = {
  githubReviewQueue?: GitHubReviewQueue;
  translationJobQueue?: TranslationJobQueue;
};

export function createApp(options: CreateAppOptions = {}) {
  return new Hono()
    .basePath("/api")
    .route("/health", healthRoutes)
    .route("/auth", authRoutes)
    .route("/webhooks/github", githubWebhookRoutes)
    .route("/glossary", createGlossaryRoutes())
    .route("/webhooks/workos", workosWebhookRoutes)
    .route("/project", createProjectRoutes(options));
}

export const app = createApp();

export type AppType = typeof app;
