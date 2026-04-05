import { Hono } from "hono";

import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { projectRoutes } from "./routes/project/project.route";

export const app = new Hono()
  .basePath("/api")
  .route("/health", healthRoutes)
  .route("/auth", authRoutes)
  .route("/project", projectRoutes);

export type AppType = typeof app;
