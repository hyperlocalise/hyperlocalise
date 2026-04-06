import { Hono } from "hono";
import { serve } from "inngest/hono";

import { inngest } from "@/lib/inngest";
import type { TranslationJobQueue } from "@/lib/inngest";
import { translationJobQueuedFunction } from "@/lib/translation/translation-job-queued-function";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { createProjectRoutes } from "./routes/project/project.route";

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
    .route("/project", createProjectRoutes(options));
}

export const app = createApp();

export type AppType = typeof app;
