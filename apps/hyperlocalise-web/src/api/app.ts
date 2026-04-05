import { Hono } from "hono";

import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { projectRoutes } from "./routes/project/project.route";
import { translationJobRoutes } from "./routes/translation-job/translation-job.route";

export const app = new Hono()
  .basePath("/api")
  .route("/health", healthRoutes)
  .route("/auth", authRoutes)
  .route("/project", projectRoutes)
  .route("/translation", translationJobRoutes);

export type AppType = typeof app;
